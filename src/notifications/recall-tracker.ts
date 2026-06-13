/**
 * Recall-event tracker.
 *
 * Records one event per memory recall (a grep/search against the
 * `~/.deeplake/memory/` virtual filesystem that returned content) to
 * `~/.deeplake/recall-events.jsonl`. The Cursor pre-tool-use hook calls
 * `recordRecall` at the exact moment it serves recalled bytes to the agent,
 * which is the only place the byte count is known.
 *
 * Why a dedicated store (not usage-stats.jsonl): usage-stats.jsonl is a
 * one-record-per-session stream written at SessionEnd by the Claude Code
 * transcript parser. Cursor never populates it (different transcript shape),
 * which is why the dashboard's memory-search and tokens-saved KPIs read 0.
 * recall-events.jsonl is append-per-recall and read directly by the Cursor
 * extension dashboard.
 *
 * Every operation is fail-soft: recall tracking must never break the hook
 * that delivers memory to the agent.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface RecallEvent {
  /** ISO timestamp of the recall. */
  ts: string;
  /** Session / conversation id, when the hook can supply one. */
  sessionId: string;
  /** Byte length of the content served back to the agent. */
  bytes: number;
  /** Repo project name (basename of cwd), when known. */
  project: string | null;
}

export function recallEventsPath(): string {
  return join(homedir(), ".deeplake", "recall-events.jsonl");
}

/** Append a single recall event. Never throws. No-op for empty results. */
export function recordRecall(ev: { sessionId?: string; bytes: number; project?: string | null }): void {
  try {
    if (!Number.isFinite(ev.bytes) || ev.bytes <= 0) return;
    const record: RecallEvent = {
      ts: new Date().toISOString(),
      sessionId: ev.sessionId && ev.sessionId.length > 0 ? ev.sessionId : "unknown",
      bytes: Math.round(ev.bytes),
      project: ev.project ?? null,
    };
    const path = recallEventsPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(record) + "\n", "utf-8");
  } catch {
    /* fail-soft: recall tracking must never break the recall hook */
  }
}
