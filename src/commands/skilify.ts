#!/usr/bin/env node

/**
 * CLI surface for skilify scope, team, install, and pull management.
 *
 * Usage:
 *   hivemind skilify                              — show current scope, team, status
 *   hivemind skilify scope <me|team|org>          — set the mining scope
 *   hivemind skilify install <project|global>     — set where new skills are written
 *   hivemind skilify promote <skill-name>         — move a project skill to global
 *   hivemind skilify team add <username>          — add a username to the team list
 *   hivemind skilify team remove <username>       — remove a username from the team list
 *   hivemind skilify team list                    — list current team members
 *   hivemind skilify pull [skill-name] [opts]     — fetch skills from Deeplake to local FS
 *   hivemind skilify status                       — show counter + per-project state
 *
 * The team list is consumed by the worker when scope=team: SQL filter
 * becomes `author IN (<team>)`. scope=me filters by current user only;
 * scope=org applies no author filter.
 */

import { readdirSync, existsSync, readFileSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { loadScopeConfig, saveScopeConfig, type Scope, type InstallLocation } from "../skilify/scope-config.js";
import { runPull, type PullSummary } from "../skilify/pull.js";
import { loadConfig } from "../config.js";
import { DeeplakeApi } from "../deeplake-api.js";

const STATE_DIR = join(homedir(), ".deeplake", "state", "skilify");

function showStatus(): void {
  const cfg = loadScopeConfig();
  console.log(`scope:   ${cfg.scope}`);
  console.log(`team:    ${cfg.team.length === 0 ? "(empty)" : cfg.team.join(", ")}`);
  console.log(`install: ${cfg.install}  (${cfg.install === "global" ? "~/.claude/skills/" : "<project>/.claude/skills/"})`);

  if (!existsSync(STATE_DIR)) {
    console.log(`state: (no projects tracked yet)`);
    return;
  }
  const files = readdirSync(STATE_DIR).filter(f => f.endsWith(".json") && f !== "config.json");
  if (files.length === 0) {
    console.log(`state: (no projects tracked yet)`);
    return;
  }
  console.log(`state: ${files.length} project(s) tracked`);
  for (const f of files) {
    try {
      const s = JSON.parse(readFileSync(join(STATE_DIR, f), "utf-8")) as {
        project: string; counter: number; lastDate: string | null; skillsGenerated: string[];
      };
      const skills = s.skillsGenerated.length === 0 ? "none" : s.skillsGenerated.join(", ");
      console.log(`  - ${s.project} (counter=${s.counter}, last=${s.lastDate ?? "never"}, skills=${skills})`);
    } catch { /* skip malformed */ }
  }
}

function setScope(scope: string): void {
  if (scope !== "me" && scope !== "team" && scope !== "org") {
    console.error(`Invalid scope '${scope}'. Use one of: me, team, org`);
    process.exit(1);
  }
  const cfg = loadScopeConfig();
  saveScopeConfig({ ...cfg, scope: scope as Scope });
  console.log(`Scope set to '${scope}'.`);
  if (scope === "team" && cfg.team.length === 0) {
    console.log(`Note: team list is empty. Use 'hivemind skilify team add <username>' to populate it.`);
  }
}

function setInstall(loc: string): void {
  if (loc !== "project" && loc !== "global") {
    console.error(`Invalid install location '${loc}'. Use one of: project, global`);
    process.exit(1);
  }
  const cfg = loadScopeConfig();
  saveScopeConfig({ ...cfg, install: loc as InstallLocation });
  const path = loc === "global" ? join(homedir(), ".claude", "skills") : "<cwd>/.claude/skills";
  console.log(`Install location set to '${loc}'. New skills will be written to ${path}/<name>/SKILL.md.`);
}

function promoteSkill(name: string, cwd: string): void {
  if (!name) { console.error("Usage: hivemind skilify promote <skill-name>"); process.exit(1); }
  const projectPath = join(cwd, ".claude", "skills", name);
  const globalPath = join(homedir(), ".claude", "skills", name);
  if (!existsSync(join(projectPath, "SKILL.md"))) {
    console.error(`Skill '${name}' not found at ${projectPath}/SKILL.md`);
    process.exit(1);
  }
  if (existsSync(join(globalPath, "SKILL.md"))) {
    console.error(`Skill '${name}' already exists at ${globalPath}/SKILL.md — refusing to overwrite. Remove it first or rename the project skill.`);
    process.exit(1);
  }
  mkdirSync(dirname(globalPath), { recursive: true });
  renameSync(projectPath, globalPath);
  console.log(`Promoted '${name}' from ${projectPath} → ${globalPath}.`);
}

function teamAdd(name: string): void {
  if (!name) { console.error("Usage: hivemind skilify team add <username>"); process.exit(1); }
  const cfg = loadScopeConfig();
  if (cfg.team.includes(name)) {
    console.log(`'${name}' is already in the team list.`);
    return;
  }
  const next = [...cfg.team, name].sort();
  saveScopeConfig({ ...cfg, team: next });
  console.log(`Added '${name}' to team. Team is now: ${next.join(", ")}`);
}

function teamRemove(name: string): void {
  if (!name) { console.error("Usage: hivemind skilify team remove <username>"); process.exit(1); }
  const cfg = loadScopeConfig();
  if (!cfg.team.includes(name)) {
    console.log(`'${name}' is not in the team list.`);
    return;
  }
  const next = cfg.team.filter(n => n !== name);
  saveScopeConfig({ ...cfg, team: next });
  console.log(`Removed '${name}' from team. Team is now: ${next.length === 0 ? "(empty)" : next.join(", ")}`);
}

function teamList(): void {
  const cfg = loadScopeConfig();
  if (cfg.team.length === 0) {
    console.log(`(team list is empty)`);
    return;
  }
  for (const n of cfg.team) console.log(n);
}

function usage(): void {
  console.log("Usage:");
  console.log("  hivemind skilify                            show current scope, team, install, and per-project state");
  console.log("  hivemind skilify scope <me|team|org>        set the mining scope");
  console.log("  hivemind skilify install <project|global>   set where new skills are written");
  console.log("  hivemind skilify promote <skill-name>       move a project skill to the global location");
  console.log("  hivemind skilify team add <username>        add a username to the team list");
  console.log("  hivemind skilify team remove <username>     remove a username from the team list");
  console.log("  hivemind skilify team list                  list current team members");
  console.log("  hivemind skilify pull [skill-name] [opts]   fetch skills from Deeplake to local FS");
  console.log("    Options for pull:");
  console.log("      --to <project|global>     destination (default: global)");
  console.log("      --user <name>             only skills authored by this user");
  console.log("      --users <a,b,c>           only skills authored by these users");
  console.log("      --all-users               all authors (default — equivalent to no filter)");
  console.log("      --dry-run                 show what would be written, don't touch disk");
  console.log("      --force                   overwrite even when local version >= remote");
  console.log("  hivemind skilify status                     show per-project state");
}

/** Parse a single string flag value out of `args`, removing the matched tokens. */
function takeFlagValue(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx < 0) return null;
  const value = args[idx + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error(`${flag} requires a value`);
    process.exit(1);
  }
  args.splice(idx, 2);
  return value;
}

