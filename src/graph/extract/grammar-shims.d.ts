// Type shims for tree-sitter grammar packages that ship no TypeScript declarations.
// Each grammar module's default export is a tree-sitter Language object accepted
// by Parser.setLanguage(). We type it as `object` here; the runtime cast in
// getParser() (shared.ts) handles the opaque setLanguage call correctly.

declare module "tree-sitter-javascript" {
  const grammar: object;
  export default grammar;
}

declare module "tree-sitter-python" {
  const grammar: object;
  export default grammar;
}

declare module "tree-sitter-go" {
  const grammar: object;
  export default grammar;
}

declare module "tree-sitter-rust" {
  const grammar: object;
  export default grammar;
}

declare module "tree-sitter-java" {
  const grammar: object;
  export default grammar;
}

declare module "tree-sitter-ruby" {
  const grammar: object;
  export default grammar;
}

declare module "tree-sitter-c" {
  const grammar: object;
  export default grammar;
}

declare module "tree-sitter-cpp" {
  const grammar: object;
  export default grammar;
}
