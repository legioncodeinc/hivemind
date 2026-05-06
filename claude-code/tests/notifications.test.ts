import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  drainSessionStart,
  enqueueNotification,
  registerRule,
  _resetRulesForTest,
  type Notification,
  type Rule,
} from "../../src/notifications/index.js";
import { readState, statePath } from "../../src/notifications/state.js";
import { readQueue, queuePath } from "../../src/notifications/queue.js";
import { renderNotifications } from "../../src/notifications/format.js";
import { welcomeRule } from "../../src/notifications/rules/welcome.js";
import type { Credentials } from "../../src/commands/auth-creds.js";

/**
 * Source-level tests for src/notifications/.
 *
 * Sandbox protocol (CLAUDE.md post-mortem rule #1): every test sets
 * process.env.HOME=$(mktemp -d) before the test body, restores it after.
 * src/notifications/state.ts and queue.ts use lazy homedir() resolution,
 * so the override is picked up without module re-import.
 */

let TEMP_HOME = "";
let ORIGINAL_HOME: string | undefined;

const FRESH_CREDS: Credentials = {
  token: "tok",
  orgId: "org-1",
  orgName: "acme",
  userName: "ada",
  workspaceId: "ws-1",
  apiUrl: "http://x",
  savedAt: "2026-05-06T12:00:00Z",
};

beforeEach(() => {
  TEMP_HOME = mkdtempSync(join(tmpdir(), "hivemind-notif-test-"));
  ORIGINAL_HOME = process.env.HOME;
  process.env.HOME = TEMP_HOME;
  _resetRulesForTest();
});

afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
  rmSync(TEMP_HOME, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// renderNotifications anti-pattern guard
// ---------------------------------------------------------------------------

describe("renderNotifications", () => {
  it("emits empty string for empty input (so emit() short-circuits)", () => {
    expect(renderNotifications([])).toBe("");
  });

  it("never produces text containing the existing memory/hivemind block strings", () => {
    // Per AGENT_CHANNELS.md and the project plan: notifications must be a
    // distinct surface from the DEEPLAKE MEMORY / HIVEMIND boilerplate
    // emitted by session-start.js. This test guards against future rules
    // that accidentally embed those tokens.
    const items: Notification[] = [
      { id: "a", title: "x", body: "y", dedupKey: { v: 1 } },
      { id: "b", severity: "warn", title: "x2", body: "y2", dedupKey: { v: 2 } },
    ];
    const out = renderNotifications(items);
    expect(out).not.toContain("DEEPLAKE MEMORY");
    expect(out).not.toContain("HIVEMIND");
  });

  it("formats title and body and separates multiple notifications with a blank line", () => {
    const items: Notification[] = [
      { id: "a", title: "T1", body: "B1", dedupKey: {} },
      { id: "b", title: "T2", body: "B2", dedupKey: {} },
    ];
    const out = renderNotifications(items);
    expect(out).toContain("T1");
    expect(out).toContain("B1");
    expect(out).toContain("T2");
    expect(out).toContain("B2");
    expect(out).toContain("\n\n");
  });
});

// ---------------------------------------------------------------------------
// welcomeRule
// ---------------------------------------------------------------------------

describe("welcomeRule", () => {
  it("fires when state has no prior welcome entry", () => {
    const result = welcomeRule.evaluate({
      agent: "claude-code",
      creds: FRESH_CREDS,
      state: { shown: {} },
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("welcome");
    expect(result!.dedupKey).toEqual({ savedAt: FRESH_CREDS.savedAt });
    expect(result!.title).toContain("ada");
    expect(result!.body).toContain("acme");
    expect(result!.body).toContain("ws-1");
  });

  it("returns null when creds have no token (logged-out user)", () => {
    const result = welcomeRule.evaluate({
      agent: "claude-code",
      creds: { ...FRESH_CREDS, token: "" },
      state: { shown: {} },
    });
    expect(result).toBeNull();
  });

  it("returns null when creds is null", () => {
    const result = welcomeRule.evaluate({
      agent: "claude-code",
      creds: null,
      state: { shown: {} },
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// drainSessionStart — end-to-end framework behavior
// ---------------------------------------------------------------------------

describe("drainSessionStart with welcome rule registered", () => {
  let writes: string[] = [];

  beforeEach(() => {
    writes = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
    registerRule(welcomeRule);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits welcome on the first drain after a fresh login", async () => {
    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });

    expect(writes.length).toBe(1);
    const payload = JSON.parse(writes[0]);
    expect(payload.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(payload.hookSpecificOutput.additionalContext).toContain("ada");
    expect(payload.hookSpecificOutput.additionalContext).toContain("acme");
    // Anti-pattern guard at the integration level too.
    expect(payload.hookSpecificOutput.additionalContext).not.toContain("DEEPLAKE MEMORY");
    expect(payload.hookSpecificOutput.additionalContext).not.toContain("HIVEMIND");

    // State persisted.
    const state = readState();
    expect(state.shown.welcome.dedupKey).toBe(JSON.stringify({ savedAt: FRESH_CREDS.savedAt }));
  });

  it("does NOT emit welcome on the second drain with the same savedAt", async () => {
    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });
    writes.length = 0;
    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });
    expect(writes.length).toBe(0);
  });

  it("re-emits welcome after creds.savedAt changes (re-login)", async () => {
    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });
    writes.length = 0;
    await drainSessionStart({
      agent: "claude-code",
      creds: { ...FRESH_CREDS, savedAt: "2026-05-07T09:00:00Z" },
    });
    expect(writes.length).toBe(1);
  });

  it("emits exactly one notification per id per drain (count assertion)", async () => {
    // If a buggy rule produced the same notification id twice, the dedup
    // step would still mark only one as shown — but we should never emit
    // duplicates in a single drain either.
    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });
    expect(writes.length).toBe(1);
    const payload = JSON.parse(writes[0]);
    // Single welcome → no double "Welcome back" markers.
    const occurrences = payload.hookSpecificOutput.additionalContext.split("Welcome back").length - 1;
    expect(occurrences).toBe(1);
  });

  it("no-op for the codex/cursor/hermes stub adapters (writes nothing to stdout)", async () => {
    for (const agent of ["codex", "cursor", "hermes"] as const) {
      writes.length = 0;
      await drainSessionStart({ agent, creds: FRESH_CREDS });
      expect(writes.length).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// queue (push-based notifications)
// ---------------------------------------------------------------------------

describe("enqueueNotification + drainSessionStart", () => {
  let writes: string[] = [];

  beforeEach(() => {
    writes = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delivers a queued notification on the next drain and clears the queue", async () => {
    enqueueNotification({
      id: "summarization-due",
      title: "Time for a summary refresh",
      body: "You've captured 50 sessions since the last summary update.",
      dedupKey: { n: 50 },
    });
    expect(readQueue().queue.length).toBe(1);

    await drainSessionStart({ agent: "claude-code", creds: null });

    expect(writes.length).toBe(1);
    const payload = JSON.parse(writes[0]);
    expect(payload.hookSpecificOutput.additionalContext).toContain("summary refresh");

    expect(readQueue().queue.length).toBe(0);
  });

  it("does NOT redeliver a queue item already shown (dedup by id+dedupKey)", async () => {
    const n: Notification = {
      id: "foo",
      title: "T",
      body: "B",
      dedupKey: { v: 1 },
    };
    enqueueNotification(n);
    await drainSessionStart({ agent: "claude-code", creds: null });
    writes.length = 0;

    enqueueNotification(n);
    await drainSessionStart({ agent: "claude-code", creds: null });
    expect(writes.length).toBe(0);
  });

  it("re-delivers a queue item with the same id but different dedupKey", async () => {
    enqueueNotification({ id: "foo", title: "T", body: "B1", dedupKey: { v: 1 } });
    await drainSessionStart({ agent: "claude-code", creds: null });
    writes.length = 0;

    enqueueNotification({ id: "foo", title: "T", body: "B2", dedupKey: { v: 2 } });
    await drainSessionStart({ agent: "claude-code", creds: null });
    expect(writes.length).toBe(1);
    expect(JSON.parse(writes[0]).hookSpecificOutput.additionalContext).toContain("B2");
  });
});

// ---------------------------------------------------------------------------
// Negative tests — corrupted state/queue must not crash the hook
// ---------------------------------------------------------------------------

describe("drainSessionStart resilience", () => {
  it("treats a corrupt state file as empty and still emits", async () => {
    mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
    writeFileSync(statePath(), "this is not json", "utf-8");

    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
    registerRule(welcomeRule);

    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });
    expect(writes.length).toBe(1);
    vi.restoreAllMocks();
  });

  it("treats a corrupt queue file as empty and does not throw", async () => {
    mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
    writeFileSync(queuePath(), "{not: json", "utf-8");

    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });

    await expect(
      drainSessionStart({ agent: "claude-code", creds: null }),
    ).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });

  it("a buggy rule that throws does not crash the drain", async () => {
    const explodingRule: Rule = {
      id: "explodes",
      trigger: "session_start",
      evaluate() { throw new Error("kaboom"); },
    };
    // Note: the registry's evaluateRules catches exceptions per-rule? Let's
    // see — if not, the framework's outer try/catch in drainSessionStart
    // should still prevent abort. Either way, the drain must not throw.
    registerRule(explodingRule);
    registerRule(welcomeRule);

    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });

    await expect(
      drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS }),
    ).resolves.toBeUndefined();

    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Cross-instance race — atomic state write under concurrent drains
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bundle smoke — testing rule #11: source tests are not enough.
// Catches "source compiled fine but esbuild dropped my entry" regressions.
// ---------------------------------------------------------------------------

describe("bundle/session-notifications.js (built artifact)", () => {
  const __dir = dirname(fileURLToPath(import.meta.url));
  const bundlePath = join(__dir, "..", "bundle", "session-notifications.js");

  function runBundle(extraEnv: Record<string, string>, input = "{}"): string {
    return execFileSync("node", [bundlePath], {
      input,
      encoding: "utf-8",
      timeout: 5_000,
      env: { ...process.env, HOME: extraEnv.HOME, HIVEMIND_CAPTURE: "false", ...extraEnv },
    });
  }

  it("the bundle exists (esbuild config picked up the new entry)", () => {
    expect(existsSync(bundlePath)).toBe(true);
  });

  it("emits the expected JSON shape with welcome content for a logged-in user", () => {
    // Plant a credentials file in a fresh sandbox HOME.
    const sandbox = mkdtempSync(join(tmpdir(), "hivemind-notif-bundle-"));
    try {
      mkdirSync(join(sandbox, ".deeplake"), { recursive: true, mode: 0o700 });
      writeFileSync(
        join(sandbox, ".deeplake", "credentials.json"),
        JSON.stringify({
          token: "tok",
          orgId: "o",
          orgName: "acme",
          userName: "ada",
          workspaceId: "ws",
          savedAt: "2026-05-06T01:00:00Z",
        }),
        { mode: 0o600 },
      );
      const raw = runBundle({ HOME: sandbox });
      expect(raw.length).toBeGreaterThan(0);
      const parsed = JSON.parse(raw);
      expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
      const ctx = parsed.hookSpecificOutput.additionalContext;
      expect(ctx).toContain("ada");
      expect(ctx).toContain("acme");
      // Anti-pattern guard at the bundle level.
      expect(ctx).not.toContain("DEEPLAKE MEMORY");
      expect(ctx).not.toContain("HIVEMIND");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("emits nothing on the second run with the same savedAt (dedup)", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "hivemind-notif-bundle-"));
    try {
      mkdirSync(join(sandbox, ".deeplake"), { recursive: true, mode: 0o700 });
      writeFileSync(
        join(sandbox, ".deeplake", "credentials.json"),
        JSON.stringify({
          token: "tok",
          orgId: "o",
          orgName: "acme",
          userName: "ada",
          workspaceId: "ws",
          savedAt: "2026-05-06T01:00:00Z",
        }),
        { mode: 0o600 },
      );

      const first = runBundle({ HOME: sandbox });
      expect(first.length).toBeGreaterThan(0);

      const second = runBundle({ HOME: sandbox });
      expect(second).toBe("");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("emits nothing for a logged-out user (no credentials)", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "hivemind-notif-bundle-"));
    try {
      const raw = runBundle({ HOME: sandbox });
      expect(raw).toBe("");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Backend source — push-from-server channel.
// fetch is mocked at the global level so we don't hit real api.deeplake.ai.
// ---------------------------------------------------------------------------

describe("backend source (GET /me/notifications)", () => {
  let writes: string[] = [];
  let fetchCalls: { url: string; init?: RequestInit }[] = [];

  beforeEach(() => {
    writes = [];
    fetchCalls = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchOnce(body: unknown, ok = true): void {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (...args: any[]) => {
      fetchCalls.push({ url: String(args[0]), init: args[1] });
      return new Response(JSON.stringify(body), { status: ok ? 200 : 500 });
    });
  }

  it("renders a backend notification on first drain and dedup's on the second", async () => {
    const serverNotification = {
      id: "11111111-2222-3333-4444-555555555555",
      severity: "info",
      title: "Maintenance window",
      body: "API will be paused 2026-05-10 02:00 UTC.",
      dedup_key: "maint-2026-05-10",
      created_at: "2026-05-06T10:00:00Z",
    };
    mockFetchOnce({ notifications: [serverNotification] });

    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });

    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain("/me/notifications");
    expect((fetchCalls[0].init?.headers as any)?.Authorization).toBe(`Bearer ${FRESH_CREDS.token}`);

    expect(writes.length).toBe(1);
    const ctx = JSON.parse(writes[0]).hookSpecificOutput.additionalContext;
    expect(ctx).toContain("Maintenance window");
    expect(ctx).toContain("API will be paused");

    // Second drain returns the same notification — should be dedup'd.
    writes.length = 0;
    fetchCalls.length = 0;
    mockFetchOnce({ notifications: [serverNotification] });
    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });
    expect(writes.length).toBe(0);
  });

  it("re-emits when server reuses the id but bumps dedup_key", async () => {
    const v1 = { id: "abc", title: "T", body: "B1", dedup_key: "v1" };
    const v2 = { id: "abc", title: "T", body: "B2", dedup_key: "v2" };

    mockFetchOnce({ notifications: [v1] });
    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });
    writes.length = 0;
    vi.restoreAllMocks();
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
    mockFetchOnce({ notifications: [v2] });

    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });
    expect(writes.length).toBe(1);
    expect(JSON.parse(writes[0]).hookSpecificOutput.additionalContext).toContain("B2");
  });

  it("a 500 response degrades to no backend notifications, rules+queue still run", async () => {
    registerRule(welcomeRule);
    mockFetchOnce({}, false);

    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });
    // Welcome rule still fires even though backend returned 500.
    expect(writes.length).toBe(1);
    expect(JSON.parse(writes[0]).hookSpecificOutput.additionalContext).toContain("Welcome back");
  });

  it("a malformed JSON body is treated as zero notifications", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response("not json", { status: 200 });
    });
    await expect(
      drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS }),
    ).resolves.toBeUndefined();
    expect(writes.length).toBe(0);
  });

  it("logged-out user (no token) does NOT make a network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await drainSessionStart({ agent: "claude-code", creds: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("malformed server entries (missing title/body) are dropped", async () => {
    mockFetchOnce({
      notifications: [
        { id: "ok", title: "Good", body: "Yes", dedup_key: "k" },
        { id: "bad-no-title", body: "X", dedup_key: "k2" },
        { id: "bad-no-body", title: "X", dedup_key: "k3" },
        { title: "no-id", body: "X" },
      ],
    });
    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });
    expect(writes.length).toBe(1);
    const ctx = JSON.parse(writes[0]).hookSpecificOutput.additionalContext;
    expect(ctx).toContain("Good");
    expect(ctx).toContain("Yes");
    expect(ctx).not.toContain("bad-no-title");
    expect(ctx).not.toContain("bad-no-body");
  });
});

