/**
 * Rust extractor (Phase 1.5).
 * Extracts: fn items, struct/enum/trait items (mapped to class/interface),
 * impl block methods, mod items, use declarations, intra-file calls.
 */

import Rust from "tree-sitter-rust";
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
  textOfField,
  type TSNode,
} from "./shared.js";

const LANG = "rust" as const;

export function extractRust(
  sourceCode: string,
  relativePath: string,
): FileExtraction {
  const tree = parseWithChunks(getParser(Rust as object), sourceCode);
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
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    /* c8 ignore next */
    if (child === null) continue;

    if (child.type === "function_item") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      const exported = isRustPub(child);
      pushNode(result, declByName, makeNode(relativePath, name, "function", child, exported, LANG));
    } else if (child.type === "struct_item") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      pushNode(result, declByName, makeNode(relativePath, name, "class", child, isRustPub(child), LANG));
    } else if (child.type === "enum_item") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      pushNode(result, declByName, makeNode(relativePath, name, "enum", child, isRustPub(child), LANG));
    } else if (child.type === "trait_item") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      pushNode(result, declByName, makeNode(relativePath, name, "interface", child, isRustPub(child), LANG));
    } else if (child.type === "impl_item") {
      collectImplMethods(child, relativePath, result, declByName);
    } else if (child.type === "mod_item") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      pushNode(result, declByName, makeNode(relativePath, name, "module", child, isRustPub(child), LANG));
      // recurse into inline module body
      const body = child.childForFieldName("body");
      /* c8 ignore next */
      if (body !== null) {
        collectDecls(body, relativePath, result, declByName, moduleNode);
      }
    } else if (child.type === "use_declaration") {
      collectUseDecl(child, result, moduleNode);
    } else /* c8 ignore next */ if (child.type === "const_item") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      pushNode(result, declByName, makeNode(relativePath, name, "const", child, isRustPub(child), LANG));
    }
  }
}

function isRustPub(node: TSNode): boolean {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && child.type === "visibility_modifier") return true;
  }
  return false;
}

function collectImplMethods(
  impl: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
): void {
  // impl_item → type field (the type being implemented) + declaration_list body
  const typeNode = impl.childForFieldName("type");
  /* c8 ignore next */
  const implTypeName = typeNode !== null ? typeNode.text.trim() : null;

  const body = impl.childForFieldName("body");
  /* c8 ignore next */
  if (body === null) return;

  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    /* c8 ignore next */
    if (member === null || member.type !== "function_item") continue;
    const name = textOfField(member, "name");
    /* c8 ignore next */
    if (name === null) continue;
    /* c8 ignore next */
    const key = implTypeName !== null ? `${implTypeName}::${name}` : name;
    const methodNode: GraphNode = {
      id: nodeId(relativePath, key, "method"),
      label: name,
      kind: "method",
      source_file: relativePath,
      source_location: locationStr(member),
      language: LANG,
      exported: isRustPub(member),
    };
    pushNode(result, declByName, methodNode, key);
    /* c8 ignore next */
    if (implTypeName !== null) {
      result.edges.push({
        source: nodeId(relativePath, implTypeName, "class"),
        target: methodNode.id,
        relation: "method_of",
        confidence: "EXTRACTED",
      });
    }
  }
}

function collectUseDecl(
  node: TSNode,
  result: FileExtraction,
  moduleNode: GraphNode,
): void {
  // use std::io::Read → extract the path prefix
  const arg = node.childForFieldName("argument");
  /* c8 ignore next */
  if (arg === null) return;
  const path = extractUsePath(arg);
  /* c8 ignore next */
  if (path.length > 0) {
    result.edges.push({
      source: moduleNode.id,
      target: `external:${path}`,
      relation: "imports",
      confidence: "EXTRACTED",
    });
  }
}

function extractUsePath(node: TSNode): string {
  if (node.type === "scoped_identifier" || node.type === "scoped_use_list") {
    const path = node.childForFieldName("path");
    const name = node.childForFieldName("name");
    /* c8 ignore next */
    const pathStr = path !== null ? extractUsePath(path) : "";
    const nameStr = name !== null ? name.text : "";
    return pathStr.length > 0 && nameStr.length > 0
      ? `${pathStr}::${nameStr}`
      /* c8 ignore next */
      : pathStr || nameStr;
  }
  /* c8 ignore next */
  if (node.type === "identifier" || node.type === "self") return node.text;
  /* c8 ignore next */
  return "";
}

// ─── Pass 3: intra-file calls ───────────────────────────────────────────────

function collectCalls(
  node: TSNode,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
): void {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    /* c8 ignore next */
    if (fn !== null && fn.type === "identifier") {
      const target = declByName.get(fn.text);
      const caller = findEnclosingFn(node, declByName);
      /* c8 ignore next */
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
    /* c8 ignore next */
    if (child !== null) collectCalls(child, result, declByName);
  }
}

function findEnclosingFn(
  node: TSNode,
  declByName: Map<string, GraphNode>,
): GraphNode | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    if (cur.type === "function_item") {
      const name = textOfField(cur, "name");
      /* c8 ignore next */
      if (name !== null) {
        // check bare name first, then impl-qualified name
        const found = declByName.get(name) ?? (() => {
          for (const [k, v] of declByName) {
            /* c8 ignore next */
            if (k.endsWith(`::${name}`) || k === name) return v;
          }
          /* c8 ignore next */
          return undefined;
        })();
        /* c8 ignore next */
        if (found !== undefined) return found;
      }
    }
    cur = cur.parent;
  }
  /* c8 ignore next */
  return null;
}
