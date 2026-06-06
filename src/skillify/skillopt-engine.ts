/**
 * The SkillOpt cycle, wired end to end and fully injectable:
 *
 *   detect deficient skills  →  ≥N fire gate  →  for each: read the current body
 *   from the org skills table, propose a bounded edit, and publish the result
 *   DIRECTLY as the skill's next version (no approval gate).
 *
 * Append-only publish: the improved body lands as version+1 in the Deeplake
 * skills table, so every teammate re-pulls it; the original author/name are kept
 * and the loop is recorded as a contributor (see skill-org-publish). Everything
 * is injected (query, judge/proposer models, the skill reader, the publisher), so
 * this orchestration is unit-tested with no Deeplake / LLM / fs.
 */
import fs from "node:fs";
import path from "node:path";
import { detectDeficientSkills, type DetectorConfig } from "./deficiency-detector.js";
import { proposeSkillEdit, type ProposeConfig } from "./skill-proposer.js";
import { splitFrontmatter } from "./skill-publisher.js";
import type { QueryFn } from "./skill-invocations.js";
import type { CurrentSkillRow } from "./skill-org-publish.js";
import type { Edit } from "./skill-edits.js";
import type { PulledManifest } from "./manifest.js";

export interface ProposalRecord {
  name: string;
  author: string;
  baseVersion: number;   // org-table version this proposal derives from; publish lands as baseVersion+1
  invocations: number;
  confirmedFailures: number;
  failureRate: number;
  examples: string[];
  edits: Edit[];
  report: string[];
  candidateBody: string;
  createdAt: string;
}

export interface CycleDeps {
  query: QueryFn;
  sessionsTable: string;
  readSkill: (name: string, author: string) => Promise<CurrentSkillRow | null>; // full current row from the org skills table; null when the skill isn't there
  publish: (current: CurrentSkillRow, rec: ProposalRecord) => void | Promise<void>; // land the edit as version+1, reusing the SAME row (no re-read → no read-after-write disagreement)
  detector?: DetectorConfig;
  proposer?: ProposeConfig;
  fireThreshold?: number; // deficient-skill count to fire (default 5)
  maxProposals?: number;  // cap edits proposed per cycle (default 10)
  now: string;            // ISO timestamp (injected — Date is awkward in workers)
  meta?: {                // optimizer cross-run memory (skillopt-meta); optional
    prior: (name: string, author: string) => string[];
    has: (name: string, author: string, edits: Edit[]) => boolean;
    record: (name: string, author: string, edits: Edit[]) => void;
  };
}

export interface CycleResult {
  deficientCount: number;
  fired: boolean;
  proposals: Array<{ name: string; author: string; changed: boolean; failureRate: number }>;
}

export async function runSkillOptCycle(deps: CycleDeps): Promise<CycleResult> {
  const fireThreshold = deps.fireThreshold ?? 5;
  const { skills, deficientCount } = await detectDeficientSkills(deps.query, deps.sessionsTable, deps.detector);

  // The ≥N gate: only act on a real PATTERN of deficiency, not one or two noisy skills.
  if (deficientCount < fireThreshold) {
    return { deficientCount, fired: false, proposals: [] };
  }

  const targets = skills.filter((s) => s.deficient).slice(0, deps.maxProposals ?? 10);
  const proposals: CycleResult["proposals"] = [];
  for (const s of targets) {
    const current = await deps.readSkill(s.name, s.author);
    if (!current) continue; // not in the org skills table → nothing to edit
    const body = current.body;
    const priorEdits = deps.meta?.prior(s.name, s.author) ?? [];
    const p = await proposeSkillEdit(body, s.examples, { ...deps.proposer, priorEdits });
    // dedup against the meta memory — don't re-write an edit already tried for this skill.
    const isDup = p.changed && (deps.meta?.has(s.name, s.author, p.edits) ?? false);
    if (p.changed && !isDup) {
      await deps.publish(current, {
        name: s.name, author: s.author, baseVersion: current.version,
        invocations: s.invocations, confirmedFailures: s.confirmedFailures, failureRate: s.failureRate,
        examples: s.examples, edits: p.edits, report: p.report,
        candidateBody: p.editedBody, createdAt: deps.now,
      });
      deps.meta?.record(s.name, s.author, p.edits);
    }
    proposals.push({ name: s.name, author: s.author, changed: p.changed && !isDup, failureRate: s.failureRate });
  }
  return { deficientCount, fired: true, proposals };
}

/** Read a skill's SKILL.md body (frontmatter stripped) from a skills root; null if absent. */
export function readSkillBodyFromDisk(skillsRoot: string, name: string, author: string): string | null {
  try {
    const md = fs.readFileSync(path.join(skillsRoot, `${name}--${author}`, "SKILL.md"), "utf8");
    return splitFrontmatter(md).body.trim();
  } catch {
    return null;
  }
}

/**
 * Resolve a skill's body from its ACTUAL install location via the pull manifest,
 * trying every recorded installRoot, then a fallback root. Authoritative — handles
 * skills pulled with `--to project` into any cwd (invocations come from all
 * projects, so the worker can't assume its own cwd), and avoids editing a
 * same-named skill that happens to sit in the current cwd.
 */
export function readSkillBodyViaManifest(
  name: string,
  author: string,
  manifest: PulledManifest,
  fallbackRoot?: string,
): string | null {
  const dirName = `${name}--${author}`;
  const roots = manifest.entries.filter((e) => e.dirName === dirName).map((e) => e.installRoot);
  if (fallbackRoot) roots.push(fallbackRoot);
  for (const root of roots) {
    const body = readSkillBodyFromDisk(root, name, author);
    if (body) return body;
  }
  return null;
}
