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
import { existsSync as existsSync2, mkdirSync as mkdirSync6, readFileSync as readFileSync6, writeFileSync as writeFileSync6 } from "node:fs";
import { join as join7 } from "node:path";
import { tmpdir } from "node:os";
function getIndexMarkerDir() {
  return process.env.HIVEMIND_INDEX_MARKER_DIR ?? join7(tmpdir(), "hivemind-deeplake-indexes");
}
function buildIndexMarkerPath(workspaceId, orgId, table, suffix) {
  const markerKey = [workspaceId, orgId, table, suffix].join("__").replace(/[^a-zA-Z0-9_.-]/g, "_");
  return join7(getIndexMarkerDir(), `${markerKey}.json`);
}
function hasFreshIndexMarker(markerPath) {
  if (!existsSync2(markerPath))
    return false;
  try {
    const raw = JSON.parse(readFileSync6(markerPath, "utf-8"));
    const updatedAt = raw.updatedAt ? new Date(raw.updatedAt).getTime() : NaN;
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > INDEX_MARKER_TTL_MS)
      return false;
    return true;
  } catch {
    return false;
  }
}
function writeIndexMarker(markerPath) {
  mkdirSync6(getIndexMarkerDir(), { recursive: true });
  writeFileSync6(markerPath, JSON.stringify({ updatedAt: (/* @__PURE__ */ new Date()).toISOString() }), "utf-8");
}
var INDEX_MARKER_TTL_MS;
var init_index_marker_store = __esm({
  "dist/src/index-marker-store.js"() {
    "use strict";
    INDEX_MARKER_TTL_MS = Number(process.env.HIVEMIND_INDEX_MARKER_TTL_MS ?? 6 * 60 * 6e4);
  }
});

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
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

// dist/src/commands/auth-creds.js
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2, unlinkSync } from "node:fs";
import { join as join2 } from "node:path";
import { homedir as homedir2 } from "node:os";
function configDir() {
  return join2(homedir2(), ".deeplake");
}
function credsPath() {
  return join2(configDir(), "credentials.json");
}
function loadCredentials() {
  try {
    return JSON.parse(readFileSync2(credsPath(), "utf-8"));
  } catch {
    return null;
  }
}

// dist/src/utils/stdin.js
function readStdin() {
  return new Promise((resolve3, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => {
      try {
        resolve3(JSON.parse(data));
      } catch (err) {
        reject(new Error(`Failed to parse hook input: ${err}`));
      }
    });
    process.stdin.on("error", reject);
  });
}

// dist/src/notifications/rules/registry.js
var RULES = [];
function registerRule(rule) {
  if (RULES.find((r) => r.id === rule.id)) {
    throw new Error(`duplicate rule id: ${rule.id}`);
  }
  RULES.push(rule);
}
function evaluateRules(trigger, ctx) {
  const out = [];
  for (const r of RULES) {
    if (r.trigger !== trigger)
      continue;
    const result = r.evaluate(ctx);
    if (result)
      out.push(result);
  }
  return out;
}

// dist/src/notifications/queue.js
import { readFileSync as readFileSync3, writeFileSync as writeFileSync3, renameSync, mkdirSync as mkdirSync3, openSync, closeSync, unlinkSync as unlinkSync2, statSync } from "node:fs";
import { join as join4, resolve } from "node:path";
import { homedir as homedir4 } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

// dist/src/utils/debug.js
import { appendFileSync } from "node:fs";
import { join as join3 } from "node:path";
import { homedir as homedir3 } from "node:os";
var LOG = join3(homedir3(), ".deeplake", "hook-debug.log");
function isDebug() {
  return process.env.HIVEMIND_DEBUG === "1";
}
function log(tag, msg) {
  if (!isDebug())
    return;
  appendFileSync(LOG, `${(/* @__PURE__ */ new Date()).toISOString()} [${tag}] ${msg}
`);
}

