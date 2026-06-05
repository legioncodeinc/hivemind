/**
 * Publish mechanism: write an accepted skill edit to the LIVE SKILL.md via the
 * native skills dir (the only legitimate channel — never the model's prompt
 * context; see PR #223). Bumps the frontmatter version (enables v1-vs-v2) and
 * keeps a backup so a bad edit is one `cp` from revert.
 *
 * This is the mechanism only. The worker does NOT call it on an unvalidated edit
 * (the offline gate isn't trustworthy — see the spike findings); it writes a
 * review proposal instead, and live publish is reserved for an edit that has
 * passed the real-usage A/B gate (deferred). Pure fs; testable against a tmp dir.
 */
import fs from "node:fs";
import path from "node:path";

export interface PublishResult {
  path: string;
  oldVersion: number;
  newVersion: number;
  backupPath: string;
}

/** Split a SKILL.md into its frontmatter block (incl. fences) and the body. */
export function splitFrontmatter(md: string): { frontmatter: string; body: string } {
  const m = md.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (m) return { frontmatter: m[1], body: m[2] };
  return { frontmatter: "", body: md };
}

/** Bump `version: N` in a frontmatter block (absent → treat as 1 → 2). */
export function bumpVersion(frontmatter: string): { frontmatter: string; oldVersion: number; newVersion: number } {
  const m = frontmatter.match(/^version:\s*(\d+)\s*$/m);
  const oldVersion = m ? parseInt(m[1], 10) : 1;
  const newVersion = oldVersion + 1;
  let next: string;
  if (m) {
    next = frontmatter.replace(/^version:\s*\d+\s*$/m, `version: ${newVersion}`); // has a version line
  } else if (/\n---\n$/.test(frontmatter)) {
    next = frontmatter.replace(/\n---\n$/, `\nversion: ${newVersion}\n---\n`);     // frontmatter, no version
  } else {
    next = `---\nversion: ${newVersion}\n---\n`;                                   // no frontmatter → create one
  }
  return { frontmatter: next, oldVersion, newVersion };
}

/**
 * Write `editedBody` to the skill's live SKILL.md, version bumped, original backed
 * up to SKILL.v<old>.bak.md. Throws if the skill dir / file isn't present.
 */
export function publishSkillEdit(
  skillsRoot: string,
  name: string,
  author: string,
  editedBody: string,
): PublishResult {
  const dir = path.join(skillsRoot, `${name}--${author}`);
  const file = path.join(dir, "SKILL.md");
  const existing = fs.readFileSync(file, "utf8");
  const { frontmatter } = splitFrontmatter(existing);
  const { frontmatter: bumped, oldVersion, newVersion } = bumpVersion(frontmatter);
  const backupPath = path.join(dir, `SKILL.v${oldVersion}.bak.md`);
  fs.writeFileSync(backupPath, existing);
  fs.writeFileSync(file, `${bumped}${editedBody.trimEnd()}\n`);
  return { path: file, oldVersion, newVersion, backupPath };
}
