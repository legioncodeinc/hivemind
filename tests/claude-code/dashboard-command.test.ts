/**
 * End-to-end-ish tests for `hivemind dashboard`. fetchOrgStats is
 * mocked at the module boundary; everything else (data loading,
 * rendering, file IO) runs for real against tmpdir + overridden
 * HOME. The opener is injected as a stub so no browser actually
 * launches during tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { orgStatsMock } = vi.hoisted(() => ({ orgStatsMock: vi.fn() }));
vi.mock("../../src/notifications/sources/org-stats.js", () => ({
  fetchOrgStats: orgStatsMock,
}));

import {
  defaultDashboardOutPath,
  parseDashboardArgs,
  runDashboardCommand,
} from "../../src/commands/dashboard.js";
import { deriveProjectKey } from "../../src/skillify/state.js";

describe("parseDashboardArgs", () => {
  it("returns help for --help / -h", () => {
    expect(parseDashboardArgs(["--help"]).help).toBe(true);
    expect(parseDashboardArgs(["-h"]).help).toBe(true);
  });
  it("defaults cwd to process.cwd(), open=true, outPath empty", () => {
    const r = parseDashboardArgs([]);
    expect(r.args?.cwd).toBe(process.cwd());
    expect(r.args?.open).toBe(true);
    expect(r.args?.outPath).toBe("");
  });
  it("parses --no-open", () => {
    expect(parseDashboardArgs(["--no-open"]).args?.open).toBe(false);
  });
  it("parses --cwd <value> AND --cwd=value forms", () => {
    expect(parseDashboardArgs(["--cwd", "/foo"]).args?.cwd).toBe("/foo");
    expect(parseDashboardArgs(["--cwd=/bar"]).args?.cwd).toBe("/bar");
  });
  it("parses --out <value> AND --out=value forms", () => {
    expect(parseDashboardArgs(["--out", "/o.html"]).args?.outPath).toBe("/o.html");
    expect(parseDashboardArgs(["--out=/p.html"]).args?.outPath).toBe("/p.html");
  });
  it("errors on unknown flags", () => {
    expect(parseDashboardArgs(["--nope"]).error).toMatch(/unknown/);
  });
  it("errors on a dangling --cwd / --out with no value", () => {
    expect(parseDashboardArgs(["--cwd"]).error).toMatch(/requires a value/);
    expect(parseDashboardArgs(["--out"]).error).toMatch(/requires a value/);
  });
  it("rejects a flag token used as the value for --cwd / --out", () => {
    // codex review on commit 4: `--out --no-open` previously wrote a
    // file called `./--no-open`.
    expect(parseDashboardArgs(["--cwd", "--no-open"]).error).toMatch(/--cwd requires a value/);
    expect(parseDashboardArgs(["--out", "--no-open"]).error).toMatch(/--out requires a value/);
    expect(parseDashboardArgs(["--out", "-foo"]).error).toMatch(/--out requires a value/);
  });
});

describe("defaultDashboardOutPath", () => {
  it("lives under HOME/.hivemind/dashboards/<repo-key>/index.html", () => {
    const home = process.env.HOME ?? "";
    expect(defaultDashboardOutPath("deadbeef")).toBe(
      join(home, ".hivemind", "dashboards", "deadbeef", "index.html"),
    );
  });
});

describe("runDashboardCommand", () => {
  let homeDir: string;
  let originalHome: string | undefined;
  let stdout: string;
  let stderr: string;
  const out = (s: string) => { stdout += s; };
  const err = (s: string) => { stderr += s; };

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "hm-dash-cli-"));
    originalHome = process.env.HOME;
    process.env.HOME = homeDir;
    stdout = "";
    stderr = "";
    orgStatsMock.mockReset();
    orgStatsMock.mockResolvedValue(null);
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("--help prints USAGE and returns 0", async () => {
    const code = await runDashboardCommand(["--help"], { out, err });
    expect(code).toBe(0);
    expect(stdout).toContain("hivemind dashboard");
    expect(stdout).toContain("Usage:");
    expect(stderr).toBe("");
  });

  it("returns 2 and prints USAGE on unknown flag", async () => {
    const code = await runDashboardCommand(["--bogus"], { out, err });
    expect(code).toBe(2);
    expect(stderr).toContain("unknown arg");
    expect(stderr).toContain("Usage:");
  });

  it("writes the HTML to the default path under HOME and reports it", async () => {
    const opener = vi.fn().mockReturnValue({ attempted: true, command: "xdg-open" });
    const code = await runDashboardCommand(["--cwd", "/tmp"], { out, err, opener });
    expect(code).toBe(0);
    const { key } = deriveProjectKey("/tmp");
    const expectedPath = join(homeDir, ".hivemind", "dashboards", key, "index.html");
    expect(existsSync(expectedPath)).toBe(true);
    expect(stdout).toContain(`Wrote ${expectedPath}`);
    expect(stdout).toContain("Opening via xdg-open");
    const html = readFileSync(expectedPath, "utf-8");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("hivemind dashboard");
    // Empty-state for graph because we never built one
    expect(html).toContain("No graph snapshot yet");
    // Empty-state for KPIs because no creds and no usage stats
    expect(html).toContain("Run a session to start tracking");
  });

  it("respects --out and writes to the requested path", async () => {
    const outPath = join(homeDir, "custom", "dash.html");
    const opener = vi.fn().mockReturnValue({ attempted: false });
    const code = await runDashboardCommand(
      ["--cwd", "/tmp", "--out", outPath, "--no-open"],
      { out, err, opener },
    );
    expect(code).toBe(0);
    expect(existsSync(outPath)).toBe(true);
    expect(opener).not.toHaveBeenCalled();
    expect(stdout).not.toContain("Opening via");
  });

  it("--no-open does NOT call the opener", async () => {
    const opener = vi.fn();
    await runDashboardCommand(["--cwd", "/tmp", "--no-open"], { out, err, opener });
    expect(opener).not.toHaveBeenCalled();
  });

  it("reports the 'open manually' line when the opener returns attempted=false", async () => {
    const opener = vi.fn().mockReturnValue({ attempted: false });
    await runDashboardCommand(["--cwd", "/tmp"], { out, err, opener });
    expect(stdout).toContain("no opener for this platform");
  });

  it("surfaces a runtime write failure as a one-line stderr instead of a stack", async () => {
    // --out points at a child of an existing FILE (not a directory).
    // mkdir -p there fails with ENOTDIR; the catch block must convert
    // that into a one-liner rather than letting node print a stack.
    const { writeFileSync } = await import("node:fs");
    const fileMasqueradingAsDir = join(homeDir, "iamafile");
    writeFileSync(fileMasqueradingAsDir, "x");
    const bogusOut = join(fileMasqueradingAsDir, "nested", "dash.html");

    const code = await runDashboardCommand(
      ["--cwd", "/tmp", "--out", bogusOut, "--no-open"],
      { out, err, opener: vi.fn() },
    );
    expect(code).toBe(1);
    expect(stderr).toContain("failed to write");
    // No node-style stack trace in the rendered error.
    expect(stderr).not.toContain("at Object.");
  });
});
