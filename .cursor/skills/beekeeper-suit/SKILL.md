---
name: beekeeper-suit
description: Routing skill for the Cursor IDE Army. When the user makes a request, consult this skill to decide which Bee (subagent) owns the task and should be invoked. Each registered Bee has a guide in `guides/` describing its domain, trigger phrases, required inputs, outputs, and the situations in which it should NOT be invoked. Trigger this skill when the user's request looks like it might match an Bee's domain, when multiple Bees could plausibly handle the work, or when the user asks "who handles X?" / "which Bee does Y?".
---

# Beekeeper-Suit

The Beekeeper-Suit routing skill is how the primary Cursor orchestrator decides which Bee in the Army to delegate to. Each Bee owns one domain. Each Bee's domain is documented in a guide under `guides/`. This SKILL.md is the roster ? a one-line index pointing to each Bee's full guide.

**The Army's commitment:** every registered Bee is paired with exactly one Stinger (a Cursor skill). Bees are persona + guardrails; Stingers are the procedural arsenal. Read the guide before routing, and invoke the Bee by its `name:` frontmatter value.

---

## Roster

| Bee | Domain | Trigger keywords | Guide |
|---|---|---|---|
| `ai-tools-platform-worker-bee` | AI tooling infrastructure ? AI gateways (Portkey, OpenRouter), cloud providers (Bedrock, Vertex AI, Azure OpenAI), frontier model selection (Claude, GPT, Gemini), cheap-fallback routes (Haiku, Mini, Flash), local LLMs (Ollama, LM Studio), GPU cloud (Runpod, Modal, Together, Fireworks, Groq), and MCP servers + IDE plugins | "which AI provider should I use", "set up Portkey", "Ollama for local dev", "Runpod vs Modal", "which MCP servers do I need", "LLM spend is too high", "model selection", "cost optimize AI" | [`guides/ai-tools-platform-worker-bee.md`](guides/ai-tools-platform-worker-bee.md) |
| `api-docs-worker-bee` | API documentation authority -- Swagger UI / Redoc / Scalar / Mintlify / Stoplight / Bump.sh tool selection, OpenAPI spec enrichment with JSON examples, GitHub Pages / Netlify / Vercel / Docker hosting, SDK generation (TypeScript / Python / Go), and changelog discipline | "set up API docs", "Redoc vs Scalar", "generate a TypeScript SDK from my spec", "deploy OpenAPI to GitHub Pages", "write an API changelog", "Bump.sh CI gate" | [`guides/api-docs-worker-bee.md`](guides/api-docs-worker-bee.md) |
| `asset-worker-bee` | Universal Asset Registry ? every first-class asset (Features, Pages, Routes, Surfaces, Controls, DesignTokens, Icons, MediaAssets, FeatureFlags, Entitlements, etc.) and the code?DB sync that keeps them in lockstep | "register asset", "audit registry drift", "generate registry migration", "code-to-DB sync", "who owns this catalog asset" | [`guides/asset-worker-bee.md`](guides/asset-worker-bee.md) |
| `db-worker-bee` | PostgreSQL data architecture ? schema, indexing, zero-downtime migrations (expand-backfill-contract), partitioning, ORM choice (Drizzle vs Prisma vs raw), serverless platform pick (Supabase / Neon / Turso / PlanetScale / Cockroach / Tiger Data) | "design this schema", "review this migration", "is this index right?", "Drizzle vs Prisma", "Supabase vs Neon", "EXPLAIN ANALYZE help" | [`guides/db-worker-bee.md`](guides/db-worker-bee.md) |
| `design-system-worker-bee` | Bootstrap a complete design system from zero ? runs an aesthetic interview and materializes the canonical 7-artifact source of truth (brief, master tokens, utility layer, component specs, screen specs, HTML examples, README) | "build a design system", "bootstrap UI", "create tokens and utilities for product Y", "no design system yet" | [`guides/design-system-worker-bee.md`](guides/design-system-worker-bee.md) |
| `devops-worker-bee` | Container builds + CI/CD for Node / Next.js / TypeScript ? Dockerfile hygiene (multi-stage, BuildKit, secrets), Compose for dev, GitHub Actions architecture + security, Depot acceleration, image scanning, OIDC federation | "review my Dockerfile", "design our CI", "this build is slow", "migrate to Depot", "Compose for local dev", "we leaked a secret in CI" | [`guides/devops-worker-bee.md`](guides/devops-worker-bee.md) |
| `github-repo-health-worker-bee` | GitHub repository hygiene auditor -- branch protection rulesets, Conventional Commits adherence, CODEOWNERS coverage, CI workflow density, docs presence, .gitignore, issue/PR templates, and repo settings; produces a scored report with a priority-ranked remediation plan | "audit this repo", "repo health check", "check branch protection", "CODEOWNERS audit", "CI checks configured", "GitHub repo hygiene", "is our git workflow healthy" | [`guides/github-repo-health-worker-bee.md`](guides/github-repo-health-worker-bee.md) |
| `library-worker-bee` | Documentation lifecycle for `library/` ? scaffolds the canonical structure, ingests issues into IRDs, authors PRDs, reverse-engineers code into backwards-PRDs, maintains knowledge base, runs drift audits | "initialize the library", "write a PRD", "ingest GitHub issues", "backwards-PRD this module", "document Z in the knowledge base", "docs sync audit" | [`guides/library-worker-bee.md`](guides/library-worker-bee.md) |
| `knowledge-worker-bee` | Narrative knowledge docs under `library/knowledge/private/<domain>/` (system overviews, auth architecture, schema references, security trust-boundary diagrams, coding standards); works from ADRs and PRDs, never authors PRDs/IRDs/ADRs/QA | "document the auth architecture", "write the system overview", "create knowledge docs for this repo", "build out the knowledge base", "document how X works internally" | [`guides/knowledge-worker-bee.md`](guides/knowledge-worker-bee.md) |
| `mind-worker-bee` | Cognitive layer ? coach routing, 5-layer prompt cascade, RAG / GraphRAG (Qdrant + Cohere rerank), three-tier memory (Valkey ? Postgres ? Qdrant), AiTrace observability, evaluation, multimodal, matching, onboarding | "review AI code", "audit RAG", "investigate AiTrace", "add a coach", "tune retrieval", "trace a sycophancy spike", "enable GraphRAG" | [`guides/mind-worker-bee.md`](guides/mind-worker-bee.md) |
| `python-worker-bee` | Modern Python ? Django + Django Ninja + FastAPI + Celery + Channels + pytest + uv + Pydantic v2 + Ruff + pyright + httpx; ORM discipline (N+1), migrations (expand-backfill-contract), settings split, async, Django + React decoupled architecture | "review this Django code", "DRF to Django Ninja", "set up Celery", "enable Channels", "switch to Ruff", "migrate to uv", "audit ORM patterns" | [`guides/python-worker-bee.md`](guides/python-worker-bee.md) |
| `quality-worker-bee` | Quality assurance ? verifies a completed implementation against the source plan (completeness, correctness, alignment, regressions); final checkpoint of every plan execution loop, runs after `security-worker-bee` | "QA this", "check the implementation", "audit against the plan", "is this done?" | [`guides/quality-worker-bee.md`](guides/quality-worker-bee.md) |
| `security-worker-bee` | Security audit + remediation for React / Next.js / TS / Node ? OWASP Top 10 2025 manifestations, vibe-coding pitfalls, PII + financial-data exposure patterns; second-to-last step in every implementation plan, runs before `quality-worker-bee` | "audit for security", "check for vulnerabilities", "scan for PII exposure", "OWASP review", "fix this Critical finding" | [`guides/security-worker-bee.md`](guides/security-worker-bee.md) |
| `wiki-worker-bee` | Per-repo entity cartographer ? extracts 13-type entity catalog (function, class, module, service, endpoint, env-var, config-key, data-model, react-component, sql-table, queue, cron-job, feature-flag) into atomic markdown pages in `library/knowledge-base/wiki/` with `[[backlinks]]`, ADR detection from commit messages, active four-artifact contradiction protocol | TS driver: `mode: document / update / scan-directory / lint`. `@`-mention: "extract entities from {file/dir}", "document this module's exports", "add this to the wiki", "lint the wiki" | [`guides/wiki-worker-bee.md`](guides/wiki-worker-bee.md) |
| `agile-scrum-worker-bee` | Scrum methodology specialist - Sprint ceremonies, Scrum roles, estimation coaching (Fibonacci / Planning Poker / NoEstimates), Definition of Done templates, anti-pattern catalog, and framework selection (Scrum vs ScrumBan vs Kanban vs Shape Up); honesty-first "is this actually Scrum?" audit | "audit our Scrum process", "is this Scrum?", "write our DoD", "Sprint Planning help", "our retros don't produce anything", "should we switch to Kanban", "Scrum anti-patterns", "estimation coaching" | [`guides/agile-scrum-worker-bee.md`](guides/agile-scrum-worker-bee.md) |
| `dependency-audit-worker-bee` | Supply-chain security -- scanner selection (Dependabot, Renovate, Snyk, socket.dev, OWASP Dependency-Check), vulnerability triage, SBOM generation (Syft, CycloneDX), lockfile discipline, and provenance verification (npm Sigstore, PyPI PEP 740, Cargo) | "audit our dependencies", "set up Renovate", "Renovate vs Dependabot", "socket.dev supply chain", "generate an SBOM", "npm audit is noisy", "lockfile hygiene", "npm provenance", "supply chain security", "dependency scanning in CI" | [`guides/dependency-audit-worker-bee.md`](guides/dependency-audit-worker-bee.md) |
| `docs-site-worker-bee` | Documentation-site infrastructure -- platform selection (Docusaurus, Mintlify, GitBook, MkDocs Material in maintenance mode, Nextra, Starlight/Astro, Fern), Diataxis content pyramid, docs-as-code CI (Vale, lychee), search setup (Algolia DocSearch, pagefind), and migration playbooks | "pick a docs platform", "set up Docusaurus", "migrate from GitBook", "docs-as-code CI", "Mintlify vs Starlight", "add search to docs", "MkDocs Material maintenance", "set up developer documentation" | [`guides/docs-site-worker-bee.md`](guides/docs-site-worker-bee.md) |
| `slack-app-worker-bee` | Slack app development specialist -- Bolt SDK (JS/Python/Java), slash commands, Block Kit UI composition, modals, Events API, OAuth 2.0 multi-workspace install, App Directory submission, and Slack Marketplace policy (including Dec 2024 LLM training prohibition) | "build a Slack app", "add a slash command", "create a Slack modal", "set up Slack Events API", "multi-workspace OAuth install", "submit to Slack Marketplace", "Slack app review" | [`guides/slack-app-worker-bee.md`](guides/slack-app-worker-bee.md) |
| `branching-strategy-worker-bee` | Branching strategy advisor -- model selection (trunk-based development, GitHub Flow, GitFlow), release/hotfix branch patterns, the merge-vs-rebase argument, the long-lived-branch trap, and the feature-flag vs feature-branch decision | "which branching model should we use", "GitFlow or trunk-based?", "merge or rebase?", "should I use a feature flag or a branch?", "set up GitHub Merge Queue", "migrate from GitFlow" | [`guides/branching-strategy-worker-bee.md`](guides/branching-strategy-worker-bee.md) |
| `code-review-pr-worker-bee` | Code review culture and PR lifecycle -- PR descriptions, review checklists (blocker/suggestion/nit taxonomy), async-first review norms, the 400-line small-PR discipline, rubber-stamp detection, and the review-as-mentorship lens | "audit our PR culture", "write a PR description", "create a review checklist", "coach this review comment", "is this PR too large?", "how do we improve code review", "rubber-stamp detection" | [`guides/code-review-pr-worker-bee.md`](guides/code-review-pr-worker-bee.md) |
| `discovery-research-worker-bee` | Continuous product discovery coach -- Teresa Torres interview cadence, Opportunity Solution Trees (OST), Jobs-to-be-Done interviews, assumption mapping, and lightweight prototype experiment design | "run a discovery session", "build an OST", "write an interview script", "map our assumptions", "design a prototype experiment", "we don't know what to build", "continuous discovery" | [`guides/discovery-research-worker-bee.md`](guides/discovery-research-worker-bee.md) |
| `kanban-flow-worker-bee` | Kanban method specialist -- WIP limit design, flow-metric calculation (cycle time, lead time, throughput, flow efficiency), Little's Law diagnostics, visual-board design, class-of-service policies, and CFD interpretation | "set up WIP limits", "our WIP keeps climbing", "calculate cycle time", "apply Little's Law", "design our Kanban board", "Kanban vs Scrum", "why is our flow efficiency so low" | [`guides/kanban-flow-worker-bee.md`](guides/kanban-flow-worker-bee.md) |
| `okr-goal-setting-worker-bee` | OKR methodology -- writes, grades, and iterates Objectives + Key Results; enforces output-vs-input discipline; calibrates aspirational vs committed OKRs; runs quarterly cadence; distinguishes OKRs from KPIs and MBOs; adapts the framework for small teams | "write OKRs", "audit our OKRs", "are these KRs measurable?", "set up a quarterly goal cycle", "OKR vs KPI", "OKR for small team", "grade our OKRs", "our OKRs are sandbagged" | [`guides/okr-goal-setting-worker-bee.md`](guides/okr-goal-setting-worker-bee.md) |
| `retrospective-worker-bee` | Retrospective facilitator and follow-through enforcer -- format selection (Start/Stop/Continue, 4Ls, Sailboat, Mad/Sad/Glad), psychological safety pre-check, time-boxed facilitation, async retro design, and action-item discipline | "run a retro", "plan our retrospective", "which retro format should we use", "our retros produce no change", "help with action items from the retro", "how do we do an async retro" | [`guides/retrospective-worker-bee.md`](guides/retrospective-worker-bee.md) |
| `runbook-writing-worker-bee` | Operational runbook authorship specialist -- exact-command discipline, no-implied-context rule, escalation path architecture, rollback procedures, runbook-as-test (game day) methodology, and postmortem-to-runbook linkage | "write a runbook", "audit this runbook", "our runbooks are out of date", "we need a runbook for this alert", "turn this postmortem into a runbook", "schedule a game day" | [`guides/runbook-writing-worker-bee.md`](guides/runbook-writing-worker-bee.md) |
| `technical-writing-craft-worker-bee` | Documentation craft specialist -- Diataxis framework (tutorial/how-to/reference/explanation), inverted-pyramid prose, code-example discipline, voice and tone consistency, reader-lens diagnostic, ghostwriting discipline, and docs-as-code PR review workflow | "review this document", "is this doc well-written", "apply Diataxis", "ghostwrite this guide", "docs PR writing review", "rewrite this introduction", "code example review" | [`guides/technical-writing-craft-worker-bee.md`](guides/technical-writing-craft-worker-bee.md) |
| `ai-coding-tools-worker-bee` | AI coding tool advisor -- Cursor, Claude Code, Aider, Cline, Windsurf (Cognition AI), Continue.dev, Replit Agent, Devin 2.0, and Bolt.new across four autonomy tiers; selection rubric, SWE-bench benchmark data, model-routing patterns, per-tool prompt and context discipline, and footgun catalog | "which AI coding tool should I use", "Cursor vs Claude Code vs Aider", "set up Aider", "is Devin worth it", "reduce AI coding costs", "SWE-bench scores", "prompt discipline for Claude Code" | [`guides/ai-coding-tools-worker-bee.md`](guides/ai-coding-tools-worker-bee.md) |
| `knowledge-base-help-center-worker-bee` | Customer-facing knowledge base specialist -- platform selection (Intercom Articles, Help Scout Docs, ReadMe.com, Document360, HelpJuice, Zendesk Guide), search-first architecture, AI deflection (Fin standalone, llms.txt), versioning, multi-language, and the analytics-driven content-gap loop (CRAVA framework) | "pick a KB platform", "set up a help center", "migrate Zendesk Guide", "add AI deflection to our docs", "fix our search no-results", "localize our KB", "we need chat-with-your-docs", "set up llms.txt" | [`guides/knowledge-base-help-center-worker-bee.md`](guides/knowledge-base-help-center-worker-bee.md) |
| `markdown-mdx-content-pipeline-worker-bee` | Markdown/MDX content processing pipeline -- compiler selection (Velite, @next/mdx, @mdx-js/mdx), remark/rehype plugin chains, Shiki v4/expressive-code syntax highlighting, GFM, AST manipulation, custom directive plugins, math (KaTeX) and Mermaid/D2 diagram embedding, and XSS sanitization | "set up MDX", "configure Shiki", "write a remark plugin", "sanitize user markdown", "embed Mermaid diagrams", "migrate from next-mdx-remote", "Velite vs next-mdx-remote", "unified pipeline" | [`guides/markdown-mdx-content-pipeline-worker-bee.md`](guides/markdown-mdx-content-pipeline-worker-bee.md) |
| `product-feedback-roadmap-worker-bee` | Customer-feedback-to-roadmap loop -- Userback, Canny, Featurebase, Productboard, Frill, Productlane -- in-app widget vs portal vs voting-board taxonomy, de-duplication discipline, status-transition policy, RICE/ICE prioritization, and public vs private roadmap playbook | "set up a feedback system", "which feedback tool should I use", "Canny vs Featurebase", "our feature requests are a mess", "set up a public roadmap", "RICE scoring for our backlog", "prioritize feature requests", "should we publish our roadmap?" | [`guides/product-feedback-roadmap-worker-bee.md`](guides/product-feedback-roadmap-worker-bee.md) |
| `adr-writing-worker-bee` | Architecture Decision Records specialist — Nygard format (Context / Decision / Consequences / Alternatives Considered), MADR extended template, Y-statement framing, supersession lifecycle, Log4brains and adr-tools CLI, and the "decisions, not docs" discipline | "write an ADR", "record this decision", "supersede ADR-NNN", "set up our ADR log", "which ADR format should we use?", "document this architecture choice", "Nygard vs MADR", "Log4brains setup" | [`guides/adr-writing-worker-bee.md`](guides/adr-writing-worker-bee.md) |
| `cursor-ide-worker-bee` | Cursor IDE platform surface — project rules (.cursorrules migration, .cursor/rules/*.mdc), MCP server registration, @cursor/sdk API, custom modes, Agents Window + Cloud Agents, keybindings | "review my rules", "migrate .cursorrules", "add an MCP tool", "Cursor SDK", "Agent.create", "create a custom mode", "cloud agents", "Agents Window", "Cursor keybindings" | [`guides/cursor-ide-worker-bee.md`](guides/cursor-ide-worker-bee.md) |
| `http-rest-fundamentals-worker-bee` | HTTP and REST protocol authority -- methods (safety/idempotency), status-code honesty, headers (Cache-Control, ETag, Vary, CORS), conditional requests, range requests, HTTP/2 + HTTP/3 readiness, REST vs RPC-over-HTTP | "audit this API", "is this status code correct?", "why is CORS failing?", "explain preflight", "PUT vs PATCH", "HTTP/3 ready?", "review this OpenAPI spec" | [`guides/http-rest-fundamentals-worker-bee.md`](guides/http-rest-fundamentals-worker-bee.md) |
| `terminal-bash-worker-bee` | Terminal productivity surface ? Bash/Zsh/Fish configuration, modern CLI tools (ripgrep, fd, fzf, bat, eza, zoxide), shell scripting, dotfile architecture, tmux/Zellij, just/Make task automation | "improve my dotfiles", "review this shell script", "set up tmux", "modern CLI tools", "bash best practices", "just vs make", "terminal setup" | [`guides/terminal-bash-worker-bee.md`](guides/terminal-bash-worker-bee.md) |
| `readme-writing-worker-bee` | README as conversion surface ? authors, audits, and restructures `README.md` files using the canonical 2026 section order, badge discipline, OSS/internal register split, and README-driven development; emits a 12-point done checklist | "write a README", "audit my README", "README for this project", "README-driven development", "badges are broken", "quickstart doesn't work" | [`guides/readme-writing-worker-bee.md`](guides/readme-writing-worker-bee.md) |
| `changelog-release-notes-worker-bee` | Public changelogs and release notes that drive user engagement ? tool selection (Headway, FeatureBase, Productlane, Beamer, markdown), copy craft (impact-first, user-centric, honest scope), and multi-channel distribution | "write my changelog entry", "set up a changelog tool", "compare Headway vs FeatureBase", "review our release notes", "plan our announcement" | [`guides/changelog-release-notes-worker-bee.md`](guides/changelog-release-notes-worker-bee.md) |

| `git-worker-bee` | Git mastery — interactive rebase (squash, fixup, autosquash), conflict resolution (rerere, mergetool, diff3), history rewriting (git filter-repo, BFG), reset/reflog recovery, worktrees for parallel branches, hooks (Husky, lefthook), Git LFS, partial clone, sparse checkout, submodules vs subtrees | "squash my commits", "I pushed a secret", "my repo is huge", "undo that rebase", "recover my deleted branch", "work on two branches at once", "set up Git hooks", "Git LFS setup", "submodules vs subtrees" | [`guides/git-worker-bee.md`](guides/git-worker-bee.md) |


> **37 Bees registered.** Every Bee in this roster has a spawnable agent in `.cursor/agents/`, a paired Stinger in `.cursor/skills/`, and a guide in `guides/`. To register another, add a row above and author its `guides/<bee-name>.md` from `templates/guide-template.md`.
>

---

## How to use this skill

1. **Match the request to a roster row.** Read the trigger keywords and the guide's "Trigger phrases" + "Do NOT route when" sections. The negative section is as important as the positive section ? it disambiguates near-overlapping Bees.
2. **Verify the Bee's required inputs are present.** Each guide's "Inputs the Bee needs" section lists what must be supplied or inferable. If a required input is missing, batch a clarifying question rather than invoking with placeholders.
3. **Invoke the Bee by name.** The Bee's `name:` frontmatter is the routing handle (e.g., `python-worker-bee`).
4. **Watch for multi-Bee sequences.** Some requests legitimately need two Bees in series (build ? audit ? deploy). The "Multi-Bee orchestration" section below lists known sequences.

If no roster Bee matches, do not improvise a Bee. Handle the request inline, or register a new Bee (see "Adding a new Bee to the roster" below).

---

## Dispatching a Bee (the arming contract)

This is the canonical definition of how any orchestrator (`/the-beekeeper`, `/the-smoker`, or any future entry point) spawns a worker-bee. Follow it exactly; do not duplicate or paraphrase it in the calling command.

**Spawn at top level.** Use the Task tool at the main agent level. Do not nest sub-agents inside other sub-agents; Cursor cannot reliably nest-spawn.

**Arm every Bee before it starts.** Cursor does not auto-attach a skill to an agent. The spawn prompt MUST begin with this arming line:

> You are `<bee-name>`. Before doing anything else, read your paired Stinger at `.cursor/skills/<stinger-name>/SKILL.md` in full and follow it as your operating manual. Then: [scoped task, exact files in scope, definition of done, how the work will be verified].

**Resolve `<stinger-name>`.** Use the "Paired Stinger" link in the Bee's guide at `.cursor/skills/beekeeper-suit/guides/<bee-name>.md`, or apply the convention `<base>-worker-bee` -> `<base>-stinger` (e.g. `dependency-audit-worker-bee` -> `dependency-audit-stinger`).

**Failed dispatch rule.** A Bee dispatched without its Stinger loaded is a failed dispatch. Terminate and re-dispatch with the arming line present.

**Standard close-out.** Every implementation task ends with `security-worker-bee` (armed with `security-stinger`) first, then `quality-worker-bee` (armed with `quality-stinger`). Never run quality before security; security fixes can invalidate the QA result. See the "Plan execution loop" sequence below.

---

## Multi-Bee orchestration

Known sequences where multiple Bees run in order. Sequences are how the Army produces results larger than any single Bee.

### Plan execution loop (canonical close-out for every implementation)

1. The implementation Bee (any domain Bee) produces the code change.
2. **`security-worker-bee`** audits for OWASP / PII / financial-data exposure; remediates Critical and High findings in place.
3. **`quality-worker-bee`** verifies the final implementation against the source plan (completeness, correctness, alignment, regressions) and writes the QA report.

This is the canonical "is it done?" loop. Routing `quality-worker-bee` before `security-worker-bee` is a documented anti-pattern ? security fixes may invalidate the QA report.

### AI cognitive feature

1. **`mind-worker-bee`** reviews / refactors / extends the cognitive layer (coach routing, prompt cascade, RAG, AiTrace, memory).
2. **`python-worker-bee`** (when the cognitive code lives in Django / FastAPI / Celery) owns the Python implementation patterns underneath.
3. **`db-worker-bee`** designs any non-AI tables `mind-worker-bee` needs (e.g., session state).
4. **`security-worker-bee`** audits prompt-injection surface, PII in traces, secret handling.
5. **`quality-worker-bee`** verifies against the AI feature plan.

### Compounding documentation (Legion VS Code extension TS driver flow)

1. **`wiki-worker-bee`** runs in parallel across code chunks (canonical path: TS driver `document` / `update` / `scan-directory`; escape hatch: `@`-mention). Each invocation writes atomic entity pages, concept pages, decision pages, contradiction protocol artifacts.
2. The TS driver runs the global-state reconciliation pass (updates `index.md`, `<type>/_index.md`, `log.md`, `hot.md`, the hash manifest) after all parallel `wiki-worker-bee` invocations finish.
3. **`library-worker-bee`** authors per-module narrative documentation in `library/knowledge-base/<module>/`, reading the wiki at query time to enrich its narratives.

Together: `wiki-worker-bee` builds the atomic cross-reference graph; `library-worker-bee` writes the human-readable story around it. Neither replaces the other.

### Schema-touching feature

1. **`db-worker-bee`** designs the schema, indexing, and migration shape (expand-backfill-contract for any non-trivial change).
2. The implementation Bee (`python-worker-bee`, `mind-worker-bee`, etc.) implements the ORM / data-access side.
3. **`asset-worker-bee`** registers any new first-class assets the feature introduces (Features, Pages, Routes, Surfaces, DesignTokens, FeatureFlags, Entitlements) and verifies code?DB sync.
4. **`security-worker-bee`** ? **`quality-worker-bee`** close out per the Plan execution loop.

> Add a sequence here whenever a new Bee is registered that fits an existing flow, or whenever a recurring multi-Bee pattern emerges in practice.

---

## Folder layout

- `SKILL.md` ? this file (the roster + orchestration index).
- `guides/<bee-name>.md` ? one guide per registered Bee. Authored from `templates/guide-template.md`.
- `templates/guide-template.md` ? the stub used to write a new Bee's Beekeeper-Suit-side guide.

---

## Adding a new Bee to the roster

To register another Bee (it must already have an agent in `.cursor/agents/` and a paired Stinger in `.cursor/skills/`):

1. Add a row to the **Roster** table above with the Bee name, domain, trigger keywords, and a link to its guide.
2. Copy `templates/guide-template.md` to `guides/<bee-name>.md` and fill it in from the Bee's agent file + the Stinger's SKILL.md.
3. If the Bee fits an existing multi-Bee sequence (or starts a new one), update the **Multi-Bee orchestration** section.

The Bee is now discoverable. The orchestrator can find it.

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
