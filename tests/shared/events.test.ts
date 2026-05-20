import { describe, expect, it, vi } from "vitest";
import {
  appendEvent,
  computeCurrent,
  computeAllForTask,
} from "../../src/events/index.js";

/**
 * Mock query helper — same shape as the rules/tasks/skills tests.
 * Captures every SQL string for shape + count assertions.
 */
function mockQuery(script: Array<(sql: string) => unknown>) {
  const calls: string[] = [];
  let step = 0;
  const query = vi.fn(async (sql: string) => {
    calls.push(sql);
    if (step < script.length) {
      const out = script[step++](sql);
      return Array.isArray(out) ? (out as Array<Record<string, unknown>>) : [];
    }
    return [];
  });
  return { calls, query };
}

const TBL = "hivemind_task_events";

// ── appendEvent ─────────────────────────────────────────────────────────────

describe("appendEvent", () => {
  it("INSERTs a single row with all required fields", async () => {
    const { calls, query } = mockQuery([() => []]);
    const result = await appendEvent(query, TBL, {
      task_id: "task-uuid",
      task_version: 1,
      kpi_id: "k_abc",
      value: 1,
      note: "merged PR #42",
      source: "auto-extract",
      agent: "claude_code",
    });
    expect(result.id).toMatch(/^[0-9a-f]{8}-/);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^INSERT INTO "hivemind_task_events"/);
    expect(calls[0]).toContain("'task-uuid'");
    expect(calls[0]).toContain("'k_abc'");
    expect(calls[0]).toContain(", 1, ");  // task_version (positional)
    expect(calls[0]).toContain("'auto-extract'");
    expect(calls[0]).toContain("'claude_code'");
    expect(calls[0]).toContain(`E'merged PR #42'`);
  });

  it("uses E-string for the note (defends against quotes/backslashes)", async () => {
    const { calls, query } = mockQuery([() => []]);
    await appendEvent(query, TBL, {
      task_id: "t", task_version: 1, value: 1, source: "user",
      note: "don't push '--force' \\ ever",
    });
    expect(calls[0]).toContain(`E'don''t push ''--force'' \\\\ ever'`);
  });

  it("defaults kpi_id, note, agent, plugin_version to empty strings when omitted", async () => {
    const { calls, query } = mockQuery([() => []]);
    await appendEvent(query, TBL, {
      task_id: "t", task_version: 1, value: 1, source: "user",
    });
    // kpi_id, note (E-prefixed), agent, plugin_version all blank
    const sql = calls[0];
    // 5 empty single-quoted strings (kpi_id + agent + plugin_version + E'' note) + 'user' source
    expect(sql).toContain("'user'");
    expect(sql).toContain(`E''`);                    // empty note
    const blanks = sql.match(/''(?!')/g) ?? [];      // ignore the doubled '' inside E-strings
    expect(blanks.length).toBeGreaterThanOrEqual(3);
  });

  it("allows negative values (corrections)", async () => {
    const { calls, query } = mockQuery([() => []]);
    await appendEvent(query, TBL, {
      task_id: "t", task_version: 1, value: -1, source: "user", note: "undo",
    });
    expect(calls[0]).toContain(", -1, ");
  });

  it("rejects non-finite values (NaN / Infinity)", async () => {
    const { calls, query } = mockQuery([() => []]);
    await expect(appendEvent(query, TBL, {
      task_id: "t", task_version: 1, value: NaN, source: "user",
    })).rejects.toThrow(/must be finite/);
    await expect(appendEvent(query, TBL, {
      task_id: "t", task_version: 1, value: Infinity, source: "user",
    })).rejects.toThrow(/must be finite/);
    expect(calls).toHaveLength(0);
  });

  it("rejects non-positive or non-integer task_version", async () => {
    const { calls, query } = mockQuery([() => []]);
    await expect(appendEvent(query, TBL, {
      task_id: "t", task_version: 0, value: 1, source: "user",
    })).rejects.toThrow(/positive integer/);
    await expect(appendEvent(query, TBL, {
      task_id: "t", task_version: 1.5, value: 1, source: "user",
    })).rejects.toThrow(/positive integer/);
    expect(calls).toHaveLength(0);
  });

  it("rejects SQL identifier injection in the table name", async () => {
    const { query } = mockQuery([() => []]);
    await expect(appendEvent(query, `x"; DROP TABLE y; --`, {
      task_id: "t", task_version: 1, value: 1, source: "user",
    })).rejects.toThrow();
  });
});

// ── computeCurrent ──────────────────────────────────────────────────────────

describe("computeCurrent", () => {
  it("SUMs events for (task_id, kpi_id) and returns the number", async () => {
    const { calls, query } = mockQuery([() => [{ total: 3 }]]);
    const total = await computeCurrent(query, TBL, "task-X", "kpi-Y");
    expect(total).toBe(3);
    expect(calls[0]).toMatch(/^SELECT SUM\(value\) AS total FROM "hivemind_task_events"/);
    expect(calls[0]).toContain(`task_id = 'task-X'`);
    expect(calls[0]).toContain(`kpi_id = 'kpi-Y'`);
  });

  it("returns 0 when there are no events", async () => {
    const { query } = mockQuery([() => []]);
    expect(await computeCurrent(query, TBL, "t", "k")).toBe(0);
  });

  it("returns 0 when SUM is NULL (Deeplake returns null for zero-row aggregate)", async () => {
    const { query } = mockQuery([() => [{ total: null }]]);
    expect(await computeCurrent(query, TBL, "t", "k")).toBe(0);
  });

  it("parses a string-typed total (driver-dependent serialization)", async () => {
    const { query } = mockQuery([() => [{ total: "7" }]]);
    expect(await computeCurrent(query, TBL, "t", "k")).toBe(7);
  });

  it("falls back to 0 on non-numeric junk in the total cell", async () => {
    const { query } = mockQuery([() => [{ total: "not-a-number" }]]);
    expect(await computeCurrent(query, TBL, "t", "k")).toBe(0);
  });

  it("escapes the task_id and kpi_id in the WHERE clause", async () => {
    const { calls, query } = mockQuery([() => []]);
    await computeCurrent(query, TBL, "x' OR '1'='1", "y' OR '1'='1");
    expect(calls[0]).toContain(`task_id = 'x'' OR ''1''=''1'`);
    expect(calls[0]).toContain(`kpi_id = 'y'' OR ''1''=''1'`);
  });
});

// ── computeAllForTask ───────────────────────────────────────────────────────

describe("computeAllForTask", () => {
  it("returns a kpi_id → SUM map keyed by every emitted KPI", async () => {
    const { calls, query } = mockQuery([
      () => [
        { kpi_id: "k_a", total: 5 },
        { kpi_id: "k_b", total: 12 },
      ],
    ]);
    const out = await computeAllForTask(query, TBL, "task-X");
    expect(out).toEqual({ k_a: 5, k_b: 12 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^SELECT kpi_id, SUM\(value\) AS total/);
    expect(calls[0]).toContain(`GROUP BY kpi_id`);
    expect(calls[0]).toContain(`task_id = 'task-X'`);
  });

  it("returns an empty map when the task has no events", async () => {
    const { query } = mockQuery([() => []]);
    expect(await computeAllForTask(query, TBL, "task-Z")).toEqual({});
  });

  it("drops rows with an empty kpi_id (task-level events, not per-KPI counters)", async () => {
    const { query } = mockQuery([
      () => [
        { kpi_id: "k_a", total: 5 },
        { kpi_id: "", total: 99 },     // task-level event — not a KPI counter
      ],
    ]);
    const out = await computeAllForTask(query, TBL, "task-X");
    expect(out).toEqual({ k_a: 5 });
  });

  it("normalizes string-typed totals (driver-dependent)", async () => {
    const { query } = mockQuery([
      () => [{ kpi_id: "k_a", total: "3" }],
    ]);
    expect(await computeAllForTask(query, TBL, "task-X")).toEqual({ k_a: 3 });
  });
});
