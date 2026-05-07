import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordPull, loadManifest } from "../../src/skilify/manifest.js";
import { runUnpull } from "../../src/skilify/unpull.js";

let projectRoot: string;
let projectSkillsRoot: string;
let fakeHome: string;
let originalHome: string | undefined;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "skilify-unpull-proj-"));
  projectSkillsRoot = join(projectRoot, ".claude", "skills");
  mkdirSync(projectSkillsRoot, { recursive: true });
  fakeHome = mkdtempSync(join(tmpdir(), "skilify-unpull-home-"));
  originalHome = process.env.HOME;
  process.env.HOME = fakeHome;
});

afterEach(() => {
  try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* nothing */ }
  try { rmSync(fakeHome, { recursive: true, force: true }); } catch { /* nothing */ }
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
});

/** Create a fake skill directory + record it in the manifest. */
function plantPulledSkill(dirName: string, author: string, name: string): void {
  const dir = join(projectSkillsRoot, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\nversion: 1\n---\nbody`);
  recordPull({
    dirName, name, author,
    projectKey: "abcd1234abcd1234",
    remoteVersion: 1,
    install: "project",
    installRoot: projectSkillsRoot,
    pulledAt: "2026-05-07T00:00:00Z",
  });
}

/** Create a flat-layout dir on disk WITHOUT a manifest entry. */
function plantManualSkill(dirName: string): void {
  const dir = join(projectSkillsRoot, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${dirName}\nversion: 1\n---\nbody`);
}

// ── manifest-driven removal ────────────────────────────────────────────────

describe("runUnpull (manifest-driven)", () => {
  it("removes a manifest-tracked skill and prunes the entry", () => {
    plantPulledSkill("deploy--alice", "alice", "deploy");
    const r = runUnpull({ install: "project", cwd: projectRoot, users: [] });
    expect(r.removed).toBe(1);
    expect(r.kept).toBe(0);
    expect(existsSync(join(projectSkillsRoot, "deploy--alice"))).toBe(false);
    expect(loadManifest().entries).toHaveLength(0);
  });

  it("dry-run reports would-remove without touching disk or manifest", () => {
    plantPulledSkill("deploy--alice", "alice", "deploy");
    const r = runUnpull({ install: "project", cwd: projectRoot, users: [], dryRun: true });
    expect(r.removed).toBe(0);
    expect(r.wouldRemove).toBe(1);
    expect(existsSync(join(projectSkillsRoot, "deploy--alice"))).toBe(true);
    expect(loadManifest().entries).toHaveLength(1);
  });

  it("filters by --user, leaving non-matching authors alone", () => {
    plantPulledSkill("deploy--alice", "alice", "deploy");
    plantPulledSkill("query--bob", "bob", "query");
    const r = runUnpull({ install: "project", cwd: projectRoot, users: ["alice"] });
    expect(r.removed).toBe(1);
    expect(r.kept).toBe(1);
    expect(existsSync(join(projectSkillsRoot, "deploy--alice"))).toBe(false);
    expect(existsSync(join(projectSkillsRoot, "query--bob"))).toBe(true);
    expect(loadManifest().entries.map(e => e.dirName)).toEqual(["query--bob"]);
  });

  it("--not-mine excludes the caller's own pulls", () => {
    plantPulledSkill("deploy--alice", "alice", "deploy");
    plantPulledSkill("query--bob",   "bob",   "query");
    const r = runUnpull({
      install: "project", cwd: projectRoot, users: [],
      myUsername: "alice", notMine: true,
    });
    expect(r.removed).toBe(1);
    expect(r.kept).toBe(1);
    expect(existsSync(join(projectSkillsRoot, "deploy--alice"))).toBe(true);
    expect(existsSync(join(projectSkillsRoot, "query--bob"))).toBe(false);
  });

  it("never touches a manual `<name>--<author>/` directory not in the manifest", () => {
    plantPulledSkill("deploy--alice", "alice", "deploy");
    // User-authored variant skill — looks like the pull naming, but NOT
    // recorded in the manifest. Must survive every default unpull mode.
    plantManualSkill("deploy--blue-green");

    runUnpull({ install: "project", cwd: projectRoot, users: [] });
    expect(existsSync(join(projectSkillsRoot, "deploy--blue-green"))).toBe(true);

    runUnpull({ install: "project", cwd: projectRoot, users: ["alice"] });
    expect(existsSync(join(projectSkillsRoot, "deploy--blue-green"))).toBe(true);

    runUnpull({
      install: "project", cwd: projectRoot, users: [],
      myUsername: "carol", notMine: true,
    });
    expect(existsSync(join(projectSkillsRoot, "deploy--blue-green"))).toBe(true);
  });

  it("re-running unpull is idempotent (manifest empty, scanned 0)", () => {
    plantPulledSkill("deploy--alice", "alice", "deploy");
    runUnpull({ install: "project", cwd: projectRoot, users: [] });
    const second = runUnpull({ install: "project", cwd: projectRoot, users: [] });
    expect(second.scanned).toBe(0);
    expect(second.removed).toBe(0);
    expect(second.entries).toEqual([]);
  });
});

