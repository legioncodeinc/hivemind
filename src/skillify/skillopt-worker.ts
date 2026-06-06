#!/usr/bin/env node
/**
 * Detached, targeted SkillOpt worker (spawned by skillopt-trigger on a user reaction).
 * Given one session + one ORG skill X + the user's reaction, it:
 *   1. judges X's window against the reaction (the LLM is the only evaluator)
 *   2. if the task FAILED, reads X's current body, proposes a bounded edit, and
 *      publishes v+1 DIRECTLY to the org skills table — right then.
 *
 * Runs on the USER's own agent (claude/codex/hermes/cursor/pi) — no org key, cost lands
 * on the user. HIVEMIND_SKILLOPT_WORKER=1 is set by the trigger as a recursion guard.
 * Inputs come via env: HIVEMIND_SKILLOPT_{SESSION,SKILL,REACTION,AGENT}.
 */
import path from "node:path";
import { execSync } from "node:child_process";
import { log as _log } from "../utils/debug.js";
import { loadConfig } from "../config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { getStateDir } from "./state-dir.js";
import { agentModel, detectScorerAgent } from "./agent-model.js";
import { improveSkillIfFailed } from "./skillopt-improve.js";
import { loadMeta, appendMeta, priorEditSummaries, alreadyProposed, metaEntryFor } from "./skillopt-meta.js";
import { tryAcquireWorkerLock, releaseWorkerLock } from "./state.js";

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
  const sessionId = process.env.HIVEMIND_SKILLOPT_SESSION ?? "";
  const skillRef = process.env.HIVEMIND_SKILLOPT_SKILL ?? "";
  const reaction = process.env.HIVEMIND_SKILLOPT_REACTION ?? "";
  if (!sessionId || !skillRef) { log("no session/skill in env — nothing to do"); return; }

  const config = loadConfig();
  if (!config?.token) { log("no config/credentials — exiting"); return; }

  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
  const query = (sql: string) => api.query(sql) as Promise<Array<Record<string, unknown>>>;
  const now = new Date().toISOString();

  // Score on the USER's own agent (cost lands on them), not hardcoded claude — a
  // codex/hermes/cursor/pi user with no local `claude` still gets SkillOpt. The
  // judge/proposer run no-tools (untrusted reaction/transcript text in the prompt).
  const agent = detectScorerAgent();
  const agentBin = resolveAgentBin(agent);

  // Skill bodies come from the Deeplake `skills` table (org-wide source of truth), so
  // we can improve X even if it isn't installed on THIS machine. Optimizer memory
  // (meta) dedups edits across runs so a re-judged window doesn't re-publish.
  const metaFile = path.join(getStateDir(), "skillopt", "meta.jsonl");
  const metaCache = loadMeta(metaFile);

  // Serialize per-skill: the K=3 reactions spawn up to K workers for the SAME skill, and
  // two users can react to the same org skill at once. A per-skill lock lets only one
  // read-current-row + publish at a time, so two workers can't both publish a duplicate
  // version+1 (codex P2). The loser skips; a later worker re-reads the now-improved skill
  // → meta-dedup makes it a no-op. (Cross-MACHINE concurrency is still possible; the
  // append-only history preserves every version and a deterministic pull tie-breaker is a
  // sensible follow-up — but this removes the dominant same-machine multi-worker race.)
  const lockKey = `skillopt-improve-${skillRef.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  if (!tryAcquireWorkerLock(lockKey)) { log(`another worker is improving ${skillRef} — skipping`); return; }
  try {
    log(`judging ${skillRef} in ${sessionId} (agent=${agent})`);
    const r = await improveSkillIfFailed({
      query,
      sessionsTable: config.sessionsTableName,
      skillsTable: config.skillsTableName,
      workspaceId: config.workspaceId,
      sessionId,
      skillRef,
      reaction,
      judge: agentModel({ agent, role: "judge", bin: agentBin }),
      proposerModel: agentModel({ agent, role: "proposer", bin: agentBin }),
      collaborator: config.userName,
      now,
      prior: (n, a) => priorEditSummaries(metaCache, n, a),
      alreadyProposed: (n, a, edits) => alreadyProposed(metaCache, n, a, edits),
      recordEdit: (n, a, edits) => { const e = metaEntryFor(n, a, edits, now); appendMeta(metaFile, e); metaCache.push(e); },
    });

    if (r.improved) log(`improved ${skillRef} → v${r.version} (${r.reason})`);
    else if (r.failed) log(`${skillRef} failed but not improved: ${r.reason}`);
    else if (r.judged) log(`${skillRef} ok — no change (${r.reason})`);
    else log(`${skillRef} not judged: ${r.reason}`);
  } finally {
    releaseWorkerLock(lockKey);
  }
}

main().catch((e) => { log(`fatal (swallowed): ${(e as Error)?.message ?? e}`); process.exit(0); });
