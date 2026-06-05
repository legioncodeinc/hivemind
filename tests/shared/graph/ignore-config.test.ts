import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_IGNORE_DIRS,
  loadGraphIgnore,
  ignoreDirSet,
  pathHasIgnoredSegment,
} from "../../../src/graph/ignore-config.js";

describe("DEFAULT_IGNORE_DIRS", () => {
  it("covers the common pollution sources (incl. the previously-missed venv/env)", () => {
    for (const d of ["node_modules", "venv", "env", ".venv", "__pycache__", "site-packages", "dist"]) {
      expect(DEFAULT_IGNORE_DIRS).toContain(d);
    }
  });

  it("does NOT include source-like names that monorepos use for real code", () => {
    for (const d of ["packages", "bin", "lib", "src", "app"]) {
      expect(DEFAULT_IGNORE_DIRS).not.toContain(d);
    }
  });
});

describe("loadGraphIgnore", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graph-ignore-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("seeds ~/.deeplake/graph-ignore.json with defaults on first call", () => {
    const path = join(dir, "graph-ignore.json");
    expect(existsSync(path)).toBe(false);
    const cfg = loadGraphIgnore(dir);
    expect(existsSync(path)).toBe(true);                 // file written
    expect(cfg.respectGitignore).toBe(true);
    expect(cfg.ignoreDirs).toEqual([...DEFAULT_IGNORE_DIRS]);
    // the seeded file round-trips
    const onDisk = JSON.parse(readFileSync(path, "utf8"));
    expect(onDisk.ignoreDirs).toContain("venv");
  });

  it("honors a user-edited config (their list wins, defaults not forced back in)", () => {
    writeFileSync(join(dir, "graph-ignore.json"),
      JSON.stringify({ ignoreDirs: ["onlythis"], respectGitignore: false }));
    const cfg = loadGraphIgnore(dir);
    expect(cfg.ignoreDirs).toEqual(["onlythis"]);
    expect(cfg.respectGitignore).toBe(false);
  });

  it("falls back to defaults (no throw) on malformed JSON", () => {
    writeFileSync(join(dir, "graph-ignore.json"), "{ not valid json ");
    const cfg = loadGraphIgnore(dir);
    expect(cfg.ignoreDirs).toEqual([...DEFAULT_IGNORE_DIRS]);
    expect(cfg.respectGitignore).toBe(true);
  });

  it("falls back per-field when a present config has wrong types", () => {
    // valid JSON object, but ignoreDirs isn't an array and respectGitignore isn't a boolean
    writeFileSync(join(dir, "graph-ignore.json"),
      JSON.stringify({ ignoreDirs: "not-an-array", respectGitignore: 123 }));
    const cfg = loadGraphIgnore(dir);
    expect(cfg.ignoreDirs).toEqual([...DEFAULT_IGNORE_DIRS]); // non-array → defaults
    expect(cfg.respectGitignore).toBe(true);                  // non-boolean → true
  });
});

describe("pathHasIgnoredSegment", () => {
  const ignore = ignoreDirSet({ ignoreDirs: ["node_modules", "venv", "site-packages"], respectGitignore: true });

  it("drops files under an ignored dir at any depth", () => {
    expect(pathHasIgnoredSegment("venv/lib/python3.12/site.py", ignore)).toBe(true);
    expect(pathHasIgnoredSegment("a/b/node_modules/x/y.js", ignore)).toBe(true);
    expect(pathHasIgnoredSegment("srv/venv/site-packages/foo.py", ignore)).toBe(true);
  });

  it("drops files under a dot-directory (mirrors the manual walk)", () => {
    expect(pathHasIgnoredSegment("a/.hidden/b.py", ignore)).toBe(true);
  });

  it("keeps genuine source paths", () => {
    expect(pathHasIgnoredSegment("src/graph/resolve/cross-file.ts", ignore)).toBe(false);
    expect(pathHasIgnoredSegment("packages/core/index.ts", ignore)).toBe(false); // monorepo source
  });

  it("exempts a leading-dot FILE name (only directory segments are dot-skipped)", () => {
    expect(pathHasIgnoredSegment(".eslintrc.py", ignore)).toBe(false);
  });
});
