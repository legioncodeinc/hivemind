import { describe, it, expect } from "vitest";
import { extractC } from "../../../src/graph/extract/c.js";

describe("C extraction", () => {
  it("extracts a function definition", () => {
    const ex = extractC(`int add(int a, int b) { return a + b; }\n`, "src/math.c");
    expect(ex.language).toBe("c");
    const fn_ = ex.nodes.find(n => n.id === "src/math.c:add:function");
    expect(fn_).toBeDefined();
    expect(fn_!.kind).toBe("function");
    expect(fn_!.exported).toBe(true);
  });

  it("extracts a struct as 'class'", () => {
    const ex = extractC(`struct Point { int x; int y; };\n`, "src/point.c");
    const s = ex.nodes.find(n => n.id === "src/point.c:Point:class");
    expect(s).toBeDefined();
    expect(s!.kind).toBe("class");
  });

  it("extracts #include as imports edge", () => {
    const ex = extractC(`#include <stdio.h>\nint main() { return 0; }\n`, "src/main.c");
    const imp = ex.edges.find(e => e.relation === "imports" && e.target === "external:stdio.h");
    expect(imp).toBeDefined();
  });

  it("extracts quoted #include as imports edge", () => {
    const ex = extractC(`#include "utils.h"\nvoid f() {}\n`, "src/main.c");
    const imp = ex.edges.find(e => e.relation === "imports" && e.target === "external:utils.h");
    expect(imp).toBeDefined();
  });

  it("extracts a pointer-returning function", () => {
    const ex = extractC(`char* get_name() { return "Alice"; }\n`, "src/a.c");
    const fn_ = ex.nodes.find(n => n.label === "get_name");
    expect(fn_).toBeDefined();
    expect(fn_!.kind).toBe("function");
  });

  it("extracts intra-file calls", () => {
    const ex = extractC(
      `void run() { helper(); }\nvoid helper() {}\n`,
      "src/a.c",
    );
    const call = ex.edges.find(
      e => e.relation === "calls"
        && e.source === "src/a.c:run:function"
        && e.target === "src/a.c:helper:function",
    );
    expect(call).toBeDefined();
  });

  it("includes a module node for the file", () => {
    const ex = extractC(`int x = 1;\n`, "src/a.c");
    expect(ex.nodes.some(n => n.kind === "module" && n.id === "src/a.c::module")).toBe(true);
  });

  it("extracts functions declared inside #ifdef blocks", () => {
    // Covers the else { recurse } branch added to collectDecls for preproc conditionals
    const ex = extractC(
      `#ifdef DEBUG\nvoid debug_log(const char* msg) {}\n#endif\n`,
      "src/log.c",
    );
    const fn = ex.nodes.find(n => n.label === "debug_log");
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe("function");
  });

  it("produces no parse errors on valid C", () => {
    const ex = extractC(
      `#include <stdlib.h>\ntypedef struct { int x; int y; } Point;\nPoint make_point(int x, int y) { Point p = {x, y}; return p; }\n`,
      "src/point.c",
    );
    expect(ex.parse_errors).toHaveLength(0);
  });
});
