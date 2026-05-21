/**
 * Stop-hook auto-build for the codebase-graph feature (Phase 1.5).
 *
 * Registered in claude-code/hooks/hooks.json under "Stop" with async: true so
 * Claude Code doesn't wait for it. Fires after every session end, but does
 * almost no work in the common case:
 *
 *   1. Read ~/.hivemind/graphs/<key>/.last-build.json
 *   2. If now - lastBuild.ts < TICK_INTERVAL_MS → exit 0 (rate limit)
 *   3. Get HEAD via git rev-parse. If null → exit 0 (not in a git repo)
 *   4. If HEAD == lastBuild.commit_sha → exit 0 (no new commits)
 *   5. If `git diff --name-only <last-commit>..HEAD -- '*.ts' '*.tsx' | wc -l` < 1
 *      → exit 0 (threshold gate; only commit-touched source files trigger)
 *   6. Otherwise: run the build inline (cache makes warm rebuild ~85ms)
 *
 * Total cost on a "skip" path: ~5ms (one file read + one git call).
 * Total cost on a "build" path: ~85ms warm / ~2.5s cold (full rebuild).
 *
 * Important: this hook does NOT block Claude Code (async: true) and never
 * blocks the user. Errors are logged to .graph-on-stop.log and swallowed —
 * a buggy hook must never break the user's session.
 *
 * Process model: runs in-process (no detached spawn). With async: true,
 * Claude Code launches us and moves on; we run to completion in our own
 * lifetime and exit. No daemon, no PID file, no cross-platform issues.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { runBuildCommand } from "../commands/graph.js";
import { readLastBuild } from "../graph/last-build.js";
import { repoDir } from "../graph/snapshot.js";
import { isDirectRun } from "../utils/direct-run.js";
import { deriveProjectKey } from "../utils/repo-identity.js";

/**
 * How long between auto-rebuilds. The first Stop after this interval AND
 * after a commit-with-source-changes is the one that fires the build. All
 * others skip. Override via HIVEMIND_GRAPH_TICK_INTERVAL_MS for tests.
 */
function tickIntervalMs(): number {
  const raw = process.env.HIVEMIND_GRAPH_TICK_INTERVAL_MS;
  if (raw === undefined) return 10 * 60 * 1000; // 10 minutes
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 10 * 60 * 1000;
}

/**
 * Glob list applied to `git diff --name-only`. Matches the discoverSourceFiles
 * filter in src/commands/graph.ts — Phase 1 is TypeScript only.
 */
const SOURCE_GLOBS = ["*.ts", "*.tsx", ":(exclude)*.d.ts"];

/**
 * Run the gate logic, return whether a build should fire.
 *
 * Exported for unit testing — main() composes this with the side-effecting
 * runBuildCommand + logging.
 */
export interface GateContext {
  cwd: string;
  now: number;
  intervalMs: number;
  envDisable: boolean;
}

export interface GateDecision {
  fire: boolean;
  reason: string;
}

export function decideGate(ctx: GateContext): GateDecision {
  if (ctx.envDisable) return { fire: false, reason: "disabled (HIVEMIND_GRAPH_ON_STOP=0)" };

  const { key: repoKey } = deriveProjectKey(ctx.cwd);
  const baseDir = repoDir(repoKey);
  const last = readLastBuild(baseDir);

  if (last === null) {
    // Never built before: fire so the user gets an initial snapshot.
    // The build itself will populate .last-build.json so subsequent Stops
    // see a non-null entry.
    return { fire: true, reason: "first build (no prior .last-build.json)" };
  }

  if (ctx.now - last.ts < ctx.intervalMs) {
    return { fire: false, reason: `rate limit (${Math.round((ctx.now - last.ts) / 1000)}s < ${Math.round(ctx.intervalMs / 1000)}s)` };
  }

  const head = readGitCommit(ctx.cwd);
  if (head === null) {
    return { fire: false, reason: "not in a git repo" };
  }
  if (head === last.commit_sha) {
    return { fire: false, reason: "HEAD unchanged since last build" };
  }

  // Threshold gate: did any source file change between last-build commit and HEAD?
  const changedSourceCount = countSourceDiff(ctx.cwd, last.commit_sha, head);
  if (changedSourceCount < 1) {
    return { fire: false, reason: "no source files changed since last build" };
  }

  return { fire: true, reason: `${changedSourceCount} source file(s) changed since last build` };
}

/**
 * Returns the count of source files that changed between commit `from` and
 * commit `to`. Returns 0 on any git error (treat as "no change" for safety —
 * better to skip a build we should have done than to spin on a broken repo).
 *
 * Uses execFileSync with an argv array (not a shell command string) so the
 * globs are passed directly to git without shell quoting — critical on
 * Windows cmd.exe where single quotes are NOT quoting syntax and would
 * otherwise be treated as literal characters in the pathspec.
 */
function countSourceDiff(cwd: string, from: string | null, to: string): number {
  // If `from` is null, we can't diff; treat as "everything changed" so we
  // rebuild from scratch. This pairs with the "first build" branch above.
  if (from === null) return 1;
  try {
    const out = execFileSync(
      "git",
      ["diff", "--name-only", `${from}..${to}`, "--", ...SOURCE_GLOBS],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return out === "" ? 0 : out.split("\n").length;
  } catch {
    return 0;
  }
}

function readGitCommit(cwd: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Main entrypoint. Called from the bundled file. Reads minimal context from
 * the Claude Code stdin payload (cwd if provided, else process.cwd()).
 * Catches all errors and logs to .graph-on-stop.log so a hook bug never
 * crashes the user's session.
 */
export function main(): void {
  // Disable switch for users / CI:
  //   HIVEMIND_GRAPH_ON_STOP=0   → no-op
  const envDisable = process.env.HIVEMIND_GRAPH_ON_STOP === "0";
  // Claude Code passes a JSON payload on stdin; we don't need anything from
  // it for Phase 1 (cwd is process.cwd()), so we skip the read entirely.
  const ctx: GateContext = {
    cwd: process.cwd(),
    now: Date.now(),
    intervalMs: tickIntervalMs(),
    envDisable,
  };

  let decision: GateDecision;
  try {
    decision = decideGate(ctx);
  } catch (err) {
    logToFile(ctx.cwd, `decideGate threw: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  logToFile(ctx.cwd, `gate: ${decision.fire ? "FIRE" : "SKIP"} (${decision.reason})`);
  if (!decision.fire) return;

  try {
    runBuildCommand(["--trigger", "stop-hook"]);
  } catch (err) {
    logToFile(ctx.cwd, `build threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function logToFile(cwd: string, line: string): void {
  try {
    const { key } = deriveProjectKey(cwd);
    const dir = repoDir(key);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, ".graph-on-stop.log"), `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // best-effort
  }
}

// Only invoke main() when this file is the process entry point (i.e., the
// Claude Code hook command launched us). Imports from tests must NOT trigger
// the side-effecting build pipeline.
if (isDirectRun(import.meta.url)) {
  main();
}
