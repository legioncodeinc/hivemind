import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  diffSnapshots,
  loadSnapshotByCommit,
} from "../../../src/graph/diff.js";
import type {
  GraphEdge,
  GraphNode,
  GraphSnapshot,
} from "../../../src/graph/types.js";

function n(id: string, kind: GraphNode["kind"] = "function"): GraphNode {
  return {
    id,
    label: id.split(":")[1] ?? id,
    kind,
    source_file: id.split(":")[0] ?? "",
    source_location: "L1",
    language: "typescript",
    exported: false,
  };
}

function e(source: string, target: string, relation: GraphEdge["relation"] = "calls", ord?: number): GraphEdge {
  const edge: GraphEdge = { source, target, relation, confidence: "EXTRACTED" };
  if (ord !== undefined) edge.ord = ord;
  return edge;
}

function snap(nodes: GraphNode[], links: GraphEdge[]): GraphSnapshot {
  return {
    directed: true,
    multigraph: true,
    graph: { schema_version: 1, generator: "hivemind-graph", commit_sha: "x", repo_key: "k" },
    observation: {
      ts: "1970-01-01T00:00:00Z",
      branch: null,
      worktree_path: "/x",
      repo_project: "x",
      generator_version: "0.0",
      source_files_extracted: 0,
      source_files_skipped: 0,
    },
    nodes,
    links,
  };
}

describe("diffSnapshots — pure semantics", () => {
  it("identical snapshots → empty diff", () => {
    const s = snap([n("a.ts:foo:function")], [e("a.ts:foo:function", "a.ts:bar:function")]);
    const d = diffSnapshots(s, s);
    expect(d.counts).toEqual({ nodes_added: 0, nodes_removed: 0, edges_added: 0, edges_removed: 0 });
  });

  it("added node appears in nodes.added", () => {
    const a = snap([n("a.ts:foo:function")], []);
    const b = snap([n("a.ts:foo:function"), n("a.ts:bar:function")], []);
    const d = diffSnapshots(a, b);
    expect(d.counts.nodes_added).toBe(1);
    expect(d.counts.nodes_removed).toBe(0);
    expect(d.nodes.added.map((x) => x.id)).toEqual(["a.ts:bar:function"]);
  });

  it("removed node appears in nodes.removed", () => {
    const a = snap([n("a.ts:foo:function"), n("a.ts:bar:function")], []);
    const b = snap([n("a.ts:foo:function")], []);
    const d = diffSnapshots(a, b);
    expect(d.counts.nodes_added).toBe(0);
    expect(d.counts.nodes_removed).toBe(1);
    expect(d.nodes.removed.map((x) => x.id)).toEqual(["a.ts:bar:function"]);
  });

  it("edge with same (source,target,relation) but different ord is treated as distinct", () => {
    const a = snap([], [e("x", "y", "calls", 1)]);
    const b = snap([], [e("x", "y", "calls", 2)]);
    const d = diffSnapshots(a, b);
    expect(d.counts.edges_added).toBe(1);
    expect(d.counts.edges_removed).toBe(1);
  });

  it("edge with same (source,target) but different relation is treated as distinct", () => {
    const a = snap([], [e("x", "y", "calls")]);
    const b = snap([], [e("x", "y", "imports")]);
    const d = diffSnapshots(a, b);
    expect(d.counts.edges_added).toBe(1);
    expect(d.counts.edges_removed).toBe(1);
  });

  it("ord === undefined is treated as ord=0 for matching", () => {
    const a = snap([], [e("x", "y", "calls")]); // no ord
    const b = snap([], [e("x", "y", "calls", 0)]); // explicit 0
    const d = diffSnapshots(a, b);
    expect(d.counts.edges_added).toBe(0);
    expect(d.counts.edges_removed).toBe(0);
  });

  it("mixed add+remove on the same source file (refactor scenario)", () => {
    const a = snap(
      [n("a.ts:oldName:function"), n("a.ts:keep:function")],
      [e("a.ts:keep:function", "a.ts:oldName:function")],
    );
    const b = snap(
      [n("a.ts:newName:function"), n("a.ts:keep:function")],
      [e("a.ts:keep:function", "a.ts:newName:function")],
    );
    const d = diffSnapshots(a, b);
    expect(d.counts).toEqual({ nodes_added: 1, nodes_removed: 1, edges_added: 1, edges_removed: 1 });
    expect(d.nodes.added[0]!.id).toBe("a.ts:newName:function");
    expect(d.nodes.removed[0]!.id).toBe("a.ts:oldName:function");
  });
});