function takeBooleanFlag(args: string[], flag: string): boolean {
  const idx = args.indexOf(flag);
  if (idx < 0) return false;
  args.splice(idx, 1);
  return true;
}

async function pullSkills(args: string[]): Promise<void> {
  // Parse flags first so the remaining positional is the optional skill name
  const work = [...args];
  const toRaw = takeFlagValue(work, "--to") ?? "global";
  const userOne = takeFlagValue(work, "--user");
  const usersMany = takeFlagValue(work, "--users");
  const allUsers = takeBooleanFlag(work, "--all-users");
  const dryRun = takeBooleanFlag(work, "--dry-run");
  const force = takeBooleanFlag(work, "--force");
  const skillName = work[0];

  if (toRaw !== "project" && toRaw !== "global") {
    console.error(`Invalid --to '${toRaw}'. Use 'project' or 'global'.`);
    process.exit(1);
  }

  // Build the user filter list. --all-users (or no filter at all) → empty array
  // = no SQL author filter. --user X → ["X"]. --users a,b,c → ["a","b","c"].
  let users: string[] = [];
  if (allUsers) users = [];
  else if (userOne) users = [userOne];
  else if (usersMany) users = usersMany.split(",").map(s => s.trim()).filter(Boolean);

  const config = loadConfig();
  if (!config) {
    console.error("Not logged in. Run: hivemind login");
    process.exit(1);
  }
  const api = new DeeplakeApi(
    config.token, config.apiUrl, config.orgId, config.workspaceId, config.skillsTableName,
  );
  // Wrap api.query so it matches the QueryFn signature expected by runPull.
  const query = (sql: string) => api.query(sql) as Promise<Record<string, unknown>[]>;

  let summary: PullSummary;
  try {
    summary = await runPull({
      query,
      tableName: config.skillsTableName,
      install: toRaw,
      cwd: toRaw === "project" ? process.cwd() : undefined,
      users,
      skillName,
      dryRun,
      force,
    });
  } catch (e: any) {
    console.error(`pull failed: ${e?.message ?? e}`);
    process.exit(1);
  }

  // Pretty output
  const dest = toRaw === "global" ? join(homedir(), ".claude", "skills") : `${process.cwd()}/.claude/skills`;
  const filterDesc = users.length === 0 ? "all users" : users.join(", ");
  console.log(`Destination: ${dest}`);
  console.log(`Filter:      ${filterDesc}${skillName ? ` · skill='${skillName}'` : ""}${dryRun ? " · dry-run" : ""}${force ? " · force" : ""}`);
  console.log(`Scanned ${summary.scanned} remote skill(s).`);
  for (const e of summary.entries) {
    const tag = e.action === "wrote" ? "✓ wrote" : e.action === "dryrun" ? "→ would write" : "· skipped";
    const ver = e.localVersion === null ? `v${e.remoteVersion} (new)` : `v${e.localVersion} → v${e.remoteVersion}`;
    console.log(`  ${tag.padEnd(15)} ${e.name.padEnd(40)} ${ver.padEnd(20)} (${e.author}/${e.sourceAgent})`);
  }
  console.log(`Result: ${summary.wrote} written, ${summary.dryrun} dry-run, ${summary.skipped} skipped.`);
}

