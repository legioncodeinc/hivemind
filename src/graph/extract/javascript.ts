/**
 * JavaScript / JSX extractor (Phase 1.5).
 * Uses tree-sitter-javascript (handles both JS and JSX in one grammar).
 * AST shape is nearly identical to TypeScript so extraction logic is similar,
 * but the language field is "javascript" and no TS-specific syntax is emitted.
 */

import JavaScript from "tree-sitter-javascript";
import type { FileExtraction, GraphNode } from "../types.js";
import {
  collectParseErrors,
  firstOfType,
  getParser,
  locationStr,
  makeModuleNode,
  makeNode,
  nodeId,
  parseWithChunks,
  pushNode,
  textOfField,
  type TSNode,
} from "./shared.js";

const LANG = "javascript" as const;

export function extractJavaScript(
  sourceCode: string,
  relativePath: string,
): FileExtraction {
  const tree = parseWithChunks(getParser(JavaScript as object), sourceCode);
  const root = tree.rootNode;

  const result: FileExtraction = {
    source_file: relativePath,
    language: LANG,
    nodes: [],
    edges: [],
    parse_errors: [],
  };
  collectParseErrors(root, relativePath, result.parse_errors);

  const moduleNode = makeModuleNode(relativePath, LANG);
  result.nodes.push(moduleNode);

  const declByName = new Map<string, GraphNode>();
  collectDecls(root, relativePath, result, declByName, moduleNode);
  collectImports(root, relativePath, result, moduleNode);
  collectCalls(root, relativePath, result, declByName);

  return result;
}

// ─── Pass 1: declarations ───────────────────────────────────────────────────

function collectDecls(
  node: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  moduleNode: GraphNode,
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null) continue;

    const { inner, exported } = unwrapExport(child);

    if (inner.type === "function_declaration" || inner.type === "generator_function_declaration") {
      const name = textOfField(inner, "name");
      if (name === null) continue;
      pushNode(result, declByName, makeNode(relativePath, name, "function", inner, exported, LANG));
    } else if (inner.type === "class_declaration") {
      const name = textOfField(inner, "name");
      if (name === null) continue;
      const classDecl = makeNode(relativePath, name, "class", inner, exported, LANG);
      pushNode(result, declByName, classDecl);
      const body = firstOfType(inner, ["class_body"]);
      if (body !== null) collectMethods(body, relativePath, result, declByName, name, exported);
    } else if (inner.type === "lexical_declaration" || inner.type === "variable_declaration") {
      // const/let foo = () => {} or function() {}
      for (let j = 0; j < inner.namedChildCount; j++) {
        const decl = inner.namedChild(j);
        if (decl === null || decl.type !== "variable_declarator") continue;
        const ident = decl.childForFieldName("name");
        if (ident === null || ident.type !== "identifier") continue;
        const val = decl.childForFieldName("value");
        if (val?.type === "arrow_function" || val?.type === "function_expression") {
          pushNode(result, declByName, makeNode(relativePath, ident.text, "function", decl, exported, LANG));
        }
      }
    }
  }
}

function collectMethods(
  body: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  className: string,
  classExported: boolean,
): void {
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    if (member === null || member.type !== "method_definition") continue;
    const methodName = textOfField(member, "name");
    if (methodName === null) continue;
    const key = `${className}.${methodName}`;
    const methodNode: GraphNode = {
      id: nodeId(relativePath, key, "method"),
      label: methodName,
      kind: "method",
      source_file: relativePath,
      source_location: locationStr(member),
      language: LANG,
      exported: classExported,
    };
    pushNode(result, declByName, methodNode, key);
    result.edges.push({
      source: nodeId(relativePath, className, "class"),
      target: methodNode.id,
      relation: "method_of",
      confidence: "EXTRACTED",
    });
  }
}

function unwrapExport(node: TSNode): { inner: TSNode; exported: boolean } {
  if (node.type === "export_statement") {
    const decl =
      node.childForFieldName("declaration") ??
      firstOfType(node, [
        "function_declaration",
        "generator_function_declaration",
        "class_declaration",
        "lexical_declaration",
        "variable_declaration",
      ]);
    if (decl !== null) return { inner: decl, exported: true };
  }
  return { inner: node, exported: false };
}

