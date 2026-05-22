/**
 * Unit tests for src/skillify/local-manifest.ts — shared manifest
 * read/write used by mine-local and the per-agent SessionStart hooks.
 */

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  countLocalManifestEntries,
  getLatestInsightEntry,
  readLocalManifest,
  writeLocalManifest,
  type LocalManifest,
  type LocalManifestEntry,
} from "../../src/skillify/local-manifest.js";

const TMP = mkdtempSync(join(tmpdir(), "local-manifest-test-"));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function manifestPath(name: string): string {
  return join(TMP, `${name}.json`);
}

function makeManifest(count: number): LocalManifest {
  return {
    created_at: "2026-05-13T00:00:00.000Z",
    entries: Array.from({ length: count }, (_, i) => ({
      skill_name: `skill-${i}`,
      canonical_path: `/home/x/.claude/skills/skill-${i}/SKILL.md`,
      symlinks: [],
      source_session_ids: [`sid-${i}`],
      source_session_paths: [`/x/sid-${i}.jsonl`],
      source_agent: "claude_code",
      gate_agent: "claude_code",
      created_at: "2026-05-13T00:00:00.000Z",
      uploaded: false,
    })),
  };
}

describe("countLocalManifestEntries", () => {
  it("returns 0 when the manifest doesn't exist", () => {
    expect(countLocalManifestEntries(manifestPath("nope"))).toBe(0);
  });

  it("returns 0 for an empty entries array", () => {
    const path = manifestPath("empty");
    writeLocalManifest(makeManifest(0), path);
    expect(countLocalManifestEntries(path)).toBe(0);
  });

  it("returns the entry count for a populated manifest", () => {
    const path = manifestPath("populated");
    writeLocalManifest(makeManifest(7), path);
    expect(countLocalManifestEntries(path)).toBe(7);
  });

  it("returns 0 for malformed JSON (treats it as missing)", () => {
    const path = manifestPath("malformed");
    writeFileSync(path, "{ not valid json");
    expect(countLocalManifestEntries(path)).toBe(0);
  });

  it("returns 0 when entries field is missing", () => {
    const path = manifestPath("no-entries-field");
    writeFileSync(path, JSON.stringify({ created_at: "2026-05-13T00:00:00.000Z" }));
    expect(countLocalManifestEntries(path)).toBe(0);
  });

  it("returns 0 when entries is not an array", () => {
    const path = manifestPath("entries-not-array");
    writeFileSync(path, JSON.stringify({ created_at: "x", entries: "oops" }));
    expect(countLocalManifestEntries(path)).toBe(0);
  });
});

describe("readLocalManifest", () => {
  it("round-trips a populated manifest through write + read", () => {
    const path = manifestPath("roundtrip");
    const original = makeManifest(3);
    writeLocalManifest(original, path);
    const read = readLocalManifest(path);
    expect(read).not.toBeNull();
    expect(read!.entries).toHaveLength(3);
    expect(read!.entries[0].skill_name).toBe("skill-0");
    expect(read!.created_at).toBe(original.created_at);
  });

  it("creates parent directories on write", () => {
    const nested = join(TMP, "a", "b", "c", "manifest.json");
    writeLocalManifest(makeManifest(1), nested);
    expect(readLocalManifest(nested)?.entries).toHaveLength(1);
  });

  it("round-trips the `insight` field on entries that carry one", () => {
    // Schema-extension guard: writing an entry with an `insight` string
    // must survive write → read. Without this, downstream callers
    // (SessionStart banner) get the entry but `.insight` comes back
    // undefined → silent fallback to count surface.
    const path = manifestPath("insight-roundtrip");
    const entry: LocalManifestEntry = {
      skill_name: "verify-before-done",
      canonical_path: "/x/SKILL.md",
      symlinks: [],
      source_session_ids: ["sid"],
      source_session_paths: ["/x/sid.jsonl"],
      source_agent: "claude_code",
      gate_agent: "claude_code",
      created_at: "2026-05-22T00:00:00.000Z",
      uploaded: false,
      insight: "You revisited 4 merged PRs in the last month because tests weren't run.",
    };
    writeLocalManifest({ created_at: "2026-05-22T00:00:00.000Z", entries: [entry] }, path);
    const read = readLocalManifest(path);
    expect(read!.entries[0].insight).toBe(entry.insight);
  });
});

