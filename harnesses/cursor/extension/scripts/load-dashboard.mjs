/**
 * Build the dashboard data envelope (KPIs + codebase graph snapshot).
 *
 * Self-contained: resolves the per-repo graph key the same way the core CLI
 * does (see lib/deeplake.mjs deriveProjectKey) so it finds the snapshot the
 * `hivemind graph build` command actually wrote under
 * ~/.hivemind/graphs/<key>/snapshots. KPIs come from the org-stats cache the
 * CLI maintains, falling back to local usage records, then to an empty state.
 * Prints a DashboardDataEnvelope JSON to stdout.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { loadCreds, deriveProjectKey, graphsHome } from "./lib/deeplake.mjs";

const cwd = process.argv[2] || process.cwd();

const BYTES_PER_TOKEN = 4;
const SAVINGS_MULTIPLIER = 1.7;

function bytesToSavedTokens(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return (SAVINGS_MULTIPLIER - 1) * (bytes / BYTES_PER_TOKEN);
}

function countUserGeneratedSkills(userName) {
  if (!userName) return 0;
  const dir = join(homedir(), ".claude", "skills");
  if (!existsSync(dir)) return 0;
  const suffix = `--${userName}`;
  try {
    let count = 0;
    for (const name of readdirSync(dir)) {
      const idx = name.lastIndexOf(suffix);
      if (idx > 0 && idx + suffix.length === name.length) count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

function readUsageRecords() {
  const path = join(homedir(), ".deeplake", "usage-stats.jsonl");
  if (!existsSync(path)) return [];
  const out = [];
  try {
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed);
        if (typeof rec.endedAt === "string" && typeof rec.sessionId === "string") {
          out.push({
            memorySearchBytes: typeof rec.memorySearchBytes === "number" ? rec.memorySearchBytes : 0,
            memorySearchCount: typeof rec.memorySearchCount === "number" ? rec.memorySearchCount : 0,
          });
        }
      } catch {
        /* skip bad line */
      }
    }
  } catch {
    return [];
  }
  return out;
}

function readOrgStatsCache(creds) {
  if (!creds) return null;
  const path = join(homedir(), ".deeplake", "hivemind-stats-cache.json");
  if (!existsSync(path)) return null;
  try {
    const cache = JSON.parse(readFileSync(path, "utf-8"));
    const data = cache?.data;
    if (!data?.org) return null;
    const fetchedAt = typeof cache.fetchedAt === "number" ? new Date(cache.fetchedAt).toISOString() : null;
    const stale = typeof cache.fetchedAt === "number" ? Date.now() - cache.fetchedAt > 3600_000 : false;
    return { org: data.org, user: data.user ?? data.org, fetchedAt, stale };
  } catch {
    return null;
  }
}

function resolveSnapshot(repoDir) {
  const snapshotsDir = join(repoDir, "snapshots");
  if (!existsSync(snapshotsDir)) return null;
  let snapshotPath = null;
  const pointer = join(repoDir, "latest-commit.txt");
  if (existsSync(pointer)) {
    try {
      const sha = readFileSync(pointer, "utf-8").trim();
      const candidate = join(snapshotsDir, `${sha}.json`);
      if (sha && existsSync(candidate)) snapshotPath = candidate;
    } catch {
      /* fall through to newest-file scan */
    }
  }
  if (!snapshotPath) {
    try {
      const candidates = readdirSync(snapshotsDir)
        .filter((n) => n.endsWith(".json"))
        .map((n) => ({ full: join(snapshotsDir, n), mtime: statSync(join(snapshotsDir, n)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (candidates[0]) snapshotPath = candidates[0].full;
    } catch {
      return null;
    }
  }
  if (!snapshotPath) return null;
  try {
    const parsed = JSON.parse(readFileSync(snapshotPath, "utf-8"));
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

const creds = loadCreds();
const repoKey = deriveProjectKey(cwd);
const repoProject = basename(cwd);
const graph = resolveSnapshot(join(graphsHome(), repoKey));
const skillsCreated = countUserGeneratedSkills(creds?.userName);

const cache = readOrgStatsCache(creds);
let kpis;
if (cache) {
  kpis = {
    tokensSaved: bytesToSavedTokens(cache.org.memorySearchBytes ?? 0),
    tokensSource: "org",
    skillsCreated,
    memorySearches: cache.org.memoryRecallCount ?? 0,
    sessionsCount: cache.org.sessionsCount ?? null,
    userTokensSaved: bytesToSavedTokens((cache.user ?? cache.org).memorySearchBytes ?? 0),
    orgStatsFetchedAt: cache.fetchedAt,
    orgStatsStale: cache.stale,
    orgStatsOffline: false,
  };
} else {
  const records = readUsageRecords();
  const localBytes = records.reduce((s, r) => s + r.memorySearchBytes, 0);
  const localCount = records.reduce((s, r) => s + r.memorySearchCount, 0);
  const has = records.length > 0;
  kpis = {
    tokensSaved: has ? bytesToSavedTokens(localBytes) : null,
    tokensSource: has ? "local" : "none",
    skillsCreated,
    memorySearches: localCount,
    sessionsCount: has ? records.length : null,
    userTokensSaved: has ? bytesToSavedTokens(localBytes) : null,
    orgStatsFetchedAt: null,
    orgStatsStale: false,
    orgStatsOffline: false,
  };
}

process.stdout.write(
  JSON.stringify({
    repoKey,
    repoProject,
    generatedAt: new Date().toISOString(),
    kpis,
    graph,
  }),
);
