import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendHistoryEntry,
  countHistoryEntries,
  entryFromSnapshot,
  historyPath,
  readHistoryTail,
  type HistoryEntry,
} from "../../../src/graph/history.js";
import type { GraphSnapshot } from "../../../src/graph/types.js";

function entry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    ts: "2026-05-21T00:00:00Z",
    commit_sha: "abc123",
    snapshot_sha256: "def456789abc",
    node_count: 10,
    edge_count: 20,
    trigger: "manual",
    ...over,
  };
}

describe("history — append + read", () => {
  let baseDir: string;
  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "graph-history-"));
  });
  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("readHistoryTail returns [] when file is missing", () => {
    expect(readHistoryTail(baseDir, 10)).toEqual([]);
  });

  it("countHistoryEntries returns 0 when file is missing", () => {
    expect(countHistoryEntries(baseDir)).toBe(0);
  });

  it("round-trip: append two entries, read both back in order", () => {
    appendHistoryEntry(baseDir, entry({ commit_sha: "111" }));
    appendHistoryEntry(baseDir, entry({ commit_sha: "222" }));
    const tail = readHistoryTail(baseDir, 10);
    expect(tail.map((e) => e.commit_sha)).toEqual(["111", "222"]);
    expect(countHistoryEntries(baseDir)).toBe(2);
  });

  it("tail returns only the last N entries", () => {
    for (let i = 0; i < 5; i++) {
      appendHistoryEntry(baseDir, entry({ commit_sha: `c${i}` }));
    }
    const tail = readHistoryTail(baseDir, 3);
    expect(tail.map((e) => e.commit_sha)).toEqual(["c2", "c3", "c4"]);
  });

  it("n larger than total returns all", () => {
    appendHistoryEntry(baseDir, entry({ commit_sha: "only" }));
    expect(readHistoryTail(baseDir, 100)).toHaveLength(1);
  });

  it("n=0 returns []", () => {
    appendHistoryEntry(baseDir, entry({ commit_sha: "x" }));
    expect(readHistoryTail(baseDir, 0)).toEqual([]);
  });

  it("skips corrupt lines but keeps valid ones around them", () => {
    appendHistoryEntry(baseDir, entry({ commit_sha: "good1" }));
    appendFileSync(historyPath(baseDir), "{ not valid json\n");
    appendFileSync(historyPath(baseDir), JSON.stringify({ ts: 1 }) + "\n"); // wrong type
    appendHistoryEntry(baseDir, entry({ commit_sha: "good2" }));
    const tail = readHistoryTail(baseDir, 10);
    expect(tail.map((e) => e.commit_sha)).toEqual(["good1", "good2"]);
  });

  it("countHistoryEntries counts even malformed lines (raw line count)", () => {
    appendHistoryEntry(baseDir, entry({ commit_sha: "x" }));
    appendFileSync(historyPath(baseDir), "garbage\n");
    appendHistoryEntry(baseDir, entry({ commit_sha: "y" }));
    expect(countHistoryEntries(baseDir)).toBe(3);
  });

  it("preserves null commit_sha (non-git context)", () => {
    appendHistoryEntry(baseDir, entry({ commit_sha: null }));
    const [back] = readHistoryTail(baseDir, 1);
    expect(back!.commit_sha).toBeNull();
  });

  it("readHistoryTail returns [] on unreadable file (mkdirSync then file is a dir)", () => {
    // Force readFileSync to fail by making historyPath a directory.
    mkdirSync(historyPath(baseDir), { recursive: true });
    expect(readHistoryTail(baseDir, 10)).toEqual([]);
  });
});

