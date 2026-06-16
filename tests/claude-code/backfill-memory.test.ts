/**
 * Unit tests for the memory-backfill orchestrator's pure logic:
 *   - parseBackfillArgs flag parsing
 *   - planFromSessions: window cutoff, in-flight skip, project filter,
 *     dedup vs staged, newest-first ordering, cap (+ --n all)
 *   - executeBackfill: bounded concurrency, wall-clock budget, tallying
 *
 * Filesystem/agent-detection and the real claude -p stager are injected
 * away, so these run fast and deterministically.
 */

import { describe, it, expect, vi } from "vitest";
import {
  parseBackfillArgs,
  planFromSessions,
  executeBackfill,
  renderPlan,
  runBackfillMemory,
  type BackfillOptions,
} from "../../src/commands/backfill-memory.js";
import type { SessionFile } from "../../src/skillify/local-source.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY; // arbitrary fixed epoch-ms

function sess(id: string, ageMs: number, opts: { inCwd?: boolean; agent?: SessionFile["agent"] } = {}): SessionFile {
  return {
    agent: opts.agent ?? "claude_code",
    path: `/s/${id}.jsonl`,
    mtime: NOW - ageMs,
    inCwd: opts.inCwd ?? false,
    sessionId: id,
  };
}

const baseOpts: BackfillOptions = {
  windowDays: 42,
  dryRun: false,
  force: false,
  projectOnly: false,
  maxSessions: 50,
  cwd: "/proj",
};

describe("parseBackfillArgs", () => {
  it("defaults", () => {
    const o = parseBackfillArgs([], "/proj");
    expect(o).toMatchObject({ windowDays: 42, dryRun: false, force: false, projectOnly: false, maxSessions: 50 });
  });
  it("flags", () => {
    const o = parseBackfillArgs(["--dry-run", "--force", "--project-only", "--window-days", "7", "--n", "10"], "/proj");
    expect(o).toMatchObject({ dryRun: true, force: true, projectOnly: true, windowDays: 7, maxSessions: 10 });
  });
  it("--n all lifts the cap", () => {
    expect(parseBackfillArgs(["--n", "all"], "/proj").maxSessions).toBeNull();
  });
  it("ignores invalid numbers", () => {
    const o = parseBackfillArgs(["--window-days", "-5", "--n", "0"], "/proj");
    expect(o.windowDays).toBe(42); // unchanged
    expect(o.maxSessions).toBe(50); // unchanged
  });
});

describe("planFromSessions", () => {
  it("drops sessions older than the window", () => {
    const all = [sess("old", 50 * DAY), sess("fresh", 10 * DAY)];
    const plan = planFromSessions(all, new Set(), baseOpts, NOW);
    expect(plan.toExtract.map((s) => s.sessionId)).toEqual(["fresh"]);
  });

  it("skips in-flight (live) sessions modified within 60s", () => {
    const all = [sess("live", 30_000), sess("done", 10 * DAY)];
    const plan = planFromSessions(all, new Set(), baseOpts, NOW);
    expect(plan.toExtract.map((s) => s.sessionId)).toEqual(["done"]);
  });

  it("orders newest-first and the cap keeps the newest", () => {
    const all = [sess("a", 5 * DAY), sess("b", 1 * DAY), sess("c", 3 * DAY)];
    const plan = planFromSessions(all, new Set(), { ...baseOpts, maxSessions: 2 }, NOW);
    expect(plan.toExtract.map((s) => s.sessionId)).toEqual(["b", "c"]); // newest two
    expect(plan.skippedByCap).toBe(1);
  });

  it("dedups against already-staged ids (composite agent-id keys)", () => {
    const all = [sess("a", 1 * DAY), sess("b", 2 * DAY)];
    // Staged set holds the composite key the stager writes (agent-sessionId).
    const plan = planFromSessions(all, new Set(["claude_code-a"]), baseOpts, NOW);
    expect(plan.alreadyStaged.map((s) => s.sessionId)).toEqual(["a"]);
    expect(plan.toExtract.map((s) => s.sessionId)).toEqual(["b"]);
  });

  it("does not dedup when only the bare stem matches a different agent", () => {
    // Same stem "x" under two agents must NOT collide: codex-x staged should
    // not suppress claude_code-x.
    const all = [sess("x", 1 * DAY, { agent: "claude_code" })];
    const plan = planFromSessions(all, new Set(["codex-x"]), baseOpts, NOW);
    expect(plan.toExtract.map((s) => s.sessionId)).toEqual(["x"]);
    expect(plan.alreadyStaged).toHaveLength(0);
  });

  it("--force ignores the staged set", () => {
    const all = [sess("a", 1 * DAY)];
    const plan = planFromSessions(all, new Set(["claude_code-a"]), { ...baseOpts, force: true }, NOW);
    expect(plan.toExtract.map((s) => s.sessionId)).toEqual(["a"]);
    expect(plan.alreadyStaged).toHaveLength(0);
  });

  it("project-only keeps only inCwd sessions", () => {
    const all = [sess("here", 1 * DAY, { inCwd: true }), sess("elsewhere", 1 * DAY, { inCwd: false })];
    const plan = planFromSessions(all, new Set(), { ...baseOpts, projectOnly: true }, NOW);
    expect(plan.toExtract.map((s) => s.sessionId)).toEqual(["here"]);
  });

  it("--n all keeps every eligible session and reports byAgent", () => {
    const all = [
      sess("a", 1 * DAY, { agent: "claude_code" }),
      sess("b", 2 * DAY, { agent: "codex" }),
      sess("c", 3 * DAY, { agent: "codex" }),
    ];
    const plan = planFromSessions(all, new Set(), { ...baseOpts, maxSessions: null }, NOW);
    expect(plan.toExtract).toHaveLength(3);
    expect(plan.skippedByCap).toBe(0);
    expect(plan.byAgent).toEqual({ claude_code: 1, codex: 2 });
  });
});

