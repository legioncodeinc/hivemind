/**
 * Direct unit tests for src/graph/extract/shared.ts helpers.
 * Covers branches not triggered by the language-extractor integration tests:
 * - pushNode duplicate detection
 * - collectParseErrors error/missing node paths
 * - firstOfType helper
 */

import { describe, it, expect } from "vitest";
import {
  pushNode,
  collectParseErrors,
  firstOfType,
  makeNode,
  makeModuleNode,
  nodeId,
  locationStr,
  textOfField,
  type TSNode,
} from "../../../src/graph/extract/shared.js";
import type { FileExtraction } from "../../../src/graph/types.js";

function makeResult(): FileExtraction {
  return { source_file: "f.ts", language: "typescript", nodes: [], edges: [], parse_errors: [] };
}

function makeGraphNode(id: string) {
  return {
    id, label: id, kind: "function" as const,
    source_file: "f.ts", source_location: "L1",
    language: "typescript" as const, exported: true,
  };
}

// Minimal TSNode stub
function stubNode(overrides: Partial<TSNode> = {}): TSNode {
  return {
    type: "identifier", text: "x",
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: 1 },
    isError: false, isMissing: false, hasError: false,
    namedChildCount: 0,
    parent: null,
    namedChild: () => null,
    namedChildren: [],
    childForFieldName: () => null,
    ...overrides,
  };
}

describe("pushNode", () => {
  it("adds a new node to result and declByName", () => {
    const result = makeResult();
    const map = new Map();
    const node = makeGraphNode("f.ts:foo:function");
    pushNode(result, map, node);
    expect(result.nodes).toHaveLength(1);
    expect(map.get("foo:function")).toBeUndefined(); // label is used as key
    expect(map.get(node.label)).toBe(node);
  });

  it("skips adding a duplicate node but still updates declByName if key is missing", () => {
    const result = makeResult();
    const map = new Map();
    const node = makeGraphNode("f.ts:foo:function");
    pushNode(result, map, node);
    // Push same node id again with a different lookup key
    pushNode(result, map, node, "alt-key");
    expect(result.nodes).toHaveLength(1); // no duplicate
    expect(map.get("alt-key")).toBe(node); // key was registered
  });

  it("skips declByName update if key already exists on duplicate", () => {
    const result = makeResult();
    const map = new Map();
    const node = makeGraphNode("f.ts:foo:function");
    pushNode(result, map, node);
    const other = makeGraphNode("f.ts:bar:function");
    map.set(node.label, other); // pre-occupy the key
    pushNode(result, map, node); // duplicate node, key already in map
    expect(result.nodes).toHaveLength(1);
    expect(map.get(node.label)).toBe(other); // not overwritten
  });
});

describe("collectParseErrors", () => {
  it("records nothing for a clean node tree", () => {
    const errors: any[] = [];
    collectParseErrors(stubNode(), "f.ts", errors);
    expect(errors).toHaveLength(0);
  });

  it("records an isError node", () => {
    const errors: any[] = [];
    collectParseErrors(stubNode({ isError: true }), "f.ts", errors);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("parse error");
    expect(errors[0].source_file).toBe("f.ts");
  });

  it("records an isMissing node with 'missing node' message", () => {
    const errors: any[] = [];
    collectParseErrors(stubNode({ isMissing: true }), "f.ts", errors);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("missing node");
  });

  it("recurses into children and collects nested errors", () => {
    const errors: any[] = [];
    const child = stubNode({ isError: true });
    const parent = stubNode({
      namedChildCount: 1,
      namedChild: (i: number) => (i === 0 ? child : null),
    });
    collectParseErrors(parent, "f.ts", errors);
    expect(errors).toHaveLength(1);
  });
});

describe("firstOfType", () => {
  it("returns the first child matching one of the given types", () => {
    const a = stubNode({ type: "identifier" });
    const b = stubNode({ type: "string" });
    const parent = stubNode({
      namedChildCount: 2,
      namedChild: (i: number) => [a, b][i] ?? null,
    });
    expect(firstOfType(parent, ["string"])).toBe(b);
  });

  it("returns null when no child matches", () => {
    const parent = stubNode({ namedChildCount: 0 });
    expect(firstOfType(parent, ["string"])).toBeNull();
  });
});

describe("nodeId", () => {
  it("formats as path:name:kind", () => {
    expect(nodeId("src/a.ts", "foo", "function")).toBe("src/a.ts:foo:function");
  });
});

describe("locationStr", () => {
  it("returns single-line format when start === end row", () => {
    const n = stubNode({ startPosition: { row: 4, column: 0 }, endPosition: { row: 4, column: 10 } });
    expect(locationStr(n)).toBe("L5");
  });

  it("returns range format for multi-line nodes", () => {
    const n = stubNode({ startPosition: { row: 2, column: 0 }, endPosition: { row: 5, column: 0 } });
    expect(locationStr(n)).toBe("L3-6");
  });
});

describe("makeModuleNode", () => {
  it("produces a module node with id = path::module", () => {
    const m = makeModuleNode("src/a.ts", "typescript");
    expect(m.id).toBe("src/a.ts::module");
    expect(m.kind).toBe("module");
    expect(m.exported).toBe(false);
  });
});

describe("textOfField", () => {
  it("returns null when field is absent", () => {
    expect(textOfField(stubNode(), "name")).toBeNull();
  });

  it("returns null when field text is empty", () => {
    const n = stubNode({ childForFieldName: () => stubNode({ text: "" }) });
    expect(textOfField(n, "name")).toBeNull();
  });

  it("returns text when field is present", () => {
    const n = stubNode({ childForFieldName: () => stubNode({ text: "foo" }) });
    expect(textOfField(n, "name")).toBe("foo");
  });
});
