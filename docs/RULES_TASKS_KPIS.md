# Rules + tasks + KPI events (cross-agent)

Hivemind shares **team-wide rules** ("never DROP TABLE on prod") and
**per-team/per-user tasks** (with agent-generated KPIs) across every
agent in the org. The rules and tasks are persisted in Deeplake;
SessionStart hooks inject a rendered block into every claude-code /
cursor / hermes session so the agent knows them from turn 1.

This doc covers the data model, the v1 contracts and known limitations,
the SessionStart injection format, the auto-extract pipeline, KPI LLM
generation, and the env vars. For a quick CLI reference see the
[README's "Rules + tasks" section](../README.md#rules--tasks-cross-agent-kpis).

## Data model — 3 Deeplake tables

```text
hivemind_rules           — team-wide principles (no scope flexibility)
  scope = 'team' (hardcoded)
  status: active | done
  immutable + version-bumped (skills-table pattern)

hivemind_tasks           — personal or team work items
  scope: me | team
  status: active | done
  assigned_to + assigned_by (both user-identifier strings)
  kpis: JSONB array of { kpi_id, name, target, unit, generated_by, generated_at }
  immutable + version-bumped

hivemind_task_events     — append-only progress stream
  task_id, kpi_id, value (BIGINT), note, source, agent, ts, task_version
  source: 'agent' | 'user' | 'auto-extract'
  KPI current value = SUM(value) WHERE task_id=? AND kpi_id=?
```

**Why three tables and not one:** rules and tasks have different
lifecycle (rules don't get assignees; tasks don't get the "always
team" scope). Events need a different write shape (append-only) to
sidestep the Deeplake UPDATE-coalescing bug at high churn.

**Why immutable + version-bump for rules and tasks:** the Deeplake
backend silently coalesces two rapid UPDATEs on the same row
(documented in the top-level CLAUDE.md "UPDATE coalescing" note).
INSERT-with-version-bump sidesteps the bug entirely; reads
`ORDER BY version DESC LIMIT 1` per stable id. Same precedent as
the `skills` table.

## CLI surface

```bash
hivemind rules add "<text>" [--scope team]
hivemind rules list [--status active|done|all] [--limit N]
hivemind rules edit <rule-id> "<new text>"
hivemind rules done <rule-id>

hivemind tasks add "<text>" [--scope me|team] [--assign <user>]
hivemind tasks list [--mine|--team|--all] [--status active|done|all] [--limit N]
hivemind tasks edit <task-id> "<new text>"
hivemind tasks done <task-id>
hivemind tasks assign <task-id> <user>
hivemind tasks progress <task-id> <kpi-id> --value N [--note "..."]
hivemind tasks report [<task-id>]

hivemind context     # print the SessionStart inject block on demand
```

### `<user>` identity contract

Every `<user>` value (whether for `--assign` or `assign`) must match
the target user's `cfg.userName` exactly. The string IS the
identifier — comparisons are `===`. If your org's login persists
`userName` as the email local-part ("alice"), passing
"alice@activeloop.ai" to `--assign` will silently break the
assignee's `tasks list --mine` view because the filter doesn't fuzzy-
match. v1 keeps the strict contract; a proper `userEmail` field on
Config (with login backfill) is tracked as a v1.1 follow-up.

### Round-trip safety: full IDs in `list` output

`rules list` and `tasks list` print the FULL 36-char UUID (no
truncation) so users can copy-paste straight into `edit` / `done` /
`assign` / `progress` — all of which do exact-match SELECTs.

## SessionStart injection

The injected block lives in `src/hooks/shared/context-renderer.ts`
and is appended to the existing DEEPLAKE MEMORY context by each
per-agent SessionStart hook. Status per agent:

| Agent       | Injected? | Why                                            |
|-------------|-----------|------------------------------------------------|
| claude-code | yes       | `additionalContext` is model-only              |
| cursor      | yes       | `additional_context` is model-only             |
| hermes      | yes       | `context` is model-only                        |
| codex       | NO        | `additionalContext` is rendered in TUI history; a 30-line block on every session would clobber the user view |
| pi          | NO (CLI)  | No SessionStart hook in v1; call `hivemind context` from the model on demand |
| openclaw    | NO (CLI)  | Same as pi                                     |

A v1.1 follow-up will add a compact codex-friendly inject (model-only
channel or opt-in banner). Until then, codex agents discover rules /
tasks via the `hivemind rules list` / `hivemind tasks list` /
`hivemind tasks report` CLIs.

### Block format

```text
=== HIVEMIND RULES (N active) ===
- <rule_id>: <text>
(X more — run 'hivemind rules list' to see all)

=== HIVEMIND TASKS (N active) ===
[team] <task_id>: <text> ★YOU | PRs merged: 3/5 count
[me]   <task_id>: <text>      | Lines reviewed: 75/200 lines
(X more — run 'hivemind tasks list' to see all)

=== HIVEMIND HOW-TO ===
- Rules above are team principles. ...
- Tasks above are your current work. ...
- Run 'hivemind rules list' / 'hivemind tasks list' for the full inventories.
```

### What the renderer fetches

3 SQL round-trips per SessionStart:

1. `listRules({ status: 'active', limit: 40 })` — over-fetch so the
   "X more" hint can give a useful count.
2. `listTasks({ scope: 'team', status: 'active', limit: 40 })` — all
   team tasks across the org.
3. `listTasks({ scope: 'mine', current_user, status: 'active', limit: 40 })` —
   me-tasks assigned to the current user only.

Plus a 4th if there are tasks to display: one batched
`computeAllForTasks({ task_ids: [...] })` aggregate that returns
`{ task_id → { kpi_id → SUM(value) } }` for every displayed task.

The two task queries are deliberately separate (instead of one
`scope='all'` query filtered in JS): a global cap before filtering
would silently drop a user's task under a wave of newer private tasks
owned by other users. The two-query design preserves visible-to-me
tasks regardless of org noise.

### Failure modes (graceful degradation)

`renderContextBlock` returns `""` on any error so SessionStart never
fails because of a bad rules/tasks read. Per-section sub-tries
isolate failures:

- Rules SELECT fails → rules stay `[]`; tasks section still renders.
- Tasks SELECT fails → tasks stay `[]`; rules section still renders.
- Aggregate SELECT fails (e.g. `hivemind_task_events` not created
  yet) → totals stay `{}`; every KPI renders as `0/target`.

All three sections failing returns `""` and the SessionStart inject
omits the block.

## Auto-extract pipeline

`src/hooks/auto-extract-patterns.ts` defines an allow-list of shell
command regexes. v1 ships exactly ONE pattern:

```text
gh pr merge   →   +1 KPI event (orphan in v1)
```

The PostToolUse hook in `src/hooks/capture.ts` runs every Bash
command through `matchCommand`. On a match, it appends an orphan
event row (`task_id=""`, `kpi_id=""`, `source='auto-extract'`) to
`hivemind_task_events`.

### Why orphan, not bound

v1 has no notion of "current task." Auto-extract records the event
in the audit log but doesn't credit any specific KPI. A v1.1
`hivemind events attribute <event-id> <task-id> <kpi-id>` command
will bind retroactively.

### What's intentionally excluded

- `git push` — too noisy (force-pushes, personal branches, drafts).
- `gh pr merge --auto` — exits 0 but the PR isn't actually merged
  yet; would inflate counts for PRs that may never merge.
- Failed merges (`exit_code != 0`, `interrupted: true`, `is_error:
  true`) — the hook inspects `tool_response` and skips emission.

Adding patterns: each addition needs paired true-positive and
false-positive tests in `tests/shared/auto-extract.test.ts`. The
tiny allow-list is the design — pattern-matching shell commands for
intent is inherently brittle; we'd rather miss events than count
them wrong.

## KPI LLM generation

`hivemind tasks add` calls Claude Sonnet to produce 1-3 KPIs from the
task text. Implementation: `src/tasks/kpi-generator.ts`.

### Prompt shape

The system prompt instructs the model to return a JSON array of KPI
objects with these six fields:

- `kpi_id` (stable short id, e.g. `k_pr_merged`)
- `name` (human-readable)
- `target` (positive integer)
- `unit` (short, e.g. `count` / `lines` / `tests`)
- `generated_by` (model id)
- `generated_at` (ISO 8601)

Defensive cleanup before validation:

- Strip ` ```json ` / ` ```jsonc ` / ` ``` ` fences.
- Backfill `generated_by` + `generated_at` if the model omits them.
- Route through `parseKpis` for shape validation.
- Truncate to MAX_KPIS = 3.

### Two-pass parsing

1. Initial call with the standard prompt.
2. If `JSON.parse` fails OR the result isn't an array, ONE retry
   with a stricter system prompt: "Output ONLY the JSON array. No
   prose, no markdown fences."

### Failure modes (all return `[]`)

- `HIVEMIND_KPI_LLM=disable` — explicit opt-out.
- `ANTHROPIC_API_KEY` missing — silent no-op.
- SDK dynamic-import failure.
- LLM call timeout (default 10s).
- Two parse failures in a row.
- Any other unexpected error.

Returning `[]` means `insertTask` still works — the task INSERTs
with empty kpis, and the user can record progress manually via
`hivemind tasks progress`.

### Eval suite

`tests/evals/kpi-generation.eval.ts` runs the real LLM against 5
canonical task inputs. It's manually-run (not picked up by `npm
test`); see `tests/evals/README.md` for the cadence and bump
workflow.

## Env vars

| Var                                | Default                | Effect                                              |
|------------------------------------|------------------------|-----------------------------------------------------|
| `HIVEMIND_RULES_TABLE`             | `hivemind_rules`       | Rules table name                                    |
| `HIVEMIND_TASKS_TABLE`             | `hivemind_tasks`       | Tasks table name                                    |
| `HIVEMIND_TASK_EVENTS_TABLE`       | `hivemind_task_events` | Task-events table name                              |
| `HIVEMIND_KPI_MODEL`               | `claude-sonnet-4-6`    | Model for KPI generation                            |
| `HIVEMIND_KPI_LLM`                 | (unset)                | `disable` skips LLM call; any other value is ignored |
| `ANTHROPIC_API_KEY`                | (unset)                | Required for KPI LLM gen; absence is silent no-op   |
| `HIVEMIND_CAPTURE`                 | (unset)                | `false` enables full read-only mode (no DDL, no INSERTs); renderer still runs |

## Known v1 limitations

- **Identity is a TEXT string, not a structured email.** `<user>`
  must match `hivemind whoami` exactly. v1.1 candidate: add
  `userEmail` to `Config`, backfill via login.
- **Auto-extract events are orphan.** They go into the audit log but
  don't count toward any specific KPI. v1.1 candidate: `hivemind
  events attribute`.
- **Codex doesn't get SessionStart injection.** Discovers via CLI.
  v1.1 candidate: compact codex-friendly inject.
- **pi / openclaw don't get SessionStart injection.** Fall back to
  `hivemind context`. v1.1 candidate: per-platform hook integration.
- **Concurrent v=N+1 race on edits.** Two concurrent editors can
  produce duplicate v=N+1 rows; the `(version DESC, created_at DESC)`
  tie-break makes the resolved-latest deterministic but the
  duplicates remain in the audit trail.
- **Cross-agent event dedup.** Two agents on the same machine
  emitting the same event produce two rows. v1.1 candidate: client-
  side dedup by `(kpi_id, source, ts_minute_bucket)`.
