import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Tests for the low-balance warning path in DeeplakeApi.
 *
 * The backend sets the `X-Activeloop-Balance-Cents` response header on
 * every billable response (success and 402 alike). When the value is
 * below the threshold, hivemind enqueues a one-shot mid-session banner
 * pointing the user at the billing page — symmetrical with the
 * 402-driven balance-exhausted path, but the request itself still
 * succeeds.
 *
 * Pins:
 *  - Header below threshold on a SUCCESSFUL response → enqueues banner
 *  - Header above threshold → does NOT enqueue
 *  - Header absent → does NOT enqueue (compat with backends that don't yet emit it)
 *  - Process-local dedup: multiple requests with low balance enqueue once
 *  - Balance exactly at threshold → does NOT enqueue (boundary contract)
 *  - Zero balance suppressed → the 402 exhausted banner is louder and takes over
 */

const enqueueNotificationMock = vi.fn();
vi.mock("../../src/notifications/queue.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/notifications/queue.js")>(
    "../../src/notifications/queue.js",
  );
  return { ...actual, enqueueNotification: (...a: unknown[]) => enqueueNotificationMock(...a) };
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function okResp(balanceCents: number | null): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (balanceCents !== null) headers["X-Activeloop-Balance-Cents"] = String(balanceCents);
  return new Response(JSON.stringify({ columns: ["x"], rows: [[1]] }), { status: 200, headers });
}

let TEMP_HOME = "";
let ORIGINAL_HOME: string | undefined;

beforeEach(async () => {
  fetchMock.mockReset();
  enqueueNotificationMock.mockReset();
  enqueueNotificationMock.mockResolvedValue(undefined);
  const { _resetSdkStateForTesting } = await import("../../src/deeplake-api.js");
  _resetSdkStateForTesting();
  TEMP_HOME = mkdtempSync(join(tmpdir(), "hivemind-low-bal-test-"));
  ORIGINAL_HOME = process.env.HOME;
  process.env.HOME = TEMP_HOME;
  mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
  writeFileSync(
    join(TEMP_HOME, ".deeplake", "credentials.json"),
    JSON.stringify({
      token: "tok",
      orgId: "org-uuid",
      orgName: "acme",
      userName: "ada",
      workspaceId: "default",
      apiUrl: "https://api.example",
      savedAt: "2026-05-19T00:00:00Z",
    }),
    { mode: 0o600 },
  );
});

