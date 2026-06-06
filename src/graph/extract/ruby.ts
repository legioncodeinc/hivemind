/**
 * Ruby extractor (Phase 1.5).
 * Extracts: method/singleton-method defs, class/module declarations,
 * require/require_relative imports, intra-file calls.
 */

import Ruby from "tree-sitter-ruby";
import type { FileExtraction, GraphNode } from "../types.js";
import {
  collectParseErrors,
  getParser,
  locationStr,
  makeModuleNode,
  makeNode,
  nodeId,
  parseWithChunks,
  pushNode,
  type TSNode,
} from "./shared.js";

const LANG = "ruby" as const;

export function extractRuby(
  sourceCode: string,
  relativePath: string,
): FileExtraction {
  const tree = parseWithChunks(getParser(Ruby as object), sourceCode);
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
  collectDecls(root, relativePath, result, declByName, moduleNode, null);
  collectCalls(root, result, declByName);

  return result;
}

// ─── Pass 1 + 2 ────────────────────────────────────────────────────────────

function collectDecls(
  node: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  moduleNode: GraphNode,
  enclosingClass: string | null,
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null) continue;

    if (child.type === "method" || child.type === "singleton_method") {
      const nameNode = child.childForFieldName("name");
      if (nameNode === null) continue;
      const sym = nameNode.text;
      const key = enclosingClass !== null ? `${enclosingClass}#${sym}` : sym;
      const kind = enclosingClass !== null ? "method" : "function";
      const decl = makeNode(relativePath, key, kind, child, true, LANG);
      pushNode(result, declByName, decl, key);
      if (enclosingClass !== null) {
        result.edges.push({
          source: nodeId(relativePath, enclosingClass, "class"),
          target: decl.id,
          relation: "method_of",
          confidence: "EXTRACTED",
        });
      }
    } else if (child.type === "class" || child.type === "module") {
      const nameNode = child.childForFieldName("name");
      if (nameNode === null) continue;
      const sym = nameNode.text;
      const classDecl = makeNode(relativePath, sym, "class", child, true, LANG);
      pushNode(result, declByName, classDecl);
      // superclass → extends edge
      const superclass = child.childForFieldName("superclass");
      if (superclass !== null) {
        result.edges.push({
          source: classDecl.id,
          target: `unresolved:${relativePath}:${superclass.text}:class`,
          relation: "extends",
          confidence: "EXTRACTED",
        });
      }
      // recurse into class body
      const body = child.childForFieldName("body");
      if (body !== null) {
        collectDecls(body, relativePath, result, declByName, moduleNode, sym);
      }
    } else if (child.type === "call") {
      // require / require_relative
      const method = child.childForFieldName("method");
      if (
        method !== null &&
        (method.text === "require" || method.text === "require_relative")
      ) {
        const args = child.childForFieldName("arguments");
        if (args !== null) {
          for (let j = 0; j < args.namedChildCount; j++) {
            const arg = args.namedChild(j);
            if (arg === null) continue;
            // string_content or string node
            const content =
              arg.type === "string_content"
                ? arg.text
                : arg.type === "string"
                  ? arg.namedChild(0)?.text ?? ""
                  : "";
            if (content.length > 0) {
              result.edges.push({
                source: moduleNode.id,
                target: `external:${content}`,
                relation: "imports",
                confidence: "EXTRACTED",
              });
            }
          }
        }
      }
    } else {
      // recurse into do_block, begin, if, etc.
      collectDecls(child, relativePath, result, declByName, moduleNode, enclosingClass);
    }
  }
}

// ─── Pass 3: intra-file calls ───────────────────────────────────────────────

function collectCalls(
  node: TSNode,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
): void {
  if (node.type === "call") {
    const method = node.childForFieldName("method");
    const receiver = node.childForFieldName("receiver");
    if (method !== null && (receiver === null || receiver.type === "self")) {
      const className = findEnclosingClass(node);
      const key = className !== null ? `${className}#${method.text}` : method.text;
      const target = declByName.get(key) ?? declByName.get(method.text);
      const caller = findEnclosingMethod(node, declByName);
      if (target !== undefined && caller !== null) {
        result.edges.push({
          source: caller.id,
          target: target.id,
          relation: "calls",
          confidence: "EXTRACTED",
        });
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null) collectCalls(child, result, declByName);
  }
}

function findEnclosingClass(node: TSNode): string | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    if (cur.type === "class" || cur.type === "module") {
      return cur.childForFieldName("name")?.text ?? null;
    }
    cur = cur.parent;
  }
  return null;
}

function findEnclosingMethod(
  node: TSNode,
  declByName: Map<string, GraphNode>,
): GraphNode | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    if (cur.type === "method" || cur.type === "singleton_method") {
      const nameNode = cur.childForFieldName("name");
      if (nameNode !== null) {
        const className = findEnclosingClass(cur);
        const key =
          className !== null
            ? `${className}#${nameNode.text}`
            : nameNode.text;
        const found = declByName.get(key) ?? declByName.get(nameNode.text);
        if (found !== undefined) return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}
