import * as vscode from "vscode";
import type { StatusSnapshot } from "../types/health";
import { runHealthCheck } from "../health";
import { detectAuthState } from "../auth";
import { syncSkillsToCursor } from "../bridge/skill-sync";
import { buildSnapshot } from "./indicator";

const DEFAULT_INTERVAL_MS = 60_000;

export class HealthPoller {
  private timer: NodeJS.Timeout | undefined;
  private listeners = new Set<(snap: StatusSnapshot) => void>();
  private lastSnapshot: StatusSnapshot | undefined;

  onUpdate(listener: (snap: StatusSnapshot) => void): vscode.Disposable {
    this.listeners.add(listener);
    if (this.lastSnapshot) listener(this.lastSnapshot);
    return new vscode.Disposable(() => this.listeners.delete(listener));
  }

  start(intervalMs = DEFAULT_INTERVAL_MS): void {
    this.stop();
    void this.pollOnce();
    this.timer = setInterval(() => {
      if (vscode.window.state.focused !== false) {
        void this.pollOnce();
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async pollOnce(projectRoot?: string): Promise<StatusSnapshot> {
    const health = await runHealthCheck();
    const auth = await detectAuthState();
    let skillSync;
    try {
      skillSync = syncSkillsToCursor(projectRoot);
    } catch {
      /* best-effort; never block the poll */
    }
    const snap = buildSnapshot(health, auth, skillSync);
    this.lastSnapshot = snap;
    for (const listener of this.listeners) listener(snap);
    return snap;
  }
}
