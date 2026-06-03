import { describe, it, expect } from "vitest";

import { repointImportEdges, resolveCrossFileCalls, resolveHeritageEdges, resolveModule } from "../../../src/graph/resolve/cross-file.js";
import type { FileExtraction, GraphEdge, GraphNode, ImportBinding, RawCall } from "../../../src/graph/types.js";

function node(id: string, label: string, source_file: string, exported = true, kind: GraphNode["kind"] = "function"): GraphNode {
  return { id, label, kind, source_file, source_location: "L1", language: "typescript", exported };
}

function extraction(
  source_file: string,
  nodes: GraphNode[],
  raw_calls: RawCall[] = [],
  import_bindings: ImportBinding[] = [],
): FileExtraction {
  return { source_file, language: "typescript", nodes, edges: [], parse_errors: [], raw_calls, import_bindings };
}

describe("resolveModule", () => {
  const known = new Set(["src/b.ts", "src/util/index.ts", "src/x/y.tsx", "src/deep/mod.ts"]);

  it("resolves ./sibling to a .ts file", () => {
    expect(resolveModule("src/a.ts", "./b", known)).toBe("src/b.ts");
  });
  it("resolves ../ paths", () => {
    expect(resolveModule("src/deep/here.ts", "../b", known)).toBe("src/b.ts");
  });
  it("resolves a directory import to index.ts", () => {
    expect(resolveModule("src/a.ts", "./util", known)).toBe("src/util/index.ts");
  });
  it("resolves .tsx", () => {
    expect(resolveModule("src/a.ts", "./x/y", known)).toBe("src/x/y.tsx");
  });
  it("strips a trailing .js (NodeNext style) to find the .ts source", () => {
    expect(resolveModule("src/a.ts", "./b.js", known)).toBe("src/b.ts");
  });
  it("returns null for bare specifiers (node_modules / aliases)", () => {
    expect(resolveModule("src/a.ts", "lodash", known)).toBeNull();
    expect(resolveModule("src/a.ts", "@scope/pkg", known)).toBeNull();
  });
  it("returns null when no candidate matches a known file", () => {
    expect(resolveModule("src/a.ts", "./nope", known)).toBeNull();
  });
});

