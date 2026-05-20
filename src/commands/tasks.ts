#!/usr/bin/env node

/**
 * CLI surface for `hivemind tasks`.
 *
 * Usage:
 *   hivemind tasks add "<text>" [--scope me|team] [--assign <user_email>]
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
 *   hivemind tasks assign <task-id> <user_email>
 *       Reassign the task to another user. Preserves text, scope, status.
 *   hivemind tasks report [<task-id>]
 *       (stub in T3) — KPI progress summary. The aggregation depends on
 *       the events table which lands in T5. Today this prints a deferred
 *       notice so we don't ship a half-working command.
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
  type TaskRow,
  type TaskScope,
  type ScopeFilter,
  type Kpi,
} from "../tasks/index.js";

const USAGE = `
hivemind tasks — manage personal + team tasks

Usage:
  hivemind tasks add "<text>" [--scope me|team] [--assign <user_email>]
  hivemind tasks list [--mine|--team|--all] [--status active|done|all] [--limit N]
  hivemind tasks edit <task-id> "<new text>"
  hivemind tasks done <task-id>
  hivemind tasks assign <task-id> <user_email>
  hivemind tasks report [<task-id>]    (T5: events / KPI aggregation)
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
 * Drop known flag tokens (and their values) from `args` so positional
 * argument scans only see text / task_id / user_email. Recognises the
 * flags this command actually uses; unknown flags pass through unchanged
 * so adding a new flag doesn't accidentally swallow a positional.
 */
function stripKnownFlags(args: string[]): string[] {
  const VALUE_FLAGS = new Set(["--scope", "--status", "--limit", "--assign"]);
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
      console.error("Missing task text. Usage: hivemind tasks add \"<text>\" [--scope me|team] [--assign <user_email>]");
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
      console.error("Usage: hivemind tasks assign <task-id> <user_email>");
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

  if (sub === "report") {
    // T3 stub: KPI aggregation requires the hivemind_task_events table
    // and aggregate.computeCurrent() which both land in T5. We print a
    // clear notice rather than silently returning zero progress (which
    // would be indistinguishable from "real" zero progress and mislead
    // the user about whether the feature is wired up yet).
    console.log("report: KPI progress aggregation lands with the events module in T5.");
    console.log("       Today `hivemind tasks list` already prints the static KPI definitions.");
    return;
  }

  console.error(`Unknown tasks subcommand: ${sub}`);
  console.error(USAGE);
  process.exit(1);
}
