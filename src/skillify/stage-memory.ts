/**
 * Stage-only memory extractor for the install-time backfill (EXTRACT phase).
 *
 * Reuses the live SessionEnd knowledge extractor — the same WIKI_PROMPT_TEMPLATE
 * and the same local embed daemon — but WITHOUT any Deeplake auth:
 *
 *   - The live wiki-worker fetches the session JSONL from the `sessions`
 *     table and uploads the summary to the `memory` table (both auth-gated).
 *   - Backfill already has the JSONL on disk (the user's local agent session
 *     file), and the prompt template takes a __JSONL__ path. So this path
 *     points claude -p at the local file, writes the summary into the
 *     staging dir, embeds it locally, and records an `uploaded: false`
 *     manifest row. The post-login flush uploads it later.
 *
 * One session in → one staged (summary + embedding) record out. Pure on the
 * filesystem under PENDING_MEMORY_DIR; no network.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { WIKI_PROMPT_TEMPLATE } from "../hooks/spawn-wiki-worker.js";
import { findAgentBin } from "./gate-runner.js";
import { EmbedClient } from "../embeddings/client.js";
import { embeddingsDisabled } from "../embeddings/disable.js";
import {
  PENDING_MEMORY_DIR,
  PENDING_MEMORY_MANIFEST_PATH,
  upsertPendingMemoryEntry,
  type PendingMemoryEntry,
} from "./pending-memory-manifest.js";

export interface StageSessionInput {
  sessionId: string;
  /** Absolute path to the local session JSONL. */
  jsonlPath: string;
  /** Source agent: claude_code | codex | cursor | hermes. */
  agent: string;
  /** Project name for the summary header + later org/project scoping. */
  project: string;
}

export interface StageOptions {
  /** Path to the claude binary used to run the extraction prompt. */
  claudeBin: string;
  /** Per-session claude -p timeout. */
  timeoutMs: number;
  /** Skip the local embedding step (flush will compute it). */
  skipEmbed: boolean;
  /** ISO-8601 timestamp stamper (injected so callers control determinism). */
  now: () => string;
  /** Override staging dir (tests). Defaults to PENDING_MEMORY_DIR. */
  stagingDir?: string;
  /** Override manifest path (tests). Defaults to PENDING_MEMORY_MANIFEST_PATH. */
  manifestPath?: string;
  /**
   * Run the extraction agent against `prompt`, returning true on success.
   * Injectable for tests; defaults to the real `claude -p` spawn. A real
   * agent writes the summary file named in the prompt as a side effect.
   */
  runAgent?: (claudeBin: string, prompt: string, timeoutMs: number) => Promise<boolean>;
  /** Embed `text` locally; null when unavailable. Injectable for tests. */
  embed?: (text: string) => Promise<number[] | null>;
}

export interface StageResult {
  sessionId: string;
  ok: boolean;
  embedded: boolean;
  reason?: string;
}

function countLines(path: string): number {
  try {
    const buf = readFileSync(path, "utf-8");
    if (!buf) return 0;
    // Trailing newline shouldn't inflate the count.
    return buf.endsWith("\n") ? buf.split("\n").length - 1 : buf.split("\n").length;
  } catch {
    return 0;
  }
}

function runClaude(claudeBin: string, prompt: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      claudeBin,
      [
        "-p", prompt,
        "--no-session-persistence",
        "--model", "haiku",
        "--permission-mode", "bypassPermissions",
      ],
      {
        stdio: ["ignore", "ignore", "ignore"],
        // HIVEMIND_CAPTURE=false: our own extraction claude -p calls must
        // not re-trigger the capture/wiki hooks and recurse.
        env: { ...process.env, HIVEMIND_WIKI_WORKER: "1", HIVEMIND_CAPTURE: "false" },
        timeout: timeoutMs,
      },
    );
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Default daemon entry: next to the bundled worker, mirroring wiki-worker.ts.
 * Falls back through EmbedClient's shared-daemon path + autoSpawn when this
 * isn't present (e.g. running from source).
 */
