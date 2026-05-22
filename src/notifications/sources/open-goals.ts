/**
 * Open-goals SessionStart summary.
 *
 * Reads the user's open goals from the dedicated hivemind_goals
 * table (owner + status filter on indexed columns, no LIKE scan)
 * and produces a short one-line summary the primary banner appends
 * to its body.
 *
 * Returns null when:
 *   - creds are missing
 *   - the goals table is unreachable (network / auth / missing)
 *   - no open goals match
 *
 * Hard timeout: caller's responsibility — `pickPrimaryBanner` already
 * runs under the SessionStart hook's overall budget. Goal content
 * lives in markdown, so the first line of the body is the
 * human-readable label for the banner.
 */

import type { Credentials } from "../../commands/auth-creds.js";
import { DeeplakeApi } from "../../deeplake-api.js";
import { sqlIdent, sqlStr } from "../../utils/sql.js";
import { log as _log } from "../../utils/debug.js";

const log = (msg: string) => _log("notifications-open-goals", msg);

export interface OpenGoalsSummary {
  /** Total count of open goals owned by current_user. */
  count: number;
  /** Up to 3 short labels in newest-first order — used for the body line. */
  sample: string[];
}

/**
 * Fetch and summarize the current user's open goals. "Open" =
 * status IN ('opened', 'in_progress'). Resolves to `null` on any
 * error or when there is nothing to show.
 */
export async function fetchOpenGoals(
  creds: Credentials,
  goalsTableName: string,
): Promise<OpenGoalsSummary | null> {
  if (!creds.token || !creds.userName || !creds.orgId) return null;
  try {
    const api = new DeeplakeApi(
      creds.token,
      creds.apiUrl ?? "https://api.deeplake.ai",
      creds.orgId,
      creds.workspaceId ?? "default",
      goalsTableName,
    );
    const safe = sqlIdent(goalsTableName);
    // Latest version per goal_id, filtered to current owner +
    // non-closed status. The (goal_id, version) and (owner, status)
    // indexes both apply, so this stays a cheap point lookup even
    // on a large hivemind_goals table.
    //
    // We tolerate userName in either short ("emanuele.fenocchi") or
    // full-email form ("emanuele.fenocchi@activeloop.ai") by using
    // a LIKE substring match on the owner column. Different agents
    // historically populated this field with one or the other; the
    // skill instructs the agent to use whatever userName the
    // credentials carry, but staleness in older rows is real.
    const sql =
      // One row per goal_id (UPDATE-or-INSERT model), so a direct
      // WHERE on owner+status is the cheap and correct path.
      `SELECT goal_id, owner, status, content FROM "${safe}" ` +
      `WHERE owner LIKE '%${sqlStr(creds.userName)}%' ` +
      `  AND status IN ('opened', 'in_progress') ` +
      `ORDER BY created_at DESC LIMIT 25`;
    const rows = (await api.query(sql)) as Array<{
      goal_id?: string;
      owner?: string;
      status?: string;
      content?: string;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const goals: Array<{ label: string }> = [];
    for (const r of rows) {
      const owner = String(r.owner ?? "");
      const content = String(r.content ?? "");
      if (!owner || !content) continue;
      // Bi-directional substring match — same userName variant
      // problem as the previous LIKE narrowing did at the SQL
      // layer. Belt-and-braces guard for older rows.
      const u = creds.userName;
      if (owner !== u && !owner.includes(u) && !u.includes(owner)) continue;
      goals.push({ label: firstLine(content) });
    }
    if (goals.length === 0) return null;
    return {
      count: goals.length,
      sample: goals.slice(0, 3).map(g => truncate(g.label, 60)),
    };
  } catch (e: unknown) {
    log(`fetchOpenGoals: ${(e as Error).message}`);
    return null;
  }
}

/**
 * The first non-empty line of a markdown body — used as the goal's
 * banner label. Falls back to the whole content when there are no
 * newlines.
 */
function firstLine(content: string): string {
  for (const ln of content.split(/\r?\n/)) {
    const trimmed = ln.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return content.trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * Format the goals summary into ONE body line suitable for the
 * primary banner. Returns the empty string when there is nothing
 * worth showing.
 */
export function formatOpenGoalsLine(summary: OpenGoalsSummary | null): string {
  if (!summary || summary.count === 0) return "";
  const head = summary.count === 1
    ? "1 goal open"
    : `${summary.count} goals open`;
  if (summary.sample.length === 0) return head;
  return `${head} · ${summary.sample.join(" · ")}`;
}
