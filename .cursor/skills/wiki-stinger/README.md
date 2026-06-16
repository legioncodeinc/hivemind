# wiki-stinger — Companion Resources

This directory holds everything the `wiki-worker-bee` Bee needs to do its job. Organized into six layers: **guides** (procedural rules), **references** (cheat sheets loaded on demand), **templates** (page seeds copied per write), **examples** (worked invocations to mirror), **reports** (output shapes and past runs), **research** (audit trail for the guides).

> **Agent entry point:** [`legion/.cursor/agents/wiki-worker-bee.md`](../../agents/wiki-worker-bee.md) (repo-local). The agent reads files from this directory by path; it does not auto-load everything into context.
>

## Directory map

```
wiki-stinger/
├── SKILL.md                    # thin Cursor-skill wrapper, points here
├── README.md                   # you are here — navigation
├── guides/                     # procedural rules — agent MUST read the matching guide before acting
│   ├── 00-principles.md
│   ├── 01-canonical-invocation.md       (added in follow-up pass)
│   ├── 02-direct-invocation.md          (added in follow-up pass)
│   ├── 03-the-six-phases.md
│   ├── 04-entity-extraction-by-type.md  (added after research)
│   ├── 05-atomic-page-rule.md           (added in follow-up pass)
│   ├── 06-contradiction-protocol.md
│   ├── 07-adr-detection.md              (added after research)
│   ├── 08-stub-pages-for-non-js.md      (added in follow-up pass)
│   ├── 09-lint-mode.md                  (added after research)
│   └── 10-response-payload.md           (added in follow-up pass)
├── references/                 # cheat sheets — loaded on demand
│   ├── parallel-subagent-contract.md
│   ├── frontmatter-schema.md
│   └── contradiction-protocol.md
├── templates/                  # page seeds — copy per write
│   ├── entity.md
│   ├── concept.md
│   ├── comparison.md
│   ├── question.md
│   ├── decision.md
│   └── contradiction-report.md
├── examples/                   # worked invocations (populated in follow-up)
│   └── README.md
├── reports/                    # output templates and past runs
│   └── README.md
└── research/                   # source material — audit trail
    ├── research-plan.md
    └── 2026-04-29-*.md         (13 research notes from web_search_exa)
```

## Decide first: which mode is this invocation?

wiki-worker-bee operates in four modes. The TS driver sets `mode` in the structured payload; for `@`-mention invocations infer the mode from user intent (and confirm with the user before writing per [`guides/02-direct-invocation.md`](guides/02-direct-invocation.md)).

| Mode | When | Write side effects |
|---|---|---|
| `document` | Initial scan, no prior wiki state for this chunk | Creates entity / concept / decision / comparison pages from scratch |
| `update` | Incremental scan, prior state exists | Compares against prior, applies contradiction protocol, updates entity pages |
| `scan-directory` | User-targeted subtree scan | Same as document/update for the named subtree only |
| `lint` | Audit-only, no writes | Produces a `meta/<date>-lint-report.md` only |

## The six phases (non-lint modes)

1. **Parse the chunk** — `ts-morph` for `.ts/.tsx/.js/.jsx`; filename-only stub pages for other languages.
2. **Cross-reference against prior state** — flag mismatches as contradictions for Phase 6.
3. **Author entity pages** — one per callable code unit, ≤300 lines, full frontmatter, source citations.
4. **Author concept pages** — one per data flow / pattern / shared convention.
5. **Detect and file ADRs from commit messages** — high-confidence only; low-confidence goes to `questions/`.
6. **Apply active contradiction protocol** — four artifacts every time.

Full procedure: [`guides/03-the-six-phases.md`](guides/03-the-six-phases.md).

## The non-negotiables

Read [`guides/00-principles.md`](guides/00-principles.md) before any write. Summary:

- Never touch `index.md`, `<type>/_index.md`, `log.md`, `hot.md`, `.legion/file-hashes.json` — TS driver owns global state.
- Active contradiction protocol mandatory (`[!stale]` + `[!contradiction]` + meta report + notification flag) — incomplete handling is a bug.
- Never fabricate ADRs, relationships, or git facts.
- ≤300 lines per page; split if exceeded.
- Always cite source `file:line`.
- Repo-relative paths only; never absolute.
- Read-only against the codebase.
- Direct `@`-mention invocation: confirm scope before writing; flag `partial_scan: true` in the response.

## Guides — which one to read

The agent dispatches based on invocation mode and intent. Read the matching guide in full before acting.

