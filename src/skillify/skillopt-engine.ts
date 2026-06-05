/**
 * The weekly SkillOpt cycle, wired end to end and fully injectable:
 *
 *   detect deficient skills  →  ≥5 fire gate  →  for each: read body, propose a
 *   bounded edit, write a REVIEW PROPOSAL (not a live publish).
 *
 * Why proposals, not auto-publish: the offline gate isn't trustworthy (spike
 * finding), so we never auto-overwrite a live skill. The engine surfaces concrete,
 * evidence-backed edit proposals; turning one live is gated on the real-usage A/B
 * (deferred) or a human. Everything is injected (query, judge/proposer models, the
 * skill reader, the proposal writer), so this orchestration is unit-tested with no
 * Deeplake / LLM / fs.
 */
import fs from "node:fs";
import path from "node:path";
import { detectDeficientSkills, type DetectorConfig } from "./deficiency-detector.js";
import { proposeSkillEdit, type ProposeConfig } from "./skill-proposer.js";
import { splitFrontmatter } from "./skill-publisher.js";
import type { QueryFn } from "./skill-invocations.js";
import type { Edit } from "./skill-edits.js";

export interface ProposalRecord {
  name: string;
  author: string;
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
  readSkillBody: (name: string, author: string) => string | null; // null when not installed locally
  writeProposal: (rec: ProposalRecord) => void;
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
    const body = deps.readSkillBody(s.name, s.author);
    if (!body) continue; // not installed locally → nothing to edit
    const priorEdits = deps.meta?.prior(s.name, s.author) ?? [];
    const p = await proposeSkillEdit(body, s.examples, { ...deps.proposer, priorEdits });
    // dedup against the meta memory — don't re-write an edit already tried for this skill.
    const isDup = p.changed && (deps.meta?.has(s.name, s.author, p.edits) ?? false);
    if (p.changed && !isDup) {
      deps.writeProposal({
        name: s.name, author: s.author,
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

/** Default proposal writer: <proposalsRoot>/<name>--<author>/{proposal.json,candidate.md}. */
export function writeProposalToDisk(proposalsRoot: string, rec: ProposalRecord): string {
  const dir = path.join(proposalsRoot, `${rec.name}--${rec.author}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "candidate.md"), rec.candidateBody.trimEnd() + "\n");
  fs.writeFileSync(path.join(dir, "proposal.json"), JSON.stringify(rec, null, 2) + "\n");
  return dir;
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
