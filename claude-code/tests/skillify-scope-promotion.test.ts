import { describe, expect, it } from "vitest";
import {
  isCrossAuthorMergeVerdict,
  resolveRecordScope,
} from "../../src/skillify/scope-promotion.js";

// These helpers back the cross-author auto-promote behavior from issue #118.
// The CodeRabbit review on PR #125 specifically caught a bug where a session
// running with `cfg.scope = "org"` (or "team") was being silently rewritten
// to "team" on every cross-author MERGE — a privacy downgrade, not a
// promotion. The tests below pin both directions: the helper widens
// `me -> team` and leaves `team` / `org` untouched.

describe("isCrossAuthorMergeVerdict", () => {
  it("returns true only when verdict=MERGE and the stored author differs from the editor", () => {
    expect(
      isCrossAuthorMergeVerdict({
        verdict: "MERGE",
        resultAuthor: "alice",
        userName: "bob",
      }),
    ).toBe(true);
  });

  it("returns false for KEEP regardless of author", () => {
    expect(
      isCrossAuthorMergeVerdict({
        verdict: "KEEP",
        resultAuthor: "alice",
        userName: "bob",
      }),
    ).toBe(false);
  });

  it("returns false when the editor IS the original author (same-author MERGE)", () => {
    expect(
      isCrossAuthorMergeVerdict({
        verdict: "MERGE",
        resultAuthor: "alice",
        userName: "alice",
      }),
    ).toBe(false);
  });

  it("returns false when the stored author is unknown (legacy local file, no frontmatter author)", () => {
    // Treating a missing author as "cross-author" would promote every
    // MERGE that touches a pre-#118 local skill — a footgun. Unknown
    // means "owned by whoever's about to edit", so stay same-author.
    expect(
      isCrossAuthorMergeVerdict({
        verdict: "MERGE",
        resultAuthor: undefined,
        userName: "alice",
      }),
    ).toBe(false);
  });

  it("returns false for SKIP (defensive — worker never calls recordToDeeplake on SKIP, but the contract is the same)", () => {
    expect(
      isCrossAuthorMergeVerdict({
        verdict: "SKIP",
        resultAuthor: "alice",
        userName: "bob",
      }),
    ).toBe(false);
  });
});

describe("resolveRecordScope", () => {
  it("promotes scope=me to team on cross-author MERGE", () => {
    expect(
      resolveRecordScope({ configScope: "me", isCrossAuthorMerge: true }),
    ).toBe("team");
  });

  it("leaves scope=me alone on same-author edits", () => {
    expect(
      resolveRecordScope({ configScope: "me", isCrossAuthorMerge: false }),
    ).toBe("me");
  });

  // The two cases below are the actual CodeRabbit-flagged regression:
  // a previous draft of the worker did `scope = isCrossAuthorMerge ? "team" : cfg.scope`,
  // which silently DOWNGRADED scope=org -> team on cross-author edits.

  it("does NOT downgrade scope=team on cross-author MERGE (already team-wide)", () => {
    expect(
      resolveRecordScope({ configScope: "team", isCrossAuthorMerge: true }),
    ).toBe("team");
  });

  it("does NOT downgrade scope=org on cross-author MERGE (privacy regression)", () => {
    // Before this fix, an org-scoped session that cross-author-MERGEd a
    // teammate's skill would rewrite the row's scope to "team", hiding
    // it from non-team org members. Confirm we keep the wider scope.
    expect(
      resolveRecordScope({ configScope: "org", isCrossAuthorMerge: true }),
    ).toBe("org");
  });

  it("is a no-op when not a cross-author MERGE, regardless of configScope", () => {
    expect(
      resolveRecordScope({ configScope: "me", isCrossAuthorMerge: false }),
    ).toBe("me");
    expect(
      resolveRecordScope({ configScope: "team", isCrossAuthorMerge: false }),
    ).toBe("team");
    expect(
      resolveRecordScope({ configScope: "org", isCrossAuthorMerge: false }),
    ).toBe("org");
  });
});
