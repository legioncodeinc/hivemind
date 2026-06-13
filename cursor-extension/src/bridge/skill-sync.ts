import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import * as vscode from "vscode";
import type { SkillSyncResult, SkillSyncState } from "../types/health";

interface PulledEntry {
  dirName: string;
  install: "global" | "project";
  installRoot: string;
  symlinks: string[];
}

interface PulledManifest {
  version: number;
  entries: PulledEntry[];
}

function canonicalSkillsRoot(): string {
  return join(homedir(), ".claude", "skills");
}

function skillifyStateDir(): string {
  const override = process.env.HIVEMIND_STATE_DIR?.trim();
  return override && override.length > 0 ? override : join(homedir(), ".deeplake", "state", "skillify");
}

function manifestPath(): string {
  return join(skillifyStateDir(), "pulled.json");
}

function cursorInstalled(home: string = homedir()): boolean {
  return existsSync(join(home, ".cursor"));
}

export function detectCursorSkillsRoots(projectRoot?: string, home: string = homedir()): string[] {
  if (!cursorInstalled(home)) return [];
  const roots = [join(home, ".cursor", "skills-cursor")];
  if (projectRoot) roots.push(join(projectRoot, ".cursor", "skills"));
  return roots;
}

function fanOutSymlinks(canonicalDir: string, dirName: string, agentRoots: string[]): string[] {
  const out: string[] = [];
  for (const root of agentRoots) {
    const link = join(root, dirName);
    let existing;
    try {
      existing = lstatSync(link);
    } catch {
      existing = null;
    }
    if (existing) {
      if (!existing.isSymbolicLink()) continue;
      let current: string | null;
      try {
        current = readlinkSync(link);
      } catch {
        current = null;
      }
      if (current === canonicalDir) {
        out.push(link);
        continue;
      }
      try {
        unlinkSync(link);
      } catch {
        continue;
      }
    }
    try {
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(canonicalDir, link, "dir");
      out.push(link);
    } catch {
      /* best-effort */
    }
  }
  return out;
}

function listCanonicalSkillDirs(skillsRoot: string): string[] {
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot).filter((name) => {
    if (!name.includes("--")) return false;
    try {
      return lstatSync(join(skillsRoot, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

function loadManifest(): PulledManifest {
  const path = manifestPath();
  if (!existsSync(path)) return { version: 1, entries: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as PulledManifest;
    if (!Array.isArray(parsed.entries)) return { version: 1, entries: [] };
    return parsed;
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeManifest(manifest: PulledManifest): void {
  const path = manifestPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2));
  try {
    unlinkSync(path);
  } catch {
    /* may not exist */
  }
  try {
    renameSync(tmp, path);
  } catch {
    writeFileSync(path, JSON.stringify(manifest, null, 2));
  }
}

function mergeSymlinks(entry: PulledEntry, fresh: string[]): void {
  const merged = [...new Set([...entry.symlinks, ...fresh])].sort();
  const prior = [...entry.symlinks].sort();
  if (merged.length === prior.length && merged.every((v, i) => v === prior[i])) return;
  const manifest = loadManifest();
  const idx = manifest.entries.findIndex(
    (e) => e.dirName === entry.dirName && e.installRoot === entry.installRoot,
  );
  if (idx >= 0) manifest.entries[idx] = { ...entry, symlinks: merged };
  try {
    writeManifest(manifest);
  } catch {
    /* best-effort */
  }
}

/** Sync canonical pulled skills into Cursor global and project skill directories. */
export function syncSkillsToCursor(projectRoot?: string): SkillSyncState {
  const skillsRoot = canonicalSkillsRoot();
  const roots = detectCursorSkillsRoots(projectRoot);
  const results: SkillSyncResult[] = [];
  const dirs = listCanonicalSkillDirs(skillsRoot);

  if (roots.length === 0) {
    return {
      lastSyncAt: new Date().toISOString(),
      results: dirs.map((dirName) => ({
        skillName: dirName,
        status: "skipped",
        reason: "Cursor not detected or no Cursor skill roots",
      })),
      syncedCount: 0,
      skippedCount: dirs.length,
      erroredCount: 0,
    };
  }

  let synced = 0;
  let skipped = 0;
  let errored = 0;

  for (const dirName of dirs) {
    const canonicalDir = join(skillsRoot, dirName);
    const links = fanOutSymlinks(canonicalDir, dirName, roots);
    if (links.length === 0) {
      errored++;
      results.push({
        skillName: dirName,
        status: "errored",
        reason: "Could not create Cursor symlinks (conflict or permission)",
      });
      continue;
    }
    if (links.length < roots.length) {
      skipped++;
      results.push({
        skillName: dirName,
        status: "skipped",
        path: links[0],
        reason: `Synced to ${links.length}/${roots.length} Cursor roots`,
      });
    } else {
      synced++;
      results.push({
        skillName: dirName,
        status: "synced",
        path: links.join(", "),
      });
    }
  }

  return {
    lastSyncAt: new Date().toISOString(),
    results,
    syncedCount: synced,
    skippedCount: skipped,
    erroredCount: errored,
  };
}

/** Backfill Cursor symlinks for skills already recorded in the pull manifest. */
export function backfillCursorLinks(projectRoot?: string): number {
  const manifest = loadManifest();
  const cursorRoots = detectCursorSkillsRoots(projectRoot);
  if (cursorRoots.length === 0) return 0;

  let updated = 0;
  for (const entry of manifest.entries) {
    const canonical = join(entry.installRoot, entry.dirName);
    if (!existsSync(canonical)) continue;
    const roots =
      entry.install === "project" && projectRoot
        ? cursorRoots.filter((p) => p.startsWith(projectRoot))
        : cursorRoots.filter((p) => p.includes("skills-cursor"));
    const fresh = fanOutSymlinks(canonical, entry.dirName, roots);
    if (fresh.length === 0) continue;
    mergeSymlinks(entry, fresh);
    updated++;
  }
  return updated;
}

/** List local skill directory names available for promotion UI. */
export function listLocalSkillsForPromoter(): Array<{ dirName: string; scope: "global" | "project"; path: string }> {
  const out: Array<{ dirName: string; scope: "global" | "project"; path: string }> = [];
  const globalRoot = canonicalSkillsRoot();
  for (const dirName of listCanonicalSkillDirs(globalRoot)) {
    out.push({ dirName, scope: "global", path: join(globalRoot, dirName) });
  }
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspace) {
    const projectRoot = join(workspace, ".claude", "skills");
    for (const dirName of listCanonicalSkillDirs(projectRoot)) {
      out.push({ dirName, scope: "project", path: join(projectRoot, dirName) });
    }
  }
  return out;
}

export function skillDirLabel(dirName: string): string {
  const idx = dirName.lastIndexOf("--");
  if (idx <= 0) return dirName;
  return `${dirName.slice(0, idx)} (${dirName.slice(idx + 2)})`;
}

export function basenameSkill(dirName: string): string {
  return basename(dirName);
}
