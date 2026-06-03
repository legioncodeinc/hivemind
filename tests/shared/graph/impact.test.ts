import { describe, it, expect } from "vitest";

import { renderImpact } from "../../../src/graph/render/impact.js";
import type { GraphSnapshot, GraphNode, GraphEdge } from "../../../src/graph/types.js";

function node(id: string): GraphNode {
  return { id, label: id, kind: "function", source_file: "a.ts", source_location: "L1", language: "typescript", exported: true };
}
function calls(source: string, target: string): GraphEdge {
  return { source, target, relation: "calls", confidence: "EXTRACTED" };
}
function snap(nodes: GraphNode[], links: GraphEdge[]): GraphSnapshot {
  return {
    directed: true, multigraph: true,
    graph: { schema_version: 1, generator: "hivemind-graph", commit_sha: "c", repo_key: "k" },
    observation: { ts: "2026-06-03T00:00:00Z", branch: "m", worktree_path: "/t", repo_project: "t", generator_version: "0", source_files_extracted: 0, source_files_skipped: 0 },
    nodes, links,
  };
}

describe("renderImpact (B5)", () => {
  // Chain: a -> b -> c -> d  (a calls b calls c calls d). Dependents of d:
  // c (depth 1), b (depth 2), a (depth 3).
  const chain = snap(
    [node("a"), node("b"), node("c"), node("d")],
    [calls("a", "b"), calls("b", "c"), calls("c", "d")],
  );

  it("lists transitive dependents grouped by depth", () => {
    const body = renderImpact(chain, "d");
    expect(body).toContain("Impact of d");
    expect(body).toContain("3 dependents");
    expect(body).toContain("depth 1 (1):");
    expect(body).toMatch(/depth 1 \(1\):\s*\n\s*c/);
    expect(body).toContain("depth 2");
    expect(body).toContain("depth 3");
  });

  it("reports zero dependents for a leaf (nothing depends on it)", () => {
    const body = renderImpact(chain, "a"); // a has no incoming edges
    expect(body).toContain("No resolved dependents");
  });

  it("does not double-count in a cycle (a<->b)", () => {
    const cyc = snap([node("a"), node("b")], [calls("a", "b"), calls("b", "a")]);
    const body = renderImpact(cyc, "a");
    // b depends on a (depth 1); a itself is the target, not counted again.
    expect(body).toContain("1 dependent");
    expect(body).not.toContain("2 dependent");
  });

  it("returns a candidate list for an ambiguous pattern", () => {
    const s = snap([node("foo1"), node("foo2")], []);
    const body = renderImpact(s, "foo");
    expect(body).toContain("matches 2 nodes");
  });

  it("returns a no-match message for an unknown pattern", () => {
    const body = renderImpact(chain, "zzz");
    expect(body).toContain("No node matches");
  });

  it("counts dependents across relations (imports + calls), not just calls", () => {
    const s = snap(
      [node("lib"), node("user")],
      [{ source: "user", target: "lib", relation: "imports", confidence: "EXTRACTED" }],
    );
    const body = renderImpact(s, "lib");
    expect(body).toContain("1 dependent");
    expect(body).toContain("user");
  });
});
