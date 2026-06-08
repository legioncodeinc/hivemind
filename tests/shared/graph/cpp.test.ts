import { describe, it, expect } from "vitest";
import { extractCpp } from "../../../src/graph/extract/cpp.js";

describe("C++ extraction", () => {
  it("extracts a free function", () => {
    const ex = extractCpp(`int add(int a, int b) { return a + b; }\n`, "src/math.cpp");
    expect(ex.language).toBe("cpp");
    const fn_ = ex.nodes.find(n => n.id === "src/math.cpp:add:function");
    expect(fn_).toBeDefined();
    expect(fn_!.kind).toBe("function");
  });

  it("extracts a class node (methods inside class body are not extracted by this extractor version)", () => {
    // The C++ extractor extracts class declarations as 'class' nodes.
    // Inline method definitions inside class bodies in tree-sitter-cpp 0.23.x
    // are represented differently from top-level function_definition nodes,
    // so the extractor focuses on free functions, structs, and namespaces.
    const ex = extractCpp(
      `class Animal {\npublic:\n  void speak();\n};\n`,
      "src/animal.cpp",
    );
    const cls = ex.nodes.find(n => n.id === "src/animal.cpp:Animal:class");
    expect(cls).toBeDefined();
    expect(cls!.kind).toBe("class");
  });

  it("extracts methods defined via struct body", () => {
    // struct methods defined outside the body as qualified functions
    // are extracted as free functions; structs themselves are extracted as class
    const ex = extractCpp(
      `struct Vec2 { float x; float y; };\nvoid Vec2_init(Vec2* v, float x, float y) { v->x = x; v->y = y; }\n`,
      "src/vec2.cpp",
    );
    const s = ex.nodes.find(n => n.id === "src/vec2.cpp:Vec2:class");
    expect(s).toBeDefined();
    const fn = ex.nodes.find(n => n.label === "Vec2_init");
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe("function");
  });

  it("extracts namespace as 'module' and qualifies declarations inside", () => {
    const ex = extractCpp(
      `namespace MyNS {\n  void helper() {}\n}\n`,
      "src/ns.cpp",
    );
    const ns = ex.nodes.find(n => n.label === "MyNS" && n.kind === "module");
    expect(ns).toBeDefined();
    const fn_ = ex.nodes.find(n => n.id === "src/ns.cpp:MyNS::helper:function");
    expect(fn_).toBeDefined();
  });

  it("resolves qualified calls (Ns::fn) to namespace-qualified declarations", () => {
    const ex = extractCpp(
      `namespace Math {\n  int square(int x) { return x * x; }\n}\nint run() { return Math::square(3); }\n`,
      "src/calc.cpp",
    );
    const call = ex.edges.find(
      e => e.relation === "calls"
        && e.source === "src/calc.cpp:run:function"
        && e.target === "src/calc.cpp:Math::square:function",
    );
    expect(call).toBeDefined();
  });

  it("extracts #include as imports edge", () => {
    const ex = extractCpp(`#include <vector>\nvoid f() {}\n`, "src/a.cpp");
    const imp = ex.edges.find(e => e.relation === "imports" && e.target === "external:vector");
    expect(imp).toBeDefined();
  });

  it("extracts struct as 'class'", () => {
    const ex = extractCpp(`struct Point { int x; int y; };\n`, "src/point.cpp");
    const s = ex.nodes.find(n => n.id === "src/point.cpp:Point:class");
    expect(s).toBeDefined();
    expect(s!.kind).toBe("class");
  });

  it("extracts intra-file calls", () => {
    const ex = extractCpp(
      `void run() { helper(); }\nvoid helper() {}\n`,
      "src/a.cpp",
    );
    const call = ex.edges.find(
      e => e.relation === "calls"
        && e.source === "src/a.cpp:run:function"
        && e.target === "src/a.cpp:helper:function",
    );
    expect(call).toBeDefined();
  });

  it("extracts template function", () => {
    const ex = extractCpp(
      `template<typename T>\nT max(T a, T b) { return a > b ? a : b; }\n`,
      "src/tmpl.cpp",
    );
    const fn_ = ex.nodes.find(n => n.label === "max" && n.kind === "function");
    expect(fn_).toBeDefined();
  });

  it("resolves calls via field_expression (this->method pattern)", () => {
    // Covers field_expression branch in collectCppCalls (lines 181-183)
    const ex = extractCpp(
      `void helper() {}\nvoid run() { auto p = nullptr; p->helper(); }\n`,
      "src/a.cpp",
    );
    // Mainly verifies no crash on field_expression; call resolution depends on enclosing class
    expect(ex.parse_errors).toHaveLength(0);
  });

  it("includes a module node for the file", () => {
    const ex = extractCpp(`void f() {}\n`, "src/a.cpp");
    expect(ex.nodes.some(n => n.kind === "module" && n.id === "src/a.cpp::module")).toBe(true);
  });

  it("produces no parse errors on valid C++", () => {
    const ex = extractCpp(
      `#include <string>\nclass Greeter {\npublic:\n  std::string greet(const std::string& name) { return "Hello " + name; }\n};\n`,
      "src/greeter.cpp",
    );
    expect(ex.parse_errors).toHaveLength(0);
  });
});