describe("resolveCrossFileCalls", () => {
  it("named import → cross-file calls edge", () => {
    const a = extraction(
      "src/a.ts",
      [node("src/a.ts:caller:function", "caller", "src/a.ts", false)],
      [{ caller_id: "src/a.ts:caller:function", callee_name: "foo" }],
      [{ local_name: "foo", imported_name: "foo", kind: "named", specifier: "./b" }],
    );
    const b = extraction("src/b.ts", [node("src/b.ts:foo:function", "foo", "src/b.ts")]);
    const edges = resolveCrossFileCalls([a, b], [...a.nodes, ...b.nodes]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "src/a.ts:caller:function",
      target: "src/b.ts:foo:function",
      relation: "calls",
      confidence: "EXTRACTED",
    });
  });

  it("aliased named import (foo as bar) resolves by the imported name", () => {
    const a = extraction(
      "src/a.ts",
      [node("src/a.ts:c:function", "c", "src/a.ts", false)],
      [{ caller_id: "src/a.ts:c:function", callee_name: "bar" }],
      [{ local_name: "bar", imported_name: "foo", kind: "named", specifier: "./b" }],
    );
    const b = extraction("src/b.ts", [node("src/b.ts:foo:function", "foo", "src/b.ts")]);
    const edges = resolveCrossFileCalls([a, b], [...a.nodes, ...b.nodes]);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.target).toBe("src/b.ts:foo:function");
  });

  it("namespace import ns.foo() resolves to the export named foo", () => {
    const a = extraction(
      "src/a.ts",
      [node("src/a.ts:c:function", "c", "src/a.ts", false)],
      [{ caller_id: "src/a.ts:c:function", callee_name: "foo", receiver: "ns" }],
      [{ local_name: "ns", imported_name: "*", kind: "namespace", specifier: "./b" }],
    );
    const b = extraction("src/b.ts", [node("src/b.ts:foo:function", "foo", "src/b.ts")]);
    const edges = resolveCrossFileCalls([a, b], [...a.nodes, ...b.nodes]);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.target).toBe("src/b.ts:foo:function");
  });

  it("default imports are NOT resolved (we don't track which export is default)", () => {
    // codex review: resolving a default import to a file's lone NAMED export is
    // wrong — there may be no default export at all. We skip default entirely.
    const a = extraction(
      "src/a.ts",
      [node("src/a.ts:c:function", "c", "src/a.ts", false)],
      [{ caller_id: "src/a.ts:c:function", callee_name: "App" }],
      [{ local_name: "App", imported_name: "default", kind: "default", specifier: "./b" }],
    );
    const b = extraction("src/b.ts", [node("src/b.ts:App:function", "App", "src/b.ts")]);
    expect(resolveCrossFileCalls([a, b], [...a.nodes, ...b.nodes])).toHaveLength(0);
  });

  it("skips bare-specifier imports (external packages)", () => {
    const a = extraction(
      "src/a.ts",
      [node("src/a.ts:c:function", "c", "src/a.ts", false)],
      [{ caller_id: "src/a.ts:c:function", callee_name: "debounce" }],
      [{ local_name: "debounce", imported_name: "debounce", kind: "named", specifier: "lodash" }],
    );
    expect(resolveCrossFileCalls([a], a.nodes)).toHaveLength(0);
  });

  it("skips a call with no matching import binding (likely a global or intra-file)", () => {
    const a = extraction(
      "src/a.ts",
      [node("src/a.ts:c:function", "c", "src/a.ts", false)],
      [{ caller_id: "src/a.ts:c:function", callee_name: "setTimeout" }],
      [],
    );
    expect(resolveCrossFileCalls([a], a.nodes)).toHaveLength(0);
  });

  it("skips when the imported symbol is not an export of the resolved file", () => {
    const a = extraction(
      "src/a.ts",
      [node("src/a.ts:c:function", "c", "src/a.ts", false)],
      [{ caller_id: "src/a.ts:c:function", callee_name: "missing" }],
      [{ local_name: "missing", imported_name: "missing", kind: "named", specifier: "./b" }],
    );
    const b = extraction("src/b.ts", [node("src/b.ts:foo:function", "foo", "src/b.ts")]);
    expect(resolveCrossFileCalls([a, b], [...a.nodes, ...b.nodes])).toHaveLength(0);
  });

  it("does not resolve to a non-exported symbol", () => {
    const a = extraction(
      "src/a.ts",
      [node("src/a.ts:c:function", "c", "src/a.ts", false)],
      [{ caller_id: "src/a.ts:c:function", callee_name: "foo" }],
      [{ local_name: "foo", imported_name: "foo", kind: "named", specifier: "./b" }],
    );
    const b = extraction("src/b.ts", [node("src/b.ts:foo:function", "foo", "src/b.ts", /*exported*/ false)]);
    expect(resolveCrossFileCalls([a, b], [...a.nodes, ...b.nodes])).toHaveLength(0);
  });

  it("dedups repeated calls to the same imported symbol", () => {
    const a = extraction(
      "src/a.ts",
      [node("src/a.ts:c:function", "c", "src/a.ts", false)],
      [
        { caller_id: "src/a.ts:c:function", callee_name: "foo" },
        { caller_id: "src/a.ts:c:function", callee_name: "foo" },
      ],
      [{ local_name: "foo", imported_name: "foo", kind: "named", specifier: "./b" }],
    );
    const b = extraction("src/b.ts", [node("src/b.ts:foo:function", "foo", "src/b.ts")]);
    expect(resolveCrossFileCalls([a, b], [...a.nodes, ...b.nodes])).toHaveLength(1);
  });
});

