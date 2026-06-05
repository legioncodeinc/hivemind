import { describe, it, expect } from "vitest";

import {
  repointImportEdges,
  resolveCrossFileCalls,
  resolvePythonModule,
} from "../../../src/graph/resolve/cross-file.js";
import type { FileExtraction, GraphEdge, GraphNode, ImportBinding, RawCall } from "../../../src/graph/types.js";

function pynode(id: string, label: string, source_file: string, exported = true, kind: GraphNode["kind"] = "function"): GraphNode {
  return { id, label, kind, source_file, source_location: "L1", language: "python", exported };
}

function pyextraction(
  source_file: string,
  nodes: GraphNode[],
  raw_calls: RawCall[] = [],
  import_bindings: ImportBinding[] = [],
): FileExtraction {
  return { source_file, language: "python", nodes, edges: [], parse_errors: [], raw_calls, import_bindings };
}

describe("resolvePythonModule", () => {
  // graphiti-like layout: source root is `server/`, plus a top-level package.
  const known = new Set([
    "server/graph_service/routers/ingest.py",
    "server/graph_service/zep_graphiti.py",
    "server/graph_service/dto/common.py",
    "graphiti_core/nodes.py",
    "graphiti_core/utils/__init__.py",
  ]);

  it("resolves a dotted-absolute module by UNIQUE path suffix (root not in specifier)", () => {
    expect(resolvePythonModule("server/graph_service/routers/ingest.py", "graph_service.zep_graphiti", known))
      .toBe("server/graph_service/zep_graphiti.py");
  });

  it("resolves a top-level package to its __init__.py", () => {
    expect(resolvePythonModule("graphiti_core/nodes.py", "graphiti_core.utils", known))
      .toBe("graphiti_core/utils/__init__.py");
  });

  it("resolves a relative `.sibling` import within the same package", () => {
    expect(resolvePythonModule("server/graph_service/routers/ingest.py", ".retrieve", new Set([
      "server/graph_service/routers/ingest.py",
      "server/graph_service/routers/retrieve.py",
    ]))).toBe("server/graph_service/routers/retrieve.py");
  });

  it("resolves a relative `..pkg.mod` that climbs a level", () => {
    expect(resolvePythonModule("server/graph_service/routers/ingest.py", "..dto.common", known))
      .toBe("server/graph_service/dto/common.py");
  });

  it("resolves a bare `.` (current package) to its __init__.py", () => {
    // `from . import x` in pkg/sub/mod.py → the current package's __init__.py
    const pkg = new Set(["pkg/sub/mod.py", "pkg/sub/__init__.py"]);
    expect(resolvePythonModule("pkg/sub/mod.py", ".", pkg)).toBe("pkg/sub/__init__.py");
  });

  it("resolves a relative package to its __init__.pyi (stub-only package)", () => {
    // exercises the .pyi extension on the __init__ fallback
    const pkg = new Set(["pkg/mod.py", "pkg/sub/__init__.pyi"]);
    expect(resolvePythonModule("pkg/mod.py", ".sub", pkg)).toBe("pkg/sub/__init__.pyi");
  });

  it("returns null for a relative import that matches neither a module nor a package", () => {
    // exercises the fall-through: no <base>.py and no <base>/__init__.py
    expect(resolvePythonModule("pkg/mod.py", ".ghost", new Set(["pkg/mod.py"]))).toBeNull();
  });

  it("returns null for an empty / dot-less specifier with no segments", () => {
    // absolute branch (no leading dots) with an empty tail → nothing to anchor
    expect(resolvePythonModule("a.py", "", new Set(["a.py"]))).toBeNull();
  });

  it("returns null for stdlib / third-party (no matching repo file)", () => {
    expect(resolvePythonModule("server/graph_service/routers/ingest.py", "os", known)).toBeNull();
    expect(resolvePythonModule("server/graph_service/routers/ingest.py", "fastapi", known)).toBeNull();
  });

  it("DROPS an ambiguous absolute suffix (matches >1 file) rather than guessing", () => {
    const ambig = new Set(["a/dto/common.py", "b/dto/common.py"]);
    expect(resolvePythonModule("a/x.py", "dto.common", ambig)).toBeNull();
  });

  it("DROPS an over-climbing relative import instead of matching at repo root", () => {
    // `....foo` from pkg/sub/mod.py climbs more levels than exist above it →
    // invalid Python. Must NOT spuriously resolve to a root-level `foo.py`.
    const known = new Set(["pkg/sub/mod.py", "foo.py"]);
    expect(resolvePythonModule("pkg/sub/mod.py", "....foo", known)).toBeNull();
  });
});

describe("resolveCrossFileCalls — Python", () => {
  it("emits exactly one cross-file calls edge for `from pkg.mod import f; f()`", () => {
    const caller = pyextraction(
      "app/main.py",
      [pynode("app/main.py:run:function", "run", "app/main.py")],
      [{ callee_name: "f", caller_id: "app/main.py:run:function" }] as RawCall[],
      [{ local_name: "f", imported_name: "f", kind: "named", specifier: "pkg.mod" }] as ImportBinding[],
    );
    const callee = pyextraction("pkg/mod.py", [pynode("pkg/mod.py:f:function", "f", "pkg/mod.py")]);
    const edges = resolveCrossFileCalls([caller, callee], [...caller.nodes, ...callee.nodes]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "app/main.py:run:function",
      target: "pkg/mod.py:f:function",
      relation: "calls",
    });
  });

  it("does NOT emit an edge for a stdlib import (`import os; os.getcwd()`)", () => {
    const caller = pyextraction(
      "app/main.py",
      [pynode("app/main.py:run:function", "run", "app/main.py")],
      [{ callee_name: "getcwd", receiver: "os", caller_id: "app/main.py:run:function" }] as RawCall[],
      [{ local_name: "os", imported_name: "*", kind: "namespace", specifier: "os" }] as ImportBinding[],
    );
    const edges = resolveCrossFileCalls([caller], caller.nodes);
    expect(edges).toHaveLength(0);
  });

  it("repoints a Python `imports` edge from external:<dotted> to the real module node", () => {
    const links: GraphEdge[] = [
      { source: "server/app.py::module", target: "external:graph_service.zep_graphiti", relation: "imports", confidence: "EXTRACTED" },
    ];
    const known = new Set(["server/app.py", "server/graph_service/zep_graphiti.py"]);
    const out = repointImportEdges(links, known);
    expect(out[0]!.target).toBe("server/graph_service/zep_graphiti.py::module");
  });
});
