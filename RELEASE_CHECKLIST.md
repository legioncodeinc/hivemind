# Pre-Release Checklist

Before merging any new feature into `main` (and especially before cutting an
npm release), walk through this list. Every item here corresponds to a real
gap that has slipped past us in past PRs — most recently the skilify
discovery + cherry-pick e2e gap on PR #98.

The list is **the same regardless of feature size**. Don't skip sections
because the change feels "small" — the cheapest bugs to ship are the ones
nobody thought to look for.

---

## 0. Surface inventory (do this first)

Before testing, write down on paper every surface the feature exposes. You
can't test what you haven't enumerated.

- [ ] List every public CLI subcommand (`hivemind <cmd>`, `hivemind <cmd> <sub>`)
- [ ] List every flag / option for each subcommand (`--user`, `--users`, `--all-users`, `--to`, `--dry-run`, `--force`, positional args, …)
- [ ] List every code path in the worker / hook (success, skip, error, retry, lazy-create)
- [ ] List every SQL statement the feature emits (INSERT / SELECT / UPDATE / CREATE / DROP)
- [ ] List every env var the feature reads (`HIVEMIND_*`, `HOME`, etc.)
- [ ] List every file the feature writes / reads on disk (state files, locks, SKILL.md, etc.)

If the inventory is short, the feature is small and tests should be quick.
If it's long, expect proportional test coverage.

---

## 1. Unit tests (mock the network, exercise the code)

- [ ] Every public function in `src/<feature>/*.ts` has at least one direct test
- [ ] Tests **import the real module**, not a re-implementation
- [ ] Mock only at the network seam (the `query()` callback, `fetch`, `execFileSync`)
- [ ] Assert on **shape AND count** of emitted SQL statements (e.g. `expect(calls).toHaveLength(2)`) — historical bugs were "accidental second UPDATE"
- [ ] Cover both branches of conditional SQL (UPDATE-when-exists vs INSERT-when-not)
- [ ] Test negative patterns explicitly: `expect(sql).not.toMatch(/UPDATE.*SET description/)` for known anti-patterns
- [ ] Per-file coverage threshold added in `vitest.config.ts` (`80/80/80/80` minimum, `90/90/90/90` for hot-path)
- [ ] `npm test` passes locally and total test count went up by the expected amount

---

## 2. Real end-to-end tests (live backend, NO mocks)

**This is the one that's been missed most often.** Unit tests on a mocked
`query()` prove the SQL string is correct; they do not prove that Deeplake
returns what you expect when you ask for it.

For every new SQL-touching surface:

- [ ] Sandbox-only: switch to `plugin_test_1 / test1` BEFORE running anything (`hivemind org switch plugin_test_1`)
- [ ] Use a **unique table name** per run (e.g. `<feature>_test_<timestamp>`) so parallel runs don't collide
- [ ] Drop the table in `finally` — script must clean up even when assertions fail
- [ ] Isolate `HOME` if the feature writes under `~/.claude/` or `~/.deeplake/` (use `mkdtempSync` + `env: { HOME: fakeHome, HIVEMIND_TOKEN: token, HIVEMIND_ORG_ID: orgId, HIVEMIND_WORKSPACE_ID: workspaceId, HIVEMIND_API_URL: apiUrl }`)
- [ ] Seed the table with rows that exercise **every branch** the SELECT will take (multiple authors, multiple versions, multiple `project_key`s, edge content like quotes / unicode / empty fields)
- [ ] Run **every flag combination** from your Section 0 inventory — not just the happy path
- [ ] Assert on the **filesystem result**, not just the CLI exit code
- [ ] Re-run the script: idempotency / skip behaviour must hold
- [ ] Assert on **count of files written** in addition to file content
- [ ] Run a **SQL injection probe** (`--user "x'; DROP TABLE memory; --"`) and confirm the seed table is intact afterwards
- [ ] Run with a **missing table name** and confirm graceful fallback (no stack trace)
- [ ] Run with an **invalid identifier** (`bad-name-with-dashes`) and confirm `sqlIdent` rejects it before any SQL fires

