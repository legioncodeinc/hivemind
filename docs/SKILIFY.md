# Skills (skilify)

Hivemind **codifies recurring patterns from your team's recent sessions into reusable skills** that propagate to every agent on your team — automatically. Same architecture as the wiki worker: an async background process that fires on Stop / SessionEnd, mines recent sessions in scope, asks Haiku whether the activity contains something worth keeping, and writes a `SKILL.md` if so.

## When the skilify worker fires

| Trigger          | When it fires                                                                  |
|------------------|--------------------------------------------------------------------------------|
| **Stop counter** | Mid-session, after every `HIVEMIND_SKILIFY_EVERY_N_TURNS` (default 20) turns. |
| **SessionEnd**   | Always at end-of-session, regardless of counter — catches tail-of-session knowledge. |

Per-project counter state lives at `~/.deeplake/state/skilify/<project-key>.json`. Project key is the sha1 of `git config remote.origin.url` (with the absolute path as fallback for non-git dirs).

## How a skill is generated

1. The worker pulls the **last 10 sessions in scope** from the `sessions` Deeplake table — strictly newer than the watermark in the state file.
2. It strips each session to **prompt + assistant text only** (tool calls and thinking blocks are dropped — they're noise for skill mining).
3. It builds a gate prompt: existing project skill bodies + the 10 stripped exchanges + decision rules.
4. It runs `claude -p haiku --permission-mode bypassPermissions` with the prompt. The model returns a JSON verdict:
   - `KEEP <name> <body>` — write a new skill.
   - `MERGE <existing-name> <merged-body>` — update an existing skill, bump version.
   - `SKIP <reason>` — pattern is one-off / generic / already covered.
5. On KEEP/MERGE the skill is written to `<project>/.claude/skills/<name>/SKILL.md` (or `~/.claude/skills/...` if you've set `install` to `global`), with provenance frontmatter (`source_sessions`, `version`, `created_by_agent`, timestamps).
6. A row is also inserted into the `skills` Deeplake table for org-wide provenance (append-only — never UPDATE, sidesteps the UPDATE-coalescing quirk).

## `/skilify` — managing scope, team, install location

The `/skilify` slash command (Claude Code, Codex) and the `hivemind skilify` CLI control mining behaviour.

```bash
hivemind skilify                            # show current scope, team, install, per-project state
hivemind skilify scope <me|team|org>        # who counts as "in scope" for mining
hivemind skilify install <project|global>   # where new skills are written
hivemind skilify promote <skill-name>       # move a project skill to ~/.claude/skills/
hivemind skilify team add <username>        # add to the team list (used when scope=team)
hivemind skilify team remove <username>     # remove from team
hivemind skilify team list                  # list current team members
```

The team list flows into the worker's session-fetch SQL: `scope=me` filters by your own username, `scope=team` filters by `author IN (<team>)`, `scope=org` applies no author filter.

Config persists at `~/.deeplake/state/skilify/config.json` (one global file shared across projects).

## `pull` / `unpull` — sharing skills across the org

Once a teammate's skills are mined into the Deeplake `skills` table, you can install them locally with `pull`. Layout written to disk:

```text
<root>/<name>--<author>/SKILL.md      ← pulled skills (e.g. deploy--alice/)
<root>/<name>/SKILL.md                ← your locally-mined skills (flat, no suffix)
```

The `--<author>` suffix keeps cross-author entries with the same name disjoint and lets Claude Code's single-depth skill loader find pulled skills without any symlink trickery. `<root>` is `~/.claude/skills` for `--to global` and `<cwd>/.claude/skills` for `--to project`.

```bash
hivemind skilify pull                                # all authors, install globally
hivemind skilify pull --user alice@example.com       # only this author
hivemind skilify pull --users a@x.com,b@y.com        # multiple authors (CSV)
hivemind skilify pull --all-users                    # explicit "no author filter" (default)
hivemind skilify pull --to project                   # install under <cwd>/.claude/skills
hivemind skilify pull --dry-run                      # preview, no disk writes
hivemind skilify pull --force                        # overwrite even when local version >= remote
hivemind skilify pull <skill-name>                   # pull only that skill (combinable with --user)
```

Every successful pull records an entry in `~/.deeplake/state/skilify/pulled.json`. That manifest is the source of truth for `unpull` — anything not in the manifest is **never** touched by default, even if its directory follows the `<name>--<author>` shape (this protects user-authored variant skills like `deploy--blue-green`).

```bash
hivemind skilify unpull                              # remove every pulled entry under the install scope
hivemind skilify unpull --user alice@example.com     # remove only this author's pulls
hivemind skilify unpull --users a@x.com,b@y.com      # multiple authors
hivemind skilify unpull --not-mine                   # remove all pulls except your own
hivemind skilify unpull --dry-run                    # preview, no disk writes
hivemind skilify unpull --to project                 # operate on <cwd>/.claude/skills instead of global
hivemind skilify unpull --all                        # ALSO remove flat-layout (locally-mined) skills — destructive
hivemind skilify unpull --legacy-cleanup             # ALSO remove pre-`--author`-layout `<projectkey>/` dirs from older skilify versions
```

Drift handling: if a manifest entry's directory was deleted out-of-band (e.g. `rm -rf` by hand), the next `unpull` reports it as `manifest-orphan` and prunes the entry from the manifest without errors.

Cross-project caveat: same `(name, author)` from two different projects collides on disk under the new flat layout — the more recently pulled row wins, and the prior `SKILL.md` is preserved as `SKILL.md.bak`. The underlying row stays in the Deeplake `skills` table, so re-pulling from the other project recovers it.

## Configuration

| Env var                              | Default | Effect                                                  |
|--------------------------------------|---------|---------------------------------------------------------|
| `HIVEMIND_SKILIFY_EVERY_N_TURNS`     | `20`    | Stop-counter threshold for mid-session worker fires     |
| `HIVEMIND_SKILLS_TABLE`              | `skills`| Deeplake table name for org-wide provenance             |
| `HIVEMIND_SKILIFY_WORKER=1`          | unset   | Recursion guard (set automatically inside the worker)   |
| `HIVEMIND_CURSOR_MODEL`              | `auto`  | (cursor only) model passed to the cursor-agent gate call |
| `HIVEMIND_HERMES_PROVIDER`           | `openrouter` | (hermes only) provider passed to the hermes gate call |
| `HIVEMIND_HERMES_MODEL`              | `anthropic/claude-haiku-4-5` | (hermes only) model passed to hermes |

## Per-agent gate CLI

The skilify worker calls each agent's own headless CLI for the gate prompt — so a user who only has codex / cursor / hermes installed never needs `claude` in their PATH:

| Agent       | Gate command                                                                          |
|-------------|----------------------------------------------------------------------------------------|
| claude_code | `claude -p <prompt> --no-session-persistence --model haiku --permission-mode bypassPermissions` |
| codex       | `codex exec --dangerously-bypass-approvals-and-sandbox <prompt>`                       |
| cursor      | `cursor-agent --print --model <HIVEMIND_CURSOR_MODEL> --force --output-format text <prompt>` |
| hermes      | `hermes -z <prompt> --provider <HIVEMIND_HERMES_PROVIDER> -m <HIVEMIND_HERMES_MODEL> --yolo --ignore-user-config` |

For hermes via OpenRouter (the default), set `OPENROUTER_API_KEY` in the environment; the worker inherits the parent process env. Other providers (anthropic, openai, etc.) need their respective API keys.

## Logs

Worker activity logs to `~/.claude/hooks/skilify.log`. Each line shows which session pool was mined, what the gate decided, and whether a file was written.
