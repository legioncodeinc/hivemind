#!/usr/bin/env node

/**
 * CLI surface for `hivemind tasks`.
 *
 * Identity contract: every `<user>` value in this CLI must match the
 * target user's `cfg.userName` (what they see in `hivemind whoami`).
 * The string IS the identifier — comparisons are exact. If your org's
 * login persists `userName` as the email local-part ("alice"), passing
 * "alice@activeloop.ai" to `--assign` will silently break the assignee's
 * `tasks list --mine` view because the filter is an `===` against
 * `cfg.userName`. A proper `userEmail` field on Config (with login
 * backfill) is tracked as a v1.1 follow-up; v1 keeps the contract
 * stable as "match whoami exactly".
 *
 * Usage:
 *   hivemind tasks add "<text>" [--scope me|team] [--assign <user>]
 *       Add a new task. Defaults: --scope me, --assign self. KPIs are
 *       stored as `[]` in T3 — T4 will plug in an LLM call that fills
 *       them from the task text on insert.
 *   hivemind tasks list [--mine|--team|--all] [--status active|done|all] [--limit N]
 *       List tasks. Default: --mine (assigned to current user), active,
 *       10 newest. Pass --all to see everything you're authorized to see.
 *   hivemind tasks edit <task-id> "<new text>"
 *       Update a task's text — INSERTs a fresh version row, preserves
 *       task_id, bumps version. KPIs carry over from the prior version
 *       (T4 will add a `regen-kpis` flag for re-LLM-ing on edit).
 *   hivemind tasks done <task-id>
 *       Mark a task done (status='done').
 *   hivemind tasks assign <task-id> <user>
 *       Reassign the task to another user. Preserves text, scope, status.
 *       `<user>` must match the target's `cfg.userName` (see identity
 *       contract above).
 *   hivemind tasks progress <task-id> <kpi-id> --value N [--note "..."]
 *       Append a KPI progress event (source='user'). The event is
 *       attributed to the current task version, so a later edit
 *       doesn't accidentally rebind progress. Negative values allowed
 *       (corrections).
 *   hivemind tasks report [<task-id>]
 *       KPI progress summary computed from the task_events stream.
 *       Without an argument, lists every active task assigned to the
 *       current user and prints current/target per KPI. With an
 *       argument, dives into the single task.
 */

import { loadConfig } from "../config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { getVersion } from "../cli/version.js";
import {
  insertTask,
  editTask,
  markTaskDone,
  assignTask,
  listTasks,
  getTaskLatest,
  type TaskRow,
  type TaskScope,
  type ScopeFilter,
  type Kpi,
} from "../tasks/index.js";
import { appendEvent, computeAllForTask } from "../events/index.js";

const USAGE = `
hivemind tasks — manage personal + team tasks

Usage:
  hivemind tasks add "<text>" [--scope me|team] [--assign <user>]
  hivemind tasks list [--mine|--team|--all] [--status active|done|all] [--limit N]
  hivemind tasks edit <task-id> "<new text>"
  hivemind tasks done <task-id>
  hivemind tasks assign <task-id> <user>
  hivemind tasks progress <task-id> <kpi-id> --value N [--note "..."]
  hivemind tasks report [<task-id>]

Identity: <user> must match what \`hivemind whoami\` shows for the
target user. Comparisons are exact (no fuzzy / email matching in v1).
`.trim();

function requireConfig(): NonNullable<ReturnType<typeof loadConfig>> {
  const cfg = loadConfig();
  if (!cfg) {
    console.error("Not logged in. Run `hivemind login` first.");
    process.exit(2);
    throw new Error("unreachable");
  }
  return cfg;
}

function makeApi(cfg: NonNullable<ReturnType<typeof loadConfig>>): DeeplakeApi {
  return new DeeplakeApi(
    cfg.token,
    cfg.apiUrl,
    cfg.orgId,
    cfg.workspaceId,
    cfg.tableName,
  );
}

function parseScope(args: string[]): TaskScope {
  const idx = args.findIndex(a => a === "--scope" || a.startsWith("--scope="));
  if (idx === -1) return "me";
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  if (raw === "me" || raw === "team") return raw;
  console.error(`Invalid --scope value: ${raw}. Allowed: me | team.`);
  process.exit(1);
  throw new Error("unreachable");
}

function parseAssign(args: string[]): string | null {
  const idx = args.findIndex(a => a === "--assign" || a.startsWith("--assign="));
  if (idx === -1) return null;
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  if (!raw || raw.length === 0) {
    console.error("Missing --assign value.");
    process.exit(1);
    throw new Error("unreachable");
  }
  return raw;
}

/**
 * Pick the scope filter used by `list`. Three mutually-exclusive flags
 * map onto the module's ScopeFilter enum; default is 'mine' because
 * "what do I have to do?" is the most common reason a user types
 * `hivemind tasks list`.
 */
