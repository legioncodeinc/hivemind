/**
 * Primary session-start banner — picks ONE notification to show, based on
 * priority. The session-start surface is a push channel with room for a
 * single message; this function decides which one.
 *
 * Priority (this PR):
 *
 *   1. Savings recap        — when org-wide tokens saved > 1M
 *   2. Welcome              — default for any logged-in user
 *
 * (Future) A higher-priority "team minted skill X" backend push will sit
 * above the savings recap. Backend pushes today still fire from
 * sources/backend.ts independently — that wiring will collapse under this
 * priority model in a follow-up PR.
 *
 * Savings formula (same as the prior local-usage source):
 *
 *   Y = memorySearchBytes / 4               tokens (what hivemind delivered)
 *   X = 1.7 · Y                             tokens (counterfactual w/o hivemind)
 *   Z = X − Y = 0.7 · Y                     tokens saved
 *
 * The 1.7× multiplier is the published LoCoMo benchmark ratio
 * (deeplake.ai/hivemind, Claude Haiku via `claude -p`, hybrid retrieval).
 * The 4-bytes/token conversion is the BPE rule-of-thumb; `~` in the
 * rendered headline signals approximation.
 *
 * Both branches dedupKey on `{session: sessionId}` so the two parallel
 * SessionStart hook registrations collapse to one emission per real
 * session via the atomic claim file, while each new session re-fires.
 *
 * Failure mode: any unexpected error returns null — the SessionStart
 * hook continues unaffected.
 */

import type { Credentials } from "../../commands/auth-creds.js";
import type { Notification } from "../types.js";
import { fetchOrgStats, type OrgStats } from "./org-stats.js";
import { countUserGeneratedSkills, readUsageRecords, sumMetric } from "../usage-tracker.js";
import { log as _log } from "../../utils/debug.js";

const log = (msg: string) => _log("notifications-primary-banner", msg);

/** Industry rule-of-thumb conversion for BPE tokenizers (Claude/GPT). */
const BYTES_PER_TOKEN = 4;

/** Published LoCoMo benchmark ratio: claude -p with hivemind uses 1/1.7 of
 *  the tokens vs without hivemind on the same QA task. We use this ratio
 *  to estimate the "would-have-spent" tokens for context hivemind delivered. */
const SAVINGS_MULTIPLIER = 1.7;

/** Tokens-saved threshold above which the savings recap replaces the
 *  welcome banner. Below this, the displayed savings number reads as
 *  rounding-error and "your team saved a few hundred tokens" feels worse
 *  than just a friendly welcome. */
const MEANINGFUL_SAVINGS_TOKENS = 1_000_000;

/** Skip the "you contributed ~X saved" segment when the user's own
 *  contribution is below this many bytes — keeps the banner from reading
 *  "you contributed ~0 saved" for org members who haven't used hivemind
 *  themselves yet. 4_000 bytes ≈ 1k tokens with the BPE rule-of-thumb. */
const MIN_USER_BYTES_FOR_CONTRIBUTION_LINE = 4_000;

