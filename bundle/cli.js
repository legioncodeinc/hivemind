#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// dist/src/index-marker-store.js
var index_marker_store_exports = {};
__export(index_marker_store_exports, {
  buildIndexMarkerPath: () => buildIndexMarkerPath,
  getIndexMarkerDir: () => getIndexMarkerDir,
  hasFreshIndexMarker: () => hasFreshIndexMarker,
  writeIndexMarker: () => writeIndexMarker
});
import { existsSync as existsSync14, mkdirSync as mkdirSync7, readFileSync as readFileSync14, writeFileSync as writeFileSync11 } from "node:fs";
import { join as join19 } from "node:path";
import { tmpdir } from "node:os";
function getIndexMarkerDir() {
  return process.env.HIVEMIND_INDEX_MARKER_DIR ?? join19(tmpdir(), "hivemind-deeplake-indexes");
}
function buildIndexMarkerPath(workspaceId, orgId, table, suffix) {
  const markerKey = [workspaceId, orgId, table, suffix].join("__").replace(/[^a-zA-Z0-9_.-]/g, "_");
  return join19(getIndexMarkerDir(), `${markerKey}.json`);
}
function hasFreshIndexMarker(markerPath) {
  if (!existsSync14(markerPath))
    return false;
  try {
    const raw = JSON.parse(readFileSync14(markerPath, "utf-8"));
    const updatedAt = raw.updatedAt ? new Date(raw.updatedAt).getTime() : NaN;
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > INDEX_MARKER_TTL_MS)
      return false;
    return true;
  } catch {
    return false;
  }
}
function writeIndexMarker(markerPath) {
  mkdirSync7(getIndexMarkerDir(), { recursive: true });
  writeFileSync11(markerPath, JSON.stringify({ updatedAt: (/* @__PURE__ */ new Date()).toISOString() }), "utf-8");
}
var INDEX_MARKER_TTL_MS;
var init_index_marker_store = __esm({
  "dist/src/index-marker-store.js"() {
    "use strict";
    INDEX_MARKER_TTL_MS = Number(process.env.HIVEMIND_INDEX_MARKER_TTL_MS ?? 6 * 60 * 6e4);
  }
});

// dist/src/cli/install-claude.js
import { execFileSync } from "node:child_process";
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";

// dist/src/cli/util.js
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, symlinkSync, unlinkSync, lstatSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
var HOME = homedir();
function pkgRoot() {
  let dir = fileURLToPath(new URL(".", import.meta.url));
  for (let i = 0; i < 8; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
      if (pkg.name === "@deeplake/hivemind" || pkg.name === "hivemind")
        return dir;
    } catch {
    }
    const parent = dirname(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return fileURLToPath(new URL("..", import.meta.url));
}
function ensureDir(path, mode = 493) {
  if (!existsSync(path))
    mkdirSync(path, { recursive: true, mode });
}
function copyDir(src, dst) {
  cpSync(src, dst, { recursive: true, force: true, dereference: false });
}
function symlinkForce(target, link) {
  ensureDir(dirname(link));
  if (existsSync(link) || isLink(link))
    unlinkSync(link);
  symlinkSync(target, link);
}
function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
function readJson(path) {
  if (!existsSync(path))
    return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}
function writeJson(path, obj) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}
function writeJsonIfChanged(path, obj) {
  const next = JSON.stringify(obj, null, 2) + "\n";
  if (existsSync(path)) {
    try {
      if (readFileSync(path, "utf-8") === next)
        return false;
    } catch {
    }
  }
  ensureDir(dirname(path));
  writeFileSync(path, next);
  return true;
}
function writeVersionStamp(dir, version) {
  ensureDir(dir);
  writeFileSync(join(dir, ".hivemind_version"), version);
}
var PLATFORM_MARKERS = [
  { id: "claude", markerDir: join(HOME, ".claude") },
  { id: "codex", markerDir: join(HOME, ".codex") },
  { id: "claw", markerDir: join(HOME, ".openclaw") },
  { id: "cursor", markerDir: join(HOME, ".cursor") },
  { id: "hermes", markerDir: join(HOME, ".hermes") },
  // pi (badlogic/pi-mono coding-agent) — config at ~/.pi/agent/. pi exposes
  // a rich extension event API (session_start / input / tool_call /
  // tool_result / message_end / session_shutdown / etc.) — Tier 1 capable.
  { id: "pi", markerDir: join(HOME, ".pi") }
];
function detectPlatforms() {
  return PLATFORM_MARKERS.filter((p) => existsSync(p.markerDir));
}
function allPlatformIds() {
  return PLATFORM_MARKERS.map((p) => p.id);
}
function log(msg) {
  process.stdout.write(msg + "\n");
}
function warn(msg) {
  process.stderr.write(msg + "\n");
}
function confirm(message, defaultYes = true) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve6) => {
    rl.question(`${message} ${hint} `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === "")
        resolve6(defaultYes);
      else
        resolve6(a === "y" || a === "yes");
    });
  });
}
function promptLine(message) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve6) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve6(answer.trim());
    });
  });
}

// dist/src/cli/install-claude.js
var MARKETPLACE_NAME = "hivemind";
var MARKETPLACE_SOURCE = "activeloopai/hivemind";
var PLUGIN_KEY = "hivemind@hivemind";
function runClaude(args) {
  try {
    const stdout = execFileSync("claude", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { ok: true, stdout, stderr: "" };
  } catch (err) {
    const e = err;
    return {
      ok: false,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? e.message ?? ""
    };
  }
}
function requireClaudeCli() {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error("Claude Code CLI ('claude') not found on PATH. Install Claude Code first: https://claude.com/claude-code");
  }
}
function marketplaceAlreadyAdded() {
  const r = runClaude(["plugin", "marketplace", "list"]);
  if (!r.ok)
    return false;
  return new RegExp(`(^|\\s)${MARKETPLACE_NAME}(\\s|$)`, "m").test(r.stdout);
}
function pluginAlreadyInstalled() {
  const r = runClaude(["plugin", "list"]);
  if (!r.ok)
    return false;
  return r.stdout.includes(PLUGIN_KEY);
}
var PLUGIN_SCOPES = ["user", "project", "local", "managed"];
function settingsJsonPath() {
  return join2(homedir2(), ".claude", "settings.json");
}
var LEGACY_PATH_FRAGMENT = ".claude/plugins/hivemind/bundle/";
function isBrokenHivemindHookEntry(h) {
  if (typeof h.command !== "string")
    return false;
  const normalized = h.command.replace(/\\/g, "/");
  if (!normalized.includes(LEGACY_PATH_FRAGMENT))
    return false;
  const match = normalized.match(/"([^"]+\.claude\/plugins\/hivemind\/bundle\/[^"]+)"/);
  const filePath = match ? match[1] : null;
  if (!filePath)
    return false;
  return !existsSync2(filePath);
}
function cleanupBrokenSettingsHooks() {
  const settingsPath = settingsJsonPath();
  if (!existsSync2(settingsPath))
    return { removed: 0, events: [] };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync2(settingsPath, "utf-8"));
  } catch {
    return { removed: 0, events: [] };
  }
  if (!parsed || typeof parsed !== "object")
    return { removed: 0, events: [] };
  const settings = parsed;
  if (!settings.hooks || typeof settings.hooks !== "object")
    return { removed: 0, events: [] };
  let removed = 0;
  const touchedEvents = [];
  for (const [event, matchers] of Object.entries(settings.hooks)) {
    if (!Array.isArray(matchers))
      continue;
    const cleanedMatchers = [];
    let eventTouched = false;
    for (const m of matchers) {
      if (!m || !Array.isArray(m.hooks)) {
        cleanedMatchers.push(m);
        continue;
      }
      const keptHooks = m.hooks.filter((h) => {
        const broken = isBrokenHivemindHookEntry(h);
        if (broken) {
          removed += 1;
          eventTouched = true;
        }
        return !broken;
      });
      if (keptHooks.length > 0) {
        cleanedMatchers.push({ ...m, hooks: keptHooks });
      } else if (m.hooks.length > 0) {
        eventTouched = true;
      } else {
        cleanedMatchers.push(m);
      }
    }
    if (eventTouched) {
      settings.hooks[event] = cleanedMatchers;
      touchedEvents.push(event);
    }
  }
  if (removed > 0) {
    writeFileSync2(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  }
  return { removed, events: touchedEvents };
}
function installClaude() {
  requireClaudeCli();
  if (!marketplaceAlreadyAdded()) {
    const add = runClaude(["plugin", "marketplace", "add", MARKETPLACE_SOURCE]);
    if (!add.ok) {
      throw new Error(`Failed to add marketplace '${MARKETPLACE_SOURCE}': ${add.stderr.slice(0, 200)}`);
    }
  }
  if (!pluginAlreadyInstalled()) {
    const inst = runClaude(["plugin", "install", "hivemind"]);
    if (!inst.ok) {
      throw new Error(`Failed to install hivemind plugin: ${inst.stderr.slice(0, 200)}`);
    }
    log(`  Claude Code    installed via marketplace ${MARKETPLACE_SOURCE}`);
  } else {
    runClaude(["plugin", "marketplace", "update", MARKETPLACE_NAME]);
    for (const scope of PLUGIN_SCOPES) {
      runClaude(["plugin", "update", PLUGIN_KEY, "--scope", scope]);
    }
    log(`  Claude Code    refreshed via marketplace ${MARKETPLACE_SOURCE}`);
  }
  runClaude(["plugin", "enable", PLUGIN_KEY]);
  try {
    const cleanup = cleanupBrokenSettingsHooks();
    if (cleanup.removed > 0) {
      log(`  Claude Code    settings.json cleaned: removed ${cleanup.removed} stale hook entr${cleanup.removed === 1 ? "y" : "ies"} (events: ${cleanup.events.join(", ")})`);
    }
  } catch (e) {
    log(`  Claude Code    settings.json cleanup skipped: ${e?.message ?? String(e)}`);
  }
}
function uninstallClaude() {
  try {
    requireClaudeCli();
  } catch {
    log("  Claude Code    skip uninstall \u2014 claude CLI not on PATH");
    return;
  }
  runClaude(["plugin", "disable", PLUGIN_KEY]);
  runClaude(["plugin", "uninstall", PLUGIN_KEY]);
  log("  Claude Code    plugin uninstalled");
}

// dist/src/cli/install-codex.js
import { existsSync as existsSync3, lstatSync as lstatSync2, readFileSync as readFileSync4, rmSync, unlinkSync as unlinkSync2, writeFileSync as writeFileSync3 } from "node:fs";
import { execFileSync as execFileSync2 } from "node:child_process";
import { join as join4 } from "node:path";

// dist/src/cli/version.js
import { readFileSync as readFileSync3 } from "node:fs";
import { join as join3 } from "node:path";
function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync3(join3(pkgRoot(), "package.json"), "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// dist/src/cli/install-codex.js
var CODEX_HOME = join4(HOME, ".codex");
var PLUGIN_DIR = join4(CODEX_HOME, "hivemind");
var HOOKS_PATH = join4(CODEX_HOME, "hooks.json");
var AGENTS_SKILLS_DIR = join4(HOME, ".agents", "skills");
var SKILL_LINK = join4(AGENTS_SKILLS_DIR, "hivemind-memory");
function hookCmd(bundleFile, timeout, matcher) {
  const block = {
    hooks: [{
      type: "command",
      command: `node "${join4(PLUGIN_DIR, "bundle", bundleFile)}"`,
      timeout
    }]
  };
  if (matcher)
    block.matcher = matcher;
  return block;
}
function buildHooksJson() {
  return {
    hooks: {
      SessionStart: [hookCmd("session-start.js", 10, "startup|resume")],
      UserPromptSubmit: [hookCmd("capture.js", 10)],
      PreToolUse: [hookCmd("pre-tool-use.js", 10, "Bash")],
      PostToolUse: [hookCmd("capture.js", 15)],
      // One Stop matcher-block with TWO commands — stop.js (capture) +
      // graph-on-stop.js (code-graph auto-build, G3). Single block (not two)
      // mirrors the static harnesses/codex/hooks/hooks.json and keeps one entry per
      // event for the merge/dedupe logic.
      Stop: [stopBlockWithGraph(30)]
    }
  };
}
function stopBlockWithGraph(timeout) {
  return {
    hooks: [
      { type: "command", command: `node "${join4(PLUGIN_DIR, "bundle", "stop.js")}"`, timeout },
      { type: "command", command: `node "${join4(PLUGIN_DIR, "bundle", "graph-on-stop.js")}"`, timeout }
    ]
  };
}
var HIVEMIND_BUNDLE_FILES = [
  "session-start.js",
  "session-start-setup.js",
  "capture.js",
  "pre-tool-use.js",
  "stop.js",
  "graph-on-stop.js",
  "wiki-worker.js"
];
function isHivemindHookEntry(entry, pluginDir = PLUGIN_DIR) {
  if (!entry || typeof entry !== "object")
    return false;
  const e = entry;
  const hooks = Array.isArray(e.hooks) ? e.hooks : [];
  return hooks.some((h) => {
    if (!h || typeof h !== "object")
      return false;
    const cmd = h.command;
    if (typeof cmd !== "string")
      return false;
    const nCmd = cmd.replace(/\\/g, "/");
    const nPluginDir = pluginDir.replace(/\\/g, "/");
    if (nCmd.includes(`${nPluginDir}/bundle/`))
      return true;
    return HIVEMIND_BUNDLE_FILES.some((f) => nCmd.includes(`/bundle/${f}`));
  });
}
function isForeignHivemindHookEntry(entry, pluginDir = PLUGIN_DIR) {
  if (!isHivemindHookEntry(entry, pluginDir))
    return false;
  const e = entry;
  const hooks = Array.isArray(e.hooks) ? e.hooks : [];
  return hooks.every((h) => {
    if (!h || typeof h !== "object")
      return false;
    const cmd = h.command;
    if (typeof cmd !== "string")
      return false;
    return !cmd.replace(/\\/g, "/").includes(`${pluginDir.replace(/\\/g, "/")}/bundle/`);
  });
}
function mergeHooks(existing, ours, pluginDir = PLUGIN_DIR) {
  const existingHooks = existing.hooks && typeof existing.hooks === "object" ? existing.hooks : {};
  const ourHooks = ours.hooks;
  const merged = {};
  for (const [event, entries] of Object.entries(existingHooks)) {
    const surviving = (entries ?? []).filter((e) => !isHivemindHookEntry(e, pluginDir));
    if (surviving.length)
      merged[event] = surviving;
  }
  for (const [event, entries] of Object.entries(ourHooks)) {
    merged[event] = [...merged[event] ?? [], ...entries ?? []];
  }
  return { ...existing, hooks: merged };
}
function mergeHooksJson(ours) {
  let existing = {};
  try {
    if (existsSync3(HOOKS_PATH)) {
      const parsed = JSON.parse(readFileSync4(HOOKS_PATH, "utf-8"));
      if (parsed && typeof parsed === "object")
        existing = parsed;
    }
  } catch {
    warn(`  Codex          ${HOOKS_PATH} unparseable \u2014 ignoring prior content`);
  }
  reportForeignHivemindHooks(existing);
  return mergeHooks(existing, ours);
}
function reportForeignHivemindHooks(existing) {
  const existingHooks = existing.hooks && typeof existing.hooks === "object" ? existing.hooks : {};
  const foreign = /* @__PURE__ */ new Set();
  for (const entries of Object.values(existingHooks)) {
    for (const e of entries ?? []) {
      if (!isForeignHivemindHookEntry(e))
        continue;
      const hooks = Array.isArray(e.hooks) ? e.hooks : [];
      for (const h of hooks) {
        const cmd = h?.command;
        if (typeof cmd === "string")
          foreign.add(cmd);
      }
    }
  }
  if (foreign.size === 0)
    return;
  warn(`  Codex          stripping ${foreign.size} hivemind hook(s) from a non-canonical path:`);
  for (const cmd of foreign)
    warn(`                   ${cmd}`);
  warn(`                 (these were probably leftover from a local dev clone \u2014 re-add them manually if intentional)`);
}
function tryEnableCodexHooks() {
  let enabled = false;
  try {
    execFileSync2("codex", ["features", "enable", "hooks"], { stdio: "ignore" });
    enabled = true;
  } catch {
  }
  if (enabled)
    stripLegacyCodexHooksKey();
}
function stripLegacyCodexHooksKey() {
  const cfgPath = join4(CODEX_HOME, "config.toml");
  if (!existsSync3(cfgPath))
    return;
  try {
    const original = readFileSync4(cfgPath, "utf-8");
    const cleaned = original.replace(/^[ \t]*codex_hooks[ \t]*=[^\n]*\r?\n?/gm, "");
    if (cleaned !== original)
      writeFileSync3(cfgPath, cleaned);
  } catch {
  }
}
function installCodex() {
  const srcBundle = join4(pkgRoot(), "harnesses", "codex", "bundle");
  const srcSkills = join4(pkgRoot(), "harnesses", "codex", "skills");
  if (!existsSync3(srcBundle)) {
    throw new Error(`Codex bundle missing at ${srcBundle}. Run 'npm run build' first.`);
  }
  ensureDir(PLUGIN_DIR);
  copyDir(srcBundle, join4(PLUGIN_DIR, "bundle"));
  if (existsSync3(srcSkills))
    copyDir(srcSkills, join4(PLUGIN_DIR, "skills"));
  tryEnableCodexHooks();
  if (!writeJsonIfChanged(HOOKS_PATH, mergeHooksJson(buildHooksJson()))) {
    log(`  Codex          hooks.json unchanged \u2014 skipped rewrite (no re-trust prompt)`);
  }
  ensureDir(AGENTS_SKILLS_DIR);
  const skillTarget = join4(PLUGIN_DIR, "skills", "deeplake-memory");
  if (existsSync3(skillTarget)) {
    symlinkForce(skillTarget, SKILL_LINK);
  } else {
    warn(`  Codex          skill source missing at ${skillTarget}; skipping symlink`);
  }
  const pluginNm = join4(PLUGIN_DIR, "node_modules");
  const embedDepsNm = join4(HOME, ".hivemind", "embed-deps", "node_modules");
  if (existsSync3(embedDepsNm)) {
    try {
      const st = lstatSync2(pluginNm);
      if (st.isDirectory() && !st.isSymbolicLink())
        rmSync(pluginNm, { recursive: true });
    } catch {
    }
    symlinkForce(embedDepsNm, pluginNm);
  }
  writeVersionStamp(PLUGIN_DIR, getVersion());
  log(`  Codex          installed -> ${PLUGIN_DIR}`);
}
function uninstallCodex() {
  if (existsSync3(HOOKS_PATH)) {
    let existing = {};
    try {
      const raw = JSON.parse(readFileSync4(HOOKS_PATH, "utf-8"));
      if (raw && typeof raw === "object")
        existing = raw;
    } catch {
      unlinkSync2(HOOKS_PATH);
      log(`  Codex          removed unparseable ${HOOKS_PATH}`);
      existing = {};
    }
    if (Object.keys(existing).length > 0) {
      const stripped = mergeHooks(existing, { hooks: {} });
      const survivingHooks = stripped.hooks ?? {};
      const otherTopLevelKeys = Object.keys(stripped).filter((k) => k !== "hooks");
      if (Object.keys(survivingHooks).length === 0 && otherTopLevelKeys.length === 0) {
        unlinkSync2(HOOKS_PATH);
        log(`  Codex          removed ${HOOKS_PATH}`);
      } else {
        writeJson(HOOKS_PATH, stripped);
        log(`  Codex          stripped hivemind hooks from ${HOOKS_PATH}`);
      }
    }
  }
  if (existsSync3(SKILL_LINK)) {
    unlinkSync2(SKILL_LINK);
    log(`  Codex          removed ${SKILL_LINK}`);
  }
  log(`  Codex          plugin files kept at ${PLUGIN_DIR}`);
}

// dist/src/cli/install-openclaw.js
import { existsSync as existsSync5, copyFileSync, rmSync as rmSync2 } from "node:fs";
import { join as join6 } from "node:path";

// dist/harnesses/openclaw/src/setup-config.js
import { existsSync as existsSync4, readFileSync as readFileSync5, writeFileSync as writeFileSync4, renameSync } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join5 } from "node:path";
var HIVEMIND_TOOL_NAMES = ["hivemind_search", "hivemind_read", "hivemind_index"];
function getOpenclawConfigPath() {
  return join5(homedir3(), ".openclaw", "openclaw.json");
}
function isAllowlistCoveringHivemind(alsoAllow) {
  if (!Array.isArray(alsoAllow))
    return false;
  for (const entry of alsoAllow) {
    if (typeof entry !== "string")
      continue;
    const normalized = entry.trim().toLowerCase();
    if (normalized === "hivemind")
      return true;
    if (normalized === "group:plugins")
      return true;
    if (HIVEMIND_TOOL_NAMES.includes(normalized))
      return true;
  }
  return false;
}
function isPluginsAllowMissingHivemind(allow) {
  return Array.isArray(allow) && allow.length > 0 && !allow.includes("hivemind");
}
function ensureHivemindAllowlisted() {
  const configPath2 = getOpenclawConfigPath();
  if (!existsSync4(configPath2)) {
    return { status: "error", configPath: configPath2, error: "openclaw config file not found" };
  }
  let parsed;
  try {
    const raw = readFileSync5(configPath2, "utf-8");
    parsed = JSON.parse(raw);
  } catch (e) {
    return { status: "error", configPath: configPath2, error: `could not read/parse config: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "error", configPath: configPath2, error: "openclaw config is not a JSON object" };
  }
  const plugins = parsed.plugins ?? {};
  const pluginsAllowRaw = plugins.allow;
  const tools = parsed.tools ?? {};
  const alsoAllowRaw = tools.alsoAllow;
  const pluginsAllowNeedsPatch = isPluginsAllowMissingHivemind(pluginsAllowRaw);
  const toolsAlsoAllowNeedsPatch = Array.isArray(alsoAllowRaw) && alsoAllowRaw.length > 0 && !isAllowlistCoveringHivemind(alsoAllowRaw);
  if (!pluginsAllowNeedsPatch && !toolsAlsoAllowNeedsPatch) {
    return { status: "already-set", configPath: configPath2 };
  }
  const updated = { ...parsed };
  if (pluginsAllowNeedsPatch) {
    updated.plugins = {
      ...plugins,
      // Cast safe — isPluginsAllowMissingHivemind guarantees Array.
      allow: [...pluginsAllowRaw, "hivemind"]
    };
  }
  if (toolsAlsoAllowNeedsPatch) {
    updated.tools = {
      ...tools,
      // Cast safe — the needs-patch check above guarantees Array.
      alsoAllow: [...alsoAllowRaw, "hivemind"]
    };
  }
  const backupPath = `${configPath2}.bak-hivemind-${Date.now()}`;
  const tmpPath = `${configPath2}.tmp-hivemind-${process.pid}`;
  try {
    writeFileSync4(backupPath, readFileSync5(configPath2, "utf-8"));
    writeFileSync4(tmpPath, JSON.stringify(updated, null, 2) + "\n");
    renameSync(tmpPath, configPath2);
  } catch (e) {
    return { status: "error", configPath: configPath2, error: `could not write config: ${e instanceof Error ? e.message : String(e)}` };
  }
  return {
    status: "added",
    configPath: configPath2,
    backupPath,
    delta: {
      pluginsAllow: pluginsAllowNeedsPatch,
      toolsAlsoAllow: toolsAlsoAllowNeedsPatch
    }
  };
}

// dist/src/cli/install-openclaw.js
var PLUGIN_DIR2 = join6(HOME, ".openclaw", "extensions", "hivemind");
function installOpenclaw() {
  const srcDist = join6(pkgRoot(), "harnesses", "openclaw", "dist");
  const srcManifest = join6(pkgRoot(), "harnesses", "openclaw", "openclaw.plugin.json");
  const srcPkg = join6(pkgRoot(), "harnesses", "openclaw", "package.json");
  const srcSkills = join6(pkgRoot(), "harnesses", "openclaw", "skills");
  if (!existsSync5(srcDist)) {
    throw new Error(`OpenClaw bundle missing at ${srcDist}. Run 'npm run build' first.`);
  }
  ensureDir(PLUGIN_DIR2);
  rmSync2(join6(PLUGIN_DIR2, "dist"), { recursive: true, force: true });
  copyDir(srcDist, join6(PLUGIN_DIR2, "dist"));
  if (existsSync5(srcManifest))
    copyFileSync(srcManifest, join6(PLUGIN_DIR2, "openclaw.plugin.json"));
  if (existsSync5(srcPkg))
    copyFileSync(srcPkg, join6(PLUGIN_DIR2, "package.json"));
  if (existsSync5(srcSkills))
    copyDir(srcSkills, join6(PLUGIN_DIR2, "skills"));
  writeVersionStamp(PLUGIN_DIR2, getVersion());
  log(`  OpenClaw       installed -> ${PLUGIN_DIR2}`);
  const result = ensureHivemindAllowlisted();
  if (result.status === "added") {
    const touched = [];
    if (result.delta.pluginsAllow)
      touched.push("plugins.allow");
    if (result.delta.toolsAlsoAllow)
      touched.push("tools.alsoAllow");
    log(`  OpenClaw       patched ${touched.join(" + ")} in ${result.configPath}`);
    log(`  OpenClaw       backup: ${result.backupPath}`);
    log(`  OpenClaw       restart the gateway to activate: systemctl --user restart openclaw-gateway.service`);
    log(`  OpenClaw       capture starts on the NEXT turn \u2014 earlier turns are NOT backfilled`);
  } else if (result.status === "already-set") {
    log(`  OpenClaw       allowlist already covers hivemind in ${result.configPath}`);
  } else if (result.status === "error") {
    if (result.error === "openclaw config file not found") {
      log(`  OpenClaw       openclaw.json not present at ${result.configPath} \u2014 run openclaw once, then \`hivemind claw install\` again`);
    } else {
      warn(`  OpenClaw       could not patch allowlist in ${result.configPath}: ${result.error}`);
    }
  }
}
function uninstallOpenclaw() {
  if (existsSync5(PLUGIN_DIR2)) {
    rmSync2(PLUGIN_DIR2, { recursive: true, force: true });
    log(`  OpenClaw       removed ${PLUGIN_DIR2}`);
  } else {
    log(`  OpenClaw       nothing to remove`);
  }
}

// dist/src/cli/install-cursor.js
import { existsSync as existsSync6, lstatSync as lstatSync3, rmSync as rmSync3, unlinkSync as unlinkSync3 } from "node:fs";
import { join as join7 } from "node:path";
var CURSOR_HOME = join7(HOME, ".cursor");
var PLUGIN_DIR3 = join7(CURSOR_HOME, "hivemind");
var HOOKS_PATH2 = join7(CURSOR_HOME, "hooks.json");
var HIVEMIND_MARKER_KEY = "_hivemindManaged";
function buildHookCmd(bundleFile, timeout) {
  return {
    type: "command",
    command: `node "${join7(PLUGIN_DIR3, "bundle", bundleFile)}"`,
    timeout
  };
}
function buildHookCmdShellMatcher(bundleFile, timeout) {
  return {
    type: "command",
    command: `node "${join7(PLUGIN_DIR3, "bundle", bundleFile)}"`,
    timeout,
    matcher: "Shell"
  };
}
function buildHookConfig() {
  return {
    sessionStart: [buildHookCmd("session-start.js", 30)],
    beforeSubmitPrompt: [buildHookCmd("capture.js", 10)],
    // preToolUse with Shell matcher rewrites grep/rg against ~/.deeplake/memory/
    // into a single SQL fast-path call, matching Claude Code / Codex accuracy.
    preToolUse: [buildHookCmdShellMatcher("pre-tool-use.js", 30)],
    postToolUse: [buildHookCmd("capture.js", 15)],
    afterAgentResponse: [buildHookCmd("capture.js", 15)],
    // graph-on-stop: auto-build the code graph (A1 Cursor parity). Same hook
    // Claude Code registers under Stop + SessionEnd. It's gated (rate limit +
    // HEAD-changed + source-diff) so the common path is a ~5ms skip, and runs
    // async so it never blocks Cursor.
    stop: [buildHookCmd("capture.js", 15), buildHookCmd("graph-on-stop.js", 30)],
    sessionEnd: [buildHookCmd("session-end.js", 30), buildHookCmd("graph-on-stop.js", 30)]
  };
}
function isHivemindEntry(entry) {
  if (!entry || typeof entry !== "object")
    return false;
  const cmd = entry.command;
  if (typeof cmd !== "string")
    return false;
  return cmd.replace(/\\/g, "/").includes("/.cursor/hivemind/bundle/");
}
function mergeHooks2(existing) {
  const root = existing ?? { version: 1, hooks: {} };
  if (!root.version)
    root.version = 1;
  if (!root.hooks)
    root.hooks = {};
  const ours = buildHookConfig();
  for (const [event, entries] of Object.entries(ours)) {
    const prior = Array.isArray(root.hooks[event]) ? root.hooks[event] : [];
    const stripped = prior.filter((e) => !isHivemindEntry(e));
    root.hooks[event] = [...stripped, ...entries];
  }
  root[HIVEMIND_MARKER_KEY] = { version: getVersion() };
  return root;
}
function stripHooksFromConfig(existing) {
  if (!existing)
    return null;
  const root = existing;
  if (root.hooks) {
    for (const event of Object.keys(root.hooks)) {
      root.hooks[event] = (root.hooks[event] ?? []).filter((e) => !isHivemindEntry(e));
      if (root.hooks[event].length === 0)
        delete root.hooks[event];
    }
    if (Object.keys(root.hooks).length === 0)
      delete root.hooks;
  }
  delete existing[HIVEMIND_MARKER_KEY];
  return existing;
}
function installCursor() {
  const srcBundle = join7(pkgRoot(), "cursor", "bundle");
  if (!existsSync6(srcBundle)) {
    throw new Error(`Cursor bundle missing at ${srcBundle}. Run 'npm run build' first.`);
  }
  ensureDir(PLUGIN_DIR3);
  copyDir(srcBundle, join7(PLUGIN_DIR3, "bundle"));
  const existing = readJson(HOOKS_PATH2);
  const merged = mergeHooks2(existing);
  writeJsonIfChanged(HOOKS_PATH2, merged);
  const pluginNm = join7(PLUGIN_DIR3, "node_modules");
  const embedDepsNm = join7(HOME, ".hivemind", "embed-deps", "node_modules");
  if (existsSync6(embedDepsNm)) {
    try {
      const st = lstatSync3(pluginNm);
      if (st.isDirectory() && !st.isSymbolicLink())
        rmSync3(pluginNm, { recursive: true });
    } catch {
    }
    symlinkForce(embedDepsNm, pluginNm);
  }
  writeVersionStamp(PLUGIN_DIR3, getVersion());
  log(`  Cursor         installed -> ${PLUGIN_DIR3}`);
}
function uninstallCursor() {
  const existing = readJson(HOOKS_PATH2);
  if (!existing) {
    log("  Cursor         no hooks.json to clean");
    return;
  }
  const stripped = stripHooksFromConfig(existing);
  const meaningfulKeys = stripped ? Object.keys(stripped).filter((k) => k !== "version").length : 0;
  if (!stripped || meaningfulKeys === 0) {
    if (existsSync6(HOOKS_PATH2))
      unlinkSync3(HOOKS_PATH2);
  } else {
    writeJson(HOOKS_PATH2, stripped);
  }
  log(`  Cursor         hooks removed from ${HOOKS_PATH2} (plugin files kept at ${PLUGIN_DIR3})`);
}

// dist/src/cli/install-hermes.js
import { existsSync as existsSync8, lstatSync as lstatSync4, writeFileSync as writeFileSync5, readFileSync as readFileSync6, rmSync as rmSync4, unlinkSync as unlinkSync4 } from "node:fs";
import { join as join9 } from "node:path";

// node_modules/js-yaml/dist/js-yaml.mjs
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
var isNothing_1 = isNothing;
var isObject_1 = isObject;
var toArray_1 = toArray;
var repeat_1 = repeat;
var isNegativeZero_1 = isNegativeZero;
var extend_1 = extend;
var common = {
  isNothing: isNothing_1,
  isObject: isObject_1,
  toArray: toArray_1,
  repeat: repeat_1,
  isNegativeZero: isNegativeZero_1,
  extend: extend_1
};
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark) return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
YAMLException$1.prototype = Object.create(Error.prototype);
YAMLException$1.prototype.constructor = YAMLException$1;
YAMLException$1.prototype.toString = function toString(compact) {
  return this.name + ": " + formatError(this, compact);
};
var exception = YAMLException$1;
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== "number") options.indent = 1;
  if (typeof options.linesBefore !== "number") options.linesBefore = 3;
  if (typeof options.linesAfter !== "number") options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = "", i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
var snippet = makeSnippet;
var TYPE_CONSTRUCTOR_OPTIONS = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
];
var YAML_NODE_KINDS = [
  "scalar",
  "sequence",
  "mapping"
];
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
var type = Type$1;
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
Schema$1.prototype.extend = function extend2(definition) {
  var implicit = [];
  var explicit = [];
  if (definition instanceof type) {
    explicit.push(definition);
  } else if (Array.isArray(definition)) {
    explicit = explicit.concat(definition);
  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);
  } else {
    throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  }
  implicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
    if (type$1.loadKind && type$1.loadKind !== "scalar") {
      throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    }
    if (type$1.multi) {
      throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    }
  });
  explicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
  });
  var result = Object.create(Schema$1.prototype);
  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);
  result.compiledImplicit = compileList(result, "implicit");
  result.compiledExplicit = compileList(result, "explicit");
  result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
  return result;
};
var schema = Schema$1;
var str = new type("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: function(data) {
    return data !== null ? data : "";
  }
});
var seq = new type("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: function(data) {
    return data !== null ? data : [];
  }
});
var map = new type("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: function(data) {
    return data !== null ? data : {};
  }
});
var failsafe = new schema({
  explicit: [
    str,
    seq,
    map
  ]
});
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var _null = new type("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function() {
      return "~";
    },
    lowercase: function() {
      return "null";
    },
    uppercase: function() {
      return "NULL";
    },
    camelcase: function() {
      return "Null";
    },
    empty: function() {
      return "";
    }
  },
  defaultStyle: "lowercase"
});
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
var bool = new type("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function(object) {
      return object ? "true" : "false";
    },
    uppercase: function(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase: function(object) {
      return object ? "True" : "False";
    }
  },
  defaultStyle: "lowercase"
});
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max) return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_") continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
var int = new type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function(obj) {
      return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
    },
    octal: function(obj) {
      return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
    },
    decimal: function(obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function(obj) {
      return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
});
var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
var float = new type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: "lowercase"
});
var json = failsafe.extend({
  implicit: [
    _null,
    bool,
    int,
    float
  ]
});
var core = json;
var YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
);
var YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
var timestamp = new type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
});
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64) continue;
    if (code < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
var binary = new type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});
var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
var _toString$2 = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]") return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new type("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});
var _toString$1 = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]") return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
var pairs = new type("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});
var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set = new type("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: resolveYamlSet,
  construct: constructYamlSet
});
var _default = core.extend({
  implicit: [
    timestamp,
    merge
  ],
  explicit: [
    binary,
    omap,
    pairs,
    set
  ]
});
var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
function setProperty(object, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  } else {
    object[key] = value;
  }
}
var simpleEscapeCheck = new Array(256);
var simpleEscapeMap = new Array(256);
for (i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
var i;
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML: function handleYamlDirective(state, name, args) {
    var match, major, minor;
    if (state.version !== null) {
      throwError(state, "duplication of %YAML directive");
    }
    if (args.length !== 1) {
      throwError(state, "YAML directive accepts exactly one argument");
    }
    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throwError(state, "ill-formed argument of the YAML directive");
    }
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    if (major !== 1) {
      throwError(state, "unacceptable YAML version of the document");
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      throwWarning(state, "unsupported YAML version of the document");
    }
  },
  TAG: function handleTagDirective(state, name, args) {
    var handle, prefix;
    if (args.length !== 2) {
      throwError(state, "TAG directive accepts exactly two arguments");
    }
    handle = args[0];
    prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
    }
    if (_hasOwnProperty$1.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    }
    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, "tag prefix is malformed: " + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      setProperty(destination, key, source[key]);
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    setProperty(_result, keyNode, valueNode);
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33) return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38) return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
var loadAll_1 = loadAll$1;
var load_1 = load$1;
var loader = {
  loadAll: loadAll_1,
  load: load_1
};
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_BOM = 65279;
var CHAR_TAB = 9;
var CHAR_LINE_FEED = 10;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_SPACE = 32;
var CHAR_EXCLAMATION = 33;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SHARP = 35;
var CHAR_PERCENT = 37;
var CHAR_AMPERSAND = 38;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_ASTERISK = 42;
var CHAR_COMMA = 44;
var CHAR_MINUS = 45;
var CHAR_COLON = 58;
var CHAR_EQUALS = 61;
var CHAR_GREATER_THAN = 62;
var CHAR_QUESTION = 63;
var CHAR_COMMERCIAL_AT = 64;
var CHAR_LEFT_SQUARE_BRACKET = 91;
var CHAR_RIGHT_SQUARE_BRACKET = 93;
var CHAR_GRAVE_ACCENT = 96;
var CHAR_LEFT_CURLY_BRACKET = 123;
var CHAR_VERTICAL_LINE = 124;
var CHAR_RIGHT_CURLY_BRACKET = 125;
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1;
var QUOTING_TYPE_DOUBLE = 2;
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n") result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1;
var STYLE_SINGLE = 2;
var STYLE_LITERAL = 3;
var STYLE_FOLDED = 4;
var STYLE_DOUBLE = 5;
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = (function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  })();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = (function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  })();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 65536) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "") pairBuffer += ", ";
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024) pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
  return "";
}
var dump_1 = dump$1;
var dumper = {
  dump: dump_1
};
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var load = loader.load;
var loadAll = loader.loadAll;
var dump = dumper.dump;
var safeLoad = renamed("safeLoad", "load");
var safeLoadAll = renamed("safeLoadAll", "loadAll");
var safeDump = renamed("safeDump", "dump");

// dist/src/cli/install-mcp-shared.js
import { existsSync as existsSync7 } from "node:fs";
import { join as join8 } from "node:path";
var HIVEMIND_DIR = join8(HOME, ".hivemind");
var MCP_DIR = join8(HIVEMIND_DIR, "mcp");
var MCP_SERVER_PATH = join8(MCP_DIR, "server.js");
var MCP_PACKAGE_JSON = join8(MCP_DIR, "package.json");
function ensureMcpServerInstalled() {
  const srcDir = join8(pkgRoot(), "mcp", "bundle");
  if (!existsSync7(srcDir)) {
    throw new Error(`MCP server bundle missing at ${srcDir}. Run 'npm run build' to produce it before installing Tier B consumers.`);
  }
  ensureDir(MCP_DIR);
  copyDir(srcDir, MCP_DIR);
  writeVersionStamp(HIVEMIND_DIR, getVersion());
  log(`  hivemind-mcp   server installed -> ${MCP_SERVER_PATH}`);
}

// dist/src/cli/install-hermes.js
var HERMES_HOME = join9(HOME, ".hermes");
var SKILLS_DIR = join9(HERMES_HOME, "skills", "hivemind-memory");
var HIVEMIND_DIR2 = join9(HERMES_HOME, "hivemind");
var BUNDLE_DIR = join9(HIVEMIND_DIR2, "bundle");
var CONFIG_PATH = join9(HERMES_HOME, "config.yaml");
var SERVER_KEY = "hivemind";
var SKILL_BODY = `---
name: hivemind-memory
description: Global team and org memory powered by Activeloop. ALWAYS check BOTH built-in memory AND Hivemind memory when recalling information.
---

# Hivemind Memory

You have persistent memory at \`~/.deeplake/memory/\` \u2014 global memory shared across all sessions, users, and agents in the org.

## Hivemind tools (preferred)

When you need to recall org memory, prefer calling the hivemind MCP tools \u2014 one tool call returns ranked hits across all summaries and sessions in a single SQL query:

- \`hivemind_search { query, limit? }\` \u2014 keyword/regex search across summaries + sessions
- \`hivemind_read { path }\` \u2014 read full content at a Hivemind memory path (e.g. \`/summaries/alice/abc.md\`)
- \`hivemind_index { prefix?, limit? }\` \u2014 list summary entries

Different paths under \`/summaries/<username>/\` are different users \u2014 do NOT merge or alias them.

## Direct filesystem fallback

If MCP tools are unavailable for some reason, fall back to reading the virtual filesystem at \`~/.deeplake/memory/\`:

\`\`\`
~/.deeplake/memory/
\u251C\u2500\u2500 index.md                          \u2190 START HERE \u2014 table of all sessions
\u251C\u2500\u2500 summaries/
\u2502   \u251C\u2500\u2500 session-abc.md                \u2190 AI-generated wiki summary
\u2502   \u2514\u2500\u2500 session-xyz.md
\u2514\u2500\u2500 sessions/
    \u2514\u2500\u2500 username/
        \u251C\u2500\u2500 user_org_ws_slug1.jsonl   \u2190 raw session data
        \u2514\u2500\u2500 user_org_ws_slug2.jsonl
\`\`\`

1. **First**: Read \`~/.deeplake/memory/index.md\`
2. **If you need details**: Read the specific summary at \`~/.deeplake/memory/summaries/<session>.md\`
3. **If you need raw data**: Read the session JSONL at \`~/.deeplake/memory/sessions/<user>/<file>.jsonl\`
4. **Keyword search**: \`grep -r "keyword" ~/.deeplake/memory/\` (use \`grep\`, NOT \`rg\`/ripgrep \u2014 \`rg\` may not be installed)

Do NOT jump straight to reading raw JSONL files. Always start with index.md and summaries.

## Important Constraints

- Use \`grep\` (NOT \`rg\`/ripgrep) for keyword search \u2014 \`rg\` may not be installed on the host system.
- Only use these bash builtins to interact with \`~/.deeplake/memory/\`: \`cat\`, \`ls\`, \`grep\`, \`echo\`, \`jq\`, \`head\`, \`tail\`, \`sed\`, \`awk\`, \`wc\`, \`sort\`, \`find\`. The memory filesystem does NOT support \`rg\`, \`python\`, \`python3\`, \`node\`, or \`curl\`.
- If a file returns empty after 2 attempts, skip it and move on. Report what you found rather than retrying exhaustively.
`;
function isHivemindHook(entry) {
  if (!entry || typeof entry !== "object")
    return false;
  const cmd = entry.command;
  return typeof cmd === "string" && cmd.includes("/.hermes/hivemind/bundle/");
}
function buildHookEntry(bundleFile, timeout, matcher) {
  const entry = {
    command: `node ${join9(BUNDLE_DIR, bundleFile)}`,
    timeout
  };
  if (matcher)
    entry.matcher = matcher;
  return entry;
}
function buildHooksBlock() {
  return {
    on_session_start: [buildHookEntry("session-start.js", 30)],
    // pre_tool_call (matcher: terminal) intercepts grep/rg against
    // ~/.deeplake/memory/ and replies with a single SQL fast-path result.
    // Belt-and-suspenders alongside the hivemind_search MCP tool — if the
    // agent ignores the skill guidance and runs a terminal grep, accuracy
    // still matches Tier 1 (Claude / Codex / Cursor).
    pre_tool_call: [buildHookEntry("pre-tool-use.js", 30, "terminal")],
    pre_llm_call: [buildHookEntry("capture.js", 10)],
    post_tool_call: [buildHookEntry("capture.js", 15)],
    post_llm_call: [buildHookEntry("capture.js", 15)],
    // graph-on-stop: code-graph auto-build parity (G3), same gated hook as the
    // other agents. on_session_end is Hermes's session-close event (analogous
    // to Claude Code's SessionEnd).
    on_session_end: [buildHookEntry("session-end.js", 30), buildHookEntry("graph-on-stop.js", 30)]
  };
}
function mergeHooks3(existing) {
  const merged = { ...existing ?? {} };
  const ours = buildHooksBlock();
  for (const [event, entries] of Object.entries(ours)) {
    const prior = Array.isArray(merged[event]) ? merged[event] : [];
    const stripped = prior.filter((e) => !isHivemindHook(e));
    merged[event] = [...stripped, ...entries];
  }
  return merged;
}
function stripHivemindHooks(existing) {
  if (!existing)
    return void 0;
  const out = {};
  for (const [event, entries] of Object.entries(existing)) {
    const kept = (entries ?? []).filter((e) => !isHivemindHook(e));
    if (kept.length > 0)
      out[event] = kept;
  }
  return Object.keys(out).length > 0 ? out : void 0;
}
function readConfig() {
  if (!existsSync8(CONFIG_PATH))
    return {};
  try {
    const raw = readFileSync6(CONFIG_PATH, "utf-8");
    const parsed = load(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}
function writeConfig(cfg) {
  ensureDir(HERMES_HOME);
  const dumped = dump(cfg, { lineWidth: 100, noRefs: true });
  writeFileSync5(CONFIG_PATH, dumped);
}
function installHermes() {
  ensureDir(SKILLS_DIR);
  writeFileSync5(join9(SKILLS_DIR, "SKILL.md"), SKILL_BODY);
  writeVersionStamp(SKILLS_DIR, getVersion());
  log(`  Hermes         skill installed -> ${SKILLS_DIR}`);
  const srcBundle = join9(pkgRoot(), "harnesses", "hermes", "bundle");
  if (!existsSync8(srcBundle)) {
    throw new Error(`Hermes bundle missing at ${srcBundle}. Run 'npm run build' first.`);
  }
  ensureDir(HIVEMIND_DIR2);
  copyDir(srcBundle, BUNDLE_DIR);
  const pluginNm = join9(HIVEMIND_DIR2, "node_modules");
  const embedDepsNm = join9(HOME, ".hivemind", "embed-deps", "node_modules");
  if (existsSync8(embedDepsNm)) {
    try {
      const st = lstatSync4(pluginNm);
      if (st.isDirectory() && !st.isSymbolicLink())
        rmSync4(pluginNm, { recursive: true });
    } catch {
    }
    symlinkForce(embedDepsNm, pluginNm);
  }
  writeVersionStamp(HIVEMIND_DIR2, getVersion());
  log(`  Hermes         bundle installed -> ${BUNDLE_DIR}`);
  ensureMcpServerInstalled();
  const cfg = readConfig();
  if (!cfg.mcp_servers || typeof cfg.mcp_servers !== "object")
    cfg.mcp_servers = {};
  cfg.mcp_servers[SERVER_KEY] = {
    command: "node",
    args: [MCP_SERVER_PATH]
  };
  cfg.hooks = mergeHooks3(cfg.hooks);
  cfg.hooks_auto_accept = true;
  writeConfig(cfg);
  log(`  Hermes         config updated -> ${CONFIG_PATH} (mcp_servers + hooks + hooks_auto_accept)`);
}
function uninstallHermes() {
  if (existsSync8(SKILLS_DIR)) {
    rmSync4(SKILLS_DIR, { recursive: true, force: true });
    log(`  Hermes         removed ${SKILLS_DIR}`);
  }
  if (existsSync8(HIVEMIND_DIR2)) {
    rmSync4(HIVEMIND_DIR2, { recursive: true, force: true });
    log(`  Hermes         removed ${HIVEMIND_DIR2}`);
  }
  if (existsSync8(CONFIG_PATH)) {
    const cfg = readConfig();
    let touched = false;
    if (cfg.mcp_servers && typeof cfg.mcp_servers === "object" && SERVER_KEY in cfg.mcp_servers) {
      delete cfg.mcp_servers[SERVER_KEY];
      if (Object.keys(cfg.mcp_servers).length === 0)
        delete cfg.mcp_servers;
      touched = true;
    }
    const stripped = stripHivemindHooks(cfg.hooks);
    if (cfg.hooks && (!stripped || Object.keys(stripped).length !== Object.keys(cfg.hooks).length)) {
      if (stripped)
        cfg.hooks = stripped;
      else
        delete cfg.hooks;
      touched = true;
    }
    if ("hooks_auto_accept" in cfg) {
      delete cfg.hooks_auto_accept;
      touched = true;
    }
    if (touched) {
      if (Object.keys(cfg).length === 0) {
        unlinkSync4(CONFIG_PATH);
      } else {
        writeConfig(cfg);
      }
      log(`  Hermes         hivemind entries removed from ${CONFIG_PATH}`);
    }
  }
}

// dist/src/cli/install-pi.js
import { existsSync as existsSync9, writeFileSync as writeFileSync6, rmSync as rmSync5, readFileSync as readFileSync7, copyFileSync as copyFileSync2 } from "node:fs";
import { join as join10 } from "node:path";
var PI_AGENT_DIR = join10(HOME, ".pi", "agent");
var AGENTS_MD = join10(PI_AGENT_DIR, "AGENTS.md");
var LEGACY_SKILL_DIR = join10(PI_AGENT_DIR, "skills", "hivemind-memory");
var EXTENSIONS_DIR = join10(PI_AGENT_DIR, "extensions");
var EXTENSION_PATH = join10(EXTENSIONS_DIR, "hivemind.ts");
var VERSION_DIR = join10(PI_AGENT_DIR, ".hivemind");
var WIKI_WORKER_DIR = join10(PI_AGENT_DIR, "hivemind");
var WIKI_WORKER_PATH = join10(WIKI_WORKER_DIR, "wiki-worker.js");
var SKILLIFY_WORKER_PATH = join10(WIKI_WORKER_DIR, "skillify-worker.js");
var AUTOPULL_WORKER_PATH = join10(WIKI_WORKER_DIR, "autopull-worker.js");
var SKILLOPT_WORKER_PATH = join10(WIKI_WORKER_DIR, "skillopt-worker.js");
var HIVEMIND_BLOCK_START = "<!-- BEGIN hivemind-memory -->";
var HIVEMIND_BLOCK_END = "<!-- END hivemind-memory -->";
var HIVEMIND_BLOCK_BODY = `${HIVEMIND_BLOCK_START}
## Hivemind Memory

You have access to global org memory at \`~/.deeplake/memory/\`. Always check both
your local context AND Hivemind memory when the user asks you to recall, look up,
or remember anything.

- Three hivemind tools are registered: \`hivemind_search\`, \`hivemind_read\`, \`hivemind_index\`. **Prefer these** \u2014 one call returns ranked hits in a single SQL query.
- Fall back to direct filesystem if the tools fail:
- Start with \`~/.deeplake/memory/index.md\` (table of all sessions)
- Then read specific summaries at \`~/.deeplake/memory/summaries/<user>/<session>.md\`
- Only fall back to raw \`~/.deeplake/memory/sessions/<user>/*.jsonl\` if summaries don't have enough detail
- Search: use \`grep\` (NOT \`rg\`/ripgrep \u2014 \`rg\` is not always installed). Example: \`grep -ri "keyword" ~/.deeplake/memory/\`

Use only bash builtins (cat, ls, grep, jq, head, tail, sed, awk, wc, sort, find) to read this filesystem \u2014
rg/ripgrep, node, python, curl are not available there.
${HIVEMIND_BLOCK_END}`;
function upsertHivemindBlock(existing) {
  const block = HIVEMIND_BLOCK_BODY;
  if (!existing)
    return `${block}
`;
  const startIdx = existing.indexOf(HIVEMIND_BLOCK_START);
  if (startIdx === -1)
    return `${existing.trimEnd()}

${block}
`;
  const endIdx = existing.indexOf(HIVEMIND_BLOCK_END, startIdx);
  if (endIdx === -1) {
    return `${existing.trimEnd()}

${block}
`;
  }
  const before = existing.slice(0, startIdx).trimEnd();
  const after = existing.slice(endIdx + HIVEMIND_BLOCK_END.length).replace(/^\n+/, "");
  const rest = after ? `

${after}` : "";
  return `${before ? before + "\n\n" : ""}${block}
${rest}`;
}
function stripHivemindBlock(existing) {
  const startIdx = existing.indexOf(HIVEMIND_BLOCK_START);
  if (startIdx === -1)
    return existing;
  const endIdx = existing.indexOf(HIVEMIND_BLOCK_END, startIdx);
  if (endIdx === -1)
    return existing;
  const before = existing.slice(0, startIdx).trimEnd();
  const after = existing.slice(endIdx + HIVEMIND_BLOCK_END.length).replace(/^\n+/, "");
  if (!before && !after)
    return "";
  if (!before)
    return after;
  if (!after)
    return `${before}
`;
  return `${before}

${after}`;
}
function installPi() {
  ensureDir(PI_AGENT_DIR);
  if (existsSync9(LEGACY_SKILL_DIR)) {
    rmSync5(LEGACY_SKILL_DIR, { recursive: true, force: true });
  }
  const prior = existsSync9(AGENTS_MD) ? readFileSync7(AGENTS_MD, "utf-8") : null;
  const next = upsertHivemindBlock(prior);
  writeFileSync6(AGENTS_MD, next);
  const srcExtension = join10(pkgRoot(), "harnesses", "pi", "extension-source", "hivemind.ts");
  if (!existsSync9(srcExtension)) {
    throw new Error(`pi extension source missing at ${srcExtension}. Reinstall the @deeplake/hivemind package.`);
  }
  ensureDir(EXTENSIONS_DIR);
  copyFileSync2(srcExtension, EXTENSION_PATH);
  const srcWorker = join10(pkgRoot(), "harnesses", "pi", "bundle", "wiki-worker.js");
  if (existsSync9(srcWorker)) {
    ensureDir(WIKI_WORKER_DIR);
    copyFileSync2(srcWorker, WIKI_WORKER_PATH);
  }
  const srcSkillifyWorker = join10(pkgRoot(), "harnesses", "pi", "bundle", "skillify-worker.js");
  if (existsSync9(srcSkillifyWorker)) {
    ensureDir(WIKI_WORKER_DIR);
    copyFileSync2(srcSkillifyWorker, SKILLIFY_WORKER_PATH);
  }
  const srcAutopullWorker = join10(pkgRoot(), "harnesses", "pi", "bundle", "autopull-worker.js");
  if (existsSync9(srcAutopullWorker)) {
    ensureDir(WIKI_WORKER_DIR);
    copyFileSync2(srcAutopullWorker, AUTOPULL_WORKER_PATH);
  }
  const srcSkilloptWorker = join10(pkgRoot(), "harnesses", "pi", "bundle", "skillopt-worker.js");
  if (existsSync9(srcSkilloptWorker)) {
    ensureDir(WIKI_WORKER_DIR);
    copyFileSync2(srcSkilloptWorker, SKILLOPT_WORKER_PATH);
  }
  ensureDir(VERSION_DIR);
  writeVersionStamp(VERSION_DIR, getVersion());
  log(`  pi             AGENTS.md updated -> ${AGENTS_MD}`);
  log(`  pi             extension installed -> ${EXTENSION_PATH}`);
  if (existsSync9(WIKI_WORKER_PATH)) {
    log(`  pi             wiki-worker installed -> ${WIKI_WORKER_PATH}`);
  }
  if (existsSync9(SKILLIFY_WORKER_PATH)) {
    log(`  pi             skillify-worker installed -> ${SKILLIFY_WORKER_PATH}`);
  }
  if (existsSync9(AUTOPULL_WORKER_PATH)) {
    log(`  pi             autopull-worker installed -> ${AUTOPULL_WORKER_PATH}`);
  }
  if (existsSync9(SKILLOPT_WORKER_PATH)) {
    log(`  pi             skillopt-worker installed -> ${SKILLOPT_WORKER_PATH}`);
  }
}
function uninstallPi() {
  if (existsSync9(LEGACY_SKILL_DIR)) {
    rmSync5(LEGACY_SKILL_DIR, { recursive: true, force: true });
    log(`  pi             removed ${LEGACY_SKILL_DIR}`);
  }
  if (existsSync9(EXTENSION_PATH)) {
    rmSync5(EXTENSION_PATH, { force: true });
    log(`  pi             removed extension ${EXTENSION_PATH}`);
  }
  if (existsSync9(WIKI_WORKER_DIR)) {
    rmSync5(WIKI_WORKER_DIR, { recursive: true, force: true });
    log(`  pi             removed wiki-worker dir ${WIKI_WORKER_DIR}`);
  }
  if (existsSync9(AGENTS_MD)) {
    const prior = readFileSync7(AGENTS_MD, "utf-8");
    const stripped = stripHivemindBlock(prior);
    if (stripped.trim().length === 0) {
      rmSync5(AGENTS_MD, { force: true });
      log(`  pi             removed empty ${AGENTS_MD}`);
    } else {
      writeFileSync6(AGENTS_MD, stripped);
      log(`  pi             stripped hivemind block from ${AGENTS_MD}`);
    }
  }
  if (existsSync9(VERSION_DIR)) {
    rmSync5(VERSION_DIR, { recursive: true, force: true });
  }
}

// dist/src/cli/embeddings.js
import { copyFileSync as copyFileSync3, chmodSync, existsSync as existsSync11, lstatSync as lstatSync5, readdirSync, readFileSync as readFileSync9, readlinkSync, rmSync as rmSync6, statSync, unlinkSync as unlinkSync5 } from "node:fs";
import { execFileSync as execFileSync3, spawnSync } from "node:child_process";
import { userInfo } from "node:os";
import { join as join12 } from "node:path";

// dist/src/embeddings/protocol.js
var DEFAULT_SOCKET_DIR = "/tmp";
var DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1e3;
function socketPathFor(uid, dir = DEFAULT_SOCKET_DIR) {
  return `${dir}/hivemind-embed-${uid}.sock`;
}
function pidPathFor(uid, dir = DEFAULT_SOCKET_DIR) {
  return `${dir}/hivemind-embed-${uid}.pid`;
}

// dist/src/user-config.js
import { existsSync as existsSync10, mkdirSync as mkdirSync2, readFileSync as readFileSync8, renameSync as renameSync2, writeFileSync as writeFileSync7 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { dirname as dirname2, join as join11 } from "node:path";
var _configPath = () => process.env.HIVEMIND_CONFIG_PATH ?? join11(homedir4(), ".deeplake", "config.json");
var _cache = null;
var _migrated = false;
function readUserConfig() {
  if (_cache !== null)
    return _cache;
  const path = _configPath();
  if (!existsSync10(path)) {
    _cache = {};
    return _cache;
  }
  try {
    const raw = readFileSync8(path, "utf-8");
    const parsed = JSON.parse(raw);
    _cache = isPlainObject(parsed) ? parsed : {};
  } catch {
    _cache = {};
  }
  return _cache;
}
function writeUserConfig(patch) {
  const current = readUserConfig();
  const merged = deepMerge(current, patch);
  const path = _configPath();
  const dir = dirname2(path);
  if (!existsSync10(dir))
    mkdirSync2(dir, { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync7(tmp, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  renameSync2(tmp, path);
  _cache = merged;
  return merged;
}
function getEmbeddingsEnabled() {
  const cfg = readUserConfig();
  if (cfg.embeddings && typeof cfg.embeddings.enabled === "boolean") {
    return cfg.embeddings.enabled;
  }
  if (_migrated) {
    return migrationValueFromEnv();
  }
  _migrated = true;
  const enabled = migrationValueFromEnv();
  try {
    writeUserConfig({ embeddings: { enabled } });
  } catch {
    _cache = { ...cfg ?? {}, embeddings: { ...cfg?.embeddings ?? {}, enabled } };
  }
  return enabled;
}
function migrationValueFromEnv() {
  const raw = process.env.HIVEMIND_EMBEDDINGS;
  if (raw === void 0)
    return false;
  if (raw === "false")
    return false;
  return true;
}
function setEmbeddingsEnabled(enabled) {
  writeUserConfig({ embeddings: { enabled } });
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function deepMerge(base, patch) {
  const out = { ...base };
  for (const key of Object.keys(patch)) {
    const patchVal = patch[key];
    const baseVal = base[key];
    if (isPlainObject(patchVal) && isPlainObject(baseVal)) {
      out[key] = { ...baseVal, ...patchVal };
    } else if (patchVal !== void 0) {
      out[key] = patchVal;
    }
  }
  return out;
}

// dist/src/cli/embeddings.js
var SHARED_DIR = join12(HOME, ".hivemind", "embed-deps");
var SHARED_NODE_MODULES = join12(SHARED_DIR, "node_modules");
var SHARED_DAEMON_PATH = join12(SHARED_DIR, "embed-daemon.js");
var TRANSFORMERS_PKG = "@huggingface/transformers";
var TRANSFORMERS_RANGE = "^3.0.0";
function findHivemindInstalls(home = HOME) {
  const out = [];
  const fixed = [
    { id: "codex", pluginDir: join12(home, ".codex", "hivemind") },
    { id: "cursor", pluginDir: join12(home, ".cursor", "hivemind") },
    { id: "hermes", pluginDir: join12(home, ".hermes", "hivemind") }
  ];
  for (const inst of fixed) {
    if (existsSync11(join12(inst.pluginDir, "bundle")))
      out.push(inst);
  }
  const ccCache = join12(home, ".claude", "plugins", "cache", "hivemind", "hivemind");
  if (existsSync11(ccCache)) {
    let entries = [];
    try {
      entries = readdirSync(ccCache);
    } catch {
    }
    for (const ver of entries) {
      const dir = join12(ccCache, ver);
      try {
        if (!statSync(dir).isDirectory())
          continue;
      } catch {
        continue;
      }
      const candidates = [join12(dir, "bundle"), join12(dir, "harnesses", "claude-code", "bundle")];
      if (candidates.some((p) => existsSync11(p))) {
        out.push({ id: `claude (${ver})`, pluginDir: dir });
      }
    }
  }
  return out;
}
function isSharedDepsInstalled(sharedNodeModules = SHARED_NODE_MODULES) {
  return existsSync11(join12(sharedNodeModules, TRANSFORMERS_PKG));
}
function isSymlinkToSharedDeps(linkPath, sharedNodeModules) {
  if (!existsSync11(linkPath))
    return false;
  try {
    if (!lstatSync5(linkPath).isSymbolicLink())
      return false;
    return readlinkSync(linkPath) === sharedNodeModules;
  } catch {
    return false;
  }
}
function linkStateFor(install, sharedNodeModules = SHARED_NODE_MODULES) {
  const link = join12(install.pluginDir, "node_modules");
  if (!existsSync11(link) && !isSymbolicLink(link))
    return { kind: "no-node-modules" };
  try {
    if (lstatSync5(link).isSymbolicLink()) {
      const target = readlinkSync(link);
      return target === sharedNodeModules ? { kind: "linked-to-shared" } : { kind: "linked-elsewhere", target };
    }
  } catch {
    return { kind: "no-node-modules" };
  }
  return { kind: "owns-own-node-modules" };
}
function isSymbolicLink(path) {
  try {
    return lstatSync5(path).isSymbolicLink();
  } catch {
    return false;
  }
}
function ensureSharedDeps() {
  if (!isSharedDepsInstalled()) {
    log(`  Embeddings     installing ${TRANSFORMERS_PKG}@${TRANSFORMERS_RANGE} into ${SHARED_DIR}`);
    log(`                 (~600 MB; first install only \u2014 every agent will share this)`);
    ensureDir(SHARED_DIR);
    writeJson(join12(SHARED_DIR, "package.json"), {
      name: "hivemind-embed-deps",
      version: "1.0.0",
      private: true,
      dependencies: { [TRANSFORMERS_PKG]: TRANSFORMERS_RANGE }
    });
    execFileSync3("npm", ["install", "--omit=dev", "--no-package-lock", "--no-audit", "--no-fund"], {
      cwd: SHARED_DIR,
      stdio: "inherit"
    });
  } else {
    log(`  Embeddings     shared deps already present at ${SHARED_DIR}`);
  }
  ensureDir(SHARED_DIR);
  const src = join12(pkgRoot(), "embeddings", "embed-daemon.js");
  if (existsSync11(src)) {
    copyFileSync3(src, SHARED_DAEMON_PATH);
    chmodSync(SHARED_DAEMON_PATH, 493);
  } else {
    warn(`  Embeddings     standalone daemon bundle missing at ${src} (run 'npm run build' first)`);
  }
}
function linkAgent(install) {
  const link = join12(install.pluginDir, "node_modules");
  const state = linkStateFor(install);
  if (state.kind === "owns-own-node-modules") {
    warn(`  Embeddings     ${install.id.padEnd(20)} owns its own node_modules \u2014 skipping symlink (status: owns-own-node-modules)`);
    return;
  }
  symlinkForce(SHARED_NODE_MODULES, link);
  log(`  Embeddings     linked ${install.id.padEnd(20)} -> shared deps`);
}
function installEmbeddings() {
  ensureSharedDeps();
  const installs = findHivemindInstalls();
  if (installs.length === 0) {
    warn("  Embeddings     no hivemind installs detected \u2014 run `hivemind install` first");
    warn("                 (the shared deps are in place; subsequent agent installs will pick them up if you re-run `hivemind embeddings install`)");
  } else {
    for (const inst of installs)
      linkAgent(inst);
  }
  setEmbeddingsEnabled(true);
  log(`  Embeddings     enabled in ~/.deeplake/config.json`);
  log(`  Embeddings     ready. Restart your agents to pick up.`);
}
function enableEmbeddings() {
  setEmbeddingsEnabled(true);
  log(`  Embeddings     enabled in ~/.deeplake/config.json`);
  if (!isSharedDepsInstalled()) {
    warn(`  Embeddings     shared deps not installed yet \u2014 run \`hivemind embeddings install\` to download them`);
  } else {
    log(`  Embeddings     shared deps present \u2014 sessions will start producing embeddings on next restart`);
  }
}
function uninstallEmbeddings(opts) {
  const installs = findHivemindInstalls();
  for (const inst of installs) {
    const link = join12(inst.pluginDir, "node_modules");
    if (isSymlinkToSharedDeps(link, SHARED_NODE_MODULES)) {
      unlinkSync5(link);
      log(`  Embeddings     unlinked ${inst.id}`);
    }
  }
  if (opts?.prune && existsSync11(SHARED_DIR)) {
    rmSync6(SHARED_DIR, { recursive: true, force: true });
    log(`  Embeddings     pruned ${SHARED_DIR}`);
  }
  setEmbeddingsEnabled(false);
  killEmbedDaemon();
  log(`  Embeddings     disabled in ~/.deeplake/config.json`);
}
function disableEmbeddings() {
  setEmbeddingsEnabled(false);
  killEmbedDaemon();
  log(`  Embeddings     disabled in ~/.deeplake/config.json`);
  log(`  Embeddings     daemon terminated; shared deps preserved (run \`hivemind embeddings uninstall\` to remove)`);
}
function killEmbedDaemon(socketDir) {
  const uid = typeof process.getuid === "function" ? process.getuid() : userInfo().uid;
  const pidPath = pidPathFor(String(uid), socketDir);
  const sockPath = socketPathFor(String(uid), socketDir);
  let pid = null;
  try {
    pid = Number.parseInt(readFileSync9(pidPath, "utf-8").trim(), 10);
  } catch {
  }
  if (pid !== null && Number.isFinite(pid) && _isDaemonAliveOnSocket(sockPath)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
    }
  } else if (pid !== null) {
    log(`  Embeddings     pidfile present but socket dead \u2014 skipping SIGTERM on possibly-stale pid ${pid}`);
  }
  try {
    unlinkSync5(sockPath);
  } catch {
  }
  try {
    unlinkSync5(pidPath);
  } catch {
  }
}
function _isDaemonAliveOnSocket(sockPath, timeoutMs = 200) {
  if (!existsSync11(sockPath))
    return false;
  try {
    const child = spawnSync("node", [
      "-e",
      `const n=require("node:net");const s=n.connect(${JSON.stringify(sockPath)});s.once("connect",()=>{s.end();process.exit(0)});s.once("error",()=>process.exit(2));setTimeout(()=>process.exit(3),${timeoutMs});`
    ], { timeout: timeoutMs + 1e3, stdio: "ignore" });
    return child.status === 0;
  } catch {
    return false;
  }
}
function statusEmbeddings() {
  const enabled = getEmbeddingsEnabled();
  log(`Config:        ~/.deeplake/config.json embeddings.enabled = ${enabled}`);
  log(`Shared deps:   ${SHARED_DIR}`);
  log(`Installed:     ${isSharedDepsInstalled() ? "yes" : "no"}`);
  log(`Daemon:        ${existsSync11(SHARED_DAEMON_PATH) ? SHARED_DAEMON_PATH : "(not present)"}`);
  if (!enabled) {
    log("");
    log(`Embeddings are DISABLED in user config. Run \`hivemind embeddings enable\` to opt in,`);
    log(`or \`hivemind embeddings install\` if the shared deps are not yet downloaded.`);
  } else if (!isSharedDepsInstalled()) {
    log("");
    warn(`Embeddings are enabled in config but shared deps are missing.`);
    warn(`Run \`hivemind embeddings install\` to download @huggingface/transformers.`);
  }
  log("");
  log(`Agent installs:`);
  const installs = findHivemindInstalls();
  if (installs.length === 0) {
    log(`  (none detected)`);
    return;
  }
  for (const inst of installs) {
    const state = linkStateFor(inst);
    let label;
    switch (state.kind) {
      case "linked-to-shared":
        label = "\u2713 linked \u2192 shared";
        break;
      case "no-node-modules":
        label = "\u2717 not linked";
        break;
      case "owns-own-node-modules":
        label = "\u25B3 has its own node_modules (not shared)";
        break;
      case "linked-elsewhere":
        label = `\u25B3 linked \u2192 ${state.target}`;
        break;
    }
    log(`  ${inst.id.padEnd(20)} ${label}`);
    log(`  ${" ".repeat(20)}   ${inst.pluginDir}`);
  }
}

// dist/src/cli/auth.js
import { existsSync as existsSync12 } from "node:fs";
import { join as join15 } from "node:path";

// dist/src/commands/auth.js
import { execSync } from "node:child_process";

// dist/src/utils/client-header.js
var DEEPLAKE_CLIENT_HEADER = "X-Deeplake-Client";
function deeplakeClientValue() {
  return "hivemind";
}
function deeplakeClientHeader() {
  return { [DEEPLAKE_CLIENT_HEADER]: deeplakeClientValue() };
}

// dist/src/commands/install-id.js
import { readFileSync as readFileSync10, writeFileSync as writeFileSync8, mkdirSync as mkdirSync3 } from "node:fs";
import { join as join13 } from "node:path";
import { homedir as homedir5 } from "node:os";
import { randomUUID } from "node:crypto";
function configDir() {
  return join13(homedir5(), ".deeplake");
}
function installIDPath() {
  return join13(configDir(), "install-id");
}
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function getOrCreateInstallID() {
  try {
    const value = readFileSync10(installIDPath(), "utf-8").trim();
    if (UUID_RE.test(value))
      return value;
  } catch {
  }
  const id = randomUUID();
  try {
    mkdirSync3(configDir(), { recursive: true, mode: 448 });
    writeFileSync8(installIDPath(), id, { mode: 384 });
    return id;
  } catch {
    return "";
  }
}
function hivemindInstallIDHeader() {
  const id = getOrCreateInstallID();
  if (!id)
    return {};
  return { "X-Hivemind-Install-Id": id };
}

// dist/src/commands/auth-creds.js
import { readFileSync as readFileSync11, writeFileSync as writeFileSync9, mkdirSync as mkdirSync4, unlinkSync as unlinkSync6 } from "node:fs";
import { join as join14 } from "node:path";
import { homedir as homedir6 } from "node:os";
function configDir2() {
  return join14(homedir6(), ".deeplake");
}
function credsPath() {
  return join14(configDir2(), "credentials.json");
}
function loadCredentials() {
  try {
    return JSON.parse(readFileSync11(credsPath(), "utf-8"));
  } catch {
    return null;
  }
}
function saveCredentials(creds) {
  mkdirSync4(configDir2(), { recursive: true, mode: 448 });
  writeFileSync9(credsPath(), JSON.stringify({ ...creds, savedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2), { mode: 384 });
}
function deleteCredentials() {
  try {
    unlinkSync6(credsPath());
    return true;
  } catch {
    return false;
  }
}

// dist/src/commands/auth.js
var DEFAULT_API_URL = "https://api.deeplake.ai";
function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3)
      return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4)
      payload += "=";
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return null;
  }
}
async function apiGet(path, token, apiUrl, orgId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...deeplakeClientHeader()
  };
  if (orgId)
    headers["X-Activeloop-Org-Id"] = orgId;
  const resp = await fetch(`${apiUrl}${path}`, { headers });
  if (!resp.ok)
    throw new Error(`API ${resp.status}: ${await resp.text().catch(() => "")}`);
  return resp.json();
}
async function apiPost(path, body, token, apiUrl, orgId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...deeplakeClientHeader()
  };
  if (orgId)
    headers["X-Activeloop-Org-Id"] = orgId;
  const resp = await fetch(`${apiUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!resp.ok)
    throw new Error(`API ${resp.status}: ${await resp.text().catch(() => "")}`);
  return resp.json();
}
async function apiDelete(path, token, apiUrl, orgId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...deeplakeClientHeader()
  };
  if (orgId)
    headers["X-Activeloop-Org-Id"] = orgId;
  const resp = await fetch(`${apiUrl}${path}`, { method: "DELETE", headers });
  if (!resp.ok)
    throw new Error(`API ${resp.status}: ${await resp.text().catch(() => "")}`);
}
async function requestDeviceCode(apiUrl = DEFAULT_API_URL) {
  const resp = await fetch(`${apiUrl}/auth/device/code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...deeplakeClientHeader(),
      ...hivemindInstallIDHeader()
    }
  });
  if (!resp.ok)
    throw new Error(`Device flow unavailable: HTTP ${resp.status}`);
  return resp.json();
}
async function pollForToken(deviceCode, apiUrl = DEFAULT_API_URL) {
  const resp = await fetch(`${apiUrl}/auth/device/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...deeplakeClientHeader(),
      ...hivemindInstallIDHeader()
    },
    body: JSON.stringify({ device_code: deviceCode })
  });
  if (resp.ok)
    return resp.json();
  if (resp.status === 400) {
    const err = await resp.json().catch(() => null);
    if (err?.error === "authorization_pending" || err?.error === "slow_down")
      return null;
    if (err?.error === "expired_token")
      throw new Error("Device code expired. Try again.");
    if (err?.error === "access_denied")
      throw new Error("Authorization denied.");
  }
  throw new Error(`Token polling failed: HTTP ${resp.status}`);
}
function openBrowser(url) {
  try {
    const cmd = process.platform === "darwin" ? `open "${url}"` : process.platform === "win32" ? `start "${url}"` : `xdg-open "${url}" 2>/dev/null`;
    execSync(cmd, { stdio: "ignore", timeout: 5e3 });
    return true;
  } catch {
    return false;
  }
}
async function deviceFlowLogin(apiUrl = DEFAULT_API_URL) {
  const code = await requestDeviceCode(apiUrl);
  const opened = openBrowser(code.verification_uri_complete);
  const msg = [
    "\nDeeplake Authentication",
    "\u2500".repeat(40),
    `
Open this URL: ${code.verification_uri_complete}`,
    `Or visit ${code.verification_uri} and enter code: ${code.user_code}`,
    opened ? "\nBrowser opened. Waiting for sign in..." : "\nWaiting for sign in..."
  ].join("\n");
  process.stderr.write(msg + "\n");
  const interval = Math.max(code.interval || 5, 5) * 1e3;
  const deadline = Date.now() + code.expires_in * 1e3;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    const result = await pollForToken(code.device_code, apiUrl);
    if (result) {
      process.stderr.write("\nAuthentication successful!\n");
      return { token: result.access_token, expiresIn: result.expires_in };
    }
  }
  throw new Error("Device code expired.");
}
async function listOrgs(token, apiUrl = DEFAULT_API_URL) {
  const data = await apiGet("/organizations", token, apiUrl);
  return Array.isArray(data) ? data : [];
}
async function switchOrg(orgId, orgName) {
  const creds = loadCredentials();
  if (!creds)
    throw new Error("Not logged in. Run deeplake login first.");
  const apiUrl = creds.apiUrl ?? DEFAULT_API_URL;
  const tokenName = `deeplake-plugin-switch-${Date.now()}`;
  const tokenData = await apiPost("/users/me/tokens", {
    name: tokenName,
    duration: 365 * 24 * 3600,
    organization_id: orgId
  }, creds.token, apiUrl);
  saveCredentials({ ...creds, orgId, orgName, token: tokenData.token.token });
}
async function listWorkspaces(token, apiUrl = DEFAULT_API_URL, orgId) {
  const raw = await apiGet("/workspaces", token, apiUrl, orgId);
  const data = raw.data ?? raw;
  return Array.isArray(data) ? data : [];
}
async function switchWorkspace(workspaceId) {
  const creds = loadCredentials();
  if (!creds)
    throw new Error("Not logged in. Run deeplake login first.");
  saveCredentials({ ...creds, workspaceId });
}
async function inviteMember(username, accessMode, token, orgId, apiUrl = DEFAULT_API_URL) {
  await apiPost(`/organizations/${orgId}/members/invite`, { username, access_mode: accessMode }, token, apiUrl, orgId);
}
async function listMembers(token, orgId, apiUrl = DEFAULT_API_URL) {
  const data = await apiGet(`/organizations/${orgId}/members`, token, apiUrl, orgId);
  return data.members ?? [];
}
async function removeMember(userId, token, orgId, apiUrl = DEFAULT_API_URL) {
  await apiDelete(`/organizations/${orgId}/members/${userId}`, token, apiUrl, orgId);
}
async function saveCredentialsFromToken(token, apiUrl, opts = {}) {
  const user = await apiGet("/me", token, apiUrl);
  const userName = user.name || (user.email ? user.email.split("@")[0] : "unknown");
  process.stderr.write(`
Logged in as: ${userName}
`);
  const orgs = await listOrgs(token, apiUrl);
  if (orgs.length === 0)
    throw new Error("No organizations found for this account.");
  const envOrgId = process.env.HIVEMIND_ORG_ID;
  let preferredOrgId = envOrgId;
  if (!preferredOrgId && opts.skipTokenMint) {
    const claims = decodeJwtPayload(token);
    const claimOrg = claims && typeof claims.org_id === "string" ? claims.org_id : void 0;
    if (claimOrg)
      preferredOrgId = claimOrg;
  }
  let orgId;
  let orgName;
  const matched = preferredOrgId ? orgs.find((o) => o.id === preferredOrgId) : void 0;
  if (matched) {
    orgId = matched.id;
    orgName = matched.name;
    process.stderr.write(`Organization: ${orgName}
`);
  } else if (orgs.length === 1) {
    orgId = orgs[0].id;
    orgName = orgs[0].name;
    process.stderr.write(`Organization: ${orgName}
`);
  } else {
    process.stderr.write("\nOrganizations:\n");
    orgs.forEach((org, i) => process.stderr.write(`  ${i + 1}. ${org.name}
`));
    orgId = orgs[0].id;
    orgName = orgs[0].name;
    if (opts.skipTokenMint) {
      process.stderr.write(`
Using: ${orgName} (set HIVEMIND_ORG_ID to override)
`);
    } else {
      process.stderr.write(`
Using: ${orgName}
`);
    }
  }
  let apiToken = token;
  if (!opts.skipTokenMint) {
    const tokenName = `deeplake-plugin-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`;
    const tokenData = await apiPost("/users/me/tokens", {
      name: tokenName,
      duration: 365 * 24 * 3600,
      organization_id: orgId
    }, token, apiUrl);
    apiToken = tokenData.token.token;
  }
  const creds = {
    token: apiToken,
    orgId,
    orgName,
    userName,
    workspaceId: "default",
    apiUrl,
    savedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  saveCredentials(creds);
  return creds;
}
async function login(apiUrl = DEFAULT_API_URL) {
  const { token: authToken } = await deviceFlowLogin(apiUrl);
  return saveCredentialsFromToken(authToken, apiUrl, { skipTokenMint: false });
}

// dist/src/cli/auth.js
var DEFAULT_API_URL2 = "https://api.deeplake.ai";
function resolveApiUrl() {
  return process.env.HIVEMIND_API_URL ?? DEFAULT_API_URL2;
}
var CREDS_PATH = join15(HOME, ".deeplake", "credentials.json");
function isLoggedIn() {
  return existsSync12(CREDS_PATH) && loadCredentials() !== null;
}
async function ensureLoggedIn() {
  if (isLoggedIn())
    return true;
  log("");
  log("No Deeplake credentials found. Starting login...");
  try {
    await login(resolveApiUrl());
  } catch (err) {
    warn(`Login failed: ${err.message}`);
    return false;
  }
  return isLoggedIn();
}
async function loginWithProvidedToken(flagToken) {
  const token = flagToken ?? process.env.HIVEMIND_TOKEN;
  if (!token)
    return false;
  try {
    await saveCredentialsFromToken(token, resolveApiUrl(), { skipTokenMint: true });
    const source = flagToken ? "--token flag" : "HIVEMIND_TOKEN";
    log(`Signed in via ${source}.`);
    return true;
  } catch (err) {
    warn(`Token authentication failed: ${err.message}`);
    return false;
  }
}
async function maybeShowOrgChoice() {
  const creds = loadCredentials();
  if (!creds)
    return;
  try {
    const orgs = await listOrgs(creds.token, creds.apiUrl ?? "https://api.deeplake.ai");
    if (orgs.length <= 1)
      return;
    const activeName = creds.orgName ?? creds.orgId;
    log("");
    log(`You belong to ${orgs.length} orgs. Active: ${activeName}`);
    log(`  Change with: hivemind org switch <name-or-id>`);
  } catch {
  }
}

// dist/src/config.js
import { readFileSync as readFileSync12, existsSync as existsSync13 } from "node:fs";
import { join as join16 } from "node:path";
import { homedir as homedir7, userInfo as userInfo2 } from "node:os";
function loadConfig() {
  const home = homedir7();
  const credPath = join16(home, ".deeplake", "credentials.json");
  let creds = null;
  if (existsSync13(credPath)) {
    try {
      creds = JSON.parse(readFileSync12(credPath, "utf-8"));
    } catch {
      return null;
    }
  }
  const token = process.env.HIVEMIND_TOKEN ?? creds?.token;
  const orgId = process.env.HIVEMIND_ORG_ID ?? creds?.orgId;
  if (!token || !orgId)
    return null;
  return {
    token,
    orgId,
    orgName: creds?.orgName ?? orgId,
    userName: creds?.userName || userInfo2().username || "unknown",
    workspaceId: process.env.HIVEMIND_WORKSPACE_ID ?? creds?.workspaceId ?? "default",
    apiUrl: process.env.HIVEMIND_API_URL ?? creds?.apiUrl ?? "https://api.deeplake.ai",
    tableName: process.env.HIVEMIND_TABLE ?? "memory",
    sessionsTableName: process.env.HIVEMIND_SESSIONS_TABLE ?? "sessions",
    skillsTableName: process.env.HIVEMIND_SKILLS_TABLE ?? "skills",
    // Defaults match the table name written into the SQL — keep aligned
    // with RULES_COLUMNS in deeplake-schema.ts and with the e2e test-org
    // override convention (memory_test / sessions_test → goals_test, etc.)
    // documented in CLAUDE.md.
    rulesTableName: process.env.HIVEMIND_RULES_TABLE ?? "hivemind_rules",
    // Goals + KPIs (refined design — VFS path classifier maps
    //   memory/goal/<user>/<status>/<uuid>.md → hivemind_goals row
    //   memory/kpi/<uuid>/<kpi_id>.md → hivemind_kpis row
    // See src/shell/deeplake-fs.ts for the translation logic and
    // GOALS_COLUMNS / KPIS_COLUMNS in deeplake-schema.ts for the
    // table shape.
    goalsTableName: process.env.HIVEMIND_GOALS_TABLE ?? "hivemind_goals",
    kpisTableName: process.env.HIVEMIND_KPIS_TABLE ?? "hivemind_kpis",
    codebaseTableName: process.env.HIVEMIND_CODEBASE_TABLE ?? "codebase",
    memoryPath: process.env.HIVEMIND_MEMORY_PATH ?? join16(home, ".deeplake", "memory")
  };
}

// dist/src/deeplake-api.js
import { randomUUID as randomUUID2 } from "node:crypto";

// dist/src/utils/debug.js
import { appendFileSync, mkdirSync as mkdirSync5 } from "node:fs";
import { dirname as dirname3, join as join17 } from "node:path";
import { homedir as homedir8 } from "node:os";
var LOG = join17(homedir8(), ".deeplake", "hook-debug.log");
function isDebug() {
  return process.env.HIVEMIND_DEBUG === "1";
}
function log2(tag, msg) {
  if (!isDebug())
    return;
  try {
    mkdirSync5(dirname3(LOG), { recursive: true });
    appendFileSync(LOG, `${(/* @__PURE__ */ new Date()).toISOString()} [${tag}] ${msg}
`);
  } catch {
  }
}

// dist/src/utils/sql.js
function sqlStr(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/\0/g, "").replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
function sqlLike(value) {
  return sqlStr(value).replace(/%/g, "\\%").replace(/_/g, "\\_");
}
function sqlIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${JSON.stringify(name)}`);
  }
  return name;
}

// dist/src/embeddings/columns.js
var SUMMARY_EMBEDDING_COL = "summary_embedding";

// dist/src/deeplake-schema.js
var MEMORY_COLUMNS = Object.freeze([
  { name: "id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "path", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "filename", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "summary", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "summary_embedding", sql: "FLOAT4[]" },
  { name: "author", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "mime_type", sql: "TEXT NOT NULL DEFAULT 'text/plain'" },
  { name: "size_bytes", sql: "BIGINT NOT NULL DEFAULT 0" },
  { name: "project", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "description", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "creation_date", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "last_update_date", sql: "TEXT NOT NULL DEFAULT ''" }
]);
var SESSIONS_COLUMNS = Object.freeze([
  { name: "id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "path", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "filename", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "message", sql: "JSONB" },
  { name: "message_embedding", sql: "FLOAT4[]" },
  { name: "author", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "mime_type", sql: "TEXT NOT NULL DEFAULT 'application/json'" },
  { name: "size_bytes", sql: "BIGINT NOT NULL DEFAULT 0" },
  { name: "project", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "description", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "creation_date", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "last_update_date", sql: "TEXT NOT NULL DEFAULT ''" }
]);
var SKILLS_COLUMNS = Object.freeze([
  { name: "id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "name", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "project", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "project_key", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "local_path", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "install", sql: "TEXT NOT NULL DEFAULT 'project'" },
  { name: "source_sessions", sql: "TEXT NOT NULL DEFAULT '[]'" },
  { name: "source_agent", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "scope", sql: "TEXT NOT NULL DEFAULT 'me'" },
  { name: "author", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "contributors", sql: "TEXT NOT NULL DEFAULT '[]'" },
  { name: "description", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "trigger_text", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "body", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "version", sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "updated_at", sql: "TEXT NOT NULL DEFAULT ''" }
]);
var RULES_COLUMNS = Object.freeze([
  { name: "id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "rule_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "text", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "scope", sql: "TEXT NOT NULL DEFAULT 'team'" },
  { name: "status", sql: "TEXT NOT NULL DEFAULT 'active'" },
  { name: "assigned_by", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "version", sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent", sql: "TEXT NOT NULL DEFAULT 'manual'" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" }
]);
var GOALS_COLUMNS = Object.freeze([
  { name: "id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "goal_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "owner", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "status", sql: "TEXT NOT NULL DEFAULT 'opened'" },
  { name: "content", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "version", sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "updated_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent", sql: "TEXT NOT NULL DEFAULT 'manual'" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" }
]);
var KPIS_COLUMNS = Object.freeze([
  { name: "id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "goal_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "kpi_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "content", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "version", sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "updated_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent", sql: "TEXT NOT NULL DEFAULT 'manual'" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" }
]);
function validateSchema(label, cols) {
  const seen = /* @__PURE__ */ new Set();
  for (const col of cols) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(col.name)) {
      throw new Error(`${label}: column name "${col.name}" is not a valid SQL identifier`);
    }
    if (seen.has(col.name)) {
      throw new Error(`${label}: duplicate column "${col.name}"`);
    }
    seen.add(col.name);
    const notNull = /\bNOT\s+NULL\b/i.test(col.sql);
    const hasDefault = /\bDEFAULT\b/i.test(col.sql);
    if (notNull && !hasDefault) {
      throw new Error(`${label}: column "${col.name}" is NOT NULL but has no DEFAULT \u2014 ALTER TABLE ADD COLUMN on a populated table would fail.`);
    }
  }
}
var CODEBASE_COLUMNS = Object.freeze([
  // Identity key (matches the PK below)
  { name: "org_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "workspace_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "repo_slug", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "user_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "worktree_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "commit_sha", sql: "TEXT NOT NULL DEFAULT ''" },
  // Observation metadata
  { name: "parent_sha", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "branch", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "ts", sql: "TIMESTAMP" },
  { name: "pushed_by", sql: "TEXT NOT NULL DEFAULT ''" },
  // Snapshot payload
  { name: "snapshot_sha256", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "snapshot_jsonb", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "node_count", sql: "BIGINT NOT NULL DEFAULT 0" },
  { name: "edge_count", sql: "BIGINT NOT NULL DEFAULT 0" },
  // Generator metadata (for drift diagnostics — what hivemind version produced this?)
  { name: "generator", sql: "TEXT NOT NULL DEFAULT 'hivemind-graph'" },
  { name: "generator_version", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "schema_version", sql: "BIGINT NOT NULL DEFAULT 1" }
]);
validateSchema("MEMORY_COLUMNS", MEMORY_COLUMNS);
validateSchema("SESSIONS_COLUMNS", SESSIONS_COLUMNS);
validateSchema("SKILLS_COLUMNS", SKILLS_COLUMNS);
validateSchema("RULES_COLUMNS", RULES_COLUMNS);
validateSchema("GOALS_COLUMNS", GOALS_COLUMNS);
validateSchema("KPIS_COLUMNS", KPIS_COLUMNS);
validateSchema("CODEBASE_COLUMNS", CODEBASE_COLUMNS);
function buildCreateTableSql(tableName, cols) {
  const safe = sqlIdent(tableName);
  const colSql = cols.map((c) => `${c.name} ${c.sql}`).join(", ");
  return `CREATE TABLE IF NOT EXISTS "${safe}" (${colSql}) USING deeplake`;
}
function buildIntrospectionSql(tableName, workspaceId) {
  return `SELECT column_name FROM information_schema.columns WHERE table_name = '${sqlStr(tableName)}' AND table_schema = '${sqlStr(workspaceId)}'`;
}
async function healMissingColumns(args) {
  const safeTable = sqlIdent(args.tableName);
  const introspectSql = buildIntrospectionSql(args.tableName, args.workspaceId);
  const rows = await args.query(introspectSql);
  const existing = /* @__PURE__ */ new Set();
  for (const row of rows) {
    const v = row?.column_name;
    if (typeof v === "string")
      existing.add(v.toLowerCase());
  }
  const missingCols = args.columns.filter((c) => !existing.has(c.name.toLowerCase()));
  const missing = missingCols.map((c) => c.name);
  if (missingCols.length === 0)
    return { missing, altered: [] };
  const altered = [];
  for (const col of missingCols) {
    try {
      await args.query(`ALTER TABLE "${safeTable}" ADD COLUMN ${col.name} ${col.sql}`);
      altered.push(col.name);
      args.log?.(`schema-heal: added "${args.tableName}"."${col.name}"`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/already exists/i.test(msg))
        throw e;
      const recheck = await args.query(introspectSql);
      const present = recheck.some((r) => {
        const v = r?.column_name;
        return typeof v === "string" && v.toLowerCase() === col.name.toLowerCase();
      });
      if (!present)
        throw e;
      args.log?.(`schema-heal: "${args.tableName}"."${col.name}" appeared via race, treating as success`);
    }
  }
  return { missing, altered };
}
function isMissingTableError(message) {
  if (!message)
    return false;
  if (/permission denied|must be owner/i.test(message))
    return false;
  if (/\bcolumn\b/i.test(message))
    return false;
  return /Table does not exist|relation .* does not exist|no such table/i.test(message);
}

// dist/src/notifications/queue.js
import { readFileSync as readFileSync13, writeFileSync as writeFileSync10, renameSync as renameSync3, mkdirSync as mkdirSync6, openSync, closeSync, unlinkSync as unlinkSync7, statSync as statSync2 } from "node:fs";
import { join as join18, resolve } from "node:path";
import { homedir as homedir9 } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
var log3 = (msg) => log2("notifications-queue", msg);
var LOCK_RETRY_MAX = 50;
var LOCK_RETRY_BASE_MS = 5;
var LOCK_STALE_MS = 5e3;
function queuePath() {
  return join18(homedir9(), ".deeplake", "notifications-queue.json");
}
function lockPath() {
  return `${queuePath()}.lock`;
}
function readQueue() {
  try {
    const raw = readFileSync13(queuePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.queue)) {
      log3(`queue malformed \u2192 treating as empty`);
      return { queue: [] };
    }
    return { queue: parsed.queue };
  } catch {
    return { queue: [] };
  }
}
function _isQueuePathInsideHome(path, home) {
  const r = resolve(path);
  const h = resolve(home);
  return r.startsWith(h + "/") || r === h;
}
function writeQueue(q) {
  const path = queuePath();
  const home = resolve(homedir9());
  if (!_isQueuePathInsideHome(path, home)) {
    throw new Error(`notifications-queue write blocked: ${path} is outside ${home}`);
  }
  mkdirSync6(join18(home, ".deeplake"), { recursive: true, mode: 448 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync10(tmp, JSON.stringify(q, null, 2), { mode: 384 });
  renameSync3(tmp, path);
}
async function withQueueLock(fn) {
  const path = lockPath();
  mkdirSync6(join18(homedir9(), ".deeplake"), { recursive: true, mode: 448 });
  let fd = null;
  for (let attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
    try {
      fd = openSync(path, "wx", 384);
      break;
    } catch (e) {
      const code = e.code;
      if (code !== "EEXIST")
        throw e;
      try {
        const age = Date.now() - statSync2(path).mtimeMs;
        if (age > LOCK_STALE_MS) {
          unlinkSync7(path);
          continue;
        }
      } catch {
      }
      const delay = LOCK_RETRY_BASE_MS * (attempt + 1);
      await sleep(delay);
    }
  }
  if (fd === null) {
    log3(`lock acquisition gave up after ${LOCK_RETRY_MAX} attempts \u2014 proceeding unlocked (last-writer-wins)`);
    return fn();
  }
  try {
    return fn();
  } finally {
    try {
      closeSync(fd);
    } catch {
    }
    try {
      unlinkSync7(path);
    } catch {
    }
  }
}
function sameDedupKey(a, b) {
  if (a.id !== b.id)
    return false;
  return JSON.stringify(a.dedupKey) === JSON.stringify(b.dedupKey);
}
async function enqueueNotification(n) {
  await withQueueLock(() => {
    const q = readQueue();
    if (q.queue.some((existing) => sameDedupKey(existing, n))) {
      return;
    }
    q.queue.push(n);
    writeQueue(q);
  });
}

// dist/src/deeplake-api.js
var indexMarkerStorePromise = null;
function getIndexMarkerStore() {
  if (!indexMarkerStorePromise)
    indexMarkerStorePromise = Promise.resolve().then(() => (init_index_marker_store(), index_marker_store_exports));
  return indexMarkerStorePromise;
}
var log4 = (msg) => log2("sdk", msg);
function summarizeSql(sql, maxLen = 220) {
  const compact = sql.replace(/\s+/g, " ").trim();
  return compact.length > maxLen ? `${compact.slice(0, maxLen)}...` : compact;
}
function traceSql(msg) {
  const traceEnabled = process.env.HIVEMIND_TRACE_SQL === "1" || process.env.HIVEMIND_DEBUG === "1";
  if (!traceEnabled)
    return;
  process.stderr.write(`[deeplake-sql] ${msg}
`);
  if (process.env.HIVEMIND_DEBUG === "1")
    log4(msg);
}
var _signalledBalanceExhausted = false;
function maybeSignalBalanceExhausted(status, bodyText) {
  if (status !== 402)
    return;
  if (!bodyText.includes("balance_cents"))
    return;
  if (_signalledBalanceExhausted)
    return;
  _signalledBalanceExhausted = true;
  log4(`balance exhausted \u2014 enqueuing session-start banner (body=${bodyText.slice(0, 120)})`);
  enqueueNotification({
    id: "balance-exhausted",
    severity: "warn",
    transient: true,
    title: "Hivemind credits exhausted \u2014 top up to keep capturing",
    body: `Sessions are not being saved and memory recall is returning empty. Top up at ${billingUrl()} to restore capture and recall.`,
    dedupKey: { reason: "balance-zero" },
    // User-facing billing notice → user channel only. Never the model's
    // additionalContext: a "top up at <url>" instruction in the agent prompt
    // is a prompt-injection pattern external agents flag.
    userVisibleOnly: true
  }).catch((e) => {
    log4(`enqueue balance-exhausted failed: ${e instanceof Error ? e.message : String(e)}`);
  });
}
function billingUrl() {
  try {
    const c = loadCredentials();
    if (c?.orgName && c?.workspaceId) {
      return `https://deeplake.ai/${encodeURIComponent(c.orgName)}/workspace/${encodeURIComponent(c.workspaceId)}/billing`;
    }
  } catch {
  }
  return "https://deeplake.ai";
}
var RETRYABLE_CODES = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
var MAX_RETRIES = 3;
var BASE_DELAY_MS = 500;
var MAX_CONCURRENCY = 5;
function getQueryTimeoutMs() {
  return Number(process.env.HIVEMIND_QUERY_TIMEOUT_MS ?? 1e4);
}
function sleep2(ms) {
  return new Promise((resolve6) => setTimeout(resolve6, ms));
}
function isTimeoutError(error) {
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return name.includes("timeout") || name === "aborterror" || message.includes("timeout") || message.includes("timed out");
}
function isDuplicateIndexError(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("duplicate key value violates unique constraint") || message.includes("pg_class_relname_nsp_index") || message.includes("already exists");
}
function isSessionInsertQuery(sql) {
  return /^\s*insert\s+into\s+"[^"]+"\s*\(\s*id\s*,\s*path\s*,\s*filename\s*,\s*message\s*,/i.test(sql);
}
function isTransientHtml403(text) {
  const body = text.toLowerCase();
  return body.includes("<html") || body.includes("403 forbidden") || body.includes("cloudflare") || body.includes("nginx");
}
var Semaphore = class {
  max;
  waiting = [];
  active = 0;
  constructor(max) {
    this.max = max;
  }
  async acquire() {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise((resolve6) => this.waiting.push(resolve6));
  }
  release() {
    this.active--;
    const next = this.waiting.shift();
    if (next) {
      this.active++;
      next();
    }
  }
};
var DeeplakeApi = class {
  token;
  apiUrl;
  orgId;
  workspaceId;
  tableName;
  _pendingRows = [];
  _sem = new Semaphore(MAX_CONCURRENCY);
  _tablesCache = null;
  constructor(token, apiUrl, orgId, workspaceId, tableName) {
    this.token = token;
    this.apiUrl = apiUrl;
    this.orgId = orgId;
    this.workspaceId = workspaceId;
    this.tableName = tableName;
  }
  /** Execute SQL with retry on transient errors and bounded concurrency. */
  async query(sql) {
    const startedAt = Date.now();
    const summary = summarizeSql(sql);
    traceSql(`query start: ${summary}`);
    await this._sem.acquire();
    try {
      const rows = await this._queryWithRetry(sql);
      traceSql(`query ok (${Date.now() - startedAt}ms, rows=${rows.length}): ${summary}`);
      return rows;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      traceSql(`query fail (${Date.now() - startedAt}ms): ${summary} :: ${message}`);
      throw e;
    } finally {
      this._sem.release();
    }
  }
  async _queryWithRetry(sql) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let resp;
      const timeoutMs = getQueryTimeoutMs();
      try {
        const signal = AbortSignal.timeout(timeoutMs);
        resp = await fetch(`${this.apiUrl}/workspaces/${this.workspaceId}/tables/query`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            "X-Activeloop-Org-Id": this.orgId,
            ...deeplakeClientHeader()
          },
          signal,
          body: JSON.stringify({ query: sql })
        });
      } catch (e) {
        if (isTimeoutError(e)) {
          lastError = new Error(`Query timeout after ${timeoutMs}ms`);
          throw lastError;
        }
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
          log4(`query retry ${attempt + 1}/${MAX_RETRIES} (fetch error: ${lastError.message}) in ${delay.toFixed(0)}ms`);
          await sleep2(delay);
          continue;
        }
        throw lastError;
      }
      if (resp.ok) {
        const raw = await resp.json();
        if (!raw?.rows || !raw?.columns)
          return [];
        return raw.rows.map((row) => Object.fromEntries(raw.columns.map((col, i) => [col, row[i]])));
      }
      const text = await resp.text().catch(() => "");
      const retryable403 = isSessionInsertQuery(sql) && (resp.status === 401 || resp.status === 403 && (text.length === 0 || isTransientHtml403(text)));
      const alreadyExists = resp.status === 500 && isDuplicateIndexError(text);
      if (!alreadyExists && attempt < MAX_RETRIES && (RETRYABLE_CODES.has(resp.status) || retryable403)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
        log4(`query retry ${attempt + 1}/${MAX_RETRIES} (${resp.status}) in ${delay.toFixed(0)}ms`);
        await sleep2(delay);
        continue;
      }
      maybeSignalBalanceExhausted(resp.status, text);
      throw new Error(`Query failed: ${resp.status}: ${text.slice(0, 200)}`);
    }
    throw lastError ?? new Error("Query failed: max retries exceeded");
  }
  // ── Writes ──────────────────────────────────────────────────────────────────
  /** Queue rows for writing. Call commit() to flush. */
  appendRows(rows) {
    this._pendingRows.push(...rows);
  }
  /** Flush pending rows via SQL. */
  async commit() {
    if (this._pendingRows.length === 0)
      return;
    const rows = this._pendingRows;
    this._pendingRows = [];
    const CONCURRENCY = 10;
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const chunk = rows.slice(i, i + CONCURRENCY);
      await Promise.allSettled(chunk.map((r) => this.upsertRowSql(r)));
    }
    log4(`commit: ${rows.length} rows`);
  }
  async upsertRowSql(row) {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    const cd = row.creationDate ?? ts;
    const lud = row.lastUpdateDate ?? ts;
    const exists = await this.query(`SELECT path FROM "${this.tableName}" WHERE path = '${sqlStr(row.path)}' LIMIT 1`);
    if (exists.length > 0) {
      let setClauses = `summary = E'${sqlStr(row.contentText)}', ${SUMMARY_EMBEDDING_COL} = NULL, mime_type = '${sqlStr(row.mimeType)}', size_bytes = ${row.sizeBytes}, last_update_date = '${lud}'`;
      if (row.project !== void 0)
        setClauses += `, project = '${sqlStr(row.project)}'`;
      if (row.description !== void 0)
        setClauses += `, description = '${sqlStr(row.description)}'`;
      await this.query(`UPDATE "${this.tableName}" SET ${setClauses} WHERE path = '${sqlStr(row.path)}'`);
    } else {
      const id = randomUUID2();
      let cols = `id, path, filename, summary, ${SUMMARY_EMBEDDING_COL}, mime_type, size_bytes, creation_date, last_update_date`;
      let vals = `'${id}', '${sqlStr(row.path)}', '${sqlStr(row.filename)}', E'${sqlStr(row.contentText)}', NULL, '${sqlStr(row.mimeType)}', ${row.sizeBytes}, '${cd}', '${lud}'`;
      if (row.project !== void 0) {
        cols += ", project";
        vals += `, '${sqlStr(row.project)}'`;
      }
      if (row.description !== void 0) {
        cols += ", description";
        vals += `, '${sqlStr(row.description)}'`;
      }
      await this.query(`INSERT INTO "${this.tableName}" (${cols}) VALUES (${vals})`);
    }
  }
  /** Update specific columns on a row by path. */
  async updateColumns(path, columns) {
    const setClauses = Object.entries(columns).map(([col, val]) => typeof val === "number" ? `${col} = ${val}` : `${col} = '${sqlStr(String(val))}'`).join(", ");
    await this.query(`UPDATE "${this.tableName}" SET ${setClauses} WHERE path = '${sqlStr(path)}'`);
  }
  // ── Convenience ─────────────────────────────────────────────────────────────
  /** Create a BM25 search index on a column. */
  async createIndex(column) {
    await this.query(`CREATE INDEX IF NOT EXISTS idx_${sqlStr(column)}_bm25 ON "${this.tableName}" USING deeplake_index ("${column}")`);
  }
  buildLookupIndexName(table, suffix) {
    return `idx_${table}_${suffix}`.replace(/[^a-zA-Z0-9_]/g, "_");
  }
  async ensureLookupIndex(table, suffix, columnsSql) {
    const markers = await getIndexMarkerStore();
    const markerPath = markers.buildIndexMarkerPath(this.workspaceId, this.orgId, table, suffix);
    if (markers.hasFreshIndexMarker(markerPath))
      return;
    const indexName = this.buildLookupIndexName(table, suffix);
    try {
      await this.query(`CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}" ${columnsSql}`);
      markers.writeIndexMarker(markerPath);
    } catch (e) {
      if (isDuplicateIndexError(e)) {
        markers.writeIndexMarker(markerPath);
        return;
      }
      log4(`index "${indexName}" skipped: ${e.message}`);
    }
  }
  /**
   * Heal any missing columns on a table so it matches one of the schema
   * definitions in `deeplake-schema.ts`. One SELECT against
   * `information_schema.columns` per call, then `ALTER TABLE ADD COLUMN`
   * only the genuinely missing ones — never blanket, never `IF NOT
   * EXISTS`.
   *
   * History: an earlier path used a local marker file (`col_<name>` under
   * the index-marker dir) to skip even the SELECT after the first
   * confirmation, plus per-column ALTERs for `summary_embedding`,
   * `message_embedding`, `agent`, `plugin_version`. The marker existed
   * because Deeplake used to expose a ~30s post-ALTER bug where
   * subsequent INSERTs failed, so we wanted to keep ALTER traffic to a
   * minimum. The bug was re-verified on 2026-05-18 against
   * `api.deeplake.ai` (`test_plugin` org) and no longer reproduces
   * (71/71 INSERTs OK, first success 2ms after ALTER). The single SELECT
   * + targeted ALTER pattern survives the marker removal because: each
   * ALTER still costs ~800ms (so blanket sweeps are wasteful) and the
   * diff produces clearer logs than "ALTER all with IF NOT EXISTS".
   */
  async healSchema(table, columns) {
    await healMissingColumns({
      query: (sql) => this.query(sql),
      tableName: table,
      workspaceId: this.workspaceId,
      columns,
      log: log4
    });
  }
  /** List all tables in the workspace (with retry). */
  async listTables(forceRefresh = false) {
    if (!forceRefresh && this._tablesCache)
      return [...this._tablesCache];
    const { tables, cacheable } = await this._fetchTables();
    if (cacheable)
      this._tablesCache = [...tables];
    return tables;
  }
  /**
   * Like listTables() but returns null when the list could NOT be trusted
   * (the fetch failed / was non-cacheable). Callers gating a read on table
   * existence use this to tell a genuinely-empty workspace ([]) apart from a
   * failed lookup (null): on [] they can safely skip the read (no table → no
   * 42P01), on null they must fall back to SELECT-then-catch so a transient
   * lookup blip doesn't drop a read of a table that really exists.
   */
  async knownTablesOrNull() {
    if (this._tablesCache)
      return [...this._tablesCache];
    const { tables, cacheable } = await this._fetchTables();
    if (!cacheable)
      return null;
    this._tablesCache = [...tables];
    return [...tables];
  }
  async _fetchTables() {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const resp = await fetch(`${this.apiUrl}/workspaces/${this.workspaceId}/tables`, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            "X-Activeloop-Org-Id": this.orgId,
            ...deeplakeClientHeader()
          }
        });
        if (resp.ok) {
          const data = await resp.json();
          return {
            tables: (data.tables ?? []).map((t) => t.table_name),
            cacheable: true
          };
        }
        if (attempt < MAX_RETRIES && RETRYABLE_CODES.has(resp.status)) {
          await sleep2(BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200);
          continue;
        }
        return { tables: [], cacheable: false };
      } catch {
        if (attempt < MAX_RETRIES) {
          await sleep2(BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
        return { tables: [], cacheable: false };
      }
    }
    return { tables: [], cacheable: false };
  }
  /**
   * Run a `CREATE TABLE` with an extra outer retry budget. The base
   * `query()` already retries 3 times on fetch errors (~3.5s total), but a
   * failed CREATE is permanent corruption — every subsequent SELECT against
   * the missing table fails. Wrapping in an outer loop with longer backoff
   * (2s, 5s, then 10s) gives us ~17s of reach across transient network
   * blips before giving up. Failures still propagate; getApi() resets its
   * cache on init failure (openclaw plugin) so the next call retries the
   * whole init flow.
   */
  async createTableWithRetry(sql, label) {
    const OUTER_BACKOFFS_MS = [2e3, 5e3, 1e4];
    let lastErr = null;
    for (let attempt = 0; attempt <= OUTER_BACKOFFS_MS.length; attempt++) {
      try {
        await this.query(sql);
        return;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        log4(`CREATE TABLE "${label}" attempt ${attempt + 1}/${OUTER_BACKOFFS_MS.length + 1} failed: ${msg}`);
        if (attempt < OUTER_BACKOFFS_MS.length) {
          await sleep2(OUTER_BACKOFFS_MS[attempt]);
        }
      }
    }
    throw lastErr;
  }
  /** Create the memory table if it doesn't already exist. Heal missing columns on existing tables. */
  async ensureTable(name) {
    if (!MEMORY_COLUMNS.some((c) => c.name === SUMMARY_EMBEDDING_COL)) {
      throw new Error(`MEMORY_COLUMNS missing "${SUMMARY_EMBEDDING_COL}" (embeddings/columns.ts drift)`);
    }
    const tbl = sqlIdent(name ?? this.tableName);
    const tables = await this.listTables();
    if (!tables.includes(tbl)) {
      log4(`table "${tbl}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(tbl, MEMORY_COLUMNS), tbl);
      log4(`table "${tbl}" created`);
      if (!tables.includes(tbl))
        this._tablesCache = [...tables, tbl];
    }
    await this.healSchema(tbl, MEMORY_COLUMNS);
  }
  /** Create the sessions table (uses JSONB for message since every row is a JSON event). */
  async ensureSessionsTable(name) {
    const safe = sqlIdent(name);
    const tables = await this.listTables();
    if (!tables.includes(safe)) {
      log4(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, SESSIONS_COLUMNS), safe);
      log4(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, SESSIONS_COLUMNS);
    await this.ensureLookupIndex(safe, "path_creation_date", `("path", "creation_date")`);
  }
  /**
   * Create the skills table.
   *
   * One row per skill version. Workers INSERT a fresh row on every KEEP /
   * MERGE rather than UPDATE-ing in place, so the full version history is
   * recoverable. Uniqueness in the *current* state is by (project_key, name)
   * — newer rows shadow older ones at read time (ORDER BY version DESC).
   * This sidesteps the Deeplake UPDATE-coalescing quirk that bit the wiki
   * worker.
   */
  /**
   * Create the codebase table. One row per (org, workspace, repo, user,
   * worktree, commit) — see CODEBASE_COLUMNS for the schema. Healing
   * + index follow the same pattern as ensureSessionsTable.
   */
  async ensureCodebaseTable(name) {
    const safe = sqlIdent(name);
    const tables = await this.listTables();
    if (!tables.includes(safe)) {
      log4(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, CODEBASE_COLUMNS), safe);
      log4(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, CODEBASE_COLUMNS);
    await this.ensureLookupIndex(safe, "codebase_identity", `("org_id", "workspace_id", "repo_slug", "user_id", "worktree_id", "commit_sha")`);
  }
  async ensureSkillsTable(name) {
    const safe = sqlIdent(name);
    const tables = await this.listTables();
    if (!tables.includes(safe)) {
      log4(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, SKILLS_COLUMNS), safe);
      log4(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, SKILLS_COLUMNS);
    await this.ensureLookupIndex(safe, "project_key_name", `("project_key", "name")`);
  }
  /**
   * Create the rules table.
   *
   * One row per rule version (same write pattern as skills): edits INSERT
   * a fresh row with version+1, reads pick latest per rule_id via
   * `ORDER BY version DESC LIMIT 1`. Sidesteps the Deeplake
   * UPDATE-coalescing quirk by never UPDATEing.
   */
  async ensureRulesTable(name) {
    const safe = sqlIdent(name);
    const tables = await this.listTables();
    if (!tables.includes(safe)) {
      log4(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, RULES_COLUMNS), safe);
      log4(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, RULES_COLUMNS);
    await this.ensureLookupIndex(safe, "rule_id_version", `("rule_id", "version")`);
  }
  /**
   * Create the goals table.
   *
   * Backed by the VFS path convention memory/goal/<owner>/<status>/<goal_id>.md.
   * INSERT-only version-bumped: rm and mv operations translate to fresh
   * v=N+1 rows (status flips for mv → closed; rm is the same soft-close).
   * The (goal_id, version) index lets the VFS dispatch a cheap latest-row
   * read on cat / Read of a single goal.
   */
  async ensureGoalsTable(name) {
    const safe = sqlIdent(name);
    const tables = await this.listTables();
    if (!tables.includes(safe)) {
      log4(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, GOALS_COLUMNS), safe);
      log4(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, GOALS_COLUMNS);
    await this.ensureLookupIndex(safe, "goal_id_version", `("goal_id", "version")`);
    await this.ensureLookupIndex(safe, "owner_status", `("owner", "status")`);
  }
  /**
   * Create the kpis table.
   *
   * Backed by memory/kpi/<goal_id>/<kpi_id>.md. KPI rows do NOT carry
   * owner — ownership derives from the parent goal via logical join on
   * goal_id. INSERT-only version-bumped. (goal_id, kpi_id) index is the
   * canonical lookup the VFS uses on Read and Write.
   */
  async ensureKpisTable(name) {
    const safe = sqlIdent(name);
    const tables = await this.listTables();
    if (!tables.includes(safe)) {
      log4(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, KPIS_COLUMNS), safe);
      log4(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, KPIS_COLUMNS);
    await this.ensureLookupIndex(safe, "goal_id_kpi_id", `("goal_id", "kpi_id")`);
  }
};

// dist/src/commands/session-prune.js
function parseArgs(argv) {
  let before;
  let sessionId;
  let all = false;
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--before" && argv[i + 1]) {
      before = argv[++i];
    } else if (arg === "--session-id" && argv[i + 1]) {
      sessionId = argv[++i];
    } else if (arg === "--all") {
      all = true;
    } else if (arg === "--yes" || arg === "-y") {
      yes = true;
    }
  }
  return { before, sessionId, all, yes };
}
function extractSessionId(path) {
  const m = path.match(/\/sessions\/[^/]+\/[^/]+_([^.]+)\.jsonl$/);
  return m ? m[1] : path.split("/").pop()?.replace(/\.jsonl$/, "") ?? path;
}
async function listSessions(api, sessionsTable, author) {
  const rows = await api.query(`SELECT path, COUNT(*) as cnt, MIN(creation_date) as first_event, MAX(creation_date) as last_event, MAX(project) as project FROM "${sessionsTable}" WHERE author = '${sqlStr(author)}' GROUP BY path ORDER BY first_event DESC`);
  return rows.map((r) => ({
    path: String(r.path),
    rowCount: Number(r.cnt),
    firstEvent: String(r.first_event),
    lastEvent: String(r.last_event),
    project: String(r.project ?? "")
  }));
}
async function deleteSessions(config, sessionPaths) {
  if (sessionPaths.length === 0)
    return { sessionsDeleted: 0, summariesDeleted: 0 };
  const sessionsApi = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.sessionsTableName);
  const memoryApi = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
  let sessionsDeleted = 0;
  let summariesDeleted = 0;
  for (const sessionPath of sessionPaths) {
    await sessionsApi.query(`DELETE FROM "${config.sessionsTableName}" WHERE path = '${sqlStr(sessionPath)}'`);
    sessionsDeleted++;
    const sessionId = extractSessionId(sessionPath);
    const summaryPath = `/summaries/${config.userName}/${sessionId}.md`;
    const existing = await memoryApi.query(`SELECT path FROM "${config.tableName}" WHERE path = '${sqlStr(summaryPath)}' LIMIT 1`);
    if (existing.length > 0) {
      await memoryApi.query(`DELETE FROM "${config.tableName}" WHERE path = '${sqlStr(summaryPath)}'`);
      summariesDeleted++;
    }
  }
  return { sessionsDeleted, summariesDeleted };
}
async function sessionPrune(argv) {
  const config = loadConfig();
  if (!config) {
    console.error("Not logged in. Run: deeplake login");
    process.exit(1);
  }
  const { before, sessionId, all, yes } = parseArgs(argv);
  const author = config.userName;
  const sessionsApi = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.sessionsTableName);
  const sessions = await listSessions(sessionsApi, config.sessionsTableName, author);
  if (sessions.length === 0) {
    console.log(`No sessions found for author "${author}".`);
    return;
  }
  let targets;
  if (sessionId) {
    targets = sessions.filter((s) => extractSessionId(s.path) === sessionId);
    if (targets.length === 0) {
      console.error(`Session not found: ${sessionId}`);
      console.error(`
Your sessions:`);
      for (const s of sessions.slice(0, 10)) {
        console.error(`  ${extractSessionId(s.path)}  ${s.firstEvent.slice(0, 10)}  ${s.project}`);
      }
      process.exit(1);
    }
  } else if (before) {
    const cutoff = new Date(before);
    if (isNaN(cutoff.getTime())) {
      console.error(`Invalid date: ${before}`);
      process.exit(1);
    }
    targets = sessions.filter((s) => new Date(s.lastEvent) < cutoff);
  } else if (all) {
    targets = sessions;
  } else {
    console.log(`Sessions for "${author}" (${sessions.length} total):
`);
    console.log("  Session ID".padEnd(42) + "Date".padEnd(14) + "Events".padEnd(10) + "Project");
    console.log("  " + "\u2500".repeat(80));
    for (const s of sessions) {
      const id = extractSessionId(s.path);
      const date = s.firstEvent.slice(0, 10);
      console.log(`  ${id.padEnd(40)}${date.padEnd(14)}${String(s.rowCount).padEnd(10)}${s.project}`);
    }
    console.log(`
To delete, use: --all, --before <date>, or --session-id <id>`);
    return;
  }
  if (targets.length === 0) {
    console.log("No sessions match the given criteria.");
    return;
  }
  console.log(`Will delete ${targets.length} session(s) for "${author}":
`);
  for (const s of targets) {
    const id = extractSessionId(s.path);
    console.log(`  ${id}  ${s.firstEvent.slice(0, 10)}  ${s.rowCount} events  ${s.project}`);
  }
  console.log();
  if (!yes) {
    const ok = await confirm("Proceed with deletion?", false);
    if (!ok) {
      console.log("Aborted.");
      return;
    }
  }
  const { sessionsDeleted, summariesDeleted } = await deleteSessions(config, targets.map((t) => t.path));
  console.log(`Deleted ${sessionsDeleted} session(s) and ${summariesDeleted} summary file(s).`);
}

// dist/src/commands/auth-login.js
async function runAuthCommand(args) {
  const cmd = args[0] ?? "whoami";
  const creds = loadCredentials();
  const apiUrl = creds?.apiUrl ?? "https://api.deeplake.ai";
  switch (cmd) {
    case "login": {
      await login(apiUrl);
      break;
    }
    case "whoami": {
      if (!creds) {
        console.log("Not logged in. Run: hivemind login");
        break;
      }
      console.log(`User org: ${creds.orgName ?? creds.orgId}`);
      console.log(`Workspace: ${creds.workspaceId ?? "default"}`);
      console.log(`API: ${creds.apiUrl ?? "https://api.deeplake.ai"}`);
      break;
    }
    case "org": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const sub = args[1];
      if (sub === "list") {
        const orgs = await listOrgs(creds.token, apiUrl);
        orgs.forEach((o) => console.log(`${o.id}  ${o.name}`));
      } else if (sub === "switch") {
        const target = args[2];
        if (!target) {
          console.log("Usage: org switch <org-name-or-id>");
          process.exit(1);
        }
        const orgs = await listOrgs(creds.token, apiUrl);
        const match = orgs.find((o) => o.id === target || o.name.toLowerCase() === target.toLowerCase());
        if (!match) {
          console.log(`Org not found: ${target}`);
          process.exit(1);
        }
        const prevWs = creds.workspaceId ?? "default";
        const lcPrev = prevWs.toLowerCase();
        const wsList = await listWorkspaces(creds.token, apiUrl, match.id);
        const matchedWs = wsList.find((w) => w.id === prevWs || w.name && w.name.toLowerCase() === lcPrev);
        await switchOrg(match.id, match.name);
        console.log(`Switched to org: ${match.name}`);
        if (!matchedWs) {
          if (prevWs !== "default") {
            await switchWorkspace("default");
            console.log(`Workspace '${prevWs}' is not in org '${match.name}'. Reset workspace to 'default'.`);
            if (wsList.length > 0) {
              console.log(`Available workspaces: ${wsList.map((w) => w.name || w.id).join(", ")}`);
            }
          }
        } else if (matchedWs.id !== prevWs) {
          await switchWorkspace(matchedWs.id);
          console.log(`Workspace name '${prevWs}' resolved to id '${matchedWs.id}' in org '${match.name}'.`);
        }
      } else {
        console.log("Usage: org list | org switch <name-or-id>");
      }
      break;
    }
    case "workspaces": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const ws = await listWorkspaces(creds.token, apiUrl, creds.orgId);
      ws.forEach((w) => console.log(w.name || w.id));
      break;
    }
    case "workspace": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const sub = args[1];
      if (sub === "list") {
        const wsList = await listWorkspaces(creds.token, apiUrl, creds.orgId);
        wsList.forEach((w) => console.log(w.name || w.id));
        break;
      }
      if (sub === "switch") {
        const target = args[2];
        if (!target) {
          console.log("Usage: workspace switch <name-or-id>");
          process.exit(1);
        }
        const wsList = await listWorkspaces(creds.token, apiUrl, creds.orgId);
        const lcTarget = target.toLowerCase();
        const match = wsList.find((w) => w.id === target || w.name && w.name.toLowerCase() === lcTarget);
        if (!match) {
          console.log(`Workspace not found: ${target}`);
          if (wsList.length > 0) {
            console.log(`Available workspaces: ${wsList.map((w) => w.name || w.id).join(", ")}`);
          }
          process.exit(1);
        }
        await switchWorkspace(match.id);
        console.log(`Switched to workspace: ${match.name || match.id}`);
        break;
      }
      console.log("Usage: workspace list | workspace switch <name-or-id>");
      process.exit(1);
    }
    case "invite": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const email = args[1];
      const mode = args[2]?.toUpperCase() ?? "WRITE";
      if (!email) {
        console.log("Usage: invite <email> [ADMIN|WRITE|READ]");
        process.exit(1);
      }
      await inviteMember(email, mode, creds.token, creds.orgId, apiUrl);
      console.log(`Invited ${email} with ${mode} access`);
      break;
    }
    case "members": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const members = await listMembers(creds.token, creds.orgId, apiUrl);
      members.forEach((m) => console.log(`${m.role.padEnd(8)} ${m.email ?? m.name}`));
      break;
    }
    case "remove": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const userId = args[1];
      if (!userId) {
        console.log("Usage: remove <user-id>");
        process.exit(1);
      }
      await removeMember(userId, creds.token, creds.orgId, apiUrl);
      console.log(`Removed user ${userId}`);
      break;
    }
    case "sessions": {
      const sub = args[1];
      if (sub === "prune") {
        await sessionPrune(args.slice(2));
      } else {
        console.log("Usage: sessions prune [--all | --before <date> | --session-id <id>] [--yes]");
      }
      break;
    }
    case "autoupdate": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const val = args[1]?.toLowerCase();
      if (val === "on" || val === "true") {
        saveCredentials({ ...creds, autoupdate: true });
        console.log("Autoupdate enabled. Plugin will update automatically on session start.");
      } else if (val === "off" || val === "false") {
        saveCredentials({ ...creds, autoupdate: false });
        console.log("Autoupdate disabled. You'll see a notice when updates are available.");
      } else {
        const current = creds.autoupdate !== false ? "on" : "off";
        console.log(`Autoupdate is currently: ${current}`);
        console.log("Usage: autoupdate [on|off]");
      }
      break;
    }
    case "logout": {
      if (deleteCredentials()) {
        console.log("Logged out. Credentials removed.");
      } else {
        console.log("Not logged in.");
      }
      break;
    }
    default:
      console.log("Commands: login, logout, whoami, org list, org switch, workspaces, workspace, sessions prune, invite, members, remove, autoupdate");
  }
}
if (process.argv[1] && process.argv[1].endsWith("auth-login.js")) {
  runAuthCommand(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

// dist/src/commands/graph.js
import { execSync as execSync3 } from "node:child_process";
import { readFileSync as readFileSync21, readdirSync as readdirSync2 } from "node:fs";
import { join as join28, relative, resolve as resolve4, sep } from "node:path";
import { createHash as createHash6 } from "node:crypto";

// dist/src/graph/cache.js
import { createHash } from "node:crypto";
import { existsSync as existsSync15, mkdirSync as mkdirSync8, readFileSync as readFileSync15, renameSync as renameSync4, writeFileSync as writeFileSync12 } from "node:fs";
import { dirname as dirname4, join as join20 } from "node:path";
var CACHE_SCHEMA_VERSION = 1;
function fileContentHash(contents) {
  return createHash("sha256").update(contents).digest("hex");
}
function cacheDir(baseDir) {
  return join20(baseDir, ".cache");
}
function cachePath(baseDir, contentSha256) {
  return join20(cacheDir(baseDir), `${contentSha256}.json`);
}
function readCache(baseDir, contentSha256, relativePath) {
  const path = cachePath(baseDir, contentSha256);
  if (!existsSync15(path))
    return null;
  let raw;
  try {
    raw = readFileSync15(path, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || parsed.schema !== CACHE_SCHEMA_VERSION || parsed.content_sha256 !== contentSha256) {
    return null;
  }
  const cached = parsed.extraction;
  if (cached === void 0 || typeof cached !== "object" || !Array.isArray(cached.nodes) || !Array.isArray(cached.edges) || !Array.isArray(cached.parse_errors)) {
    return null;
  }
  if (!validateItems(cached)) {
    return null;
  }
  try {
    return rewriteSourceFile(cached, relativePath);
  } catch {
    return null;
  }
}
function validateItems(ex) {
  if (typeof ex.source_file !== "string")
    return false;
  if (typeof ex.language !== "string")
    return false;
  for (const n of ex.nodes) {
    if (n === null || typeof n !== "object")
      return false;
    if (typeof n.id !== "string")
      return false;
    if (typeof n.label !== "string")
      return false;
    if (typeof n.kind !== "string")
      return false;
    if (typeof n.source_file !== "string")
      return false;
    if (typeof n.source_location !== "string")
      return false;
    if (typeof n.language !== "string")
      return false;
    if (typeof n.exported !== "boolean")
      return false;
  }
  for (const e of ex.edges) {
    if (e === null || typeof e !== "object")
      return false;
    if (typeof e.source !== "string")
      return false;
    if (typeof e.target !== "string")
      return false;
    if (typeof e.relation !== "string")
      return false;
    if (typeof e.confidence !== "string")
      return false;
    if (e.ord !== void 0 && typeof e.ord !== "number")
      return false;
  }
  for (const p of ex.parse_errors) {
    if (p === null || typeof p !== "object")
      return false;
    if (typeof p.source_file !== "string")
      return false;
    if (typeof p.message !== "string")
      return false;
    if (p.location !== void 0 && typeof p.location !== "string")
      return false;
  }
  return true;
}
function writeCache(baseDir, contentSha256, extraction) {
  const entry = {
    schema: CACHE_SCHEMA_VERSION,
    content_sha256: contentSha256,
    extraction
  };
  const path = cachePath(baseDir, contentSha256);
  try {
    mkdirSync8(dirname4(path), { recursive: true });
    const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync12(tmp, JSON.stringify(entry));
    renameSync4(tmp, path);
  } catch {
  }
}
function rewriteSourceFile(cached, newPath) {
  const oldPath = cached.source_file;
  if (oldPath === newPath) {
    return cached;
  }
  const swap = (id) => {
    if (id.startsWith(`${oldPath}:`))
      return `${newPath}${id.slice(oldPath.length)}`;
    if (id.startsWith(`unresolved:${oldPath}:`)) {
      return `unresolved:${newPath}${id.slice(`unresolved:${oldPath}`.length)}`;
    }
    return id;
  };
  return {
    source_file: newPath,
    language: cached.language,
    // The synthetic module node uses source_file as its `label` (see
    // makeModuleNode in the extractor). On a cache hit after a rename/copy
    // we already rewrite `id` + `source_file`, but were leaving `label`
    // pointing at the OLD path — the snapshot then disagreed with a
    // fresh (non-cached) extraction. Rewrite `label` for module nodes too.
    // CodeRabbit P1.
    nodes: cached.nodes.map((n) => ({
      ...n,
      id: swap(n.id),
      label: n.kind === "module" ? newPath : n.label,
      source_file: newPath
    })),
    edges: cached.edges.map((e) => ({ ...e, source: swap(e.source), target: swap(e.target) })),
    parse_errors: cached.parse_errors.map((p) => ({ ...p, source_file: newPath }))
  };
}

// dist/src/graph/deeplake-push.js
import { createHash as createHash2 } from "node:crypto";
async function pushSnapshot(snapshot, worktreeId, deps = {}) {
  if (process.env.HIVEMIND_GRAPH_PUSH === "0") {
    return { kind: "skipped-disabled" };
  }
  const config = (deps.loadConfig ?? loadConfig)();
  if (config === null) {
    return { kind: "skipped-no-auth" };
  }
  const commitSha = snapshot.graph.commit_sha;
  if (commitSha === null) {
    return { kind: "skipped-no-commit" };
  }
  const api = (deps.makeApi ?? defaultMakeApi)(config);
  try {
    await api.ensureCodebaseTable(config.codebaseTableName);
  } catch (err) {
    return errorOutcome("ensureCodebaseTable", err);
  }
  const snapshotSha256 = computeSnapshotSha256(snapshot);
  const tableId = sqlIdent(config.codebaseTableName);
  const repoSlug = snapshot.graph.repo_key;
  const userId = config.userName;
  const selectSql = `SELECT snapshot_sha256 FROM "${tableId}" WHERE org_id = '${sqlStr(config.orgId)}' AND workspace_id = '${sqlStr(config.workspaceId)}' AND repo_slug = '${sqlStr(repoSlug)}' AND user_id = '${sqlStr(userId)}' AND worktree_id = '${sqlStr(worktreeId)}' AND commit_sha = '${sqlStr(commitSha)}'`;
  let existing;
  try {
    existing = await api.query(selectSql);
  } catch (err) {
    return errorOutcome("SELECT existing", err);
  }
  if (existing.length > 0) {
    const cloudSha = String(existing[0].snapshot_sha256 ?? "");
    if (cloudSha === snapshotSha256) {
      return { kind: "already-current", commitSha };
    }
    return {
      kind: "drift",
      commitSha,
      localSha256: snapshotSha256,
      cloudSha256: cloudSha
    };
  }
  const canonical = canonicalJSON(snapshot);
  const observation = snapshot.observation;
  const insertSql = `INSERT INTO "${tableId}" (org_id, workspace_id, repo_slug, user_id, worktree_id, commit_sha, parent_sha, branch, ts, pushed_by, snapshot_sha256, snapshot_jsonb, node_count, edge_count, generator, generator_version, schema_version) VALUES ('${sqlStr(config.orgId)}', '${sqlStr(config.workspaceId)}', '${sqlStr(repoSlug)}', '${sqlStr(userId)}', '${sqlStr(worktreeId)}', '${sqlStr(commitSha)}', '', '${sqlStr(observation.branch ?? "")}', '${sqlStr(observation.ts)}', '${sqlStr(userId)}', '${sqlStr(snapshotSha256)}', '${sqlStr(canonical)}', ${snapshot.nodes.length}, ${snapshot.links.length}, '${sqlStr(snapshot.graph.generator)}', '${sqlStr(observation.generator_version)}', ${snapshot.graph.schema_version})`;
  try {
    await api.query(insertSql);
  } catch (err) {
    return errorOutcome("INSERT", err);
  }
  try {
    const verify = await api.query(selectSql);
    if (verify.length > 1) {
      return { kind: "inserted-with-duplicate-race", commitSha, rowCount: verify.length };
    }
  } catch {
  }
  return { kind: "inserted", commitSha };
}
function defaultMakeApi(config) {
  return new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
}
function errorOutcome(stage, err) {
  const message = err instanceof Error ? err.message : String(err);
  return { kind: "error", message: `${stage}: ${message}` };
}
function computeSnapshotSha256(snapshot) {
  const stable = {
    directed: snapshot.directed,
    multigraph: snapshot.multigraph,
    graph: snapshot.graph,
    nodes: snapshot.nodes,
    links: snapshot.links
  };
  return createHash2("sha256").update(canonicalJSON(stable)).digest("hex");
}
function canonicalJSON(value) {
  return JSON.stringify(value, (_key, v) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const sorted = {};
      for (const k of Object.keys(v).sort()) {
        sorted[k] = v[k];
      }
      return sorted;
    }
    return v;
  });
}

// dist/src/graph/deeplake-pull.js
import { execFileSync as execFileSync4 } from "node:child_process";
import { createHash as createHash5 } from "node:crypto";
import { existsSync as existsSync18, mkdirSync as mkdirSync12, renameSync as renameSync7, writeFileSync as writeFileSync15 } from "node:fs";
import { dirname as dirname8, join as join24 } from "node:path";

// dist/src/utils/repo-identity.js
import { execSync as execSync2 } from "node:child_process";
import { createHash as createHash3 } from "node:crypto";
import { basename, resolve as resolve2 } from "node:path";
var DEFAULT_PORTS = {
  http: "80",
  https: "443",
  ssh: "22",
  git: "9418"
};
function normalizeGitRemoteUrl(url) {
  let s = url.trim();
  const schemeMatch = s.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : null;
  if (schemeMatch)
    s = s.slice(schemeMatch[0].length);
  if (!scheme) {
    const scp = s.match(/^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/);
    if (scp)
      s = `${scp[1]}/${scp[2]}`;
  }
  s = s.replace(/^[^@/]+@/, "");
  if (scheme && DEFAULT_PORTS[scheme]) {
    s = s.replace(new RegExp(`^([^/]+):${DEFAULT_PORTS[scheme]}(/|$)`), "$1$2");
  }
  s = s.replace(/\.git\/?$/i, "");
  s = s.replace(/\/+$/, "");
  return s.toLowerCase();
}
function deriveProjectKey(cwd) {
  const absCwd = resolve2(cwd);
  const project = basename(absCwd) || "unknown";
  let signature = null;
  try {
    const raw = execSync2("git config --get remote.origin.url", {
      cwd: absCwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    signature = raw ? normalizeGitRemoteUrl(raw) : null;
  } catch {
  }
  const input = signature ?? absCwd;
  const key = createHash3("sha1").update(input).digest("hex").slice(0, 16);
  return { key, project };
}

// dist/src/graph/last-build.js
import { existsSync as existsSync16, mkdirSync as mkdirSync9, readFileSync as readFileSync16, renameSync as renameSync5, writeFileSync as writeFileSync13 } from "node:fs";
import { dirname as dirname5, join as join21 } from "node:path";
function lastBuildPath(baseDir, worktreeId) {
  if (worktreeId !== void 0) {
    return join21(baseDir, "worktrees", worktreeId, ".last-build.json");
  }
  return join21(baseDir, ".last-build.json");
}
function writeLastBuild(baseDir, state, worktreeId) {
  const path = lastBuildPath(baseDir, worktreeId);
  try {
    mkdirSync9(dirname5(path), { recursive: true });
    const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync13(tmp, JSON.stringify(state));
    renameSync5(tmp, path);
  } catch {
  }
}
function readLastBuild(baseDir, worktreeId) {
  let path = lastBuildPath(baseDir, worktreeId);
  if (!existsSync16(path)) {
    if (worktreeId === void 0)
      return null;
    const legacy = lastBuildPath(baseDir, void 0);
    if (!existsSync16(legacy))
      return null;
    path = legacy;
  }
  let raw;
  try {
    raw = readFileSync16(path, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object")
    return null;
  const o = parsed;
  if (typeof o.ts !== "number" || !Number.isFinite(o.ts))
    return null;
  if (o.commit_sha !== null && typeof o.commit_sha !== "string")
    return null;
  if (typeof o.snapshot_sha256 !== "string")
    return null;
  const out = { ts: o.ts, commit_sha: o.commit_sha, snapshot_sha256: o.snapshot_sha256 };
  if (typeof o.node_count === "number" && Number.isFinite(o.node_count) && o.node_count >= 0) {
    out.node_count = o.node_count;
  }
  if (typeof o.edge_count === "number" && Number.isFinite(o.edge_count) && o.edge_count >= 0) {
    out.edge_count = o.edge_count;
  }
  return out;
}

// dist/src/graph/history.js
import { appendFileSync as appendFileSync2, existsSync as existsSync17, mkdirSync as mkdirSync10, readFileSync as readFileSync17 } from "node:fs";
import { dirname as dirname6, join as join22 } from "node:path";
function historyPath(baseDir) {
  return join22(baseDir, "history.jsonl");
}
function appendHistoryEntry(baseDir, entry) {
  const path = historyPath(baseDir);
  try {
    mkdirSync10(dirname6(path), { recursive: true });
    appendFileSync2(path, JSON.stringify(entry) + "\n");
  } catch {
  }
}
function entryFromSnapshot(snapshot, snapshot_sha256, trigger) {
  return {
    ts: snapshot.observation.ts,
    commit_sha: snapshot.graph.commit_sha,
    snapshot_sha256,
    node_count: snapshot.nodes.length,
    edge_count: snapshot.links.length,
    trigger
  };
}
function readHistoryTail(baseDir, n) {
  const path = historyPath(baseDir);
  if (!existsSync17(path))
    return [];
  let raw;
  try {
    raw = readFileSync17(path, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter((l) => l.length > 0);
  const entries = [];
  for (let i = lines.length - 1; i >= 0 && entries.length < n; i--) {
    const parsed = parseLine(lines[i]);
    if (parsed !== null)
      entries.unshift(parsed);
  }
  return entries;
}
function countHistoryEntries(baseDir) {
  const path = historyPath(baseDir);
  if (!existsSync17(path))
    return 0;
  try {
    const raw = readFileSync17(path, "utf8");
    return raw.split("\n").filter((l) => l.length > 0).length;
  } catch {
    return 0;
  }
}
function parseLine(line) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (obj === null || typeof obj !== "object")
    return null;
  const o = obj;
  if (typeof o.ts !== "string")
    return null;
  if (o.commit_sha !== null && typeof o.commit_sha !== "string")
    return null;
  if (typeof o.snapshot_sha256 !== "string")
    return null;
  if (typeof o.node_count !== "number")
    return null;
  if (typeof o.edge_count !== "number")
    return null;
  if (typeof o.trigger !== "string")
    return null;
  return {
    ts: o.ts,
    commit_sha: o.commit_sha,
    snapshot_sha256: o.snapshot_sha256,
    node_count: o.node_count,
    edge_count: o.edge_count,
    trigger: o.trigger
  };
}

// dist/src/graph/snapshot.js
import { createHash as createHash4 } from "node:crypto";
import { mkdirSync as mkdirSync11, renameSync as renameSync6, writeFileSync as writeFileSync14 } from "node:fs";
import { homedir as homedir10 } from "node:os";
import { dirname as dirname7, join as join23 } from "node:path";

// dist/src/graph/resolve/cross-file.js
import { posix } from "node:path";
var EXPORTABLE_KINDS = /* @__PURE__ */ new Set([
  "function",
  "class",
  "const",
  "interface",
  "type_alias",
  "enum"
]);
var HERITAGE_KINDS = /* @__PURE__ */ new Set([
  "class",
  "interface",
  "type_alias",
  "enum"
]);
function buildExportIndex(nodes) {
  const idx = /* @__PURE__ */ new Map();
  for (const n of nodes) {
    if (!n.exported || !EXPORTABLE_KINDS.has(n.kind))
      continue;
    let m = idx.get(n.source_file);
    if (!m) {
      m = /* @__PURE__ */ new Map();
      idx.set(n.source_file, m);
    }
    if (!m.has(n.label))
      m.set(n.label, n.id);
  }
  return idx;
}
function resolveCrossFileCalls(extractions, nodes) {
  const knownFiles = /* @__PURE__ */ new Set();
  for (const ex of extractions)
    knownFiles.add(ex.source_file);
  const exportIndex = buildExportIndex(nodes);
  const edges = [];
  const seen = /* @__PURE__ */ new Set();
  for (const ex of extractions) {
    const rawCalls = ex.raw_calls ?? [];
    const bindings = ex.import_bindings ?? [];
    if (rawCalls.length === 0 || bindings.length === 0)
      continue;
    const byLocal = /* @__PURE__ */ new Map();
    for (const b of bindings) {
      if (!byLocal.has(b.local_name))
        byLocal.set(b.local_name, b);
    }
    for (const rc of rawCalls) {
      const target = resolveOne(rc, byLocal, ex.source_file, knownFiles, exportIndex);
      if (target === null)
        continue;
      const key = `${rc.caller_id}\0${target}`;
      if (seen.has(key))
        continue;
      seen.add(key);
      edges.push({
        source: rc.caller_id,
        target,
        relation: "calls",
        confidence: "EXTRACTED"
      });
    }
  }
  return edges;
}
function resolveOne(rc, byLocal, fromFile, knownFiles, exportIndex) {
  let binding;
  let exportName;
  if (rc.receiver !== void 0) {
    binding = byLocal.get(rc.receiver);
    if (binding === void 0 || binding.kind !== "namespace")
      return null;
    if (binding.type_only)
      return null;
    exportName = rc.callee_name;
  } else {
    binding = byLocal.get(rc.callee_name);
    if (binding === void 0)
      return null;
    if (binding.type_only)
      return null;
    if (binding.kind !== "named")
      return null;
    exportName = binding.imported_name;
  }
  const targetFile = resolveModule(fromFile, binding.specifier, knownFiles);
  if (targetFile === null)
    return null;
  return exportIndex.get(targetFile)?.get(exportName) ?? null;
}
var MODULE_SUFFIX = "::module";
var EXTERNAL_PREFIX = "external:";
function repointImportEdges(links, knownFiles) {
  return links.map((e) => {
    if (e.relation !== "imports" || !e.target.startsWith(EXTERNAL_PREFIX))
      return e;
    if (!e.source.endsWith(MODULE_SUFFIX))
      return e;
    const fromFile = e.source.slice(0, -MODULE_SUFFIX.length);
    const specifier = e.target.slice(EXTERNAL_PREFIX.length);
    const resolved = resolveModule(fromFile, specifier, knownFiles);
    if (resolved === null)
      return e;
    return { ...e, target: `${resolved}${MODULE_SUFFIX}` };
  });
}
var UNRESOLVED_PREFIX = "unresolved:";
function resolveHeritageEdges(links, extractions, nodes) {
  const knownFiles = /* @__PURE__ */ new Set();
  for (const ex of extractions)
    knownFiles.add(ex.source_file);
  const exportIndex = buildExportIndex(nodes);
  const localIndex = /* @__PURE__ */ new Map();
  for (const n of nodes) {
    if (!HERITAGE_KINDS.has(n.kind))
      continue;
    let m = localIndex.get(n.source_file);
    if (!m) {
      m = /* @__PURE__ */ new Map();
      localIndex.set(n.source_file, m);
    }
    if (!m.has(n.label))
      m.set(n.label, n.id);
  }
  const bindingsByFile = /* @__PURE__ */ new Map();
  for (const ex of extractions) {
    const m = /* @__PURE__ */ new Map();
    for (const b of ex.import_bindings ?? [])
      if (!m.has(b.local_name))
        m.set(b.local_name, b);
    bindingsByFile.set(ex.source_file, m);
  }
  return links.map((e) => {
    if (e.relation !== "extends" && e.relation !== "implements")
      return e;
    if (!e.target.startsWith(UNRESOLVED_PREFIX))
      return e;
    const parsed = parseUnresolved(e.target);
    if (parsed === null)
      return e;
    const { file, name } = parsed;
    const local = localIndex.get(file)?.get(name);
    if (local !== void 0)
      return { ...e, target: local };
    const binding = bindingsByFile.get(file)?.get(name);
    if (binding !== void 0 && binding.kind === "named") {
      const targetFile = resolveModule(file, binding.specifier, knownFiles);
      if (targetFile !== null) {
        const id = exportIndex.get(targetFile)?.get(binding.imported_name);
        if (id !== void 0)
          return { ...e, target: id };
      }
    }
    return e;
  });
}
function parseUnresolved(target) {
  const body = target.slice(UNRESOLVED_PREFIX.length);
  const lastColon = body.lastIndexOf(":");
  if (lastColon <= 0)
    return null;
  const rest = body.slice(0, lastColon);
  const nameColon = rest.lastIndexOf(":");
  if (nameColon <= 0)
    return null;
  const file = rest.slice(0, nameColon);
  const name = rest.slice(nameColon + 1);
  if (file.length === 0 || name.length === 0)
    return null;
  return { file, name };
}
function resolveModule(fromFile, specifier, knownFiles) {
  if (isPythonFile(fromFile))
    return resolvePythonModule(fromFile, specifier, knownFiles);
  if (!specifier.startsWith("./") && !specifier.startsWith("../"))
    return null;
  const baseDir = posix.dirname(fromFile);
  const explicit = specifier.match(/\.(tsx?|jsx?|mjs|cjs)$/)?.[0] ?? null;
  const stem = explicit ? specifier.slice(0, -explicit.length) : specifier;
  const joined = posix.normalize(posix.join(baseDir, stem));
  const TS_EXTS = [".ts", ".tsx"];
  const JS_EXTS = [".js", ".jsx", ".mjs", ".cjs"];
  const importerIsJs = /\.(jsx?|mjs|cjs)$/.test(fromFile);
  const primary = importerIsJs ? JS_EXTS : TS_EXTS;
  const secondary = importerIsJs ? TS_EXTS : JS_EXTS;
  const exts = [
    ...explicit ? [explicit] : [],
    ...primary,
    ...secondary
  ].filter((e, i, a) => a.indexOf(e) === i);
  for (const e of exts) {
    const c = `${joined}${e}`;
    if (knownFiles.has(c))
      return c;
  }
  for (const e of exts) {
    const c = `${joined}/index${e}`;
    if (knownFiles.has(c))
      return c;
  }
  return null;
}
var PY_EXTS = [".py", ".pyi"];
function isPythonFile(p) {
  return p.endsWith(".py") || p.endsWith(".pyi");
}
function resolvePythonModule(fromFile, specifier, knownFiles) {
  let dots = 0;
  while (dots < specifier.length && specifier[dots] === ".")
    dots++;
  const tail = specifier.slice(dots);
  const segs = tail.length > 0 ? tail.split(".") : [];
  if (dots === 0) {
    if (segs.length === 0)
      return null;
    return matchPythonSuffix(segs.join("/"), knownFiles);
  }
  let dir = posix.dirname(fromFile);
  let climbed = 1;
  for (; climbed < dots && dir !== "" && dir !== "."; climbed++)
    dir = posix.dirname(dir);
  if (climbed < dots)
    return null;
  const base = segs.length > 0 ? posix.normalize(posix.join(dir, ...segs)) : dir;
  for (const e of PY_EXTS)
    if (knownFiles.has(`${base}${e}`))
      return `${base}${e}`;
  for (const e of PY_EXTS)
    if (knownFiles.has(`${base}/__init__${e}`))
      return `${base}/__init__${e}`;
  return null;
}
function matchPythonSuffix(suffix, knownFiles) {
  const targets = [
    ...PY_EXTS.map((e) => `${suffix}${e}`),
    ...PY_EXTS.map((e) => `${suffix}/__init__${e}`)
  ];
  for (const t of targets) {
    if (knownFiles.has(t))
      return t;
    let hit = null;
    let count = 0;
    for (const f of knownFiles) {
      if (f.endsWith(`/${t}`)) {
        hit = f;
        count++;
      }
    }
    if (count === 1)
      return hit;
    if (count > 1)
      return null;
  }
  return null;
}

// dist/src/graph/node-metadata.js
function annotateNodeDegrees(nodes, links) {
  const inDeg = /* @__PURE__ */ new Map();
  const outDeg = /* @__PURE__ */ new Map();
  for (const e of links) {
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }
  for (const n of nodes) {
    const fi = inDeg.get(n.id) ?? 0;
    const fo = outDeg.get(n.id) ?? 0;
    n.fan_in = fi;
    n.fan_out = fo;
    n.is_entrypoint = n.exported && fi === 0;
  }
}

// dist/src/graph/snapshot.js
function graphsRoot() {
  return process.env.HIVEMIND_GRAPHS_HOME ?? join23(homedir10(), ".hivemind", "graphs");
}
function repoDir(repoKey) {
  return join23(graphsRoot(), repoKey);
}
function buildSnapshot(extractions, metadata, observation) {
  const nodes = [];
  const links = [];
  for (const ex of extractions) {
    for (const n of ex.nodes)
      nodes.push(n);
    for (const e of ex.edges)
      links.push(e);
  }
  for (const e of resolveCrossFileCalls(extractions, nodes))
    links.push(e);
  const knownFiles = /* @__PURE__ */ new Set();
  for (const ex of extractions)
    knownFiles.add(ex.source_file);
  let resolvedLinks = repointImportEdges(links, knownFiles);
  resolvedLinks = resolveHeritageEdges(resolvedLinks, extractions, nodes);
  annotateNodeDegrees(nodes, resolvedLinks);
  nodes.sort(compareNodes);
  resolvedLinks.sort(compareEdges);
  return {
    directed: true,
    multigraph: true,
    graph: metadata,
    observation,
    nodes,
    links: resolvedLinks
  };
}
function compareNodes(a, b) {
  return cmp(a.id, b.id);
}
function compareEdges(a, b) {
  let c = cmp(a.source, b.source);
  if (c !== 0)
    return c;
  c = cmp(a.target, b.target);
  if (c !== 0)
    return c;
  c = cmp(a.relation, b.relation);
  if (c !== 0)
    return c;
  return (a.ord ?? 0) - (b.ord ?? 0);
}
function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function canonicalSnapshot(snapshot) {
  return canonicalJSON2(snapshot);
}
function computeSnapshotSha2562(snapshot) {
  const stable = {
    directed: snapshot.directed,
    multigraph: snapshot.multigraph,
    graph: snapshot.graph,
    nodes: snapshot.nodes,
    links: snapshot.links
  };
  return createHash4("sha256").update(canonicalJSON2(stable)).digest("hex");
}
function canonicalJSON2(value) {
  return JSON.stringify(value, (_key, v) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const sorted = {};
      for (const k of Object.keys(v).sort()) {
        sorted[k] = v[k];
      }
      return sorted;
    }
    return v;
  });
}
function writeSnapshot(snapshot, baseDir, trigger = "unknown", worktreeId) {
  const sha256 = computeSnapshotSha2562(snapshot);
  const commitSha = snapshot.graph.commit_sha;
  const fileBase = commitSha ?? sha256;
  const snapshotsDir = join23(baseDir, "snapshots");
  const snapshotPath = join23(snapshotsDir, `${fileBase}.json`);
  const canonical = canonicalSnapshot(snapshot);
  writeFileAtomic(snapshotPath, canonical);
  const worktreeRoot = worktreeId !== void 0 ? join23(baseDir, "worktrees", worktreeId) : baseDir;
  let latestCommitPath = null;
  if (commitSha !== null) {
    latestCommitPath = join23(worktreeRoot, "latest-commit.txt");
    writeFileAtomic(latestCommitPath, `${commitSha}
`);
  }
  writeLastBuild(baseDir, {
    ts: Date.now(),
    commit_sha: commitSha,
    snapshot_sha256: sha256,
    node_count: snapshot.nodes.length,
    edge_count: snapshot.links.length
  }, worktreeId);
  appendHistoryEntry(baseDir, entryFromSnapshot(snapshot, sha256, trigger));
  return { snapshotPath, latestCommitPath, snapshotSha256: sha256 };
}
function writeFileAtomic(filePath, contents) {
  mkdirSync11(dirname7(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync14(tmp, contents);
  renameSync6(tmp, filePath);
}

// dist/src/graph/deeplake-pull.js
function workTreeIdFor(cwd) {
  return createHash5("sha256").update(cwd).digest("hex").slice(0, 16);
}
async function pullSnapshot(cwd, deps = {}) {
  if (process.env.HIVEMIND_GRAPH_PULL === "0") {
    return { kind: "skipped-disabled" };
  }
  const config = (deps.loadConfig ?? loadConfig)();
  if (config === null) {
    return { kind: "skipped-no-auth" };
  }
  const head = (deps.readHead ?? defaultReadHead)(cwd);
  if (head === null) {
    return { kind: "skipped-no-head" };
  }
  const api = (deps.makeApi ?? defaultMakeApi2)(config);
  try {
    await api.ensureCodebaseTable(config.codebaseTableName);
  } catch (err) {
    return errorOutcome2("ensureCodebaseTable", err);
  }
  const tableId = sqlIdent(config.codebaseTableName);
  const { key: repoKey } = deriveProjectKey(cwd);
  const selectSql = `SELECT snapshot_jsonb, snapshot_sha256, ts, node_count, edge_count, branch, generator_version, worktree_id FROM "${tableId}" WHERE org_id = '${sqlStr(config.orgId)}' AND workspace_id = '${sqlStr(config.workspaceId)}' AND repo_slug = '${sqlStr(repoKey)}' AND user_id = '${sqlStr(config.userName)}' AND commit_sha = '${sqlStr(head)}' ORDER BY ts DESC LIMIT 1`;
  let rows;
  try {
    rows = await api.query(selectSql);
  } catch (err) {
    return errorOutcome2("SELECT cloud row", err);
  }
  if (rows.length === 0) {
    return { kind: "no-cloud-row", commitSha: head };
  }
  const row = rows[0];
  const cloudSha256 = String(row.snapshot_sha256 ?? "").trim();
  const cloudPayload = coerceSnapshotPayload(row.snapshot_jsonb);
  if (cloudPayload === null) {
    return errorOutcome2("SELECT cloud row", new Error("invalid snapshot_jsonb payload"));
  }
  let parsedSnapshot;
  try {
    parsedSnapshot = JSON.parse(cloudPayload);
  } catch (err) {
    return errorOutcome2("parse cloud snapshot", err);
  }
  if (parsedSnapshot === null || typeof parsedSnapshot !== "object") {
    return errorOutcome2("parse cloud snapshot", new Error("snapshot not an object"));
  }
  if (!Array.isArray(parsedSnapshot.nodes) || !Array.isArray(parsedSnapshot.links)) {
    return errorOutcome2("parse cloud snapshot", new Error("snapshot missing nodes/links arrays"));
  }
  if (cloudSha256 !== "") {
    const computedSha = computeSnapshotSha2562(parsedSnapshot);
    if (cloudSha256 !== computedSha) {
      return errorOutcome2("SELECT cloud row", new Error(`snapshot_sha256 mismatch (expected ${cloudSha256}, got ${computedSha})`));
    }
  }
  const cloudTs = parseTs(row.ts);
  const baseDir = repoDir(repoKey);
  const worktreeId = workTreeIdFor(cwd);
  const local = readLastBuild(baseDir, worktreeId);
  if (local !== null && local.commit_sha === head) {
    if (cloudSha256 !== "" && local.snapshot_sha256 === cloudSha256) {
      return { kind: "up-to-date", commitSha: head, snapshotSha256: cloudSha256 };
    }
    if (local.ts > cloudTs) {
      return {
        kind: "local-newer",
        commitSha: head,
        localTs: local.ts,
        cloudTs
      };
    }
  }
  const snapshotsDir = join24(baseDir, "snapshots");
  const snapshotPath = join24(snapshotsDir, `${head}.json`);
  const worktreeRoot = join24(baseDir, "worktrees", worktreeId);
  try {
    writeFileAtomic2(snapshotPath, cloudPayload);
    writeFileAtomic2(join24(worktreeRoot, "latest-commit.txt"), `${head}
`);
    writeLastBuild(baseDir, {
      ts: cloudTs,
      commit_sha: head,
      snapshot_sha256: cloudSha256,
      node_count: numOrUndefined(row.node_count),
      edge_count: numOrUndefined(row.edge_count)
    }, worktreeId);
    appendHistoryEntry(baseDir, {
      ts: new Date(cloudTs).toISOString(),
      commit_sha: head,
      snapshot_sha256: cloudSha256,
      node_count: Number(row.node_count ?? 0),
      edge_count: Number(row.edge_count ?? 0),
      trigger: "pull"
    });
  } catch (err) {
    return errorOutcome2("write local files", err);
  }
  return {
    kind: "pulled",
    commitSha: head,
    snapshotSha256: cloudSha256,
    bytes: Buffer.byteLength(cloudPayload, "utf8"),
    cloudTs,
    sourceWorktreePath: String(row.worktree_id ?? "")
  };
}
function defaultReadHead(cwd) {
  try {
    return execFileSync4("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}
function defaultMakeApi2(config) {
  return new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
}
function parseTs(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1e3 : raw;
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
function numOrUndefined(raw) {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0)
    return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0)
      return n;
  }
  return void 0;
}
function coerceSnapshotPayload(raw) {
  if (typeof raw === "string")
    return raw;
  if (raw !== null && typeof raw === "object")
    return JSON.stringify(raw);
  return null;
}
function writeFileAtomic2(filePath, contents) {
  mkdirSync12(dirname8(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync15(tmp, contents);
  renameSync7(tmp, filePath);
}
function errorOutcome2(stage, err) {
  const message = err instanceof Error ? err.message : String(err);
  return { kind: "error", message: `${stage}: ${message}` };
}

// dist/src/graph/diff.js
import { existsSync as existsSync19, readFileSync as readFileSync18 } from "node:fs";
import { join as join25 } from "node:path";
function edgeKey(e) {
  return `${e.source}${e.target}${e.relation}${e.ord ?? 0}`;
}
function diffSnapshots(from, to) {
  const fromNodeIds = new Set(from.nodes.map((n) => n.id));
  const toNodeIds = new Set(to.nodes.map((n) => n.id));
  const nodesAdded = to.nodes.filter((n) => !fromNodeIds.has(n.id));
  const nodesRemoved = from.nodes.filter((n) => !toNodeIds.has(n.id));
  const fromEdgeKeys = new Set(from.links.map(edgeKey));
  const toEdgeKeys = new Set(to.links.map(edgeKey));
  const edgesAdded = to.links.filter((e) => !fromEdgeKeys.has(edgeKey(e)));
  const edgesRemoved = from.links.filter((e) => !toEdgeKeys.has(edgeKey(e)));
  return {
    nodes: { added: nodesAdded, removed: nodesRemoved },
    edges: { added: edgesAdded, removed: edgesRemoved },
    counts: {
      nodes_added: nodesAdded.length,
      nodes_removed: nodesRemoved.length,
      edges_added: edgesAdded.length,
      edges_removed: edgesRemoved.length
    }
  };
}
function loadSnapshotByCommit(baseDir, commitSha) {
  if (!/^[0-9a-f]{4,64}$/i.test(commitSha))
    return null;
  const path = join25(baseDir, "snapshots", `${commitSha}.json`);
  if (!existsSync19(path))
    return null;
  let raw;
  try {
    raw = readFileSync18(path, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!isGraphSnapshotLike(parsed))
      return null;
    return parsed;
  } catch {
    return null;
  }
}
function isGraphSnapshotLike(v) {
  if (v === null || typeof v !== "object")
    return false;
  const s = v;
  return Array.isArray(s.nodes) && Array.isArray(s.links);
}
function printDiffHuman(diff, sampleSize = 10) {
  const { counts } = diff;
  console.log(`Nodes: +${counts.nodes_added} -${counts.nodes_removed}   Edges: +${counts.edges_added} -${counts.edges_removed}`);
  const showNodes = (label, ns) => {
    if (ns.length === 0)
      return;
    console.log("");
    console.log(`${label} (${ns.length}, showing up to ${sampleSize}):`);
    const sorted = [...ns].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    for (const n of sorted.slice(0, sampleSize)) {
      console.log(`  ${n.id} [${n.kind}]${n.exported ? " (exported)" : ""}  ${n.source_file}:${n.source_location}`);
    }
    if (sorted.length > sampleSize)
      console.log(`  \u2026 and ${sorted.length - sampleSize} more`);
  };
  const showEdges = (label, es) => {
    if (es.length === 0)
      return;
    console.log("");
    console.log(`${label} (${es.length}, showing up to ${sampleSize}):`);
    const sorted = [...es].sort((a, b) => edgeKey(a) < edgeKey(b) ? -1 : edgeKey(a) > edgeKey(b) ? 1 : 0);
    for (const e of sorted.slice(0, sampleSize)) {
      console.log(`  ${e.source} --${e.relation}--> ${e.target}${e.ord !== void 0 ? ` (ord=${e.ord})` : ""}`);
    }
    if (sorted.length > sampleSize)
      console.log(`  \u2026 and ${sorted.length - sampleSize} more`);
  };
  showNodes("Nodes added", diff.nodes.added);
  showNodes("Nodes removed", diff.nodes.removed);
  showEdges("Edges added", diff.edges.added);
  showEdges("Edges removed", diff.edges.removed);
}

// dist/src/graph/extract/typescript.js
import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
var _typescriptParser = null;
var _tsxParser = null;
function getTypescriptParser() {
  if (_typescriptParser === null) {
    _typescriptParser = new Parser();
    _typescriptParser.setLanguage(TypeScript.typescript);
  }
  return _typescriptParser;
}
function getTsxParser() {
  if (_tsxParser === null) {
    _tsxParser = new Parser();
    _tsxParser.setLanguage(TypeScript.tsx);
  }
  return _tsxParser;
}
function pickParserForPath(relativePath) {
  return relativePath.endsWith(".tsx") || relativePath.endsWith(".jsx") ? getTsxParser() : getTypescriptParser();
}
function extractTypeScript(sourceCode, relativePath) {
  const parser = pickParserForPath(relativePath);
  const CHUNK_BYTES3 = 16384;
  const tree = parser.parse((index) => {
    if (index >= sourceCode.length)
      return null;
    return sourceCode.slice(index, index + CHUNK_BYTES3);
  });
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: "typescript",
    nodes: [],
    edges: [],
    parse_errors: [],
    raw_calls: [],
    import_bindings: []
  };
  collectParseErrors(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode(relativePath);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  extractDeclarations(root, relativePath, result, declByName, moduleNode);
  extractImports(root, relativePath, result, moduleNode);
  extractCalls(root, relativePath, result, declByName);
  if (isJavaScriptPath(relativePath)) {
    result.language = "javascript";
    for (const n of result.nodes)
      n.language = "javascript";
  }
  return result;
}
function isJavaScriptPath(relativePath) {
  return /\.(jsx?|mjs|cjs)$/.test(relativePath);
}
function collectParseErrors(node, relativePath, out) {
  if (node.isError || node.isMissing) {
    out.push({
      source_file: relativePath,
      message: node.isMissing ? `missing node: ${node.type}` : `parse error at ${locationStr(node)}`,
      location: locationStr(node)
    });
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectParseErrors(child, relativePath, out);
  }
}
function extractDeclarations(node, relativePath, result, declByName, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    const { decl, exported } = unwrapExport(child);
    if (decl !== null) {
      handleDeclaration(decl, exported, relativePath, result, declByName, moduleNode);
    }
    if (child.type === "internal_module" || child.type === "module") {
      extractDeclarations(child, relativePath, result, declByName, moduleNode);
    }
  }
}
function unwrapExport(node) {
  if (node.type === "export_statement") {
    const decl = node.childForFieldName("declaration") ?? firstNamedChildOfTypes(node, [
      "function_declaration",
      "class_declaration",
      "interface_declaration",
      "type_alias_declaration",
      "enum_declaration",
      "lexical_declaration"
    ]);
    return { decl, exported: true };
  }
  return { decl: node, exported: false };
}
function handleDeclaration(node, exported, relativePath, result, declByName, moduleNode) {
  switch (node.type) {
    case "function_declaration": {
      const name = textOfField(node, "name");
      if (name === null)
        return;
      const decl = makeNode(relativePath, name, "function", node, exported);
      pushNode(result, declByName, decl);
      return;
    }
    case "class_declaration": {
      const name = textOfField(node, "name");
      if (name === null)
        return;
      const classNode = makeNode(relativePath, name, "class", node, exported);
      pushNode(result, declByName, classNode);
      const heritage = firstNamedChildOfTypes(node, ["class_heritage"]);
      if (heritage !== null) {
        for (let i = 0; i < heritage.namedChildCount; i++) {
          const clause = heritage.namedChild(i);
          if (clause === null)
            continue;
          const relation = clause.type === "extends_clause" ? "extends" : clause.type === "implements_clause" ? "implements" : null;
          if (relation === null)
            continue;
          for (let j = 0; j < clause.namedChildCount; j++) {
            const base = clause.namedChild(j);
            if (base === null)
              continue;
            const baseName = base.text;
            if (baseName.length === 0)
              continue;
            result.edges.push({
              source: classNode.id,
              target: nodeIdUnresolved(relativePath, baseName, relation === "extends" ? "class" : "interface"),
              relation,
              confidence: "EXTRACTED"
            });
          }
        }
      }
      const body = firstNamedChildOfTypes(node, ["class_body"]);
      if (body !== null) {
        for (let i = 0; i < body.namedChildCount; i++) {
          const member = body.namedChild(i);
          if (member === null)
            continue;
          if (member.type === "method_definition") {
            const methodName = textOfField(member, "name");
            if (methodName === null)
              continue;
            const accessibility = firstNamedChildOfTypes(member, ["accessibility_modifier"]);
            const isHardPrivate = firstNamedChildOfTypes(member, ["private_property_identifier"]) !== null;
            const isPublic2 = !isHardPrivate && (accessibility === null || accessibility.text === "public");
            const methodExported = exported && isPublic2;
            const methodKey = `${classNode.label}.${methodName}`;
            const methodNode = makeNodeWithExplicitLabel(relativePath, methodKey, methodName, "method", member, methodExported);
            pushNode(result, declByName, methodNode, methodKey);
            result.edges.push({
              source: classNode.id,
              target: methodNode.id,
              relation: "method_of",
              confidence: "EXTRACTED"
            });
          }
        }
      }
      return;
    }
    case "interface_declaration": {
      const name = textOfField(node, "name");
      if (name === null)
        return;
      const decl = makeNode(relativePath, name, "interface", node, exported);
      pushNode(result, declByName, decl);
      return;
    }
    case "type_alias_declaration": {
      const name = textOfField(node, "name");
      if (name === null)
        return;
      const decl = makeNode(relativePath, name, "type_alias", node, exported);
      pushNode(result, declByName, decl);
      return;
    }
    case "enum_declaration": {
      const name = textOfField(node, "name");
      if (name === null)
        return;
      const decl = makeNode(relativePath, name, "enum", node, exported);
      pushNode(result, declByName, decl);
      return;
    }
    case "lexical_declaration": {
      for (let i = 0; i < node.namedChildCount; i++) {
        const declarator = node.namedChild(i);
        if (declarator === null || declarator.type !== "variable_declarator")
          continue;
        const ident = declarator.childForFieldName("name");
        if (ident === null || ident.type !== "identifier")
          continue;
        const decl = makeNode(relativePath, ident.text, "const", declarator, exported);
        pushNode(result, declByName, decl);
      }
      return;
    }
  }
}
function extractImports(node, relativePath, result, moduleNode) {
  if (node.type === "import_statement") {
    const src = firstNamedChildOfTypes(node, ["string"]);
    if (src !== null) {
      const frag = firstNamedChildOfTypes(src, ["string_fragment"]);
      const specifier = (frag !== null ? frag.text : src.text).replace(/^['"]|['"]$/g, "");
      if (specifier.length > 0) {
        result.edges.push({
          source: moduleNode.id,
          target: `external:${specifier}`,
          relation: "imports",
          confidence: "EXTRACTED"
        });
        extractImportBindings(node, specifier, result);
      }
    }
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      extractImports(child, relativePath, result, moduleNode);
  }
}
function extractImportBindings(importStmt, specifier, result) {
  const stmtTypeOnly = /^import\s+type\b/.test(importStmt.text.trimStart());
  const clause = firstNamedChildOfTypes(importStmt, ["import_clause"]);
  if (clause === null)
    return;
  const push = (b) => {
    result.import_bindings.push({ ...b, specifier });
  };
  for (let i = 0; i < clause.namedChildCount; i++) {
    const child = clause.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "identifier") {
      push({ local_name: child.text, imported_name: "default", kind: "default", type_only: stmtTypeOnly });
    } else if (child.type === "namespace_import") {
      const id = firstNamedChildOfTypes(child, ["identifier"]);
      if (id !== null)
        push({ local_name: id.text, imported_name: "*", kind: "namespace", type_only: stmtTypeOnly });
    } else if (child.type === "named_imports") {
      for (let j = 0; j < child.namedChildCount; j++) {
        const spec = child.namedChild(j);
        if (spec === null || spec.type !== "import_specifier")
          continue;
        const specTypeOnly = stmtTypeOnly || /^type\s+(?!as\b)/.test(spec.text);
        const nameNode = spec.childForFieldName("name");
        const aliasNode = spec.childForFieldName("alias");
        const imported = nameNode !== null ? nameNode.text : null;
        if (imported === null)
          continue;
        const local = aliasNode !== null ? aliasNode.text : imported;
        push({ local_name: local, imported_name: imported, kind: "named", type_only: specTypeOnly });
      }
    }
  }
}
function extractCalls(node, relativePath, result, declByName) {
  if (node.type === "call_expression") {
    const callee = node.childForFieldName("function");
    if (callee !== null) {
      const callerNode = findEnclosingDeclaration(node, declByName);
      if (callerNode !== null) {
        const calleeKey = resolveCalleeKey(callee, declByName);
        const targetNode = calleeKey !== null ? declByName.get(calleeKey) : void 0;
        if (targetNode !== void 0) {
          result.edges.push({
            source: callerNode.id,
            target: targetNode.id,
            relation: "calls",
            confidence: "EXTRACTED"
          });
        } else {
          const rc = rawCallFromCallee(callee, callerNode.id);
          if (rc !== null)
            result.raw_calls.push(rc);
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      extractCalls(child, relativePath, result, declByName);
  }
}
function rawCallFromCallee(callee, callerId) {
  if (callee.type === "identifier") {
    return { caller_id: callerId, callee_name: callee.text };
  }
  if (callee.type === "member_expression") {
    const object = callee.childForFieldName("object");
    const property = callee.childForFieldName("property");
    if (object !== null && object.type === "identifier" && property !== null && property.type === "property_identifier") {
      return { caller_id: callerId, callee_name: property.text, receiver: object.text };
    }
  }
  return null;
}
function resolveCalleeKey(callee, declByName) {
  if (callee.type === "identifier")
    return callee.text;
  if (callee.type === "member_expression") {
    const object = callee.childForFieldName("object");
    const property = callee.childForFieldName("property");
    if (object !== null && object.type === "this" && property !== null && property.type === "property_identifier") {
      const className = findEnclosingClassName(callee);
      if (className !== null)
        return `${className}.${property.text}`;
    }
  }
  return null;
}
function findEnclosingDeclaration(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_declaration") {
      const name = textOfField(cur, "name");
      if (name !== null) {
        const n = declByName.get(name);
        if (n !== void 0)
          return n;
      }
    } else if (cur.type === "method_definition") {
      const methodName = textOfField(cur, "name");
      const className = findEnclosingClassName(cur);
      if (methodName !== null && className !== null) {
        const n = declByName.get(`${className}.${methodName}`);
        if (n !== void 0)
          return n;
      }
    } else if (cur.type === "variable_declarator") {
      const value = cur.childForFieldName("value");
      if (value?.type === "arrow_function" || value?.type === "function_expression") {
        const ident = cur.childForFieldName("name");
        if (ident !== null && ident.type === "identifier") {
          const n = declByName.get(ident.text);
          if (n !== void 0)
            return n;
        }
      }
    }
    cur = cur.parent;
  }
  return null;
}
function findEnclosingClassName(node) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "class_declaration") {
      return textOfField(cur, "name");
    }
    cur = cur.parent;
  }
  return null;
}
function makeModuleNode(relativePath) {
  return {
    id: `${relativePath}::module`,
    label: relativePath,
    kind: "module",
    source_file: relativePath,
    source_location: "L1",
    language: "typescript",
    exported: false
  };
}
function makeNode(relativePath, name, kind, node, exported) {
  return {
    id: nodeId(relativePath, name, kind),
    label: name,
    kind,
    source_file: relativePath,
    source_location: locationStr(node),
    language: "typescript",
    exported,
    signature: signatureOf(node, kind)
  };
}
function signatureOf(node, kind) {
  const text = node.text;
  let end = text.length;
  const nl = text.indexOf("\n");
  if (nl >= 0)
    end = Math.min(end, nl);
  const cutsAtBody = kind === "function" || kind === "class" || kind === "method" || kind === "interface" || kind === "enum";
  if (cutsAtBody) {
    const body = node.childForFieldName("body");
    if (body !== null) {
      end = Math.min(end, body.startIndex - node.startIndex);
    } else {
      const brace = text.indexOf("{");
      if (brace >= 0)
        end = Math.min(end, brace);
    }
  }
  const sig = text.slice(0, end).replace(/\s+/g, " ").trim();
  const cps = [...sig];
  return cps.length > 120 ? `${cps.slice(0, 117).join("")}...` : sig;
}
function makeNodeWithExplicitLabel(relativePath, idName, label, kind, node, exported) {
  return {
    id: nodeId(relativePath, idName, kind),
    label,
    kind,
    source_file: relativePath,
    source_location: locationStr(node),
    language: "typescript",
    exported,
    signature: signatureOf(node, kind)
  };
}
function pushNode(result, declByName, node, lookupKey) {
  if (result.nodes.some((n) => n.id === node.id)) {
    if (!declByName.has(lookupKey ?? node.label)) {
      declByName.set(lookupKey ?? node.label, node);
    }
    return;
  }
  result.nodes.push(node);
  declByName.set(lookupKey ?? node.label, node);
}
function nodeId(relativePath, name, kind) {
  return `${relativePath}:${name}:${kind}`;
}
function nodeIdUnresolved(relativePath, name, kind) {
  return `unresolved:${relativePath}:${name}:${kind}`;
}
function locationStr(node) {
  const start = node.startPosition.row + 1;
  const end = node.endPosition.row + 1;
  return start === end ? `L${start}` : `L${start}-${end}`;
}
function textOfField(node, fieldName) {
  const child = node.childForFieldName(fieldName);
  if (child === null)
    return null;
  const text = child.text;
  return text.length > 0 ? text : null;
}
function firstNamedChildOfTypes(node, types) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && types.includes(child.type))
      return child;
  }
  return null;
}

// dist/src/graph/extract/javascript.js
import JavaScript from "tree-sitter-javascript";

// dist/src/graph/extract/shared.js
import Parser2 from "tree-sitter";
var CHUNK_BYTES = 16384;
function parseWithChunks(parser, sourceCode) {
  return parser.parse((i) => i >= sourceCode.length ? null : sourceCode.slice(i, i + CHUNK_BYTES));
}
var _parsers = /* @__PURE__ */ new WeakMap();
function getParser(grammar) {
  let p = _parsers.get(grammar);
  if (p === void 0) {
    p = new Parser2();
    p.setLanguage(grammar);
    _parsers.set(grammar, p);
  }
  return p;
}
function collectParseErrors2(node, relativePath, out) {
  if (node.isError || node.isMissing) {
    out.push({
      source_file: relativePath,
      message: node.isMissing ? `missing node: ${node.type}` : `parse error at ${locationStr2(node)}`,
      location: locationStr2(node)
    });
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectParseErrors2(child, relativePath, out);
  }
}
function makeModuleNode2(relativePath, language) {
  return {
    id: `${relativePath}::module`,
    label: relativePath,
    kind: "module",
    source_file: relativePath,
    source_location: "L1",
    language,
    exported: false
  };
}
function makeNode2(relativePath, name, kind, node, exported, language) {
  return {
    id: nodeId2(relativePath, name, kind),
    label: name,
    kind,
    source_file: relativePath,
    source_location: locationStr2(node),
    language,
    exported
  };
}
function pushNode2(result, declByName, node, lookupKey) {
  if (result.nodes.some((n) => n.id === node.id)) {
    if (!declByName.has(lookupKey ?? node.label)) {
      declByName.set(lookupKey ?? node.label, node);
    }
    return;
  }
  result.nodes.push(node);
  declByName.set(lookupKey ?? node.label, node);
}
function nodeId2(relativePath, name, kind) {
  return `${relativePath}:${name}:${kind}`;
}
function locationStr2(node) {
  const start = node.startPosition.row + 1;
  const end = node.endPosition.row + 1;
  return start === end ? `L${start}` : `L${start}-${end}`;
}
function textOfField2(node, fieldName) {
  const child = node.childForFieldName(fieldName);
  if (child === null)
    return null;
  const t = child.text;
  return t.length > 0 ? t : null;
}
function firstOfType(node, types) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && types.includes(child.type))
      return child;
  }
  return null;
}

// dist/src/graph/extract/javascript.js
var LANG = "javascript";
function extractJavaScript(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(JavaScript), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectDecls(root, relativePath, result, declByName, moduleNode);
  collectImports(root, relativePath, result, moduleNode);
  collectCalls(root, relativePath, result, declByName);
  return result;
}
function collectDecls(node, relativePath, result, declByName, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    const { inner, exported } = unwrapExport2(child);
    if (inner.type === "function_declaration" || inner.type === "generator_function_declaration") {
      const name = textOfField2(inner, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "function", inner, exported, LANG));
    } else if (inner.type === "class_declaration") {
      const name = textOfField2(inner, "name");
      if (name === null)
        continue;
      const classDecl = makeNode2(relativePath, name, "class", inner, exported, LANG);
      pushNode2(result, declByName, classDecl);
      const body = firstOfType(inner, ["class_body"]);
      if (body !== null)
        collectMethods(body, relativePath, result, declByName, name, exported);
    } else if (inner.type === "lexical_declaration" || inner.type === "variable_declaration") {
      for (let j = 0; j < inner.namedChildCount; j++) {
        const decl = inner.namedChild(j);
        if (decl === null || decl.type !== "variable_declarator")
          continue;
        const ident = decl.childForFieldName("name");
        if (ident === null || ident.type !== "identifier")
          continue;
        const val = decl.childForFieldName("value");
        if (val?.type === "arrow_function" || val?.type === "function_expression") {
          pushNode2(result, declByName, makeNode2(relativePath, ident.text, "function", decl, exported, LANG));
        }
      }
    }
  }
}
function collectMethods(body, relativePath, result, declByName, className, classExported) {
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    if (member === null || member.type !== "method_definition")
      continue;
    const methodName = textOfField2(member, "name");
    if (methodName === null)
      continue;
    const key = `${className}.${methodName}`;
    const methodNode = {
      id: nodeId2(relativePath, key, "method"),
      label: methodName,
      kind: "method",
      source_file: relativePath,
      source_location: locationStr2(member),
      language: LANG,
      exported: classExported
    };
    pushNode2(result, declByName, methodNode, key);
    result.edges.push({
      source: nodeId2(relativePath, className, "class"),
      target: methodNode.id,
      relation: "method_of",
      confidence: "EXTRACTED"
    });
  }
}
function unwrapExport2(node) {
  if (node.type === "export_statement") {
    const decl = node.childForFieldName("declaration") ?? firstOfType(node, [
      "function_declaration",
      "generator_function_declaration",
      "class_declaration",
      "lexical_declaration",
      "variable_declaration"
    ]);
    if (decl !== null)
      return { inner: decl, exported: true };
  }
  return { inner: node, exported: false };
}
function collectImports(node, relativePath, result, moduleNode) {
  if (node.type === "import_statement") {
    const src = firstOfType(node, ["string"]);
    if (src !== null) {
      const frag = firstOfType(src, ["string_fragment"]);
      const spec = (frag !== null ? frag.text : src.text).replace(/^['"]|['"]$/g, "");
      if (spec.length > 0) {
        result.edges.push({
          source: moduleNode.id,
          target: `external:${spec}`,
          relation: "imports",
          confidence: "EXTRACTED"
        });
      }
    }
    return;
  }
  if (node.type === "call_expression" && node.childForFieldName("function")?.text === "require") {
    const args = node.childForFieldName("arguments");
    if (args !== null) {
      const str2 = firstOfType(args, ["string"]);
      if (str2 !== null) {
        const frag = firstOfType(str2, ["string_fragment"]);
        const spec = (frag?.text ?? str2.text).replace(/^['"]|['"]$/g, "");
        if (spec.length > 0) {
          result.edges.push({
            source: moduleNode.id,
            target: `external:${spec}`,
            relation: "imports",
            confidence: "EXTRACTED"
          });
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectImports(child, relativePath, result, moduleNode);
  }
}
function collectCalls(node, relativePath, result, declByName) {
  if (node.type === "call_expression") {
    const callee = node.childForFieldName("function");
    if (callee !== null) {
      let calleeKey = null;
      if (callee.type === "identifier") {
        calleeKey = callee.text;
      } else if (callee.type === "member_expression" && callee.childForFieldName("object")?.type === "this") {
        const prop = callee.childForFieldName("property");
        if (prop !== null) {
          let cur = callee.parent;
          while (cur !== null) {
            if (cur.type === "class_declaration") {
              const cn = textOfField2(cur, "name");
              if (cn !== null) {
                calleeKey = `${cn}.${prop.text}`;
              }
              break;
            }
            cur = cur.parent;
          }
        }
      }
      if (calleeKey !== null) {
        const target = declByName.get(calleeKey);
        if (target !== void 0) {
          const caller = findEnclosingFn(node, declByName);
          if (caller !== null) {
            result.edges.push({
              source: caller.id,
              target: target.id,
              relation: "calls",
              confidence: "EXTRACTED"
            });
          }
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCalls(child, relativePath, result, declByName);
  }
}
function findEnclosingFn(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_declaration" || cur.type === "generator_function_declaration") {
      const name = textOfField2(cur, "name");
      if (name !== null) {
        const found = declByName.get(name);
        if (found !== void 0)
          return found;
      }
    } else if (cur.type === "method_definition") {
      const methodName = textOfField2(cur, "name");
      let className = null;
      let p = cur.parent;
      while (p !== null) {
        if (p.type === "class_declaration") {
          className = textOfField2(p, "name");
          break;
        }
        p = p.parent;
      }
      if (methodName !== null && className !== null) {
        const found = declByName.get(`${className}.${methodName}`);
        if (found !== void 0)
          return found;
      }
    } else if (cur.type === "variable_declarator") {
      const val = cur.childForFieldName("value");
      if (val?.type === "arrow_function" || val?.type === "function_expression") {
        const ident = cur.childForFieldName("name");
        if (ident !== null && ident.type === "identifier") {
          const found = declByName.get(ident.text);
          if (found !== void 0)
            return found;
        }
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/python.js
import Parser3 from "tree-sitter";
import Python from "tree-sitter-python";
var _pythonParser = null;
function getPythonParser() {
  if (_pythonParser === null) {
    _pythonParser = new Parser3();
    _pythonParser.setLanguage(Python);
  }
  return _pythonParser;
}
var CHUNK_BYTES2 = 16384;
function extractPython(sourceCode, relativePath) {
  const parser = getPythonParser();
  const tree = parser.parse((index) => index >= sourceCode.length ? null : sourceCode.slice(index, index + CHUNK_BYTES2));
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: "python",
    nodes: [],
    edges: [],
    parse_errors: [],
    raw_calls: [],
    import_bindings: []
  };
  collectParseErrors3(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode3(relativePath);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  extractDeclarations2(
    root,
    relativePath,
    result,
    declByName,
    /*topLevel*/
    true
  );
  extractImports2(root, relativePath, result, moduleNode);
  extractCalls2(root, result, declByName);
  return result;
}
function collectParseErrors3(node, relativePath, out) {
  if (node.isError || node.isMissing) {
    out.push({ source_file: relativePath, message: node.isMissing ? `missing node: ${node.type}` : `parse error at ${loc(node)}`, location: loc(node) });
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c !== null)
      collectParseErrors3(c, relativePath, out);
  }
}
function extractDeclarations2(node, relativePath, result, declByName, topLevel) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "function_definition") {
      const name = textOfField3(child, "name");
      if (name !== null)
        pushNode3(result, declByName, makeNode3(relativePath, name, "function", child, isPublic(name)));
    } else if (child.type === "class_definition") {
      handleClass(child, relativePath, result, declByName);
    } else if (topLevel && child.type === "expression_statement") {
      const assign = firstOfType2(child, "assignment");
      if (assign !== null) {
        const lhs = assign.childForFieldName("left");
        if (lhs !== null && lhs.type === "identifier") {
          pushNode3(result, declByName, makeNode3(relativePath, lhs.text, "const", assign, isPublic(lhs.text)));
        }
      }
    } else if (child.type === "decorated_definition") {
      extractDeclarations2(child, relativePath, result, declByName, topLevel);
    }
  }
}
function handleClass(node, relativePath, result, declByName) {
  const name = textOfField3(node, "name");
  if (name === null)
    return;
  const classNode = makeNode3(relativePath, name, "class", node, isPublic(name));
  pushNode3(result, declByName, classNode);
  const supers = node.childForFieldName("superclasses");
  if (supers !== null) {
    for (let i = 0; i < supers.namedChildCount; i++) {
      const base = supers.namedChild(i);
      if (base === null)
        continue;
      let baseName = null;
      if (base.type === "identifier")
        baseName = base.text;
      else if (base.type === "attribute") {
        const attr = base.childForFieldName("attribute");
        baseName = attr !== null ? attr.text : null;
      }
      if (baseName === null || baseName.length === 0)
        continue;
      result.edges.push({
        source: classNode.id,
        target: nodeIdUnresolved2(relativePath, baseName, "class"),
        relation: "extends",
        confidence: "EXTRACTED"
      });
    }
  }
  const body = node.childForFieldName("body");
  if (body !== null) {
    for (let i = 0; i < body.namedChildCount; i++) {
      let member = body.namedChild(i);
      if (member === null)
        continue;
      if (member.type === "decorated_definition")
        member = firstOfType2(member, "function_definition");
      if (member === null || member.type !== "function_definition")
        continue;
      const mName = textOfField3(member, "name");
      if (mName === null)
        continue;
      const methodNode = makeNodeWithExplicitLabel2(relativePath, `${name}.${mName}`, mName, "method", member, isPublic(name) && isPublic(mName));
      pushNode3(result, declByName, methodNode);
      result.edges.push({ source: classNode.id, target: methodNode.id, relation: "method_of", confidence: "EXTRACTED" });
    }
  }
}
function extractImports2(node, relativePath, result, moduleNode) {
  if (node.type === "import_statement") {
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child === null)
        continue;
      let modText = null;
      let local = null;
      if (child.type === "dotted_name") {
        modText = child.text;
        local = lastDottedSegment(child.text);
      } else if (child.type === "aliased_import") {
        const name = child.childForFieldName("name");
        const alias = child.childForFieldName("alias");
        if (name !== null) {
          modText = name.text;
          local = alias !== null ? alias.text : lastDottedSegment(name.text);
        }
      }
      if (modText !== null) {
        pushImportEdge(result, moduleNode, modText);
        if (local !== null)
          result.import_bindings.push({ local_name: local, imported_name: "*", kind: "namespace", specifier: modText });
      }
    }
    return;
  }
  if (node.type === "import_from_statement") {
    const modNode = node.childForFieldName("module_name");
    const modText = modNode !== null ? modNode.text : ".";
    pushImportEdge(result, moduleNode, modText);
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child === null || child === modNode)
        continue;
      if (child.type === "dotted_name" || child.type === "identifier") {
        const imported = child.text;
        result.import_bindings.push({ local_name: lastDottedSegment(imported), imported_name: imported, kind: "named", specifier: modText });
      } else if (child.type === "aliased_import") {
        const name = child.childForFieldName("name");
        const alias = child.childForFieldName("alias");
        if (name !== null)
          result.import_bindings.push({ local_name: (
            /* c8 ignore next */
            alias !== null ? alias.text : lastDottedSegment(name.text)
          ), imported_name: name.text, kind: "named", specifier: modText });
      }
    }
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c !== null)
      extractImports2(c, relativePath, result, moduleNode);
  }
}
function pushImportEdge(result, moduleNode, specifier) {
  if (specifier.length === 0)
    return;
  result.edges.push({ source: moduleNode.id, target: `external:${specifier}`, relation: "imports", confidence: "EXTRACTED" });
}
function extractCalls2(node, result, declByName) {
  if (node.type === "call") {
    const callee = node.childForFieldName("function");
    if (callee !== null) {
      const caller = findEnclosingDeclaration2(node, declByName);
      if (caller !== null) {
        const key = resolveCalleeKey2(callee);
        const target = key !== null ? declByName.get(key) : void 0;
        if (target !== void 0) {
          result.edges.push({ source: caller.id, target: target.id, relation: "calls", confidence: "EXTRACTED" });
        } else {
          const rc = rawCallFromCallee2(callee, caller.id);
          if (rc !== null)
            result.raw_calls.push(rc);
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c !== null)
      extractCalls2(c, result, declByName);
  }
}
function resolveCalleeKey2(callee) {
  if (callee.type === "identifier")
    return callee.text;
  if (callee.type === "attribute") {
    const obj = callee.childForFieldName("object");
    const attr = callee.childForFieldName("attribute");
    if (obj !== null && obj.type === "identifier" && obj.text === "self" && attr !== null) {
      const cls = findEnclosingClassName2(callee);
      if (cls !== null)
        return `${cls}.${attr.text}`;
    }
  }
  return null;
}
function rawCallFromCallee2(callee, callerId) {
  if (callee.type === "identifier")
    return { caller_id: callerId, callee_name: callee.text };
  if (callee.type === "attribute") {
    const obj = callee.childForFieldName("object");
    const attr = callee.childForFieldName("attribute");
    if (obj !== null && obj.type === "identifier" && obj.text !== "self" && attr !== null) {
      return { caller_id: callerId, callee_name: attr.text, receiver: obj.text };
    }
  }
  return null;
}
function findEnclosingDeclaration2(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_definition") {
      const name = textOfField3(cur, "name");
      const cls = findEnclosingClassName2(cur);
      if (name !== null) {
        const n = cls !== null ? declByName.get(`${cls}.${name}`) : declByName.get(name);
        if (n !== void 0)
          return n;
      }
    }
    cur = cur.parent;
  }
  return null;
}
function findEnclosingClassName2(node) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "class_definition")
      return textOfField3(cur, "name");
    cur = cur.parent;
  }
  return null;
}
function makeNode3(relativePath, name, kind, node, exported) {
  return { id: nodeId3(relativePath, name, kind), label: name, kind, source_file: relativePath, source_location: loc(node), language: "python", exported, signature: signatureOf2(node, kind) };
}
function makeNodeWithExplicitLabel2(relativePath, idName, label, kind, node, exported) {
  return { id: nodeId3(relativePath, idName, kind), label, kind, source_file: relativePath, source_location: loc(node), language: "python", exported, signature: signatureOf2(node, kind) };
}
function makeModuleNode3(relativePath) {
  return { id: `${relativePath}::module`, label: relativePath, kind: "module", source_file: relativePath, source_location: "L1", language: "python", exported: false };
}
function pushNode3(result, declByName, node) {
  result.nodes.push(node);
  const key = node.kind === "method" ? node.id.split(":")[1] : node.label;
  if (!declByName.has(key))
    declByName.set(key, node);
}
function signatureOf2(node, kind) {
  const text = node.text;
  let end = text.length;
  const nl = text.indexOf("\n");
  if (nl >= 0)
    end = Math.min(end, nl);
  if (kind === "function" || kind === "method" || kind === "class") {
    const body = node.childForFieldName("body");
    if (body !== null)
      end = Math.min(end, body.startIndex - node.startIndex);
  }
  const sig = text.slice(0, end).replace(/\s+/g, " ").replace(/:\s*$/, "").trim();
  const cps = [...sig];
  return cps.length > 120 ? `${cps.slice(0, 117).join("")}...` : sig;
}
function nodeId3(relativePath, name, kind) {
  return `${relativePath}:${name}:${kind}`;
}
function nodeIdUnresolved2(relativePath, name, kind) {
  return `unresolved:${relativePath}:${name}:${kind}`;
}
function loc(node) {
  const start = node.startPosition.row + 1;
  const end = node.endPosition.row + 1;
  return end > start ? `L${start}-${end}` : `L${start}`;
}
function textOfField3(node, field) {
  const f = node.childForFieldName(field);
  return f !== null ? f.text : null;
}
function firstOfType2(node, type2) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c !== null && c.type === type2)
      return c;
  }
  return null;
}
function lastDottedSegment(dotted) {
  const parts = dotted.split(".");
  return parts[parts.length - 1] ?? dotted;
}
function isPublic(name) {
  return !name.startsWith("_");
}

// dist/src/graph/extract/go.js
import Go from "tree-sitter-go";
var LANG2 = "go";
function extractGo(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(Go), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG2,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG2);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectDecls2(root, relativePath, result, declByName, moduleNode);
  collectCalls2(root, result, declByName);
  return result;
}
function collectDecls2(node, relativePath, result, declByName, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "function_declaration") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "function", child, true, LANG2));
    } else if (child.type === "method_declaration") {
      const name = textOfField2(child, "name");
      const receiver = child.childForFieldName("receiver");
      const receiverType = receiver !== null ? extractReceiverType(receiver) : null;
      if (name === null)
        continue;
      const key = receiverType !== null ? `${receiverType}.${name}` : name;
      const methodNode = {
        id: nodeId2(relativePath, key, "method"),
        label: name,
        kind: "method",
        source_file: relativePath,
        source_location: locationStr2(child),
        language: LANG2,
        exported: name[0] === name[0].toUpperCase()
        // Go: uppercase = exported
      };
      pushNode2(result, declByName, methodNode, key);
      if (receiverType !== null) {
        result.edges.push({
          source: nodeId2(relativePath, receiverType, "class"),
          target: methodNode.id,
          relation: "method_of",
          confidence: "EXTRACTED"
        });
      }
    } else if (child.type === "type_declaration") {
      for (let j = 0; j < child.namedChildCount; j++) {
        const spec = child.namedChild(j);
        if (spec === null || spec.type !== "type_spec")
          continue;
        const name = textOfField2(spec, "name");
        if (name === null)
          continue;
        const typeField = spec.childForFieldName("type");
        const kind = typeField?.type === "interface_type" ? "interface" : "class";
        pushNode2(result, declByName, makeNode2(relativePath, name, kind, spec, name[0] === name[0].toUpperCase(), LANG2));
      }
    } else if (child.type === "import_declaration") {
      collectGoImports(child, result, moduleNode);
    } else if (child.type === "const_declaration" || child.type === "var_declaration") {
      collectGoVarConst(child, relativePath, result, declByName);
    }
  }
}
function extractReceiverType(receiver) {
  for (let i = 0; i < receiver.namedChildCount; i++) {
    const param = receiver.namedChild(i);
    if (param === null)
      continue;
    const typeField = param.childForFieldName("type");
    if (typeField === null)
      continue;
    if (typeField.type === "type_identifier")
      return typeField.text;
    if (typeField.type === "pointer_type") {
      for (let j = 0; j < typeField.namedChildCount; j++) {
        const inner = typeField.namedChild(j);
        if (inner !== null && inner.type === "type_identifier")
          return inner.text;
      }
    }
  }
  return null;
}
function collectGoImports(node, result, moduleNode) {
  const addSpec = (spec) => {
    const path = spec.childForFieldName("path");
    if (path === null)
      return;
    const raw = path.text.replace(/^"|"$/g, "");
    if (raw.length > 0) {
      result.edges.push({
        source: moduleNode.id,
        target: `external:${raw}`,
        relation: "imports",
        confidence: "EXTRACTED"
      });
    }
  };
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "import_spec")
      addSpec(child);
    else if (child.type === "import_spec_list") {
      for (let j = 0; j < child.namedChildCount; j++) {
        const spec = child.namedChild(j);
        if (spec !== null && spec.type === "import_spec")
          addSpec(spec);
      }
    }
  }
}
function collectGoVarConst(node, relativePath, result, declByName) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const spec = node.namedChild(i);
    if (spec === null)
      continue;
    if (spec.type === "const_spec" || spec.type === "var_spec") {
      const nameNode = spec.childForFieldName("name");
      const name = nameNode?.text ?? null;
      if (name !== null && name.length > 0) {
        const kind = spec.type === "const_spec" ? "const" : "variable";
        pushNode2(result, declByName, makeNode2(relativePath, name, kind, spec, name[0] === name[0].toUpperCase(), LANG2));
      }
    }
  }
}
function collectCalls2(node, result, declByName) {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    if (fn !== null && fn.type === "identifier") {
      const target = declByName.get(fn.text);
      const caller = findEnclosingFn2(node, declByName);
      if (target !== void 0 && caller !== null) {
        result.edges.push({
          source: caller.id,
          target: target.id,
          relation: "calls",
          confidence: "EXTRACTED"
        });
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCalls2(child, result, declByName);
  }
}
function findEnclosingFn2(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_declaration") {
      const name = textOfField2(cur, "name");
      if (name !== null) {
        const found = declByName.get(name);
        if (found !== void 0)
          return found;
      }
    } else if (cur.type === "method_declaration") {
      const name = textOfField2(cur, "name");
      const receiver = cur.childForFieldName("receiver");
      const rt = receiver !== null ? extractReceiverType(receiver) : null;
      if (name !== null) {
        const key = rt !== null ? `${rt}.${name}` : name;
        const found = declByName.get(key);
        if (found !== void 0)
          return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/rust.js
import Rust from "tree-sitter-rust";
var LANG3 = "rust";
function extractRust(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(Rust), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG3,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG3);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectDecls3(root, relativePath, result, declByName, moduleNode);
  collectCalls3(root, result, declByName);
  return result;
}
function collectDecls3(node, relativePath, result, declByName, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "function_item") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      const exported = isRustPub(child);
      pushNode2(result, declByName, makeNode2(relativePath, name, "function", child, exported, LANG3));
    } else if (child.type === "struct_item") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "class", child, isRustPub(child), LANG3));
    } else if (child.type === "enum_item") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "enum", child, isRustPub(child), LANG3));
    } else if (child.type === "trait_item") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "interface", child, isRustPub(child), LANG3));
    } else if (child.type === "impl_item") {
      collectImplMethods(child, relativePath, result, declByName);
    } else if (child.type === "mod_item") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "module", child, isRustPub(child), LANG3));
      const body = child.childForFieldName("body");
      if (body !== null) {
        collectDecls3(body, relativePath, result, declByName, moduleNode);
      }
    } else if (child.type === "use_declaration") {
      collectUseDecl(child, result, moduleNode);
    } else if (child.type === "const_item") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "const", child, isRustPub(child), LANG3));
    }
  }
}
function isRustPub(node) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && child.type === "visibility_modifier")
      return true;
  }
  return false;
}
function collectImplMethods(impl, relativePath, result, declByName) {
  const typeNode = impl.childForFieldName("type");
  const implTypeName = typeNode !== null ? typeNode.text.trim() : null;
  const body = impl.childForFieldName("body");
  if (body === null)
    return;
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    if (member === null || member.type !== "function_item")
      continue;
    const name = textOfField2(member, "name");
    if (name === null)
      continue;
    const key = implTypeName !== null ? `${implTypeName}::${name}` : name;
    const methodNode = {
      id: nodeId2(relativePath, key, "method"),
      label: name,
      kind: "method",
      source_file: relativePath,
      source_location: locationStr2(member),
      language: LANG3,
      exported: isRustPub(member)
    };
    pushNode2(result, declByName, methodNode, key);
    if (implTypeName !== null) {
      result.edges.push({
        source: nodeId2(relativePath, implTypeName, "class"),
        target: methodNode.id,
        relation: "method_of",
        confidence: "EXTRACTED"
      });
    }
  }
}
function collectUseDecl(node, result, moduleNode) {
  const arg = node.childForFieldName("argument");
  if (arg === null)
    return;
  const path = extractUsePath(arg);
  if (path.length > 0) {
    result.edges.push({
      source: moduleNode.id,
      target: `external:${path}`,
      relation: "imports",
      confidence: "EXTRACTED"
    });
  }
}
function extractUsePath(node) {
  if (node.type === "scoped_identifier" || node.type === "scoped_use_list") {
    const path = node.childForFieldName("path");
    const name = node.childForFieldName("name");
    const pathStr = path !== null ? extractUsePath(path) : "";
    const nameStr = name !== null ? name.text : "";
    return pathStr.length > 0 && nameStr.length > 0 ? `${pathStr}::${nameStr}` : pathStr || nameStr;
  }
  if (node.type === "identifier" || node.type === "self")
    return node.text;
  return "";
}
function collectCalls3(node, result, declByName) {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    if (fn !== null && fn.type === "identifier") {
      const target = declByName.get(fn.text);
      const caller = findEnclosingFn3(node, declByName);
      if (target !== void 0 && caller !== null) {
        result.edges.push({
          source: caller.id,
          target: target.id,
          relation: "calls",
          confidence: "EXTRACTED"
        });
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCalls3(child, result, declByName);
  }
}
function findEnclosingFn3(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_item") {
      const name = textOfField2(cur, "name");
      if (name !== null) {
        const found = declByName.get(name) ?? (() => {
          for (const [k, v] of declByName) {
            if (k.endsWith(`::${name}`) || k === name)
              return v;
          }
          return void 0;
        })();
        if (found !== void 0)
          return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/java.js
import Java from "tree-sitter-java";
var LANG4 = "java";
function extractJava(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(Java), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG4,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG4);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectDecls4(root, relativePath, result, declByName, moduleNode);
  collectCalls4(root, result, declByName);
  return result;
}
function collectDecls4(node, relativePath, result, declByName, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "import_declaration") {
      collectJavaImport(child, result, moduleNode);
    } else if (child.type === "class_declaration") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      const classDecl = makeNode2(relativePath, name, "class", child, isJavaPublic(child), LANG4);
      pushNode2(result, declByName, classDecl);
      const body = child.childForFieldName("body");
      if (body !== null)
        collectClassBody(body, relativePath, result, declByName, name, isJavaPublic(child));
    } else if (child.type === "interface_declaration") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "interface", child, isJavaPublic(child), LANG4));
    } else if (child.type === "enum_declaration") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "enum", child, isJavaPublic(child), LANG4));
    }
  }
}
function isJavaPublic(node) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && child.type === "modifiers") {
      return child.text.includes("public");
    }
  }
  return false;
}
function collectClassBody(body, relativePath, result, declByName, className, classPublic) {
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    if (member === null)
      continue;
    if (member.type === "method_declaration" || member.type === "constructor_declaration") {
      const name = textOfField2(member, "name");
      if (name === null)
        continue;
      const key = `${className}.${name}`;
      const methodNode = {
        id: nodeId2(relativePath, key, "method"),
        label: name,
        kind: "method",
        source_file: relativePath,
        source_location: locationStr2(member),
        language: LANG4,
        exported: classPublic && isJavaPublic(member)
      };
      pushNode2(result, declByName, methodNode, key);
      result.edges.push({
        source: nodeId2(relativePath, className, "class"),
        target: methodNode.id,
        relation: "method_of",
        confidence: "EXTRACTED"
      });
    } else if (member.type === "class_declaration") {
      const name = textOfField2(member, "name");
      if (name === null)
        continue;
      const nestedKey = `${className}.${name}`;
      pushNode2(result, declByName, {
        id: nodeId2(relativePath, nestedKey, "class"),
        label: name,
        kind: "class",
        source_file: relativePath,
        source_location: locationStr2(member),
        language: LANG4,
        exported: isJavaPublic(member)
      });
    }
  }
}
function collectJavaImport(node, result, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "scoped_identifier" || child.type === "identifier") {
      const raw = child.text;
      if (raw.length > 0) {
        result.edges.push({
          source: moduleNode.id,
          target: `external:${raw}`,
          relation: "imports",
          confidence: "EXTRACTED"
        });
      }
      break;
    }
  }
}
function collectCalls4(node, result, declByName) {
  if (node.type === "method_invocation") {
    const name = textOfField2(node, "name");
    const object = node.childForFieldName("object");
    if (name !== null) {
      const isThisCall = object === null || object.type === "this";
      if (isThisCall) {
        const className = findEnclosingClassName3(node);
        const key = className !== null ? `${className}.${name}` : name;
        const target = declByName.get(key) ?? declByName.get(name);
        const caller = findEnclosingMethod(node, declByName);
        if (target !== void 0 && caller !== null) {
          result.edges.push({
            source: caller.id,
            target: target.id,
            relation: "calls",
            confidence: "EXTRACTED"
          });
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCalls4(child, result, declByName);
  }
}
function findEnclosingClassName3(node) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "class_declaration")
      return textOfField2(cur, "name");
    cur = cur.parent;
  }
  return null;
}
function findEnclosingMethod(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "method_declaration" || cur.type === "constructor_declaration") {
      const methodName = textOfField2(cur, "name");
      const className = findEnclosingClassName3(cur);
      if (methodName !== null && className !== null) {
        const found = declByName.get(`${className}.${methodName}`);
        if (found !== void 0)
          return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/ruby.js
import Ruby from "tree-sitter-ruby";
var LANG5 = "ruby";
function extractRuby(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(Ruby), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG5,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG5);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectDecls5(root, relativePath, result, declByName, moduleNode, null);
  collectCalls5(root, result, declByName);
  return result;
}
function collectDecls5(node, relativePath, result, declByName, moduleNode, enclosingClass) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "method" || child.type === "singleton_method") {
      const nameNode = child.childForFieldName("name");
      if (nameNode === null)
        continue;
      const sym = nameNode.text;
      const key = enclosingClass !== null ? `${enclosingClass}#${sym}` : sym;
      const kind = enclosingClass !== null ? "method" : "function";
      const decl = makeNode2(relativePath, key, kind, child, true, LANG5);
      pushNode2(result, declByName, decl, key);
      if (enclosingClass !== null) {
        result.edges.push({
          source: nodeId2(relativePath, enclosingClass, "class"),
          target: decl.id,
          relation: "method_of",
          confidence: "EXTRACTED"
        });
      }
    } else if (child.type === "class" || child.type === "module") {
      const nameNode = child.childForFieldName("name");
      if (nameNode === null)
        continue;
      const sym = nameNode.text;
      const classDecl = makeNode2(relativePath, sym, "class", child, true, LANG5);
      pushNode2(result, declByName, classDecl);
      const superclass = child.childForFieldName("superclass");
      if (superclass !== null) {
        result.edges.push({
          source: classDecl.id,
          target: `unresolved:${relativePath}:${superclass.text}:class`,
          relation: "extends",
          confidence: "EXTRACTED"
        });
      }
      const body = child.childForFieldName("body");
      if (body !== null) {
        collectDecls5(body, relativePath, result, declByName, moduleNode, sym);
      }
    } else if (child.type === "call") {
      const method = child.childForFieldName("method");
      if (method !== null && (method.text === "require" || method.text === "require_relative")) {
        const args = child.childForFieldName("arguments");
        if (args !== null) {
          for (let j = 0; j < args.namedChildCount; j++) {
            const arg = args.namedChild(j);
            if (arg === null)
              continue;
            const content = arg.type === "string_content" ? arg.text : arg.type === "string" ? arg.namedChild(0)?.text ?? "" : "";
            if (content.length > 0) {
              result.edges.push({
                source: moduleNode.id,
                target: `external:${content}`,
                relation: "imports",
                confidence: "EXTRACTED"
              });
            }
          }
        }
      }
    } else {
      collectDecls5(child, relativePath, result, declByName, moduleNode, enclosingClass);
    }
  }
}
function collectCalls5(node, result, declByName) {
  if (node.type === "call") {
    const method = node.childForFieldName("method");
    const receiver = node.childForFieldName("receiver");
    if (method !== null && (receiver === null || receiver.type === "self")) {
      const className = findEnclosingClass(node);
      const key = className !== null ? `${className}#${method.text}` : method.text;
      const target = declByName.get(key) ?? declByName.get(method.text);
      const caller = findEnclosingMethod2(node, declByName);
      if (target !== void 0 && caller !== null) {
        result.edges.push({
          source: caller.id,
          target: target.id,
          relation: "calls",
          confidence: "EXTRACTED"
        });
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCalls5(child, result, declByName);
  }
}
function findEnclosingClass(node) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "class" || cur.type === "module") {
      return cur.childForFieldName("name")?.text ?? null;
    }
    cur = cur.parent;
  }
  return null;
}
function findEnclosingMethod2(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "method" || cur.type === "singleton_method") {
      const nameNode = cur.childForFieldName("name");
      if (nameNode !== null) {
        const className = findEnclosingClass(cur);
        const key = className !== null ? `${className}#${nameNode.text}` : nameNode.text;
        const found = declByName.get(key) ?? declByName.get(nameNode.text);
        if (found !== void 0)
          return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/c.js
import C from "tree-sitter-c";
var LANG6 = "c";
function extractC(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(C), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG6,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG6);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectDecls6(root, relativePath, result, declByName, moduleNode);
  collectCalls6(root, result, declByName);
  return result;
}
function collectDecls6(node, relativePath, result, declByName, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "function_definition") {
      const name = extractFunctionName(child);
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "function", child, true, LANG6));
    } else if (child.type === "declaration") {
      const name = extractDeclName(child);
      if (name !== null) {
        pushNode2(result, declByName, makeNode2(relativePath, name, "function", child, true, LANG6));
      }
    } else if (child.type === "struct_specifier" || child.type === "union_specifier" || child.type === "enum_specifier") {
      const name = child.childForFieldName("name")?.text ?? null;
      if (name !== null && name.length > 0) {
        pushNode2(result, declByName, makeNode2(relativePath, name, "class", child, true, LANG6));
      }
    } else if (child.type === "preproc_include") {
      const path = child.childForFieldName("path");
      if (path !== null) {
        const raw = path.text.replace(/^["<]|[">]$/g, "");
        if (raw.length > 0) {
          result.edges.push({
            source: moduleNode.id,
            target: `external:${raw}`,
            relation: "imports",
            confidence: "EXTRACTED"
          });
        }
      }
    } else {
      collectDecls6(child, relativePath, result, declByName, moduleNode);
    }
  }
}
function extractFunctionName(fnDef) {
  const topDecl = fnDef.childForFieldName("declarator");
  if (topDecl === null)
    return null;
  return drillToIdentifier(topDecl);
}
function drillToIdentifier(node) {
  if (node.type === "identifier")
    return node.text;
  if (node.type === "function_declarator" || node.type === "pointer_declarator" || node.type === "parenthesized_declarator") {
    const inner = node.childForFieldName("declarator");
    if (inner !== null)
      return drillToIdentifier(inner);
  }
  return null;
}
function extractDeclName(decl) {
  for (let i = 0; i < decl.namedChildCount; i++) {
    const child = decl.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "function_declarator") {
      return drillToIdentifier(child);
    }
  }
  return null;
}
function collectCalls6(node, result, declByName) {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    if (fn !== null && fn.type === "identifier") {
      const target = declByName.get(fn.text);
      const caller = findEnclosingFn4(node, declByName);
      if (target !== void 0 && caller !== null) {
        result.edges.push({
          source: caller.id,
          target: target.id,
          relation: "calls",
          confidence: "EXTRACTED"
        });
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCalls6(child, result, declByName);
  }
}
function findEnclosingFn4(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_definition") {
      const name = extractFunctionName(cur);
      if (name !== null) {
        const found = declByName.get(name);
        if (found !== void 0)
          return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/cpp.js
import Cpp from "tree-sitter-cpp";
var LANG7 = "cpp";
function extractCpp(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(Cpp), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG7,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG7);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectCppDecls(root, relativePath, result, declByName, moduleNode, null);
  collectCppCalls(root, result, declByName);
  return result;
}
function collectCppDecls(node, relativePath, result, declByName, moduleNode, enclosingClass, enclosingNamespace = null) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "function_definition") {
      const name = extractFunctionName(child);
      if (name === null)
        continue;
      const nsPrefix = enclosingNamespace !== null ? `${enclosingNamespace}::` : "";
      const key = enclosingClass !== null ? `${nsPrefix}${enclosingClass}::${name}` : `${nsPrefix}${name}`;
      const kind = enclosingClass !== null ? "method" : "function";
      const decl = {
        id: nodeId2(relativePath, key, kind),
        label: name,
        kind,
        source_file: relativePath,
        source_location: locationStr2(child),
        language: LANG7,
        exported: true
      };
      pushNode2(result, declByName, decl, key);
      if (enclosingClass !== null) {
        result.edges.push({
          source: nodeId2(relativePath, enclosingClass, "class"),
          target: decl.id,
          relation: "method_of",
          confidence: "EXTRACTED"
        });
      }
    } else if (child.type === "class_specifier" || child.type === "struct_specifier") {
      const name = child.childForFieldName("name")?.text ?? null;
      if (name !== null && name.length > 0) {
        const classDecl = makeNode2(relativePath, name, "class", child, true, LANG7);
        pushNode2(result, declByName, classDecl);
        const body = child.childForFieldName("body");
        if (body !== null) {
          collectCppDecls(body, relativePath, result, declByName, moduleNode, name, enclosingNamespace);
        }
      }
    } else if (child.type === "namespace_definition") {
      const name = child.childForFieldName("name")?.text ?? null;
      if (name !== null && name.length > 0) {
        pushNode2(result, declByName, makeNode2(relativePath, name, "module", child, true, LANG7));
      }
      const body = child.childForFieldName("body");
      if (body !== null) {
        collectCppDecls(body, relativePath, result, declByName, moduleNode, enclosingClass, name ?? enclosingNamespace);
      }
    } else if (child.type === "template_declaration") {
      for (let j = 0; j < child.namedChildCount; j++) {
        const inner = child.namedChild(j);
        if (inner === null)
          continue;
        if (inner.type === "function_definition" || inner.type === "class_specifier" || inner.type === "struct_specifier") {
          const wrapper = {
            ...node,
            namedChildCount: 1,
            namedChild: (_) => inner,
            namedChildren: [inner]
          };
          collectCppDecls(wrapper, relativePath, result, declByName, moduleNode, enclosingClass, enclosingNamespace);
        }
      }
    } else if (child.type === "preproc_include") {
      const path = child.childForFieldName("path");
      if (path !== null) {
        const raw = path.text.replace(/^["<]|[">]$/g, "");
        if (raw.length > 0) {
          result.edges.push({
            source: moduleNode.id,
            target: `external:${raw}`,
            relation: "imports",
            confidence: "EXTRACTED"
          });
        }
      }
    } else if (child.type === "using_declaration") {
      const name = child.text.replace(/^using\s+(namespace\s+)?/, "").replace(/;$/, "").trim();
      if (name.length > 0) {
        result.edges.push({
          source: moduleNode.id,
          target: `external:${name}`,
          relation: "imports",
          confidence: "EXTRACTED"
        });
      }
    } else {
      collectCppDecls(child, relativePath, result, declByName, moduleNode, enclosingClass, enclosingNamespace);
    }
  }
}
function collectCppCalls(node, result, declByName) {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    if (fn !== null) {
      let key = null;
      if (fn.type === "identifier") {
        key = fn.text;
      } else if (fn.type === "field_expression") {
        const field = fn.childForFieldName("field");
        const obj = fn.childForFieldName("argument");
        if (field !== null && (obj === null || obj.type === "this")) {
          const cn = findEnclosingClass2(fn);
          key = cn !== null ? `${cn}::${field.text}` : field.text;
        }
      } else if (fn.type === "qualified_identifier") {
        const scope = fn.childForFieldName("scope");
        const name = fn.childForFieldName("name");
        if (scope !== null && name !== null)
          key = `${scope.text}::${name.text}`;
      }
      if (key !== null) {
        const target = declByName.get(key);
        const caller = findEnclosingFnCpp(fn, declByName);
        if (target !== void 0 && caller !== null) {
          result.edges.push({
            source: caller.id,
            target: target.id,
            relation: "calls",
            confidence: "EXTRACTED"
          });
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCppCalls(child, result, declByName);
  }
}
function findEnclosingClass2(node) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "class_specifier" || cur.type === "struct_specifier") {
      return cur.childForFieldName("name")?.text ?? null;
    }
    cur = cur.parent;
  }
  return null;
}
function findEnclosingFnCpp(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_definition") {
      const name = extractFunctionName(cur);
      if (name !== null) {
        const cn = findEnclosingClass2(cur);
        const key = cn !== null ? `${cn}::${name}` : name;
        const found = declByName.get(key) ?? declByName.get(name);
        if (found !== void 0)
          return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/index.js
function isPythonPath(relativePath) {
  return /\.pyi?$/.test(relativePath);
}
function extractFile(sourceCode, relativePath) {
  const lower = relativePath.toLowerCase();
  if (isPythonPath(lower))
    return extractPython(sourceCode, relativePath);
  if (/\.[cm]?jsx?$/.test(lower))
    return extractJavaScript(sourceCode, relativePath);
  if (lower.endsWith(".go"))
    return extractGo(sourceCode, relativePath);
  if (lower.endsWith(".rs"))
    return extractRust(sourceCode, relativePath);
  if (lower.endsWith(".java"))
    return extractJava(sourceCode, relativePath);
  if (lower.endsWith(".rb"))
    return extractRuby(sourceCode, relativePath);
  if (/\.(cpp|cc|cxx|hpp)$/.test(lower))
    return extractCpp(sourceCode, relativePath);
  if (/\.[ch]$/.test(lower))
    return extractC(sourceCode, relativePath);
  return extractTypeScript(sourceCode, relativePath);
}

// dist/src/graph/ignore-config.js
import { mkdirSync as mkdirSync13, readFileSync as readFileSync19, writeFileSync as writeFileSync16 } from "node:fs";
import { homedir as homedir11 } from "node:os";
import { join as join26 } from "node:path";
var DEFAULT_IGNORE_DIRS = [
  // JS / TS toolchains
  "node_modules",
  "bower_components",
  "jspm_packages",
  ".pnpm-store",
  "dist",
  "build",
  "out",
  "coverage",
  "bundle",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".parcel-cache",
  ".cache",
  ".vite",
  ".nyc_output",
  // Python
  "venv",
  ".venv",
  "env",
  ".env",
  "virtualenv",
  "__pycache__",
  "site-packages",
  "__pypackages__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".eggs",
  ".ipynb_checkpoints",
  ".hypothesis",
  // Rust / Java / .NET / Go vendoring
  "target",
  "obj",
  "vendor",
  ".gradle",
  ".mvn",
  // Native / mobile
  "Pods",
  "DerivedData",
  ".build",
  // VCS / IDE
  ".git",
  ".svn",
  ".hg",
  ".idea",
  ".vscode",
  ".vs",
  // Infra / misc
  ".terraform",
  "tmp",
  "temp",
  "logs",
  "third_party",
  "third-party"
];
var FILE_NAME = "graph-ignore.json";
function defaultConfigObject() {
  return {
    _comment: "Directory names skipped when building the hivemind code graph. Edit freely. When respectGitignore is true, the repo's .gitignore is also honored (anchoring-correct).",
    ignoreDirs: [...DEFAULT_IGNORE_DIRS],
    respectGitignore: true
  };
}
function loadGraphIgnore(deeplakeDir = join26(homedir11(), ".deeplake")) {
  const path = join26(deeplakeDir, FILE_NAME);
  try {
    const parsed = JSON.parse(readFileSync19(path, "utf8"));
    const ignoreDirs = Array.isArray(parsed.ignoreDirs) ? parsed.ignoreDirs.filter((s) => typeof s === "string") : [...DEFAULT_IGNORE_DIRS];
    const respectGitignore = typeof parsed.respectGitignore === "boolean" ? parsed.respectGitignore : true;
    return { ignoreDirs, respectGitignore };
  } catch {
  }
  try {
    mkdirSync13(deeplakeDir, { recursive: true });
    writeFileSync16(path, JSON.stringify(defaultConfigObject(), null, 2) + "\n", { flag: "wx" });
  } catch {
  }
  return { ignoreDirs: [...DEFAULT_IGNORE_DIRS], respectGitignore: true };
}
function ignoreDirSet(config) {
  return new Set(config.ignoreDirs);
}
function pathHasIgnoredSegment(relPath, ignore) {
  const segs = relPath.split("/");
  return segs.some((seg, i) => ignore.has(seg) || i < segs.length - 1 && seg.startsWith("."));
}

// dist/src/graph/git-hook-install.js
import { chmodSync as chmodSync2, existsSync as existsSync20, mkdirSync as mkdirSync14, readFileSync as readFileSync20, unlinkSync as unlinkSync8, writeFileSync as writeFileSync17 } from "node:fs";
import { dirname as dirname9, join as join27, resolve as resolve3 } from "node:path";
import { execFileSync as execFileSync5 } from "node:child_process";
var HOOK_BEGIN_MARKER = "# HIVEMIND_GRAPH_HOOK_BEGIN \u2014 managed by `hivemind graph init`";
var HOOK_END_MARKER = "# HIVEMIND_GRAPH_HOOK_END";
var SHEBANG = "#!/bin/sh";
function hookBodyLines(hivemindPath) {
  return [
    "# Async-detached so commits never wait. Threshold-gate + cache make",
    "# typical re-runs ~85ms. Logs go to ~/.hivemind/post-commit.log",
    "# mkdir is robust against first-run: $HOME/.hivemind may not exist yet,",
    "# in which case the > redirect would fail and the build would never start.",
    'mkdir -p "$HOME/.hivemind" 2>/dev/null || true',
    `nohup ${quoteForShell(hivemindPath)} graph build --trigger post-commit >> "$HOME/.hivemind/post-commit.log" 2>&1 &`
  ];
}
function quoteForShell(path) {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}
function gitHooksDir(cwd) {
  const configured = tryGitConfig(cwd, "core.hooksPath");
  if (configured !== null) {
    const top = tryGitTopLevel(cwd);
    return top !== null ? resolve3(top, configured) : resolve3(cwd, configured);
  }
  try {
    const out = execFileSync5("git", ["rev-parse", "--git-path", "hooks"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (out === "")
      return null;
    return resolve3(cwd, out);
  } catch {
    return null;
  }
}
function tryGitConfig(cwd, key) {
  try {
    const out = execFileSync5("git", ["config", "--get", key], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return out === "" ? null : out;
  } catch {
    return null;
  }
}
function tryGitTopLevel(cwd) {
  try {
    const out = execFileSync5("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return out === "" ? null : out;
  } catch {
    return null;
  }
}
function postCommitHookPath(cwd) {
  const hooksDir = gitHooksDir(cwd);
  return hooksDir === null ? null : join27(hooksDir, "post-commit");
}
function installPostCommitHook(cwd, opts = {}) {
  const path = postCommitHookPath(cwd);
  if (path === null) {
    return { kind: "foreign-hook", path: "", hint: "not in a git repo (no .git directory found)" };
  }
  const existed = existsSync20(path);
  if (existed) {
    const content = readFileSync20(path, "utf8");
    if (containsOurMarkers(content)) {
      return { kind: "already-ours", path };
    }
    if (!opts.force) {
      return {
        kind: "foreign-hook",
        path,
        hint: `existing hook at ${path} is not managed by hivemind; pass --force to overwrite, or merge our block manually (between '${HOOK_BEGIN_MARKER}' and '${HOOK_END_MARKER}')`
      };
    }
  }
  const hivemindPath = resolveHivemindPath();
  if (hivemindPath === null) {
    return {
      kind: "foreign-hook",
      path,
      hint: "hivemind binary not found on PATH. Install hivemind globally (`npm install -g @deeplake/hivemind`) before running `hivemind graph init`, so the hook can find a stable absolute path to call."
    };
  }
  mkdirSync14(dirname9(path), { recursive: true });
  writeFileSync17(path, buildHookFile(hivemindPath), { mode: 493 });
  try {
    chmodSync2(path, 493);
  } catch {
  }
  return { kind: "installed", path, wasNew: !existed };
}
function resolveHivemindPath() {
  try {
    const out = execFileSync5("which", ["hivemind"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (out !== "" && out.includes("hivemind"))
      return out.split("\n")[0].trim();
  } catch {
  }
  return null;
}
function uninstallPostCommitHook(cwd) {
  const path = postCommitHookPath(cwd);
  if (path === null) {
    return { kind: "no-hook", path: "" };
  }
  if (!existsSync20(path)) {
    return { kind: "no-hook", path };
  }
  const content = readFileSync20(path, "utf8");
  if (!containsOurMarkers(content)) {
    return {
      kind: "not-ours",
      path,
      hint: `existing hook at ${path} is not managed by hivemind; remove it manually if you want it gone`
    };
  }
  const stripped = stripOurBlock(content);
  const meaningful = stripped.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#!"));
  if (meaningful.length === 0) {
    unlinkSync8(path);
    return { kind: "removed", path, wholeFileDeleted: true };
  }
  writeFileSync17(path, stripped);
  return { kind: "removed", path, wholeFileDeleted: false };
}
function containsOurMarkers(content) {
  return content.includes(HOOK_BEGIN_MARKER) && content.includes(HOOK_END_MARKER);
}
function stripOurBlock(content) {
  const beginIdx = content.indexOf(HOOK_BEGIN_MARKER);
  const endIdx = content.indexOf(HOOK_END_MARKER);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx)
    return content;
  const blockEnd = endIdx + HOOK_END_MARKER.length;
  return content.slice(0, beginIdx) + content.slice(blockEnd);
}
function buildHookFile(hivemindPath) {
  return [
    SHEBANG,
    "",
    HOOK_BEGIN_MARKER,
    ...hookBodyLines(hivemindPath),
    HOOK_END_MARKER,
    ""
  ].join("\n");
}

// dist/src/commands/graph.js
var USAGE = `hivemind graph \u2014 codebase-graph commands (Phase 1.5)

Usage:
  hivemind graph build [--cwd <path>]
      Walk the project for supported source files (TS, JS, Python, Go, Rust, Java, Ruby, C, C++), extract symbols + edges,
      and write a snapshot to ~/.hivemind/graphs/<repo-key>/snapshots/<commit-sha>.json.
      Also updates ~/.hivemind/graphs/<repo-key>/latest-commit.txt and the
      per-repo .last-build.json (consumed by the SessionEnd auto-build hook).

  hivemind graph diff <sha1> <sha2> [--cwd <path>] [--json] [--limit N]
      Diff two snapshots by their git commit SHA. Prints added/removed
      counts for nodes and edges, plus up to N=10 (default) examples of each.
      --json: emit machine-readable JSON instead of the human format.
      --limit N: cap the per-category examples (human format only).

  hivemind graph history [--cwd <path>] [-n N] [--json]
      Print the last N (default 20) entries from the per-repo history.jsonl,
      newest last. Each entry shows ts, commit_sha (short), snapshot_sha256
      (short), node/edge counts, and the trigger that fired the build.
      --json: emit raw JSONL (one parsed entry per line, full fields).

  hivemind graph init [--cwd <path>] [--force] [--no-initial-build]
      Install a managed block in .git/hooks/post-commit that fires
      \`hivemind graph build --trigger post-commit\` after each commit
      (async, non-blocking, exit 0 always). Idempotent: re-running on
      an already-installed hook is a no-op. Refuses to clobber an
      existing non-managed hook unless --force is passed.
      Also runs an initial \`hivemind graph build\` unless
      --no-initial-build is passed.

  hivemind graph uninstall [--cwd <path>]
      Remove our managed block from .git/hooks/post-commit. If our block
      was the only content, deletes the file; otherwise leaves the rest
      intact. Snapshots and history are NOT touched (\`rm -rf
      ~/.hivemind/graphs/<key>\` if you really want them gone).

  hivemind graph pull [--cwd <path>]
      Download the freshest cloud snapshot for HEAD into the local graph
      dir (any worktree of this user counts). No-op if local already
      matches cloud sha256 or local was built later than cloud. Requires
      \`hivemind login\`. Best-effort: any network/auth failure leaves
      the local files untouched. Disable via HIVEMIND_GRAPH_PULL=0.

  hivemind graph --help
      Show this message.

  Future subcommands (Phase 1.5+): daemon, search, latest, push, pull, prune.
`;
function runGraphCommand(args) {
  const sub = args[0];
  if (sub === void 0 || sub === "--help" || sub === "-h" || sub === "help") {
    console.log(USAGE);
    return;
  }
  if (sub === "build") {
    return runBuildCommand(args.slice(1));
  }
  if (sub === "diff") {
    runDiffCommand(args.slice(1));
    return;
  }
  if (sub === "history") {
    runHistoryCommand(args.slice(1));
    return;
  }
  if (sub === "init") {
    return runInitCommand(args.slice(1));
  }
  if (sub === "uninstall") {
    runUninstallCommand(args.slice(1));
    return;
  }
  if (sub === "pull") {
    return runPullCommand(args.slice(1));
  }
  console.error(`hivemind graph: unknown subcommand '${sub}'`);
  console.error(USAGE);
  process.exit(2);
}
function parseInitArgs(args) {
  let cwd = process.cwd();
  let force = false;
  let initialBuild = true;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1];
      i += 1;
    } else if (a === "--force") {
      force = true;
    } else if (a === "--no-initial-build") {
      initialBuild = false;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph init: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd, force, initialBuild };
}
async function runInitCommand(args) {
  const opts = parseInitArgs(args);
  const status = installPostCommitHook(opts.cwd, { force: opts.force });
  switch (status.kind) {
    case "installed":
      console.log(`Installed post-commit hook at ${status.path}`);
      break;
    case "already-ours":
      console.log(`Post-commit hook already managed by hivemind (no change): ${status.path}`);
      break;
    case "foreign-hook":
      console.error(`hivemind graph init: ${status.hint}`);
      process.exit(1);
  }
  if (opts.initialBuild) {
    console.log("");
    console.log("Running initial build...");
    await runBuildCommand(["--cwd", opts.cwd, "--trigger", "manual"]);
  } else {
    console.log("");
    console.log("Skipped initial build (--no-initial-build). Run `hivemind graph build` when ready.");
  }
}
function parseUninstallArgs(args) {
  let cwd = process.cwd();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1];
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph uninstall: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd };
}
function runUninstallCommand(args) {
  const opts = parseUninstallArgs(args);
  const status = uninstallPostCommitHook(opts.cwd);
  switch (status.kind) {
    case "removed":
      if (status.wholeFileDeleted) {
        console.log(`Removed post-commit hook (file deleted): ${status.path}`);
      } else {
        console.log(`Removed managed block from post-commit hook (other content preserved): ${status.path}`);
      }
      console.log("Local snapshots + history.jsonl are untouched.");
      break;
    case "no-hook":
      console.log(status.path === "" ? "No git repo here (nothing to uninstall)." : `No post-commit hook at ${status.path} (nothing to uninstall).`);
      break;
    case "not-ours":
      console.error(`hivemind graph uninstall: ${status.hint}`);
      process.exit(1);
  }
}
function parseHistoryArgs(args) {
  let cwd = process.cwd();
  let n = 20;
  let json2 = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1];
      i += 1;
    } else if (a === "-n" && i + 1 < args.length) {
      const raw = args[i + 1];
      if (!/^\d+$/.test(raw)) {
        console.error("hivemind graph history: -n must be a non-negative integer");
        process.exit(2);
      }
      n = Number(raw);
      i += 1;
    } else if (a === "--json") {
      json2 = true;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph history: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd, n, json: json2 };
}
function runHistoryCommand(args) {
  const opts = parseHistoryArgs(args);
  const { key: repoKey } = deriveProjectKey(opts.cwd);
  const baseDir = repoDir(repoKey);
  const total = countHistoryEntries(baseDir);
  const entries = readHistoryTail(baseDir, opts.n);
  if (opts.json) {
    for (const e of entries)
      console.log(JSON.stringify(e));
    return;
  }
  if (total === 0) {
    console.log("No history yet. Run `hivemind graph build` to record one.");
    return;
  }
  console.log(`history.jsonl: ${total} total entries; showing last ${entries.length}`);
  console.log("");
  for (const e of entries) {
    const commit = e.commit_sha === null ? "(no-git)" : e.commit_sha.slice(0, 7);
    const snap = e.snapshot_sha256.slice(0, 7);
    console.log(`  ${e.ts}  commit=${commit}  snap=${snap}  nodes=${e.node_count}  edges=${e.edge_count}  trigger=${e.trigger}`);
  }
}
function parseDiffArgs(args) {
  let cwd = process.cwd();
  let json2 = false;
  let limit = 10;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1];
      i += 1;
    } else if (a === "--json") {
      json2 = true;
    } else if (a === "--limit" && i + 1 < args.length) {
      const raw = args[i + 1];
      if (!/^\d+$/.test(raw)) {
        console.error("hivemind graph diff: --limit must be a non-negative integer");
        process.exit(2);
      }
      limit = Number(raw);
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (a !== void 0 && !a.startsWith("--")) {
      positional.push(a);
    } else {
      console.error(`hivemind graph diff: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  if (positional.length !== 2) {
    console.error("hivemind graph diff: expected exactly two commit SHAs");
    console.error(USAGE);
    process.exit(2);
  }
  return { cwd, sha1: positional[0], sha2: positional[1], json: json2, limit };
}
function runDiffCommand(args) {
  const opts = parseDiffArgs(args);
  const { key: repoKey } = deriveProjectKey(opts.cwd);
  const baseDir = repoDir(repoKey);
  const from = loadSnapshotByCommit(baseDir, opts.sha1);
  if (from === null) {
    console.error(`hivemind graph diff: snapshot not found for ${opts.sha1}`);
    console.error(`  expected: ${baseDir}/snapshots/${opts.sha1}.json`);
    console.error("  hint: run 'hivemind graph build' on the relevant commit, or check the commit sha");
    process.exit(1);
  }
  const to = loadSnapshotByCommit(baseDir, opts.sha2);
  if (to === null) {
    console.error(`hivemind graph diff: snapshot not found for ${opts.sha2}`);
    console.error(`  expected: ${baseDir}/snapshots/${opts.sha2}.json`);
    process.exit(1);
  }
  const diff = diffSnapshots(from, to);
  if (opts.json) {
    console.log(JSON.stringify(diff, null, 2));
    return;
  }
  console.log(`Diff: ${opts.sha1} \u2192 ${opts.sha2}`);
  console.log("");
  printDiffHuman(diff, opts.limit);
}
function parseBuildArgs(args) {
  let cwd = process.cwd();
  let trigger = "manual";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1];
      i += 1;
    } else if (a === "--trigger" && i + 1 < args.length) {
      const v = args[i + 1];
      if (v === "manual" || v === "session-end" || v === "post-commit" || v === "unknown") {
        trigger = v;
      } else {
        console.error(`hivemind graph build: --trigger must be one of manual|session-end|post-commit|unknown (got '${v}')`);
        process.exit(2);
      }
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph build: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd, trigger };
}
async function runBuildCommand(args) {
  const opts = parseBuildArgs(args);
  const cwd = resolve4(opts.cwd);
  const { key: repoKey, project } = deriveProjectKey(cwd);
  const baseDir = repoDir(repoKey);
  const commitSha = readGitCommit(cwd);
  const branch = readGitBranch(cwd);
  const version = getVersion();
  console.log(`Building codebase graph for ${project}`);
  console.log(`  repo_key:   ${repoKey}`);
  console.log(`  commit_sha: ${commitSha ?? "(not in a git repo)"}`);
  console.log(`  branch:     ${branch ?? "(none / detached)"}`);
  console.log(`  output:     ${baseDir}`);
  console.log("");
  const ignoreConfig = loadGraphIgnore();
  const sourceFiles = discoverSourceFiles(cwd, ignoreConfig);
  console.log(`Discovered ${sourceFiles.length} source files. Extracting...`);
  const extractions = [];
  let skipped = 0;
  let totalParseErrors = 0;
  let cacheHits = 0;
  for (const abs of sourceFiles) {
    const rel = toForwardSlash(relative(cwd, abs));
    try {
      const content = readFileSync21(abs, "utf8");
      const contentSha = fileContentHash(content);
      let extraction = readCache(baseDir, contentSha, rel);
      if (extraction === null) {
        extraction = extractFile(content, rel);
        writeCache(baseDir, contentSha, extraction);
      } else {
        cacheHits += 1;
      }
      if (extraction.parse_errors.length > 0) {
        totalParseErrors += extraction.parse_errors.length;
        for (const err of extraction.parse_errors) {
          console.warn(`  warn: parse issue in ${err.source_file} ${err.location ?? ""}: ${err.message}`);
        }
      }
      extractions.push(extraction);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  warn: skipping ${rel}: ${msg}`);
      skipped += 1;
    }
  }
  const metadata = {
    schema_version: 1,
    generator: "hivemind-graph",
    commit_sha: commitSha,
    repo_key: repoKey
  };
  const observation = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    branch,
    worktree_path: cwd,
    repo_project: project,
    generator_version: version,
    source_files_extracted: extractions.length,
    source_files_skipped: skipped
  };
  const snapshot = buildSnapshot(extractions, metadata, observation);
  const worktreeId = workTreeIdFor2(cwd);
  const result = writeSnapshot(snapshot, baseDir, opts.trigger, worktreeId);
  console.log("");
  console.log(`Snapshot:      ${result.snapshotPath}`);
  console.log(`Latest:        ${result.latestCommitPath ?? "(no commit context \u2014 latest-commit.txt not updated)"}`);
  console.log(`SHA-256:       ${result.snapshotSha256}`);
  console.log(`Nodes:         ${snapshot.nodes.length}`);
  console.log(`Edges:         ${snapshot.links.length}`);
  console.log(`Files extracted: ${extractions.length} (skipped: ${skipped}, parse warnings: ${totalParseErrors}, cache hits: ${cacheHits}/${sourceFiles.length})`);
  const pushOutcome = await pushSnapshot(snapshot, worktreeId);
  switch (pushOutcome.kind) {
    case "inserted":
      console.log(`Cloud:         pushed to codebase table (commit ${pushOutcome.commitSha.slice(0, 7)})`);
      break;
    case "inserted-with-duplicate-race":
      console.warn(`Cloud:         pushed (commit ${pushOutcome.commitSha.slice(0, 7)}) but ${pushOutcome.rowCount} rows now share`);
      console.warn(`               this identity key \u2014 a concurrent writer raced. v1.1 adds a server-side`);
      console.warn(`               UNIQUE constraint; until then, the older row(s) should be deleted manually.`);
      break;
    case "already-current":
      console.log(`Cloud:         already up-to-date (commit ${pushOutcome.commitSha.slice(0, 7)})`);
      break;
    case "skipped-no-auth":
      console.log(`Cloud:         skipped (not authenticated; run \`hivemind login\` to enable cloud sync)`);
      break;
    case "skipped-no-commit":
      console.log(`Cloud:         skipped (no commit context \u2014 not in a git repo)`);
      break;
    case "skipped-disabled":
      console.log(`Cloud:         skipped (HIVEMIND_GRAPH_PUSH=0)`);
      break;
    case "drift":
      console.warn(`Cloud:         DRIFT \u2014 commit ${pushOutcome.commitSha.slice(0, 7)} is in cloud with`);
      console.warn(`               sha256=${pushOutcome.cloudSha256.slice(0, 12)}... but local rebuild produced`);
      console.warn(`               sha256=${pushOutcome.localSha256.slice(0, 12)}...`);
      console.warn(`               (probably extractor version drift; investigate before forcing.)`);
      break;
    case "error":
      console.warn(`Cloud:         push error (non-fatal): ${pushOutcome.message}`);
      break;
  }
}
function parsePullArgs(args) {
  let cwd = process.cwd();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1];
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph pull: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd };
}
async function runPullCommand(args) {
  const opts = parsePullArgs(args);
  const outcome = await pullSnapshot(opts.cwd);
  switch (outcome.kind) {
    case "pulled":
      console.log(`Pulled commit ${outcome.commitSha.slice(0, 7)}`);
      console.log(`  sha256:  ${outcome.snapshotSha256.slice(0, 12)}...`);
      console.log(`  bytes:   ${outcome.bytes}`);
      console.log(`  origin:  worktree_id=${outcome.sourceWorktreePath}`);
      console.log(`  cloud ts: ${new Date(outcome.cloudTs).toISOString()}`);
      break;
    case "up-to-date":
      console.log(`Already up-to-date (commit ${outcome.commitSha.slice(0, 7)}, sha256 ${outcome.snapshotSha256.slice(0, 12)}...)`);
      break;
    case "local-newer":
      console.log(`Local is newer than cloud \u2014 not pulling.`);
      console.log(`  commit:   ${outcome.commitSha.slice(0, 7)}`);
      console.log(`  local ts: ${new Date(outcome.localTs).toISOString()}`);
      console.log(`  cloud ts: ${new Date(outcome.cloudTs).toISOString()}`);
      break;
    case "no-cloud-row":
      console.log(`No cloud snapshot for commit ${outcome.commitSha.slice(0, 7)} \u2014 run \`hivemind graph build\` to create one.`);
      break;
    case "skipped-no-auth":
      console.log(`Skipped: not authenticated (run \`hivemind login\`).`);
      break;
    case "skipped-disabled":
      console.log(`Skipped: HIVEMIND_GRAPH_PULL=0.`);
      break;
    case "skipped-no-head":
      console.log(`Skipped: not in a git repo (\`git rev-parse HEAD\` failed).`);
      break;
    case "error":
      console.warn(`Pull error (non-fatal): ${outcome.message}`);
      process.exitCode = 1;
      break;
  }
}
function workTreeIdFor2(cwd) {
  return createHash6("sha256").update(cwd).digest("hex").slice(0, 16);
}
function discoverSourceFiles(rootDir, config) {
  const ignore = ignoreDirSet(config);
  if (config.respectGitignore) {
    const fromGit = gitListSourceFiles(rootDir, ignore);
    if (fromGit !== null)
      return fromGit;
  }
  const out = [];
  walk(rootDir, out, ignore);
  out.sort();
  return out;
}
function gitListSourceFiles(rootDir, ignore) {
  let stdout;
  try {
    stdout = execSync3("git ls-files --cached --others --exclude-standard -z", {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024
    });
  } catch {
    return null;
  }
  const out = [];
  for (const rel of stdout.split("\0")) {
    if (rel.length === 0)
      continue;
    if (!isSourceFile(rel))
      continue;
    if (pathHasIgnoredSegment(rel, ignore))
      continue;
    out.push(join28(rootDir, rel));
  }
  out.sort();
  return out;
}
function walk(dir, out, ignore) {
  let entries;
  try {
    entries = readdirSync2(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (ignore.has(entry.name))
      continue;
    if (entry.name.startsWith("."))
      continue;
    const abs = join28(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out, ignore);
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      out.push(abs);
    }
  }
}
function isSourceFile(name) {
  if (name.endsWith(".d.ts"))
    return false;
  return /\.(tsx?|jsx?|mjs|cjs|pyi?|go|rs|java|rb|cpp|cc|cxx|hpp|[ch])$/.test(name.toLowerCase());
}
function toForwardSlash(p) {
  return sep === "\\" ? p.replace(/\\/g, "/") : p;
}
function readGitCommit(cwd) {
  try {
    return execSync3("git rev-parse HEAD", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}
function readGitBranch(cwd) {
  try {
    const out = execSync3("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return out === "" || out === "HEAD" ? null : out;
  } catch {
    return null;
  }
}

// dist/src/commands/dashboard.js
import { mkdirSync as mkdirSync18, writeFileSync as writeFileSync20 } from "node:fs";
import { homedir as homedir16 } from "node:os";
import { dirname as dirname13, join as join36, resolve as resolve5 } from "node:path";

// dist/src/dashboard/data.js
import { existsSync as existsSync25, readFileSync as readFileSync25, readdirSync as readdirSync4, statSync as statSync3 } from "node:fs";
import { homedir as homedir15 } from "node:os";
import { join as join34 } from "node:path";

// dist/src/notifications/sources/org-stats.js
import { existsSync as existsSync21, mkdirSync as mkdirSync15, readFileSync as readFileSync22, writeFileSync as writeFileSync18 } from "node:fs";
import { homedir as homedir12 } from "node:os";
import { dirname as dirname10, join as join29 } from "node:path";
var log5 = (msg) => log2("notifications-org-stats", msg);
var FETCH_TIMEOUT_MS = 1500;
var DEFAULT_API_URL3 = "https://api.deeplake.ai";
var CACHE_TTL_MS = 60 * 60 * 1e3;
function cacheFilePath() {
  return join29(homedir12(), ".deeplake", "hivemind-stats-cache.json");
}
var BALANCE_HEADER = "X-Activeloop-Balance-Cents";
function parseBalanceHeader(resp) {
  const raw = resp.headers?.get?.(BALANCE_HEADER);
  if (!raw || !/^-?\d+$/.test(raw.trim()))
    return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : null;
}
function cacheScopeKey(creds) {
  return JSON.stringify({
    apiUrl: creds.apiUrl ?? DEFAULT_API_URL3,
    orgId: creds.orgId ?? "",
    userName: creds.userName ?? ""
  });
}
function scopeFromServer(s) {
  const n = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  return {
    sessionsCount: n(s?.sessions_count),
    memoryRecallCount: n(s?.memory_recall_count),
    memorySearchBytes: n(s?.memory_search_bytes)
  };
}
function readCache2(scopeKey) {
  if (!existsSync21(cacheFilePath()))
    return {};
  try {
    const parsed = JSON.parse(readFileSync22(cacheFilePath(), "utf-8"));
    if (!parsed || typeof parsed !== "object")
      return {};
    if (parsed.scopeKey !== scopeKey)
      return {};
    if (typeof parsed.fetchedAt !== "number")
      return {};
    const age = Date.now() - parsed.fetchedAt;
    const data = parsed.data;
    if (!data || typeof data !== "object" || !data.org || !data.user)
      return {};
    if (age >= 0 && age < CACHE_TTL_MS)
      return { fresh: data };
    return { stale: data };
  } catch (e) {
    log5(`cache read failed: ${e?.message ?? String(e)}`);
    return {};
  }
}
function writeCache2(scopeKey, data) {
  try {
    mkdirSync15(dirname10(cacheFilePath()), { recursive: true });
    const body = { fetchedAt: Date.now(), scopeKey, data };
    writeFileSync18(cacheFilePath(), JSON.stringify(body), "utf-8");
  } catch (e) {
    log5(`cache write failed: ${e?.message ?? String(e)}`);
  }
}
async function fetchOrgStats(creds) {
  if (!creds?.token)
    return null;
  const apiUrl = creds.apiUrl ?? DEFAULT_API_URL3;
  const scopeKey = cacheScopeKey(creds);
  const { fresh, stale } = readCache2(scopeKey);
  if (fresh) {
    log5("cache hit \u2014 returning fresh org stats");
    return fresh;
  }
  const url = `${apiUrl}/me/hivemind-stats`;
  const ctrl = new AbortController();
  const timeoutHandle = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${creds.token}`,
        ...creds.orgId ? { "X-Activeloop-Org-Id": creds.orgId } : {}
      },
      signal: ctrl.signal
    });
    if (!resp.ok) {
      log5(`fetch ${url} returned ${resp.status}`);
      return stale ?? null;
    }
    const body = await resp.json();
    if (!body || typeof body !== "object") {
      log5(`fetch ${url} returned malformed body`);
      return stale ?? null;
    }
    const data = {
      org: scopeFromServer(body.org),
      user: scopeFromServer(body.user),
      balanceCents: parseBalanceHeader(resp)
    };
    writeCache2(scopeKey, data);
    log5(`fetched org stats from ${apiUrl}`);
    return data;
  } catch (e) {
    log5(`fetch ${url} failed: ${e?.message ?? String(e)}`);
    return stale ?? null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// dist/src/notifications/usage-tracker.js
import { appendFileSync as appendFileSync3, existsSync as existsSync22, mkdirSync as mkdirSync16, readFileSync as readFileSync23, readdirSync as readdirSync3 } from "node:fs";
import { dirname as dirname11, join as join30 } from "node:path";
import { homedir as homedir13 } from "node:os";
var log6 = (msg) => log2("usage-tracker", msg);
function statsFilePath() {
  return join30(homedir13(), ".deeplake", "usage-stats.jsonl");
}
function readUsageRecords() {
  try {
    if (!existsSync22(statsFilePath()))
      return [];
    const raw = readFileSync23(statsFilePath(), "utf-8");
    const out = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed)
        continue;
      try {
        const rec = JSON.parse(trimmed);
        if (typeof rec.endedAt === "string" && typeof rec.sessionId === "string") {
          out.push({
            endedAt: rec.endedAt,
            sessionId: rec.sessionId,
            memorySearchBytes: typeof rec.memorySearchBytes === "number" ? rec.memorySearchBytes : 0,
            memorySearchCount: typeof rec.memorySearchCount === "number" ? rec.memorySearchCount : 0
          });
        }
      } catch {
      }
    }
    return out;
  } catch (e) {
    log6(`readUsageRecords failed: ${e?.message ?? String(e)}`);
    return [];
  }
}
function sumMetric(records, key) {
  let total = 0;
  for (const r of records) {
    const v = r[key];
    if (typeof v === "number" && Number.isFinite(v))
      total += v;
  }
  return total;
}
function countUserGeneratedSkills(userName) {
  if (!userName)
    return 0;
  const dir = join30(homedir13(), ".claude", "skills");
  if (!existsSync22(dir))
    return 0;
  const suffix = `--${userName}`;
  try {
    let count = 0;
    for (const name of readdirSync3(dir)) {
      const idx = name.lastIndexOf(suffix);
      if (idx > 0 && idx + suffix.length === name.length)
        count += 1;
    }
    return count;
  } catch (e) {
    log6(`countUserGeneratedSkills readdir failed: ${e?.message ?? String(e)}`);
    return 0;
  }
}

// dist/src/skillify/state.js
import { readFileSync as readFileSync24, writeFileSync as writeFileSync19, writeSync, mkdirSync as mkdirSync17, renameSync as renameSync9, rmdirSync, existsSync as existsSync24, lstatSync as lstatSync6, unlinkSync as unlinkSync9, openSync as openSync2, closeSync as closeSync2 } from "node:fs";
import { join as join33 } from "node:path";

// dist/src/skillify/legacy-migration.js
import { existsSync as existsSync23, renameSync as renameSync8 } from "node:fs";
import { dirname as dirname12, join as join32 } from "node:path";

// dist/src/skillify/state-dir.js
import { homedir as homedir14 } from "node:os";
import { join as join31 } from "node:path";
function getStateDir() {
  const override = process.env.HIVEMIND_STATE_DIR?.trim();
  return override && override.length > 0 ? override : join31(homedir14(), ".deeplake", "state", "skillify");
}

// dist/src/skillify/legacy-migration.js
var dlog = (msg) => log2("skillify-migrate", msg);
var attempted = false;
function migrateLegacyStateDir() {
  if (process.env.HIVEMIND_STATE_DIR?.trim())
    return;
  if (attempted)
    return;
  attempted = true;
  const current = getStateDir();
  const legacy = join32(dirname12(current), "skilify");
  if (!existsSync23(legacy))
    return;
  if (existsSync23(current))
    return;
  try {
    renameSync8(legacy, current);
    dlog(`migrated ${legacy} -> ${current}`);
  } catch (err) {
    const code = err.code;
    if (code === "EXDEV" || code === "EPERM" || code === "ENOENT" || code === "EEXIST" || code === "ENOTEMPTY") {
      dlog(`migration skipped (${code}); legacy dir left as-is or another process handled it`);
      return;
    }
    throw err;
  }
}

// dist/src/skillify/state.js
var YIELD_BUF = new Int32Array(new SharedArrayBuffer(4));
var TRIGGER_THRESHOLD = (() => {
  const n = Number(process.env.HIVEMIND_SKILLIFY_EVERY_N_TURNS ?? "");
  return Number.isInteger(n) && n > 0 ? n : 20;
})();

// dist/src/dashboard/data.js
var log7 = (msg) => log2("dashboard-data", msg);
var BYTES_PER_TOKEN = 4;
var SAVINGS_MULTIPLIER = 1.7;
function graphsRoot2() {
  return process.env.HIVEMIND_GRAPHS_HOME ?? join34(homedir15(), ".hivemind", "graphs");
}
function bytesToSavedTokens(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0)
    return 0;
  const delivered = bytes / BYTES_PER_TOKEN;
  return (SAVINGS_MULTIPLIER - 1) * delivered;
}
function resolveSnapshot(repoDir2) {
  const snapshotsDir = join34(repoDir2, "snapshots");
  if (!existsSync25(snapshotsDir))
    return null;
  let snapshotPath = null;
  const pointer = join34(repoDir2, "latest-commit.txt");
  if (existsSync25(pointer)) {
    try {
      const sha = readFileSync25(pointer, "utf-8").trim();
      if (sha) {
        const candidate = join34(snapshotsDir, `${sha}.json`);
        if (existsSync25(candidate))
          snapshotPath = candidate;
        else
          log7(`latest-commit.txt points at missing ${sha}.json \u2014 scanning snapshots/`);
      }
    } catch (e) {
      log7(`latest-commit.txt read failed: ${e?.message ?? String(e)}`);
    }
  }
  if (!snapshotPath) {
    try {
      const candidates = readdirSync4(snapshotsDir).filter((name) => name.endsWith(".json")).map((name) => {
        const full = join34(snapshotsDir, name);
        return { full, mtime: statSync3(full).mtimeMs };
      }).sort((a, b) => b.mtime - a.mtime);
      if (candidates.length > 0)
        snapshotPath = candidates[0].full;
    } catch (e) {
      log7(`snapshots/ scan failed: ${e?.message ?? String(e)}`);
    }
  }
  if (!snapshotPath)
    return null;
  let raw;
  try {
    raw = readFileSync25(snapshotPath, "utf-8");
  } catch (e) {
    log7(`snapshot read failed: ${e?.message ?? String(e)}`);
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    log7(`snapshot parse failed: ${e?.message ?? String(e)}`);
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) {
    log7("snapshot shape invalid (missing nodes/links arrays)");
    return null;
  }
  return {
    commitSha: parsed.graph?.commit_sha ?? null,
    snapshotPath,
    nodeCount: parsed.nodes.length,
    edgeCount: parsed.links.length,
    snapshot: parsed
  };
}
async function loadKpis(creds) {
  const userName = creds?.userName;
  const skillsCreated = countUserGeneratedSkills(userName);
  const records = readUsageRecords();
  const localBytes = sumMetric(records, "memorySearchBytes");
  const localCount = sumMetric(records, "memorySearchCount");
  let orgStats = null;
  if (creds?.token) {
    try {
      orgStats = await fetchOrgStats(creds);
    } catch (e) {
      log7(`fetchOrgStats threw: ${e?.message ?? String(e)}`);
    }
  }
  if (orgStats) {
    return {
      tokensSaved: bytesToSavedTokens(orgStats.org.memorySearchBytes),
      tokensSource: "org",
      skillsCreated,
      memorySearches: orgStats.org.memoryRecallCount,
      sessionsCount: orgStats.org.sessionsCount,
      userTokensSaved: bytesToSavedTokens(orgStats.user.memorySearchBytes)
    };
  }
  if (records.length > 0) {
    return {
      tokensSaved: bytesToSavedTokens(localBytes),
      tokensSource: "local",
      skillsCreated,
      memorySearches: localCount,
      sessionsCount: records.length,
      userTokensSaved: bytesToSavedTokens(localBytes)
    };
  }
  return {
    tokensSaved: null,
    tokensSource: "none",
    skillsCreated,
    memorySearches: 0,
    sessionsCount: null,
    userTokensSaved: null
  };
}
async function loadDashboardData(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const { key: repoKey, project: repoProject } = deriveProjectKey(cwd);
  const repoDir2 = join34(opts.graphsHome ?? graphsRoot2(), repoKey);
  const graph = resolveSnapshot(repoDir2);
  const creds = opts.creds === void 0 ? loadCredentials() : opts.creds;
  const kpis = await loadKpis(creds);
  return {
    repoKey,
    repoProject,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    kpis,
    graph
  };
}

// dist/src/dashboard/open.js
import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants, statSync as statSync4 } from "node:fs";
import { platform as nodePlatform } from "node:os";
import { delimiter, join as join35 } from "node:path";
function resolveOpenPlatform() {
  const p = nodePlatform();
  if (p === "linux" || p === "darwin" || p === "win32")
    return p;
  return null;
}
function openCommandFor(p, path) {
  switch (p) {
    case "linux":
      return { command: "xdg-open", args: [path] };
    case "darwin":
      return { command: "open", args: [path] };
    case "win32":
      return { command: "cmd", args: ["/c", "start", "", path] };
  }
}
function findBinaryOnPath(name) {
  const PATH = process.env.PATH ?? "";
  if (!PATH)
    return null;
  const isWin = nodePlatform() === "win32";
  const exts = isWin ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").map((e) => e.trim()).filter(Boolean) : [""];
  for (const dir of PATH.split(delimiter)) {
    if (!dir)
      continue;
    for (const ext of exts) {
      const candidate = join35(dir, name + ext);
      try {
        const st = statSync4(candidate);
        if (!st.isFile())
          continue;
        if (isWin)
          return candidate;
        try {
          accessSync(candidate, fsConstants.X_OK);
          return candidate;
        } catch {
        }
      } catch {
      }
    }
  }
  return null;
}
function openInBrowser(path, opts = {}) {
  const p = opts.platformOverride === void 0 ? resolveOpenPlatform() : opts.platformOverride;
  if (!p)
    return { attempted: false };
  const { command, args } = openCommandFor(p, path);
  const exists = opts.binaryExists ?? ((cmd) => findBinaryOnPath(cmd) !== null);
  if (!exists(command))
    return { attempted: false };
  const useSpawn = opts.spawner ?? spawn;
  try {
    const child = useSpawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
    });
    if (typeof child.unref === "function") {
      child.unref();
    }
    return { attempted: true, command };
  } catch {
    return { attempted: false };
  }
}
function isRemoteSession(env = process.env) {
  return !!(env.SSH_CLIENT || env.SSH_TTY || env.VSCODE_INJECTION || env.CODESPACES);
}

// dist/src/dashboard/render.js
var VIS_NETWORK_CDN = "https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js";
var KIND_COLORS = {
  function: "#7aa2f7",
  // soft blue
  class: "#bb9af7",
  // purple
  method: "#9ece6a",
  // green
  interface: "#e0af68",
  // amber
  type_alias: "#7dcfff",
  // cyan
  enum: "#f7768e",
  // pink
  const: "#9d7cd8",
  // muted purple
  module: "#565f89"
  // slate
};
var DEFAULT_NODE_COLOR = "#565f89";
function isObject2(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function asString(v) {
  return typeof v === "string" ? v : null;
}
function transformSnapshotToVis(snapshot) {
  if (!isObject2(snapshot))
    return { nodes: [], edges: [] };
  const raw = snapshot;
  const visNodes = [];
  const ids = /* @__PURE__ */ new Set();
  if (Array.isArray(raw.nodes)) {
    for (const n of raw.nodes) {
      if (!isObject2(n))
        continue;
      const node = n;
      const id = asString(node.id);
      if (!id)
        continue;
      if (ids.has(id))
        continue;
      ids.add(id);
      const label = asString(node.label) ?? id;
      const kind = asString(node.kind);
      const sourceFile = asString(node.source_file);
      const sourceLoc = asString(node.source_location);
      const titleParts = [];
      if (kind)
        titleParts.push(kind);
      if (sourceFile) {
        const loc2 = sourceLoc ? `${sourceFile}:${sourceLoc}` : sourceFile;
        titleParts.push(loc2);
      }
      const color = kind && KIND_COLORS[kind] ? KIND_COLORS[kind] : DEFAULT_NODE_COLOR;
      visNodes.push({
        id,
        label,
        title: titleParts.length > 0 ? titleParts.map(escHtml).join(" \xB7 ") : escHtml(id),
        group: kind ?? void 0,
        color: { background: color, border: color }
      });
    }
  }
  const visEdges = [];
  if (Array.isArray(raw.links)) {
    for (const l of raw.links) {
      if (!isObject2(l))
        continue;
      const edge = l;
      const from = asString(edge.source);
      const to = asString(edge.target);
      if (!from || !to)
        continue;
      const relation = asString(edge.relation);
      const confidence = asString(edge.confidence);
      const titleParts = [];
      if (relation)
        titleParts.push(relation);
      if (confidence)
        titleParts.push(`[${confidence}]`);
      visEdges.push({
        from,
        to,
        title: titleParts.length > 0 ? titleParts.map(escHtml).join(" ") : `${escHtml(from)} \u2192 ${escHtml(to)}`
      });
    }
  }
  return { nodes: visNodes, edges: visEdges };
}
function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function safeJsonForScript(value) {
  return JSON.stringify(value).replace(/<\//g, "<\\/").replace(/<!--/g, "<\\u0021--").replace(/-->/g, "--\\u003e");
}
function formatTokensCompact(n) {
  if (!Number.isFinite(n) || n <= 0)
    return "0";
  if (n < 1e3)
    return `${Math.round(n)}`;
  if (n < 1e5)
    return `${(n / 1e3).toFixed(1)}k`;
  if (n < 1e6)
    return `${Math.round(n / 1e3)}k`;
  return `${(n / 1e6).toFixed(1)}M`;
}
function formatInt(n) {
  if (!Number.isFinite(n))
    return "0";
  return Math.round(n).toLocaleString("en-US");
}
function renderKpiCards(kpis) {
  const tokensValue = kpis.tokensSaved == null ? "\u2014" : `~${formatTokensCompact(kpis.tokensSaved)}`;
  const tokensSub = (() => {
    if (kpis.tokensSource === "org") {
      return kpis.userTokensSaved != null ? `Org-wide \xB7 you ~${formatTokensCompact(kpis.userTokensSaved)}` : "Org-wide";
    }
    if (kpis.tokensSource === "local")
      return "Local (this machine)";
    return "Run a session to start tracking";
  })();
  const memoryValue = kpis.memorySearches > 0 ? formatInt(kpis.memorySearches) : kpis.tokensSource === "none" ? "\u2014" : "0";
  const sessionsValue = kpis.sessionsCount == null ? "\u2014" : formatInt(kpis.sessionsCount);
  const cards = [
    {
      label: "Tokens saved",
      value: tokensValue,
      sub: tokensSub
    },
    {
      label: "Skills created",
      value: formatInt(kpis.skillsCreated),
      sub: "~/.claude/skills/"
    },
    {
      label: "Memory recalls",
      value: memoryValue,
      sub: kpis.tokensSource === "org" ? "Org-wide" : kpis.tokensSource === "local" ? "Local" : ""
    },
    {
      label: "Sessions",
      value: sessionsValue,
      sub: kpis.tokensSource === "org" ? "Org-wide" : kpis.tokensSource === "local" ? "Local" : ""
    }
  ];
  return cards.map((c) => `
        <div class="kpi">
          <div class="kpi-label">${escHtml(c.label)}</div>
          <div class="kpi-value">${escHtml(c.value)}</div>
          <div class="kpi-sub">${escHtml(c.sub)}</div>
        </div>`).join("");
}
function renderGraphSection(data) {
  if (data.graph == null) {
    return `
      <div class="graph-card">
        <h2>Codebase graph</h2>
        <div class="empty">
          No graph snapshot yet for this repo.<br>
          Run <code>hivemind graph build</code> to generate one.
        </div>
      </div>`;
  }
  const visPayload = transformSnapshotToVis(data.graph.snapshot);
  const commitLabel = data.graph.commitSha ? `commit ${data.graph.commitSha.slice(0, 12)}` : "no commit (loose dir)";
  const meta = `${formatInt(data.graph.nodeCount)} nodes \xB7 ${formatInt(data.graph.edgeCount)} edges \xB7 ${commitLabel}`;
  return `
      <div class="graph-card">
        <h2>Codebase graph</h2>
        <div class="graph-meta">${escHtml(meta)}</div>
        <div id="graph"></div>
      </div>
      <script type="application/json" id="hm-graph-data">${safeJsonForScript(visPayload)}</script>
      <script src="${VIS_NETWORK_CDN}"></script>
      <script>
        (function () {
          var holder = document.getElementById('hm-graph-data');
          var container = document.getElementById('graph');
          if (!holder || !container || typeof vis === 'undefined') return;
          var payload;
          try { payload = JSON.parse(holder.textContent); }
          catch (e) { container.textContent = 'graph payload parse failed'; return; }
          if (!payload || !Array.isArray(payload.nodes) || payload.nodes.length === 0) {
            container.textContent = 'snapshot has no nodes';
            return;
          }
          new vis.Network(container, payload, {
            nodes: {
              shape: 'dot',
              size: 9,
              font: { color: '#e8eaed', size: 11, face: 'system-ui, sans-serif' },
              borderWidth: 1,
            },
            edges: {
              color: { color: 'rgba(120, 130, 150, 0.45)', highlight: '#f5b80a', hover: '#e8eaed' },
              arrows: { to: { enabled: true, scaleFactor: 0.45 } },
              smooth: { enabled: true, type: 'continuous', roundness: 0.2 },
              width: 1,
            },
            physics: {
              stabilization: { iterations: 120 },
              barnesHut: { gravitationalConstant: -2200, springLength: 80, springConstant: 0.04 },
            },
            interaction: { hover: true, dragNodes: true, tooltipDelay: 120 },
          });
        }());
      </script>`;
}
var STYLES = `
        :root {
          color-scheme: dark;
          --bg: #0b0d10;
          --fg: #e8eaed;
          --muted: #8b9099;
          --accent: #f5b80a;
          --card: #15181d;
          --border: #22272e;
        }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body {
          font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: var(--bg);
          color: var(--fg);
          padding: 24px;
        }
        .header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
        .brand { font-weight: 600; font-size: 18px; }
        .brand .bee { color: var(--accent); margin-right: 4px; }
        .brand .repo { color: var(--muted); font-weight: 400; margin-left: 8px; }
        .header .ts { color: var(--muted); font-size: 12px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 32px; }
        .kpi { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; }
        .kpi-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
        .kpi-value { font-size: 28px; font-weight: 600; margin-top: 6px; line-height: 1.1; }
        .kpi-sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
        .graph-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
        .graph-card h2 { margin: 0 0 8px; font-size: 15px; font-weight: 500; }
        .graph-meta { color: var(--muted); font-size: 12px; margin-bottom: 12px; }
        #graph { height: 70vh; border: 1px solid var(--border); border-radius: 4px; background: #0e1116; }
        .empty { padding: 48px 16px; text-align: center; color: var(--muted); }
        .empty code { background: #1c2128; padding: 2px 6px; border-radius: 3px; color: var(--fg); font-family: ui-monospace, "SFMono-Regular", monospace; }
        .footer { color: var(--muted); font-size: 11px; margin-top: 24px; text-align: right; }
`;
function renderDashboardHtml(data) {
  const title = `Hivemind Dashboard \xB7 ${data.repoProject}`;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escHtml(title)}</title>
    <style>${STYLES}</style>
  </head>
  <body>
    <div class="header">
      <div class="brand">
        <span class="bee">\u{1F41D}</span>hivemind dashboard
        <span class="repo">/ ${escHtml(data.repoProject)}</span>
      </div>
      <div class="ts">${escHtml(data.generatedAt)}</div>
    </div>
    <div class="kpi-grid">${renderKpiCards(data.kpis)}
    </div>
    ${renderGraphSection(data)}
    <div class="footer">repo_key ${escHtml(data.repoKey)}</div>
  </body>
</html>
`;
}

// dist/src/dashboard/serve.js
import { createServer } from "node:http";
var DEFAULT_PORT = 8123;
var DEFAULT_HOST = "127.0.0.1";
function handleRequest(html) {
  return (req, res) => {
    const url = req.url ?? "/";
    const path = url.split("?")[0];
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(html);
      return;
    }
    if (req.method === "GET" && path === "/health") {
      res.statusCode = 204;
      res.end();
      return;
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found. The dashboard lives at /.\n");
  };
}
function tryListen(server, host, port) {
  return new Promise((resolve6, reject) => {
    const onError = (err) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("server bound to a non-IP address"));
        return;
      }
      resolve6(addr.port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}
async function serveDashboardHtml(opts) {
  const host = opts.host ?? DEFAULT_HOST;
  const requested = opts.port === void 0 || !Number.isFinite(opts.port) || opts.port < 0 ? DEFAULT_PORT : opts.port;
  const server = createServer(handleRequest(opts.html));
  let bound;
  try {
    bound = await tryListen(server, host, requested);
  } catch (e) {
    if (e?.code !== "EADDRINUSE")
      throw e;
    const fallback = createServer(handleRequest(opts.html));
    bound = await tryListen(fallback, host, 0);
    server.removeAllListeners();
    return makeHandle(fallback, host, bound);
  }
  return makeHandle(server, host, bound);
}
function makeHandle(server, host, port) {
  let resolveStopped;
  const stopped = new Promise((resolve6) => {
    resolveStopped = resolve6;
  });
  server.on("close", () => resolveStopped());
  return {
    host,
    port,
    stopped,
    close: () => new Promise((resolve6, reject) => {
      server.close((err) => err ? reject(err) : resolve6());
    })
  };
}

// dist/src/commands/dashboard.js
var USAGE2 = `hivemind dashboard \u2014 codebase graph + KPI dashboard (HTML)

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
                     Remote-SSH (auto-forwards the port \u2192 click to
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
function parsePort(raw) {
  if (raw === void 0 || raw === "")
    return { error: "--port requires a value" };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    return { error: `--port must be an integer in [0, 65535], got '${raw}'` };
  }
  return n;
}
function parseDashboardArgs(args) {
  let cwd;
  let outPath = "";
  let open = true;
  let serve = false;
  let port;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h")
      return { help: true };
    if (a === "--no-open") {
      open = false;
      continue;
    }
    if (a === "--serve") {
      serve = true;
      continue;
    }
    if (a === "--cwd") {
      const v = args[++i];
      if (v === void 0 || v.startsWith("-")) {
        return { error: "--cwd requires a value" };
      }
      cwd = v;
      continue;
    }
    if (a.startsWith("--cwd=")) {
      cwd = a.slice("--cwd=".length);
      continue;
    }
    if (a === "--out") {
      const v = args[++i];
      if (v === void 0 || v.startsWith("-")) {
        return { error: "--out requires a value" };
      }
      outPath = v;
      continue;
    }
    if (a.startsWith("--out=")) {
      outPath = a.slice("--out=".length);
      continue;
    }
    if (a === "--port") {
      const v = args[++i];
      if (v === void 0 || v.startsWith("-")) {
        return { error: "--port requires a value" };
      }
      const parsed = parsePort(v);
      if (typeof parsed === "object")
        return { error: parsed.error };
      port = parsed;
      continue;
    }
    if (a.startsWith("--port=")) {
      const parsed = parsePort(a.slice("--port=".length));
      if (typeof parsed === "object")
        return { error: parsed.error };
      port = parsed;
      continue;
    }
    return { error: `unknown arg '${a}'` };
  }
  if (port !== void 0 && !serve) {
    return { error: "--port requires --serve" };
  }
  return {
    args: {
      cwd: cwd ?? process.cwd(),
      outPath,
      open,
      serve,
      port
    }
  };
}
function defaultDashboardOutPath(repoKey) {
  return join36(homedir16(), ".hivemind", "dashboards", repoKey, "index.html");
}
async function runDashboardCommand(rawArgs, runOpts = {}) {
  const out = runOpts.out ?? ((s) => {
    process.stdout.write(s);
  });
  const err = runOpts.err ?? ((s) => {
    process.stderr.write(s);
  });
  const opener = runOpts.opener ?? openInBrowser;
  const parsed = parseDashboardArgs(rawArgs);
  if (parsed.help) {
    out(USAGE2);
    return 0;
  }
  if (parsed.error || !parsed.args) {
    err(`hivemind dashboard: ${parsed.error ?? "invalid arguments"}
`);
    err(USAGE2);
    return 2;
  }
  const { cwd, outPath, open } = parsed.args;
  let data;
  try {
    data = await loadDashboardData({ cwd });
  } catch (e) {
    err(`hivemind dashboard: failed to load data: ${e?.message ?? String(e)}
`);
    return 1;
  }
  const html = renderDashboardHtml(data);
  const finalOut = outPath || defaultDashboardOutPath(data.repoKey);
  const absOut = resolve5(finalOut);
  try {
    mkdirSync18(dirname13(absOut), { recursive: true });
    writeFileSync20(absOut, html, "utf-8");
  } catch (e) {
    err(`hivemind dashboard: failed to write ${absOut}: ${e?.message ?? String(e)}
`);
    return 1;
  }
  out(`Wrote ${absOut}
`);
  if (data.graph == null) {
    out(`(no codebase graph yet \u2014 run 'hivemind graph build' to populate)
`);
  }
  const remote = runOpts.isRemote ?? isRemoteSession();
  const autoServe = !parsed.args.serve && open && remote;
  if (parsed.args.serve || autoServe) {
    if (autoServe) {
      out(`(remote session detected \u2014 serving over localhost instead of opening a file)
`);
    }
    return await runServeLoop(html, parsed.args, runOpts, out, err);
  }
  if (open) {
    const result = opener(absOut);
    if (result.attempted) {
      out(`Opening via ${result.command}
`);
    } else {
      out(`(no browser opener found \u2014 starting local server instead)
`);
      return await runServeLoop(html, parsed.args, runOpts, out, err);
    }
  }
  return 0;
}
async function runServeLoop(html, args, runOpts, out, err) {
  const server = runOpts.server ?? serveDashboardHtml;
  const opener = runOpts.opener ?? openInBrowser;
  const onSignal = runOpts.onSignal ?? defaultOnSignal;
  let handle;
  try {
    handle = await server({ html, port: args.port });
  } catch (e) {
    err(`hivemind dashboard: failed to start server: ${e?.message ?? String(e)}
`);
    return 1;
  }
  const url = `http://${handle.host}:${handle.port}/`;
  out(`Serving dashboard at ${url}  (Ctrl+C to stop)
`);
  if (args.open) {
    const result = opener(url);
    if (result.attempted) {
      out(`Opening via ${result.command}
`);
    } else {
      out(`(no opener for this platform; click the URL above or open it manually)
`);
    }
  }
  let resolveDone;
  const done = new Promise((r) => {
    resolveDone = r;
  });
  const shutdown = async () => {
    try {
      await handle.close();
    } catch {
    }
    resolveDone(0);
  };
  const offInt = onSignal("SIGINT", shutdown);
  const offTerm = onSignal("SIGTERM", shutdown);
  handle.stopped.then(() => resolveDone(0));
  try {
    return await done;
  } finally {
    offInt();
    offTerm();
  }
}
function defaultOnSignal(signal, handler) {
  process.on(signal, handler);
  return () => process.off(signal, handler);
}

// dist/src/commands/skillify.js
import { readdirSync as readdirSync8, existsSync as existsSync36, readFileSync as readFileSync33, mkdirSync as mkdirSync25, renameSync as renameSync12 } from "node:fs";
import { homedir as homedir25 } from "node:os";
import { dirname as dirname18, join as join47 } from "node:path";

// dist/src/skillify/scope-config.js
import { existsSync as existsSync26, mkdirSync as mkdirSync19, readFileSync as readFileSync26, writeFileSync as writeFileSync21 } from "node:fs";
import { join as join37 } from "node:path";
function configPath() {
  return join37(getStateDir(), "config.json");
}
var DEFAULT = { scope: "me", team: [], install: "project" };
function loadScopeConfig() {
  migrateLegacyStateDir();
  const CONFIG_PATH2 = configPath();
  if (!existsSync26(CONFIG_PATH2))
    return DEFAULT;
  try {
    const raw = JSON.parse(readFileSync26(CONFIG_PATH2, "utf-8"));
    const scope = raw.scope === "team" ? "team" : raw.scope === "org" ? "team" : "me";
    const team = Array.isArray(raw.team) ? raw.team.filter((s) => typeof s === "string") : [];
    const install = raw.install === "global" ? "global" : "project";
    return { scope, team, install };
  } catch {
    return DEFAULT;
  }
}
function saveScopeConfig(cfg) {
  migrateLegacyStateDir();
  mkdirSync19(getStateDir(), { recursive: true });
  writeFileSync21(configPath(), JSON.stringify(cfg, null, 2));
}

// dist/src/skillify/pull.js
import { existsSync as existsSync30, readFileSync as readFileSync29, writeFileSync as writeFileSync24, mkdirSync as mkdirSync22, renameSync as renameSync11, lstatSync as lstatSync8, readlinkSync as readlinkSync2, symlinkSync as symlinkSync2, unlinkSync as unlinkSync11 } from "node:fs";
import { homedir as homedir19 } from "node:os";
import { dirname as dirname15, join as join41 } from "node:path";

// dist/src/skillify/skill-writer.js
import { existsSync as existsSync27, mkdirSync as mkdirSync20, readFileSync as readFileSync27, readdirSync as readdirSync5, statSync as statSync5, writeFileSync as writeFileSync22 } from "node:fs";
import { homedir as homedir17 } from "node:os";
import { join as join38 } from "node:path";
function assertValidSkillName(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`invalid skill name: empty or non-string`);
  }
  if (name.length > 100) {
    throw new Error(`invalid skill name: too long (${name.length} chars)`);
  }
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error(`invalid skill name: contains path separator or '..': ${name}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`invalid skill name: must be kebab-case (lowercase a-z, 0-9, hyphen): ${name}`);
  }
}
function skillDir(skillsRoot, name) {
  return join38(skillsRoot, name);
}
function skillPath(skillsRoot, name) {
  return join38(skillDir(skillsRoot, name), "SKILL.md");
}
function renderFrontmatter(fm) {
  const lines = ["---"];
  lines.push(`name: ${fm.name}`);
  lines.push(`description: ${JSON.stringify(fm.description)}`);
  if (fm.trigger)
    lines.push(`trigger: ${JSON.stringify(fm.trigger)}`);
  if (fm.author)
    lines.push(`author: ${fm.author}`);
  lines.push(`source_sessions:`);
  for (const s of fm.source_sessions)
    lines.push(`  - ${s}`);
  if (fm.contributors && fm.contributors.length > 0) {
    lines.push(`contributors:`);
    for (const c of fm.contributors)
      lines.push(`  - ${c}`);
  }
  lines.push(`version: ${fm.version}`);
  lines.push(`created_by_agent: ${fm.created_by_agent}`);
  lines.push(`created_at: ${fm.created_at}`);
  lines.push(`updated_at: ${fm.updated_at}`);
  lines.push("---");
  return lines.join("\n");
}
function parseFrontmatter(text) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n"))
    return null;
  const end = text.indexOf("\n---", 4);
  if (end < 0)
    return null;
  const head = text.slice(4, end).trim();
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  const fm = { source_sessions: [] };
  let arrayKey = null;
  for (const raw of head.split(/\r?\n/)) {
    if (arrayKey) {
      const m2 = raw.match(/^\s+-\s+(.+)$/);
      if (m2) {
        const arr = fm[arrayKey] ?? [];
        arr.push(m2[1].trim());
        fm[arrayKey] = arr;
        continue;
      }
      arrayKey = null;
    }
    if (raw.startsWith("source_sessions:")) {
      arrayKey = "source_sessions";
      continue;
    }
    if (raw.startsWith("contributors:")) {
      arrayKey = "contributors";
      fm.contributors = [];
      continue;
    }
    const m = raw.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m)
      continue;
    const [, k, v] = m;
    let val = v;
    if (v.startsWith('"') && v.endsWith('"')) {
      try {
        val = JSON.parse(v);
      } catch {
      }
    } else if (k === "version") {
      const n = parseInt(v, 10);
      if (Number.isFinite(n))
        val = n;
    }
    fm[k] = val;
  }
  return { fm, body };
}
function writeNewSkill(args) {
  assertValidSkillName(args.name);
  const dir = skillDir(args.skillsRoot, args.name);
  const path = skillPath(args.skillsRoot, args.name);
  if (existsSync27(path)) {
    throw new Error(`skill already exists at ${path}; use mergeSkill`);
  }
  mkdirSync20(dir, { recursive: true });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const author = args.author && args.author.length > 0 ? args.author : void 0;
  const contributors = author ? [author] : [];
  const fm = {
    name: args.name,
    description: args.description,
    trigger: args.trigger,
    author,
    source_sessions: args.sourceSessions,
    contributors,
    version: 1,
    created_by_agent: args.agent,
    created_at: now,
    updated_at: now
  };
  const text = `${renderFrontmatter(fm)}

${args.body.trim()}
`;
  writeFileSync22(path, text);
  return {
    path,
    action: "created",
    version: 1,
    createdAt: now,
    updatedAt: now,
    author,
    contributors
  };
}
function listSkills(skillsRoot) {
  if (!existsSync27(skillsRoot))
    return [];
  const out = [];
  for (const name of readdirSync5(skillsRoot)) {
    const skillFile = join38(skillsRoot, name, "SKILL.md");
    if (existsSync27(skillFile) && statSync5(skillFile).isFile()) {
      out.push({ name, body: readFileSync27(skillFile, "utf-8") });
    }
  }
  return out;
}
function resolveSkillsRoot(install, cwd) {
  if (install === "global") {
    return join38(homedir17(), ".claude", "skills");
  }
  return join38(cwd, ".claude", "skills");
}

// dist/src/skillify/manifest.js
import { existsSync as existsSync28, lstatSync as lstatSync7, mkdirSync as mkdirSync21, readFileSync as readFileSync28, renameSync as renameSync10, unlinkSync as unlinkSync10, writeFileSync as writeFileSync23 } from "node:fs";
import { dirname as dirname14, join as join39 } from "node:path";
function emptyManifest() {
  return { version: 1, entries: [] };
}
function manifestPath() {
  return join39(getStateDir(), "pulled.json");
}
function loadManifest(path = manifestPath()) {
  migrateLegacyStateDir();
  if (!existsSync28(path))
    return emptyManifest();
  let raw;
  try {
    raw = readFileSync28(path, "utf-8");
  } catch {
    return emptyManifest();
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object")
      return emptyManifest();
    if (parsed.version !== 1 || !Array.isArray(parsed.entries))
      return emptyManifest();
    const entries = [];
    for (const e of parsed.entries) {
      if (!e || typeof e !== "object")
        continue;
      if (typeof e.dirName !== "string" || !e.dirName)
        continue;
      if (e.dirName.includes("/") || e.dirName.includes("\\") || e.dirName.includes(".."))
        continue;
      if (typeof e.name !== "string" || !e.name)
        continue;
      if (typeof e.author !== "string")
        continue;
      if (typeof e.installRoot !== "string" || !e.installRoot)
        continue;
      if (e.install !== "global" && e.install !== "project")
        continue;
      const symlinks = Array.isArray(e.symlinks) ? e.symlinks.filter((p) => typeof p === "string" && p.length > 0 && (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p)) && // absolute (POSIX or Windows)
      !p.includes("..")) : [];
      entries.push({
        dirName: e.dirName,
        name: e.name,
        author: e.author,
        projectKey: typeof e.projectKey === "string" ? e.projectKey : "",
        remoteVersion: typeof e.remoteVersion === "number" ? e.remoteVersion : 1,
        install: e.install,
        installRoot: e.installRoot,
        pulledAt: typeof e.pulledAt === "string" ? e.pulledAt : (/* @__PURE__ */ new Date()).toISOString(),
        symlinks
      });
    }
    return { version: 1, entries };
  } catch {
    return emptyManifest();
  }
}
function saveManifest(m, path = manifestPath()) {
  migrateLegacyStateDir();
  mkdirSync21(dirname14(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync23(tmp, JSON.stringify(m, null, 2) + "\n", { mode: 384 });
  renameSync10(tmp, path);
}
function recordPull(entry, path = manifestPath()) {
  const m = loadManifest(path);
  const idx = m.entries.findIndex((e) => e.install === entry.install && e.installRoot === entry.installRoot && e.dirName === entry.dirName);
  if (idx >= 0)
    m.entries[idx] = entry;
  else
    m.entries.push(entry);
  saveManifest(m, path);
}
function removePullEntry(install, installRoot, dirName, path = manifestPath()) {
  const m = loadManifest(path);
  const before = m.entries.length;
  m.entries = m.entries.filter((e) => !(e.install === install && e.installRoot === installRoot && e.dirName === dirName));
  if (m.entries.length !== before)
    saveManifest(m, path);
}
function entriesForRoot(m, install, installRoot) {
  return m.entries.filter((e) => e.install === install && e.installRoot === installRoot);
}
function unlinkSymlinks(paths) {
  for (const path of paths) {
    let st;
    try {
      st = lstatSync7(path);
    } catch {
      continue;
    }
    if (!st.isSymbolicLink())
      continue;
    try {
      unlinkSync10(path);
    } catch {
    }
  }
}
function pruneOrphanedEntries(path = manifestPath()) {
  const m = loadManifest(path);
  const live = [];
  let pruned = 0;
  for (const e of m.entries) {
    if (existsSync28(join39(e.installRoot, e.dirName))) {
      live.push(e);
      continue;
    }
    unlinkSymlinks(e.symlinks);
    pruned++;
  }
  if (pruned > 0)
    saveManifest({ version: 1, entries: live }, path);
  return pruned;
}

// dist/src/skillify/agent-roots.js
import { existsSync as existsSync29 } from "node:fs";
import { homedir as homedir18 } from "node:os";
import { join as join40 } from "node:path";
function resolveDetected(home) {
  const out = [];
  const codexInstalled = existsSync29(join40(home, ".codex"));
  const piInstalled = existsSync29(join40(home, ".pi", "agent"));
  const hermesInstalled = existsSync29(join40(home, ".hermes"));
  if (codexInstalled || piInstalled) {
    out.push(join40(home, ".agents", "skills"));
  }
  if (hermesInstalled) {
    out.push(join40(home, ".hermes", "skills"));
  }
  if (piInstalled) {
    out.push(join40(home, ".pi", "agent", "skills"));
  }
  return out;
}
function detectAgentSkillsRoots(canonicalRoot, home = homedir18()) {
  return resolveDetected(home).filter((p) => p !== canonicalRoot);
}

// dist/src/skillify/pull.js
function assertValidAuthor(author) {
  if (!author)
    throw new Error("author is empty");
  if (author.length > 64)
    throw new Error(`author too long (${author.length}): ${author.slice(0, 32)}\u2026`);
  if (!/^[A-Za-z0-9_.\-@]+$/.test(author)) {
    throw new Error(`author contains invalid characters: ${author}`);
  }
}
function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
function buildPullSql(args) {
  const where = [];
  if (args.users.length > 0) {
    const list = args.users.map((u) => `'${esc(u)}'`).join(", ");
    where.push(`author IN (${list})`);
  }
  if (args.skillName) {
    where.push(`name = '${esc(args.skillName)}'`);
  }
  const whereClause = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
  const contributorsCol = args.includeContributors === false ? "" : "contributors, ";
  return `SELECT name, project, project_key, body, version, source_agent, scope, author, ${contributorsCol}description, trigger_text, source_sessions, install, created_at, updated_at FROM "${args.tableName}"${whereClause} ORDER BY project_key ASC, name ASC, version DESC`;
}
function isMissingContributorsColumnError(message) {
  if (!message)
    return false;
  return /contributors.*(?:does not exist|not found|unknown)/i.test(message) || /(?:does not exist|unknown column).*contributors/i.test(message);
}
function isMissingTableError2(message) {
  if (!message)
    return false;
  if (/\bcolumn\b/i.test(message))
    return false;
  return /Table does not exist|relation .* does not exist|no such table/i.test(message);
}
function resolvePullDestination(install, cwd) {
  if (install === "global")
    return join41(homedir19(), ".claude", "skills");
  if (!cwd)
    throw new Error("install=project requires a cwd");
  return join41(cwd, ".claude", "skills");
}
function fanOutSymlinks(canonicalDir, dirName, agentRoots) {
  const out = [];
  for (const root of agentRoots) {
    const link = join41(root, dirName);
    let existing;
    try {
      existing = lstatSync8(link);
    } catch {
      existing = null;
    }
    if (existing) {
      if (!existing.isSymbolicLink()) {
        continue;
      }
      let current;
      try {
        current = readlinkSync2(link);
      } catch {
        current = null;
      }
      if (current === canonicalDir) {
        out.push(link);
        continue;
      }
      try {
        unlinkSync11(link);
      } catch {
        continue;
      }
    }
    try {
      mkdirSync22(dirname15(link), { recursive: true });
      symlinkSync2(canonicalDir, link, "dir");
      out.push(link);
    } catch {
    }
  }
  return out;
}
function backfillSymlinks(installRoot) {
  const manifest = loadManifest();
  const entries = entriesForRoot(manifest, "global", installRoot);
  if (entries.length === 0)
    return;
  const detected = detectAgentSkillsRoots(installRoot);
  for (const entry of entries) {
    const canonical = join41(entry.installRoot, entry.dirName);
    if (!existsSync30(canonical))
      continue;
    const fresh = fanOutSymlinks(canonical, entry.dirName, detected);
    if (sameSorted(fresh, entry.symlinks))
      continue;
    try {
      recordPull({ ...entry, symlinks: fresh });
    } catch {
    }
  }
}
function sameSorted(a, b) {
  if (a.length !== b.length)
    return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++)
    if (sa[i] !== sb[i])
      return false;
  return true;
}
function selectLatestPerName(rows) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const r of rows) {
    const name = String(r.name ?? "");
    const projectKey = String(r.project_key ?? "");
    if (!name)
      continue;
    const key = `${projectKey}\0${name}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
function renderSkillFile(row) {
  const sources = parseSourceSessions(row.source_sessions);
  const author = typeof row.author === "string" && row.author.length > 0 ? row.author : void 0;
  const contributors = parseContributors(row.contributors);
  const renderedContributors = contributors.length > 0 ? contributors : author ? [author] : [];
  const fm = {
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    trigger: typeof row.trigger_text === "string" && row.trigger_text.length > 0 ? String(row.trigger_text) : void 0,
    author,
    source_sessions: sources,
    contributors: renderedContributors,
    version: Number(row.version ?? 1),
    created_by_agent: String(row.source_agent ?? "unknown"),
    created_at: String(row.created_at ?? (/* @__PURE__ */ new Date()).toISOString()),
    updated_at: String(row.updated_at ?? (/* @__PURE__ */ new Date()).toISOString())
  };
  const body = String(row.body ?? "").trim();
  return `${renderFrontmatter2(fm)}

${body}
`;
}
function parseSourceSessions(v) {
  if (Array.isArray(v))
    return v.map(String);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed))
        return parsed.map(String);
    } catch {
    }
  }
  return [];
}
function parseContributors(v) {
  if (Array.isArray(v))
    return v.map(String);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed))
        return parsed.map(String);
    } catch {
    }
  }
  return [];
}
function renderFrontmatter2(fm) {
  const lines = ["---"];
  lines.push(`name: ${fm.name}`);
  lines.push(`description: ${JSON.stringify(fm.description)}`);
  if (fm.trigger)
    lines.push(`trigger: ${JSON.stringify(fm.trigger)}`);
  if (fm.author)
    lines.push(`author: ${fm.author}`);
  lines.push(`source_sessions:`);
  for (const s of fm.source_sessions)
    lines.push(`  - ${s}`);
  if (fm.contributors && fm.contributors.length > 0) {
    lines.push(`contributors:`);
    for (const c of fm.contributors)
      lines.push(`  - ${c}`);
  }
  lines.push(`version: ${fm.version}`);
  lines.push(`created_by_agent: ${fm.created_by_agent}`);
  lines.push(`created_at: ${fm.created_at}`);
  lines.push(`updated_at: ${fm.updated_at}`);
  lines.push("---");
  return lines.join("\n");
}
function readLocalVersion(path) {
  if (!existsSync30(path))
    return null;
  try {
    const text = readFileSync29(path, "utf-8");
    const parsed = parseFrontmatter(text);
    if (!parsed)
      return null;
    const v = parsed.fm.version;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}
function decideAction(args) {
  const shouldWrite = args.localVersion === null || args.remoteVersion > args.localVersion || args.force;
  if (!shouldWrite)
    return "skipped";
  return args.dryRun ? "dryrun" : "wrote";
}
async function runPull(opts) {
  if (!opts.dryRun)
    pruneOrphanedEntries();
  const sql = buildPullSql({
    tableName: opts.tableName,
    users: opts.users,
    skillName: opts.skillName
  });
  let rows = [];
  if (opts.tableExists && !opts.tableExists(opts.tableName)) {
    rows = [];
  } else {
    try {
      rows = await opts.query(sql);
    } catch (e) {
      if (isMissingTableError2(e?.message)) {
        rows = [];
      } else if (isMissingContributorsColumnError(e?.message)) {
        const legacySql = buildPullSql({
          tableName: opts.tableName,
          users: opts.users,
          skillName: opts.skillName,
          includeContributors: false
        });
        rows = await opts.query(legacySql);
      } else {
        throw e;
      }
    }
  }
  const latest = selectLatestPerName(rows);
  const root = resolvePullDestination(opts.install, opts.cwd);
  const summary = { scanned: latest.length, wrote: 0, skipped: 0, dryrun: 0, entries: [] };
  for (const row of latest) {
    const name = String(row.name ?? "");
    if (!name)
      continue;
    try {
      assertValidSkillName(name);
    } catch (e) {
      summary.entries.push({
        name,
        remoteVersion: Number(row.version ?? 1),
        localVersion: null,
        action: "skipped",
        destination: "(invalid name \u2014 skipped)",
        author: String(row.author ?? ""),
        sourceAgent: String(row.source_agent ?? "")
      });
      summary.skipped++;
      continue;
    }
    const author = String(row.author ?? "");
    if (!author) {
      summary.entries.push({
        name,
        remoteVersion: Number(row.version ?? 1),
        localVersion: null,
        action: "skipped",
        destination: "(empty author \u2014 skipped)",
        author: "",
        sourceAgent: String(row.source_agent ?? "")
      });
      summary.skipped++;
      continue;
    }
    let dirName;
    try {
      assertValidAuthor(author);
      dirName = `${name}--${author}`;
    } catch (e) {
      summary.entries.push({
        name,
        remoteVersion: Number(row.version ?? 1),
        localVersion: null,
        action: "skipped",
        destination: `(invalid author '${author}' \u2014 skipped)`,
        author,
        sourceAgent: String(row.source_agent ?? "")
      });
      summary.skipped++;
      continue;
    }
    const skillDir2 = join41(root, dirName);
    const skillFile = join41(skillDir2, "SKILL.md");
    const remoteVersion = Number(row.version ?? 1);
    const localVersion = readLocalVersion(skillFile);
    const action = decideAction({
      remoteVersion,
      localVersion,
      force: opts.force ?? false,
      dryRun: opts.dryRun ?? false
    });
    let manifestError;
    if (action === "wrote") {
      mkdirSync22(skillDir2, { recursive: true });
      if (existsSync30(skillFile)) {
        try {
          renameSync11(skillFile, `${skillFile}.bak`);
        } catch {
        }
      }
      writeFileSync24(skillFile, renderSkillFile(row));
      const symlinks = opts.install === "global" ? fanOutSymlinks(skillDir2, dirName, detectAgentSkillsRoots(root)) : [];
      try {
        recordPull({
          dirName,
          name,
          author,
          projectKey: String(row.project_key ?? ""),
          remoteVersion,
          install: opts.install,
          installRoot: root,
          pulledAt: (/* @__PURE__ */ new Date()).toISOString(),
          symlinks
        });
      } catch (e) {
        manifestError = e?.message ?? String(e);
      }
    }
    summary.entries.push({
      name,
      remoteVersion,
      localVersion,
      action,
      destination: skillFile,
      author: String(row.author ?? ""),
      sourceAgent: String(row.source_agent ?? ""),
      manifestError
    });
    if (action === "wrote")
      summary.wrote++;
    else if (action === "dryrun")
      summary.dryrun++;
    else
      summary.skipped++;
  }
  if (!opts.dryRun && opts.install === "global") {
    backfillSymlinks(root);
  }
  return summary;
}

// dist/src/skillify/unpull.js
import { existsSync as existsSync31, readdirSync as readdirSync6, rmSync as rmSync7, statSync as statSync6 } from "node:fs";
import { homedir as homedir20 } from "node:os";
import { join as join42 } from "node:path";
function resolveUnpullRoot(install, cwd) {
  if (install === "global")
    return join42(homedir20(), ".claude", "skills");
  if (!cwd)
    throw new Error("cwd required when install === 'project'");
  return join42(cwd, ".claude", "skills");
}
function runUnpull(opts) {
  const root = resolveUnpullRoot(opts.install, opts.cwd);
  const summary = {
    scanned: 0,
    removed: 0,
    wouldRemove: 0,
    kept: 0,
    manifestPruned: 0,
    entries: []
  };
  const userFilter = new Set(opts.users.filter((u) => u.length > 0));
  const haveUserFilter = userFilter.size > 0;
  if ((opts.all || opts.legacyCleanup) && (haveUserFilter || opts.notMine)) {
    const flags = [opts.all && "--all", opts.legacyCleanup && "--legacy-cleanup"].filter(Boolean).join(" / ");
    const filters = [haveUserFilter && "--user/--users", opts.notMine && "--not-mine"].filter(Boolean).join(" / ");
    throw new Error(`${flags} cannot be combined with ${filters}: entries removed by ${flags} are not in the manifest and have no author metadata, so the filter would silently fail to apply. Run the filtered unpull first, then ${flags} as a separate invocation.`);
  }
  const manifest = loadManifest();
  const entries = entriesForRoot(manifest, opts.install, root);
  for (const entry of entries) {
    summary.scanned++;
    const path = join42(root, entry.dirName);
    if (!existsSync31(path)) {
      if (!opts.dryRun) {
        unlinkSymlinks(entry.symlinks);
        removePullEntry(opts.install, entry.installRoot, entry.dirName);
      }
      summary.entries.push({
        dirName: entry.dirName,
        kind: "manifest-orphan",
        author: entry.author,
        name: entry.name,
        action: opts.dryRun ? "kept-policy" : "manifest-pruned",
        reason: opts.dryRun ? "would-prune (orphan, dir missing)" : "directory was already missing",
        path: ""
      });
      if (!opts.dryRun)
        summary.manifestPruned++;
      else
        summary.kept++;
      continue;
    }
    const decision = decideTargetForManifestEntry(entry, opts, userFilter, haveUserFilter);
    const result = {
      dirName: entry.dirName,
      kind: "pulled-manifest",
      author: entry.author,
      name: entry.name,
      action: "kept-policy",
      path
    };
    if (!decision.shouldRemove) {
      result.reason = decision.reason;
      summary.kept++;
      summary.entries.push(result);
      continue;
    }
    if (opts.dryRun) {
      result.action = "would-remove";
      summary.wouldRemove++;
    } else {
      try {
        rmSync7(path, { recursive: true, force: true });
        unlinkSymlinks(entry.symlinks);
        removePullEntry(opts.install, entry.installRoot, entry.dirName);
        result.action = "removed";
        summary.removed++;
      } catch (e) {
        result.action = "kept-policy";
        result.reason = `rm failed: ${e?.message ?? e}`;
        summary.kept++;
      }
    }
    summary.entries.push(result);
  }
  if (existsSync31(root) && (opts.all || opts.legacyCleanup)) {
    const manifestDirNames = new Set(entries.map((e) => e.dirName));
    for (const dirName of readdirSync6(root)) {
      if (manifestDirNames.has(dirName))
        continue;
      const path = join42(root, dirName);
      let st;
      try {
        st = statSync6(path);
      } catch {
        continue;
      }
      if (!st.isDirectory())
        continue;
      const isLegacyProjectKey = /^[0-9a-f]{16}$/.test(dirName);
      const isLocallyMined = !isLegacyProjectKey && /^[A-Za-z0-9_.-]+$/.test(dirName) && !dirName.includes("--");
      let kind;
      let shouldRemove = false;
      let reason;
      if (isLegacyProjectKey) {
        kind = "legacy-projectkey";
        if (opts.legacyCleanup)
          shouldRemove = true;
        else
          reason = "legacy project_key dir (use --legacy-cleanup)";
      } else if (isLocallyMined) {
        kind = "locally-mined";
        if (opts.all)
          shouldRemove = true;
        else
          reason = "locally-mined (use --all to remove)";
      } else {
        continue;
      }
      summary.scanned++;
      const result = {
        dirName,
        kind,
        author: null,
        name: kind === "locally-mined" ? dirName : null,
        action: "kept-policy",
        path,
        reason
      };
      if (!shouldRemove) {
        summary.kept++;
        summary.entries.push(result);
        continue;
      }
      if (opts.dryRun) {
        result.action = "would-remove";
        summary.wouldRemove++;
      } else {
        try {
          rmSync7(path, { recursive: true, force: true });
          result.action = "removed";
          summary.removed++;
        } catch (e) {
          result.action = "kept-policy";
          result.reason = `rm failed: ${e?.message ?? e}`;
          summary.kept++;
        }
      }
      summary.entries.push(result);
    }
  }
  return summary;
}
function decideTargetForManifestEntry(entry, opts, userFilter, haveUserFilter) {
  if (haveUserFilter && !userFilter.has(entry.author)) {
    return { shouldRemove: false, reason: `author '${entry.author}' not in filter` };
  }
  if (opts.notMine) {
    if (!opts.myUsername)
      return { shouldRemove: false, reason: "--not-mine requires myUsername" };
    if (entry.author === opts.myUsername) {
      return { shouldRemove: false, reason: "your own pull (--not-mine excludes self)" };
    }
  }
  return { shouldRemove: true };
}

// dist/src/commands/mine-local.js
import { spawn as spawn2 } from "node:child_process";
import { existsSync as existsSync35, mkdirSync as mkdirSync24, readFileSync as readFileSync32, writeFileSync as writeFileSync26 } from "node:fs";
import { homedir as homedir24 } from "node:os";
import { basename as basename2, dirname as dirname17, join as join46 } from "node:path";

// dist/src/skillify/local-source.js
import { readdirSync as readdirSync7, readFileSync as readFileSync30, existsSync as existsSync32, statSync as statSync7 } from "node:fs";
import { homedir as homedir21 } from "node:os";
import { join as join43 } from "node:path";
var HOME2 = homedir21();
function encodeCwdClaudeCode(cwd) {
  return cwd.replace(/[/_]/g, "-");
}
function detectInstalledAgents() {
  const installs = [];
  const claudeRoot = join43(HOME2, ".claude", "projects");
  if (existsSync32(claudeRoot)) {
    installs.push({
      agent: "claude_code",
      sessionRoot: claudeRoot,
      encodeCwd: encodeCwdClaudeCode
    });
  }
  const codexRoot = join43(HOME2, ".codex", "sessions");
  if (existsSync32(codexRoot)) {
    installs.push({
      agent: "codex",
      sessionRoot: codexRoot,
      encodeCwd: () => "__cwd_unknown__"
    });
  }
  return installs;
}
function detectHostAgent() {
  if (process.env.CLAUDECODE === "1" || process.env.CLAUDE_CODE_ENTRYPOINT)
    return "claude_code";
  if (process.env.CODEX_HOME || process.env.CODEX_SESSION_ID)
    return "codex";
  return null;
}
function listLocalSessions(installs, cwd) {
  const out = [];
  for (const install of installs) {
    const cwdEncoded = install.encodeCwd(cwd);
    let subdirs = [];
    try {
      subdirs = readdirSync7(install.sessionRoot);
    } catch {
      continue;
    }
    for (const sub of subdirs) {
      const subdirPath = join43(install.sessionRoot, sub);
      try {
        if (!statSync7(subdirPath).isDirectory())
          continue;
      } catch {
        continue;
      }
      const inCwd = sub === cwdEncoded;
      let files = [];
      try {
        files = readdirSync7(subdirPath);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".jsonl"))
          continue;
        const fullPath = join43(subdirPath, f);
        let stats;
        try {
          stats = statSync7(fullPath);
        } catch {
          continue;
        }
        if (!stats.isFile())
          continue;
        const sessionId = f.replace(/\.jsonl$/, "");
        out.push({
          agent: install.agent,
          path: fullPath,
          mtime: stats.mtimeMs,
          inCwd,
          sessionId
        });
      }
    }
  }
  return out;
}
function pickSessions(candidates, opts) {
  const { n, epsilon } = opts;
  if (n <= 0 || candidates.length === 0)
    return [];
  const sorted = [...candidates].sort((a, b) => b.mtime - a.mtime);
  const cwdQuota = Math.ceil((1 - epsilon) * n);
  const globalQuota = Math.floor(epsilon * n);
  const picked = [];
  const taken = /* @__PURE__ */ new Set();
  for (const s of sorted) {
    if (picked.length >= cwdQuota)
      break;
    if (s.inCwd && !taken.has(s.path)) {
      picked.push(s);
      taken.add(s.path);
    }
  }
  const cap2 = picked.length + globalQuota;
  for (const s of sorted) {
    if (picked.length >= cap2)
      break;
    if (!taken.has(s.path)) {
      picked.push(s);
      taken.add(s.path);
    }
  }
  for (const s of sorted) {
    if (picked.length >= n)
      break;
    if (!taken.has(s.path)) {
      picked.push(s);
      taken.add(s.path);
    }
  }
  return picked;
}
function nativeJsonlToRows(filePath, sessionId, agent) {
  let raw;
  try {
    raw = readFileSync30(filePath, "utf-8");
  } catch {
    return [];
  }
  const rows = [];
  let pendingAsstText;
  let pendingAsstTs;
  const flushAssistant = () => {
    if (pendingAsstText && pendingAsstText.trim().length > 0) {
      rows.push({
        type: "assistant_message",
        content: pendingAsstText,
        creation_date: pendingAsstTs,
        session_id: sessionId,
        agent
      });
    }
    pendingAsstText = void 0;
    pendingAsstTs = void 0;
  };
  for (const line of raw.split(/\n/)) {
    if (!line)
      continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const t = obj?.type;
    const ts = obj?.timestamp ?? obj?.created_at;
    if (t === "user") {
      const c = obj?.message?.content;
      if (typeof c === "string" && c.trim().length > 0) {
        flushAssistant();
        rows.push({
          type: "user_message",
          content: c,
          creation_date: ts,
          session_id: sessionId,
          agent
        });
      }
    } else if (t === "assistant") {
      const c = obj?.message?.content;
      if (Array.isArray(c)) {
        const text = c.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n\n");
        if (text.trim().length > 0) {
          pendingAsstText = text;
          pendingAsstTs = ts;
        }
      }
    }
  }
  flushAssistant();
  return rows;
}

// dist/src/skillify/extractors/index.js
function extractPairs(rows) {
  const pairs2 = [];
  let pendingPrompt = null;
  let pendingAnswer = [];
  function flush() {
    if (pendingPrompt && pendingAnswer.length > 0) {
      pairs2.push({
        sessionId: pendingPrompt.row.session_id ?? "",
        agent: pendingPrompt.row.agent ?? null,
        date: pendingPrompt.row.creation_date ?? null,
        prompt: pendingPrompt.content,
        answer: pendingAnswer.join("\n\n")
      });
    }
    pendingPrompt = null;
    pendingAnswer = [];
  }
  for (const r of rows) {
    if (r.type === "user_message" && typeof r.content === "string") {
      flush();
      pendingPrompt = { content: r.content, row: r };
    } else if (r.type === "assistant_message" && typeof r.content === "string" && pendingPrompt) {
      if (r.content.trim().length > 0)
        pendingAnswer.push(r.content);
    }
  }
  flush();
  return pairs2;
}

// dist/src/skillify/gate-runner.js
import { existsSync as existsSync33 } from "node:fs";
import { createRequire } from "node:module";
import { homedir as homedir22 } from "node:os";
import { join as join44 } from "node:path";
var requireForCp = createRequire(import.meta.url);
var { execFileSync: runChildProcess } = requireForCp("node:child_process");
var inheritedEnv = process;
function firstExistingPath(candidates) {
  for (const c of candidates) {
    if (existsSync33(c))
      return c;
  }
  return null;
}
function findAgentBin(agent) {
  const home = homedir22();
  switch (agent) {
    // /usr/bin/<name> is included in every candidate list — that's the
    // common Linux package-manager install path (apt, dnf, pacman). Old
    // code used `which` which always checked it; the static-scan fix
    // dropped `which`, so /usr/bin needs to be explicit. CodeRabbit on
    // #170 caught the gap.
    case "claude_code":
      return firstExistingPath([
        join44(home, ".claude", "local", "claude"),
        "/usr/local/bin/claude",
        "/usr/bin/claude",
        join44(home, ".npm-global", "bin", "claude"),
        join44(home, ".local", "bin", "claude"),
        "/opt/homebrew/bin/claude"
      ]) ?? join44(home, ".claude", "local", "claude");
    case "codex":
      return firstExistingPath([
        "/usr/local/bin/codex",
        "/usr/bin/codex",
        join44(home, ".npm-global", "bin", "codex"),
        join44(home, ".local", "bin", "codex"),
        "/opt/homebrew/bin/codex"
      ]) ?? "/usr/local/bin/codex";
    case "cursor":
      return firstExistingPath([
        "/usr/local/bin/cursor-agent",
        "/usr/bin/cursor-agent",
        join44(home, ".npm-global", "bin", "cursor-agent"),
        join44(home, ".local", "bin", "cursor-agent"),
        "/opt/homebrew/bin/cursor-agent"
      ]) ?? "/usr/local/bin/cursor-agent";
    case "hermes":
      return firstExistingPath([
        join44(home, ".local", "bin", "hermes"),
        "/usr/local/bin/hermes",
        "/usr/bin/hermes",
        join44(home, ".npm-global", "bin", "hermes"),
        "/opt/homebrew/bin/hermes"
      ]) ?? join44(home, ".local", "bin", "hermes");
    case "pi":
      return firstExistingPath([
        join44(home, ".local", "bin", "pi"),
        "/usr/local/bin/pi",
        "/usr/bin/pi",
        join44(home, ".npm-global", "bin", "pi"),
        "/opt/homebrew/bin/pi"
      ]) ?? join44(home, ".local", "bin", "pi");
  }
}

// dist/src/skillify/gate-parser.js
function extractJsonBlock(s) {
  const trimmed = s.trim();
  if (!trimmed)
    return null;
  const fenced = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenced)
    return fenced[1].trim();
  const start = trimmed.indexOf("{");
  if (start < 0)
    return null;
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === "{")
      depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0)
        return trimmed.slice(start, i + 1);
    }
  }
  return null;
}

// dist/src/skillify/local-manifest.js
import { existsSync as existsSync34, mkdirSync as mkdirSync23, readFileSync as readFileSync31, writeFileSync as writeFileSync25 } from "node:fs";
import { homedir as homedir23 } from "node:os";
import { dirname as dirname16, join as join45 } from "node:path";
var LOCAL_MANIFEST_PATH = join45(homedir23(), ".claude", "hivemind", "local-mined.json");
var LOCAL_MINE_LOCK_PATH = join45(homedir23(), ".claude", "hivemind", "local-mined.lock");
function readLocalManifest(path = LOCAL_MANIFEST_PATH) {
  if (!existsSync34(path))
    return null;
  try {
    return JSON.parse(readFileSync31(path, "utf-8"));
  } catch {
    return null;
  }
}
function writeLocalManifest(m, path = LOCAL_MANIFEST_PATH) {
  mkdirSync23(dirname16(path), { recursive: true });
  writeFileSync25(path, JSON.stringify(m, null, 2));
}
function countLocalManifestEntries(path = LOCAL_MANIFEST_PATH) {
  const m = readLocalManifest(path);
  return Array.isArray(m?.entries) ? m.entries.length : 0;
}
var LATEST_RUN_WINDOW_MS = 5 * 60 * 1e3;
function getLatestInsightEntry(path = LOCAL_MANIFEST_PATH) {
  const m = readLocalManifest(path);
  if (!m || !Array.isArray(m.entries))
    return null;
  let newestTs = Number.NEGATIVE_INFINITY;
  for (const e of m.entries) {
    if (!e)
      continue;
    const ts = Date.parse(e.created_at ?? "");
    if (Number.isFinite(ts) && ts > newestTs)
      newestTs = ts;
  }
  if (!Number.isFinite(newestTs))
    return null;
  let best = null;
  let bestTs = Number.NEGATIVE_INFINITY;
  let bestIsPrimary = false;
  for (const e of m.entries) {
    if (!e || typeof e.insight !== "string" || e.insight.trim().length === 0)
      continue;
    const ts = Date.parse(e.created_at ?? "");
    if (!Number.isFinite(ts))
      continue;
    if (newestTs - ts > LATEST_RUN_WINDOW_MS)
      continue;
    const isPrimary = e.primary === true;
    if (!best || isPrimary && !bestIsPrimary || isPrimary === bestIsPrimary && ts > bestTs) {
      best = e;
      bestTs = ts;
      bestIsPrimary = isPrimary;
    }
  }
  return best;
}

// dist/src/commands/mine-local.js
import { unlinkSync as unlinkSync12 } from "node:fs";
var EPSILON = 0.3;
var DEFAULT_N = 8;
var PAIR_CHAR_CAP = 4e3;
var PER_SESSION_PAIR_CAP = 30;
var PER_SESSION_PROMPT_CAP = 12e4;
var GATE_CONCURRENCY = 4;
var IN_FLIGHT_MAX_AGE_MS = 6e4;
var GATE_TIMEOUT_MS = 24e4;
var MANIFEST_PATH = LOCAL_MANIFEST_PATH;
function runGateViaStdin(opts) {
  return new Promise((resolve6) => {
    if (opts.agent !== "claude_code") {
      resolve6({
        stdout: "",
        stderr: "",
        errored: true,
        errorMessage: `stdin gate runner only supports claude_code (got ${opts.agent}); for other agents the prompt must fit in argv`
      });
      return;
    }
    if (!existsSync35(opts.bin)) {
      resolve6({
        stdout: "",
        stderr: "",
        errored: true,
        errorMessage: `agent binary not found at ${opts.bin}`
      });
      return;
    }
    const args = [
      "-p",
      "--no-session-persistence",
      "--model",
      "haiku",
      "--permission-mode",
      "bypassPermissions"
    ];
    const child = spawn2(opts.bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, HIVEMIND_WIKI_WORKER: "1", HIVEMIND_CAPTURE: "false" }
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (r) => {
      if (settled)
        return;
      settled = true;
      resolve6(r);
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
      }
      finish({
        stdout,
        stderr,
        errored: true,
        errorMessage: `gate timed out after ${opts.timeoutMs}ms`
      });
    }, opts.timeoutMs);
    child.stdout.on("data", (b) => {
      stdout += b.toString("utf-8");
    });
    child.stderr.on("data", (b) => {
      stderr += b.toString("utf-8");
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      finish({ stdout, stderr, errored: true, errorMessage: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({
        stdout,
        stderr,
        errored: code !== 0,
        errorMessage: code !== 0 ? `claude_code CLI exited with code ${code}` : void 0
      });
    });
    child.stdin.on("error", (e) => {
      clearTimeout(timer);
      finish({ stdout, stderr, errored: true, errorMessage: `stdin write failed: ${e.message}` });
    });
    child.stdin.end(opts.prompt);
  });
}
var loadManifest2 = readLocalManifest;
var saveManifest2 = writeLocalManifest;
function truncate(s, max) {
  if (s.length <= max)
    return s;
  return s.slice(0, max) + `
[\u2026truncated ${s.length - max} chars]`;
}
function renderPairsBlock(pairs2) {
  let total = 0;
  const out = [];
  for (const [i, p] of pairs2.entries()) {
    const block = `--- exchange ${i + 1} ---
USER:
${truncate(p.prompt, PAIR_CHAR_CAP)}

ASSISTANT:
${truncate(p.answer, PAIR_CHAR_CAP)}
`;
    if (total + block.length > PER_SESSION_PROMPT_CAP) {
      out.push(`[\u2026${pairs2.length - i} more exchanges omitted to stay under budget]`);
      break;
    }
    out.push(block);
    total += block.length;
  }
  return out.join("\n");
}
function buildSessionPrompt(pairs2, session, verdictPath) {
  return [
    `You are a skill curator examining ONE session of recent agent activity.`,
    `Your job: identify up to 3 distinct, non-overlapping reusable skills hiding in this session.`,
    `Distinct = different problem domains. Empty list is fine if nothing qualifies.`,
    ``,
    `Session: ${session.sessionId} (agent: ${session.agent})`,
    ``,
    `RULES:`,
    `- A skill qualifies if it captures a concrete, repeatable workflow OR a non-obvious`,
    `  constraint/gotcha a future engineer would benefit from knowing. Intra-session is fine \u2014`,
    `  one deep dive yielding a generalizable takeaway counts.`,
    `- Especially valuable: REPEATABLE-MISTAKE patterns. Cases where the assistant declared`,
    `  work "done"/"fixed"/"verified" and the user came back to the same problem later; where`,
    `  the same class of mistake recurs (forgot to run tests, mishandled async state,`,
    `  hallucinated function/file existence, re-asked for confirmation on already-authorized`,
    `  work, jumped to plans without checking with the user, etc.); where the user manually`,
    `  corrected the same kind of error >1 time. These are the highest-value catches.`,
    `- Skip patterns that are obvious from reading the codebase or already in CLAUDE.md.`,
    `- Each body uses short sections (When to use, Workflow, Anti-patterns), concrete commands`,
    `  / paths / snippets drawn from the exchanges below, no marketing, no emojis.`,
    `- Each body under ~3000 characters.`,
    `- Skill names are kebab-case slugs (lowercase letters/digits/hyphens only).`,
    `- For each skill, also emit a one-line "insight": a concrete, quantified, second-person`,
    `  sentence describing what hivemind found that prompted the skill. Examples:`,
    `    "You revisited 4 merged PRs in the last month because the assistant declared 'done'`,
    `     before checking test output."`,
    `    "You corrected the same env-mismatch (beta vs prod) twice in the same week before`,
    `     deciding to switch deployment targets."`,
    `  The insight is what users will see at next SessionStart, so it must be honest \u2014 only`,
    `  assert counts and patterns you can ground in THIS session's exchanges. Omit the field`,
    `  if you cannot write a concrete, quantified line.`,
    ``,
    `=== EXCHANGES (user prompts + assistant final answers, tool calls stripped) ===`,
    renderPairsBlock(pairs2),
    ``,
    `=== YOUR TASK ===`,
    `Output a single JSON object. You may either:`,
    `  (a) Write the JSON to this exact path using the Write tool: ${verdictPath}`,
    `  (b) Print the JSON object to stdout as your final message, nothing else.`,
    `Pick whichever you prefer. Do not do both.`,
    ``,
    `Required shape:`,
    `{`,
    `  "reason": "<one-line justification>",`,
    `  "skills": [`,
    `    {`,
    `      "name": "<kebab-case>",`,
    `      "description": "<one-line>",`,
    `      "trigger": "<short trigger>",`,
    `      "body": "<full SKILL.md body without frontmatter>",`,
    `      "insight": "<one-line, concrete + quantified + second person; OPTIONAL>"`,
    `    },`,
    `    ... up to 3 entries, or [] if nothing qualifies`,
    `  ]`,
    `}`,
    ``,
    `If you print to stdout, do not include any prose before or after the JSON.`
  ].join("\n");
}
function parseMultiVerdict(raw) {
  const block = extractJsonBlock(raw);
  if (!block)
    return null;
  let parsed;
  try {
    parsed = JSON.parse(block);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object")
    return null;
  const skills = parsed.skills;
  if (!Array.isArray(skills))
    return null;
  const out = [];
  for (const s of skills) {
    if (!s || typeof s !== "object")
      continue;
    const name = typeof s.name === "string" ? s.name.trim() : "";
    const description = typeof s.description === "string" ? s.description.trim() : "";
    const body = typeof s.body === "string" ? s.body.trim() : "";
    const trigger = typeof s.trigger === "string" ? s.trigger.trim() : void 0;
    const rawInsight = typeof s.insight === "string" ? s.insight : "";
    const normalizedInsight = rawInsight.replace(/\s+/g, " ").trim();
    const insight = normalizedInsight.length > 0 ? normalizedInsight.slice(0, 280) : void 0;
    if (!name || !body)
      continue;
    out.push({ name, description, body, trigger, insight });
  }
  return { reason: typeof parsed.reason === "string" ? parsed.reason : void 0, skills: out };
}
function gateAgentFor(host, fallback, installs) {
  const installed = new Set(installs.map((i) => i.agent));
  if (installed.has("claude_code"))
    return "claude_code";
  return host ?? fallback;
}
async function parallelMap(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = [];
  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    workers.push((async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length)
          return;
        results[i] = await fn(items[i], i);
      }
    })());
  }
  await Promise.all(workers);
  return results;
}
var SUMMARY_STOPWORDS = /* @__PURE__ */ new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "via",
  "this",
  "that",
  "your",
  "you",
  "are",
  "was",
  "were",
  "use",
  "using",
  "uses",
  "used",
  "skill",
  "when",
  "what",
  "where",
  "which",
  "while",
  "how",
  "non",
  "any",
  "all",
  "code",
  "file",
  "files",
  "way",
  "ways",
  "via"
]);
function summaryTokens(s) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !SUMMARY_STOPWORDS.has(t)));
}
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0)
    return 0;
  let intersection = 0;
  for (const t of a)
    if (b.has(t))
      intersection++;
  return intersection / (a.size + b.size - intersection);
}
var OVERLAP_THRESHOLD = 0.4;
function findOverlap(candidateDesc, others) {
  const ct = summaryTokens(candidateDesc);
  let best = null;
  for (const e of others) {
    const score = jaccard(ct, summaryTokens(e.desc));
    if (score >= OVERLAP_THRESHOLD && (!best || score > best.score)) {
      best = { name: e.name, score };
    }
  }
  return best;
}
function loadExistingSummaries(skillsRoot) {
  const out = [];
  for (const s of listSkills(skillsRoot)) {
    const parsed = parseFrontmatter(s.body);
    const desc = parsed?.fm.description ?? "";
    if (desc)
      out.push({ name: s.name, desc });
  }
  return out;
}
function takeFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx < 0)
    return null;
  const v = args[idx + 1];
  if (v === void 0 || v.startsWith("--")) {
    console.error(`${flag} requires a value`);
    process.exit(1);
  }
  args.splice(idx, 2);
  return v;
}
function takeBoolFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx < 0)
    return false;
  args.splice(idx, 1);
  return true;
}
async function runMineLocal(args) {
  let lockReleased = false;
  const releaseLock2 = () => {
    if (lockReleased)
      return;
    lockReleased = true;
    try {
      unlinkSync12(LOCAL_MINE_LOCK_PATH);
    } catch {
    }
  };
  process.on("exit", releaseLock2);
  try {
    return await runMineLocalImpl(args);
  } finally {
    releaseLock2();
  }
}
async function runMineLocalImpl(args) {
  const work = [...args];
  const force = takeBoolFlag(work, "--force");
  const dryRun = takeBoolFlag(work, "--dry-run");
  const nRaw = takeFlagValue(work, "--n");
  const onlyAgent = takeFlagValue(work, "--only");
  if (loadManifest2() && !force) {
    console.error(`Local skills have already been mined on this machine.`);
    console.error(`Manifest: ${MANIFEST_PATH}`);
    console.error(`Pass --force to re-mine.`);
    process.exit(1);
  }
  const installsAll = detectInstalledAgents();
  if (installsAll.length === 0) {
    console.error(`No agent session directories detected. Run a session first.`);
    process.exit(1);
  }
  const installs = onlyAgent ? installsAll.filter((i) => i.agent === onlyAgent) : installsAll;
  if (installs.length === 0) {
    console.error(`No '${onlyAgent}' session directory detected. Skipping mine-local.`);
    process.exit(1);
  }
  console.log(`Detected installed agents: ${installs.map((i) => i.agent).join(", ")}${onlyAgent ? ` (filtered to ${onlyAgent})` : ""}`);
  const host = detectHostAgent();
  const fallback = installs[0].agent;
  const gateAgent = gateAgentFor(host, fallback, installs);
  if (gateAgent !== "claude_code") {
    console.error(`mine-local v1 requires the Claude Code CLI as its LLM gate.`);
    console.error(`Detected gate agent: ${gateAgent} (no claude_code session dir found at ~/.claude/projects/).`);
    console.error(`Install Claude Code, or run a Claude Code session once, then re-run.`);
    process.exit(1);
  }
  const gateBin = findAgentBin(gateAgent);
  console.log(`Gate CLI: ${gateAgent} (${gateBin})${host ? " \u2014 host-agent detected" : ""}`);
  const cwd = process.cwd();
  const rawSessions = listLocalSessions(installs, cwd);
  const now = Date.now();
  const allSessions = rawSessions.filter((s) => now - s.mtime >= IN_FLIGHT_MAX_AGE_MS);
  const dropped = rawSessions.length - allSessions.length;
  const cwdCount = allSessions.filter((s) => s.inCwd).length;
  console.log(`Found ${allSessions.length} local session(s) (${cwdCount} in cwd${dropped > 0 ? `, ${dropped} in-flight skipped` : ""})`);
  if (allSessions.length === 0) {
    console.error(`No mineable session files (all were modified within the last ${IN_FLIGHT_MAX_AGE_MS / 1e3}s).`);
    process.exit(1);
  }
  const n = nRaw === "all" ? allSessions.length : nRaw ? Math.max(1, parseInt(nRaw, 10) || DEFAULT_N) : DEFAULT_N;
  const picked = pickSessions(allSessions, { n, epsilon: EPSILON });
  console.log(`Picking ${picked.length} session(s) (\u03B5=${EPSILON}, N=${n}): ${picked.map((s) => s.sessionId.slice(0, 8)).join(", ")}`);
  if (dryRun) {
    console.log(`Dry-run: would invoke ${gateAgent} gate on ${picked.length} session(s) in parallel (concurrency=${GATE_CONCURRENCY}).`);
    return;
  }
  const tmpDir = join46(homedir24(), ".claude", "hivemind", `mine-local-${Date.now()}`);
  mkdirSync24(tmpDir, { recursive: true });
  console.log(`Running ${picked.length} gate call(s) in parallel (concurrency=${GATE_CONCURRENCY}, timeout=${GATE_TIMEOUT_MS / 1e3}s each)...`);
  const results = await parallelMap(picked, GATE_CONCURRENCY, async (s) => {
    const shortId = s.sessionId.slice(0, 8);
    const rows = nativeJsonlToRows(s.path, s.sessionId, s.agent);
    const pairs2 = extractPairs(rows);
    if (pairs2.length === 0) {
      console.log(`  [${shortId}] no usable pairs \u2014 skipped`);
      return { session: s, skills: [], reason: "no pairs", error: null };
    }
    const tail = pairs2.slice(-PER_SESSION_PAIR_CAP);
    const sessionTmp = join46(tmpDir, `s-${shortId}`);
    mkdirSync24(sessionTmp, { recursive: true });
    const verdictPath = join46(sessionTmp, "verdict.json");
    const prompt = buildSessionPrompt(tail, s, verdictPath);
    writeFileSync26(join46(sessionTmp, "prompt.txt"), prompt);
    const gate = await runGateViaStdin({ agent: gateAgent, bin: gateBin, prompt, timeoutMs: GATE_TIMEOUT_MS });
    try {
      writeFileSync26(join46(sessionTmp, "gate-stdout.txt"), gate.stdout);
      if (gate.stderr)
        writeFileSync26(join46(sessionTmp, "gate-stderr.txt"), gate.stderr);
    } catch {
    }
    if (gate.errored) {
      console.log(`  [${shortId}] gate failed: ${gate.errorMessage}`);
      return { session: s, skills: [], reason: null, error: gate.errorMessage ?? "gate failed" };
    }
    const verdictText = existsSync35(verdictPath) ? readFileSync32(verdictPath, "utf-8") : gate.stdout;
    const mv = parseMultiVerdict(verdictText);
    if (!mv) {
      console.log(`  [${shortId}] unparseable verdict (kept at ${sessionTmp})`);
      return { session: s, skills: [], reason: null, error: "unparseable verdict" };
    }
    console.log(`  [${shortId}] ${mv.skills.length} skill candidate(s) \u2014 ${mv.reason ?? "no reason given"}`);
    return { session: s, skills: mv.skills, reason: mv.reason ?? null, error: null };
  });
  const skillsRoot = resolveSkillsRoot("global", cwd);
  const totalCandidates = results.reduce((sum, r) => sum + r.skills.length, 0);
  const existingSummaries = loadExistingSummaries(skillsRoot);
  console.log("");
  console.log(`Got ${totalCandidates} candidate(s) across ${picked.length} session(s). Checking overlap against ${existingSummaries.length} installed skill(s) + each new write.`);
  if (totalCandidates === 0) {
    const existing = loadManifest2();
    saveManifest2({
      created_at: existing?.created_at ?? (/* @__PURE__ */ new Date()).toISOString(),
      entries: existing?.entries ?? []
    });
    console.log(`No skills to write.`);
    console.log(`tmp dir kept for inspection: ${tmpDir}`);
    return;
  }
  const flat = [];
  for (const r of results) {
    for (const sk of r.skills)
      flat.push({ skill: sk, session: r.session });
  }
  flat.sort((a, b) => b.session.mtime - a.session.mtime);
  const fanOutRoots = detectAgentSkillsRoots(skillsRoot);
  if (fanOutRoots.length > 0) {
    console.log(`Fan-out targets: ${fanOutRoots.join(", ")}`);
  }
  const written = [];
  const knownSummaries = [...existingSummaries];
  for (const { skill, session } of flat) {
    const overlap = findOverlap(skill.description, knownSummaries);
    if (overlap) {
      console.log(`  skipped ${skill.name} \u2190 session ${session.sessionId.slice(0, 8)} (description overlaps "${overlap.name}", Jaccard=${overlap.score.toFixed(2)})`);
      continue;
    }
    try {
      const result = writeNewSkill({
        skillsRoot,
        name: skill.name,
        description: skill.description,
        trigger: skill.trigger,
        body: skill.body,
        sourceSessions: [session.sessionId],
        agent: gateAgent
      });
      const canonicalDir = dirname17(result.path);
      const symlinks = fanOutRoots.length > 0 ? fanOutSymlinks(canonicalDir, basename2(canonicalDir), fanOutRoots) : [];
      const symlinkSuffix = symlinks.length > 0 ? `, fan-out \u2192 ${symlinks.length} root(s)` : "";
      console.log(`  wrote ${skill.name} \u2190 session ${session.sessionId.slice(0, 8)} (${session.agent}${symlinkSuffix})`);
      written.push({ skill, session, result, symlinks });
      knownSummaries.push({ name: skill.name, desc: skill.description });
    } catch (e) {
      if (/already exists/i.test(e.message ?? "")) {
        console.log(`  skipped ${skill.name} (file already exists at ${skillsRoot})`);
      } else {
        console.log(`  failed ${skill.name}: ${e.message}`);
      }
    }
  }
  if (written.length > 0) {
    const existing = loadManifest2();
    const newEntries = written.map(({ skill, session, result, symlinks }) => ({
      skill_name: skill.name,
      canonical_path: result.path,
      symlinks,
      source_session_ids: [session.sessionId],
      source_session_paths: [session.path],
      source_agent: session.agent,
      gate_agent: gateAgent,
      created_at: result.createdAt,
      uploaded: false,
      // Persist the one-line insight when the gate produced one. Omitted
      // (undefined → absent in JSON) when the gate couldn't ground a
      // concrete line, so the SessionStart banner falls back to the
      // count-only surface for entries written before this field landed.
      ...skill.insight ? { insight: skill.insight } : {}
    }));
    saveManifest2({
      created_at: existing?.created_at ?? (/* @__PURE__ */ new Date()).toISOString(),
      entries: [...existing?.entries ?? [], ...newEntries]
    });
  }
  console.log("");
  console.log(`Mined ${written.length} skill(s) from ${picked.length} session(s) (${results.filter((r) => r.skills.length > 0).length} session(s) contributed candidate(s)).`);
  console.log(`Installed to ${skillsRoot}/ \u2014 local-only, not shared.`);
  console.log(`Sign in with 'hivemind login' to share with your team later.`);
}

// dist/src/cli/skillify-spec.js
var SKILLIFY_SPEC = [
  {
    cmd: "hivemind skillify",
    desc: "show scope, team, install, per-project state"
  },
  {
    cmd: "hivemind skillify pull",
    desc: "sync project skills from the org table to local FS",
    options: [
      { flag: "--user <email>", desc: "only skills authored by that user" },
      { flag: "--users <a,b,c>", desc: "only skills from those authors" },
      { flag: "--all-users", desc: 'explicit "no author filter" (default)' },
      { flag: "--to <project|global>", desc: "install location (project=cwd/.claude/skills, global=~/.claude/skills)" },
      { flag: "--dry-run", desc: "preview without touching disk" },
      { flag: "--force", desc: "overwrite local files even if up-to-date (creates .bak)" },
      { flag: "<skill-name>", desc: "pull only that one skill (combines with --user)" }
    ],
    note: "every agent's SessionStart hook auto-runs 'pull --all-users --to global' on every session. File writes are idempotent (skipped when local is at-or-newer than remote). Disable via HIVEMIND_AUTOPULL_DISABLED=1."
  },
  {
    cmd: "hivemind skillify unpull",
    desc: "remove every skill previously installed by pull",
    options: [
      { flag: "--user <email>", desc: "remove only that author's pulls" },
      { flag: "--not-mine", desc: "remove all pulls except your own" },
      { flag: "--dry-run", desc: "preview without touching disk" }
    ]
  },
  {
    cmd: "hivemind skillify scope",
    args: "<me|team|org>",
    desc: "sharing scope for newly mined skills"
  },
  {
    cmd: "hivemind skillify install",
    args: "<project|global>",
    desc: "default install location for new skills"
  },
  {
    cmd: "hivemind skillify promote",
    args: "<skill-name>",
    desc: "move a project skill to the global location"
  },
  {
    cmd: "hivemind skillify team add|remove|list",
    args: "<name>",
    desc: "manage team member list"
  },
  {
    cmd: "hivemind skillify mine-local",
    desc: "one-shot: mine skills from local sessions (no auth needed)",
    options: [
      { flag: "--n <num|all>", desc: "how many sessions to mine (default: 8)" },
      { flag: "--force", desc: "re-run even if the manifest sentinel exists" },
      { flag: "--dry-run", desc: "stop before calling the LLM gate" }
    ]
  }
];
function renderCliHelpBlock() {
  const INDENT = "  ";
  const CMD_COL_WIDTH = 42;
  const lines = [];
  for (const sub of SKILLIFY_SPEC) {
    const left = sub.args ? `${sub.cmd} ${sub.args}` : sub.cmd;
    const padded = left.length >= CMD_COL_WIDTH ? `${left}  ` : left.padEnd(CMD_COL_WIDTH);
    lines.push(`${INDENT}${padded}${capitalize(sub.desc)}.`);
    if (sub.options && sub.options.length > 0) {
      const optsList = sub.options.map((o) => o.flag).join(", ");
      lines.push(`${INDENT}${" ".repeat(CMD_COL_WIDTH)}Options: ${optsList}.`);
    }
    if (sub.note) {
      const noteWrapped = wrapAt(`Note: ${sub.note}`, 72);
      for (const noteLine of noteWrapped) {
        lines.push(`${INDENT}${" ".repeat(CMD_COL_WIDTH)}${noteLine}`);
      }
    }
  }
  return lines.join("\n");
}
function renderSubcommandUsageBlock() {
  const INDENT = "  ";
  const SUB_INDENT = "    ";
  const FLAG_INDENT = "      ";
  const CMD_COL_WIDTH = 44;
  const FLAG_COL_WIDTH = 26;
  const lines = [];
  for (const sub of SKILLIFY_SPEC) {
    const left = sub.args ? `${sub.cmd} ${sub.args}` : sub.cmd;
    const padded = left.length >= CMD_COL_WIDTH ? `${left}  ` : left.padEnd(CMD_COL_WIDTH);
    lines.push(`${INDENT}${padded}${sub.desc}`);
    if (sub.options && sub.options.length > 0) {
      const tail = sub.cmd.split(" ").slice(-1)[0];
      lines.push(`${SUB_INDENT}Options for ${tail}:`);
      for (const opt of sub.options) {
        const flagPadded = opt.flag.length >= FLAG_COL_WIDTH ? `${opt.flag}  ` : opt.flag.padEnd(FLAG_COL_WIDTH);
        lines.push(`${FLAG_INDENT}${flagPadded}${opt.desc}`);
      }
    }
  }
  return lines.join("\n");
}
function capitalize(s) {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
function wrapAt(s, max) {
  const words = s.split(/\s+/);
  const out = [];
  let cur = "";
  for (const w of words) {
    if (cur.length === 0) {
      cur = w;
    } else if (cur.length + 1 + w.length > max) {
      out.push(cur);
      cur = w;
    } else {
      cur += " " + w;
    }
  }
  if (cur)
    out.push(cur);
  return out;
}

// dist/src/commands/skillify.js
function stateDir() {
  return getStateDir();
}
function showStatus() {
  const cfg = loadScopeConfig();
  console.log(`scope:   ${cfg.scope}`);
  console.log(`team:    ${cfg.team.length === 0 ? "(empty)" : cfg.team.join(", ")}`);
  console.log(`install: ${cfg.install}  (${cfg.install === "global" ? "~/.claude/skills/" : "<project>/.claude/skills/"})`);
  const dir = stateDir();
  if (!existsSync36(dir)) {
    console.log(`state: (no projects tracked yet)`);
    return;
  }
  const files = readdirSync8(dir).filter((f) => f.endsWith(".json") && f !== "config.json" && f !== "pulled.json" && f !== "autopull-last-run.json");
  if (files.length === 0) {
    console.log(`state: (no projects tracked yet)`);
    return;
  }
  console.log(`state: ${files.length} project(s) tracked`);
  for (const f of files) {
    try {
      const s = JSON.parse(readFileSync33(join47(dir, f), "utf-8"));
      const last = typeof s.updatedAt === "number" ? new Date(s.updatedAt).toISOString() : s.lastDate ?? "never";
      const skills = Array.isArray(s.skillsGenerated) && s.skillsGenerated.length > 0 ? s.skillsGenerated.join(", ") : "none";
      console.log(`  - ${s.project} (counter=${s.counter}, last=${last}, skills=${skills})`);
    } catch {
    }
  }
}
function setScope(scope) {
  if (scope !== "me" && scope !== "team") {
    console.error(`Invalid scope '${scope}'. Use one of: me, team`);
    process.exit(1);
  }
  const cfg = loadScopeConfig();
  saveScopeConfig({ ...cfg, scope });
  console.log(`Scope set to '${scope}'.`);
  if (scope === "team" && cfg.team.length === 0) {
    console.log(`Note: team list is empty. Use 'hivemind skillify team add <username>' to populate it.`);
  }
}
function setInstall(loc2) {
  if (loc2 !== "project" && loc2 !== "global") {
    console.error(`Invalid install location '${loc2}'. Use one of: project, global`);
    process.exit(1);
  }
  const cfg = loadScopeConfig();
  saveScopeConfig({ ...cfg, install: loc2 });
  const path = loc2 === "global" ? join47(homedir25(), ".claude", "skills") : "<cwd>/.claude/skills";
  console.log(`Install location set to '${loc2}'. New skills will be written to ${path}/<name>/SKILL.md.`);
}
function promoteSkill(name, cwd) {
  if (!name) {
    console.error("Usage: hivemind skillify promote <skill-name>");
    process.exit(1);
  }
  const projectPath = join47(cwd, ".claude", "skills", name);
  const globalPath = join47(homedir25(), ".claude", "skills", name);
  if (!existsSync36(join47(projectPath, "SKILL.md"))) {
    console.error(`Skill '${name}' not found at ${projectPath}/SKILL.md`);
    process.exit(1);
  }
  if (existsSync36(join47(globalPath, "SKILL.md"))) {
    console.error(`Skill '${name}' already exists at ${globalPath}/SKILL.md \u2014 refusing to overwrite. Remove it first or rename the project skill.`);
    process.exit(1);
  }
  mkdirSync25(dirname18(globalPath), { recursive: true });
  renameSync12(projectPath, globalPath);
  console.log(`Promoted '${name}' from ${projectPath} \u2192 ${globalPath}.`);
}
function teamAdd(name) {
  if (!name) {
    console.error("Usage: hivemind skillify team add <username>");
    process.exit(1);
  }
  const cfg = loadScopeConfig();
  if (cfg.team.includes(name)) {
    console.log(`'${name}' is already in the team list.`);
    return;
  }
  const next = [...cfg.team, name].sort();
  saveScopeConfig({ ...cfg, team: next });
  console.log(`Added '${name}' to team. Team is now: ${next.join(", ")}`);
}
function teamRemove(name) {
  if (!name) {
    console.error("Usage: hivemind skillify team remove <username>");
    process.exit(1);
  }
  const cfg = loadScopeConfig();
  if (!cfg.team.includes(name)) {
    console.log(`'${name}' is not in the team list.`);
    return;
  }
  const next = cfg.team.filter((n) => n !== name);
  saveScopeConfig({ ...cfg, team: next });
  console.log(`Removed '${name}' from team. Team is now: ${next.length === 0 ? "(empty)" : next.join(", ")}`);
}
function teamList() {
  const cfg = loadScopeConfig();
  if (cfg.team.length === 0) {
    console.log(`(team list is empty)`);
    return;
  }
  for (const n of cfg.team)
    console.log(n);
}
function usage() {
  console.log("Usage:");
  console.log(renderSubcommandUsageBlock());
}
function takeFlagValue2(args, flag) {
  const idx = args.indexOf(flag);
  if (idx < 0)
    return null;
  const value = args[idx + 1];
  if (value === void 0 || value.startsWith("--")) {
    console.error(`${flag} requires a value`);
    process.exit(1);
  }
  args.splice(idx, 2);
  return value;
}
function takeBooleanFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx < 0)
    return false;
  args.splice(idx, 1);
  return true;
}
async function pullSkills(args) {
  const work = [...args];
  const toRaw = takeFlagValue2(work, "--to") ?? "global";
  const userOne = takeFlagValue2(work, "--user");
  const usersMany = takeFlagValue2(work, "--users");
  const allUsers = takeBooleanFlag(work, "--all-users");
  const dryRun = takeBooleanFlag(work, "--dry-run");
  const force = takeBooleanFlag(work, "--force");
  const skillName = work[0];
  if (toRaw !== "project" && toRaw !== "global") {
    console.error(`Invalid --to '${toRaw}'. Use 'project' or 'global'.`);
    process.exit(1);
  }
  let users = [];
  if (allUsers)
    users = [];
  else if (userOne)
    users = [userOne];
  else if (usersMany)
    users = usersMany.split(",").map((s) => s.trim()).filter(Boolean);
  const config = loadConfig();
  if (!config) {
    console.error("Not logged in. Run: hivemind login");
    process.exit(1);
  }
  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.skillsTableName);
  const query = (sql) => api.query(sql);
  let summary;
  try {
    summary = await runPull({
      query,
      tableName: config.skillsTableName,
      install: toRaw,
      cwd: toRaw === "project" ? process.cwd() : void 0,
      users,
      skillName,
      dryRun,
      force
    });
  } catch (e) {
    console.error(`pull failed: ${e?.message ?? e}`);
    process.exit(1);
  }
  const dest = toRaw === "global" ? join47(homedir25(), ".claude", "skills") : `${process.cwd()}/.claude/skills`;
  const filterDesc = users.length === 0 ? "all users" : users.join(", ");
  console.log(`Destination: ${dest}`);
  console.log(`Filter:      ${filterDesc}${skillName ? ` \xB7 skill='${skillName}'` : ""}${dryRun ? " \xB7 dry-run" : ""}${force ? " \xB7 force" : ""}`);
  console.log(`Scanned ${summary.scanned} remote skill(s).`);
  for (const e of summary.entries) {
    const tag = e.action === "wrote" ? "\u2713 wrote" : e.action === "dryrun" ? "\u2192 would write" : "\xB7 skipped";
    const ver = e.localVersion === null ? `v${e.remoteVersion} (new)` : `v${e.localVersion} \u2192 v${e.remoteVersion}`;
    console.log(`  ${tag.padEnd(15)} ${e.name.padEnd(40)} ${ver.padEnd(20)} (${e.author}/${e.sourceAgent})`);
    if (e.manifestError) {
      console.warn(`    \u26A0 manifest not updated: ${e.manifestError} \u2014 \`unpull\` will not see this entry until a successful repull.`);
    }
  }
  console.log(`Result: ${summary.wrote} written, ${summary.dryrun} dry-run, ${summary.skipped} skipped.`);
}
async function unpullSkills(args) {
  const work = [...args];
  const toRaw = takeFlagValue2(work, "--to") ?? "global";
  const userOne = takeFlagValue2(work, "--user");
  const usersMany = takeFlagValue2(work, "--users");
  const notMine = takeBooleanFlag(work, "--not-mine");
  const dryRun = takeBooleanFlag(work, "--dry-run");
  const all = takeBooleanFlag(work, "--all");
  const legacyCleanup = takeBooleanFlag(work, "--legacy-cleanup");
  if (toRaw !== "project" && toRaw !== "global") {
    throw new Error(`Invalid --to '${toRaw}'. Use 'project' or 'global'.`);
  }
  let users = [];
  if (userOne)
    users = [userOne];
  else if (usersMany)
    users = usersMany.split(",").map((s) => s.trim()).filter(Boolean);
  let myUsername;
  if (notMine) {
    const config = loadConfig();
    if (!config) {
      throw new Error("--not-mine requires a logged-in user. Run: hivemind login");
    }
    myUsername = config.userName;
  }
  const summary = runUnpull({
    install: toRaw,
    cwd: toRaw === "project" ? process.cwd() : void 0,
    users,
    myUsername,
    notMine,
    dryRun,
    all,
    legacyCleanup
  });
  const dest = toRaw === "global" ? join47(homedir25(), ".claude", "skills") : `${process.cwd()}/.claude/skills`;
  const filterParts = [];
  if (users.length > 0)
    filterParts.push(`users=${users.join(",")}`);
  if (notMine)
    filterParts.push("not-mine");
  if (all)
    filterParts.push("all");
  if (legacyCleanup)
    filterParts.push("legacy-cleanup");
  if (dryRun)
    filterParts.push("dry-run");
  const filterDesc = filterParts.length ? filterParts.join(" \xB7 ") : "(no filter \u2014 all pulled)";
  console.log(`Scanning:    ${dest}`);
  console.log(`Filter:      ${filterDesc}`);
  console.log(`Scanned ${summary.scanned} dir(s).`);
  for (const e of summary.entries) {
    const tag = e.action === "removed" ? "\u2713 removed" : e.action === "would-remove" ? "\u2192 would remove" : e.action === "manifest-pruned" ? "\u26A0 pruned (orphan)" : "\xB7 kept";
    const id = e.dirName;
    const note = e.reason ? `  (${e.reason})` : "";
    console.log(`  ${tag.padEnd(20)} ${id.padEnd(50)} [${e.kind}]${note}`);
  }
  const prunedNote = summary.manifestPruned > 0 ? `, ${summary.manifestPruned} manifest-pruned` : "";
  console.log(`Result: ${summary.removed} removed, ${summary.wouldRemove} dry-run, ${summary.kept} kept${prunedNote}.`);
}
function runSkillifyCommand(args) {
  const sub = args[0];
  if (!sub || sub === "status") {
    showStatus();
    return;
  }
  if (sub === "scope") {
    setScope(args[1] ?? "");
    return;
  }
  if (sub === "install") {
    setInstall(args[1] ?? "");
    return;
  }
  if (sub === "promote") {
    promoteSkill(args[1] ?? "", process.cwd());
    return;
  }
  if (sub === "pull") {
    pullSkills(args.slice(1)).catch((e) => {
      console.error(`pull error: ${e?.message ?? e}`);
      process.exit(1);
    });
    return;
  }
  if (sub === "unpull") {
    unpullSkills(args.slice(1)).catch((e) => {
      console.error(`unpull error: ${e?.message ?? e}`);
      process.exit(1);
    }).catch(() => {
    });
    return;
  }
  if (sub === "team") {
    const action = args[1];
    if (action === "add") {
      teamAdd(args[2] ?? "");
      return;
    }
    if (action === "remove") {
      teamRemove(args[2] ?? "");
      return;
    }
    if (action === "list") {
      teamList();
      return;
    }
    console.error("Usage: hivemind skillify team <add|remove|list> [name]");
    process.exit(1);
  }
  if (sub === "mine-local") {
    runMineLocal(args.slice(1)).catch((e) => {
      console.error(`mine-local error: ${e?.message ?? e}`);
      process.exit(1);
    });
    return;
  }
  if (sub === "--help" || sub === "-h" || sub === "help") {
    usage();
    return;
  }
  console.error(`Unknown skillify subcommand: ${sub}`);
  usage();
  process.exit(1);
}
if (process.argv[1] && process.argv[1].endsWith("skillify.js")) {
  runSkillifyCommand(process.argv.slice(2));
}

// dist/src/rules/write.js
import { randomUUID as randomUUID3 } from "node:crypto";

// dist/src/rules/read.js
var SELECT_COLS = "id, rule_id, text, scope, status, assigned_by, version, created_at, agent, plugin_version";
async function listRules(query, tableName, opts = {}) {
  const safe = sqlIdent(tableName);
  const rows = await query(`SELECT ${SELECT_COLS} FROM "${safe}" ORDER BY version DESC, created_at DESC, id DESC`);
  const latest = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const row = normalize(r);
    if (!row)
      continue;
    if (!latest.has(row.rule_id))
      latest.set(row.rule_id, row);
  }
  const statusFilter = opts.status ?? "active";
  const filtered = [...latest.values()].filter((r) => statusFilter === "all" ? true : r.status === statusFilter);
  filtered.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  return filtered.slice(0, opts.limit ?? 10);
}
async function getRuleLatest(query, tableName, ruleId) {
  const safe = sqlIdent(tableName);
  const rows = await query(`SELECT ${SELECT_COLS} FROM "${safe}" WHERE rule_id = '${sqlStr(ruleId)}' ORDER BY version DESC, created_at DESC, id DESC LIMIT 1`);
  if (rows.length === 0)
    return null;
  return normalize(rows[0]);
}
function normalize(row) {
  const vRaw = row.version;
  const version = typeof vRaw === "number" ? vRaw : typeof vRaw === "string" ? Number(vRaw) : NaN;
  if (!Number.isFinite(version))
    return null;
  return {
    id: String(row.id ?? ""),
    rule_id: String(row.rule_id ?? ""),
    text: String(row.text ?? ""),
    scope: String(row.scope ?? ""),
    status: String(row.status ?? ""),
    assigned_by: String(row.assigned_by ?? ""),
    version,
    created_at: String(row.created_at ?? ""),
    agent: String(row.agent ?? ""),
    plugin_version: String(row.plugin_version ?? "")
  };
}

// dist/src/rules/write.js
var MAX_TEXT_LENGTH = 2e3;
function assertValidText(text) {
  if (text.length === 0)
    throw new Error("Rule text must not be empty");
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Rule text exceeds ${MAX_TEXT_LENGTH} chars (got ${text.length})`);
  }
  if (/[\r\n\u2028\u2029\u0085]/.test(text)) {
    throw new Error("Rule text must not contain newlines (use one rule per line)");
  }
}
async function insertRule(query, tableName, input) {
  assertValidText(input.text);
  const safe = sqlIdent(tableName);
  const ruleId = randomUUID3();
  const rowId = randomUUID3();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const agent = input.agent ?? "manual";
  const pluginVersion = input.plugin_version ?? "";
  const sql = `INSERT INTO "${safe}" (id, rule_id, text, scope, status, assigned_by, version, created_at, agent, plugin_version) VALUES ('${sqlStr(rowId)}', '${sqlStr(ruleId)}', E'${sqlStr(input.text)}', 'team', 'active', '${sqlStr(input.assigned_by)}', 1, '${sqlStr(now)}', '${sqlStr(agent)}', '${sqlStr(pluginVersion)}')`;
  await query(sql);
  return { rule_id: ruleId, version: 1 };
}
async function editRule(query, tableName, input) {
  const previous = await getRuleLatest(query, tableName, input.rule_id);
  if (!previous) {
    throw new Error(`Rule not found: ${input.rule_id}`);
  }
  return appendVersion(query, tableName, previous, {
    text: input.text ?? previous.text,
    status: input.status ?? previous.status,
    assigned_by: input.assigned_by,
    agent: input.agent,
    plugin_version: input.plugin_version
  });
}
async function markRuleDone(query, tableName, input) {
  return editRule(query, tableName, { ...input, status: "done" });
}
async function appendVersion(query, tableName, previous, next) {
  assertValidText(next.text);
  const safe = sqlIdent(tableName);
  const rowId = randomUUID3();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const nextVersion = previous.version + 1;
  const agent = next.agent ?? "manual";
  const pluginVersion = next.plugin_version ?? "";
  const sql = `INSERT INTO "${safe}" (id, rule_id, text, scope, status, assigned_by, version, created_at, agent, plugin_version) VALUES ('${sqlStr(rowId)}', '${sqlStr(previous.rule_id)}', E'${sqlStr(next.text)}', 'team', '${sqlStr(next.status)}', '${sqlStr(next.assigned_by)}', ${nextVersion}, '${sqlStr(now)}', '${sqlStr(agent)}', '${sqlStr(pluginVersion)}')`;
  await query(sql);
  return { rule_id: previous.rule_id, version: nextVersion };
}

// dist/src/commands/rules.js
var USAGE3 = `
hivemind rules \u2014 manage team-wide rules

Usage:
  hivemind rules add "<text>" [--scope team]
  hivemind rules list [--status active|done|all] [--limit N]
  hivemind rules edit <rule-id> "<new text>"
  hivemind rules done <rule-id>
`.trim();
function logUsageAndExit(code = 1) {
  console.error(USAGE3);
  process.exit(code);
  throw new Error("unreachable");
}
function requireConfig() {
  const cfg = loadConfig();
  if (!cfg) {
    console.error("Not logged in. Run `hivemind login` first.");
    process.exit(2);
    throw new Error("unreachable");
  }
  return cfg;
}
function makeApi(cfg) {
  return new DeeplakeApi(cfg.token, cfg.apiUrl, cfg.orgId, cfg.workspaceId, cfg.tableName);
}
function parseScope(args) {
  const idx = args.findIndex((a) => a === "--scope" || a.startsWith("--scope="));
  if (idx === -1)
    return "team";
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  if (raw !== "team") {
    console.error(`Invalid --scope value: ${raw}. Rules support 'team' only in v1.`);
    process.exit(1);
    throw new Error("unreachable");
  }
  return "team";
}
function parseStatus(args) {
  const idx = args.findIndex((a) => a === "--status" || a.startsWith("--status="));
  if (idx === -1)
    return "active";
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  if (raw === "active" || raw === "done" || raw === "all")
    return raw;
  console.error(`Invalid --status value: ${raw}. Allowed: active | done | all.`);
  process.exit(1);
  throw new Error("unreachable");
}
function parseLimit(args) {
  const idx = args.findIndex((a) => a === "--limit" || a.startsWith("--limit="));
  if (idx === -1)
    return 10;
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    console.error(`Invalid --limit value: ${raw}. Must be a positive integer.`);
    process.exit(1);
    throw new Error("unreachable");
  }
  return n;
}
function stripKnownFlags(args) {
  const KNOWN = /* @__PURE__ */ new Set(["--scope", "--status", "--limit"]);
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (KNOWN.has(a)) {
      i++;
      continue;
    }
    if (KNOWN.has(a.split("=", 2)[0])) {
      continue;
    }
    out.push(a);
  }
  return out;
}
function formatListRow(r) {
  const tag = r.status === "done" ? "[done]" : "[active]";
  return `${tag} ${r.rule_id}  v${r.version}  ${r.assigned_by}  ${r.text}`;
}
async function runRulesCommand(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h" || sub === "help") {
    console.log(USAGE3);
    return;
  }
  const cfg = requireConfig();
  const api = makeApi(cfg);
  const tableName = cfg.rulesTableName;
  const WRITE_SUBS = /* @__PURE__ */ new Set(["add", "edit", "done"]);
  if (WRITE_SUBS.has(sub)) {
    await api.ensureRulesTable(tableName);
  }
  const pluginVersion = getVersion();
  if (sub === "add") {
    const positional = stripKnownFlags(args.slice(1));
    const text = positional[0];
    if (!text) {
      console.error('Missing rule text. Usage: hivemind rules add "<text>" [--scope team]');
      process.exit(1);
      throw new Error("unreachable");
    }
    parseScope(args.slice(1));
    try {
      const out = await insertRule(api.query.bind(api), tableName, {
        text,
        assigned_by: cfg.userName,
        plugin_version: pluginVersion
      });
      console.log(`Added rule ${out.rule_id} (v${out.version}).`);
    } catch (err) {
      console.error(`Add failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  if (sub === "list") {
    const status = parseStatus(args.slice(1));
    const limit = parseLimit(args.slice(1));
    let rows = [];
    try {
      rows = await listRules(api.query.bind(api), tableName, { status, limit });
    } catch (err) {
      const msg = err.message;
      if (!isMissingTableError(msg))
        throw err;
    }
    if (rows.length === 0) {
      console.log(`(no rules with status=${status})`);
      return;
    }
    for (const r of rows)
      console.log(formatListRow(r));
    return;
  }
  if (sub === "edit") {
    const positional = stripKnownFlags(args.slice(1));
    const ruleId = positional[0];
    const newText = positional[1];
    if (!ruleId || !newText) {
      console.error('Usage: hivemind rules edit <rule-id> "<new text>"');
      process.exit(1);
      throw new Error("unreachable");
    }
    try {
      const out = await editRule(api.query.bind(api), tableName, {
        rule_id: ruleId,
        text: newText,
        assigned_by: cfg.userName,
        plugin_version: pluginVersion
      });
      console.log(`Edited rule ${out.rule_id} \u2192 v${out.version}.`);
    } catch (err) {
      console.error(`Edit failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  if (sub === "done") {
    const positional = stripKnownFlags(args.slice(1));
    const ruleId = positional[0];
    if (!ruleId) {
      console.error("Usage: hivemind rules done <rule-id>");
      process.exit(1);
      throw new Error("unreachable");
    }
    try {
      const out = await markRuleDone(api.query.bind(api), tableName, {
        rule_id: ruleId,
        assigned_by: cfg.userName,
        plugin_version: pluginVersion
      });
      console.log(`Marked rule ${out.rule_id} done (v${out.version}).`);
    } catch (err) {
      console.error(`Done failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  console.error(`Unknown rules subcommand: ${sub}`);
  logUsageAndExit(1);
}

// dist/src/commands/goal.js
import { randomUUID as randomUUID4 } from "node:crypto";
var VALID_STATUS = /* @__PURE__ */ new Set(["opened", "in_progress", "closed"]);
var VALID_AGENT = /* @__PURE__ */ new Set(["manual", "capture"]);
function parseAgentFlag(args) {
  const rest = [];
  let agent = "manual";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--agent") {
      const val = args[i + 1];
      if (!val) {
        process.stderr.write("usage: --agent requires a value (manual|capture)\n");
        process.exit(1);
      }
      agent = val;
      i++;
      continue;
    }
    rest.push(args[i]);
  }
  if (!VALID_AGENT.has(agent)) {
    process.stderr.write(`invalid --agent: ${agent} (expected manual|capture)
`);
    process.exit(1);
  }
  return { agent, rest };
}
function loadApiOrDie(table) {
  const cfg = loadConfig();
  if (!cfg) {
    process.stderr.write("hivemind: not logged in. Run `hivemind login` first.\n");
    process.exit(1);
  }
  const api = new DeeplakeApi(cfg.token, cfg.apiUrl, cfg.orgId, cfg.workspaceId, table);
  const query = (sql) => api.query(sql);
  return { api, query, userName: cfg.userName };
}
async function goalAdd(text, agent = "manual") {
  const cfg = loadConfig();
  if (!cfg) {
    process.stderr.write("hivemind: not logged in.\n");
    process.exit(1);
  }
  const table = cfg.goalsTableName;
  const { api, query } = loadApiOrDie(table);
  await api.ensureGoalsTable(table);
  const safe = sqlIdent(table);
  const goalId = randomUUID4();
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  await query(`INSERT INTO "${safe}" (id, goal_id, owner, status, content, version, created_at, updated_at, agent, plugin_version) VALUES ('${randomUUID4()}', '${sqlStr(goalId)}', '${sqlStr(cfg.userName)}', 'opened', E'${sqlStr(text)}', 1, '${sqlStr(ts)}', '${sqlStr(ts)}', '${sqlStr(agent)}', '')`);
  process.stdout.write(`${goalId}
`);
}
async function goalList(filter) {
  const cfg = loadConfig();
  if (!cfg) {
    process.stderr.write("not logged in\n");
    process.exit(1);
  }
  const { query } = loadApiOrDie(cfg.goalsTableName);
  const safe = sqlIdent(cfg.goalsTableName);
  let where = "";
  if (filter === "mine")
    where = `WHERE owner = '${sqlStr(cfg.userName)}'`;
  try {
    const rows = await query(`SELECT goal_id, owner, status, content FROM "${safe}" ${where} ORDER BY created_at DESC LIMIT 50`);
    if (rows.length === 0) {
      process.stdout.write("(no goals)\n");
      return;
    }
    for (const r of rows) {
      const text = String(r.content ?? "").split(/\r?\n/)[0].trim();
      process.stdout.write(`${r.goal_id}	${r.owner}	${r.status}	${text}
`);
    }
  } catch (e) {
    process.stderr.write(`hivemind goal list: ${e.message}
`);
    process.exit(1);
  }
}
async function goalGet(goalId) {
  if (!goalId) {
    process.stderr.write("usage: hivemind goal get <goal_id>\n");
    process.exit(1);
  }
  const cfg = loadConfig();
  if (!cfg) {
    process.stderr.write("not logged in\n");
    process.exit(1);
  }
  const { query } = loadApiOrDie(cfg.goalsTableName);
  const safe = sqlIdent(cfg.goalsTableName);
  try {
    const rows = await query(`SELECT content FROM "${safe}" WHERE goal_id = '${sqlStr(goalId)}' ORDER BY version DESC, created_at DESC LIMIT 1`);
    if (rows.length === 0) {
      process.stderr.write(`goal not found: ${goalId}
`);
      process.exit(1);
    }
    process.stdout.write(`${String(rows[0].content ?? "")}
`);
  } catch (e) {
    process.stderr.write(`hivemind goal get: ${e.message}
`);
    process.exit(1);
  }
}
async function goalDone(goalId) {
  await goalProgress(goalId, "closed");
}
async function goalProgress(goalId, status) {
  if (!VALID_STATUS.has(status)) {
    process.stderr.write(`invalid status: ${status} (expected opened|in_progress|closed)
`);
    process.exit(1);
  }
  const cfg = loadConfig();
  if (!cfg) {
    process.stderr.write("not logged in\n");
    process.exit(1);
  }
  const { api, query } = loadApiOrDie(cfg.goalsTableName);
  await api.ensureGoalsTable(cfg.goalsTableName);
  const safe = sqlIdent(cfg.goalsTableName);
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  await query(`UPDATE "${safe}" SET status = '${sqlStr(status)}', updated_at = '${sqlStr(ts)}' WHERE goal_id = '${sqlStr(goalId)}'`);
  process.stdout.write(`${goalId} -> ${status}
`);
}
async function kpiAdd(args) {
  const [goalId, kpiId, targetStr, unit, ...nameParts] = args;
  if (!goalId || !kpiId || !targetStr || !unit) {
    process.stderr.write("usage: hivemind kpi add <goal_id> <kpi_id> <target> <unit> [name]\n");
    process.exit(1);
  }
  const target = Number.parseInt(targetStr, 10);
  if (!Number.isFinite(target) || target <= 0) {
    process.stderr.write(`invalid target: ${targetStr} (must be positive integer)
`);
    process.exit(1);
  }
  const name = nameParts.length > 0 ? nameParts.join(" ") : kpiId;
  const cfg = loadConfig();
  if (!cfg) {
    process.stderr.write("not logged in\n");
    process.exit(1);
  }
  const { api, query } = loadApiOrDie(cfg.kpisTableName);
  await api.ensureKpisTable(cfg.kpisTableName);
  const safe = sqlIdent(cfg.kpisTableName);
  const content = `${name}

- target: ${target}
- current: 0
- unit: ${unit}`;
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  await query(`INSERT INTO "${safe}" (id, goal_id, kpi_id, content, version, created_at, updated_at, agent, plugin_version) VALUES ('${randomUUID4()}', '${sqlStr(goalId)}', '${sqlStr(kpiId)}', E'${sqlStr(content)}', 1, '${sqlStr(ts)}', '${sqlStr(ts)}', 'manual', '')`);
  process.stdout.write(`${goalId}/${kpiId}
`);
}
async function kpiList(goalId) {
  if (!goalId) {
    process.stderr.write("usage: hivemind kpi list <goal_id>\n");
    process.exit(1);
  }
  const cfg = loadConfig();
  if (!cfg) {
    process.stderr.write("not logged in\n");
    process.exit(1);
  }
  const { query } = loadApiOrDie(cfg.kpisTableName);
  const safe = sqlIdent(cfg.kpisTableName);
  try {
    const rows = await query(`SELECT kpi_id, content FROM "${safe}" WHERE goal_id = '${sqlStr(goalId)}' ORDER BY created_at ASC LIMIT 50`);
    if (rows.length === 0) {
      process.stdout.write("(no kpis)\n");
      return;
    }
    for (const r of rows) {
      const firstLine = String(r.content ?? "").split(/\r?\n/)[0].trim();
      process.stdout.write(`${r.kpi_id}	${firstLine}
`);
    }
  } catch (e) {
    process.stderr.write(`hivemind kpi list: ${e.message}
`);
    process.exit(1);
  }
}
async function kpiBump(goalId, kpiId, deltaStr) {
  if (!goalId || !kpiId || !deltaStr) {
    process.stderr.write("usage: hivemind kpi bump <goal_id> <kpi_id> <delta>\n");
    process.exit(1);
  }
  const delta = Number.parseInt(deltaStr, 10);
  if (!Number.isFinite(delta)) {
    process.stderr.write(`invalid delta: ${deltaStr}
`);
    process.exit(1);
  }
  const cfg = loadConfig();
  if (!cfg) {
    process.stderr.write("not logged in\n");
    process.exit(1);
  }
  const { api, query } = loadApiOrDie(cfg.kpisTableName);
  await api.ensureKpisTable(cfg.kpisTableName);
  const safe = sqlIdent(cfg.kpisTableName);
  const rows = await query(`SELECT content FROM "${safe}" WHERE goal_id = '${sqlStr(goalId)}' AND kpi_id = '${sqlStr(kpiId)}' LIMIT 1`);
  if (rows.length === 0) {
    process.stderr.write(`kpi not found: ${goalId}/${kpiId}
`);
    process.exit(1);
  }
  const content = String(rows[0].content ?? "");
  const newContent = content.replace(/^(\s*-?\s*current\s*:\s*)(-?\d+)(\s*)$/m, (_m, prefix, n, suffix) => `${prefix}${Number.parseInt(n, 10) + delta}${suffix}`);
  if (newContent === content) {
    process.stderr.write(`could not find 'current:' line in kpi ${goalId}/${kpiId}
`);
    process.exit(1);
  }
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  await query(`UPDATE "${safe}" SET content = E'${sqlStr(newContent)}', updated_at = '${sqlStr(ts)}' WHERE goal_id = '${sqlStr(goalId)}' AND kpi_id = '${sqlStr(kpiId)}'`);
  process.stdout.write(`${goalId}/${kpiId} +${delta}
`);
}
var USAGE_GOAL = `
hivemind goal \u2014 manage team goals

Usage:
  hivemind goal add "<text>" [--agent manual|capture]
                                        create a goal (status=opened)
  hivemind goal list [--all|--mine]     list goals (default: --mine)
  hivemind goal get <goal_id>           print a goal's full body (resume context)
  hivemind goal done <goal_id>          mark goal closed
  hivemind goal progress <goal_id> <opened|in_progress|closed>
`.trim();
async function runGoalCommand(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h") {
    process.stdout.write(USAGE_GOAL + "\n");
    return;
  }
  if (sub === "add") {
    const { agent, rest } = parseAgentFlag(args.slice(1));
    const text = rest.join(" ").trim();
    if (!text) {
      process.stderr.write('usage: hivemind goal add "<text>"\n');
      process.exit(1);
    }
    await goalAdd(text, agent);
    return;
  }
  if (sub === "list") {
    const filter = args.includes("--all") ? "all" : "mine";
    await goalList(filter);
    return;
  }
  if (sub === "get") {
    const id = args[1];
    if (!id) {
      process.stderr.write("usage: hivemind goal get <goal_id>\n");
      process.exit(1);
    }
    await goalGet(id);
    return;
  }
  if (sub === "done") {
    const id = args[1];
    if (!id) {
      process.stderr.write("usage: hivemind goal done <goal_id>\n");
      process.exit(1);
    }
    await goalDone(id);
    return;
  }
  if (sub === "progress") {
    const id = args[1];
    const status = args[2];
    if (!id || !status) {
      process.stderr.write("usage: hivemind goal progress <goal_id> <status>\n");
      process.exit(1);
    }
    await goalProgress(id, status);
    return;
  }
  process.stderr.write(`unknown goal subcommand: ${sub}
${USAGE_GOAL}
`);
  process.exit(1);
}
var USAGE_KPI = `
hivemind kpi \u2014 manage goal KPIs

Usage:
  hivemind kpi add <goal_id> <kpi_id> <target> <unit> [name]
  hivemind kpi list <goal_id>
  hivemind kpi bump <goal_id> <kpi_id> <delta>
`.trim();
async function runKpiCommand(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h") {
    process.stdout.write(USAGE_KPI + "\n");
    return;
  }
  if (sub === "add") {
    await kpiAdd(args.slice(1));
    return;
  }
  if (sub === "list") {
    await kpiList(args[1]);
    return;
  }
  if (sub === "bump") {
    await kpiBump(args[1], args[2], args[3]);
    return;
  }
  process.stderr.write(`unknown kpi subcommand: ${sub}
${USAGE_KPI}
`);
  process.exit(1);
}

// dist/src/hooks/shared/context-renderer.js
async function renderContextBlock(query, input, opts = {}) {
  const maxRules = opts.maxRules ?? 10;
  const maxGoals = opts.maxGoals ?? 10;
  const log8 = opts.log ?? (() => {
  });
  try {
    const tableExists = opts.tableExists;
    let rules = [];
    if (tableExists && !tableExists(input.rulesTable)) {
      log8(`render-context-block: rules table "${input.rulesTable}" not present \u2014 skipping read`);
    } else {
      try {
        rules = await listRules(query, input.rulesTable, {
          status: "active",
          limit: Math.max(maxRules * 4, maxRules + 1)
        });
      } catch (rulesErr) {
        const rmsg = rulesErr instanceof Error ? rulesErr.message : String(rulesErr);
        log8(`render-context-block: rules unavailable (continuing): ${rmsg}`);
      }
    }
    let goals = [];
    if (tableExists && !tableExists(input.goalsTable)) {
      log8(`render-context-block: goals table "${input.goalsTable}" not present \u2014 skipping read`);
    } else {
      try {
        goals = await listOpenGoals(query, input.goalsTable, input.currentUser, {
          limit: Math.max(maxGoals * 4, maxGoals + 1)
        });
      } catch (goalsErr) {
        const gmsg = goalsErr instanceof Error ? goalsErr.message : String(goalsErr);
        log8(`render-context-block: goals unavailable (continuing): ${gmsg}`);
      }
    }
    const rulesShown = rules.slice(0, maxRules);
    const rulesHidden = Math.max(0, rules.length - maxRules);
    const goalsShown = goals.slice(0, maxGoals);
    const goalsHidden = Math.max(0, goals.length - maxGoals);
    return formatBlock({ rules: rulesShown, rulesHidden, goals: goalsShown, goalsHidden });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log8(`render-context-block: ${msg}`);
    return "";
  }
}
async function listOpenGoals(query, goalsTable, currentUser, opts = {}) {
  const limit = opts.limit ?? 40;
  const safe = sqlIdent(goalsTable);
  const fullUser = currentUser.trim();
  const shortUser = fullUser.split("@")[0] ?? fullUser;
  const fullEq = sqlStr(fullUser);
  const shortEq = sqlStr(shortUser);
  const shortLike = sqlLike(shortUser);
  const sql = `SELECT goal_id, owner, status, content FROM "${safe}" g1 WHERE (owner = '${fullEq}' OR owner = '${shortEq}' OR owner LIKE '${shortLike}@%') AND status IN ('opened', 'in_progress') AND version = (SELECT MAX(version) FROM "${safe}" g2 WHERE g2.goal_id = g1.goal_id) ORDER BY status ASC, created_at DESC LIMIT ${limit}`;
  const rows = await query(sql);
  const out = [];
  for (const r of rows) {
    const ownerNorm = String(r["owner"] ?? "").trim();
    const ownerShort = ownerNorm.split("@")[0] ?? ownerNorm;
    if (ownerNorm !== fullUser && ownerNorm !== shortUser && ownerShort !== shortUser) {
      continue;
    }
    out.push({
      goal_id: String(r["goal_id"] ?? ""),
      status: String(r["status"] ?? ""),
      content: String(r["content"] ?? "")
    });
  }
  return out;
}
function formatBlock(input) {
  if (input.rules.length === 0 && input.goals.length === 0)
    return "";
  const lines = [];
  if (input.rules.length > 0) {
    lines.push(`=== HIVEMIND RULES (${input.rules.length} active) ===`);
    for (const r of input.rules) {
      lines.push(`- ${r.rule_id}: ${sanitizeForInject(r.text)}`);
    }
    if (input.rulesHidden > 0) {
      lines.push(`(${input.rulesHidden} more \u2014 run 'hivemind rules list' to see all)`);
    }
    lines.push("");
  }
  if (input.goals.length > 0) {
    const inProgress = input.goals.filter((g) => g.status === "in_progress").length;
    const opened = input.goals.filter((g) => g.status === "opened").length;
    lines.push(`=== HIVEMIND GOALS (${inProgress} in_progress, ${opened} opened) ===`);
    for (const g of input.goals) {
      const firstLine = sanitizeForInject(firstNonEmptyLine(g.content));
      const tag = g.status === "in_progress" ? "[in_progress]" : "[opened]     ";
      lines.push(`${tag} ${g.goal_id}: ${firstLine}`);
    }
    if (input.goalsHidden > 0) {
      lines.push(`(${input.goalsHidden} more \u2014 run 'hivemind goal list --mine' to see all)`);
    }
    lines.push("");
  }
  lines.push("=== HIVEMIND HOW-TO ===");
  if (input.rules.length > 0) {
    lines.push("- Rules above are team principles. Treat any action that would violate one as a critical error and surface it to the user before proceeding.");
  }
  if (input.goals.length > 0) {
    lines.push("- Goals above are your current open work items. Move a goal forward by `mv`-ing its file between memory/goal/<user>/{opened,in_progress,closed}/ (claude-code/codex) or `hivemind goal progress <goal_id> <status>` (cursor/hermes/pi).");
  }
  lines.push("- Run 'hivemind rules list' / 'hivemind goal list --mine' for the full inventories beyond what's shown here.");
  return lines.join("\n");
}
function firstNonEmptyLine(content) {
  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (trimmed.length > 0)
      return trimmed;
  }
  return "(empty)";
}
function sanitizeForInject(text) {
  return text.replace(LINE_TERMINATOR_RE, "\\n");
}
var LINE_TERMINATOR_RE = /\r\n?|[\n\u2028\u2029\u0085]/g;

// dist/src/commands/context.js
var USAGE4 = `
hivemind context \u2014 print the rules + open-goals block on demand

Usage:
  hivemind context

Same output that SessionStart auto-injects for claude-code / cursor /
hermes: active org rules + the current user's open goals (status
opened or in_progress). Use from pi / openclaw agents (which have no
SessionStart hook in v1) to pull the block manually, or anywhere as
a read-only diagnostic to see what the renderer would produce right
now.
`.trim();
async function runContextCommand(args) {
  if (args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    console.log(USAGE4);
    return;
  }
  const cfg = loadConfig();
  if (!cfg) {
    console.error("Not logged in. Run `hivemind login` first.");
    process.exit(2);
    throw new Error("unreachable");
  }
  const api = new DeeplakeApi(cfg.token, cfg.apiUrl, cfg.orgId, cfg.workspaceId, cfg.tableName);
  const known = await api.knownTablesOrNull();
  const tableExists = known ? (name) => known.includes(name) : void 0;
  const block = await renderContextBlock((sql) => api.query(sql), {
    rulesTable: cfg.rulesTableName,
    goalsTable: cfg.goalsTableName,
    currentUser: cfg.userName
  }, { tableExists });
  if (!block) {
    console.error("(no active rules or open goals)");
    return;
  }
  console.log(block);
}

// dist/src/cli/update.js
import { execFileSync as execFileSync6 } from "node:child_process";
import { closeSync as closeSync3, existsSync as existsSync37, mkdirSync as mkdirSync26, openSync as openSync3, readFileSync as readFileSync35, realpathSync, unlinkSync as unlinkSync13, writeSync as writeSync2 } from "node:fs";
import { homedir as homedir26 } from "node:os";
import { dirname as dirname20, join as join49, sep as sep2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// dist/src/utils/version-check.js
import { readFileSync as readFileSync34 } from "node:fs";
import { dirname as dirname19, join as join48 } from "node:path";
function isNewer(latest, current) {
  const parse = (v) => v.split(".").map(Number);
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  return la > ca || la === ca && lb > cb || la === ca && lb === cb && lc > cc;
}

// dist/src/cli/update.js
var NPM_REGISTRY_URL = "https://registry.npmjs.org/@deeplake/hivemind/latest";
var PKG_NAME = "@deeplake/hivemind";
function defaultLockPath() {
  return join49(homedir26(), ".deeplake", "hivemind-update.lock");
}
function detectInstallKind(argv1) {
  const realArgv1 = (() => {
    try {
      return realpathSync(argv1 ?? process.argv[1] ?? fileURLToPath2(import.meta.url));
    } catch {
      return argv1 ?? process.argv[1] ?? fileURLToPath2(import.meta.url);
    }
  })();
  let dir = dirname20(realArgv1);
  let installDir = null;
  for (let i = 0; i < 10; i++) {
    const pkgPath = `${dir}${sep2}package.json`;
    try {
      const pkg = JSON.parse(readFileSync35(pkgPath, "utf-8"));
      if (pkg.name === PKG_NAME || pkg.name === "hivemind") {
        installDir = dir;
        break;
      }
    } catch {
    }
    const parent = dirname20(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  installDir ??= dirname20(realArgv1);
  if (realArgv1.includes(`${sep2}_npx${sep2}`) || realArgv1.includes(`${sep2}.npx${sep2}`)) {
    return { kind: "npx", installDir };
  }
  if (realArgv1.includes(`${sep2}node_modules${sep2}@deeplake${sep2}hivemind`) || realArgv1.includes(`${sep2}node_modules${sep2}hivemind`)) {
    return { kind: "npm-global", installDir };
  }
  let gitDir = installDir;
  for (let i = 0; i < 6; i++) {
    if (existsSync37(`${gitDir}${sep2}.git`)) {
      return { kind: "local-dev", installDir };
    }
    const parent = dirname20(gitDir);
    if (parent === gitDir)
      break;
    gitDir = parent;
  }
  return { kind: "unknown", installDir };
}
async function getLatestNpmVersion(timeoutMs = 5e3) {
  try {
    const res = await fetch(NPM_REGISTRY_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok)
      return null;
    const meta = await res.json();
    return meta.version ?? null;
  } catch {
    return null;
  }
}
var defaultSpawn = (cmd, args) => {
  execFileSync6(cmd, args, { stdio: "inherit" });
};
function tryAcquireLock(path) {
  mkdirSync26(dirname20(path), { recursive: true, mode: 448 });
  const claim = () => {
    const fd = openSync3(path, "wx", 384);
    writeSync2(fd, String(process.pid));
    return fd;
  };
  try {
    return claim();
  } catch (e) {
    if (e.code !== "EEXIST")
      throw e;
  }
  let holderPid = 0;
  try {
    holderPid = Number(readFileSync35(path, "utf-8").trim()) || 0;
  } catch {
    try {
      return claim();
    } catch {
      return null;
    }
  }
  if (holderPid > 0) {
    try {
      process.kill(holderPid, 0);
      log(`another hivemind update is already running (pid=${holderPid}); skipping.`);
      return null;
    } catch {
    }
  }
  try {
    unlinkSync13(path);
  } catch {
  }
  try {
    return claim();
  } catch {
    log(`another hivemind update is already running; skipping.`);
    return null;
  }
}
function releaseLock(fd, path) {
  try {
    closeSync3(fd);
  } catch {
  }
  try {
    unlinkSync13(path);
  } catch {
  }
}
async function runUpdate(opts = {}) {
  const current = opts.currentVersionOverride ?? getVersion();
  const latest = opts.latestVersionOverride !== void 0 ? opts.latestVersionOverride : await getLatestNpmVersion();
  if (!latest) {
    warn(`Could not reach npm registry to check for updates.`);
    warn(`Current version: ${current}`);
    return 1;
  }
  if (!isNewer(latest, current)) {
    log(`hivemind ${current} is up to date (npm latest: ${latest}).`);
    return 0;
  }
  log(`Update available: ${current} \u2192 ${latest}`);
  const detected = opts.installKindOverride ?? detectInstallKind();
  const spawn5 = opts.spawn ?? defaultSpawn;
  switch (detected.kind) {
    case "npm-global": {
      if (opts.dryRun) {
        log(`(dry-run) Would run: npm install -g ${PKG_NAME}@${latest}`);
        log(`(dry-run) Would re-run: hivemind install --skip-auth`);
        return 0;
      }
      const lockPath2 = opts.lockPathOverride ?? defaultLockPath();
      const lockFd = tryAcquireLock(lockPath2);
      if (lockFd === null)
        return 0;
      try {
        log(`Upgrading via npm\u2026`);
        try {
          spawn5("npm", ["install", "-g", `${PKG_NAME}@${latest}`]);
        } catch (e) {
          warn(`npm install failed: ${e.message}`);
          warn(`Try running it manually: npm install -g ${PKG_NAME}@${latest}`);
          return 1;
        }
        log(``);
        log(`Refreshing agent bundles\u2026`);
        try {
          spawn5("hivemind", ["install", "--skip-auth"]);
        } catch (e) {
          warn(`Agent refresh failed: ${e.message}`);
          warn(`Run manually: hivemind install`);
          return 1;
        }
        log(``);
        log(`Updated to ${latest}.`);
        return 0;
      } finally {
        releaseLock(lockFd, lockPath2);
      }
    }
    case "npx": {
      if (opts.dryRun) {
        log(`(dry-run) Would print npx-pin instructions (no persistent install to upgrade).`);
        return 0;
      }
      log(`You ran hivemind via npx, which does not have a persistent global install.`);
      log(`To use the new version, re-run with the explicit version pin:`);
      log(``);
      log(`  npx ${PKG_NAME}@${latest} install`);
      log(``);
      log(`Or install globally so future updates are one command:`);
      log(``);
      log(`  npm install -g ${PKG_NAME}@${latest}`);
      return 0;
    }
    case "local-dev": {
      if (opts.dryRun) {
        log(`(dry-run) Would refuse: running from a local dev checkout (${detected.installDir}).`);
        return 0;
      }
      warn(`hivemind is running from a local development checkout (${detected.installDir}).`);
      warn(`Update via your dev workflow (git pull + npm install + npm run build),`);
      warn(`not via 'hivemind update'.`);
      return 1;
    }
    case "unknown":
    default: {
      if (opts.dryRun) {
        log(`(dry-run) Would refuse: install kind unknown (${detected.installDir}).`);
        return 0;
      }
      warn(`Could not determine how hivemind was installed (path: ${detected.installDir}).`);
      warn(`Update manually: npm install -g ${PKG_NAME}@${latest}`);
      return 1;
    }
  }
}

// dist/src/cli/install-scan.js
import { spawn as spawn4 } from "node:child_process";
import { existsSync as existsSync39, readFileSync as readFileSync36, readdirSync as readdirSync9, unlinkSync as unlinkSync14 } from "node:fs";
import { homedir as homedir27 } from "node:os";
import { join as join50 } from "node:path";

// dist/src/skillify/advisor.js
import { spawn as spawn3 } from "node:child_process";
import { existsSync as existsSync38 } from "node:fs";
var ADVISOR_TIMEOUT_MS = 6e4;
var MAX_CANDIDATES = 20;
function buildAdvisorPrompt(candidates) {
  const lines = [
    "You are reviewing skill candidates extracted from a user's coding sessions.",
    "Pick the ONE candidate whose `insight` field is most useful to show the user as a",
    "concrete finding from their past work. Reply on EXACTLY ONE LINE.",
    "",
    "GOOD insights are:",
    "  - Concrete and counted (cite specific numbers, file names, durations)",
    '  - About a real coding mistake or pattern the USER made (in 2nd person \u2014 "You did X")',
    "  - Actionable: the user can change behavior based on knowing this",
    "",
    "BAD insights (REJECT these) are:",
    '  - Meta-commentary about why the skill was saved ("User explicitly requested...")',
    "  - Vague / generic engineering platitudes the user already knows",
    "  - About someone other than the user (a teammate, a third party)",
    '  - Hypothetical ("could lead to...", "might cause...") rather than observed',
    "",
    "Output format \u2014 STRICT, one line only:",
    "  PICK: <number 1-N>",
    "OR",
    "  REJECT_ALL: <short reason why every candidate failed>",
    "",
    "Candidates:"
  ];
  for (const [i, c] of candidates.entries()) {
    lines.push(`${i + 1}. name=${c.skill_name}  insight=${JSON.stringify((c.insight ?? "").slice(0, 400))}`);
  }
  return lines.join("\n");
}
function parseAdvisorOutput(raw, candidates) {
  const cleaned = raw.trim();
  const pickMatch = cleaned.match(/PICK:\s*(\d+)/i);
  if (pickMatch) {
    const idx = parseInt(pickMatch[1], 10) - 1;
    if (idx >= 0 && idx < candidates.length) {
      return {
        pickedSkillName: candidates[idx].skill_name,
        reason: cleaned,
        rawOutput: raw
      };
    }
  }
  const rejectMatch = cleaned.match(/REJECT_ALL:\s*(.+)/i);
  if (rejectMatch) {
    return { pickedSkillName: null, reason: rejectMatch[1].trim(), rawOutput: raw };
  }
  return { pickedSkillName: null, reason: `unparseable advisor output: ${cleaned.slice(0, 120)}`, rawOutput: raw };
}
function runAdvisorGate(prompt, claudeBin) {
  return new Promise((resolve6, reject) => {
    const child = spawn3(claudeBin, [
      "-p",
      "--no-session-persistence",
      "--model",
      "sonnet",
      "--permission-mode",
      "bypassPermissions"
    ], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, HIVEMIND_WIKI_WORKER: "1", HIVEMIND_CAPTURE: "false" }
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (err, out) => {
      if (settled)
        return;
      settled = true;
      if (err)
        reject(err);
      else
        resolve6(out);
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
      }
      finish(new Error(`advisor timed out after ${ADVISOR_TIMEOUT_MS}ms`), "");
    }, ADVISOR_TIMEOUT_MS);
    child.stdout.on("data", (b) => {
      stdout += b.toString("utf-8");
    });
    child.stderr.on("data", (b) => {
      stderr += b.toString("utf-8");
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      finish(e, "");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish(new Error(`advisor CLI exit ${code}; stderr=${stderr.slice(0, 200)}`), "");
      } else {
        finish(null, stdout);
      }
    });
    child.stdin.on("error", (e) => {
      clearTimeout(timer);
      finish(e, "");
    });
    child.stdin.end(prompt);
  });
}
async function runAdvisor(manifestPath3 = LOCAL_MANIFEST_PATH) {
  const m = readLocalManifest(manifestPath3);
  if (!m || !Array.isArray(m.entries))
    return null;
  const insightBearing = m.entries.filter((e) => e && typeof e.insight === "string" && e.insight.trim().length > 0);
  if (insightBearing.length === 0)
    return null;
  if (insightBearing.length === 1) {
    insightBearing[0].primary = true;
    writeLocalManifest(m, manifestPath3);
    return {
      pickedSkillName: insightBearing[0].skill_name,
      reason: "trivial pick (single candidate)",
      rawOutput: ""
    };
  }
  const claudeBin = findAgentBin("claude_code");
  if (!claudeBin || !existsSync38(claudeBin)) {
    return null;
  }
  const ranked = [...insightBearing].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, MAX_CANDIDATES);
  const prompt = buildAdvisorPrompt(ranked);
  let raw;
  try {
    raw = await runAdvisorGate(prompt, claudeBin);
  } catch (err) {
    return {
      pickedSkillName: null,
      reason: `advisor invocation failed: ${err.message}`,
      rawOutput: ""
    };
  }
  const result = parseAdvisorOutput(raw, ranked);
  if (result.pickedSkillName) {
    for (const e of m.entries) {
      if (e && e.primary === true)
        delete e.primary;
    }
    for (const e of m.entries) {
      if (e && e.skill_name === result.pickedSkillName) {
        e.primary = true;
        break;
      }
    }
    writeLocalManifest(m, manifestPath3);
  }
  return result;
}

// dist/src/cli/install-scan.js
function claudeProjectsDir() {
  return join50(homedir27(), ".claude", "projects");
}
function manifestPath2() {
  return join50(homedir27(), ".claude", "hivemind", "local-mined.json");
}
var SCAN_TIMEOUT_MS = 3e5;
var INSTALL_SCAN_SESSION_COUNT = 10;
function manifestIsTrulyEmpty() {
  const p = manifestPath2();
  if (!existsSync39(p))
    return false;
  try {
    const m = JSON.parse(readFileSync36(p, "utf-8"));
    return Array.isArray(m.entries) && m.entries.length === 0;
  } catch {
    return false;
  }
}
function hasLocalClaudeSessions() {
  const projectsDir = claudeProjectsDir();
  if (!existsSync39(projectsDir))
    return false;
  let subdirs;
  try {
    subdirs = readdirSync9(projectsDir);
  } catch {
    return false;
  }
  for (const sub of subdirs) {
    let files;
    try {
      files = readdirSync9(join50(projectsDir, sub));
    } catch {
      continue;
    }
    if (files.some((f) => f.endsWith(".jsonl")))
      return true;
  }
  return false;
}
function canOfferInstallScan() {
  const bin = findAgentBin("claude_code");
  if (!bin || !existsSync39(bin))
    return false;
  if (!hasLocalClaudeSessions())
    return false;
  if (existsSync39(manifestPath2()))
    return false;
  return true;
}
function unlinkManifestIfCorrupt() {
  const p = manifestPath2();
  if (!existsSync39(p))
    return;
  if (readLocalManifest(p) === null) {
    try {
      unlinkSync14(p);
    } catch {
    }
  }
}
function runInstallScan() {
  return new Promise((resolve6) => {
    const cliPath = process.argv[1];
    if (!cliPath || !existsSync39(cliPath)) {
      resolve6({ insight: null, skillsCount: 0 });
      return;
    }
    const child = spawn4(process.execPath, [
      cliPath,
      "skillify",
      "mine-local",
      "--n",
      String(INSTALL_SCAN_SESSION_COUNT),
      // The install copy advertises a "Claude Code" scan, so filter
      // the mine-local picker to claude_code sessions. Without this,
      // mine-local walks every installed agent (Codex, Cursor,
      // Hermes, pi) and could surface an insight from a Codex
      // session despite what we promised — codex PR #198 P2.
      "--only",
      "claude_code"
    ], {
      stdio: ["ignore", "ignore", "ignore"],
      // HIVEMIND_CAPTURE=false: the spawned mine-local would otherwise
      // try to capture its own activity, which is a no-op without
      // credentials but spams the log. Keep it quiet.
      env: { ...process.env, HIVEMIND_CAPTURE: "false" }
    });
    let settled = false;
    const finish = (result) => {
      if (settled)
        return;
      settled = true;
      resolve6(result);
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
      }
      unlinkManifestIfCorrupt();
      finish({ insight: null, skillsCount: 0 });
    }, SCAN_TIMEOUT_MS);
    child.on("close", async (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        unlinkManifestIfCorrupt();
        finish({ insight: null, skillsCount: 0 });
        return;
      }
      let advisorResult = null;
      try {
        advisorResult = await runAdvisor();
      } catch {
      }
      const advisorRejected = advisorResult !== null && advisorResult.pickedSkillName === null;
      let entry = null;
      if (!advisorRejected) {
        try {
          entry = getLatestInsightEntry();
        } catch {
        }
      }
      let skillsCount = 0;
      try {
        skillsCount = countLocalManifestEntries();
      } catch {
      }
      if (!entry && manifestIsTrulyEmpty()) {
        try {
          unlinkSync14(manifestPath2());
        } catch {
        }
        skillsCount = 0;
      }
      finish({ insight: entry, skillsCount });
    });
    child.on("error", () => {
      clearTimeout(timer);
      unlinkManifestIfCorrupt();
      finish({ insight: null, skillsCount: 0 });
    });
  });
}
function formatScanResult(entry) {
  const rawInsight = (entry.insight ?? "").replace(/\s+/g, " ").trim();
  const insight = rawInsight.length > 280 ? rawInsight.slice(0, 277).replace(/\s\S*$/, "") + "\u2026" : rawInsight;
  return `\u2713 Found a pattern in your past sessions:
   \u{1F4CC} ${insight}
   \u2728 Skill \`${entry.skill_name}\` ready to catch it next time`;
}

// dist/src/cli/index.js
var AUTH_SUBCOMMANDS = /* @__PURE__ */ new Set([
  "whoami",
  "logout",
  "org",
  "workspaces",
  "workspace",
  "invite",
  "members",
  "remove",
  "autoupdate",
  "sessions"
]);
var USAGE5 = `
hivemind \u2014 one brain for every agent on your team

Usage:
  hivemind install   [--only <platforms>] [--skip-auth] [--token <value>]
      Auto-detect assistants on this machine and install hivemind into each.
      --only takes a comma-separated list: ${allPlatformIds().join(",")}
      --token, or env HIVEMIND_TOKEN, signs in non-interactively (useful
      for CI / scripted installs). Without it, a TTY install shows a
      consent prompt; a headless install skips auth and prints a hint
      for 'hivemind login'.

  hivemind uninstall [--only <platforms>]
      Auto-detect installed assistants and remove hivemind from each.
      --only takes the same list to scope the removal.

  hivemind claude  install | uninstall
  hivemind codex   install | uninstall
  hivemind claw    install | uninstall
  hivemind cursor  install | uninstall
  hivemind hermes  install | uninstall
  hivemind pi      install | uninstall
      Install or remove hivemind for a specific assistant.

  hivemind login            Run device-flow login (open browser).
  hivemind status           Show which assistants are wired up.
  hivemind update [--dry-run]
      Check npm for a newer @deeplake/hivemind, upgrade the CLI, and refresh
      every detected agent bundle. Single command for all agents.

  hivemind dashboard [--cwd <path>] [--out <path>] [--no-open]
                     [--serve] [--port <n>]
      Build a self-contained HTML dashboard for this repo. Combines
      KPI cards (tokens saved, skills created, memory recalls,
      sessions) with the codebase-graph visualization. Writes to
      ~/.hivemind/dashboards/<repo-key>/index.html by default.
      --no-open skips the browser launch (headless / CI scenarios).
      --serve starts a loopback HTTP server at http://127.0.0.1:<port>
      (default 8123) so the dashboard is reachable via a URL \u2014 useful
      over SSH; VS Code / Cursor Remote-SSH auto-forwards the port
      and opens it in the integrated Simple Browser tab on click.

Semantic search (embeddings):
  hivemind embeddings install                Download @huggingface/transformers
                                             once (~600 MB) into a shared dir,
                                             symlink every detected agent
                                             plugin to it, and set
                                             embeddings.enabled = true in
                                             ~/.deeplake/config.json. Idempotent.
  hivemind embeddings enable                 Light opt-in: flip
                                             embeddings.enabled = true in
                                             ~/.deeplake/config.json. Use this
                                             after \`disable\` to turn back on
                                             without re-running install.
  hivemind embeddings disable                Light opt-out: flip
                                             embeddings.enabled = false and
                                             SIGTERM the running daemon. Shared
                                             deps stay on disk.
  hivemind embeddings uninstall [--prune]    Full opt-out: remove the per-agent
                                             symlinks, flip
                                             embeddings.enabled = false, and
                                             SIGTERM the daemon. --prune also
                                             deletes the shared dir to reclaim
                                             ~600 MB.
  hivemind embeddings status                 Show config + shared-deps + per-
                                             agent state.

  Add --with-embeddings to "hivemind install" (or "hivemind <agent> install")
  to run "embeddings install" automatically after installing the agent(s).

Codebase graph (per-repo AST snapshot + cloud sync):
  hivemind graph build [--cwd <path>]        Walk TypeScript sources, extract
                                             AST nodes + edges, write a
                                             snapshot, and push to cloud.
  hivemind graph diff <sha1> <sha2>          Diff two snapshots by commit.
  hivemind graph history [-n N] [--json]     Show last N build entries.
  hivemind graph init [--force]              Install a managed
                                             .git/hooks/post-commit hook
                                             that rebuilds on each commit.
  hivemind graph pull                        Download the freshest cloud
                                             snapshot for HEAD into local.
  hivemind graph uninstall                   Remove the managed post-commit
                                             hook.
  Agents query the local snapshot via the Deeplake mount at
  ~/.deeplake/memory/graph/{index.md,find/<pattern>,show/<handle-or-pattern>}.

Skill management (mine + share reusable Claude skills across the org):
${renderCliHelpBlock()}

Team-wide rules:
  hivemind rules add "<text>" [--scope team]   Add a new rule (org-wide).
  hivemind rules list [--status active|done|all] [--limit N]
                                               List rules. Default: active, 10 newest.
  hivemind rules edit <rule-id> "<new text>"   Edit a rule (bumps version).
  hivemind rules done <rule-id>                Mark a rule done.
  Note: active rules are auto-injected into the SessionStart block for
  claude-code / cursor / hermes; codex / pi / openclaw use 'hivemind context'.

Cross-agent helpers:
  hivemind context                             Print the rules + open-goals block on demand.
                                               Fallback for harnesses/pi/openclaw agents (no SessionStart hook)
                                               and read-only diagnostic for any agent.

Account / org / workspace:
  hivemind whoami                          Show current user, org, workspace.
  hivemind logout                          Remove credentials.
  hivemind org list                        List organizations.
  hivemind org switch <name-or-id>         Switch active organization.
  hivemind workspaces                      List workspaces in current org.
  hivemind workspace list                  List workspaces (alias of 'workspaces').
  hivemind workspace switch <name-or-id>   Switch active workspace.
  hivemind members                         List org members.
  hivemind invite <email> <ADMIN|WRITE|READ>  Invite a teammate.
  hivemind remove <user-id>                Remove a member.
  hivemind autoupdate [on|off]             Toggle Claude Code plugin auto-update.
  hivemind sessions prune [...]            Manage your captured sessions.

  hivemind --version        Print the hivemind version.
  hivemind --help           Show this message.

Docs:  https://github.com/activeloopai/hivemind
`.trim();
function parseOnly(args) {
  const idx = args.findIndex((a) => a === "--only" || a.startsWith("--only="));
  if (idx === -1)
    return null;
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  if (!raw)
    return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = new Set(allPlatformIds());
  const bad = ids.filter((id) => !valid.has(id));
  if (bad.length > 0) {
    warn(`Unknown platform(s): ${bad.join(", ")}. Valid: ${allPlatformIds().join(", ")}`);
    process.exit(1);
  }
  return ids;
}
function hasFlag(args, flag) {
  return args.includes(flag);
}
function parseToken(args) {
  const idx = args.findIndex((a) => a === "--token" || a.startsWith("--token="));
  if (idx === -1)
    return void 0;
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  return raw && raw.length > 0 ? raw : void 0;
}
function hasEnvToken() {
  return Boolean(process.env.HIVEMIND_TOKEN);
}
async function runAuthGate(args) {
  const flagToken = parseToken(args);
  const isTTY = Boolean(process.stdin.isTTY);
  if (flagToken || hasEnvToken()) {
    const ok = await loginWithProvidedToken(flagToken);
    if (ok)
      return;
  }
  if (!isTTY) {
    log("");
    log("No TTY detected \u2014 continuing without sign-in.");
    log("To sign in:");
    log("  1) Visit https://app.deeplake.ai/api-keys to create an API key");
    log("  2) Rerun: HIVEMIND_TOKEN=<key> hivemind install");
    log("Or run `hivemind login` after install.");
    return;
  }
  let foundInsight = null;
  if (canOfferInstallScan()) {
    log("");
    log("\u{1F41D} Want me to scan your recent Claude Code sessions for repeatable mistakes?");
    log("Takes 2-4 minutes. Scans 10 sessions in parallel using your Claude Code subscription.");
    log("");
    const scanOk = await confirm("Scan now?", true);
    if (scanOk) {
      log("");
      log("Scanning your 10 most-recent sessions (up to 5 min). Be patient \u2014 haiku is running in the background.");
      const { insight, skillsCount } = await runInstallScan();
      log("");
      if (insight && insight.insight && insight.insight.trim().length > 0) {
        log(formatScanResult(insight));
        foundInsight = { skill_name: insight.skill_name };
      } else if (skillsCount > 0) {
        log(`Mined ${skillsCount} skill${skillsCount === 1 ? "" : "s"} locally \u2014 they'll be available in your next claude session.`);
        log("(No banner-quality insight to surface here \u2014 the gate is conservative on what gets the top-line.)");
      } else {
        log("No repeatable patterns found in this scan. (That's OK \u2014 the gate is conservative.)");
      }
    }
  }
  log("");
  if (foundInsight) {
    log("\u{1F41D} Sign in to keep this skill across machines and share it with your team.");
    log("");
    log(`Without sign-in, \`${foundInsight.skill_name}\` lives only on this machine and`);
    log("won't follow you to a new laptop or be shared with teammates who'd benefit.");
  } else {
    log("\u{1F41D} One more step to unlock Hivemind");
    log("");
    log("To enable shared memory and auto-learning across your agents,");
    log("we need to sign you in. Your traces will be securely stored in");
    log("your private Hivemind, so all your agents can recall them.");
    log("");
    log("You can later connect your own cloud storage like S3/GCS/Azure Blob.");
  }
  log("");
  const yes = await confirm("Sign in now?", true);
  let signedIn = false;
  if (yes) {
    signedIn = await ensureLoggedIn();
    if (!signedIn) {
      warn("Login did not complete.");
    }
  }
  if (!signedIn) {
    log("");
    log("Alternatively, sign in at https://app.deeplake.ai/api-keys, create");
    log("an API key, and paste it here. Press Enter to skip and continue");
    log("installing without sign-in (you can run `hivemind login` later).");
    log("");
    const MAX_PASTE_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_PASTE_ATTEMPTS; attempt++) {
      const pasted = await promptLine("API key: ");
      if (!pasted)
        break;
      signedIn = await loginWithProvidedToken(pasted);
      if (signedIn)
        break;
      const remaining = MAX_PASTE_ATTEMPTS - attempt;
      if (remaining > 0) {
        log("");
        log(`That key wasn't accepted (likely invalid or revoked). Try again (${remaining} attempt${remaining === 1 ? "" : "s"} left) or press Enter to skip.`);
        log("");
      }
    }
    if (!signedIn) {
      log("");
      log("Continuing install without sign-in. Run `hivemind login` later, or");
      log("rerun with `HIVEMIND_TOKEN=<key> hivemind install`.");
    }
  }
}
async function runInstallAll(args) {
  const only = parseOnly(args);
  const skipAuth = hasFlag(args, "--skip-auth");
  const withEmbeddings = hasFlag(args, "--with-embeddings");
  const targets = only ?? detectPlatforms().map((p) => p.id);
  if (targets.length === 0) {
    log("No supported assistants detected.");
    log("Supported: Claude Code, Codex, OpenClaw, Cursor, Hermes Agent.");
    log("Install one and rerun `hivemind install`, or target a specific assistant: `hivemind cursor install`.");
    return;
  }
  log(`Installing hivemind ${getVersion()} for: ${targets.join(", ")}`);
  log("");
  if (!skipAuth && !isLoggedIn()) {
    await runAuthGate(args);
  }
  for (const id of targets)
    runSingleInstall(id);
  if (withEmbeddings) {
    log("");
    installEmbeddings();
  }
  await maybeShowOrgChoice();
  log("");
  log("Done. Restart each assistant to activate hooks.");
}
function runSingleInstall(id) {
  try {
    if (id === "claude")
      installClaude();
    else if (id === "codex")
      installCodex();
    else if (id === "claw")
      installOpenclaw();
    else if (id === "cursor")
      installCursor();
    else if (id === "hermes")
      installHermes();
    else if (id === "pi")
      installPi();
  } catch (err) {
    warn(`  ${id.padEnd(14)} FAILED: ${err.message}`);
  }
}
function runSingleUninstall(id) {
  try {
    if (id === "claude")
      uninstallClaude();
    else if (id === "codex")
      uninstallCodex();
    else if (id === "claw")
      uninstallOpenclaw();
    else if (id === "cursor")
      uninstallCursor();
    else if (id === "hermes")
      uninstallHermes();
    else if (id === "pi")
      uninstallPi();
  } catch (err) {
    warn(`  ${id.padEnd(14)} FAILED: ${err.message}`);
  }
}
function runStatus() {
  const detected = detectPlatforms();
  log(`hivemind ${getVersion()}`);
  log(`logged in: ${isLoggedIn() ? "yes" : "no"}`);
  log("");
  log("Detected assistants:");
  if (detected.length === 0)
    log("  (none)");
  for (const p of detected)
    log(`  ${p.id.padEnd(8)} ${p.markerDir}`);
}
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    log(USAGE5);
    return;
  }
  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    log(getVersion());
    return;
  }
  if (cmd === "install") {
    await runInstallAll(args.slice(1));
    return;
  }
  if (cmd === "uninstall") {
    const only = parseOnly(args.slice(1));
    const targets = only ?? detectPlatforms().map((p) => p.id);
    for (const id of targets)
      runSingleUninstall(id);
    return;
  }
  if (cmd === "login") {
    await ensureLoggedIn();
    return;
  }
  if (cmd === "status") {
    runStatus();
    return;
  }
  if (cmd === "update") {
    const code = await runUpdate({ dryRun: hasFlag(args.slice(1), "--dry-run") });
    process.exit(code);
  }
  if (cmd === "skillify") {
    runSkillifyCommand(args.slice(1));
    return;
  }
  if (cmd === "rules") {
    await runRulesCommand(args.slice(1));
    return;
  }
  if (cmd === "goal" || cmd === "goals") {
    await runGoalCommand(args.slice(1));
    return;
  }
  if (cmd === "kpi" || cmd === "kpis") {
    await runKpiCommand(args.slice(1));
    return;
  }
  if (cmd === "context") {
    await runContextCommand(args.slice(1));
    return;
  }
  if (cmd === "graph") {
    await runGraphCommand(args.slice(1));
    return;
  }
  if (cmd === "dashboard") {
    const code = await runDashboardCommand(args.slice(1));
    process.exit(code);
  }
  if (cmd === "embeddings") {
    const sub = args[1];
    if (sub === "install") {
      installEmbeddings();
      return;
    }
    if (sub === "enable") {
      enableEmbeddings();
      return;
    }
    if (sub === "disable") {
      disableEmbeddings();
      return;
    }
    if (sub === "uninstall") {
      uninstallEmbeddings({ prune: hasFlag(args.slice(2), "--prune") });
      return;
    }
    if (sub === "status") {
      statusEmbeddings();
      return;
    }
    warn("Usage: hivemind embeddings install | enable | disable | uninstall [--prune] | status");
    process.exit(1);
  }
  if (AUTH_SUBCOMMANDS.has(cmd)) {
    await runAuthCommand(args);
    return;
  }
  const platformCmds = ["claude", "codex", "claw", "cursor", "hermes", "pi"];
  if (platformCmds.includes(cmd)) {
    const sub = args[1];
    if (sub === "install") {
      runSingleInstall(cmd);
      if (hasFlag(args.slice(2), "--with-embeddings")) {
        log("");
        installEmbeddings();
      }
    } else if (sub === "uninstall")
      runSingleUninstall(cmd);
    else {
      warn(`Usage: hivemind ${cmd} install [--with-embeddings] | uninstall`);
      process.exit(1);
    }
    return;
  }
  warn(`Unknown command: ${cmd}`);
  log(USAGE5);
  process.exit(1);
}
main().catch((err) => {
  warn(`hivemind: ${err.message}`);
  process.exit(1);
});
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT *)
*/