function parseScopeFilter(args: string[]): ScopeFilter {
  const mine = args.includes("--mine");
  const team = args.includes("--team");
  const all = args.includes("--all");
  // Reject conflicting flags. If the user genuinely meant "mine + team"
  // they want --all; otherwise the right value to default to is opaque.
  const count = Number(mine) + Number(team) + Number(all);
  if (count > 1) {
    console.error("Conflicting flags: pass at most one of --mine | --team | --all.");
    process.exit(1);
    throw new Error("unreachable");
  }
  if (team) return "team";
  if (all) return "all";
  return "mine"; // default
}

function parseStatus(args: string[]): "active" | "done" | "all" {
  const idx = args.findIndex(a => a === "--status" || a.startsWith("--status="));
  if (idx === -1) return "active";
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  if (raw === "active" || raw === "done" || raw === "all") return raw;
  console.error(`Invalid --status value: ${raw}. Allowed: active | done | all.`);
  process.exit(1);
  throw new Error("unreachable");
}

function parseLimit(args: string[]): number {
  const idx = args.findIndex(a => a === "--limit" || a.startsWith("--limit="));
  if (idx === -1) return 10;
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    console.error(`Invalid --limit value: ${raw}. Must be a positive integer.`);
    process.exit(1);
    throw new Error("unreachable");
  }
  return n;
}

/**
 * Parse the --value flag for `tasks progress`. Required; must be a
 * finite INTEGER (negative values allowed for corrections, zero NOT
 * allowed because it carries no signal). The events table stores
 * `value` as BIGINT, so fractional deltas would fail at the backend
 * INSERT — we reject up-front with a clear error rather than letting
 * the user discover via a cryptic SQL error. If fractional KPIs ever
 * become a real use case, the schema change (BIGINT → DOUBLE PRECISION)
 * is tracked as a v1.1 follow-up.
 */
function parseValue(args: string[]): number {
  const idx = args.findIndex(a => a === "--value" || a.startsWith("--value="));
  if (idx === -1) {
    console.error("Missing required --value <N> flag.");
    process.exit(1);
    throw new Error("unreachable");
  }
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    console.error(`Invalid --value: ${raw}. Must be a finite integer (events store BIGINT).`);
    process.exit(1);
    throw new Error("unreachable");
  }
  if (n === 0) {
    console.error("Invalid --value: 0. Use a non-zero integer (zero events carry no signal).");
    process.exit(1);
    throw new Error("unreachable");
  }
  return n;
}

function parseNote(args: string[]): string {
  const idx = args.findIndex(a => a === "--note" || a.startsWith("--note="));
  if (idx === -1) return "";
  return args[idx].includes("=") ? args[idx].split("=", 2)[1] : (args[idx + 1] ?? "");
}

/**
 * Drop known flag tokens (and their values) from `args` so positional
 * argument scans only see text / task_id / user_email. Recognises the
 * flags this command actually uses; unknown flags pass through unchanged
 * so adding a new flag doesn't accidentally swallow a positional.
 */
function stripKnownFlags(args: string[]): string[] {
  const VALUE_FLAGS = new Set(["--scope", "--status", "--limit", "--assign", "--value", "--note"]);
  const BOOL_FLAGS = new Set(["--mine", "--team", "--all"]);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (BOOL_FLAGS.has(a)) continue;
    if (VALUE_FLAGS.has(a)) { i++; continue; }              // --flag value form
    if (VALUE_FLAGS.has(a.split("=", 2)[0])) continue;      // --flag=value form
    out.push(a);
  }
  return out;
}

/**
 * Render one task row. We print the FULL task_id (36-char UUID) so
 * users can copy-paste it straight into edit / done / assign — these
 * subcommands do exact-match SELECTs. Truncating the id would break the
 * round-trip (same lesson as the rules CLI codex review on S2).
 */
function formatListRow(r: TaskRow): string {
  const tag = r.status === "done" ? "[done]" : "[active]";
  const scopeMarker = r.scope === "team" ? "team " : "me   ";
  return `${tag} ${scopeMarker} ${r.task_id}  v${r.version}  ${r.assigned_to}  ${r.text}`;
}

function formatKpiLine(k: Kpi): string {
  // T3 stores `current` from events (T5) — for now most rows have it
  // missing. Print "?/target" so the user sees the target exists even
  // before T5 events land and populate `current`.
  const current = typeof k.current === "number" ? String(k.current) : "?";
  return `    - ${k.name}: ${current}/${k.target} ${k.unit}`;
}

