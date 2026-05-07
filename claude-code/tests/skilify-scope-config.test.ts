import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadScopeConfig, saveScopeConfig } from "../../src/skilify/scope-config.js";

const STATE_DIR = join(homedir(), ".deeplake", "state", "skilify");
const CONFIG_PATH = join(STATE_DIR, "config.json");
let backup: string | null = null;

beforeEach(() => {
  // Back up the user's real config so the tests can mutate it freely.
  if (existsSync(CONFIG_PATH)) backup = readFileSync(CONFIG_PATH, "utf-8");
  else backup = null;
  try { rmSync(CONFIG_PATH); } catch { /* nothing */ }
});

afterEach(() => {
  if (backup !== null) {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, backup);
  } else {
    try { rmSync(CONFIG_PATH); } catch { /* nothing */ }
  }
});

describe("loadScopeConfig", () => {
  it("returns the default when no config file exists", () => {
    const cfg = loadScopeConfig();
    expect(cfg).toEqual({ scope: "me", team: [], install: "project" });
  });

  it("returns the default when config file is malformed JSON", () => {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, "{this isn't json");
    expect(loadScopeConfig()).toEqual({ scope: "me", team: [], install: "project" });
  });

  it("loads a valid config and respects every field", () => {
    saveScopeConfig({ scope: "team", team: ["alice", "bob"], install: "global" });
    expect(loadScopeConfig()).toEqual({ scope: "team", team: ["alice", "bob"], install: "global" });
  });

  it("normalises scope: any value other than team/org becomes 'me'", () => {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify({ scope: "bogus", team: [], install: "project" }));
    expect(loadScopeConfig().scope).toBe("me");
  });

  it("filters team to strings only — non-strings are dropped", () => {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify({ scope: "team", team: ["alice", 42, null, "bob"], install: "project" }));
    expect(loadScopeConfig().team).toEqual(["alice", "bob"]);
  });

  it("returns empty team when raw.team is not an array", () => {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify({ scope: "me", team: "not-array", install: "project" }));
    expect(loadScopeConfig().team).toEqual([]);
  });

  it("normalises install: only 'global' is recognised, otherwise 'project'", () => {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify({ scope: "me", team: [], install: "weird" }));
    expect(loadScopeConfig().install).toBe("project");
  });
});

describe("saveScopeConfig", () => {
  it("creates the state dir if missing and writes valid JSON", () => {
    try { rmSync(STATE_DIR, { recursive: true }); } catch { /* nothing */ }
    saveScopeConfig({ scope: "org", team: [], install: "global" });
    expect(existsSync(CONFIG_PATH)).toBe(true);
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    expect(parsed).toEqual({ scope: "org", team: [], install: "global" });
  });

  it("overwrites an existing config", () => {
    saveScopeConfig({ scope: "me", team: ["a"], install: "project" });
    saveScopeConfig({ scope: "team", team: ["b", "c"], install: "global" });
    expect(loadScopeConfig()).toEqual({ scope: "team", team: ["b", "c"], install: "global" });
  });
});
