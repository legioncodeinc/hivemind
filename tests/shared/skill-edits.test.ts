import { describe, it, expect } from "vitest";
import { applyEdits, selectEdits, SU_START, SU_END } from "../../src/skillify/skill-edits.js";

describe("applyEdits", () => {
  const base = "## Rules\n1. mock the client\n2. skip flush";

  it("append adds content at the end", () => {
    const r = applyEdits(base, [{ op: "append", content: "3. verify via the API" }]);
    expect(r.skill).toContain("3. verify via the API");
    expect(r.applied).toBe(1);
  });

  it("insert_after inserts on the line after the target", () => {
    const r = applyEdits(base, [{ op: "insert_after", target: "1. mock the client", content: "(NEVER mock — it hides failures)" }]);
    expect(r.skill).toMatch(/1\. mock the client\n\(NEVER mock — it hides failures\)\n2\. skip flush/);
  });

  it("replace swaps the target text", () => {
    const r = applyEdits(base, [{ op: "replace", target: "skip flush", content: "ALWAYS flush" }]);
    expect(r.skill).toContain("2. ALWAYS flush");
    expect(r.skill).not.toContain("skip flush");
  });

  it("delete removes the target text", () => {
    const r = applyEdits(base, [{ op: "delete", target: "\n2. skip flush" }]);
    expect(r.skill).toBe("## Rules\n1. mock the client");
  });

  it("skips edits whose target isn't found (and counts only applied)", () => {
    const r = applyEdits(base, [{ op: "replace", target: "nonexistent", content: "x" }, { op: "append", content: "added" }]);
    expect(r.applied).toBe(1);
    expect(r.report.some((l) => l.includes("SKIP replace: target not found"))).toBe(true);
  });

  it("protects the slow-update region: skips edits targeting it, appends ABOVE it", () => {
    const doc = `## Rules\n1. a\n\n${SU_START}\nLongitudinal: prefer X over Y.\n${SU_END}`;
    const r = applyEdits(doc, [
      { op: "delete", target: "prefer X over Y" },      // targets protected → skipped
      { op: "append", content: "2. b" },                // lands above the region
    ]);
    expect(r.skill).toContain("prefer X over Y");        // protected content untouched
    expect(r.report.some((l) => l.includes("protected slow-update region"))).toBe(true);
    // appended content sits before the protected block
    expect(r.skill.indexOf("2. b")).toBeLessThan(r.skill.indexOf(SU_START));
  });

  it("rejects a target that SPANS INTO the protected region (not just one starting inside)", () => {
    const doc = `## Rules\n1. a\n${SU_START}\nLongitudinal guidance.\n${SU_END}`;
    // target begins before SLOW_UPDATE_START but extends into the protected block
    const r = applyEdits(doc, [{ op: "delete", target: `1. a\n${SU_START}\nLongitudinal` }]);
    expect(r.applied).toBe(0);
    expect(r.skill).toContain("Longitudinal guidance.");
    expect(r.report.some((l) => l.includes("protected slow-update region"))).toBe(true);
  });
});

describe("selectEdits (edit budget)", () => {
  const edits = [1, 2, 3, 4].map((i) => ({ op: "append" as const, content: `${i}` }));
  it("keeps at most `budget` edits", () => {
    expect(selectEdits(edits, 2)).toHaveLength(2);
    expect(selectEdits(edits, 0)).toHaveLength(0);
    expect(selectEdits(edits, 99)).toHaveLength(4);
  });
});
