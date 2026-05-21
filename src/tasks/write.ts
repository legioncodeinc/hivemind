/**
 * Write helpers for `hivemind_tasks` — INSERT-only against the
 * immutable skills-table pattern (mirror of src/rules/write.ts).
 * Every mutation INSERTs a fresh row with version+1; we never UPDATE.
 *
 * T3 ships these helpers without LLM KPI generation — every freshly
 * created task lands with `kpis = '[]'`. T4 will hook an LLM call into
 * `insertTask` to populate kpis on creation (and `regenKpis` to refresh
 * on edit). The KPI JSONB shape is enforced by parseKpis / stringifyKpis
 * in ./kpi-validator.ts.
 *
 * Why no UPDATEs: Deeplake silently coalesces two rapid UPDATEs on the
 * same row (CLAUDE.md "UPDATE coalescing quirk"). INSERT-only avoids the
 * bug. See `deeplake-api.ts:530` (skills) for the same precedent.
 */

import { randomUUID } from "node:crypto";
import { sqlIdent, sqlStr } from "../utils/sql.js";
import { stringifyKpis, type Kpi } from "./kpi-validator.js";
import { getTaskLatest, type TaskRow } from "./read.js";

export type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

export type TaskScope = "me" | "team";
export type TaskStatus = "active" | "done";

export interface InsertTaskInput {
  /** Task body. Hard cap 2000 chars (matches the rules cap, Open Question O5). */
  text: string;
  /** 'me' (personal) or 'team' (everyone sees at SessionStart). */
  scope: TaskScope;
  /** user_email of whoever's responsible. Defaults to assigned_by. */
  assigned_to?: string;
  /** user_email of whoever filed the task (always required). */
  assigned_by: string;
  /**
   * Explicit KPI set. If provided, OVERRIDES any auto-generation
   * (caller knows what they want — useful for tests and bulk import).
   * Validated through stringifyKpis to drop malformed items.
   */
  kpis?: Kpi[];
  /**
   * Optional async KPI generator (added in T4). Called with `text`
   * when `kpis` is omitted; whatever it returns is then validated
   * through stringifyKpis. A throwing or empty generator just lands
   * an empty kpis JSONB — the task still INSERTs successfully.
   * Caller is responsible for picking the generator (LLM vs no-op
   * stub vs canned fixture). insertTask itself does NOT import any
   * LLM client.
   */
  generateKpis?: (text: string) => Promise<Kpi[]>;
  agent?: string;
  plugin_version?: string;
}

export interface EditTaskInput {
  /** Stable task_id (NOT the per-version row `id`). */
  task_id: string;
  /** user_email of whoever made the edit. */
  assigned_by: string;
  text?: string;
  status?: TaskStatus;
  /** Re-assign in the same edit. Omit to keep the prior assignee. */
  assigned_to?: string;
  /**
   * Replace the kpis JSONB. Omit to carry over the previous version's
   * value. T4 will use this to push regenerated KPIs after an LLM call.
   */
  kpis?: Kpi[];
  agent?: string;
  plugin_version?: string;
}

export interface WriteResult {
  task_id: string;
  version: number;
}

const MAX_TEXT_LENGTH = 2000;

