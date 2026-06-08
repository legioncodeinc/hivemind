import { describe, it, expect } from "vitest";
import { extractRust } from "../../../src/graph/extract/rust.js";

describe("Rust extraction", () => {
  it("extracts a pub fn as function, exported=true", () => {
    const ex = extractRust(`pub fn greet() -> &'static str { "hi" }\n`, "src/lib.rs");
    const fn_ = ex.nodes.find(n => n.id === "src/lib.rs:greet:function");
    expect(fn_).toBeDefined();
    expect(fn_!.kind).toBe("function");
    expect(fn_!.exported).toBe(true);
    expect(ex.language).toBe("rust");
  });

  it("private fn has exported=false", () => {
    const ex = extractRust(`fn internal() {}\n`, "src/lib.rs");
    const fn_ = ex.nodes.find(n => n.label === "internal");
    expect(fn_).toBeDefined();
    expect(fn_!.exported).toBe(false);
  });

  it("extracts struct as 'class'", () => {
    const ex = extractRust(`pub struct Point { x: f64, y: f64 }\n`, "src/point.rs");
    const s = ex.nodes.find(n => n.id === "src/point.rs:Point:class");
    expect(s).toBeDefined();
    expect(s!.kind).toBe("class");
    expect(s!.exported).toBe(true);
  });

  it("extracts enum as 'enum'", () => {
    const ex = extractRust(`pub enum Color { Red, Green, Blue }\n`, "src/color.rs");
    const e = ex.nodes.find(n => n.id === "src/color.rs:Color:enum");
    expect(e).toBeDefined();
    expect(e!.kind).toBe("enum");
  });

  it("extracts trait as 'interface'", () => {
    const ex = extractRust(`pub trait Drawable { fn draw(&self); }\n`, "src/draw.rs");
    const t = ex.nodes.find(n => n.id === "src/draw.rs:Drawable:interface");
    expect(t).toBeDefined();
    expect(t!.kind).toBe("interface");
  });

  it("extracts impl methods with method_of edges and Type::method key", () => {
    const ex = extractRust(
      `pub struct Rect { w: f64, h: f64 }\nimpl Rect {\n  pub fn area(&self) -> f64 { self.w * self.h }\n}\n`,
      "src/rect.rs",
    );
    const method = ex.nodes.find(n => n.id === "src/rect.rs:Rect::area:method");
    expect(method).toBeDefined();
    expect(method!.kind).toBe("method");
    expect(method!.label).toBe("area");
    const edge = ex.edges.find(e => e.relation === "method_of" && e.target === method!.id);
    expect(edge).toBeDefined();
    expect(edge!.source).toBe("src/rect.rs:Rect:class");
  });

  it("extracts mod as 'module'", () => {
    const ex = extractRust(`pub mod utils {}\n`, "src/lib.rs");
    const m = ex.nodes.find(n => n.id === "src/lib.rs:utils:module");
    expect(m).toBeDefined();
    expect(m!.kind).toBe("module");
  });

  it("extracts inline mod declarations inside mod body", () => {
    const ex = extractRust(`pub mod inner { pub fn helper() {} }\n`, "src/lib.rs");
    expect(ex.nodes.some(n => n.label === "helper" && n.kind === "function")).toBe(true);
  });

  it("extracts const as 'const'", () => {
    const ex = extractRust(`pub const MAX: usize = 100;\n`, "src/lib.rs");
    const c = ex.nodes.find(n => n.id === "src/lib.rs:MAX:const");
    expect(c).toBeDefined();
    expect(c!.kind).toBe("const");
  });

  it("extracts use declaration as imports edge", () => {
    const ex = extractRust(`use std::io::Read;\nfn f() {}\n`, "src/lib.rs");
    expect(ex.edges.some(e => e.relation === "imports" && e.target.includes("std"))).toBe(true);
  });

  it("extracts intra-file calls", () => {
    const ex = extractRust(
      `fn run() { helper(); }\nfn helper() {}\n`,
      "src/lib.rs",
    );
    const call = ex.edges.find(
      e => e.relation === "calls"
        && e.source === "src/lib.rs:run:function"
        && e.target === "src/lib.rs:helper:function",
    );
    expect(call).toBeDefined();
  });

  it("extracts use with scoped path (std::io::Read)", () => {
    // Covers extractUsePath scoped_identifier / nested path branches
    const ex = extractRust(`use std::io::{Read, Write};\nfn f() {}\n`, "src/lib.rs");
    expect(ex.edges.some(e => e.relation === "imports" && e.target.startsWith("external:"))).toBe(true);
  });

  it("resolves call from an impl method to a free function (triggers impl-qualified findEnclosingFn search)", () => {
    // Covers lines 221-224: findEnclosingFn walks up to function_item inside an impl block;
    // tries declByName.get(name) first then searches k.endsWith(::name) to find the impl-qualified key.
    const ex = extractRust(
      `fn setup() {}\nstruct Worker {}\nimpl Worker {\n  pub fn run(&self) { setup(); }\n}\n`,
      "src/worker.rs",
    );
    const run = ex.nodes.find(n => n.id === "src/worker.rs:Worker::run:method");
    const setup = ex.nodes.find(n => n.id === "src/worker.rs:setup:function");
    expect(run).toBeDefined();
    expect(setup).toBeDefined();
    const call = ex.edges.find(e => e.relation === "calls" && e.source === run!.id && e.target === setup!.id);
    expect(call).toBeDefined();
  });

  it("includes a module node for the file", () => {
    const ex = extractRust(`fn f() {}\n`, "src/lib.rs");
    expect(ex.nodes.some(n => n.kind === "module" && n.id === "src/lib.rs::module")).toBe(true);
  });

  it("produces no parse errors on valid Rust", () => {
    const ex = extractRust(
      `use std::fmt;\npub struct Point { x: i32, y: i32 }\nimpl Point {\n  pub fn new(x: i32, y: i32) -> Self { Point { x, y } }\n}\n`,
      "src/point.rs",
    );
    expect(ex.parse_errors).toHaveLength(0);
  });
});
