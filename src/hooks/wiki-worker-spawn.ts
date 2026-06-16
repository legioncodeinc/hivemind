import type { ExecFileSyncOptions } from "node:child_process";
import { binNeedsShell } from "../utils/resolve-cli-bin.js";

/** Fixed flags for the summary-generation `claude -p` call (no user input).
 *
 * `--allowedTools Write` constrains the headless agent to file writes only,
 * preventing a prompt-injection payload embedded in captured session content
 * from invoking Bash, Read, or any other tool. The summarizer only needs to
 * write the summary file, so Write is the minimal necessary permission.
 * bypassPermissions is still required for headless operation (no TTY to
 * present approval prompts). A follow-up (pr/06) will pivot to stdout so
 * bypassPermissions can be removed entirely.
 */
const CLAUDE_FLAGS = [
  "--no-session-persistence",
  "--model",
  "haiku",
  "--permission-mode",
  "bypassPermissions",
  "--allowedTools",
  "Write",
] as const;

export interface ClaudeInvocation {
  file: string;
  args: string[];
  options: ExecFileSyncOptions;
}

/**
 * Build the `execFileSync` descriptor for the summary-generation claude call.
 *
 * Windows (`.cmd`/`.bat` shim): the shim cannot be spawned without a shell,
 * and the multi-KB prompt must NOT ride the command line — cmd.exe would
 * expand `%VAR%`/metacharacters in it and it can blow the ~8 KB arg limit. So
 * the prompt goes over stdin (`input`) and only the fixed flags — never user
 * text — are passed as args under the shell, which keeps the shell call free
 * of injection.
 *
 * Everywhere else (Unix, or a Windows `.exe`): unchanged from the original —
 * prompt as a positional arg, no shell — so the already-working path stays
 * byte-identical.
 */
export function buildClaudeInvocation(claudeBin: string, prompt: string): ClaudeInvocation {
  if (binNeedsShell(claudeBin)) {
    return {
      file: claudeBin,
      args: ["-p", ...CLAUDE_FLAGS],
      options: { input: prompt, stdio: ["pipe", "pipe", "pipe"], shell: true },
    };
  }
  return {
    file: claudeBin,
    args: ["-p", prompt, ...CLAUDE_FLAGS],
    options: { stdio: ["ignore", "pipe", "pipe"] },
  };
}

/**
 * Build an `execFileSync` descriptor for an agent CLI that takes its prompt as
 * the LAST positional arg (codex `exec … <prompt>`, cursor `--print … <prompt>`,
 * pi `--print … <prompt>`). `flags` are everything BEFORE the prompt.
 *
 * Same Windows `.cmd` handling as {@link buildClaudeInvocation}: route the
 * prompt over stdin under a shell so it never hits the command line. Unix (and
 * Windows `.exe`) keep the prompt as the trailing arg — unchanged behavior.
 *
 * Regression-proof by construction: the non-shell branch is byte-identical to
 * the original call, and the shell branch only ever replaces a path that is
 * already unrunnable (a `.cmd` under the old no-shell `execFileSync`).
 */
export function buildTrailingPromptInvocation(bin: string, flags: string[], prompt: string): ClaudeInvocation {
  if (binNeedsShell(bin)) {
    return {
      file: bin,
      args: [...flags],
      options: { input: prompt, stdio: ["pipe", "pipe", "pipe"], shell: true },
    };
  }
  return {
    file: bin,
    args: [...flags, prompt],
    options: { stdio: ["ignore", "pipe", "pipe"] },
  };
}
