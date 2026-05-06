import { execFileSync } from "node:child_process";
import { log } from "./util.js";

// Claude Code's plugin loader is a managed surface: it owns the cache layout,
// the plugin registry, hook wiring, command discovery, and version updates.
// Rather than reimplement that, this installer delegates to the `claude`
// CLI and lets Claude Code drive the install through its supported flow:
//   claude plugin marketplace add activeloopai/hivemind
//   claude plugin install hivemind
//   claude plugin enable hivemind@hivemind
//
// Side effect: requires `claude` on PATH at install time and network access
// to fetch the marketplace from GitHub. Both are reasonable assumptions for
// anyone running `npx @deeplake/hivemind claude install` — they already
// have Claude Code installed and the marketplace flow is the canonical way
// to ship plugins to Claude Code users.

const MARKETPLACE_NAME = "hivemind";
const MARKETPLACE_SOURCE = "activeloopai/hivemind";
const PLUGIN_KEY = "hivemind@hivemind";

interface ClaudeResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function runClaude(args: string[]): ClaudeResult {
  try {
    const stdout = execFileSync("claude", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    return {
      ok: false,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? e.message ?? "",
    };
  }
}

function requireClaudeCli(): void {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "Claude Code CLI ('claude') not found on PATH. " +
      "Install Claude Code first: https://claude.com/claude-code",
    );
  }
}

function marketplaceAlreadyAdded(): boolean {
  const r = runClaude(["plugin", "marketplace", "list"]);
  if (!r.ok) return false;
  return new RegExp(`(^|\\s)${MARKETPLACE_NAME}(\\s|$)`, "m").test(r.stdout);
}

function pluginAlreadyInstalled(): boolean {
  const r = runClaude(["plugin", "list"]);
  if (!r.ok) return false;
  return r.stdout.includes(PLUGIN_KEY);
}

// Claude Code's plugin model is multi-scope: a plugin can be enabled at
// any of `user` / `project` / `local` / `managed` scope, and each scope
// has its own activation. `claude plugin update` is per-scope, so an
// upgrade has to fan out across all four; the scopes the user hasn't
// activated will simply error out, which is fine.
const PLUGIN_SCOPES = ["user", "project", "local", "managed"] as const;

export function installClaude(): void {
  requireClaudeCli();

  if (!marketplaceAlreadyAdded()) {
    const add = runClaude(["plugin", "marketplace", "add", MARKETPLACE_SOURCE]);
    if (!add.ok) {
      throw new Error(
        `Failed to add marketplace '${MARKETPLACE_SOURCE}': ${add.stderr.slice(0, 200)}`,
      );
    }
  }

  if (!pluginAlreadyInstalled()) {
    // First-time install path: just install. The marketplace fetch is
    // implicit in `claude plugin install`.
    const inst = runClaude(["plugin", "install", "hivemind"]);
    if (!inst.ok) {
      throw new Error(
        `Failed to install hivemind plugin: ${inst.stderr.slice(0, 200)}`,
      );
    }
    log(`  Claude Code    installed via marketplace ${MARKETPLACE_SOURCE}`);
  } else {
    // Already-installed path: refresh the marketplace cache so
    // `plugin update` sees the newest version, then update across every
    // scope. Without the explicit `marketplace update` first, ClawHub
    // would serve a stale catalog and `plugin update` would no-op even
    // when a newer version is published. Mirrors the legacy
    // session-start logic in src/hooks/session-start.ts but routes it
    // through the centralized `hivemind update` command — this is what
    // makes `hivemind update` actually upgrade Claude (the install-only
    // path was idempotent and silently skipped the upgrade).
    runClaude(["plugin", "marketplace", "update", MARKETPLACE_NAME]);
    for (const scope of PLUGIN_SCOPES) {
      runClaude(["plugin", "update", PLUGIN_KEY, "--scope", scope]);
    }
    log(`  Claude Code    refreshed via marketplace ${MARKETPLACE_SOURCE}`);
  }

  // enable is idempotent in claude CLI — safe to run unconditionally
  runClaude(["plugin", "enable", PLUGIN_KEY]);
}

export function uninstallClaude(): void {
  try {
    requireClaudeCli();
  } catch {
    log("  Claude Code    skip uninstall — claude CLI not on PATH");
    return;
  }
  runClaude(["plugin", "disable", PLUGIN_KEY]);
  runClaude(["plugin", "uninstall", PLUGIN_KEY]);
  log("  Claude Code    plugin uninstalled");
}
