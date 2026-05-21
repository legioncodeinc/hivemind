#!/usr/bin/env node

/**
 * CLI surface for `hivemind dashboard`.
 *
 * Generates a self-contained HTML page combining KPI cards (org tokens
 * saved, skills created, memory recalls, sessions) and a force-directed
 * codebase-graph visualization, then opens it in the user's default
 * browser.
 *
 * Three flags, all optional:
 *   --cwd <path>   Different project root (defaults to process.cwd()).
 *   --out <path>   Custom output path (defaults to
 *                  ~/.hivemind/dashboards/<repo-key>/index.html).
 *                  Re-running with the same default path overwrites
 *                  the prior dashboard — that's the desired refresh
 *                  semantic; bookmarks stay valid.
 *   --no-open      Write but don't try to open the browser. Useful
 *                  for headless / CI scenarios and for users who
 *                  want to scp the HTML somewhere else.
 *
 * Exits with code 2 on argument errors, 1 on unexpected runtime
 * failure (currently only mkdir/write errors — data/render never
 * throw by contract), 0 otherwise.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { loadDashboardData } from "../dashboard/data.js";
import { openInBrowser } from "../dashboard/open.js";
import { renderDashboardHtml } from "../dashboard/render.js";
import { serveDashboardHtml, type ServeHandle } from "../dashboard/serve.js";

const USAGE = `hivemind dashboard — codebase graph + KPI dashboard (HTML)

Usage:
  hivemind dashboard [--cwd <path>] [--out <path>] [--no-open]
                     [--serve] [--port <n>]
      Build a self-contained HTML dashboard for this repo, write it
      to disk, and either open it in the default browser or serve
      it over loopback HTTP for headless / SSH workflows.

      --cwd <path>   Use a different project root (defaults to cwd).
      --out <path>   Write to a custom path (defaults to
                     ~/.hivemind/dashboards/<repo-key>/index.html).
      --no-open      Don't open the browser. Combine with --serve
                     to start the server without auto-launching.
      --serve        Start a loopback HTTP server (127.0.0.1) so the
                     dashboard is reachable at a URL. Stays alive
                     until Ctrl+C. Ideal for VS Code / Cursor
                     Remote-SSH (auto-forwards the port → click to
                     open in the integrated browser tab).
      --port <n>     Port for --serve (default 8123). Falls back to
                     a kernel-assigned port if <n> is in use.

  hivemind dashboard --help
      Show this message.

Data sources (all read-only):
  - Graph snapshot at ~/.hivemind/graphs/<repo-key>/   (produced by
    \`hivemind graph build\`; the dashboard works without it and shows
    an empty-state until the producer has run)
  - KPIs via the org stats endpoint (cached) with a local fallback
    to ~/.deeplake/usage-stats.jsonl
  - Skills created from ~/.claude/skills/<name>--<author>/ directories
`;

export interface DashboardArgs {
  cwd: string;
  /** Empty string means "use the default path under ~/.hivemind/dashboards/". */
  outPath: string;
  open: boolean;
  serve: boolean;
  /** undefined means "use the server's default port (8123)". */
  port: number | undefined;
}

export interface ParseResult {
  help?: boolean;
  args?: DashboardArgs;
  error?: string;
}

function parsePort(raw: string | undefined): number | { error: string } {
  if (raw === undefined || raw === "") return { error: "--port requires a value" };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    return { error: `--port must be an integer in [0, 65535], got '${raw}'` };
  }
  return n;
}

/** Pure arg parser — extracted so tests can verify flag handling
 *  without touching disk. */
export function parseDashboardArgs(args: string[]): ParseResult {
  let cwd: string | undefined;
  let outPath = "";
  let open = true;
  let serve = false;
  let port: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (a === "--no-open") { open = false; continue; }
    if (a === "--serve") { serve = true; continue; }
    if (a === "--cwd") {
      const v = args[++i];
      // Reject flag tokens used as a value — `--cwd --no-open` should
      // be a usage error, not "set cwd to the literal string '--no-open'
      // and silently do the wrong thing". Codex review on commit 4
      // surfaced this: `hivemind dashboard --out --no-open` was
      // happily writing a file named `./--no-open`.
      if (v === undefined || v.startsWith("-")) {
        return { error: "--cwd requires a value" };
      }
      cwd = v;
      continue;
    }
    if (a.startsWith("--cwd=")) { cwd = a.slice("--cwd=".length); continue; }
    if (a === "--out") {
      const v = args[++i];
      if (v === undefined || v.startsWith("-")) {
        return { error: "--out requires a value" };
      }
      outPath = v;
      continue;
    }
    if (a.startsWith("--out=")) { outPath = a.slice("--out=".length); continue; }
    if (a === "--port") {
      const v = args[++i];
      if (v === undefined || v.startsWith("-")) {
        return { error: "--port requires a value" };
      }
      const parsed = parsePort(v);
      if (typeof parsed === "object") return { error: parsed.error };
      port = parsed;
      continue;
    }
    if (a.startsWith("--port=")) {
      const parsed = parsePort(a.slice("--port=".length));
      if (typeof parsed === "object") return { error: parsed.error };
      port = parsed;
      continue;
    }
    return { error: `unknown arg '${a}'` };
  }

  return {
    args: {
      cwd: cwd ?? process.cwd(),
      outPath,
      open,
      serve,
      port,
    },
  };
}

