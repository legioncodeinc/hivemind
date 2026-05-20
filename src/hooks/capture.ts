#!/usr/bin/env node

/**
 * Capture hook — writes each session event as a separate row in the sessions table.
 * One INSERT per event, no concat, no race conditions.
 *
 * Used by: UserPromptSubmit, PostToolUse (async), Stop, SubagentStop
 */

import { readStdin } from "../utils/stdin.js";
import { loadConfig, type Config } from "../config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { sqlStr } from "../utils/sql.js";
import { log as _log } from "../utils/debug.js";
import { buildSessionPath } from "../utils/session-path.js";
import {
  bumpTotalCount,
  loadTriggerConfig,
  shouldTrigger,
  tryAcquireLock,
  releaseLock,
} from "./summary-state.js";
import { bundleDirFromImportMeta, spawnWikiWorker, wikiLog } from "./spawn-wiki-worker.js";
import { tryStopCounterTrigger } from "../skillify/triggers.js";
import { tryAutoExtract } from "./auto-extract.js";
import { EmbedClient } from "../embeddings/client.js";
import { embeddingSqlLiteral } from "../embeddings/sql.js";
import { embeddingsDisabled } from "../embeddings/disable.js";
import { ensurePluginNodeModulesLink } from "../embeddings/self-heal.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { getInstalledVersion } from "../utils/version-check.js";
const log = (msg: string) => _log("capture", msg);

function resolveEmbedDaemonPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "embeddings", "embed-daemon.js");
}

const __bundleDir = dirname(fileURLToPath(import.meta.url));
const PLUGIN_VERSION = getInstalledVersion(__bundleDir, ".claude-plugin") ?? "";

// Self-heal the shared-deps symlink for this plugin version. Marketplace
// auto-upgrades drop new versioned cache dirs without the symlink that
// `hivemind embeddings install` originally created; this restores it on
// first capture after each upgrade. No-op when the symlink already exists,
// shared deps are not installed, or the user has disabled embeddings.
if (!embeddingsDisabled()) {
  try { ensurePluginNodeModulesLink({ bundleDir: __bundleDir }); } catch { /* best-effort */ }
}

interface HookInput {
  session_id: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  hook_event_name?: string;
  agent_id?: string;
  agent_type?: string;
  // UserPromptSubmit
  prompt?: string;
  // PostToolUse
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  tool_use_id?: string;
  // Stop / SubagentStop
  last_assistant_message?: string;
  stop_hook_active?: boolean;
  agent_transcript_path?: string;
}

const CAPTURE = process.env.HIVEMIND_CAPTURE !== "false";

