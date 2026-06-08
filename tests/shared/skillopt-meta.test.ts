import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  fingerprintEdits, alreadyProposed, priorEditSummaries, metaEntryFor, loadMeta, appendMeta,
} from "../../src/skillify/skillopt-meta.js";
import type { Edit } from "../../src/skillify/skill-edits.js";

const edits: Edit[] = [{ op: "append", content: "always flush" }, { op: "replace", target: "mock", content: "do not mock" }];

describe("fingerprintEdits", () => {
  it("is order-independent (same set → same fingerprint)", () => {
    expect(fingerprintEdits(edits)).toBe(fingerprintEdits([...edits].reverse()));
  });
  it("differs for different content", () => {
    expect(fingerprintEdits(edits)).not.toBe(fingerprintEdits([{ op: "append", content: "other" }]));
  });
});

describe("alreadyProposed / priorEditSummaries", () => {
  const meta = [metaEntryFor("posthog", "kamo", edits, "t1"), metaEntryFor("other", "x", [{ op: "append", content: "z" }], "t2")];
  it("matches a prior proposal by skill + fingerprint", () => {
    expect(alreadyProposed(meta, "posthog", "kamo", [...edits].reverse())).toBe(true);
    expect(alreadyProposed(meta, "posthog", "kamo", [{ op: "append", content: "new" }])).toBe(false);
    expect(alreadyProposed(meta, "nope", "kamo", edits)).toBe(false); // different skill
  });
  it("surfaces prior edit summaries only for the given skill", () => {
    const prior = priorEditSummaries(meta, "posthog", "kamo");
    expect(prior.length).toBe(2);
    expect(prior.join(" ")).toContain("append");
    expect(priorEditSummaries(meta, "posthog", "kamo").join(" ")).not.toContain('append: z'); // other skill's edit
  });

  it("summarizes a delete edit (target, NO content) and a targetless append (content, NO target)", () => {
    const m = [metaEntryFor("p", "k", [{ op: "delete", target: "old rule" }, { op: "append", content: "x" }], "t")];
    const prior = priorEditSummaries(m, "p", "k");
    // delete → target anchor + no content preview; append → content preview + no anchor (both ternary halves)
    expect(prior.join(" ")).toMatch(/delete @"old rule"/);
    expect(prior.join(" ")).toMatch(/append: x/);
  });
});

describe("loadMeta / appendMeta", () => {
  let file: string;
  beforeEach(() => { file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "meta-")), "meta.jsonl"); });
  afterEach(() => { fs.rmSync(path.dirname(file), { recursive: true, force: true }); });

  it("round-trips entries and skips malformed lines", () => {
    appendMeta(file, metaEntryFor("a", "b", edits, "t1"));
    appendMeta(file, metaEntryFor("c", "d", [{ op: "append", content: "x" }], "t2"));
    fs.appendFileSync(file, "{ not json }\n\n");
    const loaded = loadMeta(file);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].skill).toBe("a--b");
    expect(loaded[0].status).toBe("proposed");
  });

  it("returns [] for a missing file", () => {
    expect(loadMeta(path.join(os.tmpdir(), "does-not-exist-xyz.jsonl"))).toEqual([]);
  });
});
