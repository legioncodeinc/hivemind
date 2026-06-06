import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSkillOptCycle, readSkillBodyViaManifest, type ProposalRecord } from "../../src/skillify/skillopt-engine.js";
import type { CurrentSkillRow } from "../../src/skillify/skill-org-publish.js";
import type { PulledManifest } from "../../src/skillify/manifest.js";

const invRow = (skill: string, sid: string) => ({
  message: { type: "tool_call", tool_name: "Skill", tool_input: JSON.stringify({ skill }), session_id: sid, timestamp: sid },
  last_update_date: sid,
});
const transcript = (skill: string, sid: string, pushback: boolean) => [
  { message: { type: "user_message", content: "do it" } },
  { message: { type: "tool_call", tool_name: "Skill", tool_input: JSON.stringify({ skill }), timestamp: sid } },
  { message: { type: "assistant_message", content: "done" } },
  { message: { type: "user_message", content: pushback ? "no that's wrong, it mocks the client" : "thanks, perfect" } },
];

/** nBad skills, each 10 invocations with 5 pushback → each deficient. */
function world(nBad: number) {
  const invs: Array<Record<string, unknown>> = [];
  const transcripts = new Map<string, Array<Record<string, unknown>>>();
  for (let b = 0; b < nBad; b++) {
    for (let i = 0; i < 10; i++) {
      const sid = `b${b}s${i}`;
      invs.push(invRow(`bad${b}--auth`, sid));
      transcripts.set(sid, transcript(`bad${b}--auth`, sid, i < 5));
    }
  }
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('"Skill"') && sql.includes("ORDER BY last_update_date")) return invs;
    const m = sql.match(/\/sessions\/%([^%]+)%/);
    return m ? (transcripts.get(m[1]) ?? []) : [];
  });
  return query;
}

const judge = () => vi.fn(async (_s: string, _u: string) => '{"success":0,"confidence":0.9,"reason":"mocks the client"}');
const proposerModel = () => vi.fn(async (_s: string, _u: string) => '[{"op":"append","content":"Always verify via the PostHog API."}]');

/** A full current-row stub for the readSkill dep (only body/version vary per test). */
const skillRow = (body: string, version: number): CurrentSkillRow => ({
  name: "x", author: "a", project: "p", projectKey: "pk", localPath: "", install: "global",
  sourceSessions: [], sourceAgent: "claude_code", scope: "me", contributors: ["a"],
  description: "", trigger: "", body, version,
});

describe("runSkillOptCycle", () => {
  it("fires when >=5 skills are deficient and publishes a version per editable skill", async () => {
    const written: ProposalRecord[] = [];
    const res = await runSkillOptCycle({
      query: world(6), sessionsTable: "sessions", now: "2026-06-05T00:00:00Z",
      readSkill: async () => skillRow("## Rules\n1. mock the client", 3),
      publish: (_c, r) => { written.push(r); },
      detector: { judge: judge() }, proposer: { model: proposerModel() },
    });
    expect(res.fired).toBe(true);
    expect(res.deficientCount).toBe(6);
    expect(written).toHaveLength(6);
    expect(written[0].candidateBody).toContain("Always verify via the PostHog API.");
    expect(written[0]).toMatchObject({ invocations: 10, confirmedFailures: 5, baseVersion: 3 });
  });

  it("does NOT fire below the threshold (no proposals, even though detection ran)", async () => {
    const publish = vi.fn();
    const res = await runSkillOptCycle({
      query: world(4), sessionsTable: "sessions", now: "t",
      readSkill: async () => skillRow("## Rules", 1), publish,
      detector: { judge: judge() }, proposer: { model: proposerModel() },
    });
    expect(res).toMatchObject({ fired: false, deficientCount: 4 });
    expect(res.proposals).toHaveLength(0);
    expect(publish).not.toHaveBeenCalled();
  });

  it("skips a deficient skill absent from the org skills table (no body to edit)", async () => {
    const written: ProposalRecord[] = [];
    const res = await runSkillOptCycle({
      query: world(6), sessionsTable: "sessions", now: "t",
      readSkill: async (name) => (name === "bad0" ? null : skillRow("## Rules\n1. mock the client", 1)),
      publish: (_c, r) => { written.push(r); },
      detector: { judge: judge() }, proposer: { model: proposerModel() },
    });
    expect(res.fired).toBe(true);
    expect(written).toHaveLength(5);                       // bad0 skipped
    expect(written.some((w) => w.name === "bad0")).toBe(false);
  });

  it("dedups against meta memory: a skill whose edit was already proposed isn't re-written", async () => {
    const written: ProposalRecord[] = [];
    const recorded: string[] = [];
    const res = await runSkillOptCycle({
      query: world(6), sessionsTable: "sessions", now: "t",
      readSkill: async () => skillRow("## Rules\n1. mock the client", 1),
      publish: (_c, r) => { written.push(r); },
      detector: { judge: judge() }, proposer: { model: proposerModel() },
      meta: {
        prior: () => ["append: earlier idea"],          // fed to the proposer as context
        has: (name) => name === "bad0",                  // bad0 already tried → dedup
        record: (name) => recorded.push(name),
      },
    });
    expect(res.fired).toBe(true);
    expect(written).toHaveLength(5);                     // bad0 deduped
    expect(written.some((w) => w.name === "bad0")).toBe(false);
    expect(recorded).not.toContain("bad0");              // not recorded again
    expect(res.proposals.find((p) => p.name === "bad0")!.changed).toBe(false);
  });

  it("reads a project-pulled skill body via the manifest's installRoot (not the cwd)", () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "proj-"));
    try {
      fs.mkdirSync(path.join(projRoot, "x--a"), { recursive: true });
      fs.writeFileSync(path.join(projRoot, "x--a", "SKILL.md"), "---\nname: x\nauthor: a\n---\n## Body\nproject body");
      const manifest = {
        version: 1,
        entries: [{ dirName: "x--a", name: "x", author: "a", installRoot: projRoot, projectKey: "", remoteVersion: 1, install: "project", installedAtVersion: 1, pulledAt: "", symlinks: [] }],
      } as unknown as PulledManifest;
      expect(readSkillBodyViaManifest("x", "a", manifest, "/nonexistent-global")).toBe("## Body\nproject body");
      // no manifest entry + no fallback body → null (not a silent wrong-skill edit)
      expect(readSkillBodyViaManifest("y", "b", manifest, "/nonexistent-global")).toBeNull();
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("honors a custom fireThreshold", async () => {
    const res = await runSkillOptCycle({
      query: world(3), sessionsTable: "sessions", now: "t", fireThreshold: 3,
      readSkill: async () => skillRow("## Rules", 1), publish: vi.fn(),
      detector: { judge: judge() }, proposer: { model: proposerModel() },
    });
    expect(res.fired).toBe(true);
  });
});
