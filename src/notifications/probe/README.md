# SessionStart channel probes

Each `probe-{agent}.js` is a standalone hook script that writes a unique stdout token (in the agent's native shape) and a unique stderr token, then exits. Gated by `HIVEMIND_NOTIFICATION_PROBE=1` — safe no-op otherwise.

## Quick smoke (no agent needed)

```bash
echo '{"session_id":"smoke"}' | HIVEMIND_NOTIFICATION_PROBE=1 node src/notifications/probe/probe-claude-code.js
```

You should see a `PROBE_STDERR_*` line on stderr and a JSON `PROBE_STDOUT_*` line on stdout.

## Wire as a real SessionStart hook (one agent at a time)

The point is to confirm each agent's harness renders multiple SessionStart hook commands as **separate** context blocks (not concatenated with the existing hivemind block).

### Claude Code

Already empirically verified — see `AGENT_CHANNELS.md`. To re-verify, append to `~/.claude/plugins/.../hooks/hooks.json` `SessionStart[0].hooks[]`:

```json
{ "type": "command", "command": "node /absolute/path/to/probe-claude-code.js", "timeout": 5 }
```

Set `HIVEMIND_NOTIFICATION_PROBE=1` in the shell, start a new Claude session, observe two distinct `<system-reminder>` blocks (the existing DEEPLAKE MEMORY one + the probe's `PROBE_STDOUT_*` one).

### Codex

Append to `~/.codex/hooks.json` `SessionStart[0].hooks[]` (same shape as Claude Code), then `HIVEMIND_NOTIFICATION_PROBE=1 codex ...`.

### Cursor

Append to `~/.cursor/hooks.json` `sessionStart[]` (top-level array, no nested `hooks`):

```json
{ "type": "command", "command": "node /absolute/path/to/probe-cursor.js", "timeout": 5 }
```

Restart Cursor with the env var set.

### Hermes

Append under `hooks.on_session_start:` in `~/.hermes/config.yaml`:

```yaml
  on_session_start:
    - command: node /home/ubuntu/.hermes/hivemind/bundle/session-start.js
      timeout: 30
    - command: node /absolute/path/to/probe-hermes.js
      timeout: 5
```

Then `HIVEMIND_NOTIFICATION_PROBE=1 hermes chat`.

## What "pass" means

For each agent: the probe's `PROBE_STDOUT_*` token must appear as its **own block** in the model's context — not concatenated into the same block as the existing hivemind DEEPLAKE MEMORY content. After a passing run, update the matching row in `AGENT_CHANNELS.md`.
