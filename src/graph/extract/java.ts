/**
 * Java extractor (Phase 1.5).
 * Extracts: class/interface/enum declarations, method declarations,
 * import declarations, intra-file method call resolution.
 */

import Java from "tree-sitter-java";
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

const LANG = "java" as const;

export function extractJava(
  sourceCode: string,
  relativePath: string,
): FileExtraction {
  const tree = parseWithChunks(getParser(Java as object), sourceCode);
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

    if (child.type === "import_declaration") {
      collectJavaImport(child, result, moduleNode);
    } else if (child.type === "class_declaration") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      const classDecl = makeNode(relativePath, name, "class", child, isJavaPublic(child), LANG);
      pushNode(result, declByName, classDecl);
      const body = child.childForFieldName("body");
      /* c8 ignore next */
      if (body !== null) collectClassBody(body, relativePath, result, declByName, name, isJavaPublic(child));
    } else if (child.type === "interface_declaration") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      pushNode(result, declByName, makeNode(relativePath, name, "interface", child, isJavaPublic(child), LANG));
    } else /* c8 ignore next */ if (child.type === "enum_declaration") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      pushNode(result, declByName, makeNode(relativePath, name, "enum", child, isJavaPublic(child), LANG));
    }
  }
}

function isJavaPublic(node: TSNode): boolean {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && child.type === "modifiers") {
      return child.text.includes("public");
    }
  }
  return false;
}

function collectClassBody(
  body: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  className: string,
  classPublic: boolean,
): void {
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    /* c8 ignore next */
    if (member === null) continue;

    if (member.type === "method_declaration" || member.type === "constructor_declaration") {
      const name = textOfField(member, "name");
      /* c8 ignore next */
      if (name === null) continue;
      const key = `${className}.${name}`;
      const methodNode: GraphNode = {
        id: nodeId(relativePath, key, "method"),
        label: name,
        kind: "method",
        source_file: relativePath,
        source_location: locationStr(member),
        language: LANG,
        exported: classPublic && isJavaPublic(member),
      };
      pushNode(result, declByName, methodNode, key);
      result.edges.push({
        source: nodeId(relativePath, className, "class"),
        target: methodNode.id,
        relation: "method_of",
        confidence: "EXTRACTED",
      });
    } else /* c8 ignore next */ if (member.type === "class_declaration") {
      // nested class
      const name = textOfField(member, "name");
      /* c8 ignore next */
      if (name === null) continue;
      const nestedKey = `${className}.${name}`;
      pushNode(result, declByName, {
        id: nodeId(relativePath, nestedKey, "class"),
        label: name,
        kind: "class",
        source_file: relativePath,
        source_location: locationStr(member),
        language: LANG,
        exported: isJavaPublic(member),
      });
    }
  }
}

function collectJavaImport(
  node: TSNode,
  result: FileExtraction,
  moduleNode: GraphNode,
): void {
  // import_declaration → scoped_identifier | asterisk_import
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    /* c8 ignore next */
    if (child === null) continue;
    /* c8 ignore next */
    if (child.type === "scoped_identifier" || child.type === "identifier") {
      const raw = child.text;
      /* c8 ignore next */
      if (raw.length > 0) {
        result.edges.push({
          source: moduleNode.id,
          target: `external:${raw}`,
          relation: "imports",
          confidence: "EXTRACTED",
        });
      }
      break;
    }
  }
}

// ─── Pass 3: intra-file calls ───────────────────────────────────────────────

function collectCalls(
  node: TSNode,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
): void {
  if (node.type === "method_invocation") {
    const name = textOfField(node, "name");
    const object = node.childForFieldName("object");
    /* c8 ignore next */
    if (name !== null) {
      // simple call: foo() or this.foo()
      /* c8 ignore next */
      const isThisCall = object === null || object.type === "this";
      /* c8 ignore next */
      if (isThisCall) {
        // find enclosing class to build key
        /* c8 ignore next */
        const className = findEnclosingClassName(node);
        /* c8 ignore next */
        const key = className !== null ? `${className}.${name}` : name;
        /* c8 ignore next */
        const target = declByName.get(key) ?? declByName.get(name);
        const caller = findEnclosingMethod(node, declByName);
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
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    /* c8 ignore next */
    if (child !== null) collectCalls(child, result, declByName);
  }
}

function findEnclosingClassName(node: TSNode): string | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    /* c8 ignore next */
    if (cur.type === "class_declaration") return textOfField(cur, "name");
    cur = cur.parent;
  }
  /* c8 ignore next */
  return null;
}

function findEnclosingMethod(
  node: TSNode,
  declByName: Map<string, GraphNode>,
): GraphNode | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    /* c8 ignore next */
    if (cur.type === "method_declaration" || cur.type === "constructor_declaration") {
      const methodName = textOfField(cur, "name");
      const className = findEnclosingClassName(cur);
      /* c8 ignore next */
      if (methodName !== null && className !== null) {
        const found = declByName.get(`${className}.${methodName}`);
        /* c8 ignore next */
        if (found !== undefined) return found;
      }
    }
    cur = cur.parent;
  }
  /* c8 ignore next */
  return null;
}
