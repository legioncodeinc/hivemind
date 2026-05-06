/**
 * The one v1 rule. Fires on the first session after a fresh login (each time
 * `creds.savedAt` differs from the savedAt we recorded last time we showed
 * welcome). Dedup'd via state — exactly once per re-login.
 */

import type { Rule } from "../types.js";

export const welcomeRule: Rule = {
  id: "welcome",
  trigger: "session_start",
  evaluate({ creds }) {
    if (!creds?.token) return null;
    const userName = creds.userName ?? "there";
    // Fallback chain: orgName → orgId → "your org". The "your org" arm
    // guards against a malformed credentials.json where both fields are
    // missing — without it, the rendered body would contain "undefined".
    const orgName = creds.orgName ?? creds.orgId ?? "your org";
    const workspace = creds.workspaceId ?? "default";
    return {
      id: "welcome",
      severity: "info",
      title: `Welcome back, ${userName}`,
      body: `Connected to org ${orgName} (workspace ${workspace}).`,
      dedupKey: { savedAt: creds.savedAt },
    };
  },
};
