// Thin client used by hooks to request embeddings from the daemon.
// Self-heals: if the socket is missing, the first caller spawns the daemon
// under an O_EXCL pidfile lock so concurrent callers don't spawn duplicates.

import { connect, type Socket } from "node:net";
import { spawn } from "node:child_process";
import { openSync, closeSync, writeSync, unlinkSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CLIENT_TIMEOUT_MS,
  pidPathFor,
  socketPathFor,
  type DaemonResponse,
  type EmbedKind,
  type EmbedRequest,
  type HelloRequest,
  type HelloResponse,
} from "./protocol.js";
import { log as _log } from "../utils/debug.js";
import { enqueueNotification } from "../notifications/queue.js";
import { embeddingsStatus } from "./disable.js";

// Canonical location for the standalone daemon bundle, deposited by
// `hivemind embeddings install`. Used as the auto-spawn fallback when
// neither opts.daemonEntry nor HIVEMIND_EMBED_DAEMON is set — so any
// agent (including pi, which has no bundled daemon of its own) can spawn
// the same shared daemon process.
const SHARED_DAEMON_PATH = join(homedir(), ".hivemind", "embed-deps", "embed-daemon.js");

const log = (m: string) => _log("embed-client", m);

function getUid(): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  return uid !== undefined ? String(uid) : (process.env.USER ?? "default");
}

export interface ClientOptions {
  socketDir?: string;
  timeoutMs?: number;
  daemonEntry?: string; // path to bundled embed-daemon.js
  autoSpawn?: boolean;
  spawnWaitMs?: number;
}

// Process-local flags so an embed-deps-missing notification fires at most
// once per process AND the stuck-daemon kill+recycle path runs at most once
// per process (it's idempotent but the SIGTERM is wasted on every retry).
let _signalledMissingDeps = false;
let _recycledStuckDaemon = false;
// Hello handshake runs at most once per (process, EmbedClient instance).
// Stored on the instance, not module-global, because tests construct
// many clients and each one needs its own verification cycle.

export class EmbedClient {
  private socketPath: string;
  private pidPath: string;
  private timeoutMs: number;
  private daemonEntry: string | undefined;
  private autoSpawn: boolean;
  private spawnWaitMs: number;
  private nextId = 0;
  private helloVerified = false;

  constructor(opts: ClientOptions = {}) {
    const uid = getUid();
    const dir = opts.socketDir ?? "/tmp";
    this.socketPath = socketPathFor(uid, dir);
    this.pidPath = pidPathFor(uid, dir);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_CLIENT_TIMEOUT_MS;
    // Resolution order: explicit opt → env override → canonical shared
    // location (set up by `hivemind embeddings install`). The shared path
    // is checked at use-time, not here, so a missing file just means
    // "no auto-spawn" without preventing socket-only connects when
    // another agent has already spawned the daemon.
    this.daemonEntry = opts.daemonEntry
      ?? process.env.HIVEMIND_EMBED_DAEMON
      ?? (existsSync(SHARED_DAEMON_PATH) ? SHARED_DAEMON_PATH : undefined);
    this.autoSpawn = opts.autoSpawn ?? true;
    this.spawnWaitMs = opts.spawnWaitMs ?? 5000;
  }

  /**
   * Returns an embedding vector, or null on timeout/failure. Hooks MUST treat
   * null as "skip embedding column" — never block the write path on us.
   *
   * Fire-and-forget spawn on miss: if the daemon isn't up, this call returns
   * null AND kicks off a background spawn. The next call finds a ready daemon.
   *
   * Stuck-daemon recycle: if the daemon returns a transformers-missing
   * error (typical after a marketplace upgrade left an older daemon process
   * alive but with no node_modules accessible from its bundle path), we
   * SIGTERM it and clear its sock/pid so the very next call spawns a fresh
   * daemon from the current bundle. Without this, the stuck daemon would
   * keep poisoning every session until its 10-minute idle-out fires.
   */
  async embed(text: string, kind: EmbedKind = "document"): Promise<number[] | null> {
    let sock: Socket;
    try {
      sock = await this.connectOnce();
    } catch {
      if (this.autoSpawn) this.trySpawnDaemon();
      return null;
    }
    try {
      await this.verifyDaemonOnce(sock);
      const id = String(++this.nextId);
      const req: EmbedRequest = { op: "embed", id, kind, text };
      const resp = await this.sendAndWait(sock, req);
      if (resp.error || !("embedding" in resp) || !resp.embedding) {
        const err = resp.error ?? "no embedding";
        log(`embed err: ${err}`);
        if (isTransformersMissingError(err)) {
          this.handleTransformersMissing(err);
        }
        return null;
      }
      return resp.embedding;
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      log(`embed failed: ${err}`);
      return null;
    } finally {
      try { sock.end(); } catch { /* best-effort */ }
    }
  }