Reference: `/tmp/skilify-pull-e2e.mjs` (65/65 across 15 scenarios for `pull`).
Lives outside the repo by design — the e2e matrix is per-feature scratch.

---

## 3. Per-agent matrix (ALL SIX AGENTS — never just four)

Hivemind ships into **six** agent surfaces. A feature is not done until
every applicable surface is covered. Skipping one because "it's the
weird one" is how skilify shipped to Pi and OpenClaw blind on PR #98 —
the prior version of this section listed only the four hook-driven
agents and quietly excluded the other two.

| Agent | Source root | Hook surface | Worker mining | Inject discoverability | Notes |
|---|---|---|---|---|---|
| Claude Code | `src/hooks/`, `claude-code/bundle/` | full (5 hooks) | ✅ | ✅ session-start.ts | npm bin via `${CLAUDE_PLUGIN_ROOT}` |
| Codex       | `src/hooks/codex/`, `codex/bundle/` | full | ✅ | ✅ session-start.ts | npm bin via `$CODEX_PLUGIN_ROOT` |
| Cursor      | `src/hooks/cursor/`, `cursor/bundle/` | session-start + end + capture + pre-tool-use | ✅ | ✅ session-start.ts | no slash command surface |
| Hermes      | `src/hooks/hermes/`, `hermes/bundle/` | analogous to cursor | ✅ | ✅ session-start.ts | gate uses OpenRouter (`hermes -z`), NOT claude |
| **Pi**      | `pi/extension-source/hivemind.ts` (raw .ts, no bundle) | full (session_start, input, tool_result, message_end, session_shutdown) | ⚠️ partial — inject yes, worker firing TBD | ✅ inline in `CONTEXT_PREAMBLE` | self-contained extension; pi compiles the .ts at load time |
| **OpenClaw**| `openclaw/src/index.ts`, `openclaw/skills/SKILL.md` | gateway plugin (no agent sessions to mine) | ❌ N/A by design | ✅ in `openclaw/skills/SKILL.md` | runtime is HTTP/WebSocket gateway; agents consume openclaw, openclaw doesn't run sessions |

**Mining (worker firing on session end)** is only applicable when the
agent runs the user's sessions inside its own runtime. CC, Codex,
Cursor, Hermes, and Pi qualify; OpenClaw does not. So OpenClaw's
mining row is "N/A by design" — but its **discoverability** (the agent
on the other side of the gateway needs to know skilify exists) IS still
in scope, surfaced via SKILL.md.

**Discoverability (inject)** is in scope for all six. The injection
*mechanism* differs:
- CC/Codex/Cursor/Hermes: a string template inside `src/hooks/<agent>/session-start.ts` with `HIVEMIND_CLI` placeholder substitution
- Pi: a string template inside `pi/extension-source/hivemind.ts` (`CONTEXT_PREAMBLE` const)
- OpenClaw: a markdown section inside `openclaw/skills/SKILL.md`

For every feature that runs inside a hook (worker, capture, session-end):

For every feature that runs inside a hook (worker, capture, session-end):

