import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  insertRule,
  editRule,
  markRuleDone,
  listRules,
  getRuleLatest,
  _MAX_TEXT_LENGTH,
  type RuleRow,
} from "../../src/rules/index.js";

/**
 * Mock query helper. Each script step receives the SQL and returns rows
 * (or throws). The harness captures every SQL string for shape + count
 * assertions — see CLAUDE.md "mock the network boundary, not the module
 * under test" for the rationale.
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

const TBL = "hivemind_rules";

/** Build a fake row matching RULES_COLUMNS shape. */
function fakeRow(overrides: Partial<RuleRow> = {}): Record<string, unknown> {
  return {
    id: "row-uuid",
    rule_id: "rule-uuid",
    text: "no DROP TABLE on prod",
    scope: "team",
    status: "active",
    assigned_by: "alice@activeloop.ai",
    version: 1,
    created_at: "2026-05-20T10:00:00.000Z",
    agent: "manual",
    plugin_version: "0.7.38",
    ...overrides,
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

// ── insertRule ──────────────────────────────────────────────────────────────

describe("insertRule", () => {
  it("INSERTs a v1 row and returns a stable rule_id + version 1", async () => {
    const { calls, query } = mockQuery([() => []]);
    const result = await insertRule(query, TBL, {
      text: "no DROP TABLE on prod",
      assigned_by: "alice@activeloop.ai",
    });
    expect(result.version).toBe(1);
    expect(result.rule_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^INSERT INTO "hivemind_rules"/);
    // version literal is 1, never quoted
    expect(calls[0]).toMatch(/, 1, /);
    // scope is hardcoded to 'team' for rules (A3 in the plan)
    expect(calls[0]).toContain("'team'");
    // status defaults to 'active' on first insert
    expect(calls[0]).toContain("'active'");
    expect(calls[0]).toContain("'alice@activeloop.ai'");
    // Body uses E-string literal so backslashes / quotes stay safe
    expect(calls[0]).toContain(`E'no DROP TABLE on prod'`);
  });

  it("escapes SQL-special characters in the text body", async () => {
    const { calls, query } = mockQuery([() => []]);
    await insertRule(query, TBL, {
      text: "don't run 'rm -rf /' \\ ever",
      assigned_by: "alice@activeloop.ai",
    });
    // single quotes get doubled, backslashes get doubled (sqlStr contract)
    expect(calls[0]).toContain(`E'don''t run ''rm -rf /'' \\\\ ever'`);
  });

  it("rejects empty text", async () => {
    const { calls, query } = mockQuery([() => []]);
    await expect(
      insertRule(query, TBL, { text: "", assigned_by: "alice@activeloop.ai" }),
    ).rejects.toThrow(/must not be empty/);
    expect(calls).toHaveLength(0);
  });

  it(`rejects text longer than ${_MAX_TEXT_LENGTH} chars`, async () => {
    const { calls, query } = mockQuery([() => []]);
    const oversized = "x".repeat(_MAX_TEXT_LENGTH + 1);
    await expect(
      insertRule(query, TBL, { text: oversized, assigned_by: "alice@activeloop.ai" }),
    ).rejects.toThrow(/exceeds 2000 chars/);
    expect(calls).toHaveLength(0);
  });

  it("rejects rule text with embedded newlines (codex legacy audit P1.1 + pass 4 — prompt-injection defense in depth)", async () => {
    // Reject every Unicode line terminator that a tokenizer or
    // renderer might treat as a section break. Codex pass 4 caught
    // the prior CR/LF-only check that let U+2028 / U+2029 / U+0085
    // through.
    const { calls, query } = mockQuery([() => []]);
    await expect(
      insertRule(query, TBL, { text: "first line\nfake section", assigned_by: "a@b" }),
    ).rejects.toThrow(/must not contain newlines/);
    await expect(
      insertRule(query, TBL, { text: "first\rsecond", assigned_by: "a@b" }),
    ).rejects.toThrow(/must not contain newlines/);
    await expect(
      insertRule(query, TBL, { text: "first\u2028second", assigned_by: "a@b" }),
    ).rejects.toThrow(/must not contain newlines/);
    await expect(
      insertRule(query, TBL, { text: "first\u2029second", assigned_by: "a@b" }),
    ).rejects.toThrow(/must not contain newlines/);
    await expect(
      insertRule(query, TBL, { text: "first\u0085second", assigned_by: "a@b" }),
    ).rejects.toThrow(/must not contain newlines/);
    expect(calls).toHaveLength(0);
  });

  it("rejects SQL-identifier injection in the table name", async () => {
    const { query } = mockQuery([() => []]);
    await expect(
      insertRule(query, `x"; DROP TABLE y; --`, {
        text: "anything",
        assigned_by: "a@b",
      }),
    ).rejects.toThrow();
  });

  it("includes plugin_version and agent overrides when supplied", async () => {
    const { calls, query } = mockQuery([() => []]);
    await insertRule(query, TBL, {
      text: "test",
      assigned_by: "alice@activeloop.ai",
      agent: "claude_code",
      plugin_version: "0.7.99",
    });
    expect(calls[0]).toContain("'claude_code'");
    expect(calls[0]).toContain("'0.7.99'");
  });

  it("defaults agent to 'manual' and plugin_version to '' when omitted", async () => {
    const { calls, query } = mockQuery([() => []]);
    await insertRule(query, TBL, { text: "test", assigned_by: "a@b" });
    expect(calls[0]).toContain("'manual'");
    // plugin_version landed as the empty-string literal at the trailing position
    expect(calls[0]).toMatch(/, ''\)/);
  });
});

// ── editRule ────────────────────────────────────────────────────────────────

describe("editRule", () => {
  it("reads latest version, then INSERTs version+1 with new text", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ version: 1, text: "old text" })],
      () => [],
    ]);
    const result = await editRule(query, TBL, {
      rule_id: "rule-uuid",
      assigned_by: "bob@activeloop.ai",
      text: "new text",
    });
    expect(result).toEqual({ rule_id: "rule-uuid", version: 2 });
    expect(calls).toHaveLength(2);
    // ORDER BY carries the tie-break compound key (see getRuleLatest test below).
    expect(calls[0]).toMatch(/^SELECT .* FROM "hivemind_rules" WHERE rule_id = 'rule-uuid' ORDER BY version DESC, created_at DESC LIMIT 1$/);
    expect(calls[1]).toMatch(/^INSERT INTO "hivemind_rules"/);
    expect(calls[1]).toContain(`E'new text'`);
    expect(calls[1]).toContain(", 2, ");
    expect(calls[1]).toContain("'bob@activeloop.ai'");
  });

  it("carries over previous text when only status is changed", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ version: 3, text: "preserve me", status: "active" })],
      () => [],
    ]);
    const result = await editRule(query, TBL, {
      rule_id: "rule-uuid",
      assigned_by: "bob@activeloop.ai",
      status: "done",
    });
    expect(result.version).toBe(4);
    expect(calls[1]).toContain(`E'preserve me'`);
    expect(calls[1]).toContain("'done'");
  });

  it("throws when rule_id does not exist", async () => {
    const { calls, query } = mockQuery([() => []]);
    await expect(
      editRule(query, TBL, {
        rule_id: "missing",
        assigned_by: "a@b",
        text: "doesn't matter",
      }),
    ).rejects.toThrow(/Rule not found: missing/);
    // Only the SELECT was issued — no wasted INSERT.
    expect(calls).toHaveLength(1);
  });

  it("rejects empty text on edit, leaving the SELECT-but-no-INSERT trail", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ version: 1 })],
      () => [],
    ]);
    await expect(
      editRule(query, TBL, {
        rule_id: "rule-uuid",
        assigned_by: "a@b",
        text: "",
      }),
    ).rejects.toThrow(/must not be empty/);
    expect(calls).toHaveLength(1); // SELECT only
  });
});

