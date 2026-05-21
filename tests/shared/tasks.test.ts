import { describe, expect, it, vi } from "vitest";
import {
  insertTask,
  editTask,
  markTaskDone,
  assignTask,
  listTasks,
  getTaskLatest,
  parseKpis,
  stringifyKpis,
  _MAX_TEXT_LENGTH,
  type Kpi,
  type TaskRow,
} from "../../src/tasks/index.js";

/**
 * Mock query helper — same shape as the rules/skills tests. Captures
 * every SQL string sent through the boundary so we can assert shape AND
 * count (per CLAUDE.md's testing rules).
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

const TBL = "hivemind_tasks";

const SAMPLE_KPI: Kpi = {
  kpi_id: "k_abc",
  name: "PRs merged",
  target: 5,
  unit: "count",
  generated_by: "claude-sonnet-4-6",
  generated_at: "2026-05-20T10:00:00.000Z",
};

/** Build a fake row matching TASKS_COLUMNS shape. */
function fakeRow(overrides: Partial<Record<keyof TaskRow, unknown>> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: "row-uuid",
    task_id: "task-uuid",
    text: "ship feature X",
    scope: "team",
    status: "active",
    assigned_to: "alice@activeloop.ai",
    assigned_by: "alice@activeloop.ai",
    kpis: JSON.stringify([SAMPLE_KPI]),
    version: 1,
    created_at: "2026-05-20T10:00:00.000Z",
    agent: "manual",
    plugin_version: "0.7.99",
  };
  return { ...base, ...overrides };
}

// ── parseKpis (validator) ───────────────────────────────────────────────────

