# Docs-Site Worker-Bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `docs-site-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/docs-site-worker-bee.md`](../../agents/docs-site-worker-bee.md)
**Stinger:** [`.cursor/skills/docs-site-stinger/`](../../skills/docs-site-stinger/)
**Trigger policy:** proactive

---

## Domain

`docs-site-worker-bee` owns developer-facing documentation-site infrastructure: platform selection (Docusaurus v3/v4, Mintlify, GitBook, MkDocs Material in maintenance mode, Nextra v4, Starlight/Astro, Fern), the Diátaxis content pyramid, docs-as-code CI pipelines (Vale prose lint, lychee dead-link checks, preview deploys), and search (Algolia DocSearch, pagefind, built-in). It treats documentation as a product with the same engineering discipline `devops-worker-bee` brings to application pipelines.

## Trigger phrases

Route to `docs-site-worker-bee` when the user says any of:

- "pick a docs platform" / "Mintlify vs Starlight"
- "set up Docusaurus" / "set up developer documentation"
- "migrate from GitBook"
- "docs-as-code CI"
- "add search to docs"

Or when the request implicitly involves standing up, migrating, or hardening a developer documentation site.

## Do NOT route when

- The request is OpenAPI spec enrichment or SDK generation → `api-docs-worker-bee`
- The request is authoring content in the internal `library/` knowledge base → `library-worker-bee` (or narrative domain docs → `knowledge-worker-bee`)
- The request is a marketing or lead-generation website → (no website Bee in this package; handle inline or flag)
- The request is pure prose/writing-quality review → `technical-writing-craft-worker-bee`

If a request straddles docs-site infrastructure and content authorship, this Bee owns the platform/CI/search; route the content itself to the content Bee.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- Scenario: greenfield site, platform migration, or feature addition
- Content type, hosting model (managed vs self-hosted), budget, and customization needs
- Existing platform if migrating

If the platform is undecided, the Bee runs its scored decision tree; budget/hosting constraints are required inputs for that.

## Outputs the Bee produces

- A scored platform recommendation with a named trade-off and a fallback
- A `docs/docs-site-plan.md` setup plan or a migration checklist with rollback path
- Docs-as-code CI config and search configuration

## Multi-Bee sequences this Bee participates in

- **API documentation** — `docs-site-worker-bee` stands up the site; `api-docs-worker-bee` enriches the OpenAPI reference and SDKs hosted on it.
- **Docs writing** — `docs-site-worker-bee` builds the platform; `technical-writing-craft-worker-bee` reviews the prose that goes into it.

## Critical directives the orchestrator should respect

- Always name the concrete trade-off (e.g. Mintlify pricing) before recommending a platform.
- Never recommend MkDocs Material for new projects without flagging its November 2025 maintenance mode.
- Default to docs-as-code; verify search works before declaring done.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
