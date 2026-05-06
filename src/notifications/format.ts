/**
 * Agent-agnostic plain-text rendering. Per-agent delivery adapters wrap
 * this output in the agent's native context-injection shape (additionalContext,
 * developer-context plain text, additional_context, context).
 *
 * Hard rule (per the project plan): the rendered text MUST NOT contain the
 * strings "DEEPLAKE MEMORY" or "HIVEMIND" — those belong to the existing
 * boilerplate block emitted by session-start.js, and notifications are an
 * intentionally distinct surface. The unit test asserts this anti-pattern.
 */

import type { Notification } from "./types.js";

const SEVERITY_PREFIX: Record<string, string> = {
  info: "🐝",
  warn: "⚠️",
  error: "🚨",
};

function renderOne(n: Notification): string {
  const prefix = SEVERITY_PREFIX[n.severity ?? "info"] ?? SEVERITY_PREFIX.info;
  return `${prefix} ${n.title}\n${n.body}`;
}

export function renderNotifications(items: Notification[]): string {
  if (items.length === 0) return "";
  return items.map(renderOne).join("\n\n");
}