// dist/src/notifications/queue.js
var log2 = (msg) => log("notifications-queue", msg);
var LOCK_RETRY_MAX = 50;
var LOCK_RETRY_BASE_MS = 5;
var LOCK_STALE_MS = 5e3;
function queuePath() {
  return join4(homedir4(), ".deeplake", "notifications-queue.json");
}
function lockPath() {
  return `${queuePath()}.lock`;
}
function readQueue() {
  try {
    const raw = readFileSync3(queuePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.queue)) {
      log2(`queue malformed \u2192 treating as empty`);
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
  const home = resolve(homedir4());
  if (!_isQueuePathInsideHome(path, home)) {
    throw new Error(`notifications-queue write blocked: ${path} is outside ${home}`);
  }
  mkdirSync3(join4(home, ".deeplake"), { recursive: true, mode: 448 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync3(tmp, JSON.stringify(q, null, 2), { mode: 384 });
  renameSync(tmp, path);
}
async function withQueueLock(fn) {
  const path = lockPath();
  mkdirSync3(join4(homedir4(), ".deeplake"), { recursive: true, mode: 448 });
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
        const age = Date.now() - statSync(path).mtimeMs;
        if (age > LOCK_STALE_MS) {
          unlinkSync2(path);
          continue;
        }
      } catch {
      }
      const delay = LOCK_RETRY_BASE_MS * (attempt + 1);
      await sleep(delay);
    }
  }
  if (fd === null) {
    log2(`lock acquisition gave up after ${LOCK_RETRY_MAX} attempts \u2014 proceeding unlocked (last-writer-wins)`);
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
      unlinkSync2(path);
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

// dist/src/notifications/state.js
import { closeSync as closeSync2, mkdirSync as mkdirSync4, openSync as openSync2, readFileSync as readFileSync4, renameSync as renameSync2, unlinkSync as unlinkSync3, writeFileSync as writeFileSync4 } from "node:fs";
import { createHash } from "node:crypto";
import { join as join5, resolve as resolve2 } from "node:path";
import { homedir as homedir5 } from "node:os";
var log3 = (msg) => log("notifications-state", msg);
function statePath() {
  return join5(homedir5(), ".deeplake", "notifications-state.json");
}
function readState() {
  try {
    const raw = readFileSync4(statePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.shown !== "object") {
      log3(`state malformed \u2192 treating as empty`);
      return { shown: {} };
    }
    return {
      shown: { ...parsed.shown },
      sessionCount: typeof parsed.sessionCount === "number" ? parsed.sessionCount : void 0,
      lastCountedSessionId: typeof parsed.lastCountedSessionId === "string" ? parsed.lastCountedSessionId : void 0
    };
  } catch {
    return { shown: {} };
  }
}
function bumpSessionCount(sessionId) {
  const state = readState();
  const current = state.sessionCount ?? 0;
  if (!sessionId || state.lastCountedSessionId === sessionId) {
    return current;
  }
  const next = current + 1;
  writeState({ ...state, sessionCount: next, lastCountedSessionId: sessionId });
  return next;
}
function writeState(state) {
  const path = statePath();
  const home = resolve2(homedir5());
  if (!resolve2(path).startsWith(home + "/") && resolve2(path) !== home) {
    throw new Error(`notifications-state write blocked: ${path} is outside ${home}`);
  }
  mkdirSync4(join5(home, ".deeplake"), { recursive: true, mode: 448 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync4(tmp, JSON.stringify(state, null, 2), { mode: 384 });
  renameSync2(tmp, path);
}
function markShown(state, n, now = /* @__PURE__ */ new Date()) {
  return {
    ...state,
    shown: {
      ...state.shown,
      [n.id]: { dedupKey: JSON.stringify(n.dedupKey), shownAt: now.toISOString() }
    }
  };
}
function alreadyShown(state, n) {
  const prev = state.shown[n.id];
  if (!prev)
    return false;
  return prev.dedupKey === JSON.stringify(n.dedupKey);
}
function tryClaim(n) {
  const home = resolve2(homedir5());
  const claimsDir = join5(home, ".deeplake", "notifications-claims");
  try {
    mkdirSync4(claimsDir, { recursive: true, mode: 448 });
  } catch (e) {
    log3(`tryClaim mkdir failed: ${e?.message ?? String(e)}`);
    return true;
  }
  const claimPath = claimPathFor(claimsDir, n);
  try {
    const fd = openSync2(claimPath, "wx", 384);
    closeSync2(fd);
    return true;
  } catch (e) {
    if (e?.code === "EEXIST")
      return false;
    log3(`tryClaim open failed: ${e?.message ?? String(e)}`);
    return true;
  }
}
function releaseClaim(n) {
  const home = resolve2(homedir5());
  const claimsDir = join5(home, ".deeplake", "notifications-claims");
  const claimPath = claimPathFor(claimsDir, n);
  try {
    unlinkSync3(claimPath);
  } catch (e) {
    if (e?.code !== "ENOENT") {
      log3(`releaseClaim unlink failed: ${e?.message ?? String(e)}`);
    }
  }
}
function claimPathFor(claimsDir, n) {
  const keyHash = createHash("sha256").update(JSON.stringify(n.dedupKey)).digest("hex").slice(0, 12);
  const safeId = n.id.replace(/[^a-zA-Z0-9_.:-]/g, "_");
  return join5(claimsDir, `${safeId}-${keyHash}`);
}

// dist/src/notifications/format.js
var SEVERITY_PREFIX = {
  info: "\u{1F41D}",
  warn: "\u26A0\uFE0F",
  error: "\u{1F6A8}"
};
function renderOne(n) {
  const prefix = SEVERITY_PREFIX[n.severity ?? "info"] ?? SEVERITY_PREFIX.info;
  return `${prefix} ${n.title}
${n.body}`;
}
function renderNotifications(items) {
  if (items.length === 0)
    return "";
  return items.map(renderOne).join("\n\n");
}

// dist/src/notifications/delivery/claude-code.js
function emitClaudeCode(notifications) {
  const modelSafe = notifications.filter((n) => !n.userVisibleOnly);
  const modelRendered = renderNotifications(modelSafe);
  const userRendered = renderNotifications(notifications);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      ...modelRendered ? { additionalContext: modelRendered } : {}
    },
    systemMessage: userRendered
  }));
}

// dist/src/notifications/delivery/index.js
var ADAPTERS = {
  "claude-code": emitClaudeCode
};
function emit(agent, notifications) {
  if (notifications.length === 0)
    return;
  ADAPTERS[agent](notifications);
}

