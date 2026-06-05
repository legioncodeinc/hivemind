/**
 * Meta-skill — the optimizer's cross-run memory (the paper's meta-skill). Records
 * every edit proposed for a skill so later runs (a) don't re-propose an edit that
 * was already tried, and (b) feed "what's been tried" to the proposer. When the A/B
 * gate lands, the recorded `status` (proposed → applied/reverted) closes the loop so
 * the optimizer learns which kinds of edits actually help a given skill.
 *
 * Append-only JSONL at <stateDir>/skillopt/meta.jsonl. Pure helpers + injected path,
 * so it's unit-tested with a tmp file.
 */
import fs from "node:fs";
import path from "node:path";
import type { Edit } from "./skill-edits.js";

export type MetaStatus = "proposed" | "applied" | "reverted";

export interface MetaEntry {
  skill: string;       // "<name>--<author>"
  ops: string[];       // short per-edit summaries (op + anchor/preview)
  fingerprint: string; // stable hash of the edits, for dedup
  proposedAt: string;
  status: MetaStatus;
}

export const skillRef = (name: string, author: string) => `${name}--${author}`;

/** Short human summary of one edit. */
function summarizeEdit(e: Edit): string {
  const anchor = e.target ? ` @"${e.target.slice(0, 40)}"` : "";
  const preview = e.content ? `: ${e.content.slice(0, 60).replace(/\s+/g, " ")}` : "";
  return `${e.op}${anchor}${preview}`;
}

/** Order-independent fingerprint of an edit set (so the same edits dedup). */
export function fingerprintEdits(edits: Edit[]): string {
  return edits
    .map((e) => `${e.op}|${e.target ?? ""}|${e.content ?? ""}`)
    .sort()
    .join("\n");
}

export function loadMeta(file: string): MetaEntry[] {
  let raw: string;
  try { raw = fs.readFileSync(file, "utf8"); } catch { return []; }
  const out: MetaEntry[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t) as MetaEntry;
      if (e && typeof e.skill === "string" && typeof e.fingerprint === "string") out.push(e);
    } catch { /* skip malformed line */ }
  }
  return out;
}

export function appendMeta(file: string, entry: MetaEntry): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(entry) + "\n");
}

/** Has this exact edit set already been proposed for this skill? (avoid churn) */
export function alreadyProposed(meta: MetaEntry[], name: string, author: string, edits: Edit[]): boolean {
  const ref = skillRef(name, author);
  const fp = fingerprintEdits(edits);
  return meta.some((m) => m.skill === ref && m.fingerprint === fp);
}

/** Summaries of edits previously tried for this skill — context for the proposer. */
export function priorEditSummaries(meta: MetaEntry[], name: string, author: string): string[] {
  const ref = skillRef(name, author);
  return meta.filter((m) => m.skill === ref).flatMap((m) => m.ops);
}

/** Build a meta entry for a freshly-proposed edit set. */
export function metaEntryFor(name: string, author: string, edits: Edit[], now: string): MetaEntry {
  return {
    skill: skillRef(name, author),
    ops: edits.map(summarizeEdit),
    fingerprint: fingerprintEdits(edits),
    proposedAt: now,
    status: "proposed",
  };
}
