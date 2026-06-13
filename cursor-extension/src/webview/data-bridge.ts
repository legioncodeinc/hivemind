import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { credentialsPath } from "../utils/paths";
import { readJson } from "../utils/fs-json";

const BYTES_PER_TOKEN = 4;
const SAVINGS_MULTIPLIER = 1.7;

export interface DashboardKpis {
  tokensSaved: number | null;
  tokensSource: "org" | "local" | "none";
  skillsCreated: number;
  memorySearches: number;
  sessionsCount: number | null;
  userTokensSaved: number | null;
  fetchedAt?: string;
}

export interface DashboardGraphSummary {
  commitSha: string | null;
  snapshotPath: string;
  nodeCount: number;
  edgeCount: number;
  snapshot: unknown;
}

export interface DashboardDataEnvelope {
  repoKey: string;
  repoProject: string;
  generatedAt: string;
  kpis: DashboardKpis;
  graph: DashboardGraphSummary | null;
}

export interface RecentSession {
  sessionId: string;
  endedAt: string;
  memorySearchCount: number;
}

function statsFilePath(): string {
  return join(homedir(), ".deeplake", "usage-stats.jsonl");
}

function readUsageRecords(): Array<{ endedAt: string; sessionId: string; memorySearchBytes: number; memorySearchCount: number }> {
  try {
    if (!existsSync(statsFilePath())) return [];
    const out: Array<{ endedAt: string; sessionId: string; memorySearchBytes: number; memorySearchCount: number }> = [];
    for (const line of readFileSync(statsFilePath(), "utf-8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as Partial<{ endedAt: string; sessionId: string; memorySearchBytes: number; memorySearchCount: number }>;
        if (rec.endedAt && rec.sessionId) {
          out.push({
            endedAt: rec.endedAt,
            sessionId: rec.sessionId,
            memorySearchBytes: rec.memorySearchBytes ?? 0,
            memorySearchCount: rec.memorySearchCount ?? 0,
          });
        }
      } catch {
        /* skip bad line */
      }
    }
    return out;
  } catch {
    return [];
  }
}

function countSkills(userName?: string): number {
  const skillsRoot = join(homedir(), ".claude", "skills");
  if (!existsSync(skillsRoot)) return 0;
  let count = 0;
  for (const name of readdirSync(skillsRoot)) {
    if (!name.includes("--")) continue;
    if (userName && !name.endsWith(`--${userName}`)) continue;
    count++;
  }
  return count;
}

function bytesToSavedTokens(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return (SAVINGS_MULTIPLIER - 1) * (bytes / BYTES_PER_TOKEN);
}

function deriveProjectKey(cwd: string): { key: string; project: string } {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf-8" }).trim();
    const key = Buffer.from(out).toString("hex").slice(0, 16);
    return { key, project: basename(out) };
  } catch {
    const key = Buffer.from(cwd).toString("hex").slice(0, 16);
    return { key, project: basename(cwd) };
  }
}

function graphsRoot(): string {
  return process.env.HIVEMIND_GRAPHS_HOME ?? join(homedir(), ".hivemind", "graphs");
}

function resolveSnapshot(repoDir: string): DashboardGraphSummary | null {
  const snapshotsDir = join(repoDir, "snapshots");
  if (!existsSync(snapshotsDir)) return null;
  let snapshotPath: string | null = null;
  const pointer = join(repoDir, "latest-commit.txt");
  if (existsSync(pointer)) {
    const sha = readFileSync(pointer, "utf-8").trim();
    const candidate = join(snapshotsDir, `${sha}.json`);
    if (sha && existsSync(candidate)) snapshotPath = candidate;
  }
  if (!snapshotPath) {
    const candidates = readdirSync(snapshotsDir)
      .filter((n) => n.endsWith(".json"))
      .map((n) => ({ full: join(snapshotsDir, n), mtime: statSync(join(snapshotsDir, n)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (candidates[0]) snapshotPath = candidates[0].full;
  }
  if (!snapshotPath) return null;
  try {
    const parsed = JSON.parse(readFileSync(snapshotPath, "utf-8")) as {
      nodes?: unknown[];
      links?: unknown[];
      graph?: { commit_sha?: string | null };
    };
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) return null;
    return {
      commitSha: parsed.graph?.commit_sha ?? null,
      snapshotPath,
      nodeCount: parsed.nodes.length,
      edgeCount: parsed.links.length,
      snapshot: parsed,
    };
  } catch {
    return null;
  }
}

export async function loadDashboardData(cwd: string): Promise<DashboardDataEnvelope> {
  const { key: repoKey, project: repoProject } = deriveProjectKey(cwd);
  const creds = readJson<{ userName?: string }>(credentialsPath());
  const records = readUsageRecords();
  const localBytes = records.reduce((s, r) => s + r.memorySearchBytes, 0);
  const localCount = records.reduce((s, r) => s + r.memorySearchCount, 0);
  const skillsCreated = countSkills(creds?.userName);

  let kpis: DashboardKpis;
  if (records.length === 0 && !creds) {
    kpis = {
      tokensSaved: null,
      tokensSource: "none",
      skillsCreated,
      memorySearches: 0,
      sessionsCount: null,
      userTokensSaved: null,
      fetchedAt: new Date().toISOString(),
    };
  } else {
    const saved = bytesToSavedTokens(localBytes);
    kpis = {
      tokensSaved: saved,
      tokensSource: "local",
      skillsCreated,
      memorySearches: localCount,
      sessionsCount: records.length,
      userTokensSaved: saved,
      fetchedAt: new Date().toISOString(),
    };
  }

  const graph = resolveSnapshot(join(graphsRoot(), repoKey));
  return {
    repoKey,
    repoProject,
    generatedAt: new Date().toISOString(),
    kpis,
    graph,
  };
}

export async function loadRecentSessions(_cwd: string): Promise<RecentSession[]> {
  return readUsageRecords()
    .slice(-20)
    .reverse()
    .map((r) => ({
      sessionId: r.sessionId,
      endedAt: r.endedAt,
      memorySearchCount: r.memorySearchCount,
    }));
}

export async function runHivemindCli(args: string[], cwd: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const stdout = execFileSync("hivemind", args, {
      encoding: "utf-8",
      cwd,
      timeout: 300_000,
      env: { ...process.env },
    });
    return { ok: true, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? "Command failed",
    };
  }
}
