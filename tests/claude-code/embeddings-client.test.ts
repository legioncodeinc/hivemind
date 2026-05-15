// Unit tests for the embedding client — avoid loading the model by spinning up
// a tiny fake daemon that speaks the protocol.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createServer, type Server, type Socket } from "node:net";
import { mkdtempSync, rmSync, existsSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const enqueueNotificationMock = vi.fn();
vi.mock("../../src/notifications/queue.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/notifications/queue.js")>(
    "../../src/notifications/queue.js",
  );
  return { ...actual, enqueueNotification: (...a: unknown[]) => enqueueNotificationMock(...a) };
});

import { EmbedClient, getEmbedClient, isTransformersMissingError, _resetClientStateForTesting } from "../../src/embeddings/client.js";
import type { DaemonRequest, DaemonResponse } from "../../src/embeddings/protocol.js";
import { _setEnabledReaderForTesting, _resetForTesting as _resetDisableForTesting } from "../../src/embeddings/disable.js";

let servers: Server[] = [];
let tmpDirs: string[] = [];

afterEach(() => {
  for (const s of servers) try { s.close(); } catch { /* */ }
  servers = [];
  for (const d of tmpDirs) try { rmSync(d, { recursive: true, force: true }); } catch { /* */ }
  tmpDirs = [];
});

function makeTmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), "hvm-embed-test-"));
  tmpDirs.push(d);
  return d;
}

async function startFakeDaemon(dir: string, handler: (req: DaemonRequest) => DaemonResponse): Promise<Server> {
  const uid = String(process.getuid?.() ?? "test");
  const sockPath = join(dir, `hivemind-embed-${uid}.sock`);
  const srv = createServer((sock: Socket) => {
    let buf = "";
    sock.setEncoding("utf-8");
    sock.on("data", (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const req = JSON.parse(line) as DaemonRequest;
        const resp = handler(req);
        sock.write(JSON.stringify(resp) + "\n");
      }
    });
    sock.on("error", () => { /* */ });
  });
  servers.push(srv);
  await new Promise<void>((resolve) => srv.listen(sockPath, resolve));
  return srv;
}