// ── markRuleDone ────────────────────────────────────────────────────────────

describe("markRuleDone", () => {
  it("INSERTs version+1 with status='done' and preserves prior text", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ version: 2, text: "still useful text", status: "active" })],
      () => [],
    ]);
    const result = await markRuleDone(query, TBL, {
      rule_id: "rule-uuid",
      assigned_by: "alice@activeloop.ai",
    });
    expect(result).toEqual({ rule_id: "rule-uuid", version: 3 });
    expect(calls[1]).toContain("'done'");
    expect(calls[1]).toContain(`E'still useful text'`);
    expect(calls[1]).toContain(", 3, ");
  });

  it("is idempotent over the audit-trail dimension — re-done writes a new version anyway", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ version: 5, status: "done" })],
      () => [],
    ]);
    const result = await markRuleDone(query, TBL, {
      rule_id: "rule-uuid",
      assigned_by: "alice@activeloop.ai",
    });
    // Already-done rules still get a v+1 row — the new row records
    // "alice closed-again at 10:00", which is the audit trail the
    // version-bump pattern exists to give us.
    expect(result.version).toBe(6);
    expect(calls[1]).toContain("'done'");
  });
});

// ── listRules ───────────────────────────────────────────────────────────────

describe("listRules", () => {
  it("returns latest version per rule_id, active only, newest-first, default limit 10", async () => {
    // 3 distinct rules; rule A has versions 1 and 2, rule B has only v1,
    // rule C has v1 marked done. Latest dedup picks A.v2 (active), B.v1
    // (active), C.v1 (done — filtered out).
    const { calls, query } = mockQuery([
      () => [
        fakeRow({ id: "row-a2", rule_id: "A", version: 2, text: "A v2", created_at: "2026-05-20T10:02:00Z" }),
        fakeRow({ id: "row-a1", rule_id: "A", version: 1, text: "A v1", created_at: "2026-05-20T10:01:00Z" }),
        fakeRow({ id: "row-b1", rule_id: "B", version: 1, text: "B v1", created_at: "2026-05-20T10:00:00Z" }),
        fakeRow({ id: "row-c1", rule_id: "C", version: 1, status: "done", text: "C done", created_at: "2026-05-20T09:59:00Z" }),
      ],
      () => [],
    ]);
    const rows = await listRules(query, TBL);
    expect(rows.map(r => r.rule_id)).toEqual(["A", "B"]);
    expect(rows[0].text).toBe("A v2");
    expect(rows[0].version).toBe(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^SELECT .* FROM "hivemind_rules" ORDER BY version DESC, created_at DESC$/);
  });

  it("honors the status='all' filter (no status filter applied)", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ rule_id: "A", version: 1, status: "active" }),
        fakeRow({ rule_id: "B", version: 1, status: "done" }),
      ],
    ]);
    const rows = await listRules(query, TBL, { status: "all" });
    expect(rows.map(r => r.rule_id).sort()).toEqual(["A", "B"]);
  });

  it("honors status='done'", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ rule_id: "A", version: 1, status: "active" }),
        fakeRow({ rule_id: "B", version: 1, status: "done" }),
      ],
    ]);
    const rows = await listRules(query, TBL, { status: "done" });
    expect(rows.map(r => r.rule_id)).toEqual(["B"]);
  });

  it("respects the limit parameter", async () => {
    const { query } = mockQuery([
      () => Array.from({ length: 25 }, (_, i) =>
        fakeRow({
          rule_id: `rule-${i}`,
          version: 1,
          created_at: `2026-05-20T10:${String(i).padStart(2, "0")}:00Z`,
        }),
      ),
    ]);
    const rows = await listRules(query, TBL, { limit: 3 });
    expect(rows).toHaveLength(3);
    // Newest first by created_at
    expect(rows[0].rule_id).toBe("rule-24");
  });

  it("drops malformed rows (NaN version) silently rather than throwing", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ rule_id: "good", version: 1 }),
        { rule_id: "bad", version: "not-a-number" }, // garbage row
      ],
    ]);
    const rows = await listRules(query, TBL);
    expect(rows.map(r => r.rule_id)).toEqual(["good"]);
  });
});

