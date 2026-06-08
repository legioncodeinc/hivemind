/**
 * Types for the codebase-graph feature (Phase 1.5).
 *
 * Output shape mirrors the NetworkX node-link JSON format so the snapshot can
 * be consumed by any tool that already understands NetworkX graphs (including
 * graphify's own visualizers if we ever want to fall back to them). Snapshot
 * canonicalization (sort + stable JSON) is the responsibility of snapshot.ts.
 *
 * Supported languages: TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, C, C++.
 * Edge types are intra-file for `calls` and file-level for `imports`.
 * Cross-file call resolution lands in Phase 1.5.
 */

/**
 * Full snapshot written to ~/.hivemind/graphs/<repo-key>/snapshots/<commit-sha>.json
 * Shape is NetworkX node-link compatible (directed multigraph).
 *
 * Content-hash contract: the canonical SHA256 (computed in snapshot.ts, Task #4)
 * covers `directed + multigraph + graph + nodes + links` ONLY. The `observation`
 * field is excluded so two builds of identical code on different worktrees,
 * branches, or timestamps dedup correctly.
 */
export interface GraphSnapshot {
  /** Always true: code graphs are directed (caller → callee, importer → imported). */
  directed: true;
  /** Always true: same source/target pair can have multiple edges with different relations. */
  multigraph: true;
  /** Stable metadata — part of the content hash. */
  graph: GraphMetadata;
  /**
   * Volatile metadata — NOT part of the content hash. Captures build-time
   * observations (when, where, which generator version). Two builds with
   * identical `graph + nodes + links` and different `observation` MUST
   * produce the same snapshot_sha256.
   */
  observation: GraphObservation;
  /** Sorted by `id` (string compare) for deterministic canonicalization. */
  nodes: GraphNode[];
  /** Sorted by (source, target, relation, ord) for deterministic canonicalization. */
  links: GraphEdge[];
}

/**
 * Stable metadata. Bytes from this object DO contribute to snapshot_sha256.
 * Anything here changing on a build of identical code is a bug.
 */
export interface GraphMetadata {
  /** Bump when GraphSnapshot shape changes. */
  schema_version: 1;
  /** Distinguishes hivemind-produced snapshots from graphify-produced ones. */
  generator: "hivemind-graph";
  /** Git HEAD at extraction time; null if cwd isn't a git repo. */
  commit_sha: string | null;
  /** Stable per-repo identifier — sha1 of normalized git remote URL. */
  repo_key: string;
}

/**
 * Volatile metadata. Bytes from this object do NOT contribute to snapshot_sha256.
 * Captures contextual info useful for inspection / queries / cloud row metadata,
 * but excluded from content identity so dedup works across worktrees / branches.
 */
export interface GraphObservation {
  /** ISO 8601 UTC. */
  ts: string;
  /**
   * Current branch at extraction time. Observation only — a commit lives on
   * many branches and the snapshot identity is the commit, not the branch
   * (per codex finding on branch semantics).
   */
  branch: string | null;
  /** Absolute path of THIS worktree (multi-worktree disambiguator). */
  worktree_path: string;
  /**
   * Human-friendly basename of the worktree root. Observation only: the
   * same repo cloned to `/tmp/a` vs `/work/project-copy` produces different
   * basenames; basename does NOT belong to repo identity (repo_key does).
   */
  repo_project: string;
  /**
   * hivemind plugin version this snapshot was built with. Observation only:
   * a version bump that doesn't change `schema_version` shouldn't invalidate
   * dedup against snapshots built by earlier versions.
   */
  generator_version: string;
  /** How many source files were successfully extracted. */
  source_files_extracted: number;
  /** How many files were considered but skipped (parse error, unsupported ext). */
  source_files_skipped: number;
}

export interface GraphNode {
  /** Globally unique within this snapshot. Format: `<source_file>:<symbol_name>:<kind>`. */
  id: string;
  /** Display name (typically symbol_name without path/kind suffix). */
  label: string;
  /** What kind of code construct this node represents. */
  kind: NodeKind;
  /** Path relative to repo root (forward slashes, no leading slash). */
  source_file: string;
  /** `L<line>` or `L<line>-<endLine>` (1-indexed). */
  source_location: string;
  language: NodeLanguage;
  /** Whether the symbol is `export`ed (relevant for cross-file resolution in Phase 1.5). */
  exported: boolean;
  /**
   * Phase 1.5 AST-only node metadata. All OPTIONAL and additive — older
   * snapshots and hand-built fixtures omit them.
   *
   * `signature` / `doc` are intrinsic (captured by the extractor from the AST).
   * `fan_in` / `fan_out` / `is_entrypoint` are DERIVED and computed in
   * buildSnapshot AFTER cross-file edge resolution, so they reflect the full
   * graph, not just intra-file edges.
   */
  /** One-line declaration signature (truncated), e.g. `function foo(a: number): string`. */
  signature?: string;
  /** Leading JSDoc/TSDoc or line-comment summary (first line, truncated). */
  doc?: string;
  /** Number of incoming edges (any relation) in the resolved graph. */
  fan_in?: number;
  /** Number of outgoing edges (any relation) in the resolved graph. */
  fan_out?: number;
  /** Heuristic: `exported && fan_in === 0` — a likely public/root symbol. */
  is_entrypoint?: boolean;
}

