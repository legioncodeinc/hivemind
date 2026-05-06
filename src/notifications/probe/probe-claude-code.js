#!/usr/bin/env node
// Phase-0 probe: confirms a SECOND SessionStart hook command in Claude Code
// produces its own visible additionalContext block, separate from the existing
// hivemind block. Gated by HIVEMIND_NOTIFICATION_PROBE=1 — safe no-op otherwise.

import { randomUUID } from "node:crypto";

if (process.env.HIVEMIND_NOTIFICATION_PROBE !== "1") {
  process.exit(0);
}

// Drain stdin so Claude Code's writer doesn't EPIPE.
let _ignored = "";
process.stdin.on("data", (chunk) => { _ignored += chunk.toString(); });
process.stdin.on("end", () => {
  const stdoutToken = `PROBE_STDOUT_${randomUUID()}`;
  const stderrToken = `PROBE_STDERR_${randomUUID()}`;
  process.stderr.write(`${stderrToken}: if you see this on screen, stderr is visible at SessionStart\n`);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `${stdoutToken}\n\nIf you (the model) see this as a SEPARATE system-reminder from the hivemind one, multi-command separation works.`,
    },
  }));
});