describe("parseKpis", () => {
  it("returns [] on null / undefined / empty string", () => {
    expect(parseKpis(null)).toEqual([]);
    expect(parseKpis(undefined)).toEqual([]);
    expect(parseKpis("")).toEqual([]);
  });

  it("parses a JSON-string array", () => {
    const out = parseKpis(JSON.stringify([SAMPLE_KPI]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kpi_id: "k_abc", name: "PRs merged", target: 5 });
  });

  it("accepts an already-decoded array", () => {
    const out = parseKpis([SAMPLE_KPI]);
    expect(out).toHaveLength(1);
  });

  it("drops items missing a required field", () => {
    const out = parseKpis([
      SAMPLE_KPI,
      { ...SAMPLE_KPI, kpi_id: "" },          // empty kpi_id
      { ...SAMPLE_KPI, target: "five" },      // wrong type
      { name: "no id" },                       // missing fields
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kpi_id).toBe("k_abc");
  });

  it("rejects non-positive-integer targets (0 / -1 / 1.5) — codex legacy audit", async () => {
    // The spec + prompt contract say target is a POSITIVE INTEGER.
    // The earlier `num()` check let anything finite through, so
    // malformed LLM payloads could land target=0 (impossible goal)
    // or target=1.5 (renderer would show "0/1.5 count").
    const out = parseKpis([
      { ...SAMPLE_KPI, kpi_id: "ok",    target: 5    },
      { ...SAMPLE_KPI, kpi_id: "zero",  target: 0    },
      { ...SAMPLE_KPI, kpi_id: "neg",   target: -1   },
      { ...SAMPLE_KPI, kpi_id: "frac",  target: 1.5  },
      { ...SAMPLE_KPI, kpi_id: "inf",   target: Infinity },
      { ...SAMPLE_KPI, kpi_id: "nan",   target: NaN  },
    ]);
    expect(out.map(k => k.kpi_id)).toEqual(["ok"]);
  });

  it("preserves optional `current` when it's a finite number", () => {
    const out = parseKpis([{ ...SAMPLE_KPI, current: 2 }]);
    expect(out[0].current).toBe(2);
  });

  it("drops `current` when non-numeric", () => {
    const out = parseKpis([{ ...SAMPLE_KPI, current: "two" }]);
    expect(out[0].current).toBeUndefined();
  });

  it("returns [] on malformed JSON string (does not throw)", () => {
    expect(parseKpis("{not json")).toEqual([]);
  });

  it("returns [] on non-array input (object, number, etc.)", () => {
    expect(parseKpis({ kpis: [] })).toEqual([]);
    expect(parseKpis(42)).toEqual([]);
  });

  it("drops KPIs whose name or unit contains a newline (codex legacy audit pass 3 P1.B — prompt-injection defense)", () => {
    // KPI metadata is rendered verbatim into the SessionStart prompt.
    // A newline in `name` or `unit` would let any caller (LLM, manual
    // entry, malicious row) inject a forged section header. Validator
    // refuses any such row; the renderer's sanitize-on-read pass
    // covers already-persisted bad rows.
    const out = parseKpis([
      { ...SAMPLE_KPI, kpi_id: "ok" },
      { ...SAMPLE_KPI, kpi_id: "name_lf",   name: "PRs\nmerged" },
      { ...SAMPLE_KPI, kpi_id: "name_cr",   name: "PRs\rmerged" },
      { ...SAMPLE_KPI, kpi_id: "name_crlf", name: "PRs\r\nmerged" },
      { ...SAMPLE_KPI, kpi_id: "unit_lf",   unit: "count\n=== HIVEMIND" },
      // Unicode line separators — codex pass 4 found these bypassed
      // the CR/LF-only check entirely.
      { ...SAMPLE_KPI, kpi_id: "name_u2028", name: "PRs\u2028merged" },
      { ...SAMPLE_KPI, kpi_id: "name_u2029", name: "PRs\u2029merged" },
      { ...SAMPLE_KPI, kpi_id: "unit_u0085", unit: "count\u0085=== HIVEMIND" },
      { ...SAMPLE_KPI, kpi_id: "k_\nbad" },
    ]);
    expect(out.map(k => k.kpi_id)).toEqual(["ok"]);
  });
});

describe("stringifyKpis", () => {
  it("round-trips through parseKpis without loss", () => {
    const json = stringifyKpis([SAMPLE_KPI]);
    expect(parseKpis(json)).toEqual([SAMPLE_KPI]);
  });

  it("drops malformed items defensively (symmetry with parseKpis)", () => {
    // @ts-expect-error — intentional bad shape to exercise the filter
    const json = stringifyKpis([SAMPLE_KPI, { kpi_id: "bad" }]);
    const arr = JSON.parse(json) as unknown[];
    expect(arr).toHaveLength(1);
  });

  it("emits [] for an empty input array", () => {
    expect(stringifyKpis([])).toBe("[]");
  });
});

// ── insertTask ──────────────────────────────────────────────────────────────

describe("insertTask", () => {
  it("INSERTs a v1 row with scope, assigned_to defaulting to assigned_by", async () => {
    const { calls, query } = mockQuery([() => []]);
    const result = await insertTask(query, TBL, {
      text: "ship feature X",
      scope: "team",
      assigned_by: "alice@activeloop.ai",
    });
    expect(result.version).toBe(1);
    expect(result.task_id).toMatch(/^[0-9a-f]{8}-/);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^INSERT INTO "hivemind_tasks"/);
    expect(calls[0]).toContain("'team'");
    // assigned_to defaulted to assigned_by → alice appears twice in the SQL
    const aliceMatches = calls[0].match(/'alice@activeloop\.ai'/g);
    expect(aliceMatches?.length).toBe(2);
    expect(calls[0]).toContain(", 1, ");
    // Empty kpis array serializes to '[]' cast to jsonb
    expect(calls[0]).toContain(`E'[]'::jsonb`);
  });

  it("honors explicit assigned_to (cross-assignment)", async () => {
    const { calls, query } = mockQuery([() => []]);
    await insertTask(query, TBL, {
      text: "review PR",
      scope: "team",
      assigned_to: "bob@activeloop.ai",
      assigned_by: "alice@activeloop.ai",
    });
    expect(calls[0]).toContain("'bob@activeloop.ai'");
    expect(calls[0]).toContain("'alice@activeloop.ai'");
  });

  it("serializes KPIs through the validator on insert", async () => {
    const { calls, query } = mockQuery([() => []]);
    await insertTask(query, TBL, {
      text: "ship",
      scope: "me",
      assigned_by: "alice@activeloop.ai",
      kpis: [SAMPLE_KPI],
    });
    expect(calls[0]).toContain("PRs merged");
    expect(calls[0]).toContain("claude-sonnet-4-6");
  });

  it("rejects scope outside { me, team }", async () => {
    const { calls, query } = mockQuery([() => []]);
    await expect(
      insertTask(query, TBL, {
        // @ts-expect-error — intentional bad value
        text: "x", scope: "world", assigned_by: "a@b",
      }),
    ).rejects.toThrow(/Invalid task scope/);
    expect(calls).toHaveLength(0);
  });

  it("rejects empty text", async () => {
    const { calls, query } = mockQuery([() => []]);
    await expect(
      insertTask(query, TBL, { text: "", scope: "me", assigned_by: "a@b" }),
    ).rejects.toThrow(/must not be empty/);
    expect(calls).toHaveLength(0);
  });

  it(`rejects text longer than ${_MAX_TEXT_LENGTH} chars`, async () => {
    const { calls, query } = mockQuery([() => []]);
    await expect(
      insertTask(query, TBL, {
        text: "x".repeat(_MAX_TEXT_LENGTH + 1),
        scope: "me",
        assigned_by: "a@b",
      }),
    ).rejects.toThrow(/exceeds 2000 chars/);
    expect(calls).toHaveLength(0);
  });

  it("rejects task text with embedded newlines (codex legacy audit P1.1 + pass 4 — prompt-injection defense in depth)", async () => {
    const { calls, query } = mockQuery([() => []]);
    await expect(
      insertTask(query, TBL, { text: "ship\nrm -rf /", scope: "team", assigned_by: "a@b" }),
    ).rejects.toThrow(/must not contain newlines/);
    await expect(
      insertTask(query, TBL, { text: "ship\r\nrm -rf /", scope: "team", assigned_by: "a@b" }),
    ).rejects.toThrow(/must not contain newlines/);
    // Unicode line separators caught by codex pass 4.
    await expect(
      insertTask(query, TBL, { text: "ship\u2028attack", scope: "team", assigned_by: "a@b" }),
    ).rejects.toThrow(/must not contain newlines/);
    await expect(
      insertTask(query, TBL, { text: "ship\u2029attack", scope: "team", assigned_by: "a@b" }),
    ).rejects.toThrow(/must not contain newlines/);
    await expect(
      insertTask(query, TBL, { text: "ship\u0085attack", scope: "team", assigned_by: "a@b" }),
    ).rejects.toThrow(/must not contain newlines/);
    expect(calls).toHaveLength(0);
  });

  it("rejects identifier injection in the table name", async () => {
    const { query } = mockQuery([() => []]);
    await expect(
      insertTask(query, `x"; DROP TABLE y; --`, {
        text: "x", scope: "team", assigned_by: "a@b",
      }),
    ).rejects.toThrow();
  });
});