/** Default path for the generated HTML. Lives outside the repo so it
 *  doesn't show up in `git status` and so two checkouts of the same
 *  repo share a dashboard. */
export function defaultDashboardOutPath(repoKey: string): string {
  return join(homedir(), ".hivemind", "dashboards", repoKey, "index.html");
}

export interface RunDashboardOptions {
  /** Test injection — defaults to the real openInBrowser. */
  opener?: typeof openInBrowser;
  /** Test injection — defaults to the real serveDashboardHtml. */
  server?: typeof serveDashboardHtml;
  /** Test injection — defaults to a real process.on('SIGINT', ...).
   *  Returns a cleanup fn the runner calls after the server stops. */
  onSignal?: (signal: NodeJS.Signals, handler: () => void) => () => void;
  /** Where stdout messages land. Defaults to process.stdout.write. */
  out?: (msg: string) => void;
  /** Where errors land. Defaults to process.stderr.write. */
  err?: (msg: string) => void;
}

export async function runDashboardCommand(
  rawArgs: string[],
  runOpts: RunDashboardOptions = {},
): Promise<number> {
  const out = runOpts.out ?? ((s: string) => { process.stdout.write(s); });
  const err = runOpts.err ?? ((s: string) => { process.stderr.write(s); });
  const opener = runOpts.opener ?? openInBrowser;

  const parsed = parseDashboardArgs(rawArgs);
  if (parsed.help) {
    out(USAGE);
    return 0;
  }
  if (parsed.error || !parsed.args) {
    err(`hivemind dashboard: ${parsed.error ?? "invalid arguments"}\n`);
    err(USAGE);
    return 2;
  }
  const { cwd, outPath, open } = parsed.args;

  let data;
  try {
    data = await loadDashboardData({ cwd });
  } catch (e: any) {
    // loadDashboardData has fail-soft fallbacks on every branch, but a
    // future regression that throws shouldn't dump a stack trace into
    // the user's terminal — surface it as a one-liner.
    err(`hivemind dashboard: failed to load data: ${e?.message ?? String(e)}\n`);
    return 1;
  }

  const html = renderDashboardHtml(data);
  const finalOut = outPath || defaultDashboardOutPath(data.repoKey);
  const absOut = resolve(finalOut);

  try {
    mkdirSync(dirname(absOut), { recursive: true });
    writeFileSync(absOut, html, "utf-8");
  } catch (e: any) {
    err(`hivemind dashboard: failed to write ${absOut}: ${e?.message ?? String(e)}\n`);
    return 1;
  }

  out(`Wrote ${absOut}\n`);
  if (data.graph == null) {
    out(`(no codebase graph yet — run 'hivemind graph build' to populate)\n`);
  }

  if (parsed.args.serve) {
    return await runServeLoop(html, parsed.args, runOpts, out, err);
  }

  if (open) {
    const result = opener(absOut);
    if (result.attempted) {
      out(`Opening via ${result.command}\n`);
    } else {
      out(`(no opener for this platform; open the file above manually)\n`);
    }
  }
  return 0;
}

async function runServeLoop(
  html: string,
  args: DashboardArgs,
  runOpts: RunDashboardOptions,
  out: (s: string) => void,
  err: (s: string) => void,
): Promise<number> {
  const server = runOpts.server ?? serveDashboardHtml;
  const opener = runOpts.opener ?? openInBrowser;
  const onSignal = runOpts.onSignal ?? defaultOnSignal;

  let handle: ServeHandle;
  try {
    handle = await server({ html, port: args.port });
  } catch (e: any) {
    err(`hivemind dashboard: failed to start server: ${e?.message ?? String(e)}\n`);
    return 1;
  }

  const url = `http://${handle.host}:${handle.port}/`;
  out(`Serving dashboard at ${url}  (Ctrl+C to stop)\n`);

  // Open the URL (not the file path) so the browser hits the live
  // server. On Cursor / VS Code Remote-SSH, the port-forwarder also
  // notices and offers the same URL via Simple Browser.
  if (args.open) {
    const result = opener(url);
    if (result.attempted) {
      out(`Opening via ${result.command}\n`);
    } else {
      out(`(no opener for this platform; click the URL above or open it manually)\n`);
    }
  }

  // SIGINT triggers a graceful close — keeps Ctrl+C from leaving a
  // listening socket behind. SIGTERM too for daemon-like contexts.
  let resolveDone!: (code: number) => void;
  const done = new Promise<number>(r => { resolveDone = r; });
  const shutdown = async () => {
    try { await handle.close(); } catch { /* already closed */ }
    resolveDone(0);
  };
  const offInt = onSignal("SIGINT", shutdown);
  const offTerm = onSignal("SIGTERM", shutdown);

  // Belt-and-suspenders: if the server stops for any other reason
  // (port closed externally, parent process kill), resolve cleanly too.
  handle.stopped.then(() => resolveDone(0));

  try {
    return await done;
  } finally {
    offInt();
    offTerm();
  }
}

function defaultOnSignal(signal: NodeJS.Signals, handler: () => void): () => void {
  process.on(signal, handler);
  return () => process.off(signal, handler);
}
