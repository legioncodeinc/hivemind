import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

// Mock the loadConfig + DeeplakeApi so the pull subcommand can run without
// hitting the network. The mock returns a fake row from the skills table.
vi.mock("../../src/config.js", () => ({
  loadConfig: () => ({
    token: "tok", apiUrl: "x", orgId: "org", workspaceId: "ws",
    userName: "tester", skillsTableName: "skills",
    tableName: "memory", sessionsTableName: "sessions", memoryPath: "/m",
    orgName: "org",
  }),
}));
vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    async query(_sql: string) {
      return [{
        name: "fake-skill", project: "p", project_key: "pk",
        body: "body", version: 1, source_agent: "claude_code",
        scope: "me", author: "alice", description: "d",
        trigger_text: "", source_sessions: "[]", install: "global",
        created_at: "2026-01-01", updated_at: "2026-01-01",
      }];
    }
  },
}));

import { runSkilifyCommand } from "../../src/commands/skilify.js";

const STATE_DIR = join(homedir(), ".deeplake", "state", "skilify");
const CONFIG_PATH = join(STATE_DIR, "config.json");
let configBackup: string | null = null;
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let logged: string[] = [];
let erred: string[] = [];
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  if (existsSync(CONFIG_PATH)) configBackup = readFileSync(CONFIG_PATH, "utf-8");
  else configBackup = null;
  try { rmSync(CONFIG_PATH); } catch { /* nothing */ }
  logged = []; erred = [];
  logSpy = vi.spyOn(console, "log").mockImplementation((...args: any[]) => { logged.push(args.join(" ")); });
  errSpy = vi.spyOn(console, "error").mockImplementation((...args: any[]) => { erred.push(args.join(" ")); });
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => { throw new Error(`__EXIT_${code ?? 0}__`); }) as any);
});

afterEach(() => {
  // Restore cwd before any temp-dir cleanup happens — some tests do
  // `process.chdir(tempDir)` then `rmSync(tempDir)` later, leaving us in
  // a stale cwd that breaks subsequent tests' relative-path operations.
  try { process.chdir(originalCwd); } catch { /* nothing */ }
  if (configBackup !== null) { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(CONFIG_PATH, configBackup); }
  else try { rmSync(CONFIG_PATH); } catch { /* nothing */ }
  logSpy.mockRestore(); errSpy.mockRestore(); exitSpy.mockRestore();
});

function expectExit(code: number, fn: () => void): void {
  expect(fn).toThrow(new RegExp(`__EXIT_${code}__`));
}

// ── status (default) ──────────────────────────────────────────────────────

describe("status (default subcommand)", () => {
  it("prints scope, team, install when config is empty", () => {
    runSkilifyCommand([]);
    const out = logged.join("\n");
    expect(out).toMatch(/scope:\s+me/);
    expect(out).toMatch(/team:\s+\(empty\)/);
    expect(out).toMatch(/install:\s+project/);
  });

  it("`status` subcommand alias", () => {
    runSkilifyCommand(["status"]);
    expect(logged.join("\n")).toMatch(/scope:/);
  });
});

// ── scope ─────────────────────────────────────────────────────────────────

describe("scope", () => {
  it("sets scope=team", () => {
    runSkilifyCommand(["scope", "team"]);
    expect(logged.join("\n")).toMatch(/Scope set to 'team'/);
    expect(JSON.parse(readFileSync(CONFIG_PATH, "utf-8")).scope).toBe("team");
  });

  it("warns when scope=team but team list is empty", () => {
    runSkilifyCommand(["scope", "team"]);
    expect(logged.join("\n")).toMatch(/team list is empty/);
  });

  it("rejects invalid scope", () => {
    expectExit(1, () => runSkilifyCommand(["scope", "bogus"]));
    expect(erred.join("\n")).toMatch(/Invalid scope 'bogus'/);
  });

  it("rejects empty scope arg", () => {
    expectExit(1, () => runSkilifyCommand(["scope", ""]));
  });
});

// ── install ───────────────────────────────────────────────────────────────

describe("install", () => {
  it("sets install=global", () => {
    runSkilifyCommand(["install", "global"]);
    expect(logged.join("\n")).toMatch(/Install location set to 'global'/);
    expect(JSON.parse(readFileSync(CONFIG_PATH, "utf-8")).install).toBe("global");
  });

  it("sets install=project", () => {
    runSkilifyCommand(["install", "project"]);
    expect(JSON.parse(readFileSync(CONFIG_PATH, "utf-8")).install).toBe("project");
  });

  it("rejects invalid install location", () => {
    expectExit(1, () => runSkilifyCommand(["install", "weird"]));
  });
});

// ── team ──────────────────────────────────────────────────────────────────

