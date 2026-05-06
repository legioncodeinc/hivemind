/**
 * Hermes: STUB no-op (v1).
 *
 * Why no-op: Hermes' on_session_start hook fires the script, but
 * run_agent.py:9777-9786 calls `invoke_hook("on_session_start", ...)` and
 * DISCARDS the returned List[Any] — no caller reads it. So a `{context: ...}`
 * payload from the script never reaches the model. (The current shipping
 * src/hooks/hermes/session-start.ts:109 `console.log({ context })` is a
 * latent upstream bug worth filing separately.)
 *
 * Stderr is also unreachable as a user channel: shell_hooks.py:444-448 routes
 * captured stderr to logger.debug(...) only — DEBUG log level is opt-in and
 * the format is `<timestamp> DEBUG shell hook stderr (event=… command=…): …`,
 * not a user-facing banner.
 *
 * The model-visible context-injection point in Hermes is `pre_llm_call`
 * (run_agent.py:9890-9897), which fires every turn and concatenates with
 * "\n\n". Wiring notifications there means we own the dedup ourselves —
 * fire only once per session_id by writing it into our state file.
 *
 * Deferred follow-up: register a `pre_llm_call` hook entry that calls
 * drainSessionStart-equivalent with framework-side session_id dedup.
 */

export function emitHermes(_rendered: string): void {
  // intentionally empty — see file header
}
