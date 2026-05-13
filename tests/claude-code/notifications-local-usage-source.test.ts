import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fetchLocalUsageNotifications,
  formatTokens,
} from "../../src/notifications/sources/local-usage.js";
import {
  appendUsageRecord,
  type UsageRecord,
} from "../../src/notifications/usage-tracker.js";

let TEMP_HOME = "";
let ORIGINAL_HOME: string | undefined;

function rec(over: Partial<UsageRecord> = {}): UsageRecord {
  return {
    endedAt: "2026-05-13T12:00:00Z",
    sessionId: "s",
    memorySearchBytes: 6000,
    memorySearchCount: 3,
    ...over,
  };
}

beforeEach(() => {
  TEMP_HOME = mkdtempSync(join(tmpdir(), "hivemind-local-usage-test-"));
  ORIGINAL_HOME = process.env.HOME;
  process.env.HOME = TEMP_HOME;
});

afterEach(() => {
  if (ORIGINAL_HOME !== undefined) process.env.HOME = ORIGINAL_HOME;
  else delete process.env.HOME;
  rmSync(TEMP_HOME, { recursive: true, force: true });
});

describe("formatTokens", () => {
  it("returns '0' for non-positive or non-finite", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(-5)).toBe("0");
    expect(formatTokens(NaN)).toBe("0");
  });
  it("formats sub-thousand counts as integers", () => {
    expect(formatTokens(1)).toBe("1");
    expect(formatTokens(999)).toBe("999");
  });
  it("formats thousands with one decimal up to 100k", () => {
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(99499)).toBe("99.5k");
  });
  it("formats >=100k as integer thousands without decimals", () => {
    expect(formatTokens(123456)).toBe("123k");
  });
  it("formats millions with one decimal", () => {
    expect(formatTokens(1500000)).toBe("1.5M");
  });
});

describe("fetchLocalUsageNotifications — skip conditions", () => {
  it("returns [] when sessionId is undefined (no stable dedupKey)", () => {
    appendUsageRecord(rec({ memorySearchBytes: 5000 }));
    expect(fetchLocalUsageNotifications(undefined)).toEqual([]);
  });

  it("returns [] when no records exist", () => {
    expect(fetchLocalUsageNotifications("sess-abc")).toEqual([]);
  });

  it("returns [] when records exist but all have 0 memorySearchBytes", () => {
    appendUsageRecord(rec({ sessionId: "s-1", memorySearchBytes: 0, memorySearchCount: 0 }));
    appendUsageRecord(rec({ sessionId: "s-2", memorySearchBytes: 0, memorySearchCount: 0 }));
    expect(fetchLocalUsageNotifications("sess-abc")).toEqual([]);
  });

  it("never throws — corrupt stats file just yields no recap", () => {
    mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
    writeFileSync(join(TEMP_HOME, ".deeplake", "usage-stats.jsonl"), "{not-json}\n", "utf-8");
    expect(() => fetchLocalUsageNotifications("sess-abc")).not.toThrow();
    expect(fetchLocalUsageNotifications("sess-abc")).toEqual([]);
  });
});

describe("fetchLocalUsageNotifications — emits a notification", () => {
  it("renders the savings headline + supporting line with cumulative numbers", () => {
    // 3 sessions, total 12000 memorySearchBytes → Y = 3000 tokens →
    // Z = 0.7 × 3000 = 2100 tokens → "2.1k"
    appendUsageRecord(rec({ sessionId: "s-1", memorySearchBytes: 4000, memorySearchCount: 2 }));
    appendUsageRecord(rec({ sessionId: "s-2", memorySearchBytes: 4000, memorySearchCount: 5 }));
    appendUsageRecord(rec({ sessionId: "s-3", memorySearchBytes: 4000, memorySearchCount: 3 }));
    const out = fetchLocalUsageNotifications("sess-abc");
    expect(out).toHaveLength(1);
    const n = out[0];
    expect(n.id).toBe("local-usage:savings-recap");
    expect(n.severity).toBe("info");
    expect(n.title).toBe("Hivemind has saved you ~2.1k tokens");
    expect(n.body).toContain("3 sessions");
    expect(n.body).toContain("10 memory searches");
    expect(n.dedupKey).toEqual({ session: "sess-abc" });
  });

  it("singular phrasing for 1 session / 1 search", () => {
    appendUsageRecord(rec({ sessionId: "only", memorySearchBytes: 8000, memorySearchCount: 1 }));
    const out = fetchLocalUsageNotifications("sess-z");
    expect(out).toHaveLength(1);
    expect(out[0].body).toContain("1 session ·");
    expect(out[0].body).toContain("1 memory search");
  });

  it("dedupKey rotates between sessions so each session refires", () => {
    appendUsageRecord(rec({ sessionId: "any", memorySearchBytes: 4000, memorySearchCount: 1 }));
    appendUsageRecord(rec({ sessionId: "any", memorySearchBytes: 4000, memorySearchCount: 1 }));
    const a = fetchLocalUsageNotifications("session-A");
    const b = fetchLocalUsageNotifications("session-B");
    expect(a[0].dedupKey).toEqual({ session: "session-A" });
    expect(b[0].dedupKey).toEqual({ session: "session-B" });
    expect(a[0].dedupKey).not.toEqual(b[0].dedupKey);
  });

  it("anti-puffery: no $-figure, no unsupported percentages", () => {
    appendUsageRecord(rec({ memorySearchBytes: 5000 }));
    appendUsageRecord(rec({ memorySearchBytes: 5000 }));
    const out = fetchLocalUsageNotifications("sess-abc");
    const fullText = out[0].title + "\n" + out[0].body;
    expect(fullText).not.toMatch(/\$/);
    expect(fullText).not.toMatch(/\d+%\s*(off|cheaper|reduction|less|saved)/i);
  });
});