/** 1234 → "1.2k", 12345 → "12.3k", 1234567 → "1.2M". Caller prepends `~`. */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return `${Math.round(n)}`;
  if (n < 100000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1000000).toFixed(1)}M`;
}

/** Plain integer commafier: 42000 → "42,000". Used in the body line. */
function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function bytesToSavedTokens(bytes: number): number {
  const y = bytes / BYTES_PER_TOKEN;
  return (SAVINGS_MULTIPLIER - 1) * y;
}

/** Sum local jsonl records into the same bytes-saved-tokens shape as
 *  org-stats — used when the server is unreachable so the threshold gate
 *  still works in offline mode. Returns 0 on any read/parse failure. */
function localSavedTokens(): number {
  try {
    const records = readUsageRecords();
    if (records.length === 0) return 0;
    const bytes = sumMetric(records, "memorySearchBytes");
    return bytesToSavedTokens(bytes);
  } catch (e: any) {
    log(`localSavedTokens threw: ${e?.message ?? String(e)}`);
    return 0;
  }
}

/**
 * Decide and render the one session-start banner. Returns null when there
 * is nothing meaningful to show (no creds, no sessionId, or unexpected
 * error). The drainer combines this with other notification streams
 * (backend pushes, queue items) — those remain additive in this PR.
 */
export async function pickPrimaryBanner(
  sessionId: string | undefined,
  creds: Credentials | null | undefined,
): Promise<Notification | null> {
  if (!sessionId) {
    // Without a per-session dedupKey, the two parallel hook fires can't
    // collapse to one — better to render nothing than to double-fire.
    return null;
  }
  if (!creds?.token) {
    // Not logged in — no welcome, no savings.
    return null;
  }

  const orgStats = await fetchOrgStats(creds ?? null);
  const tokensSaved = orgStats != null
    ? bytesToSavedTokens(orgStats.org.memorySearchBytes)
    : localSavedTokens();

  if (tokensSaved > MEANINGFUL_SAVINGS_TOKENS) {
    return orgStats != null
      ? renderOnlineSavings(sessionId, orgStats, creds.userName)
      : renderOfflineSavings(sessionId, creds.userName);
  }
  return renderWelcome(sessionId, creds);
}

/** "🐝 Welcome back, kamo.aghbalyan / Connected to org mind (workspace default)."
 *  Same content as the prior welcome rule (src/notifications/rules/welcome.ts);
 *  the dedupKey is the only behavior change — session-scoped, refires every
 *  session, rather than savedAt-scoped (which dedup'd until next login). */
function renderWelcome(sessionId: string, creds: Credentials): Notification {
  // Personalization is optional. If creds.userName is missing (malformed
  // credentials.json — rare), drop the comma-clause rather than fall back
  // to a generic "there" that reads awkwardly. If creds.orgName is missing,
  // say "your organization" rather than expose the orgId UUID — UUIDs are
  // unreadable to humans and worse UX than no label at all.
  const title = creds.userName
    ? `Welcome back, ${creds.userName}`
    : "Welcome back";
  const orgPhrase = creds.orgName ? `org ${creds.orgName}` : "your organization";
  const workspace = creds.workspaceId ?? "default";
  return {
    id: "welcome",
    severity: "info",
    title,
    body: `Connected to ${orgPhrase} (workspace ${workspace}).`,
    dedupKey: { session: sessionId },
  };
}

/** "🐝 Hivemind has saved your team ~5.2M tokens
 *      42,000 memory recalls · across 187 sessions · you contributed ~140k saved" */
function renderOnlineSavings(
  sessionId: string,
  s: OrgStats,
  userName: string | undefined,
): Notification {
  const zOrg = bytesToSavedTokens(s.org.memorySearchBytes);
  const zUser = bytesToSavedTokens(s.user.memorySearchBytes);

  const title = `Hivemind has saved your team ~${formatTokens(zOrg)} tokens`;
  const segments = [
    `${formatCount(s.org.memoryRecallCount)} memory ${s.org.memoryRecallCount === 1 ? "recall" : "recalls"}`,
    `across ${formatCount(s.org.sessionsCount)} ${s.org.sessionsCount === 1 ? "session" : "sessions"}`,
  ];
  // Drop "you contributed" when the user's contribution is below ~1k
  // tokens — saves the org member who hasn't used hivemind themselves
  // from reading "you contributed ~0 saved" alongside the team total.
  if (s.user.memorySearchBytes >= MIN_USER_BYTES_FOR_CONTRIBUTION_LINE) {
    segments.push(`you contributed ~${formatTokens(zUser)} saved`);
  }
  // Skills the user has generated across all their projects — purely local
  // count. Append when non-zero to keep the cross-machine banner connected
  // to the user's own machine without leaking that this is a hybrid render.
  const skillsGenerated = countUserGeneratedSkills(userName);
  if (skillsGenerated > 0) {
    segments.push(`${skillsGenerated} ${skillsGenerated === 1 ? "skill" : "skills"} generated`);
  }
  const body = `   ${segments.join(" · ")}`;

  return {
    id: "savings-recap",
    severity: "info",
    title,
    body,
    dedupKey: { session: sessionId },
  };
}

/** Offline fallback when org-stats is unreachable but local jsonl shows
 *  more than 1M tokens saved. "Hivemind has saved you ~Xk tokens / N sessions
 *  · M memory searches · K skills generated" */
function renderOfflineSavings(
  sessionId: string,
  userName: string | undefined,
): Notification {
  const records = readUsageRecords();
  const memorySearchBytes = sumMetric(records, "memorySearchBytes");
  const zTokens = bytesToSavedTokens(memorySearchBytes);
  const sessionCount = records.length;
  const memorySearches = sumMetric(records, "memorySearchCount");
  const skillsGenerated = countUserGeneratedSkills(userName);

  const title = `Hivemind has saved you ~${formatTokens(zTokens)} tokens`;
  const segments = [
    `${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}`,
    `${memorySearches} memory ${memorySearches === 1 ? "search" : "searches"}`,
  ];
  if (skillsGenerated > 0) {
    segments.push(`${skillsGenerated} ${skillsGenerated === 1 ? "skill" : "skills"} generated`);
  }
  const body = `   ${segments.join(" · ")}`;

  return {
    id: "savings-recap",
    severity: "info",
    title,
    body,
    dedupKey: { session: sessionId },
  };
}
