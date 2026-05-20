import { describe, expect, it, vi } from "vitest";
import { tryAutoExtract } from "../../src/hooks/auto-extract.js";

/**
 * Unit tests for the orchestrator that the capture hook will call per
 * PostToolUse event. Mocks at the query boundary (the events module is
 * already independently tested in events.test.ts).
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
const OPTS = { agent: "claude_code", plugin_version: "0.7.99" };

// ── gating ─────────────────────────────────────────────────────────────────

describe("tryAutoExtract — gating", () => {
  it("returns null and runs NO query when hook_event_name is not PostToolUse", async () => {
    const { calls, query } = mockQuery([]);
    const out = await tryAutoExtract(query, TBL, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "gh pr merge 1" },
    }, OPTS);
    expect(out).toBeNull();
    expect(calls).toEqual([]);
  });

  it("returns null when tool_name is not Bash", async () => {
    const { calls, query } = mockQuery([]);
    const out = await tryAutoExtract(query, TBL, {
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: { command: "gh pr merge 1" },
    }, OPTS);
    expect(out).toBeNull();
    expect(calls).toEqual([]);
  });

  it("returns null when tool_input.command is missing or non-string", async () => {
    const { calls, query } = mockQuery([]);
    expect(await tryAutoExtract(query, TBL, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {},
    }, OPTS)).toBeNull();
    expect(await tryAutoExtract(query, TBL, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: 42 },
    }, OPTS)).toBeNull();
    expect(await tryAutoExtract(query, TBL, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: undefined,
    }, OPTS)).toBeNull();
    expect(calls).toEqual([]);
  });

  it("returns null when command does not match any pattern", async () => {
    const { calls, query } = mockQuery([]);
    const out = await tryAutoExtract(query, TBL, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "git push origin main" },
    }, OPTS);
    expect(out).toBeNull();
    expect(calls).toEqual([]);
  });
});

// ── happy path ─────────────────────────────────────────────────────────────

describe("tryAutoExtract — match → INSERT", () => {
  it("emits an orphan event (task_id='', kpi_id='') with source='auto-extract'", async () => {
    const { calls, query } = mockQuery([() => []]);
    const kind = await tryAutoExtract(query, TBL, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "gh pr merge 123 --auto" },
    }, OPTS);
    expect(kind).toBe("gh-pr-merge");
    expect(calls).toHaveLength(1);
    const sql = calls[0];
    expect(sql).toMatch(/^INSERT INTO "hivemind_task_events"/);
    // task_id and kpi_id are empty strings (orphan)
    expect(sql).toContain("'',");                      // task_id literal
    expect(sql).toContain("'auto-extract'");
    expect(sql).toContain("'claude_code'");
    expect(sql).toContain("'0.7.99'");                 // plugin_version
    expect(sql).toContain(`E'gh pr merge: gh pr merge 123 --auto'`);
    // value is 1 (positive integer literal, not quoted)
    expect(sql).toMatch(/, 1, E'/);
  });

  it("propagates the underlying query rejection (caller must catch)", async () => {
    const { query } = mockQuery([() => { throw new Error("network timeout"); }]);
    await expect(tryAutoExtract(query, TBL, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "gh pr merge" },
    }, OPTS)).rejects.toThrow(/network timeout/);
    // Contract: tryAutoExtract does NOT swallow errors — capture.ts
    // wraps the call in try/catch and logs. This test pins that
    // boundary so a future change can't silently start swallowing.
  });

  it("honors agent + plugin_version overrides", async () => {
    const { calls, query } = mockQuery([() => []]);
    await tryAutoExtract(query, TBL, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "gh pr merge" },
    }, { agent: "codex", plugin_version: "9.9.9" });
    expect(calls[0]).toContain("'codex'");
    expect(calls[0]).toContain("'9.9.9'");
  });

  it("does NOT match on commands containing the pattern as a substring", async () => {
    // Regression guard mirroring auto-extract-patterns.test.ts —
    // confirms the orchestrator inherits the anchored-regex behaviour
    // (no false positives on `echo "gh pr merge"`).
    const { calls, query } = mockQuery([]);
    const out = await tryAutoExtract(query, TBL, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: 'echo "gh pr merge" >> notes.md' },
    }, OPTS);
    expect(out).toBeNull();
    expect(calls).toEqual([]);
  });
});