// ── getRuleLatest ───────────────────────────────────────────────────────────

describe("getRuleLatest", () => {
  it("returns the single latest row for a rule_id", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ rule_id: "X", version: 5, text: "current" })],
    ]);
    const row = await getRuleLatest(query, TBL, "X");
    expect(row?.version).toBe(5);
    expect(row?.text).toBe("current");
    expect(calls[0]).toMatch(/LIMIT 1$/);
    expect(calls[0]).toContain(`rule_id = 'X'`);
  });

  it("orders by (version DESC, created_at DESC) — deterministic tie-break under concurrent v=N+1 race", async () => {
    // Regression guard for the race surfaced by codex review on S2:
    // two concurrent editors both INSERT version=N+1 for the same
    // rule_id. Without created_at in the ORDER BY, SELECT returns
    // either row arbitrarily, so a subsequent edit can resurrect the
    // older v=N+1's text. listRules already uses this compound key
    // (see "newest-first by created_at" test); getRuleLatest must
    // match so single-rule and list reads agree.
    const { calls, query } = mockQuery([() => []]);
    await getRuleLatest(query, TBL, "X");
    expect(calls[0]).toContain("ORDER BY version DESC, created_at DESC");
    expect(calls[0]).not.toMatch(/ORDER BY version DESC LIMIT 1/);
  });

  it("returns null when nothing matches", async () => {
    const { query } = mockQuery([() => []]);
    const row = await getRuleLatest(query, TBL, "missing");
    expect(row).toBeNull();
  });

  it("escapes the rule_id in the WHERE clause", async () => {
    const { calls, query } = mockQuery([() => []]);
    await getRuleLatest(query, TBL, "x' OR '1'='1");
    // Single quote in input gets doubled
    expect(calls[0]).toContain(`rule_id = 'x'' OR ''1''=''1'`);
  });
});
