# knowledge-base-help-center-worker-bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `knowledge-base-help-center-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/knowledge-base-help-center-worker-bee.md`](../../agents/knowledge-base-help-center-worker-bee.md)
**Stinger:** [`.cursor/skills/knowledge-base-help-center-stinger/`](../../skills/knowledge-base-help-center-stinger/)
**Trigger policy:** proactive

---

## Domain

`knowledge-base-help-center-worker-bee` owns the full product lifecycle of customer-facing self-service knowledge bases. Its domain spans platform selection and migration (Intercom Articles, Help Scout Docs, ReadMe.com, Document360, HelpJuice, Zendesk Guide), search-first information architecture (category hierarchies, article templates, search tagging), AI deflection (platform-native chatbot, Fin standalone portal embedding, and custom RAG endpoints), KB versioning (Document360 branch versioning, ReadMe git-backed), multi-language/locale management (50+ language auto-translate, RTL, TMS integration), and the analytics-driven content-gap feedback loop (CRAVA framework, search-no-results triage, weekly editorial ritual). Critical 2026 context: Intercom Fin is now available standalone ($0.99/resolution, no seat required); Document360 launched an MCP server (March 2026); llms.txt gained Google Lighthouse validation (May 20, 2026).

## Trigger phrases

Route to `knowledge-base-help-center-worker-bee` when the user says any of:

- "pick a KB platform" / "which help center tool should we use"
- "set up a help center" / "set up our knowledge base"
- "migrate Zendesk Guide" / "migrate from [platform] to [platform]"
- "add AI deflection to our docs" / "chat-with-your-docs"
- "fix our search no-results" / "our KB search isn't working"
- "localize our KB" / "multi-language help center"
- "set up llms.txt" / "make our docs discoverable by AI"
- "content gap analysis" / "why aren't users finding our articles"
- "Document360 vs Help Scout" / "Intercom Articles vs Zendesk Guide"
- "Fin standalone plan" / "Eddy AI deflection"

Or when the request implicitly involves designing or improving a customer-facing self-service knowledge base.

## Do NOT route when

- The user needs support inbox configuration, ticketing, SLA tiers, or AI deflection within a ticketing system — route to `customer-support-tooling-worker-bee`.
- The user needs live chat widget installation, HMAC identity verification, or conversation routing rules — route to `live-chat-support-worker-bee`.
- The user needs organic SEO keyword strategy, metadata, or schema markup specifically for KB article organic ranking — route to `seo-aeo-worker-bee`.
- The user needs a RAG/embedding pipeline implementation (vector store, chunking, retrieval API) — route to `mind-worker-bee` after this Bee specifies the KB export format and chunking inputs.

If a request straddles KB deflection and ticketing, prefer `knowledge-base-help-center-worker-bee` for the KB design layer and `customer-support-tooling-worker-bee` for the ticketing layer.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- Current platform (if any) and pain points.
- Team size and support volume (needed for pricing reality check).
- AI deflection requirement (yes/no for Day 1).
- Versioning requirement (parallel product versions in active use?).
- Language/locale requirements (list of target languages).
- Budget ceiling (needed to filter Document360's quote-only barrier).

If any of the above is missing, the Bee will ask one targeted clarifying question before proceeding.

## Outputs the Bee produces

- Platform selection recommendation with scored matrix and named trade-off (`templates/platform-selection-matrix.md`).
- `docs/kb-plan.md` — setup or migration plan with rollback path.
- KB launch checklist (`templates/kb-setup-checklist.md`).
- AI deflection configuration specification (Pattern A/B/C with llms.txt).
- Weekly content-gap triage template (`templates/content-gap-triage.md`).

## Multi-Bee sequences this Bee participates in

- **KB + AI deflection setup** — `knowledge-base-help-center-worker-bee` designs the KB and selects Pattern A/B/C deflection; `mind-worker-bee` implements Pattern C custom RAG endpoint; `customer-support-tooling-worker-bee` wires the ticketing escalation path.
- **Full support stack bring-up** — `customer-support-tooling-worker-bee` selects the support platform → `knowledge-base-help-center-worker-bee` designs the KB deflection layer → `live-chat-support-worker-bee` wires the chat widget.

## Critical directives the orchestrator should respect

- Always request the platform trade-off explicitly before recommending — no silent recommendations.
- Do not route to `knowledge-base-help-center-worker-bee` if the user's primary need is inbox management or ticketing.
- Flag HelpJuice as a 2026 data gap and direct the user to verify at helpjuice.com/whats-new.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
