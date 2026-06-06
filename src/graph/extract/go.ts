/**
 * Go extractor (Phase 1.5).
 * Extracts: function declarations, method declarations, type declarations
 * (struct/interface), import specs, intra-file calls (identifier only).
 */

import Go from "tree-sitter-go";
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

const LANG = "go" as const;

export function extractGo(
  sourceCode: string,
  relativePath: string,
): FileExtraction {
  const tree = parseWithChunks(getParser(Go as object), sourceCode);
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

// ─── Pass 1 + 2: declarations + imports ────────────────────────────────────
// (Go imports are in the source file directly; handled in one pass)

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

    if (child.type === "function_declaration") {
      const name = textOfField(child, "name");
      if (name === null) continue;
      pushNode(result, declByName, makeNode(relativePath, name, "function", child, true, LANG));
    } else if (child.type === "method_declaration") {
      // receiver type + method name → "ReceiverType.MethodName"
      const name = textOfField(child, "name");
      const receiver = child.childForFieldName("receiver");
      const receiverType = receiver !== null ? extractReceiverType(receiver) : null;
      if (name === null) continue;
      const key = receiverType !== null ? `${receiverType}.${name}` : name;
      const methodNode: GraphNode = {
        id: nodeId(relativePath, key, "method"),
        label: name,
        kind: "method",
        source_file: relativePath,
        source_location: locationStr(child),
        language: LANG,
        exported: name[0] === name[0].toUpperCase(), // Go: uppercase = exported
      };
      pushNode(result, declByName, methodNode, key);
      if (receiverType !== null) {
        result.edges.push({
          source: nodeId(relativePath, receiverType, "class"),
          target: methodNode.id,
          relation: "method_of",
          confidence: "EXTRACTED",
        });
      }
    } else if (child.type === "type_declaration") {
      // type Foo struct/interface
      for (let j = 0; j < child.namedChildCount; j++) {
        const spec = child.namedChild(j);
        if (spec === null || spec.type !== "type_spec") continue;
        const name = textOfField(spec, "name");
        if (name === null) continue;
        const typeField = spec.childForFieldName("type");
        const kind =
          typeField?.type === "interface_type" ? "interface" : "class";
        pushNode(
          result,
          declByName,
          makeNode(relativePath, name, kind, spec, name[0] === name[0].toUpperCase(), LANG),
        );
      }
    } else if (child.type === "import_declaration") {
      collectGoImports(child, result, moduleNode);
    } else if (child.type === "const_declaration" || child.type === "var_declaration") {
      collectGoVarConst(child, relativePath, result, declByName);
    }
  }
}

function extractReceiverType(receiver: TSNode): string | null {
  // parameter_list → parameter_declaration → pointer_type or type_identifier
  for (let i = 0; i < receiver.namedChildCount; i++) {
    const param = receiver.namedChild(i);
    if (param === null) continue;
    const typeField = param.childForFieldName("type");
    if (typeField === null) continue;
    if (typeField.type === "type_identifier") return typeField.text;
    if (typeField.type === "pointer_type") {
      // *Foo → Foo
      for (let j = 0; j < typeField.namedChildCount; j++) {
        const inner = typeField.namedChild(j);
        if (inner !== null && inner.type === "type_identifier") return inner.text;
      }
    }
  }
  return null;
}

function collectGoImports(
  node: TSNode,
  result: FileExtraction,
  moduleNode: GraphNode,
): void {
  // import_declaration → import_spec or import_spec_list → import_spec
  const addSpec = (spec: TSNode) => {
    const path = spec.childForFieldName("path");
    if (path === null) return;
    const raw = path.text.replace(/^"|"$/g, "");
    if (raw.length > 0) {
      result.edges.push({
        source: moduleNode.id,
        target: `external:${raw}`,
        relation: "imports",
        confidence: "EXTRACTED",
      });
    }
  };
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null) continue;
    if (child.type === "import_spec") addSpec(child);
    else if (child.type === "import_spec_list") {
      for (let j = 0; j < child.namedChildCount; j++) {
        const spec = child.namedChild(j);
        if (spec !== null && spec.type === "import_spec") addSpec(spec);
      }
    }
  }
}

function collectGoVarConst(
  node: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const spec = node.namedChild(i);
    if (spec === null) continue;
    if (
      spec.type === "const_spec" ||
      spec.type === "var_spec"
    ) {
      const nameNode = spec.childForFieldName("name");
      const name = nameNode?.text ?? null;
      if (name !== null && name.length > 0) {
        pushNode(result, declByName, makeNode(relativePath, name, "const", spec, name[0] === name[0].toUpperCase(), LANG));
      }
    }
  }
}

// ─── Pass 3: intra-file calls ───────────────────────────────────────────────

function collectCalls(
  node: TSNode,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
): void {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    if (fn !== null && fn.type === "identifier") {
      const target = declByName.get(fn.text);
      const caller = findEnclosingFn(node, declByName);
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

function findEnclosingFn(
  node: TSNode,
  declByName: Map<string, GraphNode>,
): GraphNode | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    if (cur.type === "function_declaration") {
      const name = textOfField(cur, "name");
      if (name !== null) {
        const found = declByName.get(name);
        if (found !== undefined) return found;
      }
    } else if (cur.type === "method_declaration") {
      const name = textOfField(cur, "name");
      const receiver = cur.childForFieldName("receiver");
      const rt = receiver !== null ? extractReceiverType(receiver) : null;
      if (name !== null) {
        const key = rt !== null ? `${rt}.${name}` : name;
        const found = declByName.get(key);
        if (found !== undefined) return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}