  /**
   * Send a `hello` on first successful connect per EmbedClient instance.
   * If the daemon answers with a path that doesn't match our configured
   * daemonEntry — typical after a marketplace upgrade replaced the bundle
   * — SIGTERM the daemon + clear sock/pid so the next call spawns from the
   * current bundle. We mark `helloVerified` even on mismatch so we don't
   * re-issue the hello against the next, fresh connection.
   */
  private async verifyDaemonOnce(sock: Socket): Promise<void> {
    if (this.helloVerified) return;
    this.helloVerified = true;
    if (!this.daemonEntry) return; // no expectation to verify against
    const id = String(++this.nextId);
    const req: HelloRequest = { op: "hello", id };
    let resp: DaemonResponse;
    try {
      resp = await this.sendAndWait(sock, req);
    } catch (e: unknown) {
      // Daemon doesn't understand `hello` (older protocol) or connection
      // hiccup. Don't kill on a transient — let embed proceed and surface
      // any real problem there.
      log(`hello probe failed (treating as compatible): ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const hello = resp as HelloResponse;
    // A daemon from before this protocol version answers `hello` with
    // `{ id, error: "unknown op" }` and no `daemonPath`. Treat that the
    // same as a path mismatch: the running daemon doesn't speak the
    // current protocol, so it can't be trusted for what comes next.
    const noProtocolSupport = !hello.daemonPath;
    const mismatch = !noProtocolSupport && hello.daemonPath !== this.daemonEntry;
    if (!noProtocolSupport && !mismatch) return;
    if (_recycledStuckDaemon) return; // already recycled this process
    _recycledStuckDaemon = true;
    if (noProtocolSupport) {
      log(`daemon does not implement hello (older protocol); recycling`);
    } else {
      log(`daemon path mismatch — running=${hello.daemonPath} expected=${this.daemonEntry}; recycling`);
    }
    this.recycleDaemon(hello.pid);
  }

  /**
   * On a transformers-missing error from the daemon, SIGTERM the stuck
   * daemon (the bundle daemon that can't find its deps) and clear
   * sock/pid so the next call spawns fresh. Also enqueue a one-time
   * notification telling the user to run `hivemind embeddings install`
   * — but only when the user has opted in. Suppressed when
   * embeddingsStatus() === "user-disabled" so we don't nag users who
   * explicitly chose to turn embeddings off.
   */
  private handleTransformersMissing(detail: string): void {
    if (!_recycledStuckDaemon) {
      _recycledStuckDaemon = true;
      this.recycleDaemon(null);
    }
    if (_signalledMissingDeps) return;
    _signalledMissingDeps = true;
    let status: string;
    try { status = embeddingsStatus(); } catch { status = "enabled"; }
    if (status === "user-disabled") return; // user said no, don't nag
    try {
      enqueueNotification({
        id: "embed-deps-missing",
        severity: "warn",
        title: "Hivemind embeddings disabled — deps missing",
        body: `Semantic memory search is off because @huggingface/transformers is not installed where the daemon can find it. Run \`hivemind embeddings install\` to enable.`,
        dedupKey: { reason: "transformers-missing", detail: detail.slice(0, 200) },
      });
    } catch (e: unknown) {
      // Best-effort: never let a notification write failure escape into
      // the capture hot path.
      log(`enqueue embed-deps-missing failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Best-effort SIGTERM + sock/pid cleanup. Tolerant of every missing-file
   * combination and dead-PID cases.
   */
  private recycleDaemon(reportedPid: number | null): void {
    let pid: number | null = reportedPid;
    if (pid === null) {
      try {
        pid = Number.parseInt(readFileSync(this.pidPath, "utf-8").trim(), 10);
      } catch { /* no pidfile */ }
    }
    if (Number.isFinite(pid) && pid !== null && pid > 0) {
      try { process.kill(pid, "SIGTERM"); } catch { /* already dead */ }
    }
    try { unlinkSync(this.socketPath); } catch { /* not present */ }
    try { unlinkSync(this.pidPath); } catch { /* not present */ }
  }

  /**
   * Wait up to spawnWaitMs for the daemon to accept connections, spawning if
   * necessary. Meant for SessionStart / long-running batches — not the hot path.
   */
  async warmup(): Promise<boolean> {
    try {
      const s = await this.connectOnce();
      s.end();
      return true;
    } catch {
      if (!this.autoSpawn) return false;
      this.trySpawnDaemon();
      try {
        const s = await this.waitForSocket();
        s.end();
        return true;
      } catch {
        return false;
      }
    }
  }

  private connectOnce(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const sock = connect(this.socketPath);
      const to = setTimeout(() => {
        sock.destroy();
        reject(new Error("connect timeout"));
      }, this.timeoutMs);
      sock.once("connect", () => {
        clearTimeout(to);
        resolve(sock);
      });
      sock.once("error", (e) => {
        clearTimeout(to);
        reject(e);
      });
    });
  }

  private trySpawnDaemon(): void {
    // O_EXCL pidfile — only the first caller wins. Others find the pid file
    // and wait for the socket to appear.
    //
    // Race subtlety: we IMMEDIATELY write our own PID into the file to close
    // the window where another worker could see an empty pidfile and interpret
    // it as "stale". The daemon itself overwrites the file with its own PID
    // during startup (see daemon.ts start()).
    let fd: number;
    try {
      fd = openSync(this.pidPath, "wx", 0o600);
      writeSync(fd, String(process.pid));
    } catch (e: unknown) {
      // Someone else is spawning (EEXIST) — or pidfile is stale. If stale, clean up and retry.
      if (this.isPidFileStale()) {
        try { unlinkSync(this.pidPath); } catch { /* best-effort */ }
        try {
          fd = openSync(this.pidPath, "wx", 0o600);
          writeSync(fd, String(process.pid));
        } catch {
          return; // someone else just claimed it; let waitForSocket handle it
        }
      } else {
        return;
      }
    }

    if (!this.daemonEntry || !existsSync(this.daemonEntry)) {
      log(`daemonEntry not configured or missing: ${this.daemonEntry}`);
      try { closeSync(fd); unlinkSync(this.pidPath); } catch { /* best-effort */ }
      return;
    }

    try {
      const child = spawn(process.execPath, [this.daemonEntry], {
        detached: true,
        stdio: "ignore",
        env: process.env,
      });
      child.unref();
      log(`spawned daemon pid=${child.pid}`);
    } finally {
      closeSync(fd);
    }
  }

  private isPidFileStale(): boolean {
    try {
      const raw = readFileSync(this.pidPath, "utf-8").trim();
      const pid = Number(raw);
      if (!pid || Number.isNaN(pid)) return true;
      // kill(pid, 0) throws if process is gone.
      try {
        process.kill(pid, 0);
        // Process is alive — the daemon might just be loading the model and
        // hasn't bound the socket yet. DON'T treat as stale; let waitForSocket
        // poll. A hung daemon will eventually time out at the caller.
        return false;
      } catch {
        return true;
      }
    } catch {
      return true;
    }
  }

  private async waitForSocket(): Promise<Socket> {
    const deadline = Date.now() + this.spawnWaitMs;
    let delay = 30;
    while (Date.now() < deadline) {
      await sleep(delay);
      delay = Math.min(delay * 1.5, 300);
      if (!existsSync(this.socketPath)) continue;
      try {
        return await this.connectOnce();
      } catch {
        // socket appeared but daemon not ready yet — keep waiting
      }
    }
    throw new Error("daemon did not become ready within spawnWaitMs");
  }

  private sendAndWait(sock: Socket, req: EmbedRequest | HelloRequest): Promise<DaemonResponse> {
    return new Promise((resolve, reject) => {
      let buf = "";
      const to = setTimeout(() => {
        sock.destroy();
        reject(new Error("request timeout"));
      }, this.timeoutMs);
      sock.setEncoding("utf-8");
      sock.on("data", (chunk: string) => {
        buf += chunk;
        const nl = buf.indexOf("\n");
        if (nl === -1) return;
        const line = buf.slice(0, nl);
        clearTimeout(to);
        try {
          resolve(JSON.parse(line) as DaemonResponse);
        } catch (e) {
          reject(e as Error);
        }
      });
      sock.on("error", (e) => { clearTimeout(to); reject(e); });
      // If the daemon crashes or closes the connection cleanly without
      // sending a response (FIN before any data), neither `error` nor `data`
      // ever fires — without this `end` handler the promise would silently
      // hang until `timeoutMs` (10 minutes by default).
      sock.on("end", () => { clearTimeout(to); reject(new Error("connection closed without response")); });
      sock.write(JSON.stringify(req) + "\n");
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Detect daemon-side errors that indicate `@huggingface/transformers` is
 * not resolvable from the daemon's bundle location. Matches both Node's
 * MODULE_NOT_FOUND form and the actionable wrapper we throw from
 * `defaultImportTransformers`.
 */
export function isTransformersMissingError(err: string): boolean {
  return /(@huggingface\/transformers|hivemind embeddings install|MODULE_NOT_FOUND)/i.test(err);
}

// ── Test helpers ────────────────────────────────────────────────────────────

export function _resetClientStateForTesting(): void {
  _signalledMissingDeps = false;
  _recycledStuckDaemon = false;
}

let singleton: EmbedClient | null = null;
export function getEmbedClient(): EmbedClient {
  if (!singleton) singleton = new EmbedClient();
  return singleton;
}
