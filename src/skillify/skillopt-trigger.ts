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
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log as _log } from "../utils/debug.js";

const log = (m: string) => _log("skillopt-trigger", m);

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_FILE = path.join(os.homedir(), ".deeplake", "state", "skillopt", "state.json");

export interface SkillOptState {
  lastRun?: string; // ISO timestamp of the last (attempted) run
}

export function loadState(file: string = STATE_FILE): SkillOptState {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as SkillOptState;
  } catch {
    return {};
  }
}

export function saveState(s: SkillOptState, file: string = STATE_FILE): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(s));
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
}

export interface FireResult {
  fired: boolean;
  reason?: "disabled" | "in-worker" | "throttled" | "spawned";
}

/**
 * Decide + (if due) fire. Stamps lastRun BEFORE spawning so a crashing worker can't hot-loop
 * every session. Non-blocking; returns immediately.
 */
export function maybeFireSkillOpt(deps: FireDeps = {}): FireResult {
  const env = deps.env ?? process.env;
  // Default ON. Fires weekly for everyone; opt-out via HIVEMIND_SKILLOPT_DISABLED=1.
  if (env.HIVEMIND_SKILLOPT_DISABLED === "1") return { fired: false, reason: "disabled" };
  if (env.HIVEMIND_SKILLOPT_WORKER === "1") return { fired: false, reason: "in-worker" }; // recursion guard
  const now = deps.now ?? Date.now();
  const state = deps.state ?? loadState();
  if (!shouldFire(state.lastRun, now)) return { fired: false, reason: "throttled" };

  (deps.save ?? saveState)({ ...state, lastRun: new Date(now).toISOString() });
  (deps.spawnWorker ?? spawnWorker)();
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
