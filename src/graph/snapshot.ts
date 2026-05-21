/**
 * Snapshot construction + persistence for Phase 1 of the codebase-graph feature.
 *
 * Responsibilities:
 *   - Aggregate per-file FileExtractions into one GraphSnapshot
 *   - Apply deterministic ordering (sort nodes by id, edges by source/target/relation/ord)
 *   - Canonical JSON serialization (sorted object keys, compact whitespace)
 *   - SHA-256 content hash over the STABLE fields only (excludes observation),
 *     so identical code on different worktrees/branches/timestamps dedups
 *   - Atomic write to disk (temp + rename in same directory)
 *
 * Out of scope for Phase 1 (deferred):
 *   - Hard-link dedup across snapshots (Phase 1.5: snapshots/by-content/<sha>.json)
 *   - history.jsonl append (Phase 2)
 *   - Cloud push (Phase 3)
 */

import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { appendHistoryEntry, entryFromSnapshot, type SnapshotTrigger } from "./history.js";
import { writeLastBuild } from "./last-build.js";
import type {
  FileExtraction,
  GraphEdge,
  GraphMetadata,
  GraphNode,
  GraphObservation,
  GraphSnapshot,
} from "./types.js";

/**
 * Root for hivemind graph state on disk. Honors HIVEMIND_GRAPHS_HOME so
 * tests can point at a tmp dir without touching the real ~/.hivemind/.
 */
export function graphsRoot(): string {
  return process.env.HIVEMIND_GRAPHS_HOME ?? join(homedir(), ".hivemind", "graphs");
}

/** Per-repo storage directory: graphsRoot() / <repo-key>. */
export function repoDir(repoKey: string): string {
  return join(graphsRoot(), repoKey);
}

/**
 * Aggregate per-file extractions into a single GraphSnapshot with deterministic
 * ordering. The returned object is ready to canonicalize/hash/write.
 */
export function buildSnapshot(
  extractions: readonly FileExtraction[],
  metadata: GraphMetadata,
  observation: GraphObservation,
): GraphSnapshot {
  const nodes: GraphNode[] = [];
  const links: GraphEdge[] = [];
  for (const ex of extractions) {
    for (const n of ex.nodes) nodes.push(n);
    for (const e of ex.edges) links.push(e);
  }

  nodes.sort(compareNodes);
  links.sort(compareEdges);

  return {
    directed: true,
    multigraph: true,
    graph: metadata,
    observation,
    nodes,
    links,
  };
}

function compareNodes(a: GraphNode, b: GraphNode): number {
  return cmp(a.id, b.id);
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  let c = cmp(a.source, b.source);
  if (c !== 0) return c;
  c = cmp(a.target, b.target);
  if (c !== 0) return c;
  c = cmp(a.relation, b.relation);
  if (c !== 0) return c;
  return (a.ord ?? 0) - (b.ord ?? 0);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Canonical JSON for a snapshot. Compact (no inserted whitespace), object keys
 * sorted alphabetically at every nesting level, array element order preserved
 * (which means the caller is responsible for sorting nodes/links — buildSnapshot
 * does this).
 *
 * The bytes produced here are what gets written to disk AND what gets hashed
 * (except the hash covers a subset — see computeSnapshotSha256).
 */
export function canonicalSnapshot(snapshot: GraphSnapshot): string {
  return canonicalJSON(snapshot);
}

/**
 * SHA-256 (hex) over the canonical JSON of the snapshot's STABLE fields:
 *   { directed, multigraph, graph, nodes, links }
 *
 * Excludes `observation` deliberately — two builds of identical code on
 * different worktrees / branches / timestamps must produce the same hash.
 * Bug-by-construction guard: if a new field appears that's volatile, it
 * MUST go into `observation`, not `graph`, or this hash silently divergence-breaks.
 */
export function computeSnapshotSha256(snapshot: GraphSnapshot): string {
  const stable = {
    directed: snapshot.directed,
    multigraph: snapshot.multigraph,
    graph: snapshot.graph,
    nodes: snapshot.nodes,
    links: snapshot.links,
  };
  return createHash("sha256").update(canonicalJSON(stable)).digest("hex");
}

/**
 * JSON.stringify with object-key sorting at every level. Arrays are NOT
 * reordered (caller controls element order — for snapshots, buildSnapshot
 * sorted nodes/links already).
 */
function canonicalJSON(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}

export interface WriteSnapshotResult {
  /** Full path to the written snapshot file. */
  snapshotPath: string;
  /** Full path to latest-commit.txt (updated when snapshot has a commit_sha). */
  latestCommitPath: string | null;
  /** Content hash of the snapshot (over the stable fields only). */
  snapshotSha256: string;
}

/**
 * Persist a snapshot to disk under `baseDir`.
 *
 * Files written:
 *   - <baseDir>/snapshots/<commit-sha>.json   (or <snapshot-sha256>.json if no commit context)
 *   - <baseDir>/latest-commit.txt             (only when commit_sha is present)
 *
 * Atomicity: each file is written to a sibling `.tmp.<pid>.<ts>` first, then
 * `renameSync` swaps it into place. POSIX rename within the same directory is
 * atomic, so a crash mid-write leaves either the old file or the new — never
 * a partial write. The cross-file consistency (snapshot + latest-commit.txt)
 * is sequential best-effort: a crash between the two leaves the snapshot
 * present but latest-commit.txt pointing at the previous commit. The next
 * successful build heals it.
 *
 * Idempotency: re-running on the same commit overwrites the snapshot file
 * with bit-identical bytes (canonical serialization). No-op for the reader.
 *
 * Throws when `baseDir` cannot be created.
 */
export function writeSnapshot(
  snapshot: GraphSnapshot,
  baseDir: string,
  trigger: SnapshotTrigger = "unknown",
): WriteSnapshotResult {
  const sha256 = computeSnapshotSha256(snapshot);
  const commitSha = snapshot.graph.commit_sha;

  // Use commit_sha when available (canonical name); fall back to snapshot_sha256
  // for non-git scenarios (e.g., loose source directories). The fallback is
  // not addressable via `latest-commit.txt` because there's no commit to point at.
  const fileBase = commitSha ?? sha256;
  const snapshotsDir = join(baseDir, "snapshots");
  const snapshotPath = join(snapshotsDir, `${fileBase}.json`);

  const canonical = canonicalSnapshot(snapshot);
  writeFileAtomic(snapshotPath, canonical);

  let latestCommitPath: string | null = null;
  if (commitSha !== null) {
    latestCommitPath = join(baseDir, "latest-commit.txt");
    writeFileAtomic(latestCommitPath, `${commitSha}\n`);
  }

  // .last-build.json — read by the Stop hook to gate auto-rebuilds.
  // Best-effort: a write failure here doesn't roll back the snapshot.
  writeLastBuild(baseDir, {
    ts: Date.now(),
    commit_sha: commitSha,
    snapshot_sha256: sha256,
  });

  // history.jsonl — append a one-line audit record. Best-effort; failure
  // doesn't roll back the snapshot. Trigger comes from the caller — if
  // they don't pass one, we record "unknown" rather than guess.
  appendHistoryEntry(baseDir, entryFromSnapshot(snapshot, sha256, trigger));

  return { snapshotPath, latestCommitPath, snapshotSha256: sha256 };
}

/**
 * Write `contents` to `filePath` atomically. Creates parent dirs as needed.
 * Tmp file lives in the SAME directory as the final to guarantee they share
 * a filesystem (rename across mount points is not atomic).
 */
function writeFileAtomic(filePath: string, contents: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, contents);
  renameSync(tmp, filePath);
}
