/**
 * Tests for the cross-platform open helper. The pure mappings get
 * exhaustive coverage; the spawn-wrapping `openInBrowser` is tested
 * via an injected stub so no real child process starts during tests.
 */

import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

import {
  findBinaryOnPath,
  openCommandFor,
  openInBrowser,
  resolveOpenPlatform,
} from "../../src/dashboard/open.js";

function fakeChild() {
  const ee = new EventEmitter() as EventEmitter & { unref: () => void };
  ee.unref = vi.fn();
  return ee;
}

describe("openCommandFor", () => {
  it("uses xdg-open on linux", () => {
    expect(openCommandFor("linux", "/x/y.html"))
      .toEqual({ command: "xdg-open", args: ["/x/y.html"] });
  });
  it("uses open on darwin", () => {
    expect(openCommandFor("darwin", "/x/y.html"))
      .toEqual({ command: "open", args: ["/x/y.html"] });
  });
  it("uses 'cmd /c start \"\" <path>' on win32 to dodge the title-arg trap", () => {
    expect(openCommandFor("win32", "C:\\x\\y.html"))
      .toEqual({ command: "cmd", args: ["/c", "start", "", "C:\\x\\y.html"] });
  });
});

describe("resolveOpenPlatform", () => {
  it("returns one of the known platforms when called on this host", () => {
    const got = resolveOpenPlatform();
    expect(got === null || got === "linux" || got === "darwin" || got === "win32").toBe(true);
  });
});

describe("openInBrowser", () => {
  it("returns attempted=false when platformOverride is null (unknown OS)", () => {
    const spawner = vi.fn();
    const result = openInBrowser("/whatever", { platformOverride: null, spawner: spawner as any });
    expect(result.attempted).toBe(false);
    expect(spawner).not.toHaveBeenCalled();
  });

  it("spawns the linux helper and reports the command name", () => {
    const child = fakeChild();
    const spawner = vi.fn().mockReturnValue(child);
    const result = openInBrowser("/tmp/dash.html", {
      platformOverride: "linux",
      spawner: spawner as any,
      binaryExists: () => true,
    });
    expect(result.attempted).toBe(true);
    expect(result.command).toBe("xdg-open");
    expect(spawner).toHaveBeenCalledWith(
      "xdg-open",
      ["/tmp/dash.html"],
      expect.objectContaining({ stdio: "ignore", detached: true }),
    );
    expect(child.unref).toHaveBeenCalled();
  });

  it("returns attempted=false WITHOUT spawning when the helper isn't on PATH", () => {
    // codex review on commit 4: spawn() doesn't throw synchronously
    // for missing binaries, so the CLI was lying about opening.
    const spawner = vi.fn();
    const result = openInBrowser("/tmp/dash.html", {
      platformOverride: "linux",
      spawner: spawner as any,
      binaryExists: () => false,
    });
    expect(result.attempted).toBe(false);
    expect(result.command).toBeUndefined();
    expect(spawner).not.toHaveBeenCalled();
  });

  it("passes the platform's helper name to binaryExists", () => {
    const seen: string[] = [];
    const binaryExists = (cmd: string) => { seen.push(cmd); return true; };
    const child = fakeChild();
    openInBrowser("/x", { platformOverride: "darwin", binaryExists, spawner: vi.fn().mockReturnValue(child) as any });
    openInBrowser("/x", { platformOverride: "linux",  binaryExists, spawner: vi.fn().mockReturnValue(child) as any });
    openInBrowser("/x", { platformOverride: "win32",  binaryExists, spawner: vi.fn().mockReturnValue(child) as any });
    expect(seen).toEqual(["open", "xdg-open", "cmd"]);
  });

  it("returns attempted=false when spawner throws (defense-in-depth)", () => {
    const spawner = vi.fn(() => { throw new Error("ENOENT xdg-open"); });
    const result = openInBrowser("/tmp/dash.html", {
      platformOverride: "linux",
      spawner: spawner as any,
      binaryExists: () => true,
    });
    expect(result.attempted).toBe(false);
    expect(result.command).toBeUndefined();
  });

  it("swallows post-spawn 'error' events so a flaky helper doesn't crash the CLI", () => {
    const child = fakeChild();
    const spawner = vi.fn().mockReturnValue(child);
    openInBrowser("/tmp/dash.html", {
      platformOverride: "darwin",
      spawner: spawner as any,
      binaryExists: () => true,
    });
    // Fire the error AFTER the call returned — the handler attached
    // inside openInBrowser should absorb it without re-throwing.
    expect(() => child.emit("error", new Error("helper crashed"))).not.toThrow();
  });

  it("works even when the returned child lacks unref (older platforms)", () => {
    const ee = new EventEmitter() as EventEmitter & { unref?: () => void };
    const spawner = vi.fn().mockReturnValue(ee);
    expect(() => openInBrowser("/tmp/dash.html", {
      platformOverride: "linux",
      spawner: spawner as any,
      binaryExists: () => true,
    })).not.toThrow();
  });
});

describe("findBinaryOnPath", () => {
  it("locates a binary that is in PATH (uses /usr/bin/env or /bin/sh as probe)", () => {
    // Use a binary essentially guaranteed to exist on POSIX hosts and
    // CI. If neither is present (extremely minimal container) the test
    // is environment-dependent; in that case skip.
    const candidate = findBinaryOnPath("sh") ?? findBinaryOnPath("env");
    expect(candidate).not.toBeNull();
  });
  it("returns null for a clearly non-existent binary name", () => {
    expect(findBinaryOnPath("definitely-not-a-real-helper-xxx-12345")).toBeNull();
  });
  it("ignores a same-named non-executable file on PATH (POSIX)", async () => {
    // Codex/CodeRabbit on PR #194: without an X_OK check, a man page
    // or sentinel file named the same as the helper would claim
    // "found". Stage a fake binary that's NOT marked executable and
    // verify the helper doesn't accept it.
    if (nodePlatform() !== "linux" && nodePlatform() !== "darwin") return; // skip on win32
    const { mkdtempSync, writeFileSync, chmodSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "hm-path-probe-"));
    try {
      const bin = join(dir, "fake-not-exec-helper-xyz");
      writeFileSync(bin, "#!/bin/sh\necho hi\n");
      chmodSync(bin, 0o644); // explicitly NON-executable
      const originalPath = process.env.PATH;
      process.env.PATH = `${dir}${":"}${originalPath ?? ""}`;
      try {
        expect(findBinaryOnPath("fake-not-exec-helper-xyz")).toBeNull();
        // Then mark it executable and expect it to be found.
        chmodSync(bin, 0o755);
        expect(findBinaryOnPath("fake-not-exec-helper-xyz")).toBe(bin);
      } finally {
        if (originalPath === undefined) delete process.env.PATH;
        else process.env.PATH = originalPath;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Import node:os platform for the conditional skip above. Imported at
// the bottom because the test block needs it but we don't want it
// polluting the top of the file for tests that don't reference it.
import { platform as nodePlatform } from "node:os";
