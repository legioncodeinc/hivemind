/**
 * Codex: STUB no-op (v1).
 *
 * Why no-op: Codex flattens multiple SessionStart hook commands' outputs into
 * a single Vec<String> via codex-rs/hooks/src/events/common.rs::flatten_additional_contexts,
 * then joins with "\n\n" downstream. There is no harness-level mechanism to
 * present a notification as a SEPARATE context block — registering a second
 * hook command results in the notification text being concatenated with the
 * existing memory/hivemind block, violating the project rule that
 * notifications must not ride inside that block.
 *
 * Hook stderr is also unreachable: codex-rs/hooks/src/events/session_start.rs
 * `parse_completed()` only inspects stdout; the stderr field on the run
 * result is never read.
 *
 * Deferred follow-up: inline-append into existing src/hooks/codex/session-start.ts
 * with a clearly delimited section (e.g. a divider line). That requires a
 * design call about how visually distinct "inline-with-separator" can be
 * before it stops being acceptable, which we punt to a separate PR.
 */

export function emitCodex(_rendered: string): void {
  // intentionally empty — see file header
}
