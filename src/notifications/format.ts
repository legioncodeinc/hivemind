/**
 * Agent-agnostic plain-text rendering. Per-agent delivery adapters wrap
 * this output in the agent's native context-injection shape (additionalContext,
 * developer-context plain text, additional_context, context).
 *
 * Anti-pattern rule (project convention): the renderer's OWN TEMPLATE must
 * never embed the strings "DEEPLAKE MEMORY" or "HIVEMIND". Those belong to
 * the existing boilerplate block emitted by session-start.js, and the
 * notification surface is intentionally distinct. The unit test asserts
 * the renderer doesn't accidentally inject these tokens via formatting.
 *
 * NOTE: This is NOT a content-sanitation guard. Notification content
 * (title/body) flows through verbatim — admins are trusted to write sensible
 * copy. If we ever surface customer-controllable text, add a sanitation
 * pass at the source (admin endpoint), not at render time.
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
