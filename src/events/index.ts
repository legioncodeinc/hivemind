/**
 * Barrel for `src/events/`.
 *
 * Consumers (PostToolUse auto-extract hook in T5, tasks-report CLI in
 * T5, SessionStart renderer in T6) import from this entry point so
 * internal refactors stay non-breaking.
 */

export { appendEvent } from "./append.js";
export type { AppendEventInput, AppendResult, EventSource, QueryFn } from "./append.js";

export { computeCurrent, computeAllForTask } from "./aggregate.js";