export type NodeKind =
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type_alias"
  | "enum"
  | "const"
  | "variable"
  | "module";

export type NodeLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "ruby"
  | "c"
  | "cpp";

export interface GraphEdge {
  /** Source node `id`. */
  source: string;
  /** Target node `id`. May refer to an unresolved symbol (Phase 1 has no cross-file resolution). */
  target: string;
  /** Edge semantics. */
  relation: EdgeRelation;
  /**
   * Confidence label — matches graphify convention so consumers can apply
   * the same filtering logic. Phase 1 edges are almost entirely EXTRACTED;
   * INFERRED/AMBIGUOUS appear in later phases with LLM-based extraction.
   */
  confidence: EdgeConfidence;
  /**
   * Optional disambiguator for multigraph edges that share (source, target, relation).
   * E.g. a function calling another function twice. Defaults to 0 when omitted.
   */
  ord?: number;
}

export type EdgeRelation =
  /** File-level import statement. `source` is the file's module node, `target` is the imported symbol or module. */
  | "imports"
  /** Function/method invocation. Phase 1: intra-file only. Phase 1.5: cross-file. */
  | "calls"
  /** Class inheritance: `source extends target`. */
  | "extends"
  /** Interface implementation: `class implements interface`. */
  | "implements"
  /** Method belonging to a class. `source` is the class, `target` is the method. */
  | "method_of";

export type EdgeConfidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

/**
 * Per-file extractor output. Aggregated by snapshot.ts into the final
 * GraphSnapshot. Carries parse errors so we can report which files were
 * skipped without losing the reason.
 */
export interface FileExtraction {
  /** Path relative to repo root. */
  source_file: string;
  /** Language detected from extension. */
  language: NodeLanguage;
  /** Nodes extracted from this file. Not necessarily sorted; snapshot.ts sorts globally. */
  nodes: GraphNode[];
  /** Edges extracted from this file. Same: snapshot.ts sorts globally. */
  edges: GraphEdge[];
  /** Empty array on clean parse; populated when tree-sitter reports ERROR nodes. */
  parse_errors: ParseError[];
  /**
   * Phase 1.5 cross-file call resolution inputs. OPTIONAL and additive: older
   * extractions / hand-built test fixtures omit them and the cross-file
   * resolver simply produces no edges for that file. Populated by the
   * TypeScript extractor; consumed by src/graph/resolve/cross-file.ts.
   *
   * Calls the per-file extractor could NOT resolve to a same-file declaration
   * (e.g. an imported function). The resolver matches callee_name against the
   * file's import_bindings to find a cross-file target.
   */
  raw_calls?: RawCall[];
  /** Import name → source module bindings for this file (Phase 1.5). */
  import_bindings?: ImportBinding[];
}

export interface ParseError {
  source_file: string;
  message: string;
  /** Optional `L<line>` if the parser localized the error. */
  location?: string;
}

/**
 * An unresolved call site captured by the extractor for the cross-file pass.
 * `caller_id` is the enclosing declaration's node id; `callee_name` is the
 * bare identifier being invoked. For a namespaced call `ns.foo()`, `receiver`
 * is the namespace object (`ns`) and `callee_name` is the property (`foo`).
 */
export interface RawCall {
  caller_id: string;
  callee_name: string;
  receiver?: string;
}

/**
 * A single imported binding in a file. `imported_name` is the name in the
 * SOURCE module: the real export for a named import (accounting for `as`
 * aliases), the literal "default" for a default import, or "*" for a
 * namespace import. `local_name` is how this file refers to it.
 */
export interface ImportBinding {
  local_name: string;
  imported_name: string;
  kind: "named" | "default" | "namespace";
  /** Raw module specifier, e.g. "./foo" or "../bar/baz". */
  specifier: string;
  /**
   * True for `import type {...}` and per-specifier `import { type Foo }`. A
   * type-only binding can never be a VALUE call target (calls resolution skips
   * it), but it IS the legitimate source for an `extends`/`implements` base
   * (heritage resolution accepts it). Absent/false = a normal value import.
   */
  type_only?: boolean;
}