describe("fetchLocalUsageNotifications — skills-generated segment", () => {
  it("appends 'N skills generated' to body when skillify state has skills", () => {
    appendUsageRecord(rec({ sessionId: "s-1", memorySearchBytes: 4000, memorySearchCount: 2 }));
    appendUsageRecord(rec({ sessionId: "s-2", memorySearchBytes: 4000, memorySearchCount: 2 }));
    // Bootstrap skillify state with 3 skills across 2 projects.
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = path.join(TEMP_HOME, ".deeplake", "state", "skillify");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "projA.json"), JSON.stringify({ skillsGenerated: ["a", "b"] }), "utf-8");
    fs.writeFileSync(path.join(dir, "projB.json"), JSON.stringify({ skillsGenerated: ["c"] }), "utf-8");

    const out = fetchLocalUsageNotifications("sess-abc");
    expect(out).toHaveLength(1);
    expect(out[0].body).toContain("3 skills generated");
    // Order: sessions, memory searches, skills (last)
    expect(out[0].body).toMatch(/2 sessions · 4 memory searches · 3 skills generated$/);
  });

  it("singular 'skill generated' phrasing when only 1 was mined", () => {
    appendUsageRecord(rec({ sessionId: "s-1", memorySearchBytes: 4000, memorySearchCount: 1 }));
    appendUsageRecord(rec({ sessionId: "s-2", memorySearchBytes: 4000, memorySearchCount: 1 }));
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = path.join(TEMP_HOME, ".deeplake", "state", "skillify");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "projA.json"), JSON.stringify({ skillsGenerated: ["only-one"] }), "utf-8");

    const out = fetchLocalUsageNotifications("sess-abc");
    expect(out[0].body).toContain("1 skill generated");
    expect(out[0].body).not.toContain("1 skills generated");
  });

  it("OMITS the skills segment when skillify state is missing (avoid '0 skills' indictment)", () => {
    appendUsageRecord(rec({ sessionId: "s-1", memorySearchBytes: 4000, memorySearchCount: 2 }));
    appendUsageRecord(rec({ sessionId: "s-2", memorySearchBytes: 4000, memorySearchCount: 2 }));
    // No skillify state dir at all.
    const out = fetchLocalUsageNotifications("sess-abc");
    expect(out[0].body).not.toContain("skills generated");
    // Body still has the other two segments.
    expect(out[0].body).toContain("2 sessions");
    expect(out[0].body).toContain("4 memory searches");
  });

  it("OMITS the skills segment when skillify state exists but no skills mined yet", () => {
    appendUsageRecord(rec({ sessionId: "s-1", memorySearchBytes: 4000, memorySearchCount: 2 }));
    appendUsageRecord(rec({ sessionId: "s-2", memorySearchBytes: 4000, memorySearchCount: 2 }));
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = path.join(TEMP_HOME, ".deeplake", "state", "skillify");
    fs.mkdirSync(dir, { recursive: true });
    // Fresh project, counter has incremented but no skills mined yet.
    fs.writeFileSync(path.join(dir, "projA.json"), JSON.stringify({ counter: 5, skillsGenerated: [] }), "utf-8");

    const out = fetchLocalUsageNotifications("sess-abc");
    expect(out[0].body).not.toContain("skills generated");
  });
});