async function main(): Promise<void> {
  if (!CAPTURE) return;
  const input = await readStdin<HookInput>();
  const config = loadConfig();
  if (!config) { log("no config"); return; }

  const sessionsTable = config.sessionsTableName;
  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, sessionsTable);

  // Build the event entry
  const ts = new Date().toISOString();
  const meta = {
    session_id: input.session_id,
    transcript_path: input.transcript_path,
    cwd: input.cwd,
    permission_mode: input.permission_mode,
    hook_event_name: input.hook_event_name,
    agent_id: input.agent_id,
    agent_type: input.agent_type,
    timestamp: ts,
  };

  let entry: Record<string, unknown>;

  if (input.prompt !== undefined) {
    log(`user session=${input.session_id}`);
    entry = {
      id: crypto.randomUUID(),
      ...meta,
      type: "user_message",
      content: input.prompt,
    };
  } else if (input.tool_name !== undefined) {
    log(`tool=${input.tool_name} session=${input.session_id}`);
    entry = {
      id: crypto.randomUUID(),
      ...meta,
      type: "tool_call",
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
      tool_input: JSON.stringify(input.tool_input),
      tool_response: JSON.stringify(input.tool_response),
    };
  } else if (input.last_assistant_message !== undefined) {
    log(`assistant session=${input.session_id}`);
    entry = {
      id: crypto.randomUUID(),
      ...meta,
      type: "assistant_message",
      content: input.last_assistant_message,
      ...(input.agent_transcript_path ? { agent_transcript_path: input.agent_transcript_path } : {}),
    };
  } else {
    log("unknown event, skipping");
    return;
  }

  const sessionPath = buildSessionPath(config, input.session_id);
  const line = JSON.stringify(entry);
  log(`writing to ${sessionPath}`);

  // Simple INSERT — one row per event, no concat, no race conditions.
  const projectName = (input.cwd ?? "").split("/").pop() || "unknown";
  const filename = sessionPath.split("/").pop() ?? "";

  // For JSONB: only escape single quotes for the SQL literal, keep JSON structure intact.
  // sqlStr() would also escape backslashes and strip control chars, corrupting the JSON.
  const jsonForSql = line.replace(/'/g, "''");

  // Skip the daemon round-trip entirely when embeddings are globally disabled —
  // the column stays NULL, schema-compatible with future re-enabling.
  const embedding = embeddingsDisabled()
    ? null
    : await new EmbedClient({ daemonEntry: resolveEmbedDaemonPath() }).embed(line, "document");
  const embeddingSql = embeddingSqlLiteral(embedding);

  const insertSql =
    `INSERT INTO "${sessionsTable}" (id, path, filename, message, message_embedding, author, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date) ` +
    `VALUES ('${crypto.randomUUID()}', '${sqlStr(sessionPath)}', '${sqlStr(filename)}', '${jsonForSql}'::jsonb, ${embeddingSql}, '${sqlStr(config.userName)}', ` +
    `${Buffer.byteLength(line, "utf-8")}, '${sqlStr(projectName)}', '${sqlStr(input.hook_event_name ?? "")}', 'claude_code', '${sqlStr(PLUGIN_VERSION)}', '${ts}', '${ts}')`;

  try {
    await api.query(insertSql);
  } catch (e: any) {
    // Fallback: table might not exist (session-start failed or org switched mid-session).
    // Create it and retry once.
    if (e.message?.includes("permission denied") || e.message?.includes("does not exist")) {
      log("table missing, creating and retrying");
      await api.ensureSessionsTable(sessionsTable);
      await api.query(insertSql);
    } else {
      throw e;
    }
  }

  log("capture ok → cloud");

  // Auto-extract: best-effort KPI event emission for known shell
  // patterns (currently `gh pr merge` only). Wrapped in try/catch so a
  // failure here NEVER breaks the session capture path above — the
  // session row is already INSERTed at this point. On missing-table
  // error we ensure + retry once (mirror of the sessions-table lazy
  // pattern), because no SessionStart hook currently ensures
  // task_events; the first event in a fresh session pays a one-time
  // create cost. Pre-ensuring task_events at session-start is a v1.1
  // optimization tracked in the plan.
  try {
    const queryFn = (sql: string) => api.query(sql) as Promise<Array<Record<string, unknown>>>;
    const kind = await tryAutoExtract(queryFn, config.taskEventsTableName, input, {
      agent: "claude_code",
      plugin_version: PLUGIN_VERSION,
    });
    if (kind) log(`auto-extract: ${kind}`);
  } catch (e: any) {
    const msg: string = e?.message ?? String(e);
    if (msg.includes("does not exist") || msg.includes("permission denied")) {
      try {
        log("auto-extract: task_events missing, creating and retrying");
        await api.ensureTaskEventsTable(config.taskEventsTableName);
        const queryFn = (sql: string) => api.query(sql) as Promise<Array<Record<string, unknown>>>;
        const kind = await tryAutoExtract(queryFn, config.taskEventsTableName, input, {
          agent: "claude_code",
          plugin_version: PLUGIN_VERSION,
        });
        if (kind) log(`auto-extract: ${kind} (after ensure)`);
      } catch (retryErr: any) {
        log(`auto-extract retry failed: ${retryErr?.message ?? String(retryErr)}`);
      }
    } else {
      log(`auto-extract failed: ${msg}`);
    }
  }

  maybeTriggerPeriodicSummary(input.session_id, input.cwd ?? "", config);

  if (input.hook_event_name === "Stop") {
    if (process.env.HIVEMIND_WIKI_WORKER === "1") return;
    tryStopCounterTrigger({
      config,
      cwd: input.cwd ?? "",
      bundleDir: bundleDirFromImportMeta(import.meta.url),
      agent: "claude_code",
      sessionId: input.session_id,
    });
  }
}

