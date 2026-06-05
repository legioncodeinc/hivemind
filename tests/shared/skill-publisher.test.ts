import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { splitFrontmatter, bumpVersion, publishSkillEdit } from "../../src/skillify/skill-publisher.js";

describe("splitFrontmatter", () => {
  it("splits frontmatter from body", () => {
    const { frontmatter, body } = splitFrontmatter("---\nname: x\nversion: 3\n---\n## Body\nhi");
    expect(frontmatter).toBe("---\nname: x\nversion: 3\n---\n");
    expect(body).toBe("## Body\nhi");
  });
  it("handles a doc with no frontmatter", () => {
    expect(splitFrontmatter("just body")).toEqual({ frontmatter: "", body: "just body" });
  });
});

describe("bumpVersion", () => {
  it("increments an existing version", () => {
    const r = bumpVersion("---\nname: x\nversion: 4\n---\n");
    expect(r.oldVersion).toBe(4);
    expect(r.newVersion).toBe(5);
    expect(r.frontmatter).toContain("version: 5");
  });
  it("inserts version 2 when absent (original treated as 1)", () => {
    const r = bumpVersion("---\nname: x\n---\n");
    expect(r).toMatchObject({ oldVersion: 1, newVersion: 2 });
    expect(r.frontmatter).toMatch(/version: 2\n---\n$/);
  });
  it("creates a frontmatter block when the doc has none", () => {
    const r = bumpVersion("");
    expect(r).toMatchObject({ oldVersion: 1, newVersion: 2 });
    expect(r.frontmatter).toBe("---\nversion: 2\n---\n");
  });
});

describe("publishSkillEdit", () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "pub-")); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it("writes the bumped body and backs up the original", () => {
    const dir = path.join(root, "posthog--kamo");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "SKILL.md"), "---\nname: posthog\nauthor: kamo\nversion: 2\n---\n## Rules\n1. mock the client\n");

    const res = publishSkillEdit(root, "posthog", "kamo", "## Rules\n1. NEVER mock — assert on the real client");

    expect(res).toMatchObject({ oldVersion: 2, newVersion: 3 });
    const written = fs.readFileSync(res.path, "utf8");
    expect(written).toContain("version: 3");
    expect(written).toContain("NEVER mock — assert on the real client");
    expect(written).not.toContain("1. mock the client\n");
    // backup preserves the prior version verbatim
    expect(fs.readFileSync(res.backupPath, "utf8")).toContain("version: 2");
    expect(fs.readFileSync(res.backupPath, "utf8")).toContain("1. mock the client");
  });

  it("throws when the skill isn't installed (caller decides what to do)", () => {
    expect(() => publishSkillEdit(root, "missing", "x", "body")).toThrow();
  });
});
