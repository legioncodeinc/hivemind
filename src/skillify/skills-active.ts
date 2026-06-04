/**
 * Skill attribution for measurement: record, per session, which ORG-SHARED skills
 * were available in context at SessionStart, plus a deterministic A/B bucket.
 *
 * Why: skill value can only be validated by comparing sessions that had a skill vs
 * those that didn't (observational / randomized A/B). Today nothing records which
 * skills were in context — skill injection lives in the SessionStart system prompt,
 * not in captured turns — so attribution is impossible. This adds the missing label.
 *
 * Scope: ORG skills only. Pulled org skills land at `~/.claude/skills/<name>--<author>/`
 * (see pull.ts); local-only mined skills are bare-named and intentionally excluded —
 * a single-author local skill has no cross-user value to measure.
 *
 * Pure + side-effect-free here (disk read + SQL string build); the network INSERT is
 * done by the caller (session-start.ts) which already holds the gated DeeplakeApi.
 */
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { sqlStr } from "../utils/sql.js";

export interface ActiveSkill {
  name: string;
  author: string;
  version: number;
}

/** Read `version:` from a SKILL.md frontmatter; defaults to 1 if absent/unreadable. */
function readSkillVersion(skillsRoot: string, dir: string): number {
  try {
    const body = fs.readFileSync(path.join(skillsRoot, dir, "SKILL.md"), "utf8");
    const m = body.match(/^version:\s*(\d+)/m);
    return m ? Number(m[1]) : 1;
  } catch {
    return 1;
  }
}

export function defaultSkillsRoot(): string {
  return path.join(homedir(), ".claude", "skills");
}

/** List org-shared skills present on disk: `<name>--<author>` dirs. Bare (local) dirs skipped. */
export function listActiveOrgSkills(skillsRoot: string = defaultSkillsRoot()): ActiveSkill[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: ActiveSkill[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const idx = e.name.lastIndexOf("--");
    if (idx <= 0 || idx + 2 >= e.name.length) continue; // bare local skill, or malformed → skip
    out.push({
      name: e.name.slice(0, idx),
      author: e.name.slice(idx + 2),
      version: readSkillVersion(skillsRoot, e.name), // enables v1-vs-v2 comparison
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Deterministic, stateless per-session A/B bucket (FNV-1a over session_id). */
export function sessionBucket(sessionId: string, buckets = 2): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < sessionId.length; i++) {
    h ^= sessionId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h | 0) % buckets;
}

export interface SkillsActiveInsertArgs {
  sessionsTable: string;
  sessionPath: string;
  filename: string;
  userName: string;
  projectName: string;
  pluginVersion: string;
  sessionId: string;
  cwd?: string;
  skills: ActiveSkill[];
  bucket: number;
  ts: string;
}

/**
 * Build the single INSERT for a `skills_active` attribution row. Mirrors capture.ts's
 * sessions-table insert exactly, with `message_embedding` NULL (no daemon round-trip at
 * SessionStart) and a distinct `message.type = "skills_active"`.
 */
export function buildSkillsActiveInsert(a: SkillsActiveInsertArgs): string {
  const entry = {
    id: crypto.randomUUID(),
    session_id: a.sessionId,
    cwd: a.cwd,
    hook_event_name: "SessionStart",
    timestamp: a.ts,
    type: "skills_active",
    skills: a.skills,
    skills_count: a.skills.length,
    ab_bucket: a.bucket,
  };
  const line = JSON.stringify(entry);
  const jsonForSql = line.replace(/'/g, "''");
  return (
    `INSERT INTO "${a.sessionsTable}" (id, path, filename, message, message_embedding, author, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date) ` +
    `VALUES ('${crypto.randomUUID()}', '${sqlStr(a.sessionPath)}', '${sqlStr(a.filename)}', '${jsonForSql}'::jsonb, NULL, '${sqlStr(a.userName)}', ` +
    `${Buffer.byteLength(line, "utf-8")}, '${sqlStr(a.projectName)}', 'skills_active', 'claude_code', '${sqlStr(a.pluginVersion)}', '${a.ts}', '${a.ts}')`
  );
}