- [ ] Source code lives in `src/hooks/{cc,codex,cursor,hermes}/<file>.ts` AND is wired into all four `*/bundle/` outputs by `esbuild.config.mjs`
- [ ] Each agent's bundle file shows up in the `Built: 11 CC + 10 Codex + 9 Cursor + 9 Hermes + 1 OpenClaw …` line after `npm run build`
- [ ] **Pi**: if the feature uses session lifecycle events, mirror the change in `pi/extension-source/hivemind.ts` (it subscribes to `session_start`, `input`, `tool_result`, `message_end`, `session_shutdown`). Pi ships as raw .ts — no bundle step, but the file IS the deployable artifact
- [ ] **OpenClaw**: if the feature has any agent-facing surface (commands, tools, discoverability text), update `openclaw/skills/SKILL.md` so the host agent learns about it. Mining-style features that need session lifecycle don't apply (openclaw has none) — document the limitation in the SKILL.md instead of pretending parity
- [ ] **Per-agent CLI dispatch is correct**: `findAgentBin` / `runGate` calls the right binary for each agent
  - Claude Code → `claude -p haiku-3-5` (or model from settings)
  - Codex → `codex exec --model gpt-5-codex-mini --no-history`
  - Cursor → `cursor-agent --print --model auto`
  - Hermes → `hermes -z` (uses OpenRouter under the hood, NOT claude)
  - Pi → no separate gate yet; see the Pi extension's worker section
  - **Never hard-code `claude` as the gate** — users without claude installed will silently get 0 results across the agents that have a gate
- [ ] e2e matrix script runs the feature end-to-end **once per agent** with a representative prompt that should trigger the new feature (Pi included if applicable)
- [ ] Verify the worker / hook actually fires for every agent (check Deeplake table for the inserted row, not just "no error")
- [ ] If the feature uses async hooks (Stop / SessionEnd), check both: parent process exits before async work completes is a real risk and has bitten us before (`claude -p` does not block on Stop hook)

Reference: `/tmp/skilify-e2e-matrix.mjs` exercised gate CREATE / MERGE / SKIP across the four hook-driven agents — but did NOT cover `pull` (gap closed by the dedicated pull e2e in Section 2), and did NOT cover Pi or OpenClaw at all (gap closed by the Pi inject + OpenClaw SKILL.md additions in commit `9d74db6`).

---

## 4. Discoverability: will the agent know the feature exists?

A feature that works flawlessly but that no agent will ever suggest is a
ghost feature. Every new CLI surface must land in **three** discovery
layers, mirroring the existing `auth-login` family:

