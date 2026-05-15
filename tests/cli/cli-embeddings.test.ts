import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, lstatSync, readlinkSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  disableEmbeddings,
  enableEmbeddings,
  findHivemindInstalls,
  installEmbeddings,
  isSharedDepsInstalled,
  killEmbedDaemon,
  linkStateFor,
  SHARED_DAEMON_PATH,
  SHARED_NODE_MODULES,
  TRANSFORMERS_PKG,
  uninstallEmbeddings,
} from "../../src/cli/embeddings.js";
import { _resetUserConfigForTesting, _setConfigPathForTesting, getEmbeddingsEnabled } from "../../src/user-config.js";

/**
 * Tests for the shared-deps embeddings installer's pure helpers. The
 * filesystem IS the boundary here (no network) so we drive these against
 * a real tmp dir rather than mocking node:fs — same approach as the
 * existing install-helpers / cli-install-* test files.
 */

let tmpHome: string;

function mkDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function fakeBundleAt(dir: string): void {
  mkDir(join(dir, "bundle"));
  writeFileSync(join(dir, "bundle", "session-start.js"), "//");
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "hivemind-embeddings-test-"));
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
});

// ── findHivemindInstalls ──────────────────────────────────────────────────

describe("findHivemindInstalls", () => {
  it("returns empty when nothing is installed", () => {
    expect(findHivemindInstalls(tmpHome)).toEqual([]);
  });

  it("detects codex/cursor/hermes when each has a bundle/ subdir", () => {
    fakeBundleAt(join(tmpHome, ".codex", "hivemind"));
    fakeBundleAt(join(tmpHome, ".cursor", "hivemind"));
    fakeBundleAt(join(tmpHome, ".hermes", "hivemind"));
    const installs = findHivemindInstalls(tmpHome);
    expect(installs.map(i => i.id).sort()).toEqual(["codex", "cursor", "hermes"]);
    for (const i of installs) {
      expect(i.pluginDir).toContain(tmpHome);
      expect(i.pluginDir).toMatch(/hivemind$/);
    }
  });

  it("ignores agent dirs that exist but lack a bundle/ subdir (incomplete install)", () => {
    mkDir(join(tmpHome, ".codex", "hivemind")); // exists but no bundle/
    expect(findHivemindInstalls(tmpHome)).toEqual([]);
  });

  it("detects every versioned Claude Code plugin in cache/hivemind/hivemind/", () => {
    const cache = join(tmpHome, ".claude", "plugins", "cache", "hivemind", "hivemind");
    fakeBundleAt(join(cache, "0.7.0"));
    fakeBundleAt(join(cache, "0.7.1"));
    const installs = findHivemindInstalls(tmpHome);
    expect(installs.map(i => i.id).sort()).toEqual(["claude (0.7.0)", "claude (0.7.1)"]);
  });

  it("supports the alternate <version>/claude-code/bundle layout", () => {
    const cache = join(tmpHome, ".claude", "plugins", "cache", "hivemind", "hivemind");
    fakeBundleAt(join(cache, "0.7.0", "claude-code"));
    const installs = findHivemindInstalls(tmpHome);
    expect(installs).toHaveLength(1);
    expect(installs[0].id).toBe("claude (0.7.0)");
  });

  it("skips entries in cache/hivemind/hivemind/ that aren't directories with bundles", () => {
    const cache = join(tmpHome, ".claude", "plugins", "cache", "hivemind", "hivemind");
    mkDir(cache);
    writeFileSync(join(cache, "stray-file"), ""); // not a dir
    mkDir(join(cache, "0.7.0")); // dir, but no bundle
    expect(findHivemindInstalls(tmpHome)).toEqual([]);
  });
});

// ── isSharedDepsInstalled ─────────────────────────────────────────────────

describe("isSharedDepsInstalled", () => {
  it("false when the transformers dir does not exist under <shared>/node_modules/", () => {
    const sharedNm = join(tmpHome, "embed-deps", "node_modules");
    expect(isSharedDepsInstalled(sharedNm)).toBe(false);
  });

  it("true when @huggingface/transformers is present under the given node_modules", () => {
    const sharedNm = join(tmpHome, "embed-deps", "node_modules");
    mkDir(join(sharedNm, TRANSFORMERS_PKG));
    expect(isSharedDepsInstalled(sharedNm)).toBe(true);
  });
});

// ── SHARED_DAEMON_PATH ────────────────────────────────────────────────────

describe("SHARED_DAEMON_PATH", () => {
  it("points at embed-daemon.js inside the shared-deps dir (canonical location agents use)", () => {
    expect(SHARED_DAEMON_PATH.endsWith("/embed-deps/embed-daemon.js")).toBe(true);
  });
});