describe("loadSnapshotByCommit — disk I/O", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "graph-diff-load-"));
  });
  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("returns null when the file is missing", () => {
    expect(loadSnapshotByCommit(baseDir, "nonexistent")).toBeNull();
  });

  it("returns the parsed snapshot when present", () => {
    const s = snap([n("a.ts:foo:function")], []);
    mkdirSync(join(baseDir, "snapshots"), { recursive: true });
    writeFileSync(join(baseDir, "snapshots", "abc.json"), JSON.stringify(s));
    const loaded = loadSnapshotByCommit(baseDir, "abc");
    expect(loaded?.nodes[0]!.id).toBe("a.ts:foo:function");
  });

  it("returns null on corrupt JSON", () => {
    mkdirSync(join(baseDir, "snapshots"), { recursive: true });
    writeFileSync(join(baseDir, "snapshots", "broken.json"), "{ not valid");
    expect(loadSnapshotByCommit(baseDir, "broken")).toBeNull();
  });
});

describe("runDiffCommand — CLI integration", () => {
  let baseDir: string;
  let graphsHome: string;
  let workDir: string;
  const prevHome = process.env.HIVEMIND_GRAPHS_HOME;

  beforeEach(() => {
    graphsHome = mkdtempSync(join(tmpdir(), "graph-diff-home-"));
    workDir = mkdtempSync(join(tmpdir(), "graph-diff-work-"));
    process.env.HIVEMIND_GRAPHS_HOME = graphsHome;
  });
  afterEach(() => {
    if (prevHome === undefined) delete process.env.HIVEMIND_GRAPHS_HOME;
    else process.env.HIVEMIND_GRAPHS_HOME = prevHome;
    rmSync(graphsHome, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
  });

  function captureOut(fn: () => void): { out: string; err: string } {
    const out: string[] = [];
    const err: string[] = [];
    const ls = vi.spyOn(console, "log").mockImplementation((...a) => { out.push(a.map(String).join(" ")); });
    const es = vi.spyOn(console, "error").mockImplementation((...a) => { err.push(a.map(String).join(" ")); });
    try { fn(); }
    finally { ls.mockRestore(); es.mockRestore(); }
    return { out: out.join("\n"), err: err.join("\n") };
  }

  async function writeSnap(commit: string, s: GraphSnapshot): Promise<string> {
    const { deriveProjectKey } = await import("../../../src/utils/repo-identity.js");
    const { repoDir } = await import("../../../src/graph/snapshot.js");
    baseDir = repoDir(deriveProjectKey(workDir).key);
    mkdirSync(join(baseDir, "snapshots"), { recursive: true });
    writeFileSync(join(baseDir, "snapshots", `${commit}.json`), JSON.stringify(s));
    return baseDir;
  }

  it("prints diff between two existing snapshots (human format)", async () => {
    await writeSnap("aaa", snap([n("a.ts:foo:function")], []));
    await writeSnap("bbb", snap([n("a.ts:foo:function"), n("a.ts:bar:function")], []));
    const { runGraphCommand } = await import("../../../src/commands/graph.js");
    const { out } = captureOut(() => runGraphCommand(["diff", "aaa", "bbb", "--cwd", workDir]));
    expect(out).toContain("Diff: aaa → bbb");
    expect(out).toContain("Nodes: +1 -0   Edges: +0 -0");
    expect(out).toContain("a.ts:bar:function");
  });

  it("--json emits parseable JSON", async () => {
    await writeSnap("aaa", snap([n("a.ts:foo:function")], []));
    await writeSnap("bbb", snap([], []));
    const { runGraphCommand } = await import("../../../src/commands/graph.js");
    const { out } = captureOut(() => runGraphCommand(["diff", "aaa", "bbb", "--cwd", workDir, "--json"]));
    const parsed = JSON.parse(out);
    expect(parsed.counts.nodes_removed).toBe(1);
    expect(parsed.nodes.removed[0].id).toBe("a.ts:foo:function");
  });

  it("missing source snapshot → exit 1 with hint", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit(${code})`);
    }) as never);
    try {
      const { runGraphCommand } = await import("../../../src/commands/graph.js");
      const { err } = captureOut(() => {
        try { runGraphCommand(["diff", "missing", "x", "--cwd", workDir]); } catch { /* exit */ }
      });
      expect(err).toContain("snapshot not found for missing");
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("wrong arg count → exit 2", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit(${code})`);
    }) as never);
    try {
      const { runGraphCommand } = await import("../../../src/commands/graph.js");
      const { err } = captureOut(() => {
        try { runGraphCommand(["diff", "only-one-sha"]); } catch { /* exit */ }
      });
      expect(err).toContain("expected exactly two commit SHAs");
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      exitSpy.mockRestore();
    }
  });
});