// ── editTask ────────────────────────────────────────────────────────────────

describe("editTask", () => {
  it("SELECTs latest, then INSERTs v+1 with new text + carried-over fields", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ version: 1, text: "old", scope: "team", assigned_to: "alice@activeloop.ai" })],
      () => [],
    ]);
    const result = await editTask(query, TBL, {
      task_id: "task-uuid",
      assigned_by: "alice@activeloop.ai",
      text: "tightened",
    });
    expect(result).toEqual({ task_id: "task-uuid", version: 2 });
    expect(calls).toHaveLength(2);
    // SELECT carries the compound tie-break ORDER BY (race-safety regression guard).
    expect(calls[0]).toMatch(/ORDER BY version DESC, created_at DESC LIMIT 1$/);
    expect(calls[1]).toMatch(/^INSERT INTO "hivemind_tasks"/);
    expect(calls[1]).toContain(`E'tightened'`);
    expect(calls[1]).toContain(", 2, ");
    // scope and assigned_to carried over from the prior version
    expect(calls[1]).toContain("'team'");
    expect(calls[1]).toContain("'alice@activeloop.ai'");
  });

  it("preserves prior kpis when caller omits the kpis field", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ version: 1, kpis: JSON.stringify([SAMPLE_KPI]) })],
      () => [],
    ]);
    await editTask(query, TBL, {
      task_id: "task-uuid",
      assigned_by: "alice@activeloop.ai",
      text: "new text",
    });
    // SAMPLE_KPI fields survive into the INSERT
    expect(calls[1]).toContain("PRs merged");
    expect(calls[1]).toContain("k_abc");
  });

  it("replaces kpis when caller passes a new array", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ version: 1, kpis: JSON.stringify([SAMPLE_KPI]) })],
      () => [],
    ]);
    const newKpi: Kpi = { ...SAMPLE_KPI, kpi_id: "k_new", name: "Lines reviewed" };
    await editTask(query, TBL, {
      task_id: "task-uuid",
      assigned_by: "alice@activeloop.ai",
      kpis: [newKpi],
    });
    expect(calls[1]).toContain("Lines reviewed");
    expect(calls[1]).toContain("k_new");
    expect(calls[1]).not.toContain("PRs merged");
  });

  it("throws Task not found when task_id is missing", async () => {
    const { calls, query } = mockQuery([() => []]);
    await expect(
      editTask(query, TBL, { task_id: "missing", assigned_by: "a@b", text: "x" }),
    ).rejects.toThrow(/Task not found: missing/);
    expect(calls).toHaveLength(1);
  });

  it("rejects empty text on edit (SELECT runs, INSERT does not)", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow()],
      () => [],
    ]);
    await expect(
      editTask(query, TBL, { task_id: "task-uuid", assigned_by: "a@b", text: "" }),
    ).rejects.toThrow(/must not be empty/);
    expect(calls).toHaveLength(1);
  });
});

