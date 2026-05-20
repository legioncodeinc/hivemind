/**
 * Append-only writer for `hivemind_task_events`.
 *
 * Every event is a fresh INSERT — there are no UPDATEs on this table, so
 * the Deeplake UPDATE-coalescing bug (CLAUDE.md) is structurally
 * unreachable for events. KPI current values are derived by aggregating
 * this stream via SUM(value) — see ./aggregate.ts.
 *
 * Sources documented for the `source` column:
 *   - 'agent'        — explicit emission via `hivemind task-progress`
 *                      called from inside an agent's Bash tool
 *   - 'user'         — a human typing the same CLI at the terminal
 *   - 'auto-extract' — the PostToolUse capture hook matched a known
 *                      shell pattern (e.g. `gh pr merge`) and emitted
 *                      an event without user/agent intent
 */

import { randomUUID } from "node:crypto";
import { sqlIdent, sqlStr } from "../utils/sql.js";

export type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

export type EventSource = "agent" | "user" | "auto-extract";

export interface AppendEventInput {
  /** FK to hivemind_tasks.task_id (logical — not enforced by Deeplake). */
  task_id: string;
  /** Task version at the time the event was emitted. */
  task_version: number;
  /** KPI identifier within the task's kpis JSONB; nullable for task-level events. */
  kpi_id?: string;
  /** Numeric delta against the KPI's current value. Negative values allowed (corrections). */
  value: number;
  /** Optional free-text note describing the event. */
  note?: string;
  /** Provenance — see EventSource enum docs. */
  source: EventSource;
  /** Which agent (claude_code, codex, etc.) emitted this. Empty for human/manual. */
  agent?: string;
  plugin_version?: string;
}

export interface AppendResult {
  /** The freshly-generated row id (UUIDv4). Mainly useful for tests. */
  id: string;
}

/**
 * INSERT one event into the task-events table. No SELECTs, no UPDATEs —
 * just a single statement. Caller is responsible for ensuring the table
 * exists (via DeeplakeApi.ensureTaskEventsTable) before the first append.
 */
export async function appendEvent(
  query: QueryFn,
  tableName: string,
  input: AppendEventInput,
): Promise<AppendResult> {
  const safe = sqlIdent(tableName);
  const rowId = randomUUID();
  const now = new Date().toISOString();
  if (!Number.isFinite(input.value)) {
    throw new Error(`Event value must be finite (got ${input.value})`);
  }
  if (!Number.isInteger(input.task_version) || input.task_version < 1) {
    throw new Error(`Event task_version must be a positive integer (got ${input.task_version})`);
  }
  const kpiId = input.kpi_id ?? "";
  const note = input.note ?? "";
  const agent = input.agent ?? "";
  const pluginVersion = input.plugin_version ?? "";

  const sql =
    `INSERT INTO "${safe}" ` +
    `(id, task_id, task_version, kpi_id, value, note, source, agent, ts, plugin_version) ` +
    `VALUES (` +
    `'${sqlStr(rowId)}', ` +
    `'${sqlStr(input.task_id)}', ` +
    `${input.task_version}, ` +
    `'${sqlStr(kpiId)}', ` +
    `${input.value}, ` +
    `E'${sqlStr(note)}', ` +
    `'${sqlStr(input.source)}', ` +
    `'${sqlStr(agent)}', ` +
    `'${sqlStr(now)}', ` +
    `'${sqlStr(pluginVersion)}'` +
    `)`;
  await query(sql);
  return { id: rowId };
}
