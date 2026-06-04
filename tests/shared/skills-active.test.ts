import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  listActiveOrgSkills,
  sessionBucket,
  buildSkillsActiveInsert,
} from "../../src/skillify/skills-active.js";

describe("listActiveOrgSkills", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-active-"));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns only `<name>--<author>` org dirs; excludes bare/local + malformed + files", () => {
    fs.mkdirSync(path.join(root, "posthog-event-smoke-testing--kamo.aghbalyan"));
    fs.mkdirSync(path.join(root, "pg-deeplake-test-crash-debugging--sasun"));
    fs.mkdirSync(path.join(root, "plan-confirm-then-execute")); // bare local — excluded
    fs.mkdirSync(path.join(root, "baz--")); // malformed (empty author) — excluded
    fs.writeFileSync(path.join(root, "notes--x.txt"), "x"); // file, not dir — excluded

    const got = listActiveOrgSkills(root);
    expect(got).toEqual([
      { name: "pg-deeplake-test-crash-debugging", author: "sasun", version: 1 },
      { name: "posthog-event-smoke-testing", author: "kamo.aghbalyan", version: 1 },
    ]); // sorted by name; exactly the 2 valid org skills; version defaults to 1 (no SKILL.md)
    expect(got).toHaveLength(2); // count: bare/malformed/file all dropped
  });

  it("returns [] for a missing skills root (never throws)", () => {
    expect(listActiveOrgSkills(path.join(root, "does-not-exist"))).toEqual([]);
  });

  it("splits on the LAST `--` so authors with hyphens survive", () => {
    fs.mkdirSync(path.join(root, "some-skill--first-last"));
    expect(listActiveOrgSkills(root)).toEqual([{ name: "some-skill", author: "first-last", version: 1 }]);
  });

  it("reads the skill version from SKILL.md frontmatter (enables v1-vs-v2)", () => {
    fs.mkdirSync(path.join(root, "evolving-skill--sasun"));
    fs.writeFileSync(
      path.join(root, "evolving-skill--sasun", "SKILL.md"),
      "---\nname: evolving-skill\nversion: 5\n---\nbody",
    );
    expect(listActiveOrgSkills(root)).toEqual([{ name: "evolving-skill", author: "sasun", version: 5 }]);
  });
});

describe("sessionBucket", () => {
  it("is deterministic for the same session id", () => {
    expect(sessionBucket("abc-123")).toBe(sessionBucket("abc-123"));
  });
  it("stays within [0, buckets)", () => {
    for (const id of ["a", "b", "c", "xyz", "1874a6b2"]) {
      const b = sessionBucket(id, 2);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(2);
    }
  });
  it("assigns both buckets across many ids (not constant)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(sessionBucket(`session-${i}`));
    expect(seen).toEqual(new Set([0, 1])); // both arms populated → real randomization
  });
});

describe("buildSkillsActiveInsert", () => {
  const base = {
    sessionsTable: "sessions",
    sessionPath: "/sessions/kamo/kamo_activeloop_hivemind_S1.jsonl",
    filename: "kamo_activeloop_hivemind_S1.jsonl",
    userName: "kamo",
    projectName: "hivemind",
    pluginVersion: "0.7.99",
    sessionId: "S1",
    cwd: "/home/kamo/proj",
    skills: [{ name: "pg-deeplake-test-crash-debugging", author: "sasun", version: 3 }],
    bucket: 1,
    ts: "2026-06-03T00:00:00.000Z",
  };

  it("emits exactly ONE insert into the sessions table (no second mutation)", () => {
    const sql = buildSkillsActiveInsert(base);
    expect((sql.match(/INSERT INTO/g) ?? []).length).toBe(1);
    expect((sql.match(/UPDATE /g) ?? []).length).toBe(0);
    expect(sql).toContain('INSERT INTO "sessions"');
  });

  it("writes a skills_active message with the skills, count, and bucket", () => {
    const sql = buildSkillsActiveInsert(base);
    const m = sql.match(/'(\{.*\})'::jsonb/s);
    expect(m).toBeTruthy();
    const entry = JSON.parse(m![1]);
    expect(entry.type).toBe("skills_active");
    expect(entry.session_id).toBe("S1");
    expect(entry.skills).toEqual([{ name: "pg-deeplake-test-crash-debugging", author: "sasun", version: 3 }]);
    expect(entry.skills_count).toBe(1);
    expect(entry.ab_bucket).toBe(1);
  });

  it("leaves message_embedding NULL (no daemon round-trip at SessionStart)", () => {
    const sql = buildSkillsActiveInsert(base);
    expect(sql).toMatch(/::jsonb,\s*NULL,/);
  });

  it("does NOT masquerade as a captured turn type", () => {
    const sql = buildSkillsActiveInsert(base);
    expect(sql).not.toContain('"type":"user_message"');
    expect(sql).not.toContain('"type":"tool_call"');
    expect(sql).not.toContain('"type":"assistant_message"');
  });
});