/** Best-effort local embed; null when globally disabled or daemon unreachable. */
async function defaultEmbed(text: string): Promise<number[] | null> {
  if (embeddingsDisabled()) return null;
  // No daemonEntry: EmbedClient falls back to the canonical shared daemon
  // (~/.hivemind/embed-deps/embed-daemon.js) + autospawn.
  return new EmbedClient({ autoSpawn: true }).embed(text, "document");
}

/**
 * Globally-unique staging key for a session. The bare session-id (filename
 * stem) is NOT unique across agents/dirs now that discovery is recursive — a
 * Claude `<uuid>` and a Codex `rollout-…` could in principle collide and
 * overwrite each other's staged summary/embedding. Prefixing the agent makes
 * the key unique and stable; planBackfill dedups on the same key.
 */
export function backfillSessionKey(agent: string, sessionId: string): string {
  return `${agent}-${sessionId}`;
}

export async function stageSession(input: StageSessionInput, opts: StageOptions): Promise<StageResult> {
  const stagingDir = opts.stagingDir ?? PENDING_MEMORY_DIR;
  const key = backfillSessionKey(input.agent, input.sessionId);
  const summaryPath = join(stagingDir, `${key}.md`);
  const embeddingPath = join(stagingDir, `${key}.embedding.json`);

  if (!existsSync(input.jsonlPath)) {
    return { sessionId: key, ok: false, embedded: false, reason: "jsonl-missing" };
  }
  try {
    mkdirSync(stagingDir, { recursive: true });
  } catch {
    return { sessionId: key, ok: false, embedded: false, reason: "mkdir-failed" };
  }

  const jsonlLines = countLines(input.jsonlPath);
  // Offset 0: backfill always extracts from scratch (no prior summary on disk).
  const prompt = WIKI_PROMPT_TEMPLATE
    .replace(/__JSONL__/g, input.jsonlPath)
    .replace(/__SUMMARY__/g, summaryPath)
    .replace(/__SESSION_ID__/g, input.sessionId)
    .replace(/__PROJECT__/g, input.project)
    .replace(/__PREV_OFFSET__/g, "0")
    .replace(/__JSONL_LINES__/g, String(jsonlLines))
    // Backfill has no server path; the source is the local session. The
    // prompt's PRIVACY rule strips absolute paths from the body, so use a
    // synthetic project-relative marker rather than leaking the disk path.
    .replace(/__JSONL_SERVER_PATH__/g, `local:${input.agent}/${input.sessionId}`);

  // Remove any leftover summary from a prior run so success genuinely
  // requires THIS run's agent to (re)write the file — otherwise a failed or
  // no-op run could return ok:true on stale content.
  if (existsSync(summaryPath)) {
    try { unlinkSync(summaryPath); } catch { /* best-effort */ }
  }

  const runAgent = opts.runAgent ?? runClaude;
  const ran = await runAgent(opts.claudeBin, prompt, opts.timeoutMs);
  if (!existsSync(summaryPath)) {
    return { sessionId: key, ok: false, embedded: false, reason: ran ? "no-summary" : "claude-failed" };
  }
  const text = readFileSync(summaryPath, "utf-8");
  if (!text.trim()) {
    return { sessionId: key, ok: false, embedded: false, reason: "empty-summary" };
  }

  let embedded = false;
  if (!opts.skipEmbed) {
    try {
      const embed = opts.embed ?? defaultEmbed;
      const vec = await embed(text);
      if (vec) {
        writeFileSync(embeddingPath, JSON.stringify(vec));
        embedded = true;
      }
    } catch {
      // Local embed is best-effort; flush recomputes when embedded=false.
    }
  }

  const entry: PendingMemoryEntry = {
    session_id: key,
    source_agent: input.agent,
    project: input.project,
    source_session_path: input.jsonlPath,
    summary_path: summaryPath,
    embedded,
    embedding_path: embedded ? embeddingPath : undefined,
    extracted_at: opts.now(),
    uploaded: false,
  };
  upsertPendingMemoryEntry(entry, entry.extracted_at, opts.manifestPath ?? PENDING_MEMORY_MANIFEST_PATH);

  return { sessionId: key, ok: true, embedded };
}

/** Resolve the claude binary for the extraction gate. */
export function resolveClaudeBin(): string {
  return findAgentBin("claude_code");
}
