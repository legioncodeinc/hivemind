/**
 * Read side of skill attribution. The foundation's skills-active.ts WRITES a
 * `skills_active` row per session (which org skills were active + an A/B bucket);
 * this module READS those rows + the captured transcript rows and turns them into
 * the inputs the deficiency detector needs:
 *
 *   - per-session attribution (which skills were active, the bucket),
 *   - treatment/control cohorts for a given skill,
 *   - raw-session reconstruction for the outcome scorer.
 *
 * Scope discipline (see design notes): we only ever touch sessions that have a
 * skills_active row — never the whole table — so the detector scores a small,
 * relevant cohort, not every session.
 *
 * Every query goes through an injected `QueryFn` (DeeplakeApi.query bound), so the
 * cohort + reconstruction logic is unit-testable with zero live Deeplake.
 */
import type { ActiveSkill } from "./skills-active.js";
import { sqlStr } from "../utils/sql.js";

export type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

export interface SessionAttribution {
  sessionId: string;
  skills: ActiveSkill[];
  bucket: number;
  ts: string; // last_update_date of the skills_active row
}

/** Stable identity for an org skill (matches the `<name>--<author>` dir convention). */
export function skillKey(name: string, author: string): string {
  return `${name}--${author}`;
}

interface ParsedMsg {
  type?: string;
  content?: unknown;
  session_id?: unknown;
  skills?: unknown;
  ab_bucket?: unknown;
}

/** Deeplake may hand `message` back as a JSON string or an already-parsed object. */
function parseMessage(m: unknown): ParsedMsg | null {
  if (m == null) return null;
  if (typeof m === "string") {
    try { return JSON.parse(m) as ParsedMsg; } catch { return null; }
  }
  if (typeof m === "object") return m as ParsedMsg;
  return null;
}

function asActiveSkills(v: unknown): ActiveSkill[] {
  if (!Array.isArray(v)) return [];
  const out: ActiveSkill[] = [];
  for (const s of v) {
    if (s && typeof s === "object"
      && typeof (s as ActiveSkill).name === "string"
      && typeof (s as ActiveSkill).author === "string") {
      const sk = s as ActiveSkill;
      out.push({ name: sk.name, author: sk.author, version: typeof sk.version === "number" ? sk.version : 1 });
    }
  }
  return out;
}

/**
 * Every session that has a skills_active attribution row, newest first.
 * `sinceIso` bounds the lookback window; `limit` caps the rows pulled.
 * The `description = 'skills_active'` column filter is the index — it's the value
 * skills-active.ts writes into the row's `description`, so this never scans
 * transcript rows.
 */
export async function listSkillSessions(
  query: QueryFn,
  sessionsTable: string,
  opts: { sinceIso?: string; limit?: number } = {},
): Promise<SessionAttribution[]> {
  const where = ["description = 'skills_active'"];
  if (opts.sinceIso) where.push(`last_update_date >= '${sqlStr(opts.sinceIso)}'`);
  const limit = opts.limit && opts.limit > 0 ? ` LIMIT ${Math.floor(opts.limit)}` : "";
  const rows = await query(
    `SELECT message, last_update_date FROM "${sessionsTable}" WHERE ${where.join(" AND ")} ORDER BY last_update_date DESC${limit}`,
  );
  const out: SessionAttribution[] = [];
  const seen = new Set<string>(); // a session can have >1 skills_active row (one per start); keep the newest
  for (const r of rows) {
    const m = parseMessage(r.message);
    if (!m || m.type !== "skills_active" || typeof m.session_id !== "string") continue;
    if (seen.has(m.session_id)) continue;
    seen.add(m.session_id);
    out.push({
      sessionId: m.session_id,
      skills: asActiveSkills(m.skills),
      bucket: typeof m.ab_bucket === "number" ? m.ab_bucket : 0,
      ts: typeof r.last_update_date === "string" ? r.last_update_date : "",
    });
  }
  return out;
}

/**
 * Partition sessions into treatment (the skill was active) vs control (it wasn't).
 * NOTE: this is OBSERVATIONAL (the foundation records availability, it does not yet
 * randomize withholding), so control is not a clean counterfactual — the detector
 * treats treatment's ABSOLUTE outcome as the primary signal and uses control only
 * as weak context until a real withholding arm lands.
 */
export function cohortsForSkill(
  sessions: SessionAttribution[],
  name: string,
  author: string,
): { treatment: SessionAttribution[]; control: SessionAttribution[] } {
  const key = skillKey(name, author);
  const treatment: SessionAttribution[] = [];
  const control: SessionAttribution[] = [];
  for (const s of sessions) {
    const has = s.skills.some((sk) => skillKey(sk.name, sk.author) === key);
    (has ? treatment : control).push(s);
  }
  return { treatment, control };
}

/**
 * Reconstruct a session's transcript (USER/ASSISTANT turns, tool noise dropped)
 * from its captured rows, oldest-first. Long transcripts are head+tail elided to
 * `maxChars` so a giant session can't blow the judge's context.
 */
export async function reconstructSession(
  query: QueryFn,
  sessionsTable: string,
  sessionId: string,
  maxChars = 14_000,
): Promise<string> {
  const sid = sqlStr(sessionId);
  const rows = await query(
    `SELECT message FROM "${sessionsTable}" WHERE path LIKE '/sessions/%${sid}%' ORDER BY creation_date ASC`,
  );
  const parts: string[] = [];
  for (const r of rows) {
    const j = parseMessage(r.message);
    if (!j) continue;
    const text = typeof j.content === "string" ? j.content.trim() : "";
    if (!text) continue;
    if (j.type === "user_message") parts.push(`USER: ${text}`);
    else if (j.type === "assistant_message") parts.push(`ASSISTANT: ${text}`);
  }
  const joined = parts.join("\n\n");
  if (joined.length <= maxChars) return joined;
  const head = joined.slice(0, Math.floor(maxChars * 0.55));
  const tail = joined.slice(joined.length - Math.floor(maxChars * 0.45));
  return `${head}\n\n…[${joined.length - maxChars} chars elided]…\n\n${tail}`;
}
