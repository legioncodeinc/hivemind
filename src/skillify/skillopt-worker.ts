#!/usr/bin/env node
/**
 * Detached weekly SkillOpt worker (spawned by skillopt-trigger). Runs the cycle ONCE:
 *   1. detect deficient skills from real invocations (anchor + judge, windowed)
 *   2. ≥5 fire gate (act on a pattern, not noise)
 *   3. propose a bounded edit per deficient skill and write a REVIEW PROPOSAL
 *
 * It does NOT auto-publish: the offline gate isn't trustworthy (spike finding), so
 * live publish is reserved for the real-usage A/B (deferred). Runs on the user's own
 * agent (claude -p) — no org key, cost lands on the user — in the background, weekly.
 * HIVEMIND_SKILLOPT_WORKER=1 is set by the trigger as a recursion guard.
 */
import path from "node:path";
import { execSync } from "node:child_process";
import { log as _log } from "../utils/debug.js";
import { loadConfig } from "../config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { getStateDir } from "./state-dir.js";
import { runSkillOptCycle } from "./skillopt-engine.js";
import { agentModel, detectScorerAgent } from "./agent-model.js";
import { readCurrentSkillRow, publishImprovedSkill } from "./skill-org-publish.js";
import { runEventTick } from "./skillopt-tick.js";
import { anchoredOrgSkillsInSession } from "./skillopt-session-scan.js";
import { loadCounterState, saveCounterState, fireCount } from "./skillopt-counter.js";
import { loadMeta, appendMeta, priorEditSummaries, alreadyProposed, metaEntryFor } from "./skillopt-meta.js";

const log = (m: string) => _log("skillopt-worker", m);

/**
 * Resolve an agent's CLI via `command -v` — finds nvm/volta/fnm installs that
 * gate-runner's static-path findAgentBin misses (it deliberately avoids PATH for
 * the openclaw bundle). undefined → agentModel falls back to findAgentBin. Mirrors
 * the wiki spawn helpers' findXBin pattern (this worker is a standalone detached
 * process, not the openclaw-scanned skillify-worker, so `command -v` is fine here).
 */
const AGENT_CMD: Record<string, string> = { claude_code: "claude", codex: "codex", cursor: "cursor-agent", hermes: "hermes", pi: "pi" };
function resolveAgentBin(agent: string): string | undefined {
  try {
    const p = execSync(`command -v ${AGENT_CMD[agent] ?? agent}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return p || undefined;
  } catch { return undefined; }
}

async function main(): Promise<void> {
  log("skillopt worker started (detached, event-driven)");
  const config = loadConfig();
  if (!config?.token) { log("no config/credentials — exiting"); return; }

  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
  const query = (sql: string) => api.query(sql) as Promise<Array<Record<string, unknown>>>;
  // Skill bodies come from the Deeplake `skills` table — the ORG-WIDE source of
  // truth — not local disk. Detection is org-wide, so a deficient skill often
  // isn't installed on THIS machine; reading the table lets us improve it anyway
  // (and gives us the current version to bump on publish).
  const now = new Date().toISOString();
  // Score on the USER's own agent (cost lands on them), not hardcoded claude — a
  // codex/hermes/cursor/pi user with no local `claude` still gets SkillOpt. The
  // judge/proposer run no-tools (untrusted transcript text in the prompt).
  const agent = detectScorerAgent();
  const agentBin = resolveAgentBin(agent);
  log(`scoring on agent: ${agent}${agentBin ? ` (${agentBin})` : ""}`);
  const metaFile = path.join(getStateDir(), "skillopt", "meta.jsonl");
  const metaCache = loadMeta(metaFile);
  // Lookback + thresholds are env-tunable (defaults: 30-day window, the detector's
  // own min-n, and a ≥5-deficient fire gate). A positive override wins; anything
  // non-numeric/≤0 falls back to the default.
  const envNum = (k: string): number | undefined => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : undefined; };
  const lookbackDays = envNum("HIVEMIND_SKILLOPT_LOOKBACK_DAYS") ?? 30;
  const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // Event tick: when spawned for a specific session (the hook path), do the cheap
  // no-LLM pushback scan + counter FIRST and run the paid org cycle ONLY when a
  // skill crossed the fire threshold. A bare run (no session) is a manual/explicit
  // invocation that always proceeds to the cycle.
  const tickSession = process.env.HIVEMIND_SKILLOPT_SESSION;
  if (tickSession) {
    const tick = await runEventTick(tickSession, {
      scan: (sid) => anchoredOrgSkillsInSession(query, config.sessionsTableName, sid),
      loadState: loadCounterState,
      saveState: saveCounterState,
      now,
      threshold: fireCount(),
    });
    if (tick.toFire.length === 0) {
      log(`tick (${tickSession}): ${tick.observed} pushback(s), nothing crossed the fire threshold — no cycle`);
      return;
    }
    log(`tick (${tickSession}): fired by [${tick.toFire.join(", ")}] — running the org cycle`);
  }

  const res = await runSkillOptCycle({
    query,
    sessionsTable: config.sessionsTableName,
    readSkill: (name, author) => readCurrentSkillRow(query, config.skillsTableName, name, author),
    // Direct publish: land the improved body as the skill's next org version. No
    // approval gate — detect → improve → publish (append-only; teammates re-pull).
    // Reuses the row the cycle already read — no second read-after-write to disagree.
    publish: async (current, rec) => {
      const { version } = await publishImprovedSkill({
        query, tableName: config.skillsTableName, workspaceId: config.workspaceId,
        current, newBody: rec.candidateBody, collaborator: config.userName, now,
      });
      log(`published ${rec.name}--${rec.author} v${version} (${rec.confirmedFailures}/${rec.invocations} failures)`);
    },
    meta: {
      prior: (n, a) => priorEditSummaries(metaCache, n, a),
      has: (n, a, edits) => alreadyProposed(metaCache, n, a, edits),
      record: (n, a, edits) => { const e = metaEntryFor(n, a, edits, new Date().toISOString()); appendMeta(metaFile, e); metaCache.push(e); },
    },
    detector: {
      sinceIso, limit: 5000,
      minInvocations: envNum("HIVEMIND_SKILLOPT_MIN_INVOCATIONS"),
      failureRateThreshold: envNum("HIVEMIND_SKILLOPT_FAILURE_RATE"),
      judge: agentModel({ agent, role: "judge", bin: agentBin }),
    },
    proposer: { model: agentModel({ agent, role: "proposer", bin: agentBin }) },
    // Under event-firing the ≥N-deficient-SKILLS gate is redundant — the per-skill
    // counter already established the pattern, so improve whatever the org-wide judge
    // confirms deficient (default 1). A bare/manual run keeps the engine default.
    fireThreshold: envNum("HIVEMIND_SKILLOPT_FIRE_THRESHOLD") ?? (tickSession ? 1 : undefined),
    now,
  });

  if (!res.fired) {
    log(`skillopt: ${res.deficientCount} deficient skill(s) — below the fire gate, no action`);
  } else {
    const published = res.proposals.filter((p) => p.changed).length;
    log(`skillopt: fired — ${res.deficientCount} deficient, ${published} skill(s) published to the org table`);
  }
}

main().catch((e) => { log(`fatal (swallowed): ${(e as Error)?.message ?? e}`); process.exit(0); });