// ── markTaskDone ────────────────────────────────────────────────────────────

describe("markTaskDone", () => {
  it("INSERTs v+1 with status='done' and preserves prior text", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ version: 2, text: "still useful", status: "active" })],
      () => [],
    ]);
    const result = await markTaskDone(query, TBL, {
      task_id: "task-uuid",
      assigned_by: "alice@activeloop.ai",
    });
    expect(result.version).toBe(3);
    expect(calls[1]).toContain("'done'");
    expect(calls[1]).toContain(`E'still useful'`);
  });
});

// ── assignTask ──────────────────────────────────────────────────────────────

describe("assignTask", () => {
  it("INSERTs v+1 with new assigned_to, preserves text + scope + status", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({
        version: 4,
        text: "review PR",
        scope: "team",
        status: "active",
        assigned_to: "alice@activeloop.ai",
      })],
      () => [],
    ]);
    const result = await assignTask(query, TBL, {
      task_id: "task-uuid",
      assigned_by: "alice@activeloop.ai",
      assigned_to: "bob@activeloop.ai",
    });
    expect(result.version).toBe(5);
    expect(calls[1]).toContain("'bob@activeloop.ai'"); // new assignee
    expect(calls[1]).toContain(`E'review PR'`);
    expect(calls[1]).toContain("'team'");
    expect(calls[1]).toContain("'active'");
  });
});

// ── listTasks ───────────────────────────────────────────────────────────────

