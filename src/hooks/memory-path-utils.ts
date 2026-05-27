import { homedir } from "node:os";
import { join } from "node:path";

export const MEMORY_PATH = join(homedir(), ".deeplake", "memory");
export const TILDE_PATH = "~/.deeplake/memory";
export const HOME_VAR_PATH = "$HOME/.deeplake/memory";

export const SAFE_BUILTINS = new Set([
  "cat", "ls", "cp", "mv", "rm", "rmdir", "mkdir", "touch", "ln", "chmod",
  "stat", "readlink", "du", "tree", "file",
  // sed and awk removed: sed supports `-e '1e <cmd>'` (execute shell command)
  // and awk supports `system()` / `|` pipelines — both enable arbitrary code
  // execution through the just-bash fallback.
  "grep", "egrep", "fgrep", "rg", "cut", "tr", "sort", "uniq",
  "wc", "head", "tail", "tac", "rev", "nl", "fold", "expand", "unexpand",
  "paste", "join", "comm", "column", "diff", "strings", "split",
  "find", "xargs", "which",
  "jq", "yq", "xan", "base64", "od",
  // tar removed: --to-command=<cmd> executes an arbitrary program per entry.
  // env removed: `env <cmd>` runs an arbitrary program.
  "gzip", "gunzip", "zcat",
  "md5sum", "sha1sum", "sha256sum",
  "echo", "printf", "tee",
  "pwd", "cd", "basename", "dirname", "printenv", "hostname", "whoami",
  "date", "seq", "expr", "sleep", "timeout", "time", "true", "false", "test",
  "alias", "unalias", "history", "help", "clear",
  "for", "while", "do", "done", "if", "then", "else", "fi", "case", "esac",
]);

export function isSafe(cmd: string): boolean {
  // $'...' is ANSI-C quoting: bash expands escape sequences inside it before
  // the child process sees them, bypassing the single-quote stripping below.
  if (/\$\(|`|<\(|\$'/.test(cmd)) return false;
  const stripped = cmd.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
  const stages = stripped.split(/\||;|&&|\|\||\n/);
  for (const stage of stages) {
    const firstToken = stage.trim().split(/\s+/)[0] ?? "";
    if (firstToken && !SAFE_BUILTINS.has(firstToken)) return false;
  }
  return true;
}

export function touchesMemory(p: string): boolean {
  return p.includes(MEMORY_PATH) || p.includes(TILDE_PATH) || p.includes(HOME_VAR_PATH);
}

export function rewritePaths(cmd: string): string {
  return cmd
    .replace(new RegExp(MEMORY_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/?", "g"), "/")
    .replace(/~\/.deeplake\/memory\/?/g, "/")
    .replace(/\$HOME\/.deeplake\/memory\/?/g, "/")
    .replace(/"\$HOME\/.deeplake\/memory\/?"/g, '"/"');
}