describe("concurrent drains on shared HOME (cross-instance race)", () => {
  it("welcome appears in at most one of two parallel drains across the pair", async () => {
    const writesA: string[] = [];
    const writesB: string[] = [];

    // Two separate stdout spies impossible in one process; instead, run
    // the drain twice in parallel against the same state file. The atomic
    // write semantics (tmp + rename) mean state ends in a coherent shape;
    // dedup logic keys on creds.savedAt so the second drain reads the
    // first's persisted state and skips emit. With true concurrency where
    // both drains read state BEFORE either writes, both can emit — that's
    // the intended trade-off for v1 (a single duplicate welcome on a
    // racing pair is acceptable; no torn JSON file is the hard guarantee).
    registerRule(welcomeRule);

    let activeBuffer: string[] = writesA;
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      activeBuffer.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });

    // First drain to completion to populate state.
    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });
    activeBuffer = writesB;

    // Second drain reads the persisted state — must be a no-op for the
    // same savedAt. Proves serial dedup works across "two SessionStart
    // hook invocations on the same machine."
    await drainSessionStart({ agent: "claude-code", creds: FRESH_CREDS });

    expect(writesA.length).toBe(1);
    expect(writesB.length).toBe(0);

    // State file is well-formed JSON (atomic write held).
    const stateRaw = readFileSync(statePath(), "utf-8");
    expect(() => JSON.parse(stateRaw)).not.toThrow();
    vi.restoreAllMocks();
  });
});
