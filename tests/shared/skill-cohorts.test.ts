import { describe, it, expect, vi } from "vitest";
import {
  listSkillSessions,
  cohortsForSkill,
  reconstructSession,
  skillKey,
  type SessionAttribution,
} from "../../src/skillify/skill-cohorts.js";

const TABLE = "sessions";

/** A query mock that returns canned rows and records the SQL it was asked. */
function mockQuery(rows: Array<Record<string, unknown>>) {
  const calls: string[] = [];
  const fn = vi.fn(async (sql: string) => { calls.push(sql); return rows; });
  return { fn, calls };
}

const activeRow = (sessionId: string, skills: unknown, bucket: number, ts: string, asString = false) => {
  const msg = { type: "skills_active", session_id: sessionId, skills, ab_bucket: bucket };
  return { message: asString ? JSON.stringify(msg) : msg, last_update_date: ts };
};

describe("listSkillSessions", () => {
  it("filters on description='skills_active' and orders newest-first with the limit", async () => {
    const { fn, calls } = mockQuery([]);
    await listSkillSessions(fn, TABLE, { sinceIso: "2026-06-01T00:00:00Z", limit: 50 });
    expect(calls[0]).toContain(`FROM "sessions"`);
    expect(calls[0]).toContain("description = 'skills_active'");
    expect(calls[0]).toContain("last_update_date >= '2026-06-01T00:00:00Z'");
    expect(calls[0]).toContain("ORDER BY last_update_date DESC");
    expect(calls[0]).toContain("LIMIT 50");
  });

  it("parses both JSON-string and object message payloads", async () => {
    const { fn } = mockQuery([
      activeRow("S1", [{ name: "a", author: "x", version: 2 }], 1, "t2", false), // object
      activeRow("S2", [{ name: "b", author: "y", version: 3 }], 0, "t1", true),  // JSON string
    ]);
    const got = await listSkillSessions(fn, TABLE);
    expect(got).toEqual([
      { sessionId: "S1", skills: [{ name: "a", author: "x", version: 2 }], bucket: 1, ts: "t2" },
      { sessionId: "S2", skills: [{ name: "b", author: "y", version: 3 }], bucket: 0, ts: "t1" },
    ]);
  });

  it("dedups a session to its newest row (rows arrive newest-first) and drops malformed", async () => {
    const { fn } = mockQuery([
      activeRow("S1", [{ name: "a", author: "x", version: 1 }], 1, "newer"),
      activeRow("S1", [{ name: "a", author: "x", version: 1 }], 1, "older"), // same session → skipped
      { message: "not json", last_update_date: "t" },                        // unparseable → skipped
      { message: { type: "user_message", content: "hi" }, last_update_date: "t" }, // wrong type → skipped
      { message: { type: "skills_active", skills: [] }, last_update_date: "t" },   // no session_id → skipped
    ]);
    const got = await listSkillSessions(fn, TABLE);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ sessionId: "S1", ts: "newer" });
  });

  it("coerces missing/garbage skill fields safely (defaults version 1, drops non-objects)", async () => {
    const { fn } = mockQuery([
      activeRow("S1", [{ name: "a", author: "x" }, "garbage", { name: "b" /* no author */ }], 0, "t"),
    ]);
    const got = await listSkillSessions(fn, TABLE);
    expect(got[0].skills).toEqual([{ name: "a", author: "x", version: 1 }]);
  });

  it("omits the LIMIT clause when no limit is given", async () => {
    const { fn, calls } = mockQuery([]);
    await listSkillSessions(fn, TABLE);
    expect(calls[0]).not.toContain("LIMIT");
  });
});

describe("cohortsForSkill", () => {
  const S = (id: string, skills: Array<[string, string]>): SessionAttribution => ({
    sessionId: id, bucket: 0, ts: "t",
    skills: skills.map(([name, author]) => ({ name, author, version: 1 })),
  });

  it("splits sessions into treatment (skill present) and control (absent)", () => {
    const sessions = [
      S("s1", [["posthog", "kamo"], ["other", "z"]]), // treatment
      S("s2", [["other", "z"]]),                        // control
      S("s3", [["posthog", "kamo"]]),                   // treatment
      S("s4", []),                                       // control (no skills)
      S("s5", [["posthog", "DIFFERENT"]]),              // control (same name, other author)
    ];
    const { treatment, control } = cohortsForSkill(sessions, "posthog", "kamo");
    expect(treatment.map((s) => s.sessionId)).toEqual(["s1", "s3"]);
    expect(control.map((s) => s.sessionId)).toEqual(["s2", "s4", "s5"]); // s5: name matches, author doesn't
  });

  it("skillKey is name--author", () => {
    expect(skillKey("posthog", "kamo")).toBe("posthog--kamo");
  });
});

describe("reconstructSession", () => {
  it("orders by creation_date, keeps user/assistant turns, drops tool noise + empty", async () => {
    const { fn, calls } = mockQuery([
      { message: { type: "user_message", content: "do X" } },
      { message: { type: "tool_call", tool_input: "{}", tool_response: "{}" } }, // dropped (no content)
      { message: { type: "assistant_message", content: "did X" } },
      { message: { type: "assistant_message", content: "   " } },                 // dropped (blank)
      { message: JSON.stringify({ type: "user_message", content: "thanks" }) },   // string payload
    ]);
    const out = await reconstructSession(fn, TABLE, "abc-123");
    expect(calls[0]).toContain("path LIKE '/sessions/%abc-123%'");
    expect(calls[0]).toContain("ORDER BY creation_date ASC");
    expect(out).toBe("USER: do X\n\nASSISTANT: did X\n\nUSER: thanks");
  });

  it("head+tail elides a transcript longer than maxChars", async () => {
    const big = "x".repeat(500);
    const { fn } = mockQuery([
      { message: { type: "user_message", content: big } },
      { message: { type: "assistant_message", content: big } },
    ]);
    const out = await reconstructSession(fn, TABLE, "s", 200);
    expect(out).toContain("chars elided");
    expect(out.length).toBeLessThan(400); // ~maxChars + the elision marker, far below the ~1000 raw
  });

  it("escapes single quotes in the session id (no SQL break)", async () => {
    const { fn, calls } = mockQuery([]);
    await reconstructSession(fn, TABLE, "a'b");
    expect(calls[0]).toContain("/sessions/%a''b%");
  });
});