describe("team", () => {
  it("adds, lists, removes a member", () => {
    runSkilifyCommand(["team", "add", "alice"]);
    expect(logged.join("\n")).toMatch(/Added 'alice'/);

    logged.length = 0;
    runSkilifyCommand(["team", "list"]);
    expect(logged.join("\n")).toMatch(/^alice$/m);

    logged.length = 0;
    runSkilifyCommand(["team", "remove", "alice"]);
    expect(logged.join("\n")).toMatch(/Removed 'alice'/);
  });

  it("dedupes when adding an existing name", () => {
    runSkilifyCommand(["team", "add", "alice"]);
    logged.length = 0;
    runSkilifyCommand(["team", "add", "alice"]);
    expect(logged.join("\n")).toMatch(/already in the team list/);
  });

  it("no-ops when removing a non-existent name", () => {
    runSkilifyCommand(["team", "remove", "ghost"]);
    expect(logged.join("\n")).toMatch(/not in the team list/);
  });

  it("team list when empty prints sentinel", () => {
    runSkilifyCommand(["team", "list"]);
    expect(logged.join("\n")).toMatch(/empty/);
  });

  it("rejects unknown team action", () => {
    expectExit(1, () => runSkilifyCommand(["team", "bogus"]));
  });

  it("rejects team add with no name", () => {
    expectExit(1, () => runSkilifyCommand(["team", "add"]));
  });

  it("rejects team remove with no name", () => {
    expectExit(1, () => runSkilifyCommand(["team", "remove"]));
  });
});

// ── promote ───────────────────────────────────────────────────────────────

describe("promote", () => {
  it("rejects empty skill name", () => {
    expectExit(1, () => runSkilifyCommand(["promote"]));
  });

  it("errors when project skill is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "skilify-cli-"));
    process.chdir(dir);
    expectExit(1, () => runSkilifyCommand(["promote", "nonexistent-skill"]));
    expect(erred.join("\n")).toMatch(/not found/);
    rmSync(dir, { recursive: true, force: true });
  });
});

// ── pull ──────────────────────────────────────────────────────────────────

describe("pull", () => {
  it("runs --dry-run and prints summary", async () => {
    runSkilifyCommand(["pull", "--dry-run"]);
    // Async — wait for promise tail
    await new Promise(r => setImmediate(r));
    const out = logged.join("\n");
    expect(out).toMatch(/Destination:/);
    expect(out).toMatch(/Filter:\s+all users/);
    expect(out).toMatch(/dry-run/);
  });

  it("--to global is default destination", async () => {
    runSkilifyCommand(["pull", "--dry-run"]);
    await new Promise(r => setImmediate(r));
    expect(logged.join("\n")).toMatch(/Destination:.*\.claude\/skills/);
  });

  it("--to project lands files in cwd/.claude/skills", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skilify-cli-pull-"));
    process.chdir(dir);
    runSkilifyCommand(["pull", "--to", "project", "--dry-run"]);
    await new Promise(r => setImmediate(r));
    expect(logged.join("\n")).toMatch(new RegExp(`Destination:\\s+${dir}/.claude/skills`));
    rmSync(dir, { recursive: true, force: true });
  });

  it("--user X filters by single author", async () => {
    runSkilifyCommand(["pull", "--user", "alice", "--dry-run"]);
    await new Promise(r => setImmediate(r));
    expect(logged.join("\n")).toMatch(/Filter:\s+alice/);
  });

  it("--users a,b,c filters by multiple authors", async () => {
    runSkilifyCommand(["pull", "--users", "alice,bob,carol", "--dry-run"]);
    await new Promise(r => setImmediate(r));
    expect(logged.join("\n")).toMatch(/Filter:\s+alice, bob, carol/);
  });

  it("--all-users explicitly filters by no author", async () => {
    runSkilifyCommand(["pull", "--all-users", "--dry-run"]);
    await new Promise(r => setImmediate(r));
    expect(logged.join("\n")).toMatch(/Filter:\s+all users/);
  });

  it("positional skill-name flows into the filter", async () => {
    runSkilifyCommand(["pull", "fake-skill", "--dry-run"]);
    await new Promise(r => setImmediate(r));
    expect(logged.join("\n")).toMatch(/skill='fake-skill'/);
  });

  // Note: validation errors inside pullSkills (e.g. --to weird, --user
  // without value) call process.exit() asynchronously inside a fire-
  // and-forget promise, so they can't be caught from a sync test.
  // The validation logic itself is exercised by direct pull.test.ts tests
  // (buildPullSql, resolvePullDestination).
});

// ── usage / unknown ───────────────────────────────────────────────────────

describe("usage", () => {
  it("--help prints usage", () => {
    runSkilifyCommand(["--help"]);
    expect(logged.join("\n")).toMatch(/Usage:/);
  });

  it("-h prints usage", () => {
    runSkilifyCommand(["-h"]);
    expect(logged.join("\n")).toMatch(/Usage:/);
  });

  it("unknown subcommand exits 1", () => {
    expectExit(1, () => runSkilifyCommand(["totally-unknown"]));
    expect(erred.join("\n")).toMatch(/Unknown skilify subcommand/);
  });
});
