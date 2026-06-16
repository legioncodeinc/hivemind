# readme-writing-worker-bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `readme-writing-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/readme-writing-worker-bee.md`](../../agents/readme-writing-worker-bee.md)
**Stinger:** [`.cursor/skills/readme-writing-stinger/`](../../skills/readme-writing-stinger/)
**Trigger policy:** proactive

---

## Domain

`readme-writing-worker-bee` owns the `README.md` as a conversion surface. It authors, audits, and restructures README files so they convert visitors into users in 30 seconds or less. The Bee applies the canonical 2026 section order (title, badges, quickstart, features, install, usage, contributing, license), badge discipline (3–5 status-only badges via Shields.io), and the OSS/internal register split. It also applies README-driven development (RDD) for greenfield projects: write the README before writing code, in present tense, as the API spec that the implementation validates against. The Bee does NOT own full documentation site architecture, per-entity code extraction, or CI badge pipeline wiring.

## Trigger phrases

Route to `readme-writing-worker-bee` when the user says any of:

- "write a README"
- "audit my README"
- "make my README better"
- "README for this project"
- "README-driven development"
- "my README is too long"
- "badges are broken" or "badges are missing"
- "quickstart doesn't work"
- "README for an OSS library"
- "write the README first"

Or when the user starts a new project and no README exists yet, or when a PR touches the `README.md` file and the PR description asks for a review.

## Do NOT route when

- The user wants a full documentation site (wiki, docs portal, Docusaurus, MkDocs) — route to `library-worker-bee`.
- The user wants to extract code entities (functions, classes, services) into a wiki — route to `wiki-worker-bee`.
- The user wants to set up the CI pipeline that generates CI/coverage badges — route to `devops-worker-bee`.
- The README is for a Ruby gem following strict Ankane-style conventions — route to `ce-ankane-readme-writer`.
- The README is in `.rst` format for a Python project — route to `python-worker-bee`.

If a request straddles `readme-writing-worker-bee` and `library-worker-bee` (e.g., "my README is too long and I need proper docs"), prefer `readme-writing-worker-bee` first to trim/restructure, then escalate to `library-worker-bee` if extraction is needed.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The `README.md` file path — required; or "no README exists yet" to trigger creation.
- Project type signal — required: OSS library, internal tool, SaaS product, CLI, or monorepo. If ambiguous, `readme-writing-worker-bee` will ask.
- Target audience — optional; defaults to developer-audience for OSS, teammate-audience for internal.
- Existing badges or CI config — optional; used to generate live badge URLs.
- Inspirational READMEs — optional; links the user wants to emulate.

If the project type cannot be inferred and the user has not specified it, ask before invoking — the wrong classification produces the wrong template.

## Outputs the Bee produces

- **Primary:** An updated or newly created `README.md` written to disk at the specified path.
- **Audit table:** A pass/fail/warn table emitted inline before any rewrite (so the user can confirm before changes are written).
- **Done checklist:** A 12-point validation table emitted at the end confirming every section passes.
- **Optional audit report:** A dated summary at `.cursor/skills/readme-writing-stinger/reports/YYYY-MM-DD-{project}-readme-audit.md`.

## Multi-Bee sequences this Bee participates in

- **New OSS project launch:** `readme-writing-worker-bee` (README first, RDD) → implementation → `security-worker-bee` (audit) → `quality-worker-bee` (verify plan). `readme-writing-worker-bee` runs first, before any code.
- **PR review with README changes:** `readme-writing-worker-bee` audits the README diff as part of any PR that touches `README.md`.
- **Docs escalation:** `readme-writing-worker-bee` trims/restructures the README → hands off to `library-worker-bee` when the README exceeds 2,000 words and a full docs site is warranted.

## Critical directives the orchestrator should respect

- Always emit the audit table before rewriting; never silently overwrite the existing README.
- The quickstart block must be copy-paste runnable on a fresh machine; validate mentally before emitting.
- Respect the OSS/internal register split; do not apply OSS tone to an internal tool README.
- Hand off to `library-worker-bee` when README exceeds 2,000 words rather than restructuring infinitely.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
