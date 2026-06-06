import { describe, it, expect, vi } from "vitest";
import { readCurrentSkillRow, publishImprovedSkill, SKILLOPT_CONTRIBUTOR } from "../../src/skillify/skill-org-publish.js";
import type { CurrentSkillRow } from "../../src/skillify/skill-org-publish.js";

describe("readCurrentSkillRow", () => {
  it("reads the latest-version row and parses JSON columns (contributors, source_sessions)", async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toContain('FROM "skills"');
      expect(sql).toContain("name = 'posthog'");
      expect(sql).toContain("author = 'kamo'");
      expect(sql).toContain("ORDER BY version DESC");
      return [{
        name: "posthog", author: "kamo", project: "deeplake-api", project_key: "pk1",
        local_path: ".claude/skills", install: "global",
        source_sessions: JSON.stringify(["s1", "s2"]), source_agent: "claude_code",
        scope: "me", contributors: JSON.stringify(["kamo"]),
        description: "smoke test posthog", trigger_text: "posthog test",
        body: "## Rules\n1. mock the client", version: 3,
      }];
    });
    const row = await readCurrentSkillRow(query, "skills", "posthog", "kamo");
    expect(row).toMatchObject({
      name: "posthog", author: "kamo", install: "global", scope: "me",
      sourceSessions: ["s1", "s2"], contributors: ["kamo"], version: 3,
      trigger: "posthog test", body: "## Rules\n1. mock the client",
    });
  });

  it("returns null when the skill isn't in the table", async () => {
    expect(await readCurrentSkillRow(async () => [], "skills", "ghost", "x")).toBeNull();
  });

  it("tolerates a legacy row with no contributors / non-JSON columns", async () => {
    const row = await readCurrentSkillRow(
      async () => [{ name: "x", author: "a", contributors: "", source_sessions: "", version: "2", install: "project", scope: "weird", body: "b" }],
      "skills", "x", "a",
    );
    expect(row).toMatchObject({ contributors: [], sourceSessions: [], version: 2, install: "project", scope: "me" });
  });
});

describe("publishImprovedSkill", () => {
  const base: CurrentSkillRow = {
    name: "posthog", author: "kamo", project: "deeplake-api", projectKey: "pk1",
    localPath: ".claude/skills", install: "global", sourceSessions: ["s1"],
    sourceAgent: "claude_code", scope: "me", contributors: ["kamo"],
    description: "smoke test", trigger: "posthog", body: "## Rules\n1. mock the client", version: 3,
  };

  it("INSERTs the improved body as version+1, scope=team, name/author unchanged", async () => {
    let sql = "";
    const query = vi.fn(async (s: string) => { sql = s; return undefined; });
    const res = await publishImprovedSkill({
      query, tableName: "skills", workspaceId: "ws1",
      current: base, newBody: "## Rules\n1. NEVER mock — assert on the real HTTP request",
      collaborator: "kamo@activeloop.ai", now: "2026-06-06T00:00:00Z",
    });

    expect(res.version).toBe(4);                       // 3 + 1
    expect(sql).toContain('INSERT INTO "skills"');
    expect(sql).toContain("'posthog'");                // name unchanged
    expect(sql).toContain("'kamo'");                   // author unchanged
    expect(sql).toContain("'team'");                   // scope promoted
    expect(sql).toContain("NEVER mock — assert on the real HTTP request"); // new body
    expect(sql).not.toContain("1. mock the client");   // old body gone from THIS row
    expect(sql).toContain(", 4, ");                    // version literal = 4
  });

  it("appends the collaborator AND the skillopt marker to contributors (deduped, original author kept first)", async () => {
    let sql = "";
    await publishImprovedSkill({
      query: async (s: string) => { sql = s; }, tableName: "skills", workspaceId: "ws1",
      current: base, newBody: "x", collaborator: "kamo@activeloop.ai", now: "t",
    });
    // contributors persisted as JSON — kamo (original) first, then collaborator, then skillopt
    expect(sql).toContain(JSON.stringify(["kamo", "kamo@activeloop.ai", SKILLOPT_CONTRIBUTOR]));
  });

  it("does not duplicate the skillopt marker if it's already a contributor", async () => {
    let sql = "";
    await publishImprovedSkill({
      query: async (s: string) => { sql = s; }, tableName: "skills", workspaceId: "ws1",
      current: { ...base, contributors: ["kamo", SKILLOPT_CONTRIBUTOR] }, newBody: "x", now: "t",
    });
    expect(sql).toContain(JSON.stringify(["kamo", SKILLOPT_CONTRIBUTOR]));
  });

  it("seeds [author] as the first contributor when the current row has none (legacy)", async () => {
    let sql = "";
    await publishImprovedSkill({
      query: async (s: string) => { sql = s; }, tableName: "skills", workspaceId: "ws1",
      current: { ...base, contributors: [] }, newBody: "x", now: "t",
    });
    expect(sql).toContain(JSON.stringify(["kamo", SKILLOPT_CONTRIBUTOR]));
  });
});