describe("listTasks", () => {
  it("returns latest per task_id, active-only by default, newest first, limit 10", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ task_id: "A", version: 2, text: "A v2", created_at: "2026-05-20T10:02:00Z" }),
        fakeRow({ task_id: "A", version: 1, text: "A v1", created_at: "2026-05-20T10:01:00Z" }),
        fakeRow({ task_id: "B", version: 1, text: "B v1", created_at: "2026-05-20T10:00:00Z" }),
        fakeRow({ task_id: "C", version: 1, status: "done", created_at: "2026-05-20T09:59:00Z" }),
      ],
    ]);
    const rows = await listTasks(query, TBL, { scope: "all" });
    expect(rows.map(r => r.task_id)).toEqual(["A", "B"]);
    expect(rows[0].text).toBe("A v2");
  });

  it("scope='mine' filters by current_user assigned_to", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ task_id: "A", assigned_to: "alice@activeloop.ai", scope: "me" }),
        fakeRow({ task_id: "B", assigned_to: "bob@activeloop.ai", scope: "team" }),
        fakeRow({ task_id: "C", assigned_to: "alice@activeloop.ai", scope: "team" }),
      ],
    ]);
    const rows = await listTasks(query, TBL, { scope: "mine", current_user: "alice@activeloop.ai" });
    expect(rows.map(r => r.task_id).sort()).toEqual(["A", "C"]);
  });

  it("scope='mine' returns [] when current_user is omitted (no silent over-disclosure)", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ task_id: "A", assigned_to: "alice@activeloop.ai" }),
        fakeRow({ task_id: "B", assigned_to: "bob@activeloop.ai" }),
      ],
    ]);
    const rows = await listTasks(query, TBL, { scope: "mine" });
    expect(rows).toEqual([]);
  });

  it("scope='me' filters to strict (scope==='me' AND assigned_to=current_user) — codex legacy audit pass 3 P1.A", async () => {
    // 'me' is the strict variant used by the SessionStart renderer:
    // a team-scope task assigned to current_user is NOT included.
    const { query } = mockQuery([
      () => [
        fakeRow({ task_id: "A", scope: "me", assigned_to: "alice@activeloop.ai" }),
        fakeRow({ task_id: "B", scope: "team", assigned_to: "alice@activeloop.ai" }),
        fakeRow({ task_id: "C", scope: "me", assigned_to: "bob@activeloop.ai" }),
      ],
    ]);
    const rows = await listTasks(query, TBL, { scope: "me", current_user: "alice@activeloop.ai" });
    expect(rows.map(r => r.task_id)).toEqual(["A"]);
  });

  it("scope='me' returns [] when current_user is omitted (same over-disclosure guard as 'mine')", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ task_id: "A", scope: "me", assigned_to: "alice@activeloop.ai" }),
      ],
    ]);
    const rows = await listTasks(query, TBL, { scope: "me" });
    expect(rows).toEqual([]);
  });

  it("scope='team' filters to scope==='team'", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ task_id: "A", scope: "me" }),
        fakeRow({ task_id: "B", scope: "team" }),
        fakeRow({ task_id: "C", scope: "team" }),
      ],
    ]);
    const rows = await listTasks(query, TBL, { scope: "team" });
    expect(rows.map(r => r.task_id).sort()).toEqual(["B", "C"]);
  });

  it("status='done' filters out active rows", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ task_id: "A", status: "active" }),
        fakeRow({ task_id: "B", status: "done" }),
      ],
    ]);
    const rows = await listTasks(query, TBL, { scope: "all", status: "done" });
    expect(rows.map(r => r.task_id)).toEqual(["B"]);
  });

  it("status='all' bypasses the status filter", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ task_id: "A", status: "active" }),
        fakeRow({ task_id: "B", status: "done" }),
      ],
    ]);
    const rows = await listTasks(query, TBL, { scope: "all", status: "all" });
    expect(rows.map(r => r.task_id).sort()).toEqual(["A", "B"]);
  });

  it("normalizes the kpis JSONB column through the validator", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ task_id: "A", kpis: JSON.stringify([SAMPLE_KPI]) }),
        fakeRow({ task_id: "B", kpis: "garbage" }), // malformed → []
      ],
    ]);
    const rows = await listTasks(query, TBL, { scope: "all" });
    const byId = Object.fromEntries(rows.map(r => [r.task_id, r]));
    expect(byId.A.kpis).toHaveLength(1);
    expect(byId.A.kpis[0].name).toBe("PRs merged");
    expect(byId.B.kpis).toEqual([]);
  });

  it("respects --limit", async () => {
    const { query } = mockQuery([
      () => Array.from({ length: 25 }, (_, i) =>
        fakeRow({
          task_id: `t-${i}`,
          created_at: `2026-05-20T10:${String(i).padStart(2, "0")}:00Z`,
        }),
      ),
    ]);
    const rows = await listTasks(query, TBL, { scope: "all", limit: 3 });
    expect(rows).toHaveLength(3);
    expect(rows[0].task_id).toBe("t-24");
  });

  it("drops malformed rows (NaN version) silently", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ task_id: "good" }),
        { task_id: "bad", version: "not-a-number" },
      ],
    ]);
    const rows = await listTasks(query, TBL, { scope: "all" });
    expect(rows.map(r => r.task_id)).toEqual(["good"]);
  });
});

// ── getTaskLatest ───────────────────────────────────────────────────────────

describe("getTaskLatest", () => {
  it("returns the latest row for a task_id", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ task_id: "X", version: 7 })],
    ]);
    const row = await getTaskLatest(query, TBL, "X");
    expect(row?.version).toBe(7);
    expect(calls[0]).toContain(`task_id = 'X'`);
    expect(calls[0]).toContain("ORDER BY version DESC, created_at DESC");
    expect(calls[0]).toMatch(/LIMIT 1$/);
  });

  it("returns null on miss", async () => {
    const { query } = mockQuery([() => []]);
    const row = await getTaskLatest(query, TBL, "missing");
    expect(row).toBeNull();
  });

  it("escapes the task_id in the WHERE clause", async () => {
    const { calls, query } = mockQuery([() => []]);
    await getTaskLatest(query, TBL, "x' OR '1'='1");
    expect(calls[0]).toContain(`task_id = 'x'' OR ''1''=''1'`);
  });

  it("normalizes the kpis JSONB through the validator on single-row reads", async () => {
    const { query } = mockQuery([
      () => [fakeRow({ kpis: JSON.stringify([SAMPLE_KPI]) })],
    ]);
    const row = await getTaskLatest(query, TBL, "X");
    expect(row?.kpis).toHaveLength(1);
    expect(row?.kpis[0].name).toBe("PRs merged");
  });
});
