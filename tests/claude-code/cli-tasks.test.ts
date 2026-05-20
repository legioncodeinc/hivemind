import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CLI handler tests for `hivemind tasks`. Mirror of cli-rules.test.ts —
 * mock the config + DeeplakeApi at the network boundary, exercise
 * argparse + dispatch.
 */

const ensureTasksTableMock = vi.fn();
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

// ── report (stub) ───────────────────────────────────────────────────────────

describe("runTasksCommand — report (T3 stub)", () => {
  it("prints a deferred notice rather than silently returning zero progress", async () => {
    await runTasksCommand(["report"]);
    expect(logged.some(l => l.includes("KPI progress aggregation lands with the events module in T5"))).toBe(true);
    // No INSERT/UPDATE — read-only stub today
    const writeQueries = queryMock.mock.calls
      .map(c => c[0])
      .filter((s: string) => /^(INSERT|UPDATE)/.test(s));
    expect(writeQueries).toEqual([]);
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
