import { describe, it, expect } from "vitest";
import { detectAnchor } from "../../src/skillify/session-anchor.js";
import type { Turn } from "../../src/skillify/skill-invocations.js";

const u = (text: string): Turn => ({ role: "USER", text });
const a = (text: string): Turn => ({ role: "ASSISTANT", text });

describe("detectAnchor", () => {
  it("fires on user pushback right after an assistant turn", () => {
    const r = detectAnchor([u("add a smoke test"), a("done, here it is"), u("no that's wrong, it mocks the client")]);
    expect(r.anchored).toBe(true);
    expect(r.kind).toBe("correction");
    expect(r.evidence).toContain("wrong");
  });

  it("does NOT fire on the opening request (no preceding assistant turn)", () => {
    const r = detectAnchor([u("this won't work without a flush — add a smoke test")]);
    expect(r.anchored).toBe(false);
  });

  it("does NOT fire on a user turn that follows another user turn", () => {
    const r = detectAnchor([u("first"), u("that didn't work")]); // no assistant in between
    expect(r.anchored).toBe(false);
  });

  it("suppresses clear benign negatives (no problem / works now / thanks)", () => {
    expect(detectAnchor([a("fixed it"), u("no problem, thanks!")]).anchored).toBe(false);
    expect(detectAnchor([a("try this"), u("works now, perfect")]).anchored).toBe(false);
  });

  it("catches several real correction phrasings", () => {
    for (const p of ["that doesn't work", "still failing", "that's incorrect", "try again", "nope", "you broke the build"]) {
      expect(detectAnchor([a("here"), u(p)]).anchored, p).toBe(true);
    }
  });

  it("fires on polite-but-failing corrections (strong pushback overrides benign words)", () => {
    expect(detectAnchor([a("here"), u("thanks, but this is still failing")]).anchored).toBe(true);
    expect(detectAnchor([a("done"), u("perfect start, but that's still wrong")]).anchored).toBe(true);
  });

  it("returns none when the user is satisfied / silent", () => {
    expect(detectAnchor([u("do X"), a("done")]).anchored).toBe(false);
    expect(detectAnchor([]).anchored).toBe(false);
  });
});
