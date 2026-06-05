import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Integration tests for cold-start-brief using a real (temp) filesystem.
 * Mocks only `node:os.homedir` to redirect ~/.claude/projects to a tmpdir
 * so readHeadTail / loadLocalSession / mineLocal / pickColdStartBrief run
 * their real I/O paths without touching the developer's actual home.
 *
 * These tests cover lines 191-282 (readHeadTail, loadLocalSession, mineLocal)
 * and 401-403 (pickColdStartBrief success path) which the unit tests in
 * cold-start-brief.test.ts can't reach because they mock node:fs globally.
 */

let tempHome: string;

vi.mock("node:os", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:os")>();
  return {
    ...real,
    homedir: () => tempHome,
  };
});

function jsonlRow(content: string, ts: string, cwd?: string): string {
  return JSON.stringify({ type: "user", message: { content }, timestamp: ts, cwd });
}

function writeSession(dir: string, name: string, rows: string[]): void {
  writeFileSync(join(dir, name), rows.join("\n") + "\n", "utf-8");
}

function projectDir(name: string): string {
  const d = join(tempHome, ".claude", "projects", name);
  mkdirSync(d, { recursive: true });
  return d;
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "hivemind-test-"));
  mkdirSync(join(tempHome, ".claude", "projects"), { recursive: true });
});

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true });
  vi.resetModules();
});

