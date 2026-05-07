import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadManifest,
  saveManifest,
  recordPull,
  removePullEntry,
  entriesForRoot,
  manifestPath,
  type PulledEntry,
} from "../../src/skilify/manifest.js";

let fakeHome: string;
let originalHome: string | undefined;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "skilify-manifest-"));
  originalHome = process.env.HOME;
  process.env.HOME = fakeHome;
});

afterEach(() => {
  try { rmSync(fakeHome, { recursive: true, force: true }); } catch { /* nothing */ }
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
});

const sampleEntry = (over: Partial<PulledEntry> = {}): PulledEntry => ({
  dirName: "deploy--alice",
  name: "deploy",
  author: "alice",
  projectKey: "abcd1234abcd1234",
  remoteVersion: 1,
  install: "global",
  installRoot: "/home/test/.claude/skills",
  pulledAt: "2026-05-07T00:00:00.000Z",
  ...over,
});

describe("manifestPath", () => {
  it("resolves to ~/.deeplake/state/skilify/pulled.json under HOME", () => {
    expect(manifestPath()).toBe(join(fakeHome, ".deeplake", "state", "skilify", "pulled.json"));
  });
});

describe("loadManifest", () => {
  it("returns empty manifest when file missing", () => {
    expect(loadManifest()).toEqual({ version: 1, entries: [] });
  });

  it("parses a well-formed manifest", () => {
    const m = { version: 1 as const, entries: [sampleEntry()] };
    saveManifest(m);
    expect(loadManifest()).toEqual(m);
  });

  it("treats unparseable JSON as empty (fail-safe)", () => {
    const path = manifestPath();
    saveManifest({ version: 1, entries: [] }); // ensure parent dir exists
    writeFileSync(path, "not valid json {{{");
    expect(loadManifest()).toEqual({ version: 1, entries: [] });
  });

  it("treats wrong-version manifests as empty", () => {
    saveManifest({ version: 1, entries: [] });
    writeFileSync(manifestPath(), JSON.stringify({ version: 2, entries: [sampleEntry()] }));
    expect(loadManifest()).toEqual({ version: 1, entries: [] });
  });

  it("drops malformed entries while keeping good ones", () => {
    saveManifest({ version: 1, entries: [] });
    writeFileSync(manifestPath(), JSON.stringify({
      version: 1,
      entries: [
        sampleEntry({ dirName: "good--alice" }),
        { dirName: "" }, // empty dirName — drop
        { dirName: "bad-no-name", name: "", author: "x", install: "global", installRoot: "/x" }, // empty name
        { dirName: "bad-bad-install", name: "x", author: "y", install: "weird", installRoot: "/x" }, // wrong install enum
        sampleEntry({ dirName: "good2--bob" }),
      ],
    }));
    const m = loadManifest();
    expect(m.entries.map(e => e.dirName)).toEqual(["good--alice", "good2--bob"]);
  });
});

describe("saveManifest", () => {
  it("writes JSON with trailing newline + 0o600 perms via atomic rename", () => {
    saveManifest({ version: 1, entries: [sampleEntry()] });
    const path = manifestPath();
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(raw);
    expect(parsed.entries[0].dirName).toBe("deploy--alice");
    // No leftover .tmp file from the atomic rename
    expect(existsSync(`${path}.tmp`)).toBe(false);
    // Permissions hardened (file contains the install root path which leaks
    // some local layout info; not secret but tightens the default).
    const mode = statSync(path).mode & 0o777;
    expect(mode & 0o077).toBe(0); // no group/other perms
  });

  it("creates parent directories on first write", () => {
    expect(existsSync(join(fakeHome, ".deeplake"))).toBe(false);
    saveManifest({ version: 1, entries: [] });
    expect(existsSync(join(fakeHome, ".deeplake", "state", "skilify"))).toBe(true);
  });
});

describe("recordPull", () => {
  it("appends a new entry when none exists", () => {
    recordPull(sampleEntry());
    expect(loadManifest().entries).toHaveLength(1);
  });

  it("replaces an existing entry on the same (install, dirName)", () => {
    recordPull(sampleEntry({ remoteVersion: 1, pulledAt: "2026-01-01T00:00:00Z" }));
    recordPull(sampleEntry({ remoteVersion: 2, pulledAt: "2026-05-01T00:00:00Z" }));
    const m = loadManifest();
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0].remoteVersion).toBe(2);
    expect(m.entries[0].pulledAt).toBe("2026-05-01T00:00:00Z");
  });

  it("keeps cross-install entries separate (global vs project, same dirName)", () => {
    recordPull(sampleEntry({ install: "global", installRoot: "/g" }));
    recordPull(sampleEntry({ install: "project", installRoot: "/p" }));
    const m = loadManifest();
    expect(m.entries).toHaveLength(2);
    expect(m.entries.map(e => e.install).sort()).toEqual(["global", "project"]);
  });
});

describe("removePullEntry", () => {
  it("removes a matching entry", () => {
    recordPull(sampleEntry({ dirName: "a--alice" }));
    recordPull(sampleEntry({ dirName: "b--bob" }));
    removePullEntry("global", "a--alice");
    expect(loadManifest().entries.map(e => e.dirName)).toEqual(["b--bob"]);
  });

  it("is idempotent when the entry doesn't exist", () => {
    recordPull(sampleEntry({ dirName: "x--alice" }));
    removePullEntry("global", "nonexistent");
    expect(loadManifest().entries).toHaveLength(1);
  });

  it("keys removal by (install, dirName)", () => {
    recordPull(sampleEntry({ install: "global",  dirName: "deploy--alice", installRoot: "/g" }));
    recordPull(sampleEntry({ install: "project", dirName: "deploy--alice", installRoot: "/p" }));
    removePullEntry("global", "deploy--alice");
    const m = loadManifest();
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0].install).toBe("project");
  });
});

describe("entriesForRoot", () => {
  it("filters by install AND installRoot", () => {
    const m = {
      version: 1 as const,
      entries: [
        sampleEntry({ install: "global", installRoot: "/h1/.claude/skills" }),
        sampleEntry({ install: "global", installRoot: "/h2/.claude/skills", dirName: "x--alice" }),
        sampleEntry({ install: "project", installRoot: "/h1/.claude/skills", dirName: "y--alice" }),
      ],
    };
    const filtered = entriesForRoot(m, "global", "/h1/.claude/skills");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].dirName).toBe("deploy--alice");
  });
});
