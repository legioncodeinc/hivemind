/**
 * Aggregate KPI current values from the append-only `hivemind_task_events`
 * stream. `computeCurrent(task_id, kpi_id)` returns SUM(value) for the
 * given pair; the (task_id, kpi_id) lookup index created by
 * ensureTaskEventsTable keeps the SUM cheap at v1 scale.
 *
 * Why we aggregate from events rather than read the snapshot column on
 * the task row:
 *
 *   - The task row's `kpis[].current` field is a (T4 LLM gen or T6
 *     renderer) convenience snapshot, not authoritative. It's also
 *     subject to the version-bump pattern, so a stale write would shadow
 *     a fresh event.
 *   - Events are append-only — no UPDATE coalescing risk. The
 *     aggregation result reflects every event that landed.
 *   - The schema reads consistently for both single-KPI lookup
 *     (computeCurrent) and bulk batched aggregation (computeAllForTask).
 *
 * The aggregations are read-side only. Writes go through ./append.ts.
 */

import { sqlIdent, sqlStr } from "../utils/sql.js";

export type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

/**
 * Compute the current value of one KPI on one task by summing every
 * event row with the matching (task_id, kpi_id) tuple. Returns 0 when
 * no events have been emitted yet — distinguishing "no events" from
 * "events sum to zero" is intentionally not a contract here, because
 * the SessionStart renderer (T6) treats both cases identically.
 */
export async function computeCurrent(
  query: QueryFn,
  tableName: string,
  taskId: string,
  kpiId: string,
): Promise<number> {
  const safe = sqlIdent(tableName);
  const rows = await query(
    `SELECT SUM(value) AS total FROM "${safe}" ` +
      `WHERE task_id = '${sqlStr(taskId)}' AND kpi_id = '${sqlStr(kpiId)}'`,
  );
  return normalizeTotal(rows[0]?.total);
}

/**
 * Compute current values for every KPI on a single task in one round
 * trip. Returns a `{ kpi_id → current }` map; KPIs with no events get
 * value 0 (caller can decide how to render "0 vs missing").
 *
 * Saves the N round-trips that the obvious `for (kpi of task.kpis)
 * computeCurrent(...)` loop would produce — important once a task has
 * 5+ KPIs and we're rendering them in a SessionStart inject block.
 */
export async function computeAllForTask(
  query: QueryFn,
  tableName: string,
  taskId: string,
): Promise<Record<string, number>> {
  const safe = sqlIdent(tableName);
  const rows = await query(
    `SELECT kpi_id, SUM(value) AS total FROM "${safe}" ` +
      `WHERE task_id = '${sqlStr(taskId)}' ` +
      `GROUP BY kpi_id`,
  );
  const out: Record<string, number> = {};
  for (const row of rows) {
    const kpiId = typeof row.kpi_id === "string" ? row.kpi_id : "";
    if (!kpiId) continue; // task-level events with NULL kpi_id are not per-KPI counters
    out[kpiId] = normalizeTotal(row.total);
  }
  return out;
}

/**
 * Normalise the SUM(value) cell into a finite number. Deeplake may
 * return either a number or a string (driver-dependent serialization);
 * null comes back when there are zero matching rows.
 */
function normalizeTotal(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
