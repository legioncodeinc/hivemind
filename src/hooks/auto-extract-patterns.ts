/**
 * Pattern allow-list for the PostToolUse auto-extract pipeline.
 *
 * v1 ships exactly ONE pattern: `gh pr merge`. The rationale (from the
 * plan, A6 + failure-modes table):
 *
 *   - `gh pr merge` is high-signal — it produces a PR-merge event in
 *     the real world and is rare enough that a false positive (e.g.
 *     the user typing the literal string into a chat or doc) is
 *     vanishingly unlikely. Anyone running it intends to merge.
 *
 *   - `git push` is intentionally NOT in the allow-list. The same
 *     command runs against personal branches, force-pushes, and
 *     experiments — counting every `git push` as KPI progress would
 *     inflate counts beyond meaning.
 *
 *   - A future v1.1 may grow the list; each addition needs a
 *     true-positive test AND a false-positive test in
 *     tests/shared/auto-extract.test.ts before it lands.
 *
 * The patterns are agent-agnostic: this module exports a regex over
 * the *command string* (not the wrapping tool name). The caller —
 * src/hooks/capture.ts in T5 — is responsible for extracting the
 * command from whatever shape the hook delivers (PostToolUse for
 * Claude Code, post-shell hook for Codex, etc.). That keeps the
 * pattern list one source of truth across agents.
 */

/**
 * Carrier for one detected event. The caller (capture.ts) merges this
 * with the agent identity + active-task context to build an
 * AppendEventInput.
 */
export interface ExtractedEvent {
  /** Stable pattern id — used for tests + future telemetry. */
  kind: string;
  /** Units of progress this event represents (positive integer). */
  value: number;
  /** Free-text describing what happened. Lands verbatim in event.note. */
  note: string;
}

export interface PatternDef {
  /** Stable id (e.g. "gh-pr-merge"). */
  id: string;
  /** Regex applied to the command string. */
  regex: RegExp;
  /** Build the event from a successful match. */
  build: (match: RegExpExecArray, command: string) => ExtractedEvent;
}

const NOTE_MAX_CHARS = 200;

/**
 * Truncate a free-text note to a sensible bound so a giant pasted
 * command doesn't blow up the event row size.
 */
function clampNote(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.length > NOTE_MAX_CHARS ? trimmed.slice(0, NOTE_MAX_CHARS) : trimmed;
}

export const PATTERNS: readonly PatternDef[] = Object.freeze([
  {
    id: "gh-pr-merge",
    // ^[whitespace]* gh [whitespace]+ pr [whitespace]+ merge \b
    //   (?! lookahead asserting --auto is NOT anywhere in the rest)
    //
    // Allows leading whitespace and PR-number / --merge /
    // --delete-branch arguments after `merge`. Explicitly REJECTS
    // `gh pr merge --auto` (and `gh pr merge 123 --auto`, etc.)
    // because `--auto` only enables auto-merge — GitHub CLI exits 0
    // even when the PR hasn't actually merged yet (it sits waiting
    // for required CI checks). Counting that as +1 KPI progress
    // inflates merge counts for PRs that may never merge. Codex
    // review pass 3 surfaced this.
    regex: /^\s*gh\s+pr\s+merge\b(?!.*\s--auto\b)/,
    build: (_m, command) => ({
      kind: "gh-pr-merge",
      value: 1,
      note: `gh pr merge: ${clampNote(command)}`,
    }),
  },
]);

/**
 * Test the allow-list against one command string. Returns an
 * ExtractedEvent on the FIRST match (patterns are checked in array
 * order), or null when nothing matches. Empty/whitespace-only commands
 * are never matched — the caller should not invoke this for hook events
 * that don't carry a real shell command.
 */
export function matchCommand(command: string): ExtractedEvent | null {
  if (!command || command.trim().length === 0) return null;
  for (const p of PATTERNS) {
    const m = p.regex.exec(command);
    if (m) return p.build(m, command);
  }
  return null;
}

/** Test helper — exposes the note cap for assertion without re-exporting the function. */
export const _NOTE_MAX_CHARS = NOTE_MAX_CHARS;
