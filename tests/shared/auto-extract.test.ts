import { describe, expect, it } from "vitest";
import {
  matchCommand,
  PATTERNS,
  _NOTE_MAX_CHARS,
} from "../../src/hooks/auto-extract-patterns.js";

/**
 * Tests for the v1 auto-extract allow-list. The whole point of having a
 * tiny allow-list (currently 1 pattern) is that every addition gets
 * paired true-positive + false-positive coverage HERE so a future
 * pattern can't sneak in without proving it doesn't blow up KPI counts.
 */

// ── allow-list shape ────────────────────────────────────────────────────────

describe("PATTERNS — allow-list shape (locks v1 contract)", () => {
  it("v1 ships exactly ONE pattern (gh-pr-merge)", () => {
    expect(PATTERNS).toHaveLength(1);
    expect(PATTERNS[0].id).toBe("gh-pr-merge");
  });

  it("every pattern has a unique id", () => {
    const ids = PATTERNS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── true positives ─────────────────────────────────────────────────────────

describe("matchCommand — gh pr merge true positives", () => {
  it("matches plain `gh pr merge`", () => {
    const out = matchCommand("gh pr merge");
    expect(out?.kind).toBe("gh-pr-merge");
    expect(out?.value).toBe(1);
    expect(out?.note).toContain("gh pr merge");
  });

  it("matches with leading whitespace", () => {
    expect(matchCommand("   gh pr merge")?.kind).toBe("gh-pr-merge");
  });

  it("matches with PR number argument", () => {
    expect(matchCommand("gh pr merge 123")?.kind).toBe("gh-pr-merge");
  });

  it("matches `gh pr merge --merge` and `--delete-branch` (real merges with options)", () => {
    expect(matchCommand("gh pr merge --merge")?.kind).toBe("gh-pr-merge");
    expect(matchCommand("gh pr merge --merge --delete-branch")?.kind).toBe("gh-pr-merge");
    expect(matchCommand("gh pr merge 42 --delete-branch")?.kind).toBe("gh-pr-merge");
    expect(matchCommand("gh pr merge --rebase")?.kind).toBe("gh-pr-merge");
    expect(matchCommand("gh pr merge --squash")?.kind).toBe("gh-pr-merge");
  });

  it("matches with extra whitespace between tokens", () => {
    expect(matchCommand("gh   pr   merge")?.kind).toBe("gh-pr-merge");
  });

  it("note captures the full command (for human inspection later)", () => {
    const cmd = "gh pr merge 456 --merge --delete-branch";
    expect(matchCommand(cmd)?.note).toBe(`gh pr merge: ${cmd}`);
  });

  it("note is clamped to NOTE_MAX_CHARS to bound row size", () => {
    const longTail = "x".repeat(_NOTE_MAX_CHARS + 100);
    const cmd = `gh pr merge ${longTail}`;
    const out = matchCommand(cmd);
    // Slice begins after "gh pr merge: " prefix — note body itself is capped.
    const noteBody = out!.note.replace(/^gh pr merge: /, "");
    expect(noteBody.length).toBeLessThanOrEqual(_NOTE_MAX_CHARS);
  });
});

// ── true negatives (false-positive prevention) ─────────────────────────────

describe("matchCommand — true negatives (false-positive prevention)", () => {
  it("does NOT match git push (the documented anti-target in the plan)", () => {
    expect(matchCommand("git push")).toBeNull();
    expect(matchCommand("git push origin main")).toBeNull();
    expect(matchCommand("git push --force")).toBeNull();
  });

  it("does NOT match gh pr view / list / create — only merge", () => {
    expect(matchCommand("gh pr view")).toBeNull();
    expect(matchCommand("gh pr list")).toBeNull();
    expect(matchCommand("gh pr create")).toBeNull();
    expect(matchCommand("gh pr checkout 42")).toBeNull();
  });

  it("does NOT match other shell commands", () => {
    expect(matchCommand("ls")).toBeNull();
    expect(matchCommand("npm test")).toBeNull();
    expect(matchCommand("docker ps")).toBeNull();
    expect(matchCommand("git commit -m 'gh pr merge later'")).toBeNull();
  });

  it("does NOT match the literal 'gh pr merge' embedded in a longer command", () => {
    // The pattern is anchored to ^ — a command that mentions the magic
    // string but isn't actually running it doesn't fire.
    expect(matchCommand("echo 'gh pr merge'")).toBeNull();
    expect(matchCommand("grep 'gh pr merge' file.md")).toBeNull();
    expect(matchCommand("git log --grep 'gh pr merge'")).toBeNull();
  });

  it("does NOT match 'ghpr merge' or 'gh prmerge' (token boundary check)", () => {
    expect(matchCommand("ghpr merge")).toBeNull();
    expect(matchCommand("gh prmerge")).toBeNull();
  });

  it("does NOT match `gh pr merge --auto` — codex pass 3 regression guard", () => {
    // --auto only enables auto-merge (GitHub CLI exits 0 even though
    // the PR hasn't actually merged yet — it's waiting for CI).
    // Counting that as +1 KPI progress would inflate merge counts for
    // PRs that may never merge. This pattern must be inert for
    // --auto in any position.
    expect(matchCommand("gh pr merge --auto")).toBeNull();
    expect(matchCommand("gh pr merge 123 --auto")).toBeNull();
    expect(matchCommand("gh pr merge --auto 123")).toBeNull();
    expect(matchCommand("gh pr merge --auto --delete-branch")).toBeNull();
    expect(matchCommand("gh pr merge 42 --merge --auto")).toBeNull();
  });

  it("returns null on empty / whitespace-only command", () => {
    expect(matchCommand("")).toBeNull();
    expect(matchCommand("   ")).toBeNull();
    expect(matchCommand("\n\t  ")).toBeNull();
  });

  it("returns null on null-ish input (defensive — capture.ts may pass empty)", () => {
    // matchCommand is typed string, but capture.ts could plausibly hand
    // it the empty string when extracting from a malformed hook input.
    expect(matchCommand("")).toBeNull();
  });
});
