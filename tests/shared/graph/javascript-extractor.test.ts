/**
 * Tests for the native JavaScript extractor (tree-sitter-javascript).
 * The existing javascript.test.ts covers the TypeScript pipeline for .js files;
 * this file exercises the dedicated extractJavaScript function in javascript.ts.
 */

import { describe, it, expect } from "vitest";
import { extractJavaScript } from "../../../src/graph/extract/javascript.js";

describe("JavaScript (native) extractor", () => {
  it("extracts an exported function declaration", () => {
    const ex = extractJavaScript(
      `export function greet(name) { return 'hi ' + name; }\n`,
      "src/greet.js",
    );
    expect(ex.language).toBe("javascript");
    const fn = ex.nodes.find(n => n.id === "src/greet.js:greet:function");
    expect(fn).toBeDefined();
    expect(fn!.exported).toBe(true);
  });

  it("extracts a non-exported function with exported=false", () => {
    const ex = extractJavaScript(`function helper() {}\n`, "src/a.js");
    const fn = ex.nodes.find(n => n.label === "helper");
    expect(fn).toBeDefined();
    expect(fn!.exported).toBe(false);
  });

  it("extracts a class with methods and method_of edges", () => {
    const ex = extractJavaScript(
      `export class Animal {\n  speak() { return 'roar'; }\n}\n`,
      "src/animal.js",
    );
    const cls = ex.nodes.find(n => n.id === "src/animal.js:Animal:class");
    expect(cls).toBeDefined();
    const method = ex.nodes.find(n => n.id === "src/animal.js:Animal.speak:method");
    expect(method).toBeDefined();
    expect(method!.kind).toBe("method");
    const edge = ex.edges.find(e => e.relation === "method_of" && e.target === method!.id);
    expect(edge).toBeDefined();
  });

  it("extracts a const arrow function", () => {
    const ex = extractJavaScript(
      `export const add = (a, b) => a + b;\n`,
      "src/math.js",
    );
    const fn = ex.nodes.find(n => n.label === "add");
    expect(fn).toBeDefined();
    expect(fn!.exported).toBe(true);
  });

  it("extracts generator function", () => {
    const ex = extractJavaScript(
      `export function* counter() { yield 1; yield 2; }\n`,
      "src/gen.js",
    );
    const fn = ex.nodes.find(n => n.label === "counter");
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe("function");
  });

  it("extracts ES module import as imports edge", () => {
    const ex = extractJavaScript(
      `import { foo } from 'lodash';\nfunction f() {}\n`,
      "src/a.js",
    );
    const imp = ex.edges.find(e => e.relation === "imports" && e.target === "external:lodash");
    expect(imp).toBeDefined();
  });

  it("extracts require() as imports edge", () => {
    const ex = extractJavaScript(
      `const path = require('path');\nfunction f() {}\n`,
      "src/a.js",
    );
    const imp = ex.edges.find(e => e.relation === "imports" && e.target === "external:path");
    expect(imp).toBeDefined();
  });

  it("extracts intra-file calls", () => {
    const ex = extractJavaScript(
      `function run() { return helper(); }\nfunction helper() { return 1; }\n`,
      "src/a.js",
    );
    const call = ex.edges.find(
      e => e.relation === "calls"
        && e.source === "src/a.js:run:function"
        && e.target === "src/a.js:helper:function",
    );
    expect(call).toBeDefined();
  });

  it("includes a module node for the file", () => {
    const ex = extractJavaScript(`function f() {}\n`, "src/a.js");
    expect(ex.nodes.some(n => n.kind === "module" && n.id === "src/a.js::module")).toBe(true);
  });

  it("produces no parse errors on valid JS", () => {
    const ex = extractJavaScript(
      `import { readFile } from 'fs/promises';\nexport class Reader {\n  async read(path) { return readFile(path); }\n}\n`,
      "src/reader.js",
    );
    expect(ex.parse_errors).toHaveLength(0);
  });
});