// ── linkStateFor ──────────────────────────────────────────────────────────

describe("linkStateFor", () => {
  it("returns no-node-modules when the install dir has no node_modules at all", () => {
    fakeBundleAt(join(tmpHome, ".codex", "hivemind"));
    const state = linkStateFor({ id: "codex", pluginDir: join(tmpHome, ".codex", "hivemind") });
    expect(state.kind).toBe("no-node-modules");
  });

  it("returns linked-to-shared when node_modules is a symlink to the canonical shared dir", () => {
    const sharedNm = join(tmpHome, "shared-nm");
    mkDir(sharedNm);
    const pluginDir = join(tmpHome, ".codex", "hivemind");
    fakeBundleAt(pluginDir);
    symlinkSync(sharedNm, join(pluginDir, "node_modules"));
    const state = linkStateFor({ id: "codex", pluginDir }, sharedNm);
    expect(state.kind).toBe("linked-to-shared");
  });

  it("returns linked-elsewhere when node_modules is a symlink to a different target", () => {
    const otherDir = join(tmpHome, "other");
    mkDir(otherDir);
    const sharedNm = join(tmpHome, "shared-nm");
    const pluginDir = join(tmpHome, ".codex", "hivemind");
    fakeBundleAt(pluginDir);
    symlinkSync(otherDir, join(pluginDir, "node_modules"));
    const state = linkStateFor({ id: "codex", pluginDir }, sharedNm);
    expect(state.kind).toBe("linked-elsewhere");
    if (state.kind === "linked-elsewhere") expect(state.target).toBe(otherDir);
  });

  it("returns owns-own-node-modules when node_modules is a real directory", () => {
    const pluginDir = join(tmpHome, ".codex", "hivemind");
    fakeBundleAt(pluginDir);
    mkDir(join(pluginDir, "node_modules"));
    const state = linkStateFor({ id: "codex", pluginDir });
    expect(state.kind).toBe("owns-own-node-modules");
  });
});

// ── lightweight enable / disable: config-only, no fs install ──────────────

describe("enableEmbeddings / disableEmbeddings — config flag mutation", () => {
  let cfgPath: string;

  beforeEach(() => {
    cfgPath = join(tmpHome, "config.json");
    _setConfigPathForTesting(() => cfgPath);
  });

  afterEach(() => {
    _resetUserConfigForTesting();
  });

  it("enableEmbeddings writes embeddings.enabled:true to ~/.deeplake/config.json", () => {
    enableEmbeddings();
    expect(existsSync(cfgPath)).toBe(true);
    expect(JSON.parse(readFileSync(cfgPath, "utf-8"))).toEqual({ embeddings: { enabled: true } });
    expect(getEmbeddingsEnabled()).toBe(true);
  });

  it("disableEmbeddings writes embeddings.enabled:false to ~/.deeplake/config.json", () => {
    enableEmbeddings();
    disableEmbeddings();
    expect(JSON.parse(readFileSync(cfgPath, "utf-8"))).toEqual({ embeddings: { enabled: false } });
    expect(getEmbeddingsEnabled()).toBe(false);
  });

  it("disableEmbeddings is idempotent (no error when no daemon and no config)", () => {
    expect(() => disableEmbeddings()).not.toThrow();
    expect(getEmbeddingsEnabled()).toBe(false);
  });

  it("enableEmbeddings overrides a prior disableEmbeddings (last write wins)", () => {
    disableEmbeddings();
    enableEmbeddings();
    expect(getEmbeddingsEnabled()).toBe(true);
  });
});

// ── killEmbedDaemon: tolerant of every combination of missing files ───────

describe("killEmbedDaemon", () => {
  it("returns silently when there is no pidfile or socket (fresh machine)", () => {
    // SOCKET_DIR defaults to /tmp/.hivemind-embed-<random>/ in production — we
    // can't redirect that without monkey-patching. But the function only ever
    // reads + best-effort-deletes, so calling it when nothing exists is a
    // no-op by design.
    expect(() => killEmbedDaemon()).not.toThrow();
  });
});

// ── uninstall: writes config:false even when shared deps absent ───────────

describe("uninstallEmbeddings — config flag side effect", () => {
  let cfgPath: string;

  beforeEach(() => {
    cfgPath = join(tmpHome, "config.json");
    _setConfigPathForTesting(() => cfgPath);
  });

  afterEach(() => {
    _resetUserConfigForTesting();
  });

  it("flips embeddings.enabled:false even when there are no agent installs and no shared deps", () => {
    // No installs detected, no shared deps dir — uninstall still flips the flag.
    enableEmbeddings();
    uninstallEmbeddings();
    expect(getEmbeddingsEnabled()).toBe(false);
  });
});
