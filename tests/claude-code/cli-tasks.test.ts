import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CLI handler tests for `hivemind tasks`. Mirror of cli-rules.test.ts —
 * mock the config + DeeplakeApi at the network boundary, exercise
 * argparse + dispatch.
 */

const ensureTasksTableMock = vi.fn();
const ensureTaskEventsTableMock = vi.fn();
const queryMock = vi.fn();

vi.mock("../../src/config.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    constructor(
      _token: string,
      _apiUrl: string,
      _orgId: string,
      _workspaceId: string,
      _tableName: string,
    ) { /* nothing */ }
    ensureTasksTable(name: string) { return ensureTasksTableMock(name); }
    ensureTaskEventsTable(name: string) { return ensureTaskEventsTableMock(name); }
    query(sql: string) { return queryMock(sql); }
  },
}));

vi.mock("../../src/cli/version.js", () => ({
  getVersion: () => "0.7.99",
}));

import { runTasksCommand } from "../../src/commands/tasks.js";
import { loadConfig } from "../../src/config.js";
const loadConfigMock = loadConfig as unknown as ReturnType<typeof vi.fn>;

const VALID_CONFIG = {
  token: "tok",
  orgId: "org",
  orgName: "OrgName",
  userName: "alice@activeloop.ai",
  workspaceId: "ws",
  apiUrl: "https://api",
  tableName: "memory",
  sessionsTableName: "sessions",
  skillsTableName: "skills",
  rulesTableName: "hivemind_rules",
  tasksTableName: "hivemind_tasks",
  taskEventsTableName: "hivemind_task_events",
  memoryPath: "/tmp/mem",
};

let logged: string[] = [];
let erred: string[] = [];
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logged = [];
  erred = [];
  ensureTasksTableMock.mockReset().mockResolvedValue(undefined);
  ensureTaskEventsTableMock.mockReset().mockResolvedValue(undefined);
  queryMock.mockReset().mockResolvedValue([]);
  loadConfigMock.mockReset().mockReturnValue(VALID_CONFIG);
  logSpy = vi.spyOn(console, "log").mockImplementation((...a: any[]) => { logged.push(a.join(" ")); });
  errSpy = vi.spyOn(console, "error").mockImplementation((...a: any[]) => { erred.push(a.join(" ")); });
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`__EXIT_${code ?? 0}__`);
  }) as any);
});

afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();
});

function expectExit(code: number, fn: () => unknown): Promise<void> {
  return expect(fn).rejects.toThrow(new RegExp(`__EXIT_${code}__`));
}

function fakeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    task_id: "task-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    text: "ship feature X",
    scope: "team",
    status: "active",
    assigned_to: "alice@activeloop.ai",
    assigned_by: "alice@activeloop.ai",
    kpis: "[]",
    version: 1,
    created_at: "2026-05-20T10:00:00Z",
    agent: "manual",
    plugin_version: "0.7.99",
    ...overrides,
  };
}

// ── help / no-arg / unknown ─────────────────────────────────────────────────

describe("runTasksCommand — help & unknown sub", () => {
  it("prints usage with no subcommand", async () => {
    await runTasksCommand([]);
    expect(logged.some(l => l.includes("hivemind tasks — manage personal + team tasks"))).toBe(true);
    expect(ensureTasksTableMock).not.toHaveBeenCalled();
  });

  it("exits 1 on unknown subcommand", async () => {
    await expectExit(1, () => runTasksCommand(["wat"]));
    expect(erred.some(l => l.includes("Unknown tasks subcommand: wat"))).toBe(true);
  });
});

// ── login gating ────────────────────────────────────────────────────────────

describe("runTasksCommand — requires login", () => {
  it("exits 2 with a clear message when loadConfig returns null", async () => {
    loadConfigMock.mockReturnValueOnce(null);
    await expectExit(2, () => runTasksCommand(["list"]));
    expect(erred.some(l => l.includes("Not logged in"))).toBe(true);
    expect(ensureTasksTableMock).not.toHaveBeenCalled();
  });
});

// ── add ─────────────────────────────────────────────────────────────────────

