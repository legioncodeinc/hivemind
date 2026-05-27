#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readStdin } from "../utils/stdin.js";
import { loadConfig } from "../config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { sqlLike } from "../utils/sql.js";
import { log as _log } from "../utils/debug.js";
import { isDirectRun } from "../utils/direct-run.js";
import { type GrepParams, parseBashGrep, handleGrepDirect } from "./grep-direct.js";
import { handleGraphVfs } from "../graph/vfs-handler.js";
import { executeCompiledBashCommand } from "./bash-command-compiler.js";
import {
  findVirtualPaths,
  readVirtualPathContents,
  listVirtualPathRows,
  readVirtualPathContent,
} from "./virtual-table-query.js";
import {
  readCachedIndexContent,
  writeCachedIndexContent,
} from "./query-cache.js";
import { isSafe, touchesMemory, rewritePaths } from "./memory-path-utils.js";
import { capOutputForClaude } from "../utils/output-cap.js";

export { isSafe, touchesMemory, rewritePaths };

const log = (msg: string) => _log("pre", msg);

const __bundleDir = dirname(fileURLToPath(import.meta.url));

export interface PreToolUseInput {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

export interface ClaudePreToolDecision {
  command: string;
  description: string;
  /**
   * When set, main() emits the hook response as `updatedInput: {file_path}`
   * instead of `updatedInput: {command, description}`. This is required for
   * Read-tool intercepts: Claude Code's Read implementation reads
   * `updatedInput.file_path` and errors with "path must be of type string,
   * got undefined" if the hook hands it the Bash-shaped input.
   */
  file_path?: string;
  /**
   * When set, main() emits a `permissionDecision: "deny"` response carrying
   * this reason. Used for tools the VFS cannot route (Write / Edit) so the
   * agent sees a clear "use Bash instead" message rather than a cryptic
   * "Path must be a string, received undefined" from a shape mismatch.
   */
  deny?: string;
}

const READ_CACHE_ROOT = join(homedir(), ".deeplake", "query-cache");

/**
 * Materialize fetched content for a Read intercept into a real file on disk
 * so Claude Code's Read tool can read it via `updatedInput.file_path`. The
 * file lives under `~/.deeplake/query-cache/<session_id>/read/` and mirrors
 * the virtual path structure (e.g. `/sessions/conv_0_session_1.json` →
 * `.../read/sessions/conv_0_session_1.json`). Per-session dirs are cleaned
 * alongside the index cache at session end.
 */
export function writeReadCacheFile(
  sessionId: string,
  virtualPath: string,
  content: string,
  deps: { cacheRoot?: string } = {},
): string {
  const { cacheRoot = READ_CACHE_ROOT } = deps;
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
  const rel = virtualPath.replace(/^\/+/, "") || "content";
  const expectedRoot = join(cacheRoot, safeSessionId, "read");
  const absPath = join(expectedRoot, rel);
  // Containment guard: if the DB-derived virtualPath contains `..` segments,
  // `join` resolves them and absPath can escape the per-session cache dir.
  // Refuse the write rather than silently writing outside the sandbox.
  if (absPath !== expectedRoot && !absPath.startsWith(expectedRoot + sep)) {
    throw new Error(`writeReadCacheFile: path escapes cache root: ${absPath}`);
  }
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, "utf-8");
  return absPath;
}

export function buildReadDecision(file_path: string, description: string): ClaudePreToolDecision {
  return { command: "", description, file_path };
}

export function buildDenyDecision(reason: string, description: string): ClaudePreToolDecision {
  return { command: "", description, deny: reason };
}

const WRITE_EDIT_DENY_REASON =
  "Write and Edit tools cannot route through the Deeplake VFS at ~/.deeplake/memory/. " +
  "The pre-tool-use hook only intercepts Bash, Read, Grep, and Glob; tool-shape mismatches make a " +
  "Write/Edit rewrite unsafe. Use the Bash tool instead:\n" +
  "  - Single-line:  echo '<content>' > '<path>'\n" +
  "  - Multi-line:   cat > '<path>' <<'EOF'\\n<content>\\nEOF\n" +
  "Bash IS intercepted and writes through to the team-shared SQL backend.";

