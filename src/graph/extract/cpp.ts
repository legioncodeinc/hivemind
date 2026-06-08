/**
 * C++ extractor (Phase 1.5).
 * Builds on the C extractor and adds: class_specifier, namespace_definition,
 * template_declaration unwrapping, and qualified method names.
 */

import Cpp from "tree-sitter-cpp";
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
import {
  collectCalls as collectCCalls,
  collectDecls as collectCDecls,
  extractFunctionName,
  findEnclosingFn as findCEnclosingFn,
} from "./c.js";

const LANG = "cpp" as const;

export function extractCpp(
  sourceCode: string,
  relativePath: string,
): FileExtraction {
  const tree = parseWithChunks(getParser(Cpp as object), sourceCode);
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
  collectCppDecls(root, relativePath, result, declByName, moduleNode, null);
  collectCppCalls(root, result, declByName);

  return result;
}

// ─── Pass 1 + 2 ────────────────────────────────────────────────────────────

function collectCppDecls(
  node: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  moduleNode: GraphNode,
  enclosingClass: string | null,
  enclosingNamespace: string | null = null,
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    /* c8 ignore next */
    if (child === null) continue;

    if (child.type === "function_definition") {
      const name = extractFunctionName(child);
      /* c8 ignore next */
      if (name === null) continue;
      /* c8 ignore next */
      const nsPrefix = enclosingNamespace !== null ? `${enclosingNamespace}::` : "";
      /* c8 ignore next */
      const key = enclosingClass !== null ? `${nsPrefix}${enclosingClass}::${name}` : `${nsPrefix}${name}`;
      /* c8 ignore next */
      const kind = enclosingClass !== null ? "method" : "function";
      const decl: GraphNode = {
        id: nodeId(relativePath, key, kind),
        label: name,
        kind,
        source_file: relativePath,
        source_location: locationStr(child),
        language: LANG,
        exported: true,
      };
      pushNode(result, declByName, decl, key);
      /* c8 ignore next */
      if (enclosingClass !== null) {
        result.edges.push({
          source: nodeId(relativePath, enclosingClass, "class"),
          target: decl.id,
          relation: "method_of",
          confidence: "EXTRACTED",
        });
      }
    } else if (child.type === "class_specifier" || child.type === "struct_specifier") {
      /* c8 ignore next */
      const name = child.childForFieldName("name")?.text ?? null;
      /* c8 ignore next */
      if (name !== null && name.length > 0) {
        const classDecl = makeNode(relativePath, name, "class", child, true, LANG);
        pushNode(result, declByName, classDecl);
        // recurse into class body
        const body = child.childForFieldName("body");
        /* c8 ignore next */
        if (body !== null) {
          collectCppDecls(body, relativePath, result, declByName, moduleNode, name, enclosingNamespace);
        }
      }
    } else if (child.type === "namespace_definition") {
      /* c8 ignore next */
      const name = child.childForFieldName("name")?.text ?? null;
      /* c8 ignore next */
      if (name !== null && name.length > 0) {
        pushNode(result, declByName, makeNode(relativePath, name, "module", child, true, LANG));
      }
      const body = child.childForFieldName("body");
      /* c8 ignore next */
      if (body !== null) {
        // Pass the namespace name so declarations inside are keyed as `ns::symbol`,
        // matching the `scope::name` format used by collectCppCalls for qualified calls.
        /* c8 ignore next */
        collectCppDecls(body, relativePath, result, declByName, moduleNode, enclosingClass, name ?? enclosingNamespace);
      }
    } else if (child.type === "template_declaration") {
      // Unwrap template to get the underlying declaration
      for (let j = 0; j < child.namedChildCount; j++) {
        const inner = child.namedChild(j);
        /* c8 ignore next */
        if (inner === null) continue;
        if (
          inner.type === "function_definition" ||
          inner.type === "class_specifier" ||
          inner.type === "struct_specifier"
        ) {
          // recurse treating it as a regular child
          const wrapper = {
            ...node,
            namedChildCount: 1,
            namedChild: (_: number) => inner,
            namedChildren: [inner],
          } as unknown as TSNode;
          collectCppDecls(wrapper, relativePath, result, declByName, moduleNode, enclosingClass, enclosingNamespace);
        }
      }
    } else if (child.type === "preproc_include") {
      const path = child.childForFieldName("path");
      /* c8 ignore next */
      if (path !== null) {
        const raw = path.text.replace(/^["<]|[">]$/g, "");
        /* c8 ignore next */
        if (raw.length > 0) {
          result.edges.push({
            source: moduleNode.id,
            target: `external:${raw}`,
            relation: "imports",
            confidence: "EXTRACTED",
          });
        }
      }
    } else /* c8 ignore next */ if (child.type === "using_declaration") {
      // using namespace std; or using std::vector;
      const name = child.text.replace(/^using\s+(namespace\s+)?/, "").replace(/;$/, "").trim();
      /* c8 ignore next */
      if (name.length > 0) {
        result.edges.push({
          source: moduleNode.id,
          target: `external:${name}`,
          relation: "imports",
          confidence: "EXTRACTED",
        });
      }
    } else {
      // recurse into field_declaration_list, translation_unit, etc.
      collectCppDecls(child, relativePath, result, declByName, moduleNode, enclosingClass, enclosingNamespace);
    }
  }
}

// ─── Pass 3: intra-file calls ───────────────────────────────────────────────

function collectCppCalls(
  node: TSNode,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
): void {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    /* c8 ignore next */
    if (fn !== null) {
      let key: string | null = null;
      if (fn.type === "identifier") {
        key = fn.text;
      } else if (fn.type === "field_expression") {
        const field = fn.childForFieldName("field");
        const obj = fn.childForFieldName("argument");
        /* c8 ignore next */
        if (field !== null && (obj === null || obj.type === "this")) {
          const cn = findEnclosingClass(fn);
          /* c8 ignore next */
          key = cn !== null ? `${cn}::${field.text}` : field.text;
        }
      } else if (fn.type === "qualified_identifier") {
        // Foo::bar()
        const scope = fn.childForFieldName("scope");
        const name = fn.childForFieldName("name");
        /* c8 ignore next */
        if (scope !== null && name !== null) key = `${scope.text}::${name.text}`;
      }
      /* c8 ignore next */
      if (key !== null) {
        const target = declByName.get(key);
        const caller = findEnclosingFnCpp(fn, declByName);
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
    if (child !== null) collectCppCalls(child, result, declByName);
  }
}

function findEnclosingClass(node: TSNode): string | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    /* c8 ignore next */
    if (cur.type === "class_specifier" || cur.type === "struct_specifier") {
      /* c8 ignore next */
      return cur.childForFieldName("name")?.text ?? null;
    }
    cur = cur.parent;
  }
  /* c8 ignore next */
  return null;
}

function findEnclosingFnCpp(
  node: TSNode,
  declByName: Map<string, GraphNode>,
): GraphNode | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    if (cur.type === "function_definition") {
      const name = extractFunctionName(cur);
      /* c8 ignore next */
      if (name !== null) {
        const cn = findEnclosingClass(cur);
        /* c8 ignore next */
        const key = cn !== null ? `${cn}::${name}` : name;
        /* c8 ignore next */
        const found = declByName.get(key) ?? declByName.get(name);
        /* c8 ignore next */
        if (found !== undefined) return found;
      }
    }
    cur = cur.parent;
  }
  /* c8 ignore next */
  return null;
}
