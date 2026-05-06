/**
 * Cursor: STUB no-op (v1).
 *
 * Why no-op: Cursor 1.7+ hooks expose a single `additional_context` string
 * field. Cursor is closed-source, so we cannot inspect how multiple
 * sessionStart hook commands' outputs are merged. The docs describe the
 * field as a flat string and are silent on multi-hook semantics. Until that
 * is empirically verified (probe at probe/probe-cursor.js), we cannot
 * guarantee a second hook command produces a distinct context block.
 *
 * Stderr behavior is also undocumented.
 *
 * Deferred follow-up: run the probe in a live Cursor session, then either:
 *   (a) confirm separate blocks → switch to a real adapter mirroring the
 *       Claude Code shape, or
 *   (b) confirm concatenation → use the inline-append pattern from the
 *       Codex follow-up.
 */

export function emitCursor(_rendered: string): void {
  // intentionally empty — see file header
}
