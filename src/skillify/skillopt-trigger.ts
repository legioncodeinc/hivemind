/**
 * Weekly, user-side, SessionStart-triggered auto-firing of the SkillOpt loop.
 *
 * Mirrors the skillify worker pattern: at SessionStart we check a once-a-week throttle and, if due,
 * spawn a DETACHED background worker that runs the loop (detect a deficient skill -> optimizer
 * proposes a fix -> real-rollout gate -> silent publish). It uses the USER's own agent (claude -p /
 * codex), so no org API key is needed and cost lands on the user — exactly like skillify mining.
 *
 * SessionStart safety: this NEVER blocks. It does one cheap state read, optionally spawns a detached
 * + unref'd child, and returns. All failures swallowed. Opt-out: HIVEMIND_SKILLOPT_DISABLED=1.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log as _log } from "../utils/debug.js";
import { getStateDir } from "./state-dir.js";
import { tryAcquireWorkerLock, releaseWorkerLock } from "./state.js";

const log = (m: string) => _log("skillopt-trigger", m);

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Cross-process lock key arbitrating the weekly fire (see runWeeklySkillOpt). */
const LOCK_KEY = "skillopt-weekly";

/**
 * State file location. Computed lazily (NOT a module-level const) so a test or
 * caller that sets HIVEMIND_STATE_DIR — or swaps HOME between calls — actually
 * affects the path; a const would capture the real home at import time and
 * bypass isolation. Routes through the shared getStateDir() resolver so the
 * skillopt throttle honours the same override every other skillify sibling does.
 *
 * Nested under a `skillopt/` subdir (not a top-level `*.json` in getStateDir())
 * because `hivemind skillify status` enumerates every top-level `.json` there as
 * a tracked project; a bare `skillopt-state.json` would surface as a bogus
 * project with `undefined` fields. A subdirectory is skipped by that `.json`
 * filter while still living under the HIVEMIND_STATE_DIR-aware root.
 */
function stateFile(): string {
  return path.join(getStateDir(), "skillopt", "state.json");
}

export interface SkillOptState {
  lastRun?: string; // ISO timestamp of the last (attempted) run
}

export function loadState(file: string = stateFile()): SkillOptState {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as SkillOptState;
  } catch {
    return {};
  }
}

export function saveState(s: SkillOptState, file: string = stateFile()): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Atomic write: a torn state.json (write interrupted by a crash) would
    // parse-fail on next load and silently reset the weekly throttle. tmp +
    // rename makes the swap atomic on POSIX + Windows.
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s));
    fs.renameSync(tmp, file);
  } catch { /* swallow — SessionStart must not fail */ }
}

/** Pure, testable throttle: fire if never run, or if >= intervalMs since last run. */
export function shouldFire(lastRunIso: string | undefined, nowMs: number, intervalMs: number = WEEK_MS): boolean {
  if (!lastRunIso) return true;
  const last = Date.parse(lastRunIso);
  if (Number.isNaN(last)) return true;
  return nowMs - last >= intervalMs;
}

export interface FireDeps {
  now?: number;
  state?: SkillOptState;
  save?: (s: SkillOptState) => void;
  spawnWorker?: () => void;
  env?: NodeJS.ProcessEnv;
  tryLock?: () => boolean;            // cross-process arbiter; default: real worker lock
  releaseLock?: () => void;          // default: release the real worker lock
  reload?: () => SkillOptState;      // fresh state re-read INSIDE the lock; default: loadState
}

export interface FireResult {
  fired: boolean;
  reason?: "disabled" | "in-worker" | "throttled" | "locked" | "spawned";
}

/**
 * Decide + (if due) fire. Stamps lastRun BEFORE spawning so a crashing worker can't hot-loop
 * every session. Non-blocking; returns immediately.
 */
export function runWeeklySkillOpt(deps: FireDeps = {}): FireResult {
  const env = deps.env ?? process.env;
  // Default ON. Fires weekly for everyone; opt-out via HIVEMIND_SKILLOPT_DISABLED=1.
  if (env.HIVEMIND_SKILLOPT_DISABLED === "1") return { fired: false, reason: "disabled" };
  if (env.HIVEMIND_SKILLOPT_WORKER === "1") return { fired: false, reason: "in-worker" }; // recursion guard
  const now = deps.now ?? Date.now();
  const state = deps.state ?? loadState();
  // Cheap pre-lock check: skip the lock entirely when clearly throttled.
  if (!shouldFire(state.lastRun, now)) return { fired: false, reason: "throttled" };

  // Cross-process arbiter: two SessionStart hooks racing at the weekly boundary
  // could both pass the throttle and spawn duplicate workers (doubling user-side
  // cost once the worker does real LLM work). An atomic openSync(wx) worker-lock
  // lets exactly one win; the loser bails. The lock self-heals after maxAgeMs if
  // a process dies mid-fire — well under the weekly cadence, so it never wedges
  // the next fire.
  const acquired = (deps.tryLock ?? (() => tryAcquireWorkerLock(LOCK_KEY)))();
  if (!acquired) return { fired: false, reason: "locked" };
  try {
    // Re-check INSIDE the lock with freshly-read state: a racing process may have
    // stamped lastRun and released the lock between our pre-lock check and our
    // acquire. Without this the loser would still act on its stale snapshot and
    // spawn a second worker, defeating the lock. This makes the throttle atomic.
    const fresh = (deps.reload ?? loadState)();
    if (!shouldFire(fresh.lastRun, now)) return { fired: false, reason: "throttled" };
    (deps.save ?? saveState)({ ...fresh, lastRun: new Date(now).toISOString() });
    (deps.spawnWorker ?? spawnWorker)();
  } finally {
    (deps.releaseLock ?? (() => releaseWorkerLock(LOCK_KEY)))();
  }
  return { fired: true, reason: "spawned" };
}

/** Spawn the detached weekly worker. Failures swallowed. */
function spawnWorker(): void {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const entry = path.join(here, "skillopt-worker.js"); // bundled alongside this module
    const child = spawn(process.execPath, [entry], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, HIVEMIND_SKILLOPT_WORKER: "1" },
    });
    child.unref();
    log("spawned detached skillopt worker");
  } catch (e: unknown) {
    log(`spawn failed (swallowed): ${(e as Error)?.message ?? e}`);
  }
}
