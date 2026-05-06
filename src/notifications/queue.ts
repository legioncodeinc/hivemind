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

import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { Notification, NotificationsQueue } from "./types.js";
import { log as _log } from "../utils/debug.js";

const log = (msg: string) => _log("notifications-queue", msg);

export function queuePath(): string {
  return join(homedir(), ".deeplake", "notifications-queue.json");
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

/** Append a notification to the persistent queue. Cross-process safe. */
export function enqueueNotification(n: Notification): void {
  const q = readQueue();
  q.queue.push(n);
  writeQueue(q);
}