// dist/src/notifications/sources/backend.js
var log4 = (msg) => log("notifications-backend", msg);
var FETCH_TIMEOUT_MS = 1500;
var DEFAULT_API_URL = "https://api.deeplake.ai";
var ALLOWED_SEVERITIES = /* @__PURE__ */ new Set(["info", "warn", "error"]);
function normalizeSeverity(s) {
  return typeof s === "string" && ALLOWED_SEVERITIES.has(s) ? s : "info";
}
function toClient(n) {
  if (!n.id || typeof n.id !== "string")
    return null;
  if (!n.title || typeof n.title !== "string")
    return null;
  if (!n.body || typeof n.body !== "string")
    return null;
  return {
    // Prefix with `backend:` so a future local-only rule can never collide
    // with a server-issued id, even if both happen to use the same string.
    id: `backend:${n.id}`,
    severity: normalizeSeverity(n.severity),
    title: n.title,
    body: n.body,
    // dedupKey wraps server fields the client cares about. The server's
    // dedup_key is hashed in here so a server that reuses the same UUID
    // with a fresh dedup_key (rare but supported) re-fires for the user.
    dedupKey: { id: n.id, dedup_key: n.dedup_key ?? "" },
    // The body is server-controlled free text shown to the user as a banner
    // (e.g. the deeplake-api low-balance "top up to avoid service
    // interruption" push). Like every user-facing notification, it must NOT
    // reach the model's additionalContext — an imperative/billing string in
    // the agent prompt is the prompt-injection shape we're closing. User
    // channel only.
    userVisibleOnly: true
  };
}
async function fetchBackendNotifications(creds) {
  if (!creds?.token)
    return [];
  const apiUrl = creds.apiUrl ?? DEFAULT_API_URL;
  const url = `${apiUrl}/me/notifications`;
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
      log4(`fetch ${url} returned ${resp.status}`);
      return [];
    }
    const body = await resp.json();
    if (!body || !Array.isArray(body.notifications)) {
      log4(`fetch ${url} returned malformed body`);
      return [];
    }
    const out = [];
    for (const sn of body.notifications) {
      const c = toClient(sn);
      if (c)
        out.push(c);
    }
    log4(`fetched ${out.length} backend notification(s) from ${apiUrl}`);
    return out;
  } catch (e) {
    log4(`fetch ${url} failed: ${e?.message ?? String(e)}`);
    return [];
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// dist/src/notifications/sources/org-stats.js
import { existsSync, mkdirSync as mkdirSync5, readFileSync as readFileSync5, writeFileSync as writeFileSync5 } from "node:fs";
import { homedir as homedir6 } from "node:os";
import { dirname, join as join6 } from "node:path";
var log5 = (msg) => log("notifications-org-stats", msg);
var FETCH_TIMEOUT_MS2 = 1500;
var DEFAULT_API_URL2 = "https://api.deeplake.ai";
var CACHE_TTL_MS = 60 * 60 * 1e3;
function cacheFilePath() {
  return join6(homedir6(), ".deeplake", "hivemind-stats-cache.json");
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
    apiUrl: creds.apiUrl ?? DEFAULT_API_URL2,
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
function readCache(scopeKey) {
  if (!existsSync(cacheFilePath()))
    return {};
  try {
    const parsed = JSON.parse(readFileSync5(cacheFilePath(), "utf-8"));
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
function writeCache(scopeKey, data) {
  try {
    mkdirSync5(dirname(cacheFilePath()), { recursive: true });
    const body = { fetchedAt: Date.now(), scopeKey, data };
    writeFileSync5(cacheFilePath(), JSON.stringify(body), "utf-8");
  } catch (e) {
    log5(`cache write failed: ${e?.message ?? String(e)}`);
  }
}
async function fetchOrgStats(creds) {
  if (!creds?.token)
    return null;
  const apiUrl = creds.apiUrl ?? DEFAULT_API_URL2;
  const scopeKey = cacheScopeKey(creds);
  const { fresh, stale } = readCache(scopeKey);
  if (fresh) {
    log5("cache hit \u2014 returning fresh org stats");
    return fresh;
  }
  const url = `${apiUrl}/me/hivemind-stats`;
  const ctrl = new AbortController();
  const timeoutHandle = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS2);
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
    writeCache(scopeKey, data);
    log5(`fetched org stats from ${apiUrl}`);
    return data;
  } catch (e) {
    log5(`fetch ${url} failed: ${e?.message ?? String(e)}`);
    return stale ?? null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// dist/src/deeplake-api.js
import { randomUUID as randomUUID2 } from "node:crypto";

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

// dist/src/deeplake-api.js
var indexMarkerStorePromise = null;
function getIndexMarkerStore() {
  if (!indexMarkerStorePromise)
    indexMarkerStorePromise = Promise.resolve().then(() => (init_index_marker_store(), index_marker_store_exports));
  return indexMarkerStorePromise;
}
var log6 = (msg) => log("sdk", msg);
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
    log6(msg);
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
  log6(`balance exhausted \u2014 enqueuing session-start banner (body=${bodyText.slice(0, 120)})`);
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
    log6(`enqueue balance-exhausted failed: ${e instanceof Error ? e.message : String(e)}`);
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
  return new Promise((resolve3) => setTimeout(resolve3, ms));
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
    await new Promise((resolve3) => this.waiting.push(resolve3));
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
          log6(`query retry ${attempt + 1}/${MAX_RETRIES} (fetch error: ${lastError.message}) in ${delay.toFixed(0)}ms`);
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
        log6(`query retry ${attempt + 1}/${MAX_RETRIES} (${resp.status}) in ${delay.toFixed(0)}ms`);
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
    log6(`commit: ${rows.length} rows`);
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
      log6(`index "${indexName}" skipped: ${e.message}`);
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
      log: log6
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
        log6(`CREATE TABLE "${label}" attempt ${attempt + 1}/${OUTER_BACKOFFS_MS.length + 1} failed: ${msg}`);
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
      log6(`table "${tbl}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(tbl, MEMORY_COLUMNS), tbl);
      log6(`table "${tbl}" created`);
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
      log6(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, SESSIONS_COLUMNS), safe);
      log6(`table "${safe}" created`);
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
      log6(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, CODEBASE_COLUMNS), safe);
      log6(`table "${safe}" created`);
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
      log6(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, SKILLS_COLUMNS), safe);
      log6(`table "${safe}" created`);
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
      log6(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, RULES_COLUMNS), safe);
      log6(`table "${safe}" created`);
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
      log6(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, GOALS_COLUMNS), safe);
      log6(`table "${safe}" created`);
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
      log6(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, KPIS_COLUMNS), safe);
      log6(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, KPIS_COLUMNS);
    await this.ensureLookupIndex(safe, "goal_id_kpi_id", `("goal_id", "kpi_id")`);
  }
};

// dist/src/rules/write.js
import { randomUUID as randomUUID3 } from "node:crypto";

// dist/src/hooks/shared/context-renderer.js
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

// dist/src/notifications/sources/open-goals.js
var log7 = (msg) => log("notifications-open-goals", msg);
async function fetchOpenGoals(creds, goalsTableName) {
  if (!creds.token || !creds.userName || !creds.orgId)
    return null;
  try {
    const api = new DeeplakeApi(creds.token, creds.apiUrl ?? "https://api.deeplake.ai", creds.orgId, creds.workspaceId ?? "default", goalsTableName);
    const rows = await listOpenGoals((sql) => api.query(sql), goalsTableName, creds.userName, { limit: 25 });
    if (rows.length === 0)
      return null;
    const goals = [];
    for (const r of rows) {
      if (!r.content)
        continue;
      goals.push({ label: firstLine(r.content) });
    }
    if (goals.length === 0)
      return null;
    return {
      count: goals.length,
      // Match the resume brief's line width (MAX_LINE_CHARS = 120) so the
      // two 📌 blocks in the SessionStart banner truncate consistently
      // instead of goals cutting off at 60 while "picking up" runs long.
      sample: goals.slice(0, 3).map((g) => truncate(g.label, 120))
    };
  } catch (e) {
    log7(`fetchOpenGoals: ${e.message}`);
    return null;
  }
}
function firstLine(content) {
  for (const ln of content.split(/\r?\n/)) {
    const trimmed = ln.trim();
    if (trimmed.length > 0)
      return trimmed;
  }
  return content.trim();
}
function truncate(s, max) {
  if (s.length <= max)
    return s;
  return s.slice(0, max - 1) + "\u2026";
}
function formatOpenGoalsLine(summary) {
  if (!summary || summary.count === 0)
    return "";
  const head = summary.count === 1 ? "1 goal open:" : `${summary.count} goals open:`;
  if (summary.sample.length === 0)
    return head;
  const bullets = summary.sample.map((g) => `   \u2022 ${g}`).join("\n");
  return `${head}
${bullets}`;
}

// dist/src/notifications/sources/cold-start-brief.js
import { existsSync as existsSync3, readdirSync, statSync as statSync2, writeFileSync as writeFileSync7, readFileSync as readFileSync7, openSync as openSync3, readSync, closeSync as closeSync3 } from "node:fs";
import { join as join8 } from "node:path";
import { homedir as homedir7 } from "node:os";
var log8 = (m) => log("notifications-cold-start-brief", m);
var WINDOW_DAYS_CAP = 60;
var HARD_TIMEOUT_MS = 3500;
var HEAD_TAIL_BYTES = 32 * 1024;
var RECALL_MIN_HITS = 3;
var ABANDONED_MIN_HITS = 1;
var PROJECTS_DIR = () => join8(homedir7(), ".claude", "projects");
var STATE_FILE = () => join8(homedir7(), ".claude", ".hivemind_brief_state.json");
var RECALL_RE = new RegExp("\\b(what (was|were) (i|we) (doing|working)|where (did|was) (i|we) (leave|left|stop)|continue from|pick.{0,20}(up|back|where)|remind me|what'?s (my|the) (todo|status|state|progress)|what'?s (open|pending|left|next)|recap|summari[sz]e (my|the|last|recent)|todo list|catch me up|where (am|are) (i|we)|what (have|did) (i|we) (done|been doing)|read (my|the) last \\d+ sessions)\\b", "i");
var ABANDON_RE = /(next time|next session|todo[: ]|still need|left off|come back to|pick this up|finish.*later|continue.*tomorrow)/i;
var RENUDGE_MS = 24 * 60 * 60 * 1e3;
function hasState() {
  return existsSync3(STATE_FILE());
}
function lastBriefMs() {
  try {
    if (!existsSync3(STATE_FILE()))
      return null;
    const raw = JSON.parse(readFileSync7(STATE_FILE(), "utf-8"));
    const t = typeof raw?.lastBriefTs === "string" ? Date.parse(raw.lastBriefTs) : NaN;
    return Number.isNaN(t) ? null : t;
  } catch {
    return null;
  }
}
function writeState2(sessionsScanned, isFirstRun) {
  try {
    writeFileSync7(STATE_FILE(), JSON.stringify({
      lastBriefTs: (/* @__PURE__ */ new Date()).toISOString(),
      fireReason: isFirstRun ? "first_run" : "renudge",
      sessionsScanned
    }));
  } catch (e) {
    log8(`writeState failed: ${e.message}`);
  }
}
function parseTs(s) {
  if (!s)
    return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function cleanSnippet(raw, maxLen = 150) {
  let s = raw.replace(/[`*_#>]/g, "").replace(/\s+/g, " ").replace(/^["'\s]+/, "").trim();
  s = s.replace(/"/g, "'");
  if (s.length <= maxLen)
    return stripDanglingOpener(s);
  const window = s.slice(0, maxLen);
  const sentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (sentenceEnd >= maxLen * 0.5)
    return stripDanglingOpener(window.slice(0, sentenceEnd + 1).trim());
  const clauseEnd = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(": "));
  if (clauseEnd >= maxLen * 0.5)
    return stripDanglingOpener(window.slice(0, clauseEnd).trim() + "\u2026");
  const lastSpace = window.lastIndexOf(" ");
  const cut = lastSpace > 0 ? window.slice(0, lastSpace) : window;
  return stripDanglingOpener(cut.trim() + "\u2026");
}
function stripDanglingOpener(s) {
  let out = s;
  const opens = (out.match(/\(/g) || []).length;
  const closes = (out.match(/\)/g) || []).length;
  if (opens > closes)
    out = out.replace(/\s*\([^)]*$/, "");
  return out.replace(/[\s,;:(]+$/, "").trim();
}
function deriveProjectLabel(projDirName, cwdSeen) {
  if (cwdSeen) {
    const seg = cwdSeen.split(/[/\\]/).filter(Boolean);
    return seg[seg.length - 1] || projDirName;
  }
  const parts = projDirName.split("-");
  return parts[parts.length - 1] || projDirName;
}
function readHeadTail(path, bytes) {
  let fd = null;
  try {
    fd = openSync3(path, "r");
    const size = statSync2(path).size;
    const headLen = Math.min(bytes, size);
    const headBuf = Buffer.allocUnsafe(headLen);
    readSync(fd, headBuf, 0, headLen, 0);
    let tail = "";
    if (size > bytes) {
      const tailLen = Math.min(bytes, size);
      const tailBuf = Buffer.allocUnsafe(tailLen);
      readSync(fd, tailBuf, 0, tailLen, size - tailLen);
      tail = tailBuf.toString("utf-8");
    }
    return { head: headBuf.toString("utf-8"), tail };
  } catch {
    return null;
  } finally {
    if (fd !== null)
      try {
        closeSync3(fd);
      } catch {
      }
  }
}
function parseUserRows(chunk) {
  const rows = [];
  for (const line of chunk.split("\n")) {
    if (!line)
      continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.type !== "user" || row.isSidechain)
      continue;
    const c = row.message?.content;
    if (typeof c !== "string")
      continue;
    const ts = parseTs(row.timestamp);
    if (!ts)
      continue;
    rows.push({ ts, content: c, cwd: row.cwd });
  }
  return rows;
}
function loadLocalSession(path, cutoff) {
  let mtime;
  try {
    mtime = statSync2(path).mtime;
  } catch {
    return null;
  }
  if (mtime < cutoff)
    return null;
  const ht = readHeadTail(path, HEAD_TAIL_BYTES);
  if (!ht)
    return null;
  const headRows = parseUserRows(ht.head);
  const tailRows = ht.tail ? parseUserRows(ht.tail) : headRows;
  if (headRows.length === 0)
    return null;
  const first = headRows[0];
  const last = tailRows.length > 0 ? tailRows[tailRows.length - 1] : headRows[headRows.length - 1];
  const projectCwd = first.cwd ?? last.cwd;
  if (last.ts < cutoff)
    return null;
  const projDirName = path.split(/[/\\]/).slice(-2, -1)[0] ?? "unknown";
  return {
    firstTs: first.ts,
    lastTs: last.ts,
    project: deriveProjectLabel(projDirName, projectCwd),
    firstMessage: first.content,
    lastMessage: last.content
  };
}
function mineLocal(cutoff) {
  const out = [];
  const deadline = Date.now() + HARD_TIMEOUT_MS;
  const base = PROJECTS_DIR();
  if (!existsSync3(base))
    return out;
  let projDirs;
  try {
    projDirs = readdirSync(base);
  } catch {
    return out;
  }
  for (const d of projDirs) {
    if (Date.now() > deadline)
      break;
    let files;
    try {
      files = readdirSync(join8(base, d));
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl"))
        continue;
      if (Date.now() > deadline)
        break;
      const s = loadLocalSession(join8(base, d, f), cutoff);
      if (s)
        out.push(s);
    }
  }
  return out;
}
function pickSignal(sessions) {
  if (sessions.length === 0)
    return { kind: "quiet", description: "nothing in window" };
  const sorted = [...sessions].sort((a, b) => b.lastTs.getTime() - a.lastTs.getTime());
  const projCount = /* @__PURE__ */ new Map();
  for (const s of sorted) {
    const arr = projCount.get(s.project) ?? [];
    arr.push(s);
    projCount.set(s.project, arr);
  }
  const topProj = [...projCount.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const recallHits = sorted.filter((s) => s.firstMessage && RECALL_RE.test(s.firstMessage.slice(0, 800)));
  if (recallHits.length >= RECALL_MIN_HITS) {
    const distinctDays = new Set(recallHits.map((s) => s.firstTs.toISOString().slice(0, 10))).size;
    const oneDay = distinctDays < 3 ? recallHits[0].firstTs.toISOString().slice(0, 10) : void 0;
    return {
      kind: "recall",
      description: oneDay ? `on ${oneDay} you spent the day trying to build your own todo/continuity layer on ${recallHits[0].project} \u2014 it didn't quite land` : `${recallHits.length} of your sessions on ${recallHits[0].project} opened with you asking the agent to recall what you were doing`,
      project: recallHits[0].project,
      date: oneDay,
      count: recallHits.length
    };
  }
  const abandoned = sorted.filter((s) => s.lastMessage && ABANDON_RE.test(s.lastMessage));
  if (abandoned.length >= ABANDONED_MIN_HITS) {
    const a = abandoned[0];
    const oneLine = cleanSnippet(a.lastMessage ?? "", 130);
    if (oneLine.length >= 8) {
      return {
        kind: "abandoned",
        description: `your last session on ${a.project} ended with "${oneLine}" and no later session picked it up`,
        project: a.project,
        date: a.lastTs.toISOString().slice(0, 10),
        count: abandoned.length
      };
    }
  }
  if (topProj && topProj[1].length / sorted.length >= 0.5) {
    const pct = Math.round(topProj[1].length / sorted.length * 100);
    return {
      kind: "volume",
      description: `${pct}% of your sessions have been on ${topProj[0]}`,
      project: topProj[0],
      count: topProj[1].length
    };
  }
  return { kind: "quiet", description: `nothing worth flagging across ${sorted.length} sessions` };
}
function renderBrief(sessions, signal, authed) {
  if (sessions.length === 0 || signal.kind === "quiet")
    return null;
  return authed ? "I found context from your recent sessions \u2014 from now on I'll keep it, so your next session picks up where you left off." : "I found context from your recent sessions. Sign in to save it, so future sessions start with what you've already learned.";
}
async function pickColdStartBrief(creds) {
  try {
    const authed = !!creds?.token;
    const hadState = hasState();
    if (authed) {
      if (hadState)
        return null;
    } else {
      const last = lastBriefMs();
      if (last !== null && Date.now() - last < RENUDGE_MS)
        return null;
    }
    const cutoff = new Date(Date.now() - WINDOW_DAYS_CAP * 864e5);
    const sessions = mineLocal(cutoff);
    const signal = pickSignal(sessions);
    const brief = renderBrief(sessions, signal, authed);
    if (!brief) {
      log8(`silent (signal=${signal.kind}, sessions=${sessions.length})`);
      return null;
    }
    writeState2(sessions.length, !hadState);
    log8(`fired (authed=${authed}, first=${!hadState}, signal=${signal.kind})`);
    return { brief, firstRun: !hadState };
  } catch (e) {
    log8(`unexpected error: ${e.message}`);
    return null;
  }
}

// dist/src/config.js
import { readFileSync as readFileSync8, existsSync as existsSync4 } from "node:fs";
import { join as join9 } from "node:path";
import { homedir as homedir8, userInfo } from "node:os";
function loadConfig() {
  const home = homedir8();
  const credPath = join9(home, ".deeplake", "credentials.json");
  let creds = null;
  if (existsSync4(credPath)) {
    try {
      creds = JSON.parse(readFileSync8(credPath, "utf-8"));
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
    userName: creds?.userName || userInfo().username || "unknown",
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
    memoryPath: process.env.HIVEMIND_MEMORY_PATH ?? join9(home, ".deeplake", "memory")
  };
}

// dist/src/utils/project-name.js
import { basename } from "node:path";
function projectNameFromCwd(cwd) {
  return basename(cwd ?? "") || "unknown";
}

// dist/src/hooks/summary-state.js
import { readFileSync as readFileSync9, writeFileSync as writeFileSync8, writeSync, mkdirSync as mkdirSync7, renameSync as renameSync3, existsSync as existsSync5, unlinkSync as unlinkSync4, openSync as openSync4, closeSync as closeSync4, statSync as statSync3 } from "node:fs";
import { homedir as homedir9 } from "node:os";
import { join as join10 } from "node:path";
var STATE_DIR = join10(homedir9(), ".claude", "hooks", "summary-state");
var YIELD_BUF = new Int32Array(new SharedArrayBuffer(4));
function statePath2(sessionId) {
  return join10(STATE_DIR, `${sessionId}.json`);
}
function endedMarkerPath(sessionId) {
  return join10(STATE_DIR, `${sessionId}.ended`);
}
function ownerPath(sessionId) {
  return join10(STATE_DIR, `${sessionId}.owner`);
}
function procInfo(pid) {
  try {
    const s = readFileSync9(`/proc/${pid}/stat`, "utf-8");
    const open = s.indexOf("(");
    const close = s.lastIndexOf(")");
    if (open < 0 || close < 0)
      return null;
    const comm = s.slice(open + 1, close);
    const rest = s.slice(close + 2).split(" ");
    return { comm, ppid: Number(rest[1]), starttime: rest[19] ?? "" };
  } catch {
    return null;
  }
}
function readOwner(sessionId) {
  try {
    return JSON.parse(readFileSync9(ownerPath(sessionId), "utf-8"));
  } catch {
    return null;
  }
}
function ownerLiveness(sessionId) {
  const owner = readOwner(sessionId);
  if (!owner)
    return "unknown";
  const st = procInfo(owner.pid);
  if (!st)
    return "dead";
  if (st.comm !== owner.comm)
    return "dead";
  if (owner.starttime && st.starttime && owner.starttime !== st.starttime)
    return "dead";
  return "alive";
}
function activeWindowMs() {
  const v = Number(process.env.HIVEMIND_ACTIVE_SESSION_WINDOW_MS ?? "");
  return Number.isFinite(v) && v > 0 ? v : 10 * 60 * 1e3;
}
function isSessionLive(sessionId, withinMs = activeWindowMs()) {
  if (existsSync5(endedMarkerPath(sessionId)))
    return false;
  const owner = ownerLiveness(sessionId);
  if (owner === "alive")
    return true;
  if (owner === "dead")
    return false;
  try {
    const mtimeMs = statSync3(statePath2(sessionId)).mtimeMs;
    return Date.now() - mtimeMs < withinMs;
  } catch {
    return false;
  }
}

// dist/src/notifications/sources/resume-brief.js
var log9 = (m) => log("notifications-resume-brief", m);
var MAX_LINE_CHARS = 120;
var LOOKBACK = 5;
var MAX_BRIEF_SESSIONS = 2;
var SCAN_LIMIT = 20;
var QUERY_TIMEOUT_MS = 4e3;
function withTimeout(p, ms, fallback) {
  return new Promise((resolve3) => {
    const t = setTimeout(() => resolve3(fallback), ms);
    if (typeof t.unref === "function")
      t.unref();
    p.then((v) => {
      clearTimeout(t);
      resolve3(v);
    }, () => {
      clearTimeout(t);
      resolve3(fallback);
    });
  });
}
function sections(summary) {
  const map = /* @__PURE__ */ new Map();
  let cur = null;
  let buf = [];
  for (const raw of summary.split(/\r?\n/)) {
    const h = raw.match(/^##\s+(.*?)\s*$/);
    if (h) {
      if (cur)
        map.set(cur.toLowerCase(), buf.join("\n").trim());
      cur = h[1];
      buf = [];
    } else if (cur !== null) {
      buf.push(raw);
    }
  }
  if (cur)
    map.set(cur.toLowerCase(), buf.join("\n").trim());
  return map;
}
var EMPTY_SECTION = /^(?:(?:none|n\/?a|n\.a\.|nothing(?: pending)?)(?:\s*(?:[—–\-.,;:].*)?)?|tbd|—|–|-)$/i;
function extractNextSteps(summary) {
  const s = sections(summary);
  const body = s.has("next steps") ? s.get("next steps") ?? "" : s.get("open questions / todo") || s.get("open questions") || "";
  if (!body)
    return "";
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/^[\s>]*[-*]?\s*/, "").replace(/^#+\s*/, "").replace(/[`*_]/g, "").trim();
    if (!line)
      continue;
    if (EMPTY_SECTION.test(line))
      return "";
    return truncate2(line);
  }
  return "";
}
function isPlaceholderSummary(summary) {
  return !/^##\s+/m.test(summary);
}
function sessionIdFromSummaryPath(path) {
  const base = path.split("/").pop() ?? "";
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}
function excludeActiveSessions(rows, currentSessionId, isLive = isSessionLive) {
  return rows.filter((row) => {
    const path = typeof row.path === "string" ? row.path : "";
    if (!path)
      return true;
    const sid = sessionIdFromSummaryPath(path);
    if (!sid)
      return true;
    if (currentSessionId && sid === currentSessionId)
      return false;
    return !isLive(sid);
  });
}
function selectRealSummaries(rows, lookback = LOOKBACK) {
  const seenPath = /* @__PURE__ */ new Set();
  const out = [];
  for (const row of rows) {
    const path = typeof row.path === "string" ? row.path : "";
    if (path && seenPath.has(path))
      continue;
    if (path)
      seenPath.add(path);
    const summary = typeof row.summary === "string" ? row.summary : "";
    if (isPlaceholderSummary(summary))
      continue;
    out.push({
      summary,
      date: typeof row.last_update_date === "string" ? row.last_update_date : void 0,
      sid: sessionIdFromSummaryPath(path)
    });
    if (out.length >= lookback)
      break;
  }
  return out;
}
function sessionBlock(next, sid, date) {
  const age = relativeAge(date);
  const meta = [sid ? `/resume ${sid}` : "", age].filter(Boolean).join(" \xB7 ");
  return `   \u2022 ${next}
` + (meta ? `     \u21B3 ${meta}
` : "");
}
function truncate2(s, max = MAX_LINE_CHARS) {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max)
    return clean;
  const slice = clean.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max / 2 ? slice.slice(0, lastSpace) : slice;
  return cut.trimEnd() + "\u2026";
}
function relativeAge(iso) {
  if (!iso)
    return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime()))
    return "";
  const days = Math.floor((Date.now() - then.getTime()) / 864e5);
  if (days <= 0)
    return "earlier today";
  if (days === 1)
    return "yesterday";
  if (days < 7)
    return `${days} days ago`;
  if (days < 14)
    return "last week";
  return `${Math.floor(days / 7)} weeks ago`;
}
async function pickResumeBrief(creds, currentSessionId) {
  if (!creds?.token || !creds.userName || !creds.orgId)
    return null;
  const project = projectNameFromCwd(process.cwd());
  if (!project)
    return null;
  try {
    const cfg = loadConfig();
    let table;
    try {
      table = sqlIdent(cfg?.tableName ?? "memory");
    } catch (e) {
      log9(`invalid table identifier "${cfg?.tableName}": ${e.message}`);
      return null;
    }
    const api = new DeeplakeApi(creds.token, creds.apiUrl ?? "https://api.deeplake.ai", creds.orgId, creds.workspaceId ?? "default", table);
    const rawRows = await withTimeout(api.query(`SELECT summary, path, last_update_date FROM "${table}" WHERE project = '${sqlStr(project)}' AND author = '${sqlStr(creds.userName)}' AND summary <> '' AND description <> 'in progress' ORDER BY last_update_date DESC LIMIT ${SCAN_LIMIT}`), QUERY_TIMEOUT_MS, null);
    if (!rawRows || rawRows.length === 0) {
      log9(`silent (no prior summary for project=${project})`);
      return null;
    }
    const rows = excludeActiveSessions(rawRows, currentSessionId);
    const reals = selectRealSummaries(rows);
    if (reals.length === 0) {
      log9(`silent (only placeholders for project=${project})`);
      return null;
    }
    const blocks = [];
    for (const r of reals) {
      const next = extractNextSteps(r.summary);
      if (next.length >= 4) {
        blocks.push(sessionBlock(next, r.sid, r.date));
        if (blocks.length >= MAX_BRIEF_SESSIONS)
          break;
      }
    }
    if (blocks.length > 0) {
      log9(`fired (project=${project}, ${blocks.length} session(s) with open work)`);
      return {
        brief: `\u{1F4CC} Picking up on ${project} \u2014 where you left off:
` + blocks.join("")
      };
    }
    log9(`silent (project=${project}, no open work in last ${LOOKBACK})`);
    return null;
  } catch (e) {
    log9(`pickResumeBrief: ${e.message}`);
    return null;
  }
}

// dist/src/notifications/usage-tracker.js
import { appendFileSync as appendFileSync2, existsSync as existsSync6, mkdirSync as mkdirSync8, readFileSync as readFileSync10, readdirSync as readdirSync2 } from "node:fs";
import { dirname as dirname2, join as join11 } from "node:path";
import { homedir as homedir10 } from "node:os";
var log10 = (msg) => log("usage-tracker", msg);
function statsFilePath() {
  return join11(homedir10(), ".deeplake", "usage-stats.jsonl");
}
function readUsageRecords() {
  try {
    if (!existsSync6(statsFilePath()))
      return [];
    const raw = readFileSync10(statsFilePath(), "utf-8");
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
    log10(`readUsageRecords failed: ${e?.message ?? String(e)}`);
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
  const dir = join11(homedir10(), ".claude", "skills");
  if (!existsSync6(dir))
    return 0;
  const suffix = `--${userName}`;
  try {
    let count = 0;
    for (const name of readdirSync2(dir)) {
      const idx = name.lastIndexOf(suffix);
      if (idx > 0 && idx + suffix.length === name.length)
        count += 1;
    }
    return count;
  } catch (e) {
    log10(`countUserGeneratedSkills readdir failed: ${e?.message ?? String(e)}`);
    return 0;
  }
}

// dist/src/notifications/sources/primary-banner.js
var log11 = (msg) => log("notifications-primary-banner", msg);
var BYTES_PER_TOKEN = 4;
var SAVINGS_MULTIPLIER = 1.7;
var MEANINGFUL_SAVINGS_TOKENS = 1e3;
var MIN_USER_BYTES_FOR_CONTRIBUTION_LINE = 4e3;
function formatTokens(n) {
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
function formatCount(n) {
  return Math.round(n).toLocaleString("en-US");
}
function bytesToSavedTokens(bytes) {
  const y = bytes / BYTES_PER_TOKEN;
  return (SAVINGS_MULTIPLIER - 1) * y;
}
function localSavedTokens() {
  try {
    const records = readUsageRecords();
    if (records.length === 0)
      return 0;
    const bytes = sumMetric(records, "memorySearchBytes");
    return bytesToSavedTokens(bytes);
  } catch (e) {
    log11(`localSavedTokens threw: ${e?.message ?? String(e)}`);
    return 0;
  }
}
async function pickPrimaryBanner(sessionId, creds, source) {
  if (!sessionId) {
    return null;
  }
  if (source === "resume") {
    return null;
  }
  if (!creds?.token) {
    const cold = await pickColdStartBrief(creds);
    if (!cold?.brief)
      return null;
    return {
      id: "signup-brief",
      severity: "info",
      title: "Hey \u{1F44B} I'm Hivemind",
      body: `${cold.brief}

\u2192 hivemind login`,
      dedupKey: { session: sessionId },
      userVisibleOnly: true
    };
  }
  const orgStats = await fetchOrgStats(creds ?? null);
  const tokensSaved = orgStats != null ? bytesToSavedTokens(orgStats.org.memorySearchBytes) : localSavedTokens();
  let openGoals = null;
  try {
    const cfg = loadConfig();
    if (cfg?.goalsTableName) {
      openGoals = await fetchOpenGoals(creds, cfg.goalsTableName);
    }
  } catch (e) {
    log11(`open-goals lookup failed: ${e.message}`);
  }
  let prefix = null;
  let firstRun = false;
  try {
    const cold = await pickColdStartBrief(creds);
    if (cold) {
      prefix = cold.brief;
      firstRun = cold.firstRun;
    } else {
      prefix = (await pickResumeBrief(creds, sessionId))?.brief ?? null;
    }
  } catch (e) {
    log11(`session brief threw: ${e.message}`);
  }
  const balanceCents = orgStats?.balanceCents ?? null;
  if (tokensSaved > MEANINGFUL_SAVINGS_TOKENS) {
    const banner = orgStats != null ? renderOnlineSavings(sessionId, orgStats, creds.userName, openGoals, prefix) : renderOfflineSavings(sessionId, creds.userName, openGoals, prefix);
    return appendBalance(banner, balanceCents, creds);
  }
  const welcome = renderWelcome(sessionId, creds, openGoals, firstRun, prefix);
  return appendBalance(welcome, balanceCents, creds);
}
function composeBody(lead, brief, openGoals) {
  const parts = [lead];
  if (brief)
    parts.push(brief);
  const goals = formatOpenGoalsLine(openGoals);
  if (goals)
    parts.push(`\u{1F4CC} ${goals}`);
  return parts.map((p) => p.replace(/\n+$/, "")).join("\n\n");
}
var LOW_BALANCE_THRESHOLD_CENTS = 200;
function billingUrl2(creds) {
  if (creds.orgName && creds.workspaceId) {
    return `https://deeplake.ai/${encodeURIComponent(creds.orgName)}/workspace/${encodeURIComponent(creds.workspaceId)}/billing`;
  }
  return "https://deeplake.ai";
}
function appendBalance(n, balanceCents, creds) {
  if (balanceCents === null || balanceCents <= 0 || balanceCents >= LOW_BALANCE_THRESHOLD_CENTS)
    return n;
  const line = `\u26A0\uFE0F Hivemind balance low \u2014 only $${(balanceCents / 100).toFixed(2)} of prepaid credit left. Top up at ${billingUrl2(creds)} before requests start failing.`;
  return { ...n, body: `${n.body}

${line}` };
}
function renderWelcome(sessionId, creds, openGoals, firstEver = false, brief = null) {
  const greeting = firstEver ? "Hey" : "Welcome back";
  const title = creds.userName ? `${greeting}, ${creds.userName}` : greeting;
  const orgPhrase = creds.orgName ? `org ${creds.orgName}` : "your organization";
  const workspace = creds.workspaceId ?? "default";
  return {
    id: "welcome",
    severity: "info",
    title,
    body: composeBody(`Connected to ${orgPhrase} (workspace ${workspace}).`, brief, openGoals),
    dedupKey: { session: sessionId },
    // User-facing only. This banner (welcome / savings / any prepended
    // cold-start or resume brief) carries mined and summary-derived prose,
    // which must never enter the model's additionalContext — that would be
    // a prompt-injection channel (codex P1). The model gets its memory
    // instructions from the sibling session-start hook; this slot is purely
    // for the human reading their terminal.
    userVisibleOnly: true
  };
}
function renderOnlineSavings(sessionId, s, userName, openGoals, brief = null) {
  const zOrg = bytesToSavedTokens(s.org.memorySearchBytes);
  const zUser = bytesToSavedTokens(s.user.memorySearchBytes);
  const title = `Hivemind has saved your team ~${formatTokens(zOrg)} tokens`;
  const segments = [
    `${formatCount(s.org.memoryRecallCount)} memory ${s.org.memoryRecallCount === 1 ? "recall" : "recalls"}`,
    `across ${formatCount(s.org.sessionsCount)} ${s.org.sessionsCount === 1 ? "session" : "sessions"}`
  ];
  if (s.user.memorySearchBytes >= MIN_USER_BYTES_FOR_CONTRIBUTION_LINE) {
    segments.push(`you contributed ~${formatTokens(zUser)}`);
  }
  const skillsGenerated = countUserGeneratedSkills(userName);
  if (skillsGenerated > 0) {
    segments.push(`${skillsGenerated} ${skillsGenerated === 1 ? "skill" : "skills"} generated`);
  }
  const body = composeBody(`   ${segments.join(" \xB7 ")}`, brief, openGoals);
  return {
    id: "savings-recap",
    severity: "info",
    title,
    body,
    dedupKey: { session: sessionId },
    // User-facing only — see the welcome renderer's note. A resume/cold-start
    // brief rides in this body, so it must not reach the model's
    // additionalContext.
    userVisibleOnly: true
  };
}
function renderOfflineSavings(sessionId, userName, openGoals, brief = null) {
  const records = readUsageRecords();
  const memorySearchBytes = sumMetric(records, "memorySearchBytes");
  const zTokens = bytesToSavedTokens(memorySearchBytes);
  const sessionCount = records.length;
  const memorySearches = sumMetric(records, "memorySearchCount");
  const skillsGenerated = countUserGeneratedSkills(userName);
  const title = `Hivemind has saved you ~${formatTokens(zTokens)} tokens`;
  const segments = [
    `${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}`,
    `${memorySearches} memory ${memorySearches === 1 ? "search" : "searches"}`
  ];
  if (skillsGenerated > 0) {
    segments.push(`${skillsGenerated} ${skillsGenerated === 1 ? "skill" : "skills"} generated`);
  }
  const body = composeBody(`   ${segments.join(" \xB7 ")}`, brief, openGoals);
  return {
    id: "savings-recap",
    severity: "info",
    title,
    body,
    dedupKey: { session: sessionId },
    // User-facing only — see the welcome renderer's note. A resume/cold-start
    // brief rides in this body, so it must not reach the model's
    // additionalContext.
    userVisibleOnly: true
  };
}

// dist/src/notifications/index.js
var log12 = (msg) => log("notifications", msg);
async function drainSessionStart(opts) {
  try {
    const state = readState();
    const queue = readQueue();
    const ctx = {
      agent: opts.agent,
      creds: opts.creds,
      state,
      localSkillsCount: opts.localSkillsCount ?? null,
      latestInsightEntry: opts.latestInsightEntry ?? null,
      sessionCount: opts.sessionCount
    };
    const fromRules = evaluateRules("session_start", ctx);
    const fromQueue = queue.queue;
    const [fromBackend, primary] = await Promise.all([
      fetchBackendNotifications(opts.creds),
      pickPrimaryBanner(opts.sessionId, opts.creds, opts.source)
    ]);
    const fromPrimary = primary != null ? [primary] : [];
    const all = [...fromPrimary, ...fromRules, ...fromQueue, ...fromBackend];
    const fresh = all.filter((n) => !alreadyShown(state, n));
    if (fresh.length === 0) {
      if (queue.queue.length > 0)
        writeQueue({ queue: [] });
      return;
    }
    const claimed = fresh.filter((n) => tryClaim(n));
    if (claimed.length === 0) {
      if (queue.queue.length > 0)
        writeQueue({ queue: [] });
      log12(`all ${fresh.length} notification(s) claimed by another process`);
      return;
    }
    emit(opts.agent, claimed);
    let nextState = state;
    for (const n of claimed) {
      if (n.transient)
        releaseClaim(n);
      else
        nextState = markShown(nextState, n);
    }
    writeState(nextState);
    if (queue.queue.length > 0)
      writeQueue({ queue: [] });
    log12(`delivered ${claimed.length} notification(s) to ${opts.agent}`);
  } catch (e) {
    log12(`drainSessionStart failed: ${e?.message ?? String(e)}`);
  }
}

// dist/src/notifications/rules/referral-invite.js
var MIN_SESSIONS = 3;
var referralInviteRule = {
  id: "referral-invite",
  trigger: "session_start",
  evaluate({ creds, sessionCount }) {
    if (!creds?.token)
      return null;
    if ((sessionCount ?? 0) < MIN_SESSIONS)
      return null;
    return {
      id: "referral-invite",
      severity: "info",
      title: "\u{1F4B8} Invite a teammate \u2014 your org earns $20",
      body: "Run `hivemind invite <email> <ADMIN|WRITE|READ>` \u2014 your org gets $20 in credit when they sign up (up to $100).",
      // Stable key → shown once, ever. Bump to {v:2} to re-nudge everyone.
      dedupKey: { v: 1 }
    };
  }
};

// dist/src/hooks/session-notifications.js
var log13 = (msg) => log("session-notifications", msg);
registerRule(referralInviteRule);
async function main() {
  if (process.env.HIVEMIND_WIKI_WORKER === "1")
    return;
  const input = await readStdin().catch(() => ({}));
  const rawSessionId = typeof input?.session_id === "string" ? input.session_id.trim() : "";
  const sessionId = rawSessionId.length > 0 ? rawSessionId : void 0;
  const source = typeof input?.source === "string" ? input.source : void 0;
  const sessionCount = bumpSessionCount(sessionId);
  const creds = loadCredentials();
  await drainSessionStart({ agent: "claude-code", creds, sessionId, source, sessionCount });
}
main().catch((e) => {
  log13(`fatal: ${e?.message ?? String(e)}`);
  process.exit(0);
});