function assertValidText(text: string): void {
  if (text.length === 0) throw new Error("Task text must not be empty");
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Task text exceeds ${MAX_TEXT_LENGTH} chars (got ${text.length})`);
  }
  // Reject newlines at write time as defense-in-depth against
  // prompt-injection through the SessionStart inject block.
  // Renderer also sanitizes at render time for already-persisted
  // rows from a vulnerable older client.
  if (/[\r\n\u2028\u2029\u0085]/.test(text)) {
    throw new Error("Task text must not contain newlines (use one task per line)");
  }
}

function assertValidScope(scope: string): asserts scope is TaskScope {
  if (scope !== "me" && scope !== "team") {
    throw new Error(`Invalid task scope: ${JSON.stringify(scope)} (expected 'me' or 'team')`);
  }
}

/**
 * Insert a brand new task. Generates a fresh `task_id` (UUIDv4) and
 * writes version=1. `assigned_to` defaults to `assigned_by` when
 * omitted (self-assigned by default, regardless of scope).
 */
export async function insertTask(
  query: QueryFn,
  tableName: string,
  input: InsertTaskInput,
): Promise<WriteResult> {
  assertValidText(input.text);
  assertValidScope(input.scope);
  const safe = sqlIdent(tableName);
  const taskId = randomUUID();
  const rowId = randomUUID();
  const now = new Date().toISOString();
  const assignedTo = input.assigned_to ?? input.assigned_by;
  // KPI source-of-truth precedence:
  //   1. explicit `kpis` from caller (always wins — tests, bulk import)
  //   2. `generateKpis` callback (T4 LLM gen — caller picks the generator)
  //   3. [] (T3 default: no LLM wired)
  // A throwing generator is treated the same as returning [] — the
  // task INSERT must NOT fail because the LLM is down.
  let kpis: Kpi[];
  if (input.kpis !== undefined) {
    kpis = input.kpis;
  } else if (input.generateKpis) {
    kpis = await input.generateKpis(input.text).catch(() => []);
  } else {
    kpis = [];
  }
  const kpisJson = stringifyKpis(kpis);
  const agent = input.agent ?? "manual";
  const pluginVersion = input.plugin_version ?? "";

  const sql =
    `INSERT INTO "${safe}" ` +
    `(id, task_id, text, scope, status, assigned_to, assigned_by, kpis, version, created_at, agent, plugin_version) ` +
    `VALUES (` +
    `'${sqlStr(rowId)}', ` +
    `'${sqlStr(taskId)}', ` +
    `E'${sqlStr(input.text)}', ` +
    `'${sqlStr(input.scope)}', ` +
    `'active', ` +
    `'${sqlStr(assignedTo)}', ` +
    `'${sqlStr(input.assigned_by)}', ` +
    `E'${sqlStr(kpisJson)}'::jsonb, ` +
    `1, ` +
    `'${sqlStr(now)}', ` +
    `'${sqlStr(agent)}', ` +
    `'${sqlStr(pluginVersion)}'` +
    `)`;
  await query(sql);
  return { task_id: taskId, version: 1 };
}

/**
 * Edit an existing task. SELECTs the latest row, then INSERTs version+1
 * with the merged fields (omitted fields carry over from the prior
 * version). Throws when `task_id` does not exist.
 */
export async function editTask(
  query: QueryFn,
  tableName: string,
  input: EditTaskInput,
): Promise<WriteResult> {
  const previous = await getTaskLatest(query, tableName, input.task_id);
  if (!previous) {
    throw new Error(`Task not found: ${input.task_id}`);
  }
  return appendVersion(query, tableName, previous, {
    text: input.text ?? previous.text,
    status: input.status ?? (previous.status as TaskStatus),
    assigned_to: input.assigned_to ?? previous.assigned_to,
    assigned_by: input.assigned_by,
    // `undefined` means "carry over", which read.ts already validated to
    // a Kpi[]; an explicit empty array clears KPIs.
    kpis: input.kpis ?? previous.kpis,
    agent: input.agent,
    plugin_version: input.plugin_version,
  });
}

/**
 * Mark a task done. Thin wrapper around editTask that flips status.
 * Re-marking an already-done task still writes a new version row so
 * the audit trail records the latest closer.
 */
export async function markTaskDone(
  query: QueryFn,
  tableName: string,
  input: { task_id: string; assigned_by: string; agent?: string; plugin_version?: string },
): Promise<WriteResult> {
  return editTask(query, tableName, { ...input, status: "done" });
}

/**
 * Reassign a task. Thin wrapper around editTask that changes only the
 * `assigned_to` field. The `assigned_by` argument records who did the
 * reassignment (which may or may not equal the new assignee).
 */
export async function assignTask(
  query: QueryFn,
  tableName: string,
  input: { task_id: string; assigned_by: string; assigned_to: string; agent?: string; plugin_version?: string },
): Promise<WriteResult> {
  return editTask(query, tableName, {
    task_id: input.task_id,
    assigned_by: input.assigned_by,
    assigned_to: input.assigned_to,
    agent: input.agent,
    plugin_version: input.plugin_version,
  });
}

interface AppendInput {
  text: string;
  status: TaskStatus;
  assigned_to: string;
  assigned_by: string;
  kpis: Kpi[];
  agent?: string;
  plugin_version?: string;
}

async function appendVersion(
  query: QueryFn,
  tableName: string,
  previous: TaskRow,
  next: AppendInput,
): Promise<WriteResult> {
  assertValidText(next.text);
  const safe = sqlIdent(tableName);
  const rowId = randomUUID();
  const now = new Date().toISOString();
  const nextVersion = previous.version + 1;
  const kpisJson = stringifyKpis(next.kpis);
  const agent = next.agent ?? "manual";
  const pluginVersion = next.plugin_version ?? "";

  const sql =
    `INSERT INTO "${safe}" ` +
    `(id, task_id, text, scope, status, assigned_to, assigned_by, kpis, version, created_at, agent, plugin_version) ` +
    `VALUES (` +
    `'${sqlStr(rowId)}', ` +
    `'${sqlStr(previous.task_id)}', ` +
    `E'${sqlStr(next.text)}', ` +
    // scope is carried over from the prior version — task scope is an
    // intrinsic property of the task identity, not something edit can
    // flip mid-lifecycle.
    `'${sqlStr(previous.scope)}', ` +
    `'${sqlStr(next.status)}', ` +
    `'${sqlStr(next.assigned_to)}', ` +
    `'${sqlStr(next.assigned_by)}', ` +
    `E'${sqlStr(kpisJson)}'::jsonb, ` +
    `${nextVersion}, ` +
    `'${sqlStr(now)}', ` +
    `'${sqlStr(agent)}', ` +
    `'${sqlStr(pluginVersion)}'` +
    `)`;
  await query(sql);
  return { task_id: previous.task_id, version: nextVersion };
}

export const _MAX_TEXT_LENGTH = MAX_TEXT_LENGTH;
