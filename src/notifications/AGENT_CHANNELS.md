# Per-agent SessionStart delivery channels

Source of truth for what each per-agent adapter in `src/notifications/delivery/` does (or doesn't) emit. Records the post-deep-read findings from each agent's harness source — config-shape inspection alone was misleading and is no longer trusted.

## TL;DR

| Agent | Multi-hook → distinct context blocks? | Stderr → user? | v1 delivery |
|---|---|---|---|
| **Claude Code** | ✅ YES — separate `<system-reminder>` per command | ✅ YES — verbatim | **REAL**: separate hook command + own additionalContext block |
| **Codex** | ❌ NO — flattened `Vec<String>`, joined with `\n\n` downstream | ❌ NO — discarded | **STUB**: no-op + TODO (defer inline-append) |
| **Hermes** | ❌ NO — `on_session_start` return value DISCARDED entirely | ❌ NO — captured to `logger.debug` only | **STUB**: no-op + TODO (defer to `pre_llm_call` + dedup) |
| **Cursor** | ⚠️ Unknown (closed-source GUI; docs imply concat) | ⚠️ Unknown | **STUB**: no-op + TODO |

## Findings (source-level)

### Claude Code — verified empirical + via existing autoupdate code path

- This very session shows **two distinct DEEPLAKE MEMORY system-reminder blocks** coming from two separately-installed hivemind hooks (0.6.x plugin path + 0.7.x cached path). Each registered hook command produces its own visible `<system-reminder>`.
- Stderr surfaces verbatim: existing `src/hooks/session-start.ts` lines 182, 187, 192 ship `process.stderr.write()` calls for auto-update banners — proven in production.
- **Channel:** register a SECOND SessionStart hook command in `claude-code/hooks/hooks.json` that emits its own `JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "..." } })`. Harness keeps it as a separate block.

### Codex — verified upstream source (`openai/codex@main`)

- `codex-rs/hooks/src/events/session_start.rs` parses each command's stdout (JSON first, plain text fallback into `additional_context`).
- `codex-rs/hooks/src/events/common.rs::flatten_additional_contexts` collects all hooks' contexts as a `Vec<String>` of separate items.
- Downstream those entries are joined with `"\n\n"` for the model — **concatenation, not separate blocks**.
- `parse_completed()` only reads stdout; `result.stderr` field exists but is never inspected — **stderr discarded**.
- **v1 implication:** registering a second hook command does NOT produce a distinct context block — the user's "but not DEEPLAKE MEMORY, HIVEMIND" requirement cannot be honored at the harness level.

### Hermes — verified upstream source (`~/.hermes/hermes-agent/`)

- `run_agent.py:9777-9786`: `_invoke_hook("on_session_start", ...)` is called but its return value is **discarded** — no assignment, no use of the returned `List[Any]`.
- The current shipping `src/hooks/hermes/session-start.ts:109` line `console.log(JSON.stringify({ context: additional }))` is a **latent no-op** — bytes travel through stdin/stdout/parse and get dropped at the caller. Worth filing upstream.
- `agent/shell_hooks.py:391-398` runs hooks with `subprocess.run(..., capture_output=True, ...)`, then `:444-448` routes stderr to `logger.debug(...)` only — stderr is captured and only emitted at DEBUG log level (default INFO/WARNING; user must explicitly opt in via `--dev` or `HERMES_LOG_LEVEL=DEBUG`).
- The actual model-visible context-injection point in Hermes is `pre_llm_call` (`run_agent.py:9890-9897`), where multiple callbacks' `{context: "..."}` returns are joined with `"\n\n"`.
- **v1 implication:** Hermes cannot deliver a notification at session start through the existing `on_session_start` hook channel. Future option: register a `pre_llm_call` hook with framework-side `session_id`-keyed dedup (fire only on first turn of each session). Out of scope for v1.

### Cursor — closed source

- `~/.cursor/hooks.json` accepts an array of commands per `sessionStart` — config shape supports multiple hooks.
- Cursor 1.7+ docs describe `additional_context` as a single string field. Docs are silent on multi-hook merging behavior and stderr handling. No source available to verify.
- **v1 implication:** behavior unknown; ship a stub. Verify via the runnable probe in `probe/probe-cursor.js` when prioritized.

## v1 delivery summary

The only agent that can deliver a notification as a *separate* context block (per the user's "but not DEEPLAKE MEMORY, HIVEMIND" requirement) is **Claude Code**. v1 ships:

- Real Claude Code adapter — second hook command, own `additionalContext`.
- No-op stubs for Codex, Cursor, Hermes — framework is wired, but `emit()` does nothing for those agents. Each stub file documents the constraint that blocks real delivery and the deferred design (inline-append for Codex/Cursor; `pre_llm_call`+dedup for Hermes).

## Probes

`probe/` contains runnable verification scripts for each agent. They no-op unless `HIVEMIND_NOTIFICATION_PROBE=1` is set. See `probe/README.md` for wiring instructions. Phase 0 closed without running them in live Codex/Cursor/Hermes sessions because the source-level read already established that multi-hook block separation is not a viable strategy for those agents.
