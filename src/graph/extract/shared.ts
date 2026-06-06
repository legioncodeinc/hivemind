/**
 * Shared utilities for language extractors (Phase 1.5+).
 * The TypeScript extractor (typescript.ts) keeps its own copies for
 * zero-risk isolation; new language extractors import from here.
 */

import Parser from "tree-sitter";
import type {
  FileExtraction,
  GraphNode,
  NodeKind,
  NodeLanguage,
  ParseError,
} from "../types.js";

export type { FileExtraction, GraphNode, NodeKind, NodeLanguage };

// Minimal tree-sitter Node interface (same as in typescript.ts).
export interface TSNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  isError: boolean;
  isMissing: boolean;
  hasError: boolean;
  namedChildCount: number;
  parent: TSNode | null;
  namedChild(index: number): TSNode | null;
  namedChildren: TSNode[];
  childForFieldName(name: string): TSNode | null;
}

// tree-sitter 0.21 throws on strings > 32 KB; the callback API streams chunks.
export const CHUNK_BYTES = 16384;

export function parseWithChunks(
  parser: Parser,
  sourceCode: string,
): { rootNode: TSNode } {
  return (parser as unknown as {
    parse(cb: (i: number) => string | null): { rootNode: TSNode };
  }).parse((i: number) =>
    i >= sourceCode.length ? null : sourceCode.slice(i, i + CHUNK_BYTES),
  );
}

// Singleton parsers keyed by grammar object identity.
const _parsers = new WeakMap<object, Parser>();

export function getParser(grammar: object): Parser {
  let p = _parsers.get(grammar);
  if (p === undefined) {
    p = new Parser();
    (p as unknown as { setLanguage(l: unknown): void }).setLanguage(grammar);
    _parsers.set(grammar, p);
  }
  return p;
}

export function collectParseErrors(
  node: TSNode,
  relativePath: string,
  out: ParseError[],
): void {
  if (node.isError || node.isMissing) {
    out.push({
      source_file: relativePath,
      message: node.isMissing
        ? `missing node: ${node.type}`
        : `parse error at ${locationStr(node)}`,
      location: locationStr(node),
    });
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null) collectParseErrors(child, relativePath, out);
  }
}

export function makeModuleNode(
  relativePath: string,
  language: NodeLanguage,
): GraphNode {
  return {
    id: `${relativePath}::module`,
    label: relativePath,
    kind: "module",
    source_file: relativePath,
    source_location: "L1",
    language,
    exported: false,
  };
}

export function makeNode(
  relativePath: string,
  name: string,
  kind: NodeKind,
  node: TSNode,
  exported: boolean,
  language: NodeLanguage,
): GraphNode {
  return {
    id: nodeId(relativePath, name, kind),
    label: name,
    kind,
    source_file: relativePath,
    source_location: locationStr(node),
    language,
    exported,
  };
}

export function pushNode(
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  node: GraphNode,
  lookupKey?: string,
): void {
  if (result.nodes.some((n) => n.id === node.id)) {
    if (!declByName.has(lookupKey ?? node.label)) {
      declByName.set(lookupKey ?? node.label, node);
    }
    return;
  }
  result.nodes.push(node);
  declByName.set(lookupKey ?? node.label, node);
}

export function nodeId(
  relativePath: string,
  name: string,
  kind: NodeKind,
): string {
  return `${relativePath}:${name}:${kind}`;
}

export function locationStr(node: TSNode): string {
  const start = node.startPosition.row + 1;
  const end = node.endPosition.row + 1;
  return start === end ? `L${start}` : `L${start}-${end}`;
}

export function textOfField(node: TSNode, fieldName: string): string | null {
  const child = node.childForFieldName(fieldName);
  if (child === null) return null;
  const t = child.text;
  return t.length > 0 ? t : null;
}

export function firstOfType(node: TSNode, types: string[]): TSNode | null {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && types.includes(child.type)) return child;
  }
  return null;
}

/** Walk up the AST to find the nearest enclosing callable declaration. */
export function findEnclosingDecl(
  node: TSNode,
  declTypes: string[],
  getName: (n: TSNode) => string | null,
  declByName: Map<string, GraphNode>,
): GraphNode | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    if (declTypes.includes(cur.type)) {
      const name = getName(cur);
      if (name !== null) {
        const found = declByName.get(name);
        if (found !== undefined) return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}