export async function runTasksCommand(args: string[]): Promise<void> {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h" || sub === "help") {
    console.log(USAGE);
    return;
  }

  const cfg = requireConfig();
  const api = makeApi(cfg);
  const tableName = cfg.tasksTableName;
  await api.ensureTasksTable(tableName);
  const pluginVersion = getVersion();

  if (sub === "add") {
    const positional = stripKnownFlags(args.slice(1));
    const text = positional[0];
    if (!text) {
      console.error("Missing task text. Usage: hivemind tasks add \"<text>\" [--scope me|team] [--assign <user>]");
      process.exit(1);
      throw new Error("unreachable");
    }
    const scope = parseScope(args.slice(1));
    const assignedTo = parseAssign(args.slice(1)) ?? cfg.userName;
    try {
      const out = await insertTask(api.query.bind(api), tableName, {
        text,
        scope,
        assigned_to: assignedTo,
        assigned_by: cfg.userName,
        // kpis intentionally omitted → defaults to [] until T4 lands an LLM call.
        plugin_version: pluginVersion,
      });
      console.log(`Added task ${out.task_id} (v${out.version}, scope=${scope}, assigned_to=${assignedTo}).`);
    } catch (err) {
      console.error(`Add failed: ${(err as Error).message}`);
      process.exit(1);
    }
    return;
  }

  if (sub === "list") {
    const scope = parseScopeFilter(args.slice(1));
    const status = parseStatus(args.slice(1));
    const limit = parseLimit(args.slice(1));
    const rows = await listTasks(api.query.bind(api), tableName, {
      scope,
      status,
      current_user: cfg.userName,
      limit,
    });
    if (rows.length === 0) {
      console.log(`(no tasks with scope=${scope} status=${status})`);
      return;
    }
    for (const r of rows) {
      console.log(formatListRow(r));
      for (const k of r.kpis) console.log(formatKpiLine(k));
    }
    return;
  }

  if (sub === "edit") {
    const positional = stripKnownFlags(args.slice(1));
    const taskId = positional[0];
    const newText = positional[1];
    if (!taskId || !newText) {
      console.error("Usage: hivemind tasks edit <task-id> \"<new text>\"");
      process.exit(1);
      throw new Error("unreachable");
    }
    try {
      const out = await editTask(api.query.bind(api), tableName, {
        task_id: taskId,
        text: newText,
        assigned_by: cfg.userName,
        plugin_version: pluginVersion,
      });
      console.log(`Edited task ${out.task_id} → v${out.version}.`);
    } catch (err) {
      console.error(`Edit failed: ${(err as Error).message}`);
      process.exit(1);
    }
    return;
  }

  if (sub === "done") {
    const positional = stripKnownFlags(args.slice(1));
    const taskId = positional[0];
    if (!taskId) {
      console.error("Usage: hivemind tasks done <task-id>");
      process.exit(1);
      throw new Error("unreachable");
    }
    try {
      const out = await markTaskDone(api.query.bind(api), tableName, {
        task_id: taskId,
        assigned_by: cfg.userName,
        plugin_version: pluginVersion,
      });
      console.log(`Marked task ${out.task_id} done (v${out.version}).`);
    } catch (err) {
      console.error(`Done failed: ${(err as Error).message}`);
      process.exit(1);
    }
    return;
  }

  if (sub === "assign") {
    const positional = stripKnownFlags(args.slice(1));
    const taskId = positional[0];
    const newAssignee = positional[1];
    if (!taskId || !newAssignee) {
      console.error("Usage: hivemind tasks assign <task-id> <user>");
      process.exit(1);
      throw new Error("unreachable");
    }
    try {
      const out = await assignTask(api.query.bind(api), tableName, {
        task_id: taskId,
        assigned_by: cfg.userName,
        assigned_to: newAssignee,
        plugin_version: pluginVersion,
      });
      console.log(`Assigned task ${out.task_id} to ${newAssignee} (v${out.version}).`);
    } catch (err) {
      console.error(`Assign failed: ${(err as Error).message}`);
      process.exit(1);
    }
    return;
  }

  if (sub === "progress") {
    const positional = stripKnownFlags(args.slice(1));
    const taskId = positional[0];
    const kpiId = positional[1];
    if (!taskId || !kpiId) {
      console.error("Usage: hivemind tasks progress <task-id> <kpi-id> --value N [--note \"...\"]");
      process.exit(1);
      throw new Error("unreachable");
    }
    const value = parseValue(args.slice(1));
    const note = parseNote(args.slice(1));
    // Bind the event to the CURRENT task version: a later edit (which
    // INSERTs version+1) shouldn't be retroactively credited with
    // progress, so we capture the version at write time. SELECT cost
    // is one extra round-trip per emission — fine for a CLI command
    // that runs at human cadence.
    const task = await getTaskLatest(api.query.bind(api), tableName, taskId);
    if (!task) {
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
      throw new Error("unreachable");
    }
    // Validate kpi_id against the LATEST task version's kpis. Without
    // this, a typo (`k_pr_merg` vs `k_pr_merged`) silently writes an
    // event the report never displays — ghost progress. We surface the
    // typo at write time with the list of valid kpi_ids. Codex review
    // pass 3 surfaced this.
    if (task.kpis.length > 0 && !task.kpis.some(k => k.kpi_id === kpiId)) {
      const valid = task.kpis.map(k => k.kpi_id).join(", ");
      console.error(`Unknown kpi_id '${kpiId}' on task ${taskId}. Valid: ${valid}`);
      process.exit(1);
      throw new Error("unreachable");
    }
    // When the task has zero KPIs (LLM gen lands in T4), we accept any
    // kpi_id rather than blocking the user — they can still record
    // progress against a forthcoming KPI shape. The note column carries
    // the kpi_id label for future attribution.
    try {
      const out = await appendEvent(
        api.query.bind(api),
        cfg.taskEventsTableName,
        {
          task_id: taskId,
          task_version: task.version,
          kpi_id: kpiId,
          value,
          note,
          source: "user",
          agent: "manual",
          plugin_version: pluginVersion,
        },
      );
      console.log(`Recorded progress: task ${taskId} kpi ${kpiId} value ${value} (event ${out.id}).`);
    } catch (err) {
      // The task_events table may not exist yet — try to create it
      // and retry once. Mirrors the lazy-create pattern in
      // src/hooks/capture.ts.
      const msg = (err as Error).message;
      if (msg.includes("does not exist") || msg.includes("permission denied")) {
        try {
          await api.ensureTaskEventsTable(cfg.taskEventsTableName);
          const out = await appendEvent(
            api.query.bind(api),
            cfg.taskEventsTableName,
            {
              task_id: taskId,
              task_version: task.version,
              kpi_id: kpiId,
              value,
              note,
              source: "user",
              agent: "manual",
              plugin_version: pluginVersion,
            },
          );
          console.log(`Recorded progress: task ${taskId} kpi ${kpiId} value ${value} (event ${out.id}).`);
        } catch (retryErr) {
          console.error(`Progress failed: ${(retryErr as Error).message}`);
          process.exit(1);
        }
      } else {
        console.error(`Progress failed: ${msg}`);
        process.exit(1);
      }
    }
    return;
  }

  if (sub === "report") {
    // Pull the set of tasks to report on. With an explicit task-id
    // positional we focus to that one row; without, we mirror the
    // default `list` scope (--mine + active) so `report` answers
    // "what's MY progress?" by default.
    const positional = stripKnownFlags(args.slice(1));
    const targetTaskId = positional[0];

    let tasksToReport: TaskRow[];
    if (targetTaskId) {
      const one = await getTaskLatest(api.query.bind(api), tableName, targetTaskId);
      if (!one) {
        console.error(`Task not found: ${targetTaskId}`);
        process.exit(1);
        throw new Error("unreachable");
      }
      tasksToReport = [one];
    } else {
      tasksToReport = await listTasks(api.query.bind(api), tableName, {
        scope: "mine",
        status: "active",
        current_user: cfg.userName,
        limit: 50, // report is the dive-deep view; allow a higher cap than list's 10
      });
    }

    if (tasksToReport.length === 0) {
      console.log("(no active tasks to report on)");
      return;
    }

    // Ensure the events table exists before any aggregate query. On a
    // fresh install nothing has created task_events yet (auto-extract
    // and `tasks progress` lazy-create on first INSERT, but report is
    // SELECT-only and would otherwise fail with "table does not
    // exist" before the kpis-length check could short-circuit).
    // Pre-ensure once at the top so the per-task SELECT loop never
    // touches that branch. Codex review on T5 surfaced this.
    await api.ensureTaskEventsTable(cfg.taskEventsTableName);

    // Per-task: render KPI lines from the events stream. Tasks with
    // no KPIs short-circuit BEFORE the aggregate query — saves a
    // round-trip and surfaces the "T4 plugs LLM generation" hint
    // even when the events table is brand-new.
    for (const task of tasksToReport) {
      console.log(formatListRow(task));
      if (task.kpis.length === 0) {
        console.log("    (no KPIs defined yet — T4 will plug LLM generation)");
        continue;
      }
      const totals = await computeAllForTask(
        api.query.bind(api),
        cfg.taskEventsTableName,
        task.task_id,
      );
      for (const k of task.kpis) {
        const current = totals[k.kpi_id] ?? 0;
        console.log(`    - ${k.name}: ${current}/${k.target} ${k.unit}`);
      }
    }
    return;
  }

  console.error(`Unknown tasks subcommand: ${sub}`);
  console.error(USAGE);
  process.exit(1);
}
