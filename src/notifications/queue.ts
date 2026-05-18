/**
 * Atomic file-backed queue at ~/.deeplake/notifications-queue.json.
 *
 * Producers (any code path) call `enqueueNotification(n)`. Consumers (the
 * SessionStart drain) call `readQueue()` to peek and `writeQueue([])` to
 * commit a drain. FIFO order. Atomic write same as state.ts.
 *
 * Why a file rather than an in-process bus: producers and consumers may
 * live in DIFFERENT processes (capture hook produces; session-notifications
 * hook consumes at next session). The file is the cross-process boundary.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, openSync, closeSync, unlinkSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { Notification, NotificationsQueue } from "./types.js";
import { log as _log } from "../utils/debug.js";

const log = (msg: string) => _log("notifications-queue", msg);

// Cross-process lock parameters for enqueueNotification's
// read-modify-write. Lock file lives next to the queue. Stale-lock
// reclaim threshold is well above any plausible enqueue duration
// (a few ms) but below any session-start timeout.
const LOCK_RETRY_MAX = 50;
const LOCK_RETRY_BASE_MS = 5;
const LOCK_STALE_MS = 5000;

export function queuePath(): string {
  return join(homedir(), ".deeplake", "notifications-queue.json");
}

function lockPath(): string {
  return `${queuePath()}.lock`;
}

export function readQueue(): NotificationsQueue {
  try {
    const raw = readFileSync(queuePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.queue)) {
      log(`queue malformed → treating as empty`);
      return { queue: [] };
    }
    return { queue: parsed.queue };
  } catch {
    return { queue: [] };
  }
}

export function writeQueue(q: NotificationsQueue): void {
  const path = queuePath();
  const home = resolve(homedir());
  if (!resolve(path).startsWith(home + "/") && resolve(path) !== home) {
    throw new Error(`notifications-queue write blocked: ${path} is outside ${home}`);
  }
  mkdirSync(join(home, ".deeplake"), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(q, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
}

/**
 * Acquire an exclusive advisory lock on the queue, run `fn`, then release.
 * Uses `O_EXCL` on a `.lock` file — the only operation guaranteed atomic
 * across processes on POSIX. Retries with backoff on EEXIST; if the lock
 * has been held longer than LOCK_STALE_MS we assume the holder died and
 * reclaim it. Always best-effort: a lock failure logs but does NOT block
 * the caller (the only legitimate caller is `enqueueNotification`, and
 * the contract there is "best-effort, never throw into the hook hot path").
 */
function withQueueLock<T>(fn: () => T): T {
  const path = lockPath();
  mkdirSync(join(homedir(), ".deeplake"), { recursive: true, mode: 0o700 });
  let fd: number | null = null;
  for (let attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
    try {
      fd = openSync(path, "wx", 0o600);
      break;
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw e;
      // Stale-lock reclaim: if the file is older than LOCK_STALE_MS,
      // assume the previous holder died and try to remove it. Then loop
      // back to retry the open.
      try {
        const age = Date.now() - statSync(path).mtimeMs;
        if (age > LOCK_STALE_MS) {
          unlinkSync(path);
          continue;
        }
      } catch { /* stat/unlink may race with another reclaim — ignore */ }
      // Standard contention: back off and retry.
      const delay = LOCK_RETRY_BASE_MS * (attempt + 1);
      const end = Date.now() + delay;
      // Spin-wait synchronously; we hold no other resources and the lock
      // is held for <1 ms typical, so total wait stays bounded.
      while (Date.now() < end) { /* busy wait */ }
    }
  }
  if (fd === null) {
    log(`lock acquisition gave up after ${LOCK_RETRY_MAX} attempts — proceeding unlocked (last-writer-wins)`);
    return fn();
  }
  try {
    return fn();
  } finally {
    try { closeSync(fd); } catch { /* best-effort */ }
    try { unlinkSync(path); } catch { /* best-effort */ }
  }
}

/**
 * Append a notification to the persistent queue. Cross-process safe via
 * an advisory `.lock` file: concurrent producers serialize on the lock so
 * read-modify-write can't lose entries. Without the lock, two hooks that
 * race here would both read the same starting state, push their own
 * entry, and the second `rename(2)` would clobber the first writer's
 * addition.
 */
export function enqueueNotification(n: Notification): void {
  withQueueLock(() => {
    const q = readQueue();
    q.queue.push(n);
    writeQueue(q);
  });
}