describe("runBackfillMemory (dry-run wrapper)", () => {
  it("dry-run prints the plan and returns 0 without extracting", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const code = await runBackfillMemory(["--dry-run", "--n", "1"]);
      expect(code).toBe(0);
      const printed = spy.mock.calls.map((c) => String(c[0])).join("");
      expect(printed).toContain("DRY RUN");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("renderPlan", () => {
  it("renders the dry-run report with cap + by-agent + over-cap note", () => {
    const all = [
      sess("a", 1 * DAY, { agent: "claude_code" }),
      sess("b", 2 * DAY, { agent: "codex" }),
      sess("c", 3 * DAY, { agent: "codex" }),
    ];
    const opts = { ...baseOpts, dryRun: true, maxSessions: 2 };
    const out = renderPlan(planFromSessions(all, new Set(), opts, NOW), opts);
    expect(out).toContain("DRY RUN");
    expect(out).toContain("last 42 days");
    expect(out).toContain("to extract:    2 (1 over cap, newest kept)");
    expect(out).toMatch(/by agent:.*claude_code=1.*codex=1/);
  });

  it("shows cap 'none' for --n all and omits the over-cap note", () => {
    const opts = { ...baseOpts, maxSessions: null };
    const out = renderPlan(planFromSessions([sess("a", DAY)], new Set(), opts, NOW), opts);
    expect(out).toContain("cap:           none (--n all)");
    expect(out).not.toContain("over cap");
  });
});

describe("executeBackfill", () => {
  const opts = (over: Partial<Parameters<typeof executeBackfill>[1]> = {}) => ({
    concurrency: 4,
    budgetMs: 10_000,
    perSessionTimeoutMs: 1000,
    cwd: "/proj",
    startMs: 0,
    now: () => 0,
    ...over,
  });

  it("tallies staged / embedded / failed", async () => {
    const items = [sess("a", DAY), sess("b", DAY), sess("c", DAY)];
    const stage = async (s: SessionFile) => {
      if (s.sessionId === "a") return { ok: true, embedded: true };
      if (s.sessionId === "b") return { ok: true, embedded: false };
      return { ok: false, embedded: false };
    };
    const r = await executeBackfill(items, opts({ stage }));
    expect(r).toMatchObject({ attempted: 3, staged: 2, embedded: 1, failed: 1, timedOutOnBudget: false });
  });

  it("counts a stager that throws as failed and continues the queue", async () => {
    const items = [sess("a", DAY), sess("b", DAY), sess("c", DAY)];
    const stage = async (s: SessionFile) => {
      if (s.sessionId === "b") throw new Error("stager boom");
      return { ok: true, embedded: false };
    };
    const r = await executeBackfill(items, opts({ stage }));
    expect(r).toMatchObject({ attempted: 3, staged: 2, failed: 1, timedOutOnBudget: false });
  });

  it("respects the wall-clock budget and flags it", async () => {
    const items = [sess("a", DAY), sess("b", DAY), sess("c", DAY)];
    // Clock jumps past the deadline after the first dequeue.
    let t = 0;
    const now = () => (t += 6000); // 0+? first check returns 6000 (< deadline 10000), then 12000 (>=)
    const seen: string[] = [];
    const stage = async (s: SessionFile) => { seen.push(s.sessionId); return { ok: true, embedded: false }; };
    const r = await executeBackfill(items, opts({ stage, now, concurrency: 1, budgetMs: 10_000, startMs: 0 }));
    expect(r.timedOutOnBudget).toBe(true);
    expect(seen.length).toBeLessThan(3); // stopped early
  });

  it("caps concurrency at min(concurrency, items)", async () => {
    const items = Array.from({ length: 6 }, (_, i) => sess(`s${i}`, DAY));
    let inFlight = 0;
    let peak = 0;
    const stage = async () => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { ok: true, embedded: false };
    };
    const r = await executeBackfill(items, opts({ stage, concurrency: 2 }));
    expect(r.staged).toBe(6);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
