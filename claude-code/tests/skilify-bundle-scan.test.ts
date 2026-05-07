import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Bundle-level guard: assert the skilify worker is actually shipped in
 * every agent's bundle and that each agent's hook bundle contains the
 * trigger wiring. Source-level tests prove the modules are correct;
 * these tests prove `npm run build` didn't drop them.
 */

const ROOT = join(__dirname, "..", "..");
const AGENTS = ["claude-code", "codex", "cursor", "hermes"] as const;

function bundlePath(agent: string, file: string): string {
  return join(ROOT, agent, "bundle", file);
}

describe("skilify-worker bundle is shipped per agent", () => {
  for (const agent of AGENTS) {
    it(`${agent}/bundle/skilify-worker.js exists and contains the worker entry`, () => {
      const path = bundlePath(agent, "skilify-worker.js");
      expect(existsSync(path), `${path} missing`).toBe(true);
      const text = readFileSync(path, "utf-8");
      // Sanity: bundle should have the skilify log channel and the gate prompt.
      expect(text).toContain("skilify-worker(");
      expect(text).toContain("EXISTING PROJECT SKILLS");
      // Watermark advance is the SKIP hot path.
      expect(text).toContain("advancing watermark");
    });
  }
});

describe("triggers are wired in each agent's hook bundles", () => {
  it("claude-code: capture.js (Stop counter) AND session-end.js (force trigger)", () => {
    const cap = readFileSync(bundlePath("claude-code", "capture.js"), "utf-8");
    expect(cap).toContain("tryStopCounterTrigger");
    const se = readFileSync(bundlePath("claude-code", "session-end.js"), "utf-8");
    expect(se).toContain("forceSessionEndTrigger");
  });

  it("codex: stop.js fires forceSessionEndTrigger (Codex Stop is end-of-session)", () => {
    const stop = readFileSync(bundlePath("codex", "stop.js"), "utf-8");
    expect(stop).toContain("forceSessionEndTrigger");
  });

  it("cursor: capture.js Stop counter on afterAgentResponse + session-end.js force trigger", () => {
    const cap = readFileSync(bundlePath("cursor", "capture.js"), "utf-8");
    expect(cap).toContain("tryStopCounterTrigger");
    expect(cap).toContain("afterAgentResponse");
    const se = readFileSync(bundlePath("cursor", "session-end.js"), "utf-8");
    expect(se).toContain("forceSessionEndTrigger");
  });

  it("hermes: capture.js Stop counter on post_llm_call + session-end.js force trigger", () => {
    const cap = readFileSync(bundlePath("hermes", "capture.js"), "utf-8");
    expect(cap).toContain("tryStopCounterTrigger");
    expect(cap).toContain("post_llm_call");
    const se = readFileSync(bundlePath("hermes", "session-end.js"), "utf-8");
    expect(se).toContain("forceSessionEndTrigger");
  });
});

describe("each agent records the correct agent name", () => {
  it("claude-code passes agent: 'claude_code' to triggers", () => {
    const cap = readFileSync(bundlePath("claude-code", "capture.js"), "utf-8");
    const se = readFileSync(bundlePath("claude-code", "session-end.js"), "utf-8");
    expect(cap + se).toContain(`"claude_code"`);
  });
  it("codex passes agent: 'codex' to triggers", () => {
    expect(readFileSync(bundlePath("codex", "stop.js"), "utf-8")).toContain(`"codex"`);
  });
  it("cursor passes agent: 'cursor' to triggers", () => {
    const cap = readFileSync(bundlePath("cursor", "capture.js"), "utf-8");
    const se = readFileSync(bundlePath("cursor", "session-end.js"), "utf-8");
    expect(cap + se).toContain(`"cursor"`);
  });
  it("hermes passes agent: 'hermes' to triggers", () => {
    const cap = readFileSync(bundlePath("hermes", "capture.js"), "utf-8");
    const se = readFileSync(bundlePath("hermes", "session-end.js"), "utf-8");
    expect(cap + se).toContain(`"hermes"`);
  });
});

describe("known anti-patterns are absent from bundled worker", () => {
  it("does not UPDATE the skills table — append-only by design (CLAUDE.md UPDATE-coalescing quirk)", () => {
    for (const agent of AGENTS) {
      const text = readFileSync(bundlePath(agent, "skilify-worker.js"), "utf-8");
      expect(text, `${agent}: skilify-worker.js contains UPDATE on skills table`).not.toMatch(/UPDATE\s+"?skills"?\s+SET/i);
    }
  });
});
