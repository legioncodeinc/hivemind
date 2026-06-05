/**
 * Structured, bounded edits over a markdown SKILL.md — the paper's edit operations
 * (append / insert_after / replace / delete) and "textual learning rate" (edit
 * budget). Port of SkillOpt's skillopt/optimizer/skill.py.
 *
 * A protected region — between <!-- SLOW_UPDATE_START --> and <!-- SLOW_UPDATE_END -->
 * — holds longitudinal guidance that fast per-edit changes must NOT touch (the
 * paper's slow-update). Edits targeting it are skipped, and `append` lands above it.
 *
 * Pure + deterministic — no I/O, fully unit-testable.
 */
export type EditOp = "append" | "insert_after" | "replace" | "delete";
export interface Edit {
  op: EditOp;
  target?: string;  // anchor text for insert_after / replace / delete
  content?: string; // new text for append / insert_after / replace
}

export const SU_START = "<!-- SLOW_UPDATE_START -->";
export const SU_END = "<!-- SLOW_UPDATE_END -->";

function protectedRange(skill: string): [number, number] | null {
  const a = skill.indexOf(SU_START);
  const b = skill.indexOf(SU_END);
  if (a === -1 || b === -1 || b < a) return null;
  return [a, b + SU_END.length];
}

function targetsProtected(skill: string, target: string): boolean {
  const r = protectedRange(skill);
  if (!r || !target) return false;
  const idx = skill.indexOf(target);
  if (idx === -1) return false;
  // Reject if the target RANGE [idx, idx+len) overlaps the protected range at all —
  // not just if it starts inside it (a target that begins just before SLOW_UPDATE_START
  // and spans into the block must not be allowed to delete protected guidance).
  return idx < r[1] && idx + target.length > r[0];
}

/** Enforce the edit budget ("textual learning rate"): keep at most `budget` edits. */
export function selectEdits(edits: Edit[], budget: number): Edit[] {
  return edits.slice(0, Math.max(0, budget));
}

export interface ApplyResult {
  skill: string;
  report: string[];
  applied: number; // how many edits actually changed the doc
}

/** Apply bounded structured edits; protected-region targets are skipped. */
export function applyEdits(skill: string, edits: Edit[]): ApplyResult {
  let s = skill;
  const report: string[] = [];
  let applied = 0;
  const ok = (msg: string) => { applied++; report.push(`OK ${msg}`); };

  for (const e of edits) {
    if (e.target && targetsProtected(s, e.target)) {
      report.push(`SKIP ${e.op}: targets protected slow-update region`);
      continue;
    }
    switch (e.op) {
      case "append": {
        const content = (e.content ?? "").trim();
        if (!content) { report.push("SKIP append: empty content"); break; }
        const r = protectedRange(s);
        if (r) s = s.slice(0, r[0]) + content + "\n\n" + s.slice(r[0]);
        else s = s.replace(/\s*$/, "") + "\n\n" + content + "\n";
        ok(`append (+${content.length} chars)`);
        break;
      }
      case "insert_after": {
        const target = e.target ?? "";
        const content = (e.content ?? "").trim();
        if (!target || !content) { report.push("SKIP insert_after: missing target/content"); break; }
        const idx = s.indexOf(target);
        if (idx === -1) { report.push("SKIP insert_after: target not found"); break; }
        const lineEnd = s.indexOf("\n", idx + target.length);
        const at = lineEnd === -1 ? s.length : lineEnd;
        s = s.slice(0, at) + "\n" + content + s.slice(at);
        ok("insert_after");
        break;
      }
      case "replace": {
        const target = e.target ?? "";
        const content = e.content ?? "";
        if (!target) { report.push("SKIP replace: missing target"); break; }
        const idx = s.indexOf(target);
        if (idx === -1) { report.push("SKIP replace: target not found"); break; }
        s = s.slice(0, idx) + content + s.slice(idx + target.length);
        ok("replace");
        break;
      }
      case "delete": {
        const target = e.target ?? "";
        if (!target) { report.push("SKIP delete: missing target"); break; }
        const idx = s.indexOf(target);
        if (idx === -1) { report.push("SKIP delete: target not found"); break; }
        s = s.slice(0, idx) + s.slice(idx + target.length);
        ok("delete");
        break;
      }
      default:
        report.push(`SKIP unknown op: ${(e as Edit).op}`);
    }
  }
  return { skill: s, report, applied };
}
