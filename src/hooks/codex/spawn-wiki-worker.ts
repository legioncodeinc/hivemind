/**
 * Codex-specific helper for spawning the detached wiki-worker.js.
 * Mirrors src/hooks/spawn-wiki-worker.ts but targets ~/.codex/ paths and codexBin.
 */

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import type { Config } from "../../config.js";
import { makeWikiLogger } from "../../utils/wiki-log.js";
import { getInstalledVersion } from "../../utils/version-check.js";
import { spawnDetachedNodeWorker } from "../../utils/spawn-detached.js";
import { projectNameFromCwd } from "../../utils/project-name.js";

const HOME = homedir();
const wikiLogger = makeWikiLogger(join(HOME, ".codex", "hooks"));
export const WIKI_LOG = wikiLogger.path;

export const WIKI_PROMPT_TEMPLATE = `You are building a personal wiki from a coding session. Your goal is to extract every piece of knowledge — entities, decisions, relationships, and facts — into a structured, searchable wiki entry.

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

2. Write the summary file at the path above with this EXACT format:

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
<Every decision made and WHY.>

## Key Facts
<Bullet list of atomic facts that could answer future questions.>

## Files Modified
<bullet list: path (new/modified/deleted) — what changed>

## Open Questions / TODO
<Anything unresolved, blocked, or explicitly deferred>

## Next Steps
<Default to writing exactly: none. Most sessions are DONE when they end — do not invent a next step just to fill this section. Only name one when the session left GENUINELY SUBSTANTIVE, non-obvious work that a knowledgeable engineer returning later would actually need flagged. Make a real judgment: is there unfinished work truly WORTH resuming? If not, write: none. Write none when the work reached a natural stopping point, is complete, only trivial/obvious follow-ups remain, the "next step" is just continuing an open-ended exploration, or the only thing left is administrative wrap-up (committing, pushing, opening/merging a PR, deploying, monitoring CI) — treat all such wrap-up as ALREADY DONE. When a next step IS warranted, write a single concrete imperative line for the substantive work (e.g. "Wire the resume-brief Next Steps fallback and run the tests"). Administrative actions qualify ONLY when the session's core purpose itself was that release/ops task.>

IMPORTANT: Be exhaustive. Extract EVERY entity, decision, and fact.
PRIVACY: Never include absolute filesystem paths in the summary.
LENGTH LIMIT: Keep the total summary under 4000 characters.`;

export const wikiLog = wikiLogger.log;

export function findCodexBin(): string {
  try {
    return execSync("which codex 2>/dev/null", { encoding: "utf-8" }).trim();
  } catch {
    return "codex";
  }
}

export interface SpawnOptions {
  config: Config;
  sessionId: string;
  cwd: string;
  bundleDir: string;
  reason: string;
}

export function spawnCodexWikiWorker(opts: SpawnOptions): void {
  const { config, sessionId, cwd, bundleDir, reason } = opts;
  const projectName = projectNameFromCwd(cwd);

  const tmpDir = join(tmpdir(), `deeplake-wiki-${sessionId}-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const pluginVersion = getInstalledVersion(bundleDir, ".codex-plugin") ?? "";

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
    codexBin: findCodexBin(),
    wikiLog: WIKI_LOG,
    hooksDir: join(HOME, ".codex", "hooks"),
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