describe("repointImportEdges (B2)", () => {
  const known = new Set(["src/a.ts", "src/b.ts", "src/util/index.ts"]);
  const imp = (source: string, target: string): GraphEdge =>
    ({ source, target, relation: "imports", confidence: "EXTRACTED" });

  it("repoints a relative import to the resolved file's module node", () => {
    const out = repointImportEdges([imp("src/a.ts::module", "external:./b")], known);
    expect(out[0]!.target).toBe("src/b.ts::module");
    expect(out[0]!.relation).toBe("imports");
  });

  it("repoints a directory import to the index module node", () => {
    const out = repointImportEdges([imp("src/a.ts::module", "external:./util")], known);
    expect(out[0]!.target).toBe("src/util/index.ts::module");
  });

  it("keeps external: for a bare (npm) specifier", () => {
    const out = repointImportEdges([imp("src/a.ts::module", "external:lodash")], known);
    expect(out[0]!.target).toBe("external:lodash");
  });

  it("keeps external: for an unresolvable relative specifier", () => {
    const out = repointImportEdges([imp("src/a.ts::module", "external:./missing")], known);
    expect(out[0]!.target).toBe("external:./missing");
  });

  it("leaves non-import edges untouched", () => {
    const calls: GraphEdge = { source: "src/a.ts:x:function", target: "src/b.ts:y:function", relation: "calls", confidence: "EXTRACTED" };
    const out = repointImportEdges([calls], known);
    expect(out[0]).toEqual(calls);
  });

  it("does not mutate the input array", () => {
    const input = [imp("src/a.ts::module", "external:./b")];
    const snapshot = input[0]!.target;
    repointImportEdges(input, known);
    expect(input[0]!.target).toBe(snapshot);
  });
});

describe("resolveHeritageEdges (B3)", () => {
  const heritage = (source: string, name: string, kind: "class" | "interface", relation: "extends" | "implements"): GraphEdge =>
    ({ source, target: `unresolved:${"src/a.ts"}:${name}:${kind}`, relation, confidence: "EXTRACTED" });

  it("resolves a SAME-FILE base class (was left unresolved before)", () => {
    const sub = node("src/a.ts:Sub:class", "Sub", "src/a.ts", true, "class");
    const base = node("src/a.ts:Base:class", "Base", "src/a.ts", false, "class");
    const a = extraction("src/a.ts", [sub, base]);
    const edge = heritage("src/a.ts:Sub:class", "Base", "class", "extends");
    const out = resolveHeritageEdges([edge], [a], a.nodes);
    expect(out[0]!.target).toBe("src/a.ts:Base:class");
  });

  it("resolves a base class imported (named) from another file", () => {
    const sub = node("src/a.ts:Sub:class", "Sub", "src/a.ts", true, "class");
    const base = node("src/b.ts:Base:class", "Base", "src/b.ts", true, "class");
    const a = extraction("src/a.ts", [sub], [],
      [{ local_name: "Base", imported_name: "Base", kind: "named", specifier: "./b" }]);
    const b = extraction("src/b.ts", [base]);
    const edge = heritage("src/a.ts:Sub:class", "Base", "class", "extends");
    const out = resolveHeritageEdges([edge], [a, b], [...a.nodes, ...b.nodes]);
    expect(out[0]!.target).toBe("src/b.ts:Base:class");
  });

  it("resolves implements of an imported interface", () => {
    const cls = node("src/a.ts:Impl:class", "Impl", "src/a.ts", true, "class");
    const iface = node("src/b.ts:Shape:interface", "Shape", "src/b.ts", true, "interface");
    const a = extraction("src/a.ts", [cls], [],
      [{ local_name: "Shape", imported_name: "Shape", kind: "named", specifier: "./b" }]);
    const b = extraction("src/b.ts", [iface]);
    const edge = heritage("src/a.ts:Impl:class", "Shape", "interface", "implements");
    const out = resolveHeritageEdges([edge], [a, b], [...a.nodes, ...b.nodes]);
    expect(out[0]!.target).toBe("src/b.ts:Shape:interface");
  });

  it("keeps the placeholder for an unknown base (no decl, no import)", () => {
    const sub = node("src/a.ts:Sub:class", "Sub", "src/a.ts", true, "class");
    const a = extraction("src/a.ts", [sub]);
    const edge = heritage("src/a.ts:Sub:class", "Ghost", "class", "extends");
    const out = resolveHeritageEdges([edge], [a], a.nodes);
    expect(out[0]!.target).toBe("unresolved:src/a.ts:Ghost:class");
  });

  it("does not touch calls/imports edges", () => {
    const callEdge: GraphEdge = { source: "x", target: "y", relation: "calls", confidence: "EXTRACTED" };
    const a = extraction("src/a.ts", []);
    expect(resolveHeritageEdges([callEdge], [a], [])[0]).toEqual(callEdge);
  });
});