function getReadTargetPath(toolInput: Record<string, unknown>): string | null {
  const rawPath = (toolInput.file_path ?? toolInput.path) as string | undefined;
  return rawPath ? rawPath : null;
}

function isLikelyDirectoryPath(virtualPath: string): boolean {
  const normalized = virtualPath.replace(/\/+$/, "") || "/";
  if (normalized === "/") return true;
  const base = normalized.split("/").pop() ?? "";
  return !base.includes(".");
}

export function getShellCommand(toolName: string, toolInput: Record<string, unknown>): string | null {
  switch (toolName) {
    case "Grep": {
      const p = toolInput.path as string | undefined;
      if (p && touchesMemory(p)) {
        const pattern = toolInput.pattern as string ?? "";
        const flags: string[] = ["-r"];
        if (toolInput["-i"]) flags.push("-i");
        if (toolInput["-n"]) flags.push("-n");
        // Single-quote the pattern safely: escape any embedded single quotes
        // so the string can never break out of the shell quoting context if
        // this command string is ever forwarded to a shell executor.
        const escaped = pattern.replace(/'/g, "'\\''");
        return `grep ${flags.join(" ")} '${escaped}' /`;
      }
      break;
    }
    case "Read": {
      const fp = getReadTargetPath(toolInput);
      if (fp && touchesMemory(fp)) {
        const rewritten = rewritePaths(fp) || "/";
        return `${isLikelyDirectoryPath(rewritten) ? "ls" : "cat"} ${rewritten}`;
      }
      break;
    }
    case "Bash": {
      const cmd = toolInput.command as string | undefined;
      if (!cmd || !touchesMemory(cmd)) break;
      const rewritten = rewritePaths(cmd);
      if (!isSafe(rewritten)) {
        log(`unsafe command blocked: ${rewritten}`);
        return null;
      }
      return rewritten;
    }
    case "Glob": {
      const p = toolInput.path as string | undefined;
      if (p && touchesMemory(p)) return "ls /";
      break;
    }
  }
  return null;
}

export function buildAllowDecision(command: string, description: string): ClaudePreToolDecision {
  return { command, description };
}

export function extractGrepParams(
  toolName: string,
  toolInput: Record<string, unknown>,
  shellCmd: string,
): GrepParams | null {
  if (toolName === "Grep") {
    const outputMode = (toolInput.output_mode as string) ?? "files_with_matches";
    return {
      pattern: (toolInput.pattern as string) ?? "",
      targetPath: rewritePaths((toolInput.path as string) ?? "") || "/",
      ignoreCase: !!toolInput["-i"],
      wordMatch: false,
      filesOnly: outputMode === "files_with_matches",
      countOnly: outputMode === "count",
      lineNumber: !!toolInput["-n"],
      invertMatch: false,
      fixedString: false,
    };
  }
  if (toolName === "Bash") return parseBashGrep(shellCmd);
  return null;
}

interface ClaudePreToolDeps {
  config?: ReturnType<typeof loadConfig>;
  createApi?: (table: string, config: NonNullable<ReturnType<typeof loadConfig>>) => DeeplakeApi;
  executeCompiledBashCommandFn?: typeof executeCompiledBashCommand;
  handleGrepDirectFn?: typeof handleGrepDirect;
  handleGraphVfsFn?: typeof handleGraphVfs;
  readVirtualPathContentsFn?: typeof readVirtualPathContents;
  readVirtualPathContentFn?: typeof readVirtualPathContent;
  listVirtualPathRowsFn?: typeof listVirtualPathRows;
  findVirtualPathsFn?: typeof findVirtualPaths;
  readCachedIndexContentFn?: typeof readCachedIndexContent;
  writeCachedIndexContentFn?: typeof writeCachedIndexContent;
  writeReadCacheFileFn?: typeof writeReadCacheFile;
  logFn?: (msg: string) => void;
}

export async function processPreToolUse(input: PreToolUseInput, deps: ClaudePreToolDeps = {}): Promise<ClaudePreToolDecision | null> {
  const {
    config = loadConfig(),
    createApi = (table, activeConfig) => new DeeplakeApi(
      activeConfig.token,
      activeConfig.apiUrl,
      activeConfig.orgId,
      activeConfig.workspaceId,
      table,
    ),
    executeCompiledBashCommandFn = executeCompiledBashCommand,
    handleGrepDirectFn = handleGrepDirect,
    handleGraphVfsFn = handleGraphVfs,
    readVirtualPathContentsFn = readVirtualPathContents,
    readVirtualPathContentFn = readVirtualPathContent,
    listVirtualPathRowsFn = listVirtualPathRows,
    findVirtualPathsFn = findVirtualPaths,
    readCachedIndexContentFn = readCachedIndexContent,
    writeCachedIndexContentFn = writeCachedIndexContent,
    writeReadCacheFileFn = writeReadCacheFile,
    logFn = log,
  } = deps;

  const cmd = (input.tool_input.command as string) ?? "";
  const shellCmd = getShellCommand(input.tool_name, input.tool_input);
  const toolPath = (getReadTargetPath(input.tool_input) ?? input.tool_input.path ?? "") as string;

  // Write / Edit on memory paths cannot be safely rewritten: the hook can only
  // mutate tool_input, not the tool itself, so emitting a Bash-shaped decision
  // (command/description) leaves the Write tool with file_path=undefined → the
  // harness errors out with "Path must be a string, received undefined". Deny
  // with a clear message pointing at Bash instead — Bash IS intercepted and
  // routes through the SQL backend.
  if ((input.tool_name === "Write" || input.tool_name === "Edit") && touchesMemory(toolPath)) {
    logFn(`deny Write/Edit on memory path: ${toolPath}`);
    return buildDenyDecision(WRITE_EDIT_DENY_REASON, `[DeepLake] ${input.tool_name} denied on memory path`);
  }

  if (!shellCmd && (touchesMemory(cmd) || touchesMemory(toolPath))) {
    const guidance = "[RETRY REQUIRED] The command you tried is not available for ~/.deeplake/memory/. " +
      "This virtual filesystem only supports bash builtins: cat, ls, grep, echo, jq, head, tail, sed, awk, wc, sort, find, etc. " +
      "python, python3, node, and curl are NOT available. " +
      "You MUST rewrite your command using only the bash tools listed above and try again. " +
      "For example, to parse JSON use: cat file.json | jq '.key'. To count keys: cat file.json | jq 'keys | length'.";

    // Fast-path: a clean single-file read attempt by an unsupported interpreter
    // (python/node/ruby/perl, no shell metacharacters) gets rewritten to
    // `cat '<path>'` so the agent doesn't burn a turn on a RETRY. Anything with
    // $(...), backticks, pipes, redirects, or chains falls through to the
    // guidance below — safer than trying to rewrite composite commands.
    const isReadLike = /^(?:python3?|node|deno|bun|ruby|perl)\b/.test(cmd.trim());
    const hasShellMeta = /[$`;|&<>()\\]/.test(cmd);
    if (isReadLike && !hasShellMeta) {
      // Normalize path prefix (~/, $HOME/, or absolute /home/user/) to / via
      // rewritePaths, then extract the leading memory-relative path.
      // This catches all three forms that touchesMemory() accepts.
      const normalized = rewritePaths(cmd) + " " + rewritePaths(toolPath);
      const pathMatch = normalized.match(/\s(\/[\w./_-]+)/);
      const cleanPath = pathMatch ? pathMatch[1] : "";
      if (cleanPath && !cleanPath.endsWith("/")) {
        logFn(`unsupported command on file, converting to cat: ${cleanPath}`);
        return buildAllowDecision(
          `cat '${cleanPath.replace(/'/g, "'\\''")}'`,
          "[DeepLake] converted unsupported interpreter read to cat",
        );
      }
    }

    logFn(`unsupported command, returning guidance: ${cmd}`);
    return buildAllowDecision(
      `echo ${JSON.stringify(guidance)}`,
      "[DeepLake] unsupported command — rewrite using bash builtins",
    );
  }

  if (!shellCmd) return null;
  if (!config) return null;

  const table = process.env["HIVEMIND_TABLE"] ?? "memory";
  const sessionsTable = process.env["HIVEMIND_SESSIONS_TABLE"] ?? "sessions";
  const api = createApi(table, config);

  const readVirtualPathContentsWithCache = async (
    cachePaths: string[],
  ): Promise<Map<string, string | null>> => {
    const uniquePaths = [...new Set(cachePaths)];
    const result = new Map<string, string | null>(uniquePaths.map((path) => [path, null]));
    const cachedIndex = uniquePaths.includes("/index.md")
      ? readCachedIndexContentFn(input.session_id)
      : null;

    const remainingPaths = cachedIndex === null
      ? uniquePaths
      : uniquePaths.filter((path) => path !== "/index.md");

    if (cachedIndex !== null) {
      result.set("/index.md", cachedIndex);
    }

    if (remainingPaths.length > 0) {
      const fetched = await readVirtualPathContentsFn(api, table, sessionsTable, remainingPaths);
      for (const [path, content] of fetched) result.set(path, content);
    }

    const fetchedIndex = result.get("/index.md");
    if (typeof fetchedIndex === "string") {
      writeCachedIndexContentFn(input.session_id, fetchedIndex);
    }

    return result;
  };

  try {
    if (input.tool_name === "Bash") {
      const compiled = await executeCompiledBashCommandFn(api, table, sessionsTable, shellCmd, {
        readVirtualPathContentsFn: async (_api, _memoryTable, _sessionsTable, cachePaths) => readVirtualPathContentsWithCache(cachePaths),
      });
      if (compiled !== null) {
        return buildAllowDecision(`echo ${JSON.stringify(compiled)}`, `[DeepLake compiled] ${shellCmd}`);
      }
    }

    const grepParams = extractGrepParams(input.tool_name, input.tool_input, shellCmd);
    if (grepParams) {
      logFn(`direct grep: pattern=${grepParams.pattern} path=${grepParams.targetPath}`);
      const result = await handleGrepDirectFn(api, table, sessionsTable, grepParams);
      if (result !== null) return buildAllowDecision(`echo ${JSON.stringify(result)}`, `[DeepLake direct] grep ${grepParams.pattern}`);
    }

    let virtualPath: string | null = null;
    let lineLimit = 0;
    let fromEnd = false;
    let lsDir: string | null = null;
    let longFormat = false;

    if (input.tool_name === "Read") {
      virtualPath = rewritePaths(getReadTargetPath(input.tool_input) ?? "");
      if (virtualPath && isLikelyDirectoryPath(virtualPath)) {
        lsDir = virtualPath.replace(/\/+$/, "") || "/";
        virtualPath = null;
      }
    } else if (input.tool_name === "Bash") {
      const catCmd = shellCmd.replace(/\s+2>\S+/g, "").trim();
      const catPipeHead = catCmd.match(/^cat\s+(\S+?)\s*(?:\|[^|]*)*\|\s*head\s+(?:-n?\s*)?(-?\d+)\s*$/);
      if (catPipeHead) { virtualPath = catPipeHead[1]; lineLimit = Math.abs(parseInt(catPipeHead[2], 10)); }
      if (!virtualPath) {
        const catMatch = catCmd.match(/^cat\s+(\S+)\s*$/);
        if (catMatch) virtualPath = catMatch[1];
      }
      if (!virtualPath) {
        const headMatch = shellCmd.match(/^head\s+(?:-n\s*)?(-?\d+)\s+(\S+)\s*$/) ??
                          shellCmd.match(/^head\s+(\S+)\s*$/);
        if (headMatch) {
          if (headMatch[2]) { virtualPath = headMatch[2]; lineLimit = Math.abs(parseInt(headMatch[1], 10)); }
          else { virtualPath = headMatch[1]; lineLimit = 10; }
        }
      }
      if (!virtualPath) {
        const tailMatch = shellCmd.match(/^tail\s+(?:-n\s*)?(-?\d+)\s+(\S+)\s*$/) ??
                          shellCmd.match(/^tail\s+(\S+)\s*$/);
        if (tailMatch) {
          fromEnd = true;
          if (tailMatch[2]) { virtualPath = tailMatch[2]; lineLimit = Math.abs(parseInt(tailMatch[1], 10)); }
          else { virtualPath = tailMatch[1]; lineLimit = 10; }
        }
      }
      if (!virtualPath) {
        const wcMatch = shellCmd.match(/^wc\s+-l\s+(\S+)\s*$/);
        if (wcMatch) { virtualPath = wcMatch[1]; lineLimit = -1; }
      }
    }

    // Graph VFS dispatch — synthesized text responses for the
    // <memory>/graph/... subtree. Lives under the memory mount as a
    // SUBDIR (not a separate mount) so the existing touchesMemory()
    // intercept already brought us here. We just route /graph/* away
    // from the SQL-backed memory dispatch below to the local snapshot.
    //
    // Trimmed surface per codex review: index.md / find/<pattern> /
    // show/<handle-or-pattern>. Hits return synthesized text via
    // `echo <body>` exactly like the BM25 grep path does. From the
    // agent's perspective it's just `cat` on a file.
    if (virtualPath && virtualPath.startsWith("/graph/") && !virtualPath.endsWith("/")) {
      const subpath = virtualPath.slice("/graph/".length);
      logFn(`graph vfs: ${subpath}`);
      const result = handleGraphVfsFn(subpath, process.cwd());
      const body = result.kind === "ok"
        ? result.body
        : `(${result.kind}) ${result.message}`;
      // CodeRabbit P1: Read tool requires a file_path-shaped decision
      // (the harness reads the cached file directly). Bash gets the
      // command-shaped decision (echo) like the rest of the intercepts.
      if (input.tool_name === "Read") {
        const file_path = writeReadCacheFileFn(input.session_id, virtualPath, body);
        return buildReadDecision(file_path, `[hivemind graph] ${virtualPath}`);
      }
      return buildAllowDecision(`echo ${JSON.stringify(body)}`, `[hivemind graph] /graph/${subpath}`);
    }
    if (lsDir === "/graph" || lsDir === "/graph/") {
      const body = "index.md\nfind/\nshow/\n";
      if (input.tool_name === "Read") {
        const file_path = writeReadCacheFileFn(input.session_id, "/graph", body);
        return buildReadDecision(file_path, "[hivemind graph] ls /graph");
      }
      return buildAllowDecision(`echo ${JSON.stringify(body)}`, `[hivemind graph] ls /graph`);
    }

    if (virtualPath && !virtualPath.endsWith("/")) {
      logFn(`direct read: ${virtualPath}`);
      let content = virtualPath === "/index.md"
        ? readCachedIndexContentFn(input.session_id)
        : null;

      if (content === null) {
        // `/index.md` goes through the dual-table builder inside
        // `readVirtualPathContents` (fix #1). Other paths fall back to the
        // same helper which returns null when neither table has a row, at
        // which point we let the shell bundle handle the miss below.
        content = await readVirtualPathContentFn(api, table, sessionsTable, virtualPath);
      }
      if (content !== null) {
        if (virtualPath === "/index.md") {
          writeCachedIndexContentFn(input.session_id, content);
        }
        if (lineLimit === -1) return buildAllowDecision(`echo ${JSON.stringify(`${content.split("\n").length} ${virtualPath}`)}`, `[DeepLake direct] wc -l ${virtualPath}`);
        if (lineLimit > 0) {
          const lines = content.split("\n");
          content = fromEnd ? lines.slice(-lineLimit).join("\n") : lines.slice(0, lineLimit).join("\n");
        }
        const label = lineLimit > 0 ? (fromEnd ? `tail -${lineLimit}` : `head -${lineLimit}`) : "cat";
        // Read tool writes content to disk and Claude Code reads the file directly,
        // so no size pressure; keep full content. Bash intercepts flow through
        // Claude Code's 16 KB tool_result threshold so we cap before reaching it.
        if (input.tool_name === "Read") {
          const file_path = writeReadCacheFileFn(input.session_id, virtualPath, content);
          return buildReadDecision(file_path, `[DeepLake direct] ${label} ${virtualPath}`);
        }
        const capped = capOutputForClaude(content, { kind: label });
        return buildAllowDecision(`echo ${JSON.stringify(capped)}`, `[DeepLake direct] ${label} ${virtualPath}`);
      }
    }

    if (!lsDir && input.tool_name === "Glob") {
      lsDir = rewritePaths((input.tool_input.path as string) ?? "") || "/";
    } else if (input.tool_name === "Bash") {
      const lsMatch = shellCmd.match(/^ls\s+(?:-([a-zA-Z]+)\s+)?(\S+)?\s*$/);
      if (lsMatch) {
        lsDir = lsMatch[2] ?? "/";
        longFormat = (lsMatch[1] ?? "").includes("l");
      }
    }

    if (lsDir) {
      const dir = lsDir.replace(/\/+$/, "") || "/";
      logFn(`direct ls: ${dir}`);
      const rows = await listVirtualPathRowsFn(api, table, sessionsTable, dir);
      const entries = new Map<string, { isDir: boolean; size: number }>();
      const prefix = dir === "/" ? "/" : dir + "/";
      for (const row of rows) {
        const p = row["path"] as string;
        if (!p.startsWith(prefix) && dir !== "/") continue;
        const rest = dir === "/" ? p.slice(1) : p.slice(prefix.length);
        const slash = rest.indexOf("/");
        const name = slash === -1 ? rest : rest.slice(0, slash);
        if (!name) continue;
        const existing = entries.get(name);
        if (slash !== -1) {
          if (!existing) entries.set(name, { isDir: true, size: 0 });
        } else {
          entries.set(name, { isDir: false, size: (row["size_bytes"] as number) ?? 0 });
        }
      }
      const lines: string[] = [];
      for (const [name, info] of [...entries].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (longFormat) {
          const type = info.isDir ? "drwxr-xr-x" : "-rw-r--r--";
          const size = String(info.isDir ? 0 : info.size).padStart(6);
          lines.push(`${type} 1 user user ${size} ${name}${info.isDir ? "/" : ""}`);
        } else {
          lines.push(name + (info.isDir ? "/" : ""));
        }
      }
      const lsOutput = capOutputForClaude(lines.join("\n") || "(empty directory)", { kind: "ls" });
      return buildAllowDecision(`echo ${JSON.stringify(lsOutput)}`, `[DeepLake direct] ls ${dir}`);
    }

    if (input.tool_name === "Bash") {
      const findMatch = shellCmd.match(/^find\s+(\S+)\s+(?:-type\s+\S+\s+)?-name\s+'([^']+)'/);
      if (findMatch) {
        const dir = findMatch[1].replace(/\/+$/, "") || "/";
        const namePattern = sqlLike(findMatch[2]).replace(/\*/g, "%").replace(/\?/g, "_");
        logFn(`direct find: ${dir} -name '${findMatch[2]}'`);
        const paths = await findVirtualPathsFn(api, table, sessionsTable, dir, namePattern);
        let result = paths.join("\n") || "";
        if (/\|\s*wc\s+-l\s*$/.test(shellCmd)) result = String(paths.length);
        const capped = capOutputForClaude(result || "(no matches)", { kind: "find" });
        return buildAllowDecision(`echo ${JSON.stringify(capped)}`, `[DeepLake direct] find ${dir}`);
      }
    }
  } catch (e: any) {
    logFn(`direct query failed: ${e.message}`);
  }

  // No compiled handler matched (or a direct query failed). Do NOT fall
  // through to the shell executor: the shell bundle runs commands via
  // just-bash which may invoke real host binaries, creating a code-execution
  // surface for injected patterns in unhandled commands (e.g. `sort`, `cut`).
  // Return null so the original tool runs unmodified; it will fail harmlessly
  // because the virtual paths do not exist on the real filesystem.
  return null;
}

/* c8 ignore start */
async function main(): Promise<void> {
  const input = await readStdin<PreToolUseInput>();
  const decision = await processPreToolUse(input);
  if (!decision) return;
  if (decision.deny !== undefined) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: decision.deny,
      },
    }));
    return;
  }
  const updatedInput: Record<string, unknown> = decision.file_path !== undefined
    ? { file_path: decision.file_path }
    : { command: decision.command, description: decision.description };
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput,
    },
  }));
}

if (isDirectRun(import.meta.url)) {
  main().catch((e) => { log(`fatal: ${e.message}`); process.exit(0); });
}
/* c8 ignore stop */
