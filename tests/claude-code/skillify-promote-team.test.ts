import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { insertSkillRowMock, readCurrentSkillRowMock } = vi.hoisted(() => ({
  insertSkillRowMock: vi.fn().mockResolvedValue(undefined),
  readCurrentSkillRowMock: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../src/config.js", () => ({
  loadConfig: vi.fn(() => ({
    token: "tok",
    apiUrl: "https://api.example.com",
    orgId: "org",
    workspaceId: "ws",
    userName: "tester",
    skillsTableName: "skills",
  })),
}));
vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    async query(_sql: string) {
      return [];
    }
  },
}));
vi.mock("../../src/skillify/skills-table.js", () => ({
  insertSkillRow: insertSkillRowMock,
}));
vi.mock("../../src/skillify/skill-org-publish.js", () => ({
  readCurrentSkillRow: readCurrentSkillRowMock,
}));

import { runSkillifyCommand } from "../../src/commands/skillify.js";

describe("promote --scope team", () => {
  let dir: string;
  let homeDir: string;
  let originalHome: string | undefined;
  let logged: string[];

  beforeEach(() => {
    insertSkillRowMock.mockClear();
    readCurrentSkillRowMock.mockClear();
    logged = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    dir = mkdtempSync(join(tmpdir(), "promote-team-cwd-"));
    homeDir = mkdtempSync(join(tmpdir(), "promote-team-home-"));
    originalHome = process.env.HOME;
    process.env.HOME = homeDir;
    process.chdir(dir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    rmSync(dir, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("publishes to org table with team scope after disk move", async () => {
    const skillDir = join(dir, ".claude", "skills", "share-me");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: share-me\ndescription: d\nauthor: tester\n---\n\nbody text\n",
    );

    runSkillifyCommand(["promote", "share-me", "--scope", "team"]);
    await new Promise((r) => setImmediate(r));

    expect(existsSync(join(homeDir, ".claude", "skills", "share-me", "SKILL.md"))).toBe(true);
    expect(insertSkillRowMock).toHaveBeenCalledTimes(1);
    expect(insertSkillRowMock.mock.calls[0][0].scope).toBe("team");
    expect(insertSkillRowMock.mock.calls[0][0].name).toBe("share-me");
    expect(logged.join("\n")).toMatch(/Published 'share-me' to org skills table at team scope \(v1\)/);
  });

  it("bumps version when skill already exists in org table", async () => {
    readCurrentSkillRowMock.mockResolvedValue({
      name: "share-me",
      author: "tester",
      project: "p",
      projectKey: "pk",
      localPath: "/old",
      install: "project",
      sourceSessions: [],
      sourceAgent: "claude_code",
      scope: "me",
      contributors: ["tester"],
      description: "d",
      trigger: "",
      body: "old body",
      version: 2,
    });
    const skillDir = join(dir, ".claude", "skills", "share-me");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: share-me\ndescription: d\nauthor: tester\n---\n\nnew body\n",
    );

    runSkillifyCommand(["promote", "share-me", "--scope", "team"]);
    await new Promise((r) => setImmediate(r));

    expect(insertSkillRowMock.mock.calls[0][0].version).toBe(3);
    expect(readFileSync(join(homeDir, ".claude", "skills", "share-me", "SKILL.md"), "utf-8")).toContain("new body");
  });
});
