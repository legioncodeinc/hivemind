import { randomUUID } from "node:crypto";
import { sqlIdent } from "../utils/sql.js";

/**
 * SQL to create the `skills` table. Mirror of ensureSkillsTable() in
 * deeplake-api.ts — kept inline so the worker can run it via its own
 * query() fn on first-INSERT-fails-because-missing, without dragging the
 * full DeeplakeApi class into the worker bundle.
 */
export function createSkillsTableSql(tableName: string): string {
  // sqlIdent throws on anything outside [A-Za-z_][A-Za-z0-9_]* — protects
  // against HIVEMIND_SKILLS_TABLE config injection (a stray quote would
  // otherwise break CREATE TABLE / CREATE INDEX startup).
  const safe = sqlIdent(tableName);
  return (
    `CREATE TABLE IF NOT EXISTS "${safe}" (` +
      `id TEXT NOT NULL DEFAULT '', ` +
      `name TEXT NOT NULL DEFAULT '', ` +
      `project TEXT NOT NULL DEFAULT '', ` +
      `project_key TEXT NOT NULL DEFAULT '', ` +
      `local_path TEXT NOT NULL DEFAULT '', ` +
      `install TEXT NOT NULL DEFAULT 'project', ` +
      `source_sessions TEXT NOT NULL DEFAULT '[]', ` +
      `source_agent TEXT NOT NULL DEFAULT '', ` +
      `scope TEXT NOT NULL DEFAULT 'me', ` +
      `author TEXT NOT NULL DEFAULT '', ` +
      `description TEXT NOT NULL DEFAULT '', ` +
      `trigger_text TEXT NOT NULL DEFAULT '', ` +
      `body TEXT NOT NULL DEFAULT '', ` +
      `version BIGINT NOT NULL DEFAULT 1, ` +
      `created_at TEXT NOT NULL DEFAULT '', ` +
      `updated_at TEXT NOT NULL DEFAULT ''` +
    `) USING deeplake`
  );
}

/**
 * Insert one row into the Deeplake `skills` table per skill version.
 *
 * Append-only: every KEEP/MERGE writes a fresh row. The most recent row for
 * (project_key, name) is the current state — readers ORDER BY version DESC
 * LIMIT 1. This avoids the UPDATE-coalescing quirk that hit the wiki worker
 * (CLAUDE.md: two rapid UPDATEs on the same row drop one silently).
 */

export interface InsertSkillRowArgs {
  /** Async SQL executor (the worker's own `query` fn, the API client, or a test mock). */
  query: (sql: string) => Promise<unknown>;
  tableName: string;
  /** Skill metadata. */
  name: string;
  project: string;
  projectKey: string;
  localPath: string;
  install: "project" | "global";
  sourceSessions: string[];
  sourceAgent: string;
  scope: "me" | "team" | "org";
  author: string;
  description: string;
  trigger?: string;
  body: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Pre-generated UUID for this row. Pass an existing one for testing. */
  id?: string;
}

/** Escape a string for use inside a SQL single-quoted literal. */
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function isMissingTableError(message: string | undefined): boolean {
  if (!message) return false;
  // Match phrases that unambiguously indicate "the table itself isn't there".
  // Notably we do NOT treat 'permission denied' as missing-table — it's a
  // different problem (auth scope) and re-running CREATE TABLE wouldn't help.
  // We also avoid matching the bare phrase "does not exist" anywhere in the
  // message because that string can show up in errors about other entities
  // (e.g. "column X does not exist").
  return /Table does not exist|relation .* does not exist|no such table/i.test(message);
}

export async function insertSkillRow(args: InsertSkillRowArgs): Promise<void> {
  const id = args.id ?? randomUUID();
  const sourceSessionsJson = JSON.stringify(args.sourceSessions);
  const sql =
    `INSERT INTO "${sqlIdent(args.tableName)}" (` +
      `id, name, project, project_key, local_path, install, ` +
      `source_sessions, source_agent, scope, author, ` +
      `description, trigger_text, body, version, created_at, updated_at` +
    `) VALUES (` +
      `'${esc(id)}', ` +
      `'${esc(args.name)}', ` +
      `'${esc(args.project)}', ` +
      `'${esc(args.projectKey)}', ` +
      `'${esc(args.localPath)}', ` +
      `'${esc(args.install)}', ` +
      `'${esc(sourceSessionsJson)}', ` +
      `'${esc(args.sourceAgent)}', ` +
      `'${esc(args.scope)}', ` +
      `'${esc(args.author)}', ` +
      `'${esc(args.description)}', ` +
      `'${esc(args.trigger ?? "")}', ` +
      `'${esc(args.body)}', ` +
      `${args.version}, ` +
      `'${esc(args.createdAt)}', ` +
      `'${esc(args.updatedAt)}'` +
    `)`;
  try {
    await args.query(sql);
  } catch (e: any) {
    if (isMissingTableError(e?.message)) {
      // Lazy-create the table on first use, then retry the insert once.
      await args.query(createSkillsTableSql(args.tableName));
      await args.query(sql);
      return;
    }
    throw e;
  }
}