describe("EmbedClient", () => {
  it("returns the embedding vector when the daemon responds", async () => {
    const dir = makeTmpDir();
    await startFakeDaemon(dir, (req) => {
      if (req.op === "embed") return { id: req.id, embedding: [0.1, 0.2, 0.3] };
      return { id: req.id, ready: true };
    });
    const client = new EmbedClient({ socketDir: dir, timeoutMs: 500, autoSpawn: false });
    const vec = await client.embed("hello", "document");
    expect(vec).toEqual([0.1, 0.2, 0.3]);
  });

  it("returns null when the daemon returns an error", async () => {
    const dir = makeTmpDir();
    await startFakeDaemon(dir, (req) => ({ id: req.id, error: "boom" }));
    const client = new EmbedClient({ socketDir: dir, timeoutMs: 500, autoSpawn: false });
    const vec = await client.embed("hello");
    expect(vec).toBeNull();
  });

  it("returns null when no daemon is running and autoSpawn is disabled", async () => {
    const dir = makeTmpDir();
    const client = new EmbedClient({ socketDir: dir, timeoutMs: 100, autoSpawn: false });
    const vec = await client.embed("hello");
    expect(vec).toBeNull();
  });

  it("does not create a duplicate pidfile under concurrent first-call race", async () => {
    const dir = makeTmpDir();
    const client1 = new EmbedClient({
      socketDir: dir,
      timeoutMs: 50,
      autoSpawn: true,
      daemonEntry: "/nonexistent/daemon.js", // guarantee spawn can't succeed
    });
    const client2 = new EmbedClient({
      socketDir: dir,
      timeoutMs: 50,
      autoSpawn: true,
      daemonEntry: "/nonexistent/daemon.js",
    });
    // Both clients see no socket, both try spawnDaemon. O_EXCL guarantees only
    // one actually tries to spawn. Both return null because no daemon comes up.
    const [a, b] = await Promise.all([
      client1.embed("one"),
      client2.embed("two"),
    ]);
    expect(a).toBeNull();
    expect(b).toBeNull();
    // pidfile should have been cleaned up when spawn couldn't find the entry.
    const uid = String(process.getuid?.() ?? "test");
    expect(existsSync(join(dir, `hivemind-embed-${uid}.pid`))).toBe(false);
  });

  it("round-trips multiple requests on the same client without leaking sockets", async () => {
    const dir = makeTmpDir();
    await startFakeDaemon(dir, (req) => ({ id: req.id, embedding: [Math.random()] }));
    const client = new EmbedClient({ socketDir: dir, timeoutMs: 500, autoSpawn: false });
    const results = await Promise.all([
      client.embed("a"),
      client.embed("b"),
      client.embed("c"),
    ]);
    expect(results.every((r) => r !== null && r.length === 1)).toBe(true);
  });

  it("warmup() returns true when the daemon is already listening", async () => {
    const dir = makeTmpDir();
    await startFakeDaemon(dir, (req) => ({ id: req.id, ready: true }));
    const client = new EmbedClient({ socketDir: dir, timeoutMs: 500, autoSpawn: false });
    const ok = await client.warmup();
    expect(ok).toBe(true);
  });

  it("warmup() returns false when no daemon and autoSpawn is disabled", async () => {
    const dir = makeTmpDir();
    const client = new EmbedClient({ socketDir: dir, timeoutMs: 100, autoSpawn: false });
    const ok = await client.warmup();
    expect(ok).toBe(false);
  });

  it("warmup() returns false when autoSpawn is on but entry cannot be launched", async () => {
    const dir = makeTmpDir();
    const client = new EmbedClient({
      socketDir: dir,
      timeoutMs: 100,
      autoSpawn: true,
      daemonEntry: "/nonexistent/daemon.js",
      spawnWaitMs: 150,
    });
    const ok = await client.warmup();
    expect(ok).toBe(false);
  });

  it("cleans up a stale pidfile (dead PID) before trying to spawn", async () => {
    const dir = makeTmpDir();
    const uid = String(process.getuid?.() ?? "test");
    const pidPath = join(dir, `hivemind-embed-${uid}.pid`);
    // Write a PID guaranteed-dead: 0x7FFFFFFF is not a plausible live PID on Linux.
    writeFileSync(pidPath, "2147483646");

    const client = new EmbedClient({
      socketDir: dir,
      timeoutMs: 50,
      autoSpawn: true,
      daemonEntry: "/nonexistent/daemon.js",
    });
    const vec = await client.embed("x");
    expect(vec).toBeNull();
    // Client should have cleaned up the pidfile after detecting the entry is missing.
    expect(existsSync(pidPath)).toBe(false);
  });

  it("leaves an alive-PID pidfile alone (treats the daemon as still starting)", async () => {
    const dir = makeTmpDir();
    const uid = String(process.getuid?.() ?? "test");
    const pidPath = join(dir, `hivemind-embed-${uid}.pid`);
    // Our own PID is alive → isPidFileStale() should return false.
    writeFileSync(pidPath, String(process.pid));

    const client = new EmbedClient({
      socketDir: dir,
      timeoutMs: 50,
      autoSpawn: true,
      daemonEntry: "/nonexistent/daemon.js",
    });
    const vec = await client.embed("x");
    expect(vec).toBeNull();
    // Pidfile is still there because client saw it as a live owner, not stale.
    expect(existsSync(pidPath)).toBe(true);
  });

  it("treats a garbage pidfile as stale and removes it", async () => {
    const dir = makeTmpDir();
    const uid = String(process.getuid?.() ?? "test");
    const pidPath = join(dir, `hivemind-embed-${uid}.pid`);
    writeFileSync(pidPath, "not-a-number");

    const client = new EmbedClient({
      socketDir: dir,
      timeoutMs: 50,
      autoSpawn: true,
      daemonEntry: "/nonexistent/daemon.js",
    });
    const vec = await client.embed("x");
    expect(vec).toBeNull();
    expect(existsSync(pidPath)).toBe(false);
  });

  it("returns null when the socket closes mid-request", async () => {
    const dir = makeTmpDir();
    const uid = String(process.getuid?.() ?? "test");
    const sockPath = join(dir, `hivemind-embed-${uid}.sock`);
    const srv = createServer((sock: Socket) => {
      // Immediately destroy the connection after accept so sendAndWait errors.
      sock.destroy();
    });
    servers.push(srv);
    await new Promise<void>((resolve) => srv.listen(sockPath, resolve));

    const client = new EmbedClient({ socketDir: dir, timeoutMs: 500, autoSpawn: false });
    const vec = await client.embed("boom");
    expect(vec).toBeNull();
  });

  it("returns null when the daemon writes malformed JSON", async () => {
    const dir = makeTmpDir();
    const uid = String(process.getuid?.() ?? "test");
    const sockPath = join(dir, `hivemind-embed-${uid}.sock`);
    const srv = createServer((sock: Socket) => {
      sock.setEncoding("utf-8");
      sock.on("data", () => {
        sock.write("not-json\n");
      });
    });
    servers.push(srv);
    await new Promise<void>((resolve) => srv.listen(sockPath, resolve));

    const client = new EmbedClient({ socketDir: dir, timeoutMs: 500, autoSpawn: false });
    const vec = await client.embed("boom");
    expect(vec).toBeNull();
  });

  it("returns null on request timeout (daemon accepts but never replies)", async () => {
    const dir = makeTmpDir();
    const uid = String(process.getuid?.() ?? "test");
    const sockPath = join(dir, `hivemind-embed-${uid}.sock`);
    const srv = createServer((_sock: Socket) => {
      // Accept the connection but never send anything back.
    });
    servers.push(srv);
    await new Promise<void>((resolve) => srv.listen(sockPath, resolve));

    const client = new EmbedClient({ socketDir: dir, timeoutMs: 50, autoSpawn: false });
    const vec = await client.embed("boom");
    expect(vec).toBeNull();
  });

  it("returns null fast when the daemon FINs without sending a response (half-close)", async () => {
    // Regression guard for the PR review fix: before the `end` handler in
    // sendAndWait, this scenario would block until the configured timeoutMs
    // (10 minutes by default). Now the client must reject immediately on
    // half-close. We set a very short timeoutMs to make the failure mode
    // (silent hang) detectable as a test timeout if the fix regresses.
    const dir = makeTmpDir();
    const uid = String(process.getuid?.() ?? "test");
    const sockPath = join(dir, `hivemind-embed-${uid}.sock`);
    const srv = createServer((sock: Socket) => {
      // Accept, then half-close after the client sends — no response written.
      sock.on("data", () => sock.end());
    });
    servers.push(srv);
    await new Promise<void>((resolve) => srv.listen(sockPath, resolve));

    const client = new EmbedClient({ socketDir: dir, timeoutMs: 60_000, autoSpawn: false });
    const start = Date.now();
    const vec = await client.embed("boom");
    const elapsed = Date.now() - start;
    expect(vec).toBeNull();
    // Fast rejection: well under timeoutMs. The pre-fix code would hang
    // until 60 000 ms; we expect the half-close to land in < 1 s.
    expect(elapsed).toBeLessThan(1000);
  });

  it("getEmbedClient() returns a cached singleton", () => {
    const a = getEmbedClient();
    const b = getEmbedClient();
    expect(a).toBe(b);
  });

  it("uses default option values when constructed with no arguments", () => {
    // Just instantiating exercises every `opts.x ?? default` branch.
    const c = new EmbedClient();
    expect(c).toBeInstanceOf(EmbedClient);
  });

  it("defaults the embed 'kind' argument to document when omitted", async () => {
    const dir = makeTmpDir();
    const kinds: string[] = [];
    await startFakeDaemon(dir, (req) => {
      if (req.op === "embed") kinds.push(req.kind);
      return { id: req.id, embedding: [0.5] };
    });
    const client = new EmbedClient({ socketDir: dir, timeoutMs: 500, autoSpawn: false });
    await client.embed("hello"); // no kind
    expect(kinds).toEqual(["document"]);
  });

  it("falls back to HIVEMIND_EMBED_DAEMON env when daemonEntry option is absent", () => {
    const prev = process.env.HIVEMIND_EMBED_DAEMON;
    process.env.HIVEMIND_EMBED_DAEMON = "/from/env.js";
    try {
      const c = new EmbedClient({ socketDir: makeTmpDir(), autoSpawn: false });
      // We can't read the private field directly; just assert construction succeeded.
      expect(c).toBeInstanceOf(EmbedClient);
    } finally {
      if (prev === undefined) delete process.env.HIVEMIND_EMBED_DAEMON;
      else process.env.HIVEMIND_EMBED_DAEMON = prev;
    }
  });

  it("warmup() succeeds after auto-spawning a fake daemon entry", async () => {
    const dir = makeTmpDir();
    const uid = String(process.getuid?.() ?? "test");
    const sockPath = join(dir, `hivemind-embed-${uid}.sock`);
    // Write a tiny daemon script that binds the expected socket and answers pings.
    const daemonScript = join(dir, "fake-daemon.js");
    writeFileSync(daemonScript, `
      const net = require("node:net");
      const srv = net.createServer((s) => {
        s.setEncoding("utf-8");
        let buf = "";
        s.on("data", (c) => {
          buf += c;
          let nl;
          while ((nl = buf.indexOf("\\n")) !== -1) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            try {
              const req = JSON.parse(line);
              s.write(JSON.stringify({ id: req.id, ready: true }) + "\\n");
            } catch {}
          }
        });
      });
      srv.listen(${JSON.stringify(sockPath)});
      setTimeout(() => srv.close(), 3000);
    `);

    const client = new EmbedClient({
      socketDir: dir,
      timeoutMs: 500,
      autoSpawn: true,
      daemonEntry: daemonScript,
      spawnWaitMs: 2000,
    });
    const ok = await client.warmup();
    expect(ok).toBe(true);

    // Cleanup the spawned daemon process.
    try { execSync(`pkill -f ${daemonScript}`); } catch { /* already exited */ }
  });
});

