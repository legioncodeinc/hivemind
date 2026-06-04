/**
 * Shared helper for spawning the detached wiki-worker.js process.
 * Called from session-end.ts (always) and capture.ts (periodic trigger).
 */

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import type { Config } from "../config.js";
import { makeWikiLogger } from "../utils/wiki-log.js";
import { getInstalledVersion } from "../utils/version-check.js";
import { spawnDetachedNodeWorker } from "../utils/spawn-detached.js";
import { projectNameFromCwd } from "../utils/project-name.js";

const HOME = homedir();
const wikiLogger = makeWikiLogger(join(HOME, ".claude", "hooks"));
export const WIKI_LOG = wikiLogger.path;

export const WIKI_PROMPT_TEMPLATE = `You are building a personal wiki from a coding session. Your goal is to extract every piece of knowledge — entities, decisions, relationships, and facts — into a structured, searchable wiki entry. Think of this as building a knowledge graph, not writing a summary.

SESSION JSONL path: __JSONL__
SUMMARY FILE to write: __SUMMARY__
SESSION ID: __SESSION_ID__
PROJECT: __PROJECT__
PREVIOUS JSONL OFFSET (lines already processed): __PREV_OFFSET__
CURRENT JSONL LINES: __JSONL_LINES__

Steps:
1. Read the session JSONL at the path above.
   - If PREVIOUS JSONL OFFSET > 0, this is a resumed session. Read the existing summary file first,
     then focus on lines AFTER the offset for new content. Merge new facts into the existing summary.
   - If offset is 0, generate from scratch.

2. Write the summary file at the path above with this EXACT format. The header fields (Source, Project) are pre-filled — copy them VERBATIM, do NOT replace them with paths from the JSONL content:

# Session __SESSION_ID__
- **Source**: __JSONL_SERVER_PATH__
- **Started**: <extract from JSONL>
- **Ended**: <now>
- **Project**: __PROJECT__
- **JSONL offset**: __JSONL_LINES__

## What Happened
<2-3 dense sentences. What was the goal, what was accomplished, what's left.>

## People
<For each person mentioned: name, role, what they did/said. Format: **Name** — role — action>

## Entities
<Every named thing: repos, branches, files, APIs, tools, services, tables, features, bugs.
Format: **entity** (type) — what was done with it, its current state>

## Decisions & Reasoning
<Every decision made and WHY. Not just "did X" but "did X because Y, considered Z but rejected it because W">

## Key Facts
<Bullet list of atomic facts that could answer future questions. Each fact should stand alone.
Example: "- The memory table uses DELETE+INSERT, not UPDATE (WASM doesn't support upsert)">

## Files Modified
<bullet list: path (new/modified/deleted) — what changed>

## Open Questions / TODO
<Anything unresolved, blocked, or explicitly deferred>

## Next Steps
<Default to writing exactly: none. When in any doubt at all, write none. Do NOT assume any base rate — not that next steps are usually warranted, nor that they usually are not; the right frequency depends entirely on the work and varies by session and use case. Judge THIS session purely on the gate below, never on how often the section "should" be filled. The bar is deliberately EXTREME: name a next step ONLY when failing to surface it would cause the project to MISS SOMETHING IMPORTANT WITH SUBSTANTIAL CONSEQUENCES — work silently lost, a known bug or regression shipping to users, data or state left corrupted/unsafe, a security or data-integrity hole left open, or a critical blocker/decision that a returning engineer would NOT rediscover on their own and would be materially harmed by not knowing. Before you write anything other than none, apply this gate: state to yourself the specific, concrete, substantial bad outcome that follows if the user NEVER sees this line. If you cannot name a concrete bad outcome — or a competent engineer would simply re-derive the work from the code, tests, comments, or git state — write none. A next step is NOT: a nice-to-have, a polish or cleanup item, a "could also" / "consider", the obvious natural continuation of the task, an open-ended exploration, a trivial or mechanical follow-up, or any administrative wrap-up (committing, pushing, opening/merging a PR, deploying, monitoring CI — treat ALL such wrap-up as ALREADY DONE). It is a flag raised solely because real, describable harm follows from silence. When (rarely) the gate is genuinely passed, write a single concrete imperative line that names the substantive work AND makes the stakes obvious (e.g. "Fix the uint32 class_label scan binding — reads silently return wrong values until corrected"). Administrative actions qualify ONLY when the session's core purpose itself was that release/ops task.>

IMPORTANT: Be exhaustive. Extract EVERY entity, decision, and fact. Future you will search this wiki to answer questions like "who worked on X", "why did we choose Y", "what's the status of Z". If a detail exists in the session, it should be in the wiki.

PRIVACY: Never include absolute filesystem paths (e.g. /home/user/..., /Users/..., C:\\\\...) in the summary. Use only project-relative paths or the project name. The Source and Project fields above are already correct — do not change them.

LENGTH LIMIT: Keep the total summary under 4000 characters. Be dense and concise — prioritize facts over prose. If a session is short, the summary should be short too.`;

export const wikiLog = wikiLogger.log;

export function findClaudeBin(): string {
  try {
    return execSync("which claude 2>/dev/null", { encoding: "utf-8" }).trim();
  } catch {
    return join(HOME, ".claude", "local", "claude");
  }
}

export interface SpawnOptions {
  config: Config;
  sessionId: string;
  cwd: string;
  bundleDir: string;
  reason: string;
}

export function spawnWikiWorker(opts: SpawnOptions): void {
  const { config, sessionId, cwd, bundleDir, reason } = opts;
  const projectName = projectNameFromCwd(cwd);

  const tmpDir = join(tmpdir(), `deeplake-wiki-${sessionId}-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const pluginVersion = getInstalledVersion(bundleDir, ".claude-plugin") ?? "";

  const configFile = join(tmpDir, "config.json");
  writeFileSync(configFile, JSON.stringify({
    apiUrl: config.apiUrl,
    token: config.token,
    orgId: config.orgId,
    workspaceId: config.workspaceId,
    memoryTable: config.tableName,
    sessionsTable: config.sessionsTableName,
    sessionId,
    userName: config.userName,
    project: projectName,
    pluginVersion,
    tmpDir,
    claudeBin: findClaudeBin(),
    wikiLog: WIKI_LOG,
    hooksDir: join(HOME, ".claude", "hooks"),
    promptTemplate: WIKI_PROMPT_TEMPLATE,
  }));

  wikiLog(`${reason}: spawning summary worker for ${sessionId}`);

  const workerPath = join(bundleDir, "wiki-worker.js");
  spawnDetachedNodeWorker(workerPath, [configFile]);

  wikiLog(`${reason}: spawned summary worker for ${sessionId}`);
}

export function bundleDirFromImportMeta(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}
