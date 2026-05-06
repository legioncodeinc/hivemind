/**
 * Claude Code: emit JSON { hookSpecificOutput: { hookEventName, additionalContext } }.
 * The harness lifts each hook command's stdout into its own <system-reminder>,
 * so this emission appears as a separate block from the existing
 * session-start.js memory/hivemind one. Empirically verified — see
 * AGENT_CHANNELS.md row "Claude Code".
 *
 * Wired as a second SessionStart hook command in claude-code/hooks/hooks.json
 * (entry point: src/hooks/session-notifications.ts → bundle/session-notifications.js).
 */

export function emitClaudeCode(rendered: string): void {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: rendered,
    },
  }));
}