afterEach(() => {
  if (ORIGINAL_HOME !== undefined) process.env.HOME = ORIGINAL_HOME;
  else delete process.env.HOME;
  rmSync(TEMP_HOME, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function makeApi() {
  const { DeeplakeApi } = await import("../../src/deeplake-api.js");
  return new DeeplakeApi("tok", "https://api.example", "org", "ws", "memory");
}

describe("DeeplakeApi — X-Activeloop-Balance-Cents low-balance warning", () => {
  it("enqueues a mid-session banner when a successful response carries balance below threshold", async () => {
    fetchMock.mockResolvedValueOnce(okResp(150));
    const api = await makeApi();
    const rows = await api.query("SELECT 1");
    expect(rows).toEqual([{ x: 1 }]);

    expect(enqueueNotificationMock).toHaveBeenCalledTimes(1);
    const arg = enqueueNotificationMock.mock.calls[0][0];
    expect(arg.id).toBe("low-balance-warning");
    expect(arg.severity).toBe("warn");
    expect(arg.title).toMatch(/running low/i);
    expect(arg.body).toMatch(/\$1\.50/);
    expect(arg.body).toContain("https://deeplake.ai/acme/workspace/default/billing");
    expect(arg.dedupKey.reason).toBe("low-balance");
    expect(arg.transient).toBe(true);
  });

  it("does NOT enqueue when balance is at or above the threshold (boundary contract)", async () => {
    fetchMock.mockResolvedValueOnce(okResp(200)); // exactly threshold
    const api = await makeApi();
    await api.query("SELECT 1");
    expect(enqueueNotificationMock).not.toHaveBeenCalled();
  });

  it("does NOT enqueue when the X-Activeloop-Balance-Cents header is absent (older backend)", async () => {
    fetchMock.mockResolvedValueOnce(okResp(null));
    const api = await makeApi();
    await api.query("SELECT 1");
    expect(enqueueNotificationMock).not.toHaveBeenCalled();
  });

  it("process-local dedup: low-balance header on successive requests enqueues once", async () => {
    // A fresh Response per call — Body streams are single-use, so reusing
    // the same instance across three queries would error on the second
    // `resp.json()`.
    fetchMock.mockImplementation(() => Promise.resolve(okResp(120)));
    const api = await makeApi();
    await api.query("SELECT 1");
    await api.query("SELECT 2");
    await api.query("SELECT 3");
    expect(enqueueNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("suppresses the low-balance banner when balance is zero — the 402 exhausted banner takes over", async () => {
    // Zero-balance + 200 OK is a backend bug (the middleware would have
    // returned 402), but we explicitly suppress at the SDK level so the
    // soft-warning copy never claims '$0.00 remaining' alongside the
    // hard-block banner.
    fetchMock.mockResolvedValueOnce(okResp(0));
    const api = await makeApi();
    await api.query("SELECT 1");
    expect(enqueueNotificationMock).not.toHaveBeenCalled();
  });

  it("ignores a malformed balance header without throwing", async () => {
    const resp = new Response(JSON.stringify({ columns: ["x"], rows: [[1]] }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Activeloop-Balance-Cents": "not-a-number" },
    });
    fetchMock.mockResolvedValueOnce(resp);
    const api = await makeApi();
    await api.query("SELECT 1");
    expect(enqueueNotificationMock).not.toHaveBeenCalled();
  });

  it("rejects partially-numeric header values (strict parse, no spurious warning)", async () => {
    // Number.parseInt("150abc") would yield 150 and fire a false warning;
    // strict /^-?\d+$/ parsing must reject it.
    const resp = new Response(JSON.stringify({ columns: ["x"], rows: [[1]] }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Activeloop-Balance-Cents": "150abc" },
    });
    fetchMock.mockResolvedValueOnce(resp);
    const api = await makeApi();
    await api.query("SELECT 1");
    expect(enqueueNotificationMock).not.toHaveBeenCalled();
  });

  it("resets the dedup flag when enqueue fails, so a later request can retry the warning", async () => {
    // First low-balance response: enqueue rejects. The flag must reset so a
    // subsequent low-balance response re-attempts the enqueue rather than
    // silently suppressing warnings for the rest of the process.
    enqueueNotificationMock.mockRejectedValueOnce(new Error("queue write failed"));
    enqueueNotificationMock.mockResolvedValueOnce(undefined);
    fetchMock.mockImplementation(() => Promise.resolve(okResp(150)));
    const api = await makeApi();

    await api.query("SELECT 1");
    // Let the rejected enqueue's .catch run (resets the flag).
    await new Promise(resolve => setImmediate(resolve));
    await api.query("SELECT 2");

    expect(enqueueNotificationMock).toHaveBeenCalledTimes(2);
  });

  it("swallows enqueueNotification rejection — successful query still returns rows", async () => {
    enqueueNotificationMock.mockRejectedValueOnce(new Error("queue write failed"));
    fetchMock.mockResolvedValueOnce(okResp(150));
    const api = await makeApi();
    const rows = await api.query("SELECT 1");
    expect(rows).toEqual([{ x: 1 }]);
    await new Promise(resolve => setImmediate(resolve));
  });

  it("does NOT throw when the response has no headers object (minimal Response-like fake)", async () => {
    // Other suites (deeplake-api.test.ts) mock fetch with a bare
    // { ok, status, json, text } object — no `headers` getter. The
    // low-balance probe must treat that as 'no header present' and return,
    // never crash the query path. Regression guard for the optional-chain
    // on resp.headers?.get — removing it reintroduces a TypeError that
    // fails 69 unrelated tests.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ columns: ["x"], rows: [[1]] }),
      text: async () => "",
    });
    const api = await makeApi();
    const rows = await api.query("SELECT 1");
    expect(rows).toEqual([{ x: 1 }]);
    expect(enqueueNotificationMock).not.toHaveBeenCalled();
  });
});