describe("entryFromSnapshot — pure converter", () => {
  it("captures node/edge counts, ts, commit_sha, trigger", () => {
    const snap: GraphSnapshot = {
      directed: true,
      multigraph: true,
      graph: { schema_version: 1, generator: "hivemind-graph", commit_sha: "abc", repo_key: "k" },
      observation: {
        ts: "2026-01-01T12:34:56Z",
        branch: "main",
        worktree_path: "/x",
        repo_project: "x",
        generator_version: "1.0",
        source_files_extracted: 0,
        source_files_skipped: 0,
      },
      nodes: [{ id: "x:a:function", label: "a", kind: "function", source_file: "x", source_location: "L1", language: "typescript", exported: false }],
      links: [],
    };
    const e = entryFromSnapshot(snap, "sha256-fingerprint", "stop-hook");
    expect(e.ts).toBe("2026-01-01T12:34:56Z");
    expect(e.commit_sha).toBe("abc");
    expect(e.snapshot_sha256).toBe("sha256-fingerprint");
    expect(e.node_count).toBe(1);
    expect(e.edge_count).toBe(0);
    expect(e.trigger).toBe("stop-hook");
  });
});

describe("runHistoryCommand — CLI", () => {
  let graphsHome: string;
  let workDir: string;
  const prevHome = process.env.HIVEMIND_GRAPHS_HOME;

  beforeEach(() => {
    graphsHome = mkdtempSync(join(tmpdir(), "graph-hist-home-"));
    workDir = mkdtempSync(join(tmpdir(), "graph-hist-work-"));
    process.env.HIVEMIND_GRAPHS_HOME = graphsHome;
  });
  afterEach(() => {
    if (prevHome === undefined) delete process.env.HIVEMIND_GRAPHS_HOME;
    else process.env.HIVEMIND_GRAPHS_HOME = prevHome;
    rmSync(graphsHome, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
  });

  function captureOut(fn: () => void): { out: string; err: string } {
    const out: string[] = [];
    const err: string[] = [];
    const ls = vi.spyOn(console, "log").mockImplementation((...a) => { out.push(a.map(String).join(" ")); });
    const es = vi.spyOn(console, "error").mockImplementation((...a) => { err.push(a.map(String).join(" ")); });
    try { fn(); }
    finally { ls.mockRestore(); es.mockRestore(); }
    return { out: out.join("\n"), err: err.join("\n") };
  }

  async function seed(commits: string[]): Promise<void> {
    const { deriveProjectKey } = await import("../../../src/utils/repo-identity.js");
    const { repoDir } = await import("../../../src/graph/snapshot.js");
    const baseDir = repoDir(deriveProjectKey(workDir).key);
    for (const c of commits) {
      appendHistoryEntry(baseDir, entry({ commit_sha: c }));
    }
  }

  it("empty state prints helpful 'No history yet' message", async () => {
    const { runGraphCommand } = await import("../../../src/commands/graph.js");
    const { out } = captureOut(() => runGraphCommand(["history", "--cwd", workDir]));
    expect(out).toContain("No history yet");
  });

  it("prints last N entries in human format", async () => {
    await seed(["a", "b", "c", "d", "e"]);
    const { runGraphCommand } = await import("../../../src/commands/graph.js");
    const { out } = captureOut(() =>
      runGraphCommand(["history", "--cwd", workDir, "-n", "2"]),
    );
    expect(out).toMatch(/showing last 2/);
    expect(out).toContain("commit=d");
    expect(out).toContain("commit=e");
    expect(out).not.toContain("commit=a");
  });

  it("--json emits one JSON object per line", async () => {
    await seed(["a", "b"]);
    const { runGraphCommand } = await import("../../../src/commands/graph.js");
    const { out } = captureOut(() =>
      runGraphCommand(["history", "--cwd", workDir, "-n", "10", "--json"]),
    );
    const lines = out.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed.map((p) => p.commit_sha)).toEqual(["a", "b"]);
  });

  it("negative -n exits 2", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((c?: number) => { throw new Error(`exit(${c})`); }) as never);
    try {
      const { runGraphCommand } = await import("../../../src/commands/graph.js");
      const { err } = captureOut(() => {
        try { runGraphCommand(["history", "--cwd", workDir, "-n", "-3"]); } catch { /* exit */ }
      });
      expect(err).toContain("-n must be a non-negative integer");
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      exitSpy.mockRestore();
    }
  });
});
