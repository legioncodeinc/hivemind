/**
 * Per-file extractor dispatch by extension (Phase 1.5).
 *
 * Routes each source file to the appropriate language extractor. All extractors
 * produce the same FileExtraction shape so the snapshot builder and cross-file
 * passes are language-agnostic downstream.
 *
 * Supported: TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, C, C++.
 */

import { extractTypeScript } from "./typescript.js";
import { extractJavaScript } from "./javascript.js";
import { extractPython } from "./python.js";
import { extractGo } from "./go.js";
import { extractRust } from "./rust.js";
import { extractJava } from "./java.js";
import { extractRuby } from "./ruby.js";
import { extractC } from "./c.js";
import { extractCpp } from "./cpp.js";
import type { FileExtraction } from "../types.js";

/** True for Python source extensions. */
export function isPythonPath(relativePath: string): boolean {
  return /\.pyi?$/.test(relativePath);
}

/** Extract one file, routing to the language-appropriate extractor. */
export function extractFile(sourceCode: string, relativePath: string): FileExtraction {
  const lower = relativePath.toLowerCase();
  if (isPythonPath(lower)) return extractPython(sourceCode, relativePath);
  if (/\.[cm]?jsx?$/.test(lower)) return extractJavaScript(sourceCode, relativePath);
  if (lower.endsWith(".go")) return extractGo(sourceCode, relativePath);
  if (lower.endsWith(".rs")) return extractRust(sourceCode, relativePath);
  if (lower.endsWith(".java")) return extractJava(sourceCode, relativePath);
  if (lower.endsWith(".rb")) return extractRuby(sourceCode, relativePath);
  if (/\.(cpp|cc|cxx|hpp)$/.test(lower)) return extractCpp(sourceCode, relativePath);
  if (/\.[ch]$/.test(lower)) return extractC(sourceCode, relativePath);
  // TypeScript (.ts/.tsx) and anything else that passed isSourceFile
  return extractTypeScript(sourceCode, relativePath);
}
