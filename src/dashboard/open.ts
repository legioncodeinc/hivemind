/**
 * Cross-platform "open this file in the default application" helper.
 *
 * Used by `hivemind dashboard` to launch the generated HTML in the
 * user's browser. Best-effort by design — when we can't open it (no
 * GUI, unknown OS, missing helper binary), the dashboard command
 * still wrote the file to disk and surfaced the path on stdout, so
 * the user can open it manually.
 *
 * The pure functions (`resolveOpenPlatform`, `openCommandFor`) are
 * exported so tests can assert the platform mapping without
 * monkey-patching child_process.
 */

import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { platform as nodePlatform } from "node:os";
import { delimiter, join } from "node:path";

export type OpenPlatform = "linux" | "darwin" | "win32";

/** Map node's platform string to the subset we know how to open on.
 *  Returns null for platforms (aix, freebsd, sunos, ...) where the
 *  helper conventions vary too much to guess. */
export function resolveOpenPlatform(): OpenPlatform | null {
  const p = nodePlatform();
  if (p === "linux" || p === "darwin" || p === "win32") return p;
  return null;
}

export interface OpenCommand {
  command: string;
  args: string[];
}

/** Per-platform invocation. Pure — easy to test the matrix without
 *  spawning anything. Windows uses `cmd /c start "" <path>`; the
 *  empty `""` is the window title argument that `start` requires
 *  when its first quoted arg is a path. Without it, `start "C:\..."`
 *  treats the path AS a window title and opens a new shell. */
export function openCommandFor(p: OpenPlatform, path: string): OpenCommand {
  switch (p) {
    case "linux":
      return { command: "xdg-open", args: [path] };
    case "darwin":
      return { command: "open", args: [path] };
    case "win32":
      return { command: "cmd", args: ["/c", "start", "", path] };
  }
}

export interface OpenResult {
  /** Did we try to spawn a helper? false on unknown OS. */
  attempted: boolean;
  /** Which helper we spawned, when attempted. */
  command?: string;
}

/**
 * Walk PATH (PATHEXT on Windows) to confirm a helper binary is
 * callable BEFORE spawning. `child_process.spawn` does NOT throw
 * synchronously when the binary is missing — it returns a child
 * process and emits the `error` event later, asynchronously. By
 * then the CLI has already printed "Opening via xdg-open" and
 * exited, so the user sees a lie. Codex review on commit 4 caught
 * this: `PATH=/usr/bin node bundle/cli.js dashboard` on a host
 * without xdg-open would still claim it opened the browser.
 *
 * Pure: no subprocess. POSIX semantics on linux/darwin (PATH split
 * on `:`, no extension), Windows semantics on win32 (PATH split on
 * `;`, PATHEXT-driven extension search, case-insensitive matters
 * less because the filesystem handles it).
 */
export function findBinaryOnPath(name: string): string | null {
  const PATH = process.env.PATH ?? "";
  if (!PATH) return null;
  const isWin = nodePlatform() === "win32";
  const exts = isWin
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").map(e => e.trim()).filter(Boolean)
    : [""];
  for (const dir of PATH.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      try {
        const st = statSync(candidate);
        if (st.isFile()) return candidate;
      } catch {
        // not there; keep looking
      }
    }
  }
  return null;
}

export interface OpenInBrowserOptions {
  /** Override platform detection. Tests only — production callers
   *  let `resolveOpenPlatform()` decide. */
  platformOverride?: OpenPlatform | null;
  /** Injected spawner. Tests substitute this to avoid touching the
   *  real child_process. Default: node:child_process spawn. */
  spawner?: typeof spawn;
  /** Predicate for "is this helper installed?". Tests stub it to
   *  emulate environments with/without xdg-open. Defaults to
   *  findBinaryOnPath. */
  binaryExists?: (cmd: string) => boolean;
}

/**
 * Spawn the platform's "open <path>" helper, detached so the parent
 * CLI exits immediately. Errors are swallowed:
 *   - spawn throws (ENOENT, etc.) → return attempted=false
 *   - spawn succeeds then child errors (helper missing) → ignored
 *     via the on('error') handler — we already returned.
 *
 * The detached + unref pattern lets the helper survive the parent
 * exit on POSIX. Windows doesn't need unref but it's harmless.
 */
export function openInBrowser(
  path: string,
  opts: OpenInBrowserOptions = {},
): OpenResult {
  const p = opts.platformOverride === undefined
    ? resolveOpenPlatform()
    : opts.platformOverride;
  if (!p) return { attempted: false };

  const { command, args } = openCommandFor(p, path);
  const exists = opts.binaryExists ?? ((cmd: string) => findBinaryOnPath(cmd) !== null);
  // Pre-check PATH because spawn() never throws synchronously for a
  // missing binary — it'd lie to the caller (and the user) about
  // having launched the helper.
  if (!exists(command)) return { attempted: false };

  const useSpawn = opts.spawner ?? spawn;
  try {
    const child = useSpawn(command, args, { stdio: "ignore", detached: true });
    // Defense-in-depth: even with PATH pre-check, the helper might
    // crash on launch (permissions, broken alias). Swallow that —
    // the CLI already printed the file path to stdout, so the user
    // can open it manually.
    child.on("error", () => { /* best-effort */ });
    if (typeof (child as { unref?: () => void }).unref === "function") {
      child.unref();
    }
    return { attempted: true, command };
  } catch {
    return { attempted: false };
  }
}
