/**
 * Read helpers for `hivemind_rules`.
 *
 * The table is append-only with a per-rule version monotone (see ./write.ts).
 * Reads always pick the latest row per `rule_id`. v1 fetches all rows and
 * deduplicates in JS — simple, portable across whatever subset of Postgres
 * window functions Deeplake exposes, and fast enough at the expected v1
 * scale (org rule counts measured in tens, not thousands).
 *
 * The lookup index `(rule_id, version)` (created by `ensureRulesTable`)
 * keeps the SELECT cheap as the table grows; if v1.1 ever exceeds JS-dedup
 * comfort, swap in a window-function SELECT — the row shape is unchanged.
 */

import { sqlIdent, sqlStr } from "../utils/sql.js";

export type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

/** Shape of one row in `hivemind_rules` — mirrors RULES_COLUMNS exactly. */
export interface RuleRow {
  id: string;
  rule_id: string;
  text: string;
  scope: string;
  status: string;
  assigned_by: string;
  version: number;
  created_at: string;
  agent: string;
  plugin_version: string;
}

export interface ListRulesOpts {
  /** Filter by status. Default 'active'. Pass 'all' for everything. */
  status?: "active" | "done" | "all";
  /** Max rows returned. Default 10 — matches the SessionStart inject cap (A4). */
  limit?: number;
}

const SELECT_COLS =
  "id, rule_id, text, scope, status, assigned_by, version, created_at, agent, plugin_version";

/**
 * Return the latest version row for every distinct `rule_id`, filtered
 * by status and capped at `limit`. The "latest per id" dedup happens in
 * JS — see module docstring for the rationale.
 *
 * Newest-first ordering (by `created_at` of the winning version) matches
 * what the SessionStart renderer wants: most-recently-touched rules go to
 * the top of the inject block.
 */
export async function listRules(
  query: QueryFn,
  tableName: string,
  opts: ListRulesOpts = {},
): Promise<RuleRow[]> {
  const safe = sqlIdent(tableName);
  // ORDER BY version DESC primes the JS dedup: the first row seen per
  // rule_id is automatically the winning latest-version row.
  const rows = await query(
    `SELECT ${SELECT_COLS} FROM "${safe}" ORDER BY version DESC, created_at DESC`,
  );

  const latest = new Map<string, RuleRow>();
  for (const r of rows) {
    const row = normalize(r);
    if (!row) continue;
    if (!latest.has(row.rule_id)) latest.set(row.rule_id, row);
  }

  const statusFilter = opts.status ?? "active";
  const filtered = [...latest.values()].filter(r =>
    statusFilter === "all" ? true : r.status === statusFilter,
  );

  filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return filtered.slice(0, opts.limit ?? 10);
}

/**
 * Return the latest version of a single rule by `rule_id`, or `null` if it
 * does not exist. Used by `editRule` / `markRuleDone` in ./write.ts to
 * carry over the prior text when the caller omits one of the editable
 * fields.
 */
export async function getRuleLatest(
  query: QueryFn,
  tableName: string,
  ruleId: string,
): Promise<RuleRow | null> {
  const safe = sqlIdent(tableName);
  // Two-key ORDER BY: version DESC picks the highest-numbered version,
  // created_at DESC breaks ties deterministically when a race between
  // two concurrent edits produced duplicate v=N+1 rows for the same
  // rule_id. listRules() uses the same compound key (see SELECT below),
  // so single-rule and list reads agree on which row is "latest"
  // regardless of which one a query happens to scan first. Codex review
  // on S2 surfaced this.
  const rows = await query(
    `SELECT ${SELECT_COLS} FROM "${safe}" ` +
      `WHERE rule_id = '${sqlStr(ruleId)}' ` +
      `ORDER BY version DESC, created_at DESC LIMIT 1`,
  );
  if (rows.length === 0) return null;
  return normalize(rows[0]);
}

/**
 * Coerce a row from the Deeplake API client into a typed RuleRow. The
 * client returns `Record<string, unknown>` because it has no schema
 * awareness — this is where we re-attach the static type.
 */
function normalize(row: Record<string, unknown>): RuleRow | null {
  // version arrives as either number (parsed by the client) or string
  // (raw cell value depending on Deeplake's JSON shape). Normalize to
  // number; a NaN means the row was malformed and we drop it.
  const vRaw = row.version;
  const version =
    typeof vRaw === "number" ? vRaw : typeof vRaw === "string" ? Number(vRaw) : NaN;
  if (!Number.isFinite(version)) return null;
  return {
    id: String(row.id ?? ""),
    rule_id: String(row.rule_id ?? ""),
    text: String(row.text ?? ""),
    scope: String(row.scope ?? ""),
    status: String(row.status ?? ""),
    assigned_by: String(row.assigned_by ?? ""),
    version,
    created_at: String(row.created_at ?? ""),
    agent: String(row.agent ?? ""),
    plugin_version: String(row.plugin_version ?? ""),
  };
}
