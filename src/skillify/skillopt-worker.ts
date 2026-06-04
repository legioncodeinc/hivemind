#!/usr/bin/env node
/**
 * Detached weekly SkillOpt worker (spawned by skillopt-trigger). Runs the loop ONCE:
 *   1. detect a deficient skill (behavioral: sessions that loaded it still scored low)
 *   2. optimizer proposes a bounded edit (v2)
 *   3. real-rollout gate: keep v2 only if it measurably beats v1
 *   4. silent canary publish + post-publish monitor / auto-revert
 *
 * Uses the user's own agent (claude -p / codex), so no org API key. Runs in the background; the
 * user never notices. HIVEMIND_SKILLOPT_WORKER=1 is set by the trigger as a recursion guard.
 *
 * STATUS: scaffold. Steps 1/3/4 depend on prerequisites not yet shipped (deployed attribution data
 * for detection + monitoring, and a local rollout sandbox). The loop ENGINE (rollout->optimize->gate)
 * is prototyped in experiments/skillopt-spike (skillopt-loop.ts, validated both directions). This
 * entry exists so the trigger has a real, spawnable target and the wiring is testable end to end.
 */
import { log as _log } from "../utils/debug.js";

const log = (m: string) => _log("skillopt-worker", m);

async function main(): Promise<void> {
  log("skillopt worker started (detached, weekly)");
  // TODO(skillopt): wire the validated loop engine here once prerequisites land:
  //   const skill = await detectDeficientSkill();        // needs deployed attribution + satisfaction
  //   if (!skill) { log("no deficient skill found"); return; }
  //   const v2 = await optimize(skill);                   // optimizer proposes a bounded edit
  //   const gain = await gateViaRealRollout(skill, v2);   // keep only if v2 beats v1 (validated)
  //   if (gain > THRESHOLD) await canaryPublish(skill, v2); // silent; monitor + auto-revert
  log("skillopt worker: loop body not yet enabled (prerequisites pending) — exiting cleanly");
}

main().catch((e) => { log(`fatal (swallowed): ${(e as Error)?.message ?? e}`); process.exit(0); });
