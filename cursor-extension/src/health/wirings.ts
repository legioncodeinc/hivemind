import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildHookConfig, isHivemindEntry } from "./checker";
import {
  cursorBundleDir,
  cursorHooksPath,
  cursorPluginDir,
  hivemindCursorBundleSrc,
} from "../utils/paths";
import { readJson, writeJsonIfChanged } from "../utils/fs-json";

const HIVEMIND_MARKER_KEY = "_hivemindManaged";

export interface WireResult {
  ok: boolean;
  changed: boolean;
  message: string;
  reloadRequired: boolean;
}

function readExtensionVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function mergeHooks(existing: Record<string, unknown> | null, pluginDir: string, version: string): Record<string, unknown> {
  const root = (existing ?? { version: 1, hooks: {} }) as {
    version?: number;
    hooks?: Record<string, unknown[]>;
  };
  if (!root.version) root.version = 1;
  if (!root.hooks) root.hooks = {};
  const ours = buildHookConfig(pluginDir, version);
  for (const [event, entries] of Object.entries(ours)) {
    const prior = Array.isArray(root.hooks[event]) ? root.hooks[event] : [];
    const stripped = prior.filter((e) => !isHivemindEntry(e));
    root.hooks[event] = [...stripped, ...entries];
  }
  (root as Record<string, unknown>)[HIVEMIND_MARKER_KEY] = { version };
  return root as unknown as Record<string, unknown>;
}

export function stripHooksFromConfig(existing: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!existing) return null;
  const root = existing as { hooks?: Record<string, unknown[]> };
  if (root.hooks) {
    for (const event of Object.keys(root.hooks)) {
      root.hooks[event] = (root.hooks[event] ?? []).filter((e) => !isHivemindEntry(e));
      if (root.hooks[event].length === 0) delete root.hooks[event];
    }
    if (Object.keys(root.hooks).length === 0) delete root.hooks;
  }
  delete (existing as Record<string, unknown>)[HIVEMIND_MARKER_KEY];
  return existing;
}

function provisionBundle(): { ok: boolean; message: string } {
  const src = hivemindCursorBundleSrc();
  if (!existsSync(join(src, "capture.js"))) {
    return {
      ok: false,
      message: `Cursor bundle missing at ${src}. Run 'npm run build' in the hivemind repo first.`,
    };
  }
  mkdirSync(cursorPluginDir(), { recursive: true });
  cpSync(src, cursorBundleDir(), { recursive: true, force: true });
  const version = readExtensionVersion();
  writeFileSync(join(cursorPluginDir(), ".version"), version + "\n");
  return { ok: true, message: "Bundle provisioned." };
}

export async function autoWireHooks(): Promise<WireResult> {
  const provision = provisionBundle();
  if (!provision.ok) {
    return { ok: false, changed: false, message: provision.message, reloadRequired: false };
  }

  const version = readExtensionVersion();
  const existing = readJson<Record<string, unknown>>(cursorHooksPath());
  const merged = mergeHooks(existing, cursorPluginDir(), version);
  const changed = writeJsonIfChanged(cursorHooksPath(), merged);

  return {
    ok: true,
    changed,
    message: changed
      ? "Hooks wired. Reload Cursor to activate the new hooks."
      : "Hooks already up to date; hooks.json was not rewritten.",
    reloadRequired: changed,
  };
}

export async function unwireHooks(): Promise<WireResult> {
  const existing = readJson<Record<string, unknown>>(cursorHooksPath());
  if (!existing) {
    return { ok: true, changed: false, message: "No hooks.json to clean.", reloadRequired: false };
  }
  const stripped = stripHooksFromConfig(existing);
  const meaningfulKeys = stripped
    ? Object.keys(stripped).filter((k) => k !== "version").length
    : 0;

  if (!stripped || meaningfulKeys === 0) {
    if (existsSync(cursorHooksPath())) {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(cursorHooksPath());
    }
    return { ok: true, changed: true, message: "Hivemind hooks removed.", reloadRequired: true };
  }

  const changed = writeJsonIfChanged(cursorHooksPath(), stripped);
  return {
    ok: true,
    changed,
    message: "Hivemind hooks stripped; foreign hooks preserved.",
    reloadRequired: changed,
  };
}
