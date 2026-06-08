import { describe, it, expect } from "vitest";
import { extractRuby } from "../../../src/graph/extract/ruby.js";

describe("Ruby extraction", () => {
  it("extracts a top-level def as 'function'", () => {
    const ex = extractRuby(`def greet\n  'hello'\nend\n`, "lib/greeter.rb");
    expect(ex.language).toBe("ruby");
    const fn_ = ex.nodes.find(n => n.id === "lib/greeter.rb:greet:function");
    expect(fn_).toBeDefined();
    expect(fn_!.kind).toBe("function");
  });

  it("extracts a class", () => {
    const ex = extractRuby(`class Animal\nend\n`, "lib/animal.rb");
    const cls = ex.nodes.find(n => n.id === "lib/animal.rb:Animal:class");
    expect(cls).toBeDefined();
    expect(cls!.kind).toBe("class");
  });

  it("extracts class methods with ClassName#method key and method_of edge", () => {
    const ex = extractRuby(
      `class Dog\n  def bark\n    'woof'\n  end\nend\n`,
      "lib/dog.rb",
    );
    const method = ex.nodes.find(n => n.id === "lib/dog.rb:Dog#bark:method");
    expect(method).toBeDefined();
    expect(method!.kind).toBe("method");
    // Ruby extractor uses the full key (ClassName#method) as the label
    expect(method!.label).toBe("Dog#bark");
    const edge = ex.edges.find(e => e.relation === "method_of" && e.target === method!.id);
    expect(edge).toBeDefined();
    expect(edge!.source).toBe("lib/dog.rb:Dog:class");
  });

  it("extracts class with superclass as extends edge", () => {
    const ex = extractRuby(`class Poodle < Dog\nend\n`, "lib/poodle.rb");
    const ext = ex.edges.find(e => e.relation === "extends");
    expect(ext).toBeDefined();
    expect(ext!.source).toBe("lib/poodle.rb:Poodle:class");
    expect(ext!.target).toContain("Dog");
  });

  it("extracts module as 'class'", () => {
    const ex = extractRuby(`module Greetable\n  def hello\n  end\nend\n`, "lib/greetable.rb");
    const mod = ex.nodes.find(n => n.label === "Greetable");
    expect(mod).toBeDefined();
    expect(mod!.kind).toBe("class");
  });

  it("extracts require as imports edge", () => {
    const ex = extractRuby(`require 'json'\n`, "lib/a.rb");
    const imp = ex.edges.find(e => e.relation === "imports" && e.target === "external:json");
    expect(imp).toBeDefined();
  });

  it("extracts require_relative as imports edge", () => {
    const ex = extractRuby(`require_relative 'animal'\n`, "lib/dog.rb");
    const imp = ex.edges.find(e => e.relation === "imports" && e.target === "external:animal");
    expect(imp).toBeDefined();
  });

  it("extracts intra-file calls", () => {
    // bare `execute` without parens may parse as an identifier, not a call node.
    // Use explicit `execute()` to ensure tree-sitter emits a call node.
    const ex = extractRuby(
      `class Runner\n  def run\n    execute()\n  end\n  def execute\n  end\nend\n`,
      "lib/runner.rb",
    );
    const call = ex.edges.find(
      e => e.relation === "calls"
        && e.source === "lib/runner.rb:Runner#run:method"
        && e.target === "lib/runner.rb:Runner#execute:method",
    );
    expect(call).toBeDefined();
  });

  it("finds methods defined inside conditional blocks (else recursion branch)", () => {
    // Covers the else { collectDecls(child, ...) } branch for do_block/if/begin
    const ex = extractRuby(
      `class App\n  if true\n    def boot; end\n  end\nend\n`,
      "lib/app.rb",
    );
    // boot should be extracted even though it's inside an if block
    const method = ex.nodes.find(n => n.label === "App#boot" || n.label === "boot");
    expect(method).toBeDefined();
  });

  it("includes a module node for the file", () => {
    const ex = extractRuby(`def f; end\n`, "lib/a.rb");
    expect(ex.nodes.some(n => n.kind === "module" && n.id === "lib/a.rb::module")).toBe(true);
  });

  it("produces no parse errors on valid Ruby", () => {
    const ex = extractRuby(
      `require 'json'\nclass Parser\n  def parse(input)\n    JSON.parse(input)\n  end\nend\n`,
      "lib/parser.rb",
    );
    expect(ex.parse_errors).toHaveLength(0);
  });
});
