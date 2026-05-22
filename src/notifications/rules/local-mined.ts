/**
 * Surfaces locally-mined skills to fresh, not-signed-in users — the
 * user-visible half of the "wow effect" pair. The not-logged-in branch of
 * session-start.ts already injects the same content into `additionalContext`
 * so the MODEL sees it; this rule turns it into a `systemMessage` so the
 * USER sees it in their terminal too, exactly like the welcome line shown
 * right after `hivemind login`.
 *
 * Two branches:
 *   1. A recent manifest entry carries an `insight` string → render the
 *      concrete-insight banner (the gate's quantified finding + the
 *      minted skill name + sign-in CTA). This is the conversion surface —
 *      a real pattern from the user's own work, not an abstract count.
 *   2. No insight available (legacy manifest, gate didn't emit one) →
 *      fall back to the legacy "🎉 N skills mined" copy. Behavior on
 *      pre-insight manifests is unchanged.
 *
 * Suppression: stays silent once creds are present (logged-in users see
 * the welcome rule instead) or when the manifest is absent / empty.
 *
 * Dedup: insight branch keys on skill_name + created_at so a new insight
 * refires next session; count branch keys on the integer count so an
 * incrementing N refires too.
 */

import type { Rule } from "../types.js";

export const localMinedRule: Rule = {
  id: "local-mined-surfaced",
  trigger: "session_start",
  evaluate({ creds, localSkillsCount, latestInsightEntry }) {
    if (creds?.token) return null;
    if (typeof localSkillsCount !== "number" || localSkillsCount <= 0) return null;

    // Concrete-insight branch — the surface the install→signup-conversion
    // play is built around. Only fires when the manifest has an entry
    // whose insight is non-empty (getLatestInsightEntry already filters
    // empty/whitespace, but the rule double-checks since a malformed
    // entry could slip a non-string through at the type-system boundary).
    const insight = typeof latestInsightEntry?.insight === "string"
      ? latestInsightEntry.insight.trim()
      : "";
    if (latestInsightEntry && insight.length > 0) {
      const name = latestInsightEntry.skill_name;
      return {
        id: "local-mined-surfaced",
        severity: "info",
        // format.ts prepends the severity icon (info → 🐝), so the title
        // itself stays icon-free — otherwise the rendered line shows
        // "🐝 🐝 Hivemind found..." (two bees, one from format, one from us).
        title: `Hivemind found a pattern in your past sessions`,
        body:
          `${insight}\n` +
          `Minted skill \`${name}\` to catch it next time — try \`claude -p '/${name} <your prompt>'\`.\n` +
          `Run 'hivemind login' to keep these skills across machines and share with your team.`,
        // Dedup on the entry's identity so a new insight refires next
        // session, while a re-run with the same entry still dedupes.
        dedupKey: { skill_name: name, created_at: latestInsightEntry.created_at },
      };
    }

    // Fallback — legacy "N skills mined" copy. Preserves the existing
    // user experience for manifests written before the insight field
    // landed, and for users whose gate calls didn't produce an insight.
    const noun = localSkillsCount === 1 ? "skill" : "skills";
    return {
      id: "local-mined-surfaced",
      severity: "info",
      title: `🎉 ${localSkillsCount} ${noun} mined from your local sessions`,
      body: `Run 'hivemind login' to share new mining results with your team.`,
      dedupKey: { count: localSkillsCount },
    };
  },
};