describe("runTasksCommand — add", () => {
  it("INSERTs a v1 row with default scope=me, self-assigned, empty kpis JSONB", async () => {
    await runTasksCommand(["add", "ship feature X"]);

    expect(ensureTasksTableMock).toHaveBeenCalledWith("hivemind_tasks");
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = queryMock.mock.calls[0][0];
    expect(sql).toMatch(/^INSERT INTO "hivemind_tasks"/);
    expect(sql).toContain(`E'ship feature X'`);
    expect(sql).toContain("'me'");
    // assigned_to defaulted to cfg.userName → alice appears twice (to+by)
    const aliceMatches = sql.match(/'alice@activeloop\.ai'/g);
    expect(aliceMatches?.length).toBe(2);
    expect(sql).toContain(`E'[]'::jsonb`);
    expect(logged.some(l => l.includes("Added task") && l.includes("v1") && l.includes("scope=me"))).toBe(true);
  });

  it("honors --scope team", async () => {
    await runTasksCommand(["add", "team thing", "--scope", "team"]);
    expect(queryMock.mock.calls[0][0]).toContain("'team'");
  });

  it("honors --assign for cross-assignment", async () => {
    await runTasksCommand(["add", "review PR", "--scope", "team", "--assign", "bob@activeloop.ai"]);
    const sql = queryMock.mock.calls[0][0];
    expect(sql).toContain("'bob@activeloop.ai'");        // assigned_to
    expect(sql).toContain("'alice@activeloop.ai'");      // assigned_by
    expect(logged.some(l => l.includes("assigned_to=bob@activeloop.ai"))).toBe(true);
  });

  it("rejects invalid --scope values", async () => {
    await expectExit(1, () => runTasksCommand(["add", "x", "--scope", "world"]));
    expect(erred.some(l => l.includes("Invalid --scope"))).toBe(true);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("exits 1 when text is missing", async () => {
    await expectExit(1, () => runTasksCommand(["add"]));
    expect(erred.some(l => l.includes("Missing task text"))).toBe(true);
  });

  it("does NOT swallow text positional when followed by flags", async () => {
    // Regression guard mirroring the rules-side codex finding.
    await runTasksCommand(["add", "x", "--scope=team", "--assign=bob@activeloop.ai"]);
    const sql = queryMock.mock.calls[0][0];
    expect(sql).toContain(`E'x'`);
    expect(sql).toContain("'bob@activeloop.ai'");
  });
});

// ── list ────────────────────────────────────────────────────────────────────

describe("runTasksCommand — list", () => {
  it("default --mine: filters to current user's tasks, prints full task_id (round-trip safe)", async () => {
    queryMock.mockResolvedValueOnce([
      fakeRow({ assigned_to: "alice@activeloop.ai" }),
      fakeRow({ task_id: "bob-task", assigned_to: "bob@activeloop.ai" }),
    ]);
    await runTasksCommand(["list"]);
    expect(logged.some(l => l.includes("[active]"))).toBe(true);
    // Full task_id present (no truncation)
    expect(logged.some(l => l.includes("task-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee"))).toBe(true);
    // Bob's task is filtered out by default --mine
    expect(logged.every(l => !l.includes("bob-task"))).toBe(true);
  });

  it("--team filters to scope='team'", async () => {
    queryMock.mockResolvedValueOnce([
      fakeRow({ task_id: "me-1", scope: "me" }),
      fakeRow({ task_id: "team-1", scope: "team" }),
    ]);
    await runTasksCommand(["list", "--team"]);
    expect(logged.some(l => l.includes("team-1"))).toBe(true);
    expect(logged.every(l => !l.includes("me-1"))).toBe(true);
  });

  it("--all bypasses scope filter", async () => {
    queryMock.mockResolvedValueOnce([
      fakeRow({ task_id: "me-1", scope: "me", assigned_to: "alice@activeloop.ai" }),
      fakeRow({ task_id: "bob-team", scope: "team", assigned_to: "bob@activeloop.ai" }),
    ]);
    await runTasksCommand(["list", "--all"]);
    expect(logged.some(l => l.includes("me-1"))).toBe(true);
    expect(logged.some(l => l.includes("bob-team"))).toBe(true);
  });

  it("rejects conflicting --mine + --team", async () => {
    await expectExit(1, () => runTasksCommand(["list", "--mine", "--team"]));
    expect(erred.some(l => l.includes("Conflicting flags"))).toBe(true);
  });

  it("renders KPI lines under each task when kpis populated", async () => {
    const SAMPLE_KPI = {
      kpi_id: "k_1",
      name: "PRs merged",
      target: 5,
      current: 2,
      unit: "count",
      generated_by: "claude",
      generated_at: "2026-05-20T10:00:00Z",
    };
    queryMock.mockResolvedValueOnce([fakeRow({ kpis: JSON.stringify([SAMPLE_KPI]) })]);
    await runTasksCommand(["list", "--all"]);
    // Indented KPI line carries "current/target unit"
    expect(logged.some(l => l.includes("PRs merged: 2/5 count"))).toBe(true);
  });

  it("renders '?/target' when current is unset (events not yet wired)", async () => {
    const KPI_NO_CURRENT = {
      kpi_id: "k_1", name: "Lines reviewed", target: 200, unit: "lines",
      generated_by: "claude", generated_at: "2026-05-20T10:00:00Z",
    };
    queryMock.mockResolvedValueOnce([fakeRow({ kpis: JSON.stringify([KPI_NO_CURRENT]) })]);
    await runTasksCommand(["list", "--all"]);
    expect(logged.some(l => l.includes("Lines reviewed: ?/200 lines"))).toBe(true);
  });

  it("empty state prints scope + status in the diagnostic", async () => {
    queryMock.mockResolvedValueOnce([]);
    await runTasksCommand(["list", "--team", "--status", "done"]);
    expect(logged.some(l => l.includes("(no tasks with scope=team status=done)"))).toBe(true);
  });

  it("rejects invalid --limit", async () => {
    await expectExit(1, () => runTasksCommand(["list", "--limit", "many"]));
    expect(erred.some(l => l.includes("Invalid --limit"))).toBe(true);
  });

  it("--mine identity match is exact (no fuzzy email matching) — lock the v1 contract", async () => {
    // Codex review on S3 first pass surfaced the identity-shape papercut:
    // if cfg.userName is the local-part ("alice") and someone runs
    // `tasks assign <id> alice@activeloop.ai`, the assignee's
    // `tasks list --mine` filter must NOT silently match. Strict
    // equality is the v1 contract — a proper userEmail field on
    // Config is tracked as a v1.1 follow-up. This test pins the
    // contract so a future "be helpful" change doesn't introduce
    // surprise fuzzy matching.
    queryMock.mockResolvedValueOnce([
      // Two rows with semantically-similar but textually-distinct ids:
      fakeRow({ task_id: "exact", assigned_to: "alice@activeloop.ai" }),
      fakeRow({ task_id: "local", assigned_to: "alice" }),
      fakeRow({ task_id: "display", assigned_to: "Alice Smith" }),
    ]);
    // cfg.userName = "alice@activeloop.ai" → only the exact-match row shows up
    await runTasksCommand(["list"]);
    expect(logged.some(l => l.includes("exact"))).toBe(true);
    expect(logged.every(l => !l.includes("local"))).toBe(true);
    expect(logged.every(l => !l.includes("display"))).toBe(true);
  });

  it("listed task_id round-trips into edit (no truncation regression)", async () => {
    // Same regression guard as the rules-side cli test: copy-paste from
    // list output into edit must hit the exact SELECT predicate.
    const row = fakeRow({ task_id: "11111111-2222-3333-4444-555555555555" });
    queryMock.mockResolvedValueOnce([row]);    // list SELECT
    queryMock.mockResolvedValueOnce([row]);    // edit's getTaskLatest SELECT
    queryMock.mockResolvedValueOnce([]);       // edit's INSERT

    await runTasksCommand(["list", "--all"]);
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    const displayedRow = logged.find(l => l.startsWith("[active]"));
    const displayedId = displayedRow?.match(uuidRe)?.[0];
    expect(displayedId).toBe(row.task_id);

    await runTasksCommand(["edit", displayedId!, "tightened"]);
    const editSelectSql = queryMock.mock.calls[1][0];
    expect(editSelectSql).toContain(`task_id = '${row.task_id}'`);
    expect(erred).toEqual([]);
  });
});

// ── edit ────────────────────────────────────────────────────────────────────

describe("runTasksCommand — edit", () => {
  it("SELECTs previous + INSERTs v+1 with new text", async () => {
    queryMock.mockResolvedValueOnce([fakeRow({ version: 2, text: "old" })]);
    queryMock.mockResolvedValueOnce([]);
    await runTasksCommand(["edit", "task-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "new text"]);
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[1][0]).toContain(`E'new text'`);
    expect(queryMock.mock.calls[1][0]).toContain(", 3, ");
    expect(logged.some(l => l.includes("Edited task") && l.includes("v3"))).toBe(true);
  });

  it("exits 1 when args missing", async () => {
    await expectExit(1, () => runTasksCommand(["edit"]));
    await expectExit(1, () => runTasksCommand(["edit", "task-id"]));
    expect(erred.some(l => l.includes("Usage: hivemind tasks edit"))).toBe(true);
  });

  it("exits 1 when task does not exist", async () => {
    queryMock.mockResolvedValueOnce([]);
    await expectExit(1, () => runTasksCommand(["edit", "missing", "x"]));
    expect(erred.some(l => l.includes("Edit failed: Task not found: missing"))).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

// ── done ────────────────────────────────────────────────────────────────────

describe("runTasksCommand — done", () => {
  it("INSERTs v+1 with status='done'", async () => {
    queryMock.mockResolvedValueOnce([fakeRow({ version: 3, status: "active" })]);
    queryMock.mockResolvedValueOnce([]);
    await runTasksCommand(["done", "task-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]);
    expect(queryMock.mock.calls[1][0]).toContain("'done'");
    expect(logged.some(l => l.includes("Marked task") && l.includes("done") && l.includes("v4"))).toBe(true);
  });
});

// ── assign ──────────────────────────────────────────────────────────────────

describe("runTasksCommand — assign", () => {
  it("INSERTs v+1 with new assigned_to", async () => {
    queryMock.mockResolvedValueOnce([fakeRow({ assigned_to: "alice@activeloop.ai" })]);
    queryMock.mockResolvedValueOnce([]);
    await runTasksCommand(["assign", "task-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "bob@activeloop.ai"]);
    const insert = queryMock.mock.calls[1][0];
    expect(insert).toContain("'bob@activeloop.ai'");
    expect(logged.some(l => l.includes("Assigned task") && l.includes("bob@activeloop.ai"))).toBe(true);
  });

  it("exits 1 when args missing", async () => {
    await expectExit(1, () => runTasksCommand(["assign"]));
    await expectExit(1, () => runTasksCommand(["assign", "task-id"]));
    expect(erred.some(l => l.includes("Usage: hivemind tasks assign"))).toBe(true);
  });
});

// ── progress ────────────────────────────────────────────────────────────────

describe("runTasksCommand — progress", () => {
  it("looks up the task version, then INSERTs an event bound to that version", async () => {
    // SELECT latest task → INSERT event
    queryMock.mockResolvedValueOnce([fakeRow({ version: 3 })]);
    queryMock.mockResolvedValueOnce([]);
    await runTasksCommand([
      "progress",
      "task-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "k_pr_merged",
      "--value", "1",
      "--note", "merged PR #42",
    ]);
    expect(queryMock).toHaveBeenCalledTimes(2);
    // First call: SELECT for getTaskLatest (compound ORDER BY)
    expect(queryMock.mock.calls[0][0]).toMatch(/^SELECT .* FROM "hivemind_tasks"/);
    expect(queryMock.mock.calls[0][0]).toContain(`task_id = 'task-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee'`);
    // Second call: INSERT into task_events with the resolved version
    const insertSql = queryMock.mock.calls[1][0];
    expect(insertSql).toMatch(/^INSERT INTO "hivemind_task_events"/);
    expect(insertSql).toContain(`'task-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee'`);
    expect(insertSql).toContain(`'k_pr_merged'`);
    expect(insertSql).toContain(", 3, ");          // task_version (from getTaskLatest)
    expect(insertSql).toContain("'user'");          // source
    expect(insertSql).toContain(`E'merged PR #42'`);
    expect(logged.some(l => l.includes("Recorded progress") && l.includes("k_pr_merged") && l.includes("value 1"))).toBe(true);
  });

  it("accepts --value=N (= form)", async () => {
    queryMock.mockResolvedValueOnce([fakeRow({ version: 1 })]);
    queryMock.mockResolvedValueOnce([]);
    await runTasksCommand([
      "progress", "task-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "k_pr_merged", "--value=2",
    ]);
    expect(queryMock.mock.calls[1][0]).toContain(", 2, ");
  });

  it("accepts negative --value (corrections)", async () => {
    queryMock.mockResolvedValueOnce([fakeRow({ version: 1 })]);
    queryMock.mockResolvedValueOnce([]);
    await runTasksCommand(["progress", "task-x", "k_x", "--value", "-1"]);
    expect(queryMock.mock.calls[1][0]).toContain(", -1, ");
  });

  it("rejects missing positional args (task-id or kpi-id)", async () => {
    await expectExit(1, () => runTasksCommand(["progress"]));
    await expectExit(1, () => runTasksCommand(["progress", "task-id"]));
    expect(erred.some(l => l.includes("Usage: hivemind tasks progress"))).toBe(true);
  });

  it("rejects missing --value flag", async () => {
    await expectExit(1, () => runTasksCommand(["progress", "task-x", "k_x"]));
    expect(erred.some(l => l.includes("Missing required --value"))).toBe(true);
  });

  it("rejects non-finite --value (NaN / Infinity)", async () => {
    await expectExit(1, () => runTasksCommand(["progress", "task-x", "k_x", "--value", "not-a-number"]));
    expect(erred.some(l => l.includes("Invalid --value"))).toBe(true);
  });

  it("rejects fractional --value (events table is BIGINT) — codex P2 regression guard", async () => {
    // Schema stores `value BIGINT NOT NULL DEFAULT 0`, so fractional
    // deltas would fail at the backend INSERT with a cryptic SQL
    // error. We reject up-front with a clear message. This pins the
    // v1 integer contract so a future "let users emit 0.5" change
    // has to consciously remove this test (and switch the column to
    // DOUBLE PRECISION).
    await expectExit(1, () => runTasksCommand(["progress", "task-x", "k_x", "--value", "0.5"]));
    expect(erred.some(l => l.includes("Invalid --value") && l.includes("integer"))).toBe(true);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects --value 0 (zero events carry no signal)", async () => {
    await expectExit(1, () => runTasksCommand(["progress", "task-x", "k_x", "--value", "0"]));
    expect(erred.some(l => l.includes("Invalid --value: 0"))).toBe(true);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("exits 1 when the task does not exist", async () => {
    queryMock.mockResolvedValueOnce([]); // SELECT returns nothing
    await expectExit(1, () => runTasksCommand(["progress", "missing", "k_x", "--value", "1"]));
    expect(erred.some(l => l.includes("Task not found: missing"))).toBe(true);
    // No INSERT — only the SELECT was issued.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown kpi_id with valid list — codex pass 3 regression guard", async () => {
    // Without this validation, a typo like `k_pr_merg` (vs `k_pr_merged`)
    // would silently INSERT an event that report never displays — ghost
    // progress. Surface the typo at write time with the list of valid
    // kpi_ids so the user can fix the command and retry.
    const KPI_A = {
      kpi_id: "k_pr_merged", name: "PRs merged", target: 5, unit: "count",
      generated_by: "manual", generated_at: "2026-05-20T10:00:00Z",
    };
    const KPI_B = {
      kpi_id: "k_lines", name: "Lines reviewed", target: 200, unit: "lines",
      generated_by: "manual", generated_at: "2026-05-20T10:00:00Z",
    };
    queryMock.mockResolvedValueOnce([fakeRow({
      kpis: JSON.stringify([KPI_A, KPI_B]),
    })]);
    await expectExit(1, () => runTasksCommand([
      "progress", "task-id", "k_pr_merg",   // typo — missing "ed"
      "--value", "1",
    ]));
    expect(erred.some(l =>
      l.includes("Unknown kpi_id 'k_pr_merg'") &&
      l.includes("k_pr_merged") &&
      l.includes("k_lines"),
    )).toBe(true);
    // SELECT happened; INSERT did NOT.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("accepts any kpi_id when task has zero KPIs (T4 not yet wired)", async () => {
    // Zero-KPI tasks (the T3-default state) can still record progress
    // against forthcoming KPIs; the validation only fires once
    // task.kpis is non-empty.
    queryMock.mockResolvedValueOnce([fakeRow({ kpis: "[]", version: 1 })]);
    queryMock.mockResolvedValueOnce([]); // INSERT succeeds
    await runTasksCommand(["progress", "task-id", "future_kpi", "--value", "1"]);
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[1][0]).toContain("'future_kpi'");
    expect(logged.some(l => l.includes("Recorded progress"))).toBe(true);
  });

  it("lazy-creates task_events on first event of a fresh session, then retries", async () => {
    // SELECT (success) → INSERT (table missing) → INSERT (after ensure)
    queryMock.mockResolvedValueOnce([fakeRow({ version: 1 })]);
    queryMock.mockRejectedValueOnce(new Error(`relation "hivemind_task_events" does not exist`));
    queryMock.mockResolvedValueOnce([]);
    await runTasksCommand(["progress", "task-x", "k_x", "--value", "1"]);
    expect(ensureTaskEventsTableMock).toHaveBeenCalledTimes(1);
    expect(ensureTaskEventsTableMock).toHaveBeenCalledWith("hivemind_task_events");
    // 1 SELECT + 1 failed INSERT + 1 retry INSERT = 3 queries
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(logged.some(l => l.includes("Recorded progress"))).toBe(true);
  });
});

// ── report ──────────────────────────────────────────────────────────────────

describe("runTasksCommand — report", () => {
  it("empty state: prints (no active tasks to report on) when listTasks returns []", async () => {
    queryMock.mockResolvedValueOnce([]); // listTasks SELECT
    await runTasksCommand(["report"]);
    expect(logged.some(l => l.includes("(no active tasks to report on)"))).toBe(true);
    // listTasks only — empty-state short-circuits BEFORE the
    // ensureTaskEventsTable call, so we save one round-trip too.
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(ensureTaskEventsTableMock).not.toHaveBeenCalled();
  });

  it("pre-ensures task_events at the top of report — codex P2 regression guard", async () => {
    // Fresh install: listTasks returns one task with KPIs; aggregate
    // SELECT would otherwise fail with "table does not exist" before
    // the report could render anything. Pre-ensuring up front means
    // a never-used-before events table doesn't crash report.
    const KPI = {
      kpi_id: "k_pr", name: "PRs merged", target: 5, unit: "count",
      generated_by: "manual", generated_at: "2026-05-20T10:00:00Z",
    };
    queryMock.mockResolvedValueOnce([fakeRow({ kpis: JSON.stringify([KPI]) })]); // listTasks
    queryMock.mockResolvedValueOnce([{ kpi_id: "k_pr", total: 0 }]);             // computeAllForTask
    await runTasksCommand(["report"]);
    expect(ensureTaskEventsTableMock).toHaveBeenCalledTimes(1);
    expect(ensureTaskEventsTableMock).toHaveBeenCalledWith("hivemind_task_events");
  });

  it("per-task: aggregates events via SUM and renders current/target per KPI", async () => {
    const KPI = {
      kpi_id: "k_pr",
      name: "PRs merged",
      target: 5,
      unit: "count",
      generated_by: "manual",
      generated_at: "2026-05-20T10:00:00Z",
    };
    queryMock.mockResolvedValueOnce([
      fakeRow({ task_id: "T1", kpis: JSON.stringify([KPI]) }),
    ]);
    // computeAllForTask SELECT GROUP BY kpi_id → returns aggregated total
    queryMock.mockResolvedValueOnce([{ kpi_id: "k_pr", total: 3 }]);
    await runTasksCommand(["report"]);
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[1][0]).toMatch(/SUM\(value\)/);
    expect(queryMock.mock.calls[1][0]).toMatch(/GROUP BY kpi_id/);
    expect(logged.some(l => l.includes("PRs merged: 3/5 count"))).toBe(true);
  });

  it("KPIs with no events show 0/target (distinguishable from missing data)", async () => {
    const KPI = {
      kpi_id: "k_pr",
      name: "PRs merged",
      target: 5,
      unit: "count",
      generated_by: "manual",
      generated_at: "2026-05-20T10:00:00Z",
    };
    queryMock.mockResolvedValueOnce([
      fakeRow({ task_id: "T1", kpis: JSON.stringify([KPI]) }),
    ]);
    queryMock.mockResolvedValueOnce([]); // no events
    await runTasksCommand(["report"]);
    expect(logged.some(l => l.includes("PRs merged: 0/5 count"))).toBe(true);
  });

  it("targeted: report <task-id> dives into one task (no listTasks call)", async () => {
    const KPI = {
      kpi_id: "k_pr",
      name: "PRs merged",
      target: 5,
      unit: "count",
      generated_by: "manual",
      generated_at: "2026-05-20T10:00:00Z",
    };
    // getTaskLatest SELECT (single row) → computeAllForTask SELECT
    queryMock.mockResolvedValueOnce([fakeRow({ task_id: "T-specific", kpis: JSON.stringify([KPI]) })]);
    queryMock.mockResolvedValueOnce([{ kpi_id: "k_pr", total: 1 }]);
    await runTasksCommand(["report", "T-specific"]);
    // First query was getTaskLatest (compound ORDER BY + LIMIT 1), NOT listTasks
    expect(queryMock.mock.calls[0][0]).toContain("LIMIT 1");
    expect(queryMock.mock.calls[0][0]).toContain(`task_id = 'T-specific'`);
    expect(logged.some(l => l.includes("T-specific"))).toBe(true);
    expect(logged.some(l => l.includes("PRs merged: 1/5 count"))).toBe(true);
  });

  it("targeted: report <missing-task-id> exits 1 with clear error", async () => {
    queryMock.mockResolvedValueOnce([]); // getTaskLatest returns nothing
    await expectExit(1, () => runTasksCommand(["report", "ghost-task"]));
    expect(erred.some(l => l.includes("Task not found: ghost-task"))).toBe(true);
  });

  it("task with no KPIs prints the 'T4 will plug LLM generation' hint AND skips the aggregate query", async () => {
    // The kpis.length===0 check now runs BEFORE computeAllForTask, so
    // a task without KPIs costs ONLY the listTasks SELECT — no
    // wasted aggregate call. Codex review on T5 surfaced the ordering.
    queryMock.mockResolvedValueOnce([fakeRow({ kpis: "[]" })]);    // listTasks
    await runTasksCommand(["report"]);
    expect(logged.some(l => l.includes("no KPIs defined yet"))).toBe(true);
    // listTasks (1) — NO computeAllForTask. ensureTaskEventsTable was
    // called separately on the mock (which doesn't count as a query).
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

// ── ensureTasksTable wiring ─────────────────────────────────────────────────

describe("runTasksCommand — schema bootstrap", () => {
  it("calls ensureTasksTable exactly once with the configured table name", async () => {
    await runTasksCommand(["list", "--all"]);
    expect(ensureTasksTableMock).toHaveBeenCalledTimes(1);
    expect(ensureTasksTableMock).toHaveBeenCalledWith("hivemind_tasks");
  });

  it("honors HIVEMIND_TASKS_TABLE override via cfg.tasksTableName", async () => {
    loadConfigMock.mockReturnValueOnce({ ...VALID_CONFIG, tasksTableName: "tasks_test" });
    await runTasksCommand(["list", "--all"]);
    expect(ensureTasksTableMock).toHaveBeenCalledWith("tasks_test");
  });
});
