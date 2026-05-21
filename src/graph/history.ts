/**
 * Snapshot history log (Phase 1.5).
 *
 * Append-only JSONL at:
 *   ~/.hivemind/graphs/<repo-key>/history.jsonl
 *
 * One line per successful snapshot write. Cheap to scan, easy to diff,
 * trivially exportable. Each entry captures enough to identify and locate
 * the snapshot without re-reading it from disk:
 *
 *   { ts, commit_sha, snapshot_sha256, node_count, edge_count, trigger }
 *
 * Append semantics: a single `appendFileSync` of one ≤PIPE_BUF-byte line.
 * On POSIX, a single write(2) of ≤PIPE_BUF bytes (4096) is atomic across
 * processes — no interleaving even under concurrent writers. Our lines
 * stay well under that limit (≤300 bytes typical), so we don't need an
 * external lock library for Phase 1.5.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { GraphSnapshot } from "./types.js";

export type SnapshotTrigger = "manual" | "stop-hook" | "post-commit" | "unknown";

export interface HistoryEntry {
  /** ISO 8601 UTC. */
  ts: string;
  /** Git HEAD at build time. null when not in a git context. */
  commit_sha: string | null;
  /** Content fingerprint of the snapshot (matches the filename when commit_sha is set). */
  snapshot_sha256: string;
  /** Convenience: same as snapshot.nodes.length. */
  node_count: number;
  /** Convenience: same as snapshot.links.length. */
  edge_count: number;
  /** What fired the build. Defaults to "unknown" — callers should set this when they know. */
  trigger: SnapshotTrigger;
}

export function historyPath(baseDir: string): string {
  return join(baseDir, "history.jsonl");
}

/**
 * Append one entry to history.jsonl. Atomic for single ≤PIPE_BUF writes.
 * Errors are swallowed (best-effort): a history write failing must not
 * roll back the snapshot write.
 */
export function appendHistoryEntry(baseDir: string, entry: HistoryEntry): void {
  const path = historyPath(baseDir);
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + "\n");
  } catch {
    // best-effort
  }
}

/**
 * Build a HistoryEntry from a snapshot + trigger. Pure: no I/O.
 */
export function entryFromSnapshot(
  snapshot: GraphSnapshot,
  snapshot_sha256: string,
  trigger: SnapshotTrigger,
): HistoryEntry {
  return {
    ts: snapshot.observation.ts,
    commit_sha: snapshot.graph.commit_sha,
    snapshot_sha256,
    node_count: snapshot.nodes.length,
    edge_count: snapshot.links.length,
    trigger,
  };
}

/**
 * Read the last `n` entries (newest last), parsed and validated. Missing or
 * malformed lines are silently skipped — a corrupt history must not stop
 * the user from reading the rest.
 */
export function readHistoryTail(baseDir: string, n: number): HistoryEntry[] {
  const path = historyPath(baseDir);
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter((l) => l.length > 0);
  const tail = lines.slice(Math.max(0, lines.length - n));
  const entries: HistoryEntry[] = [];
  for (const line of tail) {
    const parsed = parseLine(line);
    if (parsed !== null) entries.push(parsed);
  }
  return entries;
}

/** Returns the total line count without loading the whole tail. */
export function countHistoryEntries(baseDir: string): number {
  const path = historyPath(baseDir);
  if (!existsSync(path)) return 0;
  try {
    const raw = readFileSync(path, "utf8");
    return raw.split("\n").filter((l) => l.length > 0).length;
  } catch {
    return 0;
  }
}

function parseLine(line: string): HistoryEntry | null {
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (obj === null || typeof obj !== "object") return null;
  const o = obj as Partial<HistoryEntry>;
  if (typeof o.ts !== "string") return null;
  if (o.commit_sha !== null && typeof o.commit_sha !== "string") return null;
  if (typeof o.snapshot_sha256 !== "string") return null;
  if (typeof o.node_count !== "number") return null;
  if (typeof o.edge_count !== "number") return null;
  if (typeof o.trigger !== "string") return null;
  // Trigger is a union; accept any string for forward-compat (a new trigger
  // value should not invalidate the entry). UI may surface unknown values.
  return {
    ts: o.ts,
    commit_sha: o.commit_sha,
    snapshot_sha256: o.snapshot_sha256,
    node_count: o.node_count,
    edge_count: o.edge_count,
    trigger: o.trigger as SnapshotTrigger,
  };
}
