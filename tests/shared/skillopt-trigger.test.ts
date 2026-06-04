import { describe, it, expect, vi } from "vitest";
import { shouldFire, maybeFireSkillOpt, WEEK_MS } from "../../src/skillify/skillopt-trigger.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_900_000_000_000; // fixed clock

describe("shouldFire (weekly throttle)", () => {
  it("fires when never run (no timestamp)", () => {
    expect(shouldFire(undefined, NOW)).toBe(true);
  });
  it("fires when the timestamp is unparseable", () => {
    expect(shouldFire("not-a-date", NOW)).toBe(true);
  });
  it("does NOT fire <7 days since last run", () => {
    expect(shouldFire(new Date(NOW - 1 * DAY).toISOString(), NOW)).toBe(false);
    expect(shouldFire(new Date(NOW - 6.9 * DAY).toISOString(), NOW)).toBe(false);
  });
  it("fires at exactly the weekly boundary and beyond", () => {
    expect(shouldFire(new Date(NOW - WEEK_MS).toISOString(), NOW)).toBe(true);
    expect(shouldFire(new Date(NOW - 8 * DAY).toISOString(), NOW)).toBe(true);
  });
});

describe("maybeFireSkillOpt (auto-fire decision)", () => {
  function harness(over: Partial<Parameters<typeof maybeFireSkillOpt>[0]> = {}) {
    const saved: unknown[] = [];
    const spawn = vi.fn();
    const res = maybeFireSkillOpt({
      now: NOW,
      save: (s) => saved.push(s),
      spawnWorker: spawn,
      env: {} as NodeJS.ProcessEnv, // default ON
      ...over,
    });
    return { res, saved, spawn };
  }

  it("fires on first run: spawns the worker exactly once and stamps lastRun=now", () => {
    const { res, saved, spawn } = harness({ state: {} });
    expect(res.fired).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1); // exactly one spawn
    expect(saved).toEqual([{ lastRun: new Date(NOW).toISOString() }]); // stamped before spawn
  });

  it("fires when last run was 8 days ago", () => {
    const { res, spawn } = harness({ state: { lastRun: new Date(NOW - 8 * DAY).toISOString() } });
    expect(res.fired).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire (and does not spawn) when throttled (1 day ago)", () => {
    const { res, saved, spawn } = harness({ state: { lastRun: new Date(NOW - 1 * DAY).toISOString() } });
    expect(res).toEqual({ fired: false, reason: "throttled" });
    expect(spawn).not.toHaveBeenCalled();
    expect(saved).toEqual([]); // no state write when throttled
  });

  it("respects the kill switch HIVEMIND_SKILLOPT_DISABLED=1", () => {
    const { res, spawn } = harness({ state: {}, env: { HIVEMIND_SKILLOPT_DISABLED: "1" } as NodeJS.ProcessEnv });
    expect(res).toEqual({ fired: false, reason: "disabled" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("does not recurse: a run inside the worker (HIVEMIND_SKILLOPT_WORKER=1) never fires again", () => {
    const { res, spawn } = harness({ state: {}, env: { HIVEMIND_SKILLOPT_WORKER: "1" } as NodeJS.ProcessEnv });
    expect(res).toEqual({ fired: false, reason: "in-worker" });
    expect(spawn).not.toHaveBeenCalled();
  });
});