describe("getLatestInsightEntry", () => {
  it("returns null when the manifest is missing", () => {
    expect(getLatestInsightEntry(manifestPath("nope-insight"))).toBeNull();
  });

  it("returns null when no entry carries an insight (legacy manifest)", () => {
    // Pre-insight manifest: every entry lacks `insight`. Accessor must
    // return null so the banner falls back to the count-only surface
    // instead of rendering an `undefined` interpolation.
    const path = manifestPath("legacy");
    writeLocalManifest(makeManifest(3), path);
    expect(getLatestInsightEntry(path)).toBeNull();
  });

  it("returns null when entries' insight strings are all empty / whitespace", () => {
    // Belt-and-suspenders: parseMultiVerdict already collapses empty
    // strings to undefined, but a hand-edited or future-format manifest
    // could still carry an empty insight. Accessor treats empty/whitespace
    // as "no insight" so the banner doesn't render a vacuous line.
    const path = manifestPath("empty-insights");
    const m = makeManifest(2);
    m.entries[0].insight = "";
    m.entries[1].insight = "   \t  ";
    writeLocalManifest(m, path);
    expect(getLatestInsightEntry(path)).toBeNull();
  });

  it("returns null when manifest exists but entries is not an array (malformed file)", () => {
    // Defensive branch: a hand-edited manifest could swap `entries` from
    // an array to a string/object. Accessor must coerce that to null
    // rather than throw inside the for...of loop.
    const path = manifestPath("entries-not-array-insight");
    writeFileSync(path, JSON.stringify({ created_at: "x", entries: "oops" }));
    expect(getLatestInsightEntry(path)).toBeNull();
  });

  it("skips null / non-object entries inside the array", () => {
    // Mirrors parseMultiVerdict's defensive `if (!e || typeof e !== "object")`
    // check — guards against a manifest where an entry was set to null,
    // a string, or otherwise non-object by hand or by a future
    // refactor accidentally pushing the wrong shape.
    const path = manifestPath("null-entries");
    writeFileSync(path, JSON.stringify({
      created_at: "x",
      entries: [
        null,
        "not an object",
        {
          skill_name: "good",
          canonical_path: "/x/SKILL.md",
          symlinks: [],
          source_session_ids: [],
          source_session_paths: [],
          source_agent: "claude_code",
          gate_agent: "claude_code",
          created_at: "2026-05-22T00:00:00.000Z",
          uploaded: false,
          insight: "Real insight.",
        },
      ],
    }));
    const latest = getLatestInsightEntry(path);
    expect(latest).not.toBeNull();
    expect(latest!.skill_name).toBe("good");
  });

  it("skips entries with non-string insight values", () => {
    // Belt-and-suspenders against a future schema where insight is
    // accidentally serialized as a number, array, or object.
    const path = manifestPath("non-string-insights");
    const m = makeManifest(0);
    m.entries.push({
      skill_name: "bad-insight-type",
      canonical_path: "/x/SKILL.md",
      symlinks: [],
      source_session_ids: [],
      source_session_paths: [],
      source_agent: "claude_code",
      gate_agent: "claude_code",
      created_at: "2026-05-22T00:00:00.000Z",
      uploaded: false,
      insight: 42 as unknown as string,
    });
    writeLocalManifest(m, path);
    expect(getLatestInsightEntry(path)).toBeNull();
  });

  it("skips entries with missing or unparseable `created_at`", () => {
    // Date.parse returns NaN for unparseable / missing strings. We
    // SKIP such entries rather than ordering them at -Infinity so a
    // single malformed row can't shadow valid ones — and entries with
    // a real timestamp win deterministically over those without.
    const path = manifestPath("missing-created-at");
    writeFileSync(path, JSON.stringify({
      created_at: "x",
      entries: [
        {
          skill_name: "no-date",
          canonical_path: "/x/A/SKILL.md",
          symlinks: [],
          source_session_ids: [],
          source_session_paths: [],
          source_agent: "claude_code",
          gate_agent: "claude_code",
          uploaded: false,
          insight: "Skipped — no parseable date.",
        },
        {
          skill_name: "unparseable-date",
          canonical_path: "/x/C/SKILL.md",
          symlinks: [],
          source_session_ids: [],
          source_session_paths: [],
          source_agent: "claude_code",
          gate_agent: "claude_code",
          created_at: "not-a-date",
          uploaded: false,
          insight: "Also skipped.",
        },
        {
          skill_name: "with-date",
          canonical_path: "/x/B/SKILL.md",
          symlinks: [],
          source_session_ids: [],
          source_session_paths: [],
          source_agent: "claude_code",
          gate_agent: "claude_code",
          created_at: "2026-05-22T00:00:00.000Z",
          uploaded: false,
          insight: "Picked.",
        },
      ],
    }));
    const latest = getLatestInsightEntry(path);
    expect(latest!.skill_name).toBe("with-date");
  });

  it("orders timezone-variant timestamps correctly via Date.parse, not lexical comparison", () => {
    // Coderabbit regression guard: raw-string comparison would order
    // "2026-05-21T23:59:00+00:00" AFTER "2026-05-22T00:00:00Z" because
    // '+' < 'Z' lexically. Date.parse normalizes both to the same
    // numeric instant, so the chronologically-later entry wins.
    const path = manifestPath("tz-variants");
    writeFileSync(path, JSON.stringify({
      created_at: "x",
      entries: [
        {
          skill_name: "older-tz-offset",
          canonical_path: "/x/A/SKILL.md",
          symlinks: [],
          source_session_ids: [],
          source_session_paths: [],
          source_agent: "claude_code",
          gate_agent: "claude_code",
          created_at: "2026-05-21T23:59:00+00:00",
          uploaded: false,
          insight: "Older instant.",
        },
        {
          skill_name: "newer-z-form",
          canonical_path: "/x/B/SKILL.md",
          symlinks: [],
          source_session_ids: [],
          source_session_paths: [],
          source_agent: "claude_code",
          gate_agent: "claude_code",
          created_at: "2026-05-22T00:00:00Z",
          uploaded: false,
          insight: "Newer instant.",
        },
      ],
    }));
    const latest = getLatestInsightEntry(path);
    expect(latest!.skill_name).toBe("newer-z-form");
  });

  it("picks the most recent insight-bearing entry across mixed entries", () => {
    // Mixed manifest: some entries have insight, some don't. We must
    // return the one with the highest created_at AMONG insight-bearing
    // entries — not the most recent overall (which might lack insight).
    const path = manifestPath("mixed");
    const m = makeManifest(0);
    m.entries.push({
      skill_name: "old-with-insight",
      canonical_path: "/x/old/SKILL.md",
      symlinks: [],
      source_session_ids: ["s1"],
      source_session_paths: ["/x/s1.jsonl"],
      source_agent: "claude_code",
      gate_agent: "claude_code",
      created_at: "2026-05-10T00:00:00.000Z",
      uploaded: false,
      insight: "Old insight.",
    });
    m.entries.push({
      skill_name: "newer-without-insight",
      canonical_path: "/x/new/SKILL.md",
      symlinks: [],
      source_session_ids: ["s2"],
      source_session_paths: ["/x/s2.jsonl"],
      source_agent: "claude_code",
      gate_agent: "claude_code",
      created_at: "2026-05-21T00:00:00.000Z",
      uploaded: false,
    });
    m.entries.push({
      skill_name: "newest-with-insight",
      canonical_path: "/x/newest/SKILL.md",
      symlinks: [],
      source_session_ids: ["s3"],
      source_session_paths: ["/x/s3.jsonl"],
      source_agent: "claude_code",
      gate_agent: "claude_code",
      created_at: "2026-05-22T00:00:00.000Z",
      uploaded: false,
      insight: "Newest insight.",
    });
    writeLocalManifest(m, path);
    const latest = getLatestInsightEntry(path);
    expect(latest).not.toBeNull();
    expect(latest!.skill_name).toBe("newest-with-insight");
    expect(latest!.insight).toBe("Newest insight.");
  });
});
