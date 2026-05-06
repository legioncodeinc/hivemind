/**
 * Pull-based rule registry. Rules are pure functions evaluated on each drain
 * — no IO, no side effects. They get a NotificationContext (creds + current
 * dedup state) and return a Notification or null.
 *
 * Push-based ad-hoc notifications go through `enqueueNotification` in
 * queue.ts instead — the two streams are merged at drain time.
 */

import type { Rule, Trigger, NotificationContext, Notification } from "../types.js";

const RULES: Rule[] = [];

export function registerRule(rule: Rule): void {
  if (RULES.find(r => r.id === rule.id)) {
    throw new Error(`duplicate rule id: ${rule.id}`);
  }
  RULES.push(rule);
}

export function listRules(): readonly Rule[] {
  return RULES;
}

export function evaluateRules(trigger: Trigger, ctx: NotificationContext): Notification[] {
  const out: Notification[] = [];
  for (const r of RULES) {
    if (r.trigger !== trigger) continue;
    const result = r.evaluate(ctx);
    if (result) out.push(result);
  }
  return out;
}

/** Test-only: clear all registered rules. */
export function _resetRulesForTest(): void {
  RULES.length = 0;
}