| User intent / driver mode | Read |
|---|---|
| any invocation, first time this session | [`guides/00-principles.md`](guides/00-principles.md) |
| `document` / `update` / `scan-directory` mode | [`guides/03-the-six-phases.md`](guides/03-the-six-phases.md) |
| Phase 6 (contradiction handling) | [`guides/06-contradiction-protocol.md`](guides/06-contradiction-protocol.md) |
| invoked via `@`-mention by a Cursor user | `guides/02-direct-invocation.md` (follow-up), then mode-specific |
| invoked via TS driver | `guides/01-canonical-invocation.md` (follow-up) |
| about to write any page | `guides/05-atomic-page-rule.md` (follow-up) |
| chunk includes non-TS/JS files | `guides/08-stub-pages-for-non-js.md` (follow-up) |
| about to emit final response | `guides/10-response-payload.md` (follow-up) |
| `lint` mode | `guides/09-lint-mode.md` (follow-up, after research) |
| ADR detection from a commit | `guides/07-adr-detection.md` (follow-up, after research) |
| entity extraction tactics per type | `guides/04-entity-extraction-by-type.md` (follow-up, after research) |

## References — load on demand

| Need | Open |
|---|---|
| What NOT to touch (parallel sub-agent contract) | [`references/parallel-subagent-contract.md`](references/parallel-subagent-contract.md) |
| Full frontmatter schema by page type | [`references/frontmatter-schema.md`](references/frontmatter-schema.md) |
| Four-artifact contradiction protocol with examples | [`references/contradiction-protocol.md`](references/contradiction-protocol.md) |

## Templates — copy per write

| Writing a… | Open |
|---|---|
| entity page (function, class, service, component, queue, etc.) | [`templates/entity.md`](templates/entity.md) |
| concept page (data flow, pattern, convention) | [`templates/concept.md`](templates/concept.md) |
| ADR page (filed via Phase 5) | [`templates/decision.md`](templates/decision.md) |
| comparison page (alternative to existing pattern) | [`templates/comparison.md`](templates/comparison.md) |
| question page (gap or low-confidence ADR) | [`templates/question.md`](templates/question.md) |
| daily contradiction-report meta page | [`templates/contradiction-report.md`](templates/contradiction-report.md) |

All templates use Obsidian-flavored YAML frontmatter and `[[wikilinks]]` — both render natively in Cursor's preview pane and in any external Obsidian vault opened on the same folder.

## Reading order on first invocation

1. This README (navigation).
2. `guides/00-principles.md` (non-negotiables).
3. The mode-specific guide (per the table above).
4. `references/frontmatter-schema.md` before the first Phase-3 write.
5. `references/contradiction-protocol.md` before the first Phase-6 write.
6. `references/parallel-subagent-contract.md` once per session — internalize what NOT to touch.

## Sibling boundaries

- `library-worker-bee` writes module narratives at `library/knowledge-base/<module>/*.md`. wiki-worker-bee does not touch this folder. See [`legion/.cursor/skills/library-stinger/README.md`](../library-stinger/README.md).
- `quality-worker-bee` writes QA reports under `library/qa/` and feature/issue `reports/` folders. wiki-worker-bee does not touch these.
- The TS driver (Legion VS Code extension) owns `index.md`, `<type>/_index.md`, `log.md`, `hot.md`, `.legion/file-hashes.json` inside `library/knowledge-base/wiki/`. wiki-worker-bee writes per-page content only.

## v2 (out of scope for v1)

- Tree-sitter for polyglot entity extraction (currently TS/JS-first via `ts-morph`; non-JS files get stub pages).
- DragonScale `wiki/folds/` log rollup mechanism.
- Embedding-based duplicate-page detection in lint mode.
- Hot cache (`hot.md`) is owned by the TS driver, not wiki-worker-bee.

## For the agent (self-operation notes)

When invoked:

1. Identify the invocation path: TS driver (canonical) or `@`-mention (escape hatch).
2. If `@`-mention, follow the direct-invocation guide first — echo the inferred chunk and wait for explicit user confirmation before any writes.
3. Read `guides/00-principles.md` once per session. Treat it as non-negotiable.
4. Read the mode-specific guide in full.
5. Execute the six phases (or lint procedure) per the guide.
6. On any Phase-3 write, copy the matching template and fill it in — do not author from scratch.
7. On Phase 6, all four artifacts must land — incomplete handling is a bug.
8. Emit the structured response payload.
9. On `@`-mention invocations, set `partial_scan: true`.
10. Never touch global state files. The TS driver reconciles `index.md`, `log.md`, `hot.md`, `<type>/_index.md`, and `.legion/file-hashes.json` after.