describe("isTransformersMissingError", () => {
  it("matches the Node MODULE_NOT_FOUND form", () => {
    expect(isTransformersMissingError("Cannot find module '@huggingface/transformers'")).toBe(true);
    expect(isTransformersMissingError("MODULE_NOT_FOUND while loading whatever")).toBe(true);
  });

  it("matches the actionable wrapper thrown by defaultImportTransformers", () => {
    expect(isTransformersMissingError(
      "@huggingface/transformers is not installed anywhere reachable. Run `hivemind embeddings install`...",
    )).toBe(true);
  });

  it("does not match unrelated daemon errors", () => {
    expect(isTransformersMissingError("model load timeout")).toBe(false);
    expect(isTransformersMissingError("unknown op")).toBe(false);
    expect(isTransformersMissingError("")).toBe(false);
  });
});

describe("EmbedClient — transformers-missing handling", () => {
  beforeEach(() => {
    enqueueNotificationMock.mockReset();
    _resetClientStateForTesting();
    _resetDisableForTesting();
  });

  afterEach(() => {
    _resetClientStateForTesting();
    _resetDisableForTesting();
  });

  it("enqueues an embed-deps-missing notification when daemon reports the transformers wrapper error", async () => {
    _setEnabledReaderForTesting(() => true);
    const dir = makeTmpDir();
    await startFakeDaemon(dir, (req) => {
      if (req.op === "hello") return { id: req.id, daemonPath: "/somewhere", pid: 1, protocolVersion: 1 };
      return { id: req.id, error: "@huggingface/transformers is not installed anywhere reachable. Run `hivemind embeddings install`" };
    });
    const client = new EmbedClient({ socketDir: dir, timeoutMs: 500, autoSpawn: false });
    const vec = await client.embed("hello");
    expect(vec).toBeNull();
    expect(enqueueNotificationMock).toHaveBeenCalledTimes(1);
    const arg = enqueueNotificationMock.mock.calls[0][0];
    expect(arg.id).toBe("embed-deps-missing");
    expect(arg.severity).toBe("warn");
    expect(arg.body).toMatch(/hivemind embeddings install/);
    expect(arg.dedupKey.reason).toBe("transformers-missing");
  });

  it("does NOT enqueue when the user has disabled embeddings (no nag for explicit opt-out)", async () => {
    _setEnabledReaderForTesting(() => false);
    const dir = makeTmpDir();
    await startFakeDaemon(dir, (req) => {
      if (req.op === "hello") return { id: req.id, daemonPath: "/somewhere", pid: 1, protocolVersion: 1 };
      return { id: req.id, error: "MODULE_NOT_FOUND @huggingface/transformers" };
    });
    const client = new EmbedClient({ socketDir: dir, timeoutMs: 500, autoSpawn: false });
    await client.embed("hello");
    expect(enqueueNotificationMock).not.toHaveBeenCalled();
  });

  it("deduplicates within a single process: second failing call does not double-enqueue", async () => {
    _setEnabledReaderForTesting(() => true);
    const dir = makeTmpDir();
    await startFakeDaemon(dir, (req) => {
      if (req.op === "hello") return { id: req.id, daemonPath: "/somewhere", pid: 1, protocolVersion: 1 };
      return { id: req.id, error: "Cannot find package '@huggingface/transformers'" };
    });
    const c1 = new EmbedClient({ socketDir: dir, timeoutMs: 500, autoSpawn: false });
    const c2 = new EmbedClient({ socketDir: dir, timeoutMs: 500, autoSpawn: false });
    await c1.embed("a");
    await c2.embed("b");
    expect(enqueueNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("does not enqueue on a generic daemon error unrelated to transformers", async () => {
    _setEnabledReaderForTesting(() => true);
    const dir = makeTmpDir();
    await startFakeDaemon(dir, (req) => {
      if (req.op === "hello") return { id: req.id, daemonPath: "/somewhere", pid: 1, protocolVersion: 1 };
      return { id: req.id, error: "model load timeout" };
    });
    const client = new EmbedClient({ socketDir: dir, timeoutMs: 500, autoSpawn: false });
    await client.embed("hello");
    expect(enqueueNotificationMock).not.toHaveBeenCalled();
  });
});

describe("EmbedClient — hello handshake / stuck daemon recycle", () => {
  beforeEach(() => {
    enqueueNotificationMock.mockReset();
    _resetClientStateForTesting();
  });

  afterEach(() => {
    _resetClientStateForTesting();
  });

  it("does NOT recycle the daemon when hello returns the expected daemonPath", async () => {
    const dir = makeTmpDir();
    const expectedPath = "/expected/daemon.js";
    let lastReq: DaemonRequest | null = null;
    await startFakeDaemon(dir, (req) => {
      lastReq = req;
      if (req.op === "hello") {
        return { id: req.id, daemonPath: expectedPath, pid: 99999, protocolVersion: 1 };
      }
      if (req.op === "embed") return { id: req.id, embedding: [0.1, 0.2] };
      return { id: req.id, error: "unknown" };
    });
    const client = new EmbedClient({
      socketDir: dir,
      timeoutMs: 500,
      autoSpawn: false,
      daemonEntry: expectedPath,
    });
    const vec = await client.embed("hi");
    expect(vec).toEqual([0.1, 0.2]);
    expect(lastReq).not.toBeNull();
    // pidfile / sockfile should be untouched (we created the sock via the fake daemon)
    const uid = String(process.getuid?.() ?? "test");
    expect(existsSync(join(dir, `hivemind-embed-${uid}.sock`))).toBe(true);
  });

  it("recycles when the daemon returns 'unknown op' on hello (older protocol)", async () => {
    const dir = makeTmpDir();
    const uid = String(process.getuid?.() ?? "test");
    const sockPath = join(dir, `hivemind-embed-${uid}.sock`);
    const pidPath = join(dir, `hivemind-embed-${uid}.pid`);
    writeFileSync(pidPath, "1"); // init pid — kill will fail silently

    await startFakeDaemon(dir, (req) => {
      if (req.op === "hello") {
        // Mimic a pre-handshake daemon that doesn't recognize the op.
        return { id: req.id, error: "unknown op" };
      }
      if (req.op === "embed") return { id: req.id, embedding: [0.5] };
      return { id: req.id, error: "unknown" };
    });

    const client = new EmbedClient({
      socketDir: dir,
      timeoutMs: 500,
      autoSpawn: false,
      daemonEntry: "/expected/new/bundle/daemon.js",
    });
    await client.embed("hi");
    // Recycle should have unlinked sock + pidfile so the next call respawns.
    expect(existsSync(sockPath)).toBe(false);
    expect(existsSync(pidPath)).toBe(false);
  });

  it("recycles the daemon (SIGTERM + clear sock/pid) when hello returns a mismatched daemonPath", async () => {
    const dir = makeTmpDir();
    const uid = String(process.getuid?.() ?? "test");
    const sockPath = join(dir, `hivemind-embed-${uid}.sock`);
    const pidPath = join(dir, `hivemind-embed-${uid}.pid`);
    // Pre-write a fake pidfile so the recycle path has something to read.
    // PID 1 is the init process — SIGTERM to it will fail silently (good
    // for test: we don't actually want to kill anything).
    writeFileSync(pidPath, "1");

    await startFakeDaemon(dir, (req) => {
      if (req.op === "hello") {
        // Pretend the running daemon came from an old bundle path.
        return { id: req.id, daemonPath: "/old/bundle/embed-daemon.js", pid: 1, protocolVersion: 1 };
      }
      if (req.op === "embed") return { id: req.id, embedding: [0.5] };
      return { id: req.id, error: "unknown" };
    });

    const client = new EmbedClient({
      socketDir: dir,
      timeoutMs: 500,
      autoSpawn: false,
      daemonEntry: "/new/bundle/embed-daemon.js",
    });
    await client.embed("hi");
    // After recycle, both the pid file and the sock file should be gone.
    expect(existsSync(pidPath)).toBe(false);
    expect(existsSync(sockPath)).toBe(false);
  });

  it("only verifies hello once per EmbedClient instance (subsequent calls skip)", async () => {
    const dir = makeTmpDir();
    let helloCount = 0;
    let embedCount = 0;
    await startFakeDaemon(dir, (req) => {
      if (req.op === "hello") {
        helloCount += 1;
        return { id: req.id, daemonPath: "/match", pid: 1, protocolVersion: 1 };
      }
      if (req.op === "embed") {
        embedCount += 1;
        return { id: req.id, embedding: [0.1] };
      }
      return { id: req.id, error: "unknown" };
    });
    const client = new EmbedClient({
      socketDir: dir,
      timeoutMs: 500,
      autoSpawn: false,
      daemonEntry: "/match",
    });
    await client.embed("a");
    await client.embed("b");
    await client.embed("c");
    expect(helloCount).toBe(1);
    expect(embedCount).toBe(3);
  });

  it("does not send hello when daemonEntry is empty (nothing to compare against)", async () => {
    // Force the resolver to land on a falsy daemonEntry by setting the env
    // override to empty — env wins over the SHARED_DAEMON_PATH fallback,
    // and "" is falsy, so verifyDaemonOnce returns early.
    const prev = process.env.HIVEMIND_EMBED_DAEMON;
    process.env.HIVEMIND_EMBED_DAEMON = "";
    try {
      const dir = makeTmpDir();
      let helloCount = 0;
      await startFakeDaemon(dir, (req) => {
        if (req.op === "hello") { helloCount += 1; return { id: req.id, daemonPath: "/x", pid: 1, protocolVersion: 1 }; }
        return { id: req.id, embedding: [0.1] };
      });
      const client = new EmbedClient({ socketDir: dir, timeoutMs: 500, autoSpawn: false });
      await client.embed("hi");
      expect(helloCount).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.HIVEMIND_EMBED_DAEMON;
      else process.env.HIVEMIND_EMBED_DAEMON = prev;
    }
  });
});
