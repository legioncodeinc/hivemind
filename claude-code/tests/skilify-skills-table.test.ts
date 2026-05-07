import { describe, expect, it } from "vitest";
import { insertSkillRow, createSkillsTableSql } from "../../src/skilify/skills-table.js";

type Call = { sql: string };

function spyQuery(opts: { failFirstWith?: string } = {}) {
  const calls: Call[] = [];
  let firstCallSeen = false;
  const query = async (sql: string) => {
    calls.push({ sql });
    if (opts.failFirstWith && !firstCallSeen) {
      firstCallSeen = true;
      throw new Error(opts.failFirstWith);
    }
    return [];
  };
  return { calls, query };
}

const baseArgs = {
  tableName: "skills",
  name: "my-skill",
  project: "my-project",
  projectKey: "abcdef0123456789",
  localPath: "/tmp/x/.claude/skills/my-skill/SKILL.md",
  install: "project" as const,
  sourceSessions: ["s1", "s2"],
  sourceAgent: "claude_code",
  scope: "me" as const,
  author: "alice",
  description: "Does X",
  trigger: "When X",
  body: "## Workflow\n\nDo it.",
  version: 1,
  createdAt: "2026-05-06T00:00:00.000Z",
  updatedAt: "2026-05-06T00:00:00.000Z",
};

describe("insertSkillRow", () => {
  it("emits exactly one INSERT when the table exists", async () => {
    const { calls, query } = spyQuery();
    await insertSkillRow({ query, ...baseArgs });

    expect(calls).toHaveLength(1);
    const sql = calls[0].sql;
    expect(sql).toMatch(/^INSERT INTO "skills"/);
    expect(sql).toContain("'my-skill'");
    expect(sql).toContain("'my-project'");
    expect(sql).toContain("'abcdef0123456789'");
    expect(sql).toContain("'project'");          // install
    expect(sql).toContain("'claude_code'");
    expect(sql).toContain("'me'");
    expect(sql).toContain("'alice'");
    expect(sql).toContain("'Does X'");
    expect(sql).toContain("'When X'");
    expect(sql).toContain(`'["s1","s2"]'`);     // source_sessions JSON-encoded
    expect(sql).toContain(", 1, ");              // version is a bare integer, not quoted
    expect(sql).toContain("'2026-05-06T00:00:00.000Z'");
  });

  it("uses the supplied id when one is passed", async () => {
    const { calls, query } = spyQuery();
    await insertSkillRow({ query, ...baseArgs, id: "deadbeef-1234" });
    expect(calls[0].sql).toContain("'deadbeef-1234'");
  });

  it("escapes single quotes in body, description, etc.", async () => {
    const { calls, query } = spyQuery();
    await insertSkillRow({
      query, ...baseArgs,
      description: "It's tricky",
      body: "say 'hi'",
    });
    // Single quotes must be doubled — verify the SQL is well-formed and
    // contains the doubled-quote pattern.
    expect(calls[0].sql).toContain("'It''s tricky'");
    expect(calls[0].sql).toContain("'say ''hi'''");
  });

  it("on first INSERT failing because the table is missing, runs CREATE then retries the INSERT", async () => {
    const { calls, query } = spyQuery({ failFirstWith: "Table does not exist: relation \"skills\" does not exist" });
    await insertSkillRow({ query, ...baseArgs });

    // 3 calls: failed INSERT, CREATE TABLE, retried INSERT
    expect(calls).toHaveLength(3);
    expect(calls[0].sql).toMatch(/^INSERT INTO/);
    expect(calls[1].sql).toMatch(/^CREATE TABLE IF NOT EXISTS "skills"/);
    expect(calls[2].sql).toMatch(/^INSERT INTO/);
    // Retry must use the SAME insert text — same uuid is reused, etc.
    expect(calls[0].sql).toBe(calls[2].sql);
  });

  it("does NOT lazy-create the table on a generic error (only on missing-table)", async () => {
    const { calls, query } = spyQuery({ failFirstWith: "syntax error" });
    await expect(insertSkillRow({ query, ...baseArgs })).rejects.toThrow(/syntax error/);
    // One call, no CREATE attempt
    expect(calls).toHaveLength(1);
  });
});

describe("createSkillsTableSql", () => {
  it("includes every column the worker writes to", () => {
    const sql = createSkillsTableSql("skills");
    for (const col of [
      "id", "name", "project", "project_key", "local_path", "install",
      "source_sessions", "source_agent", "scope", "author",
      "description", "trigger_text", "body", "version", "created_at", "updated_at",
    ]) {
      expect(sql).toContain(`${col} `);
    }
    expect(sql).toContain("USING deeplake");
  });
});
