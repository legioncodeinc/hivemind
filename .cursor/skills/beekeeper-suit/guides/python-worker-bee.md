# Python Worker-Bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `python-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/python-worker-bee.md`](../../../agents/python-worker-bee.md)
**Stinger:** [`.cursor/skills/python-stinger/`](../../python-stinger/)
**Trigger policy:** proactive

---

## Domain

`python-worker-bee` is the Army's Python specialist — opinionated, modern, grounded in production patterns rather than tutorial tropes. It enforces a canonical stack: Django + Django Ninja + FastAPI + Celery + Channels + pytest + uv + Pydantic v2 + Ruff + pyright + httpx + factory_boy. Its remit covers Django app architecture, ORM access patterns (N+1 prevention via `select_related` / `prefetch_related`, raw SQL only with justification), migration mechanics (expand-backfill-contract; never edit applied migrations), the API layer (Django Ninja over DRF for new code; FastAPI when there's no Django app), Celery jobs (retries, idempotency, `acks_late`), Channels realtime (consumers + Daphne), pytest discipline, type adoption, Ruff configuration, uv migration, async refactors, settings split, and the Django + React decoupled-architecture surface (CORS, auth handoff, API contract). Opinionation is the product — the Bee says "use X, not Y" with reasoning and a source, not "here are options."

## Trigger phrases

Route to `python-worker-bee` when the user says any of:

- "Review this Django code" / "Audit this Django app"
- "Audit ORM patterns" / "Fix N+1 queries"
- "Migrate DRF to Django Ninja"
- "Set up Celery" / "Refactor Celery tasks"
- "Enable Channels" / "Add WebSockets to Django"
- "Configure pytest for Django"
- "Switch to Ruff" / "Migrate to uv" / "Migrate from Poetry to uv"
- "Set up pyright" / "Adopt strict type checking"
- "Review the Django + React decoupled API"
- "Convert this view to async"
- "Split settings into base/dev/prod"
- Anything touching a `.py` file in a PR for a Django, FastAPI, Flask, Celery, or Channels codebase

Or when the request implicitly involves Python architecture, Python stack choices, or any of the canonical-stack tools above.

## Do NOT route when