- [ ] **`hivemind` binary registration** — `src/cli/index.ts` dispatches the new subcommand. Test: `hivemind <newcmd> --help` exits 0 with usage text (not "Unknown command")
- [ ] **`hivemind --help` USAGE block** — `src/cli/index.ts` `USAGE` constant has a section documenting the new family alongside `Account / org / workspace`
- [ ] **SessionStart injection** — all four `src/hooks/{,codex/,cursor/,hermes/}session-start.ts` blobs include a section listing the new commands. Use the `HIVEMIND_CLI` placeholder and `replace(/HIVEMIND_CLI/g, HIVEMIND_CLI)` substitution so the path is resolved at inject time
- [ ] **Slash command (OPTIONAL — decide explicitly)** — `claude-code/commands/<feature>.md` and `codex/commands/<feature>.md` register `/hivemind:<feature>` for user-typed invocation. Only add when there is a clear UX reason (e.g. parity with `/hivemind:login` for a top-level user action). If you do add one:
  - Use `node "${CLAUDE_PLUGIN_ROOT}/bundle/cli.js" <feature> $ARGUMENTS` (CC) and `node "$CODEX_PLUGIN_ROOT/bundle/cli.js" <feature> $ARGUMENTS` (Codex). **Never** the bare-binary form `hivemind <feature> $ARGUMENTS` — it assumes `npm i -g @deeplake/hivemind` which marketplace-installed users do not have, so the slash silently breaks
  - Cursor and Hermes do not support slash commands at all — those agents go through the CLI or natural-language inject only. Don't write slash commands you cannot deliver across all four agents unless the asymmetry is intentional
  - If the agent already has full coverage via SessionStart inject + `hivemind <feature>` CLI, the slash is pure UX and can be skipped (skilify chose to skip it on PR #98 — agent autonomous discovery + CLI cover the ground)
- [ ] **Bundle-scan guard test** — a vitest scans the SHIPPED `*/bundle/session-start.js` files and asserts the new section + the most-important flags are present. Protects against silent regressions on rebuild (see `claude-code/tests/skilify-session-start-injection.test.ts`)
- [ ] Optional: dedicated SKILL.md if the feature warrants a skill (Claude Code skills auto-load on description match)

If the feature is invocable but undiscoverable, no agent will surface it
spontaneously and the user has to know the exact incantation. This was
PR #98's biggest gap — `pull --user X`, `--to global`, `--dry-run` were
fully implemented and unit-tested but invisible to all four agents.

---

## 5. Security & input validation

For every new code path that takes user-controllable input and feeds it
into SQL / shell / filesystem:

- [ ] **SQL identifiers**: `sqlIdent(name)` on every table/column name interpolated into SQL. Throws on anything outside `[A-Za-z_][A-Za-z0-9_]*`. Stops `HIVEMIND_*_TABLE` config-injection attacks
- [ ] **SQL string literals**: `sqlStr(value)` (or `esc(value)`) on every user-controlled string in a SQL statement. Test with `"x'; DROP TABLE …; --"`
- [ ] **Path traversal**: `assertValidSkillName` (or equivalent) on any string used as a filesystem path component. Reject `..`, `/`, `\`, absolute paths, names >100 chars
- [ ] **Shell args**: POSIX single-quote escaping before `execSync`/`execFileSync`. Prefer `execFileSync` (no shell) over `execSync` whenever possible
- [ ] **Tmp-file modes**: 0o600 + explicit `chmodSync` on any tmp file containing tokens or secrets
- [ ] **Recursion guards**: `HIVEMIND_*_WORKER` env var gate at the top of every worker entry point so it cannot spawn itself

---

## 6. Backend quirks (Deeplake-specific)

- [ ] **UPDATE coalescing**: two rapid UPDATEs on the same row drop one silently (`row_count: 0` even though API returns 200 OK). Solution: single combined UPDATE per RMW, or append-only INSERT with `ORDER BY version DESC LIMIT 1` reads (skilify pattern)
- [ ] **Lazy table creation**: first INSERT against a missing table should `CREATE TABLE IF NOT EXISTS` then retry. Test path: drop the table, run the feature, confirm it self-heals
- [ ] **Missing-table error matching**: use the project's `isMissingTableError` regex. Do NOT match the bare phrase "does not exist" — that also fires for column errors
- [ ] **Lookup-index creation**: idempotent `CREATE INDEX IF NOT EXISTS` calls, but tolerate the duplicate-key warning that fires when two parallel sessions race to create the same index
- [ ] **403 / 502 from Cloudflare** during heavy testing: add retry+backoff to e2e seed scripts (real users won't hit this but tests can)

---

## 7. Test isolation & sandboxing

- [ ] **Never write to prod tables in `activeloop` / `hivemind` orgs** — hard rule. Default sandbox is `plugin_test_1 / test1 / <unique_table_name>`
- [ ] Every e2e seed script begins by reading the current org from `~/.deeplake/credentials.json` and refusing to run if it isn't the sandbox
- [ ] Every e2e seed script ends with `DROP TABLE` in `finally` (success OR failure)
- [ ] Local-FS tests use `mkdtempSync(tmpdir(), …)` and `rmSync(…, recursive: true)` — never write to the developer's real `~/.claude/skills/` or `~/.deeplake/memory/`
- [ ] When testing `--to global` style features that read `HOME`, override `HOME` to a `mkdtempSync` dir AND pass `HIVEMIND_TOKEN` etc. as env so the bundle still finds creds

---

## 8. Bundle-level guards (the build can drop your code)

Source-level tests prove the helper is correct. Bundle-scan tests prove
the build didn't drop / inline / regress the helper.

For every shipped artifact under `*/bundle/`:

- [ ] One vitest scans the relevant `*/bundle/*.js` files and asserts they contain the required strings, function names, or SQL fragments
- [ ] `npm run build` is run BEFORE these tests in CI (otherwise stale bundles pass)
- [ ] If you remove a worker or hook, also remove its bundle scan — orphaned bundles silently pass

Examples in tree:
- `claude-code/tests/wiki-worker-upload-sql.test.ts` — rejects standalone `UPDATE … SET description = …`
- `claude-code/tests/skilify-bundle-scan.test.ts` — per-agent skilify-worker presence
- `claude-code/tests/skilify-session-start-injection.test.ts` — per-agent SKILLS injection
- `claude-code/tests/periodic-summary-bundles.test.ts` — lock-acquire wiring + flag rename

---

## 9. CodeRabbit review

- [ ] Open the PR with `gh pr create` using the structured template (Summary / Test plan)
- [ ] Wait for CodeRabbit to post inline comments (~5 min)
- [ ] Address **all Critical** comments (security, data loss, crash bugs)
- [ ] Address **all Major** comments (correctness, missing validation, regressions)
- [ ] Decide on Minor / Nitpicks per case — defend with a PR comment if you choose to skip
- [ ] Each batch of fixes lands as **its own atomic commit** with a focused subject — not amended into prior commits
- [ ] Re-run `npm test` + the e2e matrix after every fix batch

---

## 10. Final sign-off

- [ ] `npm test` → all green, count went up by the expected amount
- [ ] `npm run build` → "Built: N CC + N Codex + …" line shows expected bundle count, no errors
- [ ] Per-feature e2e script → 100% PASS
- [ ] Per-agent matrix script → all 4 agents triggered the feature successfully
- [ ] CodeRabbit Critical + Major addressed
- [ ] PR description has Summary + Test plan + e2e PASS counts
- [ ] Sandbox tables dropped, fakeHome dirs cleaned, no scratch state left over
- [ ] Local config reverted (if you switched org / table / etc. for testing)
- [ ] Memory updated with any new feedback rule the user established during the PR

---

## What we missed on PR #98 (skilify), retrospectively

So this checklist is grounded, not theoretical. On the original skilify PR
we passed every section EXCEPT:

- **Section 2** — only the gate write path was e2e-tested; `pull --user`, `pull --users`, `pull --all-users`, `pull --to global`, `pull --dry-run`, `pull --force`, positional name, SQL injection, missing table, invalid identifier all relied on mocked unit tests until we did the dedicated pull e2e (65 assertions across 15 scenarios)
- **Section 4** — the SessionStart injection was never extended for skilify, even though `auth-login` already had its parallel section. All four agents shipped without any way to discover `hivemind skilify pull --user X` or its variants. Closed by commits `64b25eb` + `e5c5987`.
- **Section 4 (slash command)** — initial slash command files (`claude-code/commands/skilify.md`, `codex/commands/skilify.md`) used the bare-binary form `hivemind skilify $ARGUMENTS`, which silently fails for marketplace-installed users (no global `hivemind` bin). After deciding the SessionStart inject + CLI cover the ground, both files were removed rather than fixed — keeping the surface honest across the 4 agents (Cursor and Hermes never had slash commands anyway). Reviewer Kaghni surfaced this on PR comment 3196839552.
- **Section 3 (per-agent matrix scope)** — the matrix in this checklist initially listed only **four** agents (CC / Codex / Cursor / Hermes). Pi has the full session lifecycle (`session_start` … `session_shutdown`) via its extension API and was simply forgotten. OpenClaw has a different model (gateway, not session runner) but its agent-facing SKILL.md was also untouched. Both were closed when the user asked "Abbiamo coperto anche OpenClaw e Pi?" and forced the surface to grow from 4 to 6. The matrix table in Section 3 now explicitly enumerates all six.

Four gaps caught only because the user asked the right cynical
questions ("ha funzionato tutto davvero?" / "will cc codex etc know?" /
"non ci serve" on the slash command / "Abbiamo coperto anche OpenClaw
e Pi?"). This file exists so the next PR doesn't depend on luck.
