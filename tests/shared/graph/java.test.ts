import { describe, it, expect } from "vitest";
import { extractJava } from "../../../src/graph/extract/java.js";

describe("Java extraction", () => {
  it("extracts a public class", () => {
    const ex = extractJava(
      `public class Greeter {\n  public String greet() { return "hi"; }\n}\n`,
      "src/Greeter.java",
    );
    expect(ex.language).toBe("java");
    const cls = ex.nodes.find(n => n.id === "src/Greeter.java:Greeter:class");
    expect(cls).toBeDefined();
    expect(cls!.kind).toBe("class");
    expect(cls!.exported).toBe(true);
  });

  it("package-private class has exported=false", () => {
    const ex = extractJava(`class Helper {}\n`, "src/Helper.java");
    const cls = ex.nodes.find(n => n.label === "Helper");
    expect(cls).toBeDefined();
    expect(cls!.exported).toBe(false);
  });

  it("extracts interface", () => {
    const ex = extractJava(`public interface Runnable { void run(); }\n`, "src/Runnable.java");
    const iface = ex.nodes.find(n => n.id === "src/Runnable.java:Runnable:interface");
    expect(iface).toBeDefined();
    expect(iface!.kind).toBe("interface");
  });

  it("extracts enum", () => {
    const ex = extractJava(`public enum Color { RED, GREEN, BLUE }\n`, "src/Color.java");
    const e = ex.nodes.find(n => n.id === "src/Color.java:Color:enum");
    expect(e).toBeDefined();
    expect(e!.kind).toBe("enum");
  });

  it("extracts method with method_of edge and ClassName.method key", () => {
    const ex = extractJava(
      `public class Service {\n  public void execute() {}\n}\n`,
      "src/Service.java",
    );
    const method = ex.nodes.find(n => n.id === "src/Service.java:Service.execute:method");
    expect(method).toBeDefined();
    expect(method!.kind).toBe("method");
    expect(method!.label).toBe("execute");
    const edge = ex.edges.find(e => e.relation === "method_of" && e.target === method!.id);
    expect(edge).toBeDefined();
    expect(edge!.source).toBe("src/Service.java:Service:class");
  });

  it("extracts constructor as a method", () => {
    const ex = extractJava(
      `public class Point {\n  public Point(int x, int y) {}\n}\n`,
      "src/Point.java",
    );
    const ctor = ex.nodes.find(n => n.label === "Point" && n.kind === "method");
    expect(ctor).toBeDefined();
  });

  it("extracts import declaration as imports edge", () => {
    const ex = extractJava(
      `import java.util.List;\npublic class Foo {}\n`,
      "src/Foo.java",
    );
    const imp = ex.edges.find(e => e.relation === "imports" && e.target.includes("java.util"));
    expect(imp).toBeDefined();
  });

  it("extracts intra-file method calls", () => {
    const ex = extractJava(
      `public class App {\n  public void run() { this.helper(); }\n  private void helper() {}\n}\n`,
      "src/App.java",
    );
    const call = ex.edges.find(
      e => e.relation === "calls"
        && e.source === "src/App.java:App.run:method"
        && e.target === "src/App.java:App.helper:method",
    );
    expect(call).toBeDefined();
  });

  it("extracts nested class", () => {
    const ex = extractJava(
      `public class Outer {\n  public class Inner {}\n}\n`,
      "src/Outer.java",
    );
    const inner = ex.nodes.find(n => n.label === "Inner" && n.kind === "class");
    expect(inner).toBeDefined();
  });

  it("includes a module node for the file", () => {
    const ex = extractJava(`public class A {}\n`, "src/A.java");
    expect(ex.nodes.some(n => n.kind === "module" && n.id === "src/A.java::module")).toBe(true);
  });

  it("produces no parse errors on valid Java", () => {
    const ex = extractJava(
      `import java.util.ArrayList;\npublic class Main {\n  public static void main(String[] args) {}\n}\n`,
      "src/Main.java",
    );
    expect(ex.parse_errors).toHaveLength(0);
  });
});