// ── orphan handling ────────────────────────────────────────────────────────

describe("runUnpull orphan detection", () => {
  it("prunes a manifest entry whose directory was deleted out-of-band", () => {
    plantPulledSkill("deploy--alice", "alice", "deploy");
    rmSync(join(projectSkillsRoot, "deploy--alice"), { recursive: true });
    expect(loadManifest().entries).toHaveLength(1);
    const r = runUnpull({ install: "project", cwd: projectRoot, users: [] });
    expect(r.manifestPruned).toBe(1);
    expect(r.removed).toBe(0);
    expect(loadManifest().entries).toHaveLength(0);
  });

  it("dry-run does not prune the manifest entry", () => {
    plantPulledSkill("deploy--alice", "alice", "deploy");
    rmSync(join(projectSkillsRoot, "deploy--alice"), { recursive: true });
    runUnpull({ install: "project", cwd: projectRoot, users: [], dryRun: true });
    expect(loadManifest().entries).toHaveLength(1);
  });
});

// ── opt-in disk walk for --all and --legacy-cleanup ────────────────────────

describe("runUnpull --all and --legacy-cleanup", () => {
  it("--all also removes flat locally-mined skills (still ignores `--<author>` not in manifest)", () => {
    plantManualSkill("graphify");
    plantManualSkill("deploy--blue-green"); // manual variant — `--` in name, no manifest
    const r = runUnpull({ install: "project", cwd: projectRoot, users: [], all: true });
    // graphify removed (locally-mined, single segment)
    expect(existsSync(join(projectSkillsRoot, "graphify"))).toBe(false);
    // deploy--blue-green NOT removed even with --all because it's neither
    // manifest-tracked nor a single-segment dir nor a legacy hex key.
    expect(existsSync(join(projectSkillsRoot, "deploy--blue-green"))).toBe(true);
    expect(r.removed).toBe(1);
  });

  it("--legacy-cleanup removes 16-hex-char project_key dirs from older skilify versions", () => {
    const legacy = join(projectSkillsRoot, "abcd1234abcd1234");
    mkdirSync(join(legacy, "old-skill"), { recursive: true });
    writeFileSync(join(legacy, "old-skill", "SKILL.md"), "---\nname: old-skill\n---");
    const r = runUnpull({ install: "project", cwd: projectRoot, users: [], legacyCleanup: true });
    expect(existsSync(legacy)).toBe(false);
    expect(r.removed).toBe(1);
  });

  it("default run leaves locally-mined and legacy dirs alone", () => {
    plantManualSkill("graphify");
    const legacy = join(projectSkillsRoot, "abcd1234abcd1234");
    mkdirSync(legacy, { recursive: true });
    const r = runUnpull({ install: "project", cwd: projectRoot, users: [] });
    expect(r.scanned).toBe(0); // no manifest entries, no opt-in disk walk
    expect(existsSync(join(projectSkillsRoot, "graphify"))).toBe(true);
    expect(existsSync(legacy)).toBe(true);
  });
});
