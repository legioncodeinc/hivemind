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
import os from "node:os";
import path from "node:path";
import { log as _log } from "../utils/debug.js";
import { loadConfig } from "../config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { getStateDir } from "./state-dir.js";
import { runSkillOptCycle, writeProposalToDisk, readSkillBodyFromDisk } from "./skillopt-engine.js";
import { loadMeta, appendMeta, priorEditSummaries, alreadyProposed, metaEntryFor } from "./skillopt-meta.js";

const log = (m: string) => _log("skillopt-worker", m);

async function main(): Promise<void> {
  log("skillopt worker started (detached, weekly)");
  const config = loadConfig();
  if (!config?.token) { log("no config/credentials — exiting"); return; }

  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
  const query = (sql: string) => api.query(sql) as Promise<Array<Record<string, unknown>>>;
  const skillsRoot = path.join(os.homedir(), ".claude", "skills");
  const proposalsRoot = path.join(getStateDir(), "skillopt", "proposals");
  const metaFile = path.join(getStateDir(), "skillopt", "meta.jsonl");
  const metaCache = loadMeta(metaFile);
  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30-day lookback

  const res = await runSkillOptCycle({
    query,
    sessionsTable: config.sessionsTableName,
    readSkillBody: (name, author) => readSkillBodyFromDisk(skillsRoot, name, author),
    writeProposal: (rec) => writeProposalToDisk(proposalsRoot, rec),
    meta: {
      prior: (n, a) => priorEditSummaries(metaCache, n, a),
      has: (n, a, edits) => alreadyProposed(metaCache, n, a, edits),
      record: (n, a, edits) => { const e = metaEntryFor(n, a, edits, new Date().toISOString()); appendMeta(metaFile, e); metaCache.push(e); },
    },
    detector: { sinceIso, limit: 5000 },
    now: new Date().toISOString(),
  });

  if (!res.fired) {
    log(`skillopt: ${res.deficientCount} deficient skill(s) — below the fire gate, no action`);
  } else {
    const changed = res.proposals.filter((p) => p.changed).length;
    log(`skillopt: fired — ${res.deficientCount} deficient, ${changed} edit proposal(s) written to ${proposalsRoot}`);
  }
}

main().catch((e) => { log(`fatal (swallowed): ${(e as Error)?.message ?? e}`); process.exit(0); });
