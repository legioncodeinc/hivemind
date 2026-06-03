import { describe, it, expect } from "vitest";

import { annotateNodeDegrees } from "../../../src/graph/node-metadata.js";
import type { GraphEdge, GraphNode } from "../../../src/graph/types.js";

function node(id: string, exported: boolean): GraphNode {
  return { id, label: id, kind: "function", source_file: "a.ts", source_location: "L1", language: "typescript", exported };
}
function edge(source: string, target: string): GraphEdge {
  return { source, target, relation: "calls", confidence: "EXTRACTED" };
}

describe("annotateNodeDegrees (B4)", () => {
  it("computes fan_in / fan_out from the edge set", () => {
    const a = node("a", true), b = node("b", false), c = node("c", false);
    annotateNodeDegrees([a, b, c], [edge("a", "b"), edge("a", "c"), edge("c", "b")]);
    expect(a.fan_out).toBe(2);
    expect(a.fan_in).toBe(0);
    expect(b.fan_in).toBe(2);
    expect(b.fan_out).toBe(0);
    expect(c.fan_in).toBe(1);
    expect(c.fan_out).toBe(1);
  });

  it("marks exported nodes with zero fan_in as entrypoints", () => {
    const root = node("root", true), used = node("used", true), internal = node("internal", false);
    annotateNodeDegrees([root, used, internal], [edge("root", "used")]);
    expect(root.is_entrypoint).toBe(true);   // exported, nothing points at it
    expect(used.is_entrypoint).toBe(false);  // exported but fan_in=1
    expect(internal.is_entrypoint).toBe(false); // fan_in=0 but NOT exported
  });

  it("handles nodes with no edges (all zero)", () => {
    const x = node("x", false);
    annotateNodeDegrees([x], []);
    expect(x.fan_in).toBe(0);
    expect(x.fan_out).toBe(0);
    expect(x.is_entrypoint).toBe(false);
  });

  it("ignores edges whose endpoint is not a node (degrees still computed per node)", () => {
    const a = node("a", true);
    annotateNodeDegrees([a], [edge("a", "external:x"), edge("ghost", "a")]);
    expect(a.fan_out).toBe(1); // a -> external:x
    expect(a.fan_in).toBe(1);  // ghost -> a (ghost isn't a node, but a's in-degree counts it)
    expect(a.is_entrypoint).toBe(false);
  });
});
