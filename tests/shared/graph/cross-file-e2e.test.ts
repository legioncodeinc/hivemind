import { describe, it, expect } from "vitest";

import { extractTypeScript } from "../../../src/graph/extract/typescript.js";
import { buildSnapshot } from "../../../src/graph/snapshot.js";
import type { GraphMetadata, GraphObservation } from "../../../src/graph/types.js";

function meta(): GraphMetadata {
  return { schema_version: 1, generator: "hivemind-graph", commit_sha: "c", repo_key: "k" };
}
function obs(): GraphObservation {
  return {
    ts: "2026-06-03T00:00:00Z", branch: "main", worktree_path: "/t", repo_project: "t",
    generator_version: "0.0.0-test", source_files_extracted: 0, source_files_skipped: 0,
  };
}

/**
 * End-to-end: run the REAL tree-sitter extractor over two source strings, build
 * the snapshot, and confirm the cross-file `calls` edge is resolved. This is the
 * test that would have caught any drift between what the extractor emits
 * (raw_calls + import_bindings) and what the resolver consumes.
 */
describe("cross-file calls — extractor → snapshot", () => {
  function callsEdges(snap: { links: { source: string; target: string; relation: string }[] }) {
    return snap.links.filter((e) => e.relation === "calls");
  }

  it("named import: caller in a.ts → exported function in b.ts", () => {
    const a = extractTypeScript(
      `import { greet } from "./b";\nexport function run() { return greet(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(
      `export function greet() { return "hi"; }\n`,
      "src/b.ts",
    );
    const snap = buildSnapshot([a, b], meta(), obs());
    const cross = callsEdges(snap).find(
      (e) => e.source === "src/a.ts:run:function" && e.target === "src/b.ts:greet:function",
    );
    expect(cross).toBeDefined();
  });

  it("namespace import: caller in a.ts → ns.greet() in b.ts", () => {
    const a = extractTypeScript(
      `import * as util from "./util/index";\nexport function run() { return util.greet(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(
      `export function greet() { return 1; }\n`,
      "src/util/index.ts",
    );
    const snap = buildSnapshot([a, b], meta(), obs());
    const cross = callsEdges(snap).find(
      (e) => e.source === "src/a.ts:run:function" && e.target === "src/util/index.ts:greet:function",
    );
    expect(cross).toBeDefined();
  });

  it("does NOT invent an edge for an external (bare) import", () => {
    const a = extractTypeScript(
      `import { debounce } from "lodash";\nexport function run() { return debounce(); }\n`,
      "src/a.ts",
    );
    const snap = buildSnapshot([a], meta(), obs());
    // No cross-file target exists; the only nodes are in a.ts. No calls edge to lodash.
    expect(callsEdges(snap).some((e) => e.target.includes("lodash"))).toBe(false);
  });

  it("does NOT resolve a type-only import (import type { Foo })", () => {
    // `import type` bindings are type-level only; a value call to that name must
    // not produce a cross-file edge (codex review).
    const a = extractTypeScript(
      `import type { greet } from "./b";\nexport function run() { return greet(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(`export function greet() { return 1; }\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    const cross = callsEdges(snap).find(
      (e) => e.source === "src/a.ts:run:function" && e.target === "src/b.ts:greet:function",
    );
    expect(cross).toBeUndefined();
  });

  it("does NOT resolve a per-specifier type import (import { type Foo })", () => {
    const a = extractTypeScript(
      `import { type greet } from "./b";\nexport function run() { return greet(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(`export function greet() { return 1; }\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    expect(callsEdges(snap).some((e) => e.target === "src/b.ts:greet:function")).toBe(false);
  });

  it("DOES resolve `import { type as value }` — a value import of a symbol named `type`", () => {
    // codex review P3: `type as value` is a VALUE import (named export `type`,
    // aliased to `value`), not a type-only import — it must still resolve.
    const a = extractTypeScript(
      `import { type as value } from "./b";\nexport function run() { return value(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(`export function type() { return 1; }\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    const cross = callsEdges(snap).find(
      (e) => e.source === "src/a.ts:run:function" && e.target === "src/b.ts:type:function",
    );
    expect(cross).toBeDefined();
  });

  it("does NOT resolve a default import (default export not tracked)", () => {
    const a = extractTypeScript(
      `import greet from "./b";\nexport function run() { return greet(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(`export default function greet() { return 1; }\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    expect(callsEdges(snap).some((e) => e.target.includes("greet"))).toBe(false);
  });

  it("B2: a relative import edge points at the target file's module node", () => {
    const a = extractTypeScript(`import { greet } from "./b";\nexport function run() { return greet(); }\n`, "src/a.ts");
    const b = extractTypeScript(`export function greet() { return 1; }\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    const importEdges = snap.links.filter((e) => e.relation === "imports");
    expect(importEdges.some((e) => e.source === "src/a.ts::module" && e.target === "src/b.ts::module")).toBe(true);
    // and no leftover external: placeholder for the resolved relative import
    expect(importEdges.some((e) => e.source === "src/a.ts::module" && e.target === "external:./b")).toBe(false);
  });

  it("B2: a bare (npm) import keeps its external: target", () => {
    const a = extractTypeScript(`import { debounce } from "lodash";\nexport function run() { return debounce(); }\n`, "src/a.ts");
    const snap = buildSnapshot([a], meta(), obs());
    expect(snap.links.some((e) => e.relation === "imports" && e.target === "external:lodash")).toBe(true);
  });

  it("B3: extends an imported base class → real cross-file node", () => {
    const a = extractTypeScript(
      `import { Base } from "./b";\nexport class Sub extends Base {}\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(`export class Base {}\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    const ext = snap.links.find((e) => e.relation === "extends" && e.source === "src/a.ts:Sub:class");
    expect(ext?.target).toBe("src/b.ts:Base:class");
  });

  it("B3: extends a SAME-FILE base class resolves (no longer unresolved)", () => {
    const a = extractTypeScript(
      `class Base {}\nexport class Sub extends Base {}\n`,
      "src/a.ts",
    );
    const snap = buildSnapshot([a], meta(), obs());
    const ext = snap.links.find((e) => e.relation === "extends" && e.source === "src/a.ts:Sub:class");
    expect(ext?.target).toBe("src/a.ts:Base:class");
  });

  it("B3: extends an external base keeps the unresolved placeholder", () => {
    const a = extractTypeScript(
      `import { Component } from "react";\nexport class Sub extends Component {}\n`,
      "src/a.ts",
    );
    const snap = buildSnapshot([a], meta(), obs());
    const ext = snap.links.find((e) => e.relation === "extends" && e.source === "src/a.ts:Sub:class");
    expect(ext?.target).toContain("unresolved:");
  });

  it("still emits intra-file calls (no regression)", () => {
    const a = extractTypeScript(
      `function helper() { return 1; }\nexport function run() { return helper(); }\n`,
      "src/a.ts",
    );
    const snap = buildSnapshot([a], meta(), obs());
    const intra = callsEdges(snap).find(
      (e) => e.source === "src/a.ts:run:function" && e.target === "src/a.ts:helper:function",
    );
    expect(intra).toBeDefined();
  });
});