// ─── Pass 2: imports ────────────────────────────────────────────────────────

function collectImports(
  node: TSNode,
  relativePath: string,
  result: FileExtraction,
  moduleNode: GraphNode,
): void {
  if (node.type === "import_statement") {
    const src = firstOfType(node, ["string"]);
    if (src !== null) {
      const frag = firstOfType(src, ["string_fragment"]);
      const spec = (frag !== null ? frag.text : src.text).replace(/^['"]|['"]$/g, "");
      if (spec.length > 0) {
        result.edges.push({
          source: moduleNode.id,
          target: `external:${spec}`,
          relation: "imports",
          confidence: "EXTRACTED",
        });
      }
    }
    return;
  }
  // require("...") calls
  if (
    node.type === "call_expression" &&
    node.childForFieldName("function")?.text === "require"
  ) {
    const args = node.childForFieldName("arguments");
    if (args !== null) {
      const str = firstOfType(args, ["string"]);
      if (str !== null) {
        const frag = firstOfType(str, ["string_fragment"]);
        const spec = (frag?.text ?? str.text).replace(/^['"]|['"]$/g, "");
        if (spec.length > 0) {
          result.edges.push({
            source: moduleNode.id,
            target: `external:${spec}`,
            relation: "imports",
            confidence: "EXTRACTED",
          });
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null) collectImports(child, relativePath, result, moduleNode);
  }
}

// ─── Pass 3: intra-file calls ───────────────────────────────────────────────

function collectCalls(
  node: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
): void {
  if (node.type === "call_expression") {
    const callee = node.childForFieldName("function");
    if (callee !== null) {
      let calleeKey: string | null = null;
      if (callee.type === "identifier") {
        calleeKey = callee.text;
      } else if (
        callee.type === "member_expression" &&
        callee.childForFieldName("object")?.type === "this"
      ) {
        const prop = callee.childForFieldName("property");
        if (prop !== null) {
          // find enclosing class name
          let cur: TSNode | null = callee.parent;
          while (cur !== null) {
            if (cur.type === "class_declaration") {
              const cn = textOfField(cur, "name");
              if (cn !== null) {
                calleeKey = `${cn}.${prop.text}`;
              }
              break;
            }
            cur = cur.parent;
          }
        }
      }
      if (calleeKey !== null) {
        const target = declByName.get(calleeKey);
        if (target !== undefined) {
          const caller = findEnclosingFn(node, declByName);
          if (caller !== null) {
            result.edges.push({
              source: caller.id,
              target: target.id,
              relation: "calls",
              confidence: "EXTRACTED",
            });
          }
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null) collectCalls(child, relativePath, result, declByName);
  }
}

function findEnclosingFn(
  node: TSNode,
  declByName: Map<string, GraphNode>,
): GraphNode | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    if (cur.type === "function_declaration" || cur.type === "generator_function_declaration") {
      const name = textOfField(cur, "name");
      if (name !== null) {
        const found = declByName.get(name);
        if (found !== undefined) return found;
      }
    } else if (cur.type === "method_definition") {
      const methodName = textOfField(cur, "name");
      let className: string | null = null;
      let p: TSNode | null = cur.parent;
      while (p !== null) {
        if (p.type === "class_declaration") {
          className = textOfField(p, "name");
          break;
        }
        p = p.parent;
      }
      if (methodName !== null && className !== null) {
        const found = declByName.get(`${className}.${methodName}`);
        if (found !== undefined) return found;
      }
    } else if (cur.type === "variable_declarator") {
      const val = cur.childForFieldName("value");
      if (val?.type === "arrow_function" || val?.type === "function_expression") {
        const ident = cur.childForFieldName("name");
        if (ident !== null && ident.type === "identifier") {
          const found = declByName.get(ident.text);
          if (found !== undefined) return found;
        }
      }
    }
    cur = cur.parent;
  }
  return null;
}