/** Increment the event counter and, if the threshold is crossed, spawn a background wiki worker. */
function maybeTriggerPeriodicSummary(sessionId: string, cwd: string, config: Config): void {
  if (process.env.HIVEMIND_WIKI_WORKER === "1") return;

  try {
    const state = bumpTotalCount(sessionId);
    const cfg = loadTriggerConfig();
    if (!shouldTrigger(state, cfg)) return;

    if (!tryAcquireLock(sessionId)) {
      log(`periodic trigger suppressed (lock held) session=${sessionId}`);
      return;
    }

    wikiLog(`Periodic: threshold hit (total=${state.totalCount}, since=${state.totalCount - state.lastSummaryCount}, N=${cfg.everyNMessages}, hours=${cfg.everyHours})`);
    try {
      spawnWikiWorker({
        config,
        sessionId,
        cwd,
        bundleDir: bundleDirFromImportMeta(import.meta.url),
        reason: "Periodic",
      });
    } catch (e: any) {
      log(`periodic spawn failed: ${e.message}`);
      try {
        releaseLock(sessionId);
      } catch (releaseErr: any) {
        log(`releaseLock after periodic spawn failure also failed: ${releaseErr.message}`);
      }
      throw e;
    }
  } catch (e: any) {
    log(`periodic trigger error: ${e.message}`);
  }
}

main().catch((e) => {
  const msg: string = e?.message ?? String(e);
  log(`fatal: ${msg}`);
  // Mid-session signal: if this capture failed because the org ran out of
  // credits (server returns 402 with `balance_cents` in the body), surface
  // it INLINE so the user sees it on the very tool call that triggered the
  // failure — not at the next session-start. The same notification is also
  // enqueued by the SDK for the session-start banner (deeplake-api.ts's
  // maybeSignalBalanceExhausted) so users get reminded on every fresh
  // session too. Both are intentional: this is a critical error.
  if (msg.includes("402") && msg.includes("balance_cents")) {
    try {
      emitBalanceExhaustedInline();
    } catch (emitErr: any) {
      log(`inline emit failed: ${emitErr?.message ?? String(emitErr)}`);
    }
  }
  process.exit(0);
});

/**
 * Write a hook response JSON to stdout that Claude Code renders as a
 * user-visible banner mid-session (`systemMessage`) AND surfaces to the
 * model as additional context (`additionalContext`). The model can then
 * mention the issue in its next turn if it's relevant to the user's task.
 *
 * Reads creds for the org/workspace-scoped billing URL, falling back to
 * the bare host when creds are missing/malformed. Mirrors the URL logic
 * in deeplake-api.ts's billingUrl() so the session-start banner and the
 * mid-session signal point at the same place.
 */
function emitBalanceExhaustedInline(): void {
  let url = "https://deeplake.ai";
  try {
    const credsPath = join(homedir(), ".deeplake", "credentials.json");
    const c = JSON.parse(readFileSync(credsPath, "utf-8")) as { orgName?: string; workspaceId?: string };
    if (c.orgName && c.workspaceId) {
      url = `https://deeplake.ai/${encodeURIComponent(c.orgName)}/workspace/${encodeURIComponent(c.workspaceId)}/billing`;
    }
  } catch { /* fall back to bare host */ }

  // additionalContext is the model-facing channel — Claude Code injects
  // it as a system reminder for the next turn. The model will then
  // surface the issue to the user (verified live: claude wrote
  // "Hivemind credits are exhausted, so live memory recalls are
  // failing — top up at <url>" in its response).
  //
  // systemMessage is intentionally OMITTED. We tested it: Claude Code
  // only renders systemMessage for SessionStart hooks. For PostToolUse /
  // UserPromptSubmit / Stop, the value is silently dropped. Including
  // it would just be dead weight in the response payload.
  const msg = `⚠️ HIVEMIND ALERT: This capture failed because the org is out of Deeplake credits (balance is 0). Memory recall is also returning empty. Tell the user clearly: "Hivemind credits are exhausted — sessions are not being saved and memory recall is empty. Top up at ${url} to restore."`;
  const payload = {
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: msg },
  };
  process.stdout.write(JSON.stringify(payload));
}
