/**
 * Auto-extract orchestrator — composes the pattern allow-list (./auto-
 * extract-patterns.ts) with the event writer (../events/append.ts) into
 * one function the capture hook can await per PostToolUse event.
 *
 * Living in its own module (vs inline in capture.ts) keeps the logic
 * unit-testable without mocking stdin or the whole capture pipeline.
 * capture.ts just imports `tryAutoExtract` and wraps the call in a
 * try/catch so a failure never breaks the session-row INSERT.
 *
 * v1 semantics (intentionally minimal):
 *
 *   - Fires only on PostToolUse for the Bash tool. Pre-tool events for
 *     Bash would otherwise produce a duplicate emission per command.
 *   - The emitted event is "orphan": task_id="", kpi_id="". The
 *     pattern triggered, but v1 has no notion of "current task"
 *     binding so we don't pretend to attribute progress. The note
 *     column carries the full command for later forensic / manual
 *     attribution (planned in v1.1 as `hivemind events attribute`).
 *   - Orphan events are deliberately invisible to computeAllForTask
 *     (which filters by kpi_id !== "") so they don't pollute KPI
 *     totals until they're attributed.
 */

import { matchCommand } from "./auto-extract-patterns.js";
import { appendEvent } from "../events/index.js";

export type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

/**
 * Shape of the hook-event input subset this orchestrator reads. Each
 * agent's capture pipeline can build this from its own hook envelope;
 * we keep the surface deliberately narrow.
 */
export interface AutoExtractInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

export interface AutoExtractOptions {
  /** Agent identifier — landed in the event's `agent` column. */
  agent: string;
  /** Plugin version that produced the event. */
  plugin_version?: string;
}

/**
 * Inspect one hook event; if it's a PostToolUse for a Bash command
 * matching the pattern allow-list, INSERT an orphan event row into the
 * task-events table.
 *
 * Returns the matched event kind (e.g. "gh-pr-merge") on emission, or
 * null when nothing was emitted. Callers should treat any thrown
 * exception as non-fatal — wrap the call in a try/catch in capture.ts
 * so an INSERT failure never breaks the session capture path.
 */
export async function tryAutoExtract(
  query: QueryFn,
  taskEventsTable: string,
  input: AutoExtractInput,
  options: AutoExtractOptions,
): Promise<string | null> {
  // Gate 1: only PostToolUse. PreToolUse on Bash also carries a
  // tool_input.command, but emitting on both pre+post would double-count
  // every match. Post is the correct moment — the command actually ran.
  if (input.hook_event_name !== "PostToolUse") return null;

  // Gate 2: only the Bash tool — the only one whose tool_input.command
  // shape is a literal shell command string. Edit / Read / Glob / etc.
  // never match the regex even if you ran them, so this is a perf gate
  // (skip the regex scan) more than a correctness one.
  if (input.tool_name !== "Bash") return null;

  const command = (input.tool_input as { command?: unknown } | undefined)?.command;
  if (typeof command !== "string") return null;

  const event = matchCommand(command);
  if (!event) return null;

  await appendEvent(query, taskEventsTable, {
    // Orphan event — v1 doesn't bind to a specific task/KPI. See
    // module docstring for the rationale.
    task_id: "",
    task_version: 1,
    kpi_id: "",
    value: event.value,
    note: event.note,
    source: "auto-extract",
    agent: options.agent,
    plugin_version: options.plugin_version,
  });

  return event.kind;
}
