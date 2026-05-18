import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock the org-stats source so primary-banner doesn't actually hit the
// network. Tests below set the resolved value per case.
const { orgStatsMock } = vi.hoisted(() => ({ orgStatsMock: vi.fn() }));
vi.mock("../../src/notifications/sources/org-stats.js", () => ({
  fetchOrgStats: orgStatsMock,
}));

import { pickPrimaryBanner, formatTokens } from "../../src/notifications/sources/primary-banner.js";
import { appendUsageRecord } from "../../src/notifications/usage-tracker.js";
import type { Credentials } from "../../src/commands/auth-creds.js";

let TEMP_HOME = "";
let ORIGINAL_HOME: string | undefined;

const FRESH_CREDS: Credentials = {
  token: "tok",
  orgId: "org-1",
  orgName: "acme",
  userName: "ada",
  workspaceId: "ws-1",
  apiUrl: "http://x",
  savedAt: "2026-05-18T00:00:00Z",
};

beforeEach(() => {
  TEMP_HOME = mkdtempSync(join(tmpdir(), "hivemind-primary-banner-test-"));
  ORIGINAL_HOME = process.env.HOME;
  process.env.HOME = TEMP_HOME;
  mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
  orgStatsMock.mockReset();
  // Default: server unreachable → primary-banner falls back to local jsonl.
  orgStatsMock.mockResolvedValue(null);
});

afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
  rmSync(TEMP_HOME, { recursive: true, force: true });
});

describe("pickPrimaryBanner — guard conditions", () => {
  it("returns null when sessionId is undefined", async () => {
    expect(await pickPrimaryBanner(undefined, FRESH_CREDS)).toBeNull();
  });

  it("returns null when creds is null (logged-out user)", async () => {
    expect(await pickPrimaryBanner("s-1", null)).toBeNull();
  });

  it("returns null when creds has no token", async () => {
    expect(await pickPrimaryBanner("s-1", { ...FRESH_CREDS, token: "" })).toBeNull();
  });
});

describe("pickPrimaryBanner — welcome (default when savings ≤ 1M)", () => {
  it("renders welcome with userName/orgName/workspace when org-stats null + no local data", async () => {
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n).not.toBeNull();
    expect(n!.id).toBe("welcome");
    expect(n!.title).toBe("Welcome back, ada");
    expect(n!.body).toBe("Connected to org acme (workspace ws-1).");
    expect(n!.dedupKey).toEqual({ session: "s-1" });
  });

  it("renders welcome when org-stats present but savings < 1M", async () => {
    // 5M bytes → Y = 1.25M tokens → Z = 0.7 × 1.25M = 0.875M tokens
    // → below the 1M threshold, so welcome wins
    orgStatsMock.mockResolvedValue({
      org:  { sessionsCount: 100, memoryRecallCount: 1000, memorySearchBytes: 5_000_000 },
      user: { sessionsCount: 10,  memoryRecallCount: 50,   memorySearchBytes: 500_000 },
    });
    const n = await pickPrimaryBanner("s-edge", FRESH_CREDS);
    expect(n!.id).toBe("welcome");
  });

  it("drops comma-clause when userName is missing", async () => {
    const n = await pickPrimaryBanner("s-1", { ...FRESH_CREDS, userName: undefined });
    expect(n!.title).toBe("Welcome back");
    expect(n!.title).not.toContain("there");
    expect(n!.title).not.toContain(",");
  });

  it("uses 'your organization' fallback when orgName is missing (no UUID leak)", async () => {
    const n = await pickPrimaryBanner("s-1", { ...FRESH_CREDS, orgName: undefined });
    expect(n!.body).toContain("your organization");
    expect(n!.body).not.toContain(FRESH_CREDS.orgId);
    expect(n!.body).not.toContain("undefined");
  });

  it("uses 'default' workspace when workspaceId is missing", async () => {
    const n = await pickPrimaryBanner("s-1", { ...FRESH_CREDS, workspaceId: undefined });
    expect(n!.body).toContain("workspace default");
  });

  it("dedupKey is session-scoped (refires on a new sessionId)", async () => {
    const a = await pickPrimaryBanner("s-A", FRESH_CREDS);
    const b = await pickPrimaryBanner("s-B", FRESH_CREDS);
    expect(a!.dedupKey).toEqual({ session: "s-A" });
    expect(b!.dedupKey).toEqual({ session: "s-B" });
    expect(a!.dedupKey).not.toEqual(b!.dedupKey);
  });
});

describe("pickPrimaryBanner — savings recap (when org savings > 1M)", () => {
  it("renders online savings recap when org tokens-saved > 1M", async () => {
    // 6M bytes → Y = 1.5M tokens → Z = 0.7 × 1.5M = 1.05M → above 1M threshold
    orgStatsMock.mockResolvedValue({
      org:  { sessionsCount: 187, memoryRecallCount: 42000, memorySearchBytes: 6_000_000 },
      user: { sessionsCount: 22,  memoryRecallCount: 25,   memorySearchBytes: 400_000 },
    });
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.id).toBe("savings-recap");
    expect(n!.title).toContain("your team");
    expect(n!.title).toContain("~1.1M tokens"); // 0.7 × 1.5M ≈ 1.05M → "1.1M"
    expect(n!.body).toContain("42,000 memory recalls");
    expect(n!.body).toContain("across 187 sessions");
    expect(n!.body).toContain("you contributed");
    expect(n!.dedupKey).toEqual({ session: "s-1" });
  });

  it("omits 'you contributed' segment when user bytes < 1k tokens (4k bytes)", async () => {
    orgStatsMock.mockResolvedValue({
      org:  { sessionsCount: 100, memoryRecallCount: 1000, memorySearchBytes: 6_000_000 },
      user: { sessionsCount: 1,  memoryRecallCount: 1,    memorySearchBytes: 100 }, // tiny
    });
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.body).not.toContain("you contributed");
  });

  it("includes 'you contributed' segment when user bytes >= 4k", async () => {
    orgStatsMock.mockResolvedValue({
      org:  { sessionsCount: 100, memoryRecallCount: 1000, memorySearchBytes: 6_000_000 },
      user: { sessionsCount: 1,  memoryRecallCount: 1,    memorySearchBytes: 4_000 },
    });
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.body).toContain("you contributed");
  });

  it("renders OFFLINE savings recap when org-stats is null but local jsonl > 1M tokens", async () => {
    // 6M local bytes → Z = 1.05M tokens → above threshold
    appendUsageRecord({
      endedAt: "2026-05-18T00:00:00Z",
      sessionId: "old-session",
      memorySearchBytes: 6_000_000,
      memorySearchCount: 200,
    });
    orgStatsMock.mockResolvedValue(null);
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.id).toBe("savings-recap");
    expect(n!.title).toContain("saved you ~"); // "you", not "your team"
    expect(n!.body).toContain("1 session");
    expect(n!.body).toContain("200 memory searches");
  });
});

describe("formatTokens", () => {
  it("0 / negative / non-finite → '0'", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(-5)).toBe("0");
    expect(formatTokens(NaN)).toBe("0");
  });
  it("sub-thousand → integer", () => {
    expect(formatTokens(999)).toBe("999");
  });
  it("thousands with one decimal up to 100k", () => {
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(99499)).toBe("99.5k");
  });
  it(">=100k → integer thousands without decimals", () => {
    expect(formatTokens(123456)).toBe("123k");
  });
  it("millions with one decimal", () => {
    expect(formatTokens(1500000)).toBe("1.5M");
  });
});
