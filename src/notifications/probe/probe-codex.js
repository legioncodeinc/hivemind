#!/usr/bin/env node
// Phase-0 probe for Codex. Codex SessionStart expects plain text on stdout
// (JSON additionalContext is rejected by Codex 0.118+). Gated by
// HIVEMIND_NOTIFICATION_PROBE=1.

import { randomUUID } from "node:crypto";

if (process.env.HIVEMIND_NOTIFICATION_PROBE !== "1") {
  process.exit(0);
}

let _ignored = "";
process.stdin.on("data", (chunk) => { _ignored += chunk.toString(); });
process.stdin.on("end", () => {
  const stdoutToken = `PROBE_STDOUT_${randomUUID()}`;
  const stderrToken = `PROBE_STDERR_${randomUUID()}`;
  process.stderr.write(`${stderrToken}: if you see this on screen, stderr is visible at SessionStart\n`);
  process.stdout.write(`${stdoutToken}\n\nIf this appears as a SEPARATE developer-context entry from the hivemind one, multi-command separation works in Codex.\n`);
});