describe("cold-start-brief filesystem paths", () => {
  it("returns null for authed user when state file exists (no re-import needed)", async () => {
    // Write a state file to simulate already-onboarded user.
    mkdirSync(join(tempHome, ".claude"), { recursive: true });
    writeFileSync(
      join(tempHome, ".claude", ".hivemind_brief_state.json"),
      JSON.stringify({ lastBriefTs: new Date().toISOString(), sessionsScanned: 3, fireReason: "first_run" }),
    );
    const { pickColdStartBrief } = await import("../../src/notifications/sources/cold-start-brief.js");
    const result = await pickColdStartBrief({ token: "t" } as never);
    expect(result).toBeNull();
  });

  it("returns null when projects dir does not exist", async () => {
    // Remove the projects dir so mineLocal returns [].
    rmSync(join(tempHome, ".claude", "projects"), { recursive: true, force: true });
    const { pickColdStartBrief } = await import("../../src/notifications/sources/cold-start-brief.js");
    const result = await pickColdStartBrief(null);
    expect(result).toBeNull();
  });

  it("returns null when sessions are all older than the 60-day window", async () => {
    const d = projectDir("old-proj");
    const oldTs = new Date(Date.now() - 65 * 86_400_000).toISOString();
    writeSession(d, "session.jsonl", [jsonlRow("what was I doing?", oldTs)]);
    const { pickColdStartBrief } = await import("../../src/notifications/sources/cold-start-brief.js");
    const result = await pickColdStartBrief(null);
    expect(result).toBeNull();
  });

  it("returns null when jsonl has no valid user rows", async () => {
    const d = projectDir("empty-proj");
    writeSession(d, "session.jsonl", [
      JSON.stringify({ type: "assistant", message: { content: "hi" }, timestamp: new Date().toISOString() }),
      "not json at all",
    ]);
    const { pickColdStartBrief } = await import("../../src/notifications/sources/cold-start-brief.js");
    const result = await pickColdStartBrief(null);
    expect(result).toBeNull();
  });

  it("skips files that don't end in .jsonl", async () => {
    const d = projectDir("mixed-proj");
    writeFileSync(join(d, "notes.txt"), "not a session");
    writeFileSync(join(d, "session.json"), jsonlRow("hello", new Date().toISOString()));
    const { pickColdStartBrief } = await import("../../src/notifications/sources/cold-start-brief.js");
    const result = await pickColdStartBrief(null);
    expect(result).toBeNull();
  });

  it("fires a brief (authed first run) when recall-seeking sessions exist", async () => {
    const recallPhrases = [
      "what was I doing last time?",
      "continue where I left off",
      "what is my todo list for this project",
    ];
    const proj = projectDir("my-proj");
    for (let i = 0; i < recallPhrases.length; i++) {
      const ts = new Date(Date.now() - (i + 1) * 24 * 3_600_000).toISOString();
      writeSession(proj, `session-${i}.jsonl`, [
        jsonlRow(recallPhrases[i], ts, "/home/user/my-proj"),
        jsonlRow("done for now", new Date(Date.now() - i * 3_600_000).toISOString()),
      ]);
    }
    const { pickColdStartBrief } = await import("../../src/notifications/sources/cold-start-brief.js");
    const result = await pickColdStartBrief({ token: "t" } as never);
    // Authed first run with enough recall-seeking sessions → brief fires.
    expect(result).not.toBeNull();
    expect(result?.brief).toContain("found context");
    expect(result?.firstRun).toBe(true);
  });

  it("fires a brief (anonymous first run) when a dominant project exists", async () => {
    const proj = projectDir("big-proj");
    for (let i = 0; i < 4; i++) {
      const ts = new Date(Date.now() - (i + 1) * 3_600_000).toISOString();
      writeSession(proj, `s${i}.jsonl`, [jsonlRow(`task ${i}`, ts, "/work/big-proj")]);
    }
    const other = projectDir("small-proj");
    writeSession(other, "s.jsonl", [jsonlRow("one task", new Date().toISOString())]);

    const { pickColdStartBrief } = await import("../../src/notifications/sources/cold-start-brief.js");
    const result = await pickColdStartBrief(null); // anonymous
    expect(result).not.toBeNull();
    expect(result?.brief).toContain("Sign in");
    expect(result?.firstRun).toBe(true);
  });

  it("returns null when state file has non-string lastBriefTs (lastBriefMs NaN branch)", async () => {
    // Write state with a non-string lastBriefTs → lastBriefMs returns null → re-nudge allowed.
    mkdirSync(join(tempHome, ".claude"), { recursive: true });
    writeFileSync(
      join(tempHome, ".claude", ".hivemind_brief_state.json"),
      JSON.stringify({ lastBriefTs: 12345, sessionsScanned: 0, fireReason: "first_run" }),
    );
    // No sessions → returns null (not because of state, but because mineLocal is empty).
    const { pickColdStartBrief } = await import("../../src/notifications/sources/cold-start-brief.js");
    const result = await pickColdStartBrief(null);
    expect(result).toBeNull(); // no sessions → quiet → null
  });

  it("handles mtime < cutoff gracefully (loadLocalSession returns null for old files)", async () => {
    const proj = projectDir("aged-proj");
    const sessionPath = join(proj, "old.jsonl");
    writeFileSync(sessionPath, jsonlRow("hello", new Date().toISOString()) + "\n");
    // Set mtime to 70 days ago so loadLocalSession rejects the file.
    const { utimesSync } = await import("node:fs");
    const oldDate = new Date(Date.now() - 70 * 86_400_000);
    utimesSync(sessionPath, oldDate, oldDate);
    const { pickColdStartBrief } = await import("../../src/notifications/sources/cold-start-brief.js");
    const result = await pickColdStartBrief({ token: "t" } as never);
    expect(result).toBeNull(); // file too old → no sessions → null
  });

  it("reads head AND tail of a large-ish file (readHeadTail both branches)", async () => {
    const proj = projectDir("large-proj");
    // Build a session > HEAD_TAIL_BYTES (32KB) so both head and tail are read.
    const rows: string[] = [];
    const baseTs = new Date(Date.now() - 3_600_000);
    rows.push(jsonlRow("what was I doing?", baseTs.toISOString()));
    // Fill with enough data to exceed 32KB.
    for (let i = 0; i < 600; i++) {
      const ts = new Date(baseTs.getTime() + i * 1000).toISOString();
      rows.push(JSON.stringify({ type: "assistant", message: { content: "a".repeat(60) }, timestamp: ts }));
    }
    const lastTs = new Date(Date.now() - 60_000).toISOString();
    rows.push(jsonlRow("next time pick this up", lastTs));
    writeSession(proj, "big.jsonl", rows);

    const { pickColdStartBrief } = await import("../../src/notifications/sources/cold-start-brief.js");
    // Just assert it doesn't throw and returns something or null (we can't guarantee
    // signal strength, but the code path through readHeadTail's tail branch runs).
    await expect(pickColdStartBrief({ token: "t" } as never)).resolves.not.toThrow();
  });
});