export function runSkilifyCommand(args: string[]): void {
  const sub = args[0];
  if (!sub || sub === "status") { showStatus(); return; }
  if (sub === "scope")   { setScope(args[1] ?? ""); return; }
  if (sub === "install") { setInstall(args[1] ?? ""); return; }
  if (sub === "promote") { promoteSkill(args[1] ?? "", process.cwd()); return; }
  if (sub === "pull") {
    pullSkills(args.slice(1)).catch(e => {
      console.error(`pull error: ${e?.message ?? e}`);
      process.exit(1);
    });
    return;
  }
  if (sub === "team") {
    const action = args[1];
    if (action === "add")    { teamAdd(args[2] ?? ""); return; }
    if (action === "remove") { teamRemove(args[2] ?? ""); return; }
    if (action === "list")   { teamList(); return; }
    console.error("Usage: hivemind skilify team <add|remove|list> [name]");
    process.exit(1);
  }
  if (sub === "--help" || sub === "-h" || sub === "help") { usage(); return; }
  console.error(`Unknown skilify subcommand: ${sub}`);
  usage();
  process.exit(1);
}

// Run as a standalone script only when invoked directly via Node — not when
// imported by the unified CLI (`bundle/cli.js`). Identify by the entry
// script's filename, the same pattern auth-login.ts uses.
if (process.argv[1] && process.argv[1].endsWith("skilify.js")) {
  runSkilifyCommand(process.argv.slice(2));
}
