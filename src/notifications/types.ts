/**
 * Notification framework types. Trigger-agnostic by design — SessionStart is
 * the first delivery channel but the same Notification shape can be enqueued
 * from any code path (e.g. capture pipeline emitting a "summarization due"
 * nudge) and drained at the next available hook.
 */

import type { Credentials } from "../commands/auth-creds.js";

export type Severity = "info" | "warn" | "error";

export type Trigger = "session_start" | "ad_hoc";

export interface Notification {
  /** Stable identifier — e.g. "welcome", "summarization-due". */
  id: string;
  /** Default "info" if omitted by the rule. */
  severity?: Severity;
  /** Single line, ≤80 chars. */
  title: string;
  /** 1-3 plain-text lines, agent-readable. */
  body: string;
  /**
   * Identity used by dedup state. Two notifications with the same `id` but
   * different `dedupKey` will both fire (e.g. version-upgrade-0.7.5 today vs
   * version-upgrade-0.7.6 tomorrow). State stores `{ id → JSON.stringify(dedupKey) }`.
   */
  dedupKey: Record<string, unknown>;
}

export interface NotificationContext {
  agent: Agent;
  creds: Credentials | null;
  /** What dedup state already records as shown. Read-only inside rules. */
  state: NotificationsState;
}

export interface Rule {
  id: string;
  trigger: Trigger;
  /** Return null to skip, or a Notification to fire. Must be pure (no IO). */
  evaluate(ctx: NotificationContext): Notification | null;
}

export type Agent = "claude-code" | "codex" | "cursor" | "hermes";

export interface NotificationsState {
  /** id → { dedupKey JSON, ISO timestamp shown }. */
  shown: Record<string, { dedupKey: string; shownAt: string }>;
}

export interface NotificationsQueue {
  queue: Notification[];
}
