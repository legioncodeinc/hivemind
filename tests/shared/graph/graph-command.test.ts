import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseReadTargetPath, tryGraphRead } from "../../../src/graph/graph-command.js";

/**
 * graph-command.ts is the shared parser the per-agent pre-tool-use hooks
 * (Claude Code, Cursor, Codex, Hermes) call to route a `cat /graph/*` read to
 * the local snapshot. The routing/parsing is what's tested here; the snapshot
 * rendering itself is covered by vfs-handler tests.
 */

describe("parseReadTargetPath", () => {
  it("extracts the path from a plain cat", () => {
    expect(parseReadTargetPath("cat /graph/index.md")).toBe("/graph/index.md");
  });

  it("extracts the path from head with -n", () => {
    expect(parseReadTargetPath("head -n 20 /graph/find/foo")).toBe("/graph/find/foo");
    expect(parseReadTargetPath("head -20 /graph/find/foo")).toBe("/graph/find/foo");
    expect(parseReadTargetPath("head /graph/find/foo")).toBe("/graph/find/foo");
  });

  it("extracts the path from tail", () => {
    expect(parseReadTargetPath("tail -n 5 /graph/show/3")).toBe("/graph/show/3");
    expect(parseReadTargetPath("tail /graph/show/3")).toBe("/graph/show/3");
  });

  it("extracts the path from cat piped into a SINGLE head/tail (ignoring the pipe)", () => {
    expect(parseReadTargetPath("cat /graph/index.md | head -n 5")).toBe("/graph/index.md");
    expect(parseReadTargetPath("cat /graph/index.md | tail -5")).toBe("/graph/index.md");
  });

  // Codex review P1: a cat piped through grep (or any non-head/tail, or a
  // second pipe) must NOT be treated as a graph read — it has to reach real
  // shell/grep semantics, otherwise we'd return the unfiltered body.
  it("returns null when cat is piped through grep or multiple pipes", () => {
    expect(parseReadTargetPath("cat /graph/index.md | grep foo")).toBeNull();
    expect(parseReadTargetPath("cat /graph/index.md | grep foo | head")).toBeNull();
    expect(parseReadTargetPath("cat /graph/index.md | head | grep foo")).toBeNull();
    expect(parseReadTargetPath("cat /graph/index.md | sed -n 1p")).toBeNull();
  });

  // Codex review P3: quoted paths and leading flags must still resolve.
  it("strips surrounding quotes from the path", () => {
    expect(parseReadTargetPath('cat "/graph/index.md"')).toBe("/graph/index.md");
    expect(parseReadTargetPath("cat '/graph/find/foo'")).toBe("/graph/find/foo");
  });

  it("skips leading flags (cat -n, head -n N, head -N)", () => {
    expect(parseReadTargetPath("cat -n /graph/index.md")).toBe("/graph/index.md");
    expect(parseReadTargetPath("head -n 20 /graph/find/foo")).toBe("/graph/find/foo");
    expect(parseReadTargetPath("head -20 /graph/find/foo")).toBe("/graph/find/foo");
  });

  it("tolerates a 2>/dev/null redirect", () => {
    expect(parseReadTargetPath("cat /graph/index.md 2>/dev/null")).toBe("/graph/index.md");
  });

  it("returns null for non-read commands", () => {
    expect(parseReadTargetPath("grep foo /graph/index.md")).toBeNull();
    expect(parseReadTargetPath("echo hi")).toBeNull();
    expect(parseReadTargetPath("rm /graph/index.md")).toBeNull();
    expect(parseReadTargetPath("ls /graph")).toBeNull();
  });

  // Codex review round 2: a multi-file read must NOT collapse to the first
  // operand — it has to reach real shell semantics, not be answered as a
  // single graph read with the rest silently dropped.
  it("returns null for multi-file reads", () => {
    expect(parseReadTargetPath("cat /graph/index.md /tmp/other")).toBeNull();
    expect(parseReadTargetPath("head /graph/index.md /tmp/other")).toBeNull();
    expect(parseReadTargetPath("cat -n /graph/index.md /graph/find/x")).toBeNull();
  });
});

describe("tryGraphRead — routing", () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "graphcmd-")); });
  afterEach(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("returns null when the command does not target /graph/", () => {
    expect(tryGraphRead("cat /summaries/foo.md", tmp)).toBeNull();
    expect(tryGraphRead("cat /index.md", tmp)).toBeNull();
    expect(tryGraphRead("grep x /graph/foo", tmp)).toBeNull();
    expect(tryGraphRead("echo hello", tmp)).toBeNull();
  });

  it("lists the graph root for `ls /graph` and bare reads of /graph", () => {
    const listing = "index.md\nfind/\nquery/\nshow/\nimpact/\nneighborhood/\nlayers\ntour\npath/\n";
    expect(tryGraphRead("ls /graph", tmp)).toBe(listing);
    expect(tryGraphRead("ls -la /graph/", tmp)).toBe(listing);
    expect(tryGraphRead("cat /graph", tmp)).toBe(listing);
    expect(tryGraphRead("cat /graph/", tmp)).toBe(listing);
  });

  it("dispatches a /graph/* read to the VFS (no-graph in a fresh dir, never null, never throws)", () => {
    // A tmp dir has no snapshot → handleGraphVfs returns a no-graph result,
    // which tryGraphRead renders inline. The point: a /graph/ read is ALWAYS
    // handled (non-null) so the agent never falls through to a real `cat` of a
    // path that doesn't exist on disk.
    const body = tryGraphRead("cat /graph/index.md", tmp);
    expect(body).not.toBeNull();
    expect(typeof body).toBe("string");
    expect(body).toMatch(/no-graph|Code Graph/);
  });

  it("does not treat a grep of a /graph/ path as a graph read", () => {
    // grep isn't a read command we synthesize; leave it to the grep fast-path.
    expect(tryGraphRead("grep foo /graph/find/bar", tmp)).toBeNull();
  });

  // Codex review P2: a path that escapes the subtree via `..` must not be
  // dispatched to the graph VFS just because it starts with /graph/.
  it("refuses path traversal out of the graph subtree", () => {
    expect(tryGraphRead("cat /graph/../secret", tmp)).toBeNull();
    expect(tryGraphRead("cat /graph/find/../../etc/passwd", tmp)).toBeNull();
  });

  it("does not intercept a cat piped through grep (P1)", () => {
    expect(tryGraphRead("cat /graph/index.md | grep foo", tmp)).toBeNull();
  });
});