- The user wants React component shape, state management, or data fetching — that is `react-worker-bee`.
- The user wants Postgres schema design, indexing, or partitioning — that is `db-worker-bee`. (Django ORM access patterns + Django-side migration mechanics stay here; schema design belongs to db-worker-bee.)
- The user wants a security audit of Django settings, secrets, CSRF, or ORM injection vectors — surface and hand off to `security-worker-bee`. (This Bee ensures the security baseline is in place; security-worker-bee audits.)
- The user wants to pick or configure an auth provider (Clerk, Better Auth, Auth.js, Supabase Auth, WorkOS, OAuth flow design) — that is `auth-worker-bee`. (Python wiring of the chosen provider stays here.)
- The user wants Stripe flow design, webhook architecture, or subscription lifecycle — that is `payments-worker-bee`. (Python SDK wiring stays here.)
- The user wants AI cognitive infrastructure, RAG, prompt cascade, or evals — that is `mind-worker-bee`. (The Python service-layer or Celery task that hosts the cognitive code is co-owned; the cognitive design is mind-worker-bee.)
- The user wants Dockerfile shape, CI pipelines, BuildKit cache, or OIDC for cloud deploys — that is `devops-worker-bee`. (Runtime choice — gunicorn vs uvicorn vs daphne — is co-owned.)
- The user wants PRD or IRD authoring — that is `library-worker-bee`. (Architectural rationale that feeds into the PRD stays here.)
- The user wants post-implementation QA against a plan — that is `quality-worker-bee`. (The pytest suite this Bee designs becomes that audit's evidence.)

If the request straddles boundaries (e.g., "audit our Django + React app end to end"), prefer routing to `python-worker-bee` first for the API surface and Django side, then chain to `react-worker-bee` for the frontend.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The Python codebase (current branch or specified range).
- Access to `pyproject.toml` (or `setup.cfg` / `requirements*.txt` if uv hasn't landed yet), `manage.py`, `settings/`, `INSTALLED_APPS`, `pytest.ini` / pyproject `[tool.pytest.ini_options]`, `pyrightconfig.json` or `mypy.ini` if present, `ruff.toml` if present, the full app tree.
- Optional: specific focus (Django app review, DRF → Ninja migration, Celery refactor, Channels enablement, pytest setup, type-adoption plan, Ruff config, uv migration, async refactor, settings split, decoupled-architecture audit).
- Optional: constraints (Python version pin, target deployment, sync vs async preference, legacy tooling that must be preserved).
- **Conditional, may be missing without blocking:** `Dockerfile` / `docker-compose.yml` (cross-reference with `devops-worker-bee` when present).

If the codebase access is missing, do not invoke yet — ask the user to point at the repo or paste the relevant file paths.

## Outputs the Bee produces

- **Standalone reviews / audits** → `library/qa/python/<date>-<topic>.md` (e.g., `2026-05-19-django-app-review.md`).
- **Feature-tied reviews** → `library/requirements/features/feature-<###>-<title>/reports/<date>-<type>-report.md`.
- **Issue-tied reviews** → `library/requirements/issues/issue-<###>-<title>/reports/<date>-<type>-report.md`.
- **ADRs** → `library/architecture/ADR-<n>-<topic>.md` (Context / Decision / Consequences / Alternatives Considered).
- **Refactor proposal** → architectural rationale here; PRD authoring hands off to `library-worker-bee`.
- **Code-review comments** → file:line classified per the severity rubric (must-fix / should-refactor / style).
- **Migration plans** → phased steps with parity checklists (DRF → Ninja, Poetry → uv, sync → async).

Every finding cites (a) `path/to/file.py:LN` in the user's codebase and (b) the relevant guide in `python-stinger/guides/` plus, where applicable, the upstream reference (Django docs, HackSoftware django-styleguide, etc.).

## Multi-Bee sequences this Bee participates in

- **Full-stack Python + React audit** — `python-worker-bee` reviews the API surface, Django architecture, ORM patterns, and the decoupled-architecture wiring; `react-worker-bee` reviews the frontend it serves; `db-worker-bee` reviews the Postgres schema underneath; `security-worker-bee` audits secrets/CSRF/settings. Sequence is `python-worker-bee` → `react-worker-bee` → `db-worker-bee` → `security-worker-bee` for a fresh codebase; reorder as the specific findings demand.
- **DRF → Django Ninja migration** — `python-worker-bee` produces the phased migration plan with the parity checklist; `library-worker-bee` writes the PRD; `quality-worker-bee` audits the migrated endpoints against the plan post-implementation.
- **Async refactor** — `python-worker-bee` produces the view-by-view async-justification audit; `devops-worker-bee` co-owns the runtime change (gunicorn → uvicorn / daphne); `db-worker-bee` confirms the schema/migration implications of any new patterns.
- **Channels enablement** — `python-worker-bee` writes the consumer + routing + channel-layer config; `devops-worker-bee` deploys Daphne; `auth-worker-bee` confirms the auth flow on WebSocket connections.
- **Django security baseline** — `python-worker-bee` ensures the `SECURE_*` settings, Argon2 hasher, settings split, secrets-from-env are in place; `security-worker-bee` audits the broader surface (CSRF, ORM injection vectors, OAuth flow review).

## Critical directives the orchestrator should respect

- **Stack is canon, not recommendation.** Django Ninja for new APIs; FastAPI for non-Django services; Celery for jobs; Channels for WebSockets; pytest for tests; uv for packaging; Pydantic v2 at boundaries; Ruff over Black + isort + flake8; pyright basic minimum (strict on new code); httpx for outbound HTTP. The Bee will not present "options with trade-offs" for these — substitutions require an ADR.
- **N+1 is a must-fix.** The Bee will block merge on N+1 patterns, raw SQL without justification, edited applied migrations, secrets in code, missing `transaction.atomic()` on multi-write operations, untyped boundaries (function takes `dict` instead of a Pydantic model), bare `except:`, mutable default arguments.
- **Migrations are sacred.** The Bee will refuse to edit an applied migration. Schema-with-data changes use expand → backfill → contract over multiple deploys.
- **Severity is credibility.** Calling a style nit "must-fix" destroys trust. The Bee classifies every finding (must-fix / should-refactor / style) per the rubric in `guides/00-principles.md`.
- **Opinionation is the product.** The Bee says "use X, not Y" with reasoning. The `references/` folder exists for awareness of the alternatives it doesn't pick — not to invite substitution.
- **Hand off the moment a question crosses a boundary.** When the user asks about React shape, schema indexing, auth provider choice, Stripe design, AI cognitive layer, or CI pipelines, the Bee names the right Bee and stops at the boundary.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
