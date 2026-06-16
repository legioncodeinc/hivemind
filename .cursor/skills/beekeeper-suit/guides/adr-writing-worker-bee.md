# ADR Writing Worker-Bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `adr-writing-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/adr-writing-worker-bee.md`](../../agents/adr-writing-worker-bee.md)
**Stinger:** [`.cursor/skills/adr-writing-stinger/`](../../skills/adr-writing-stinger/)
**Trigger policy:** on-demand

---

## Domain

`adr-writing-worker-bee` owns the Architecture Decision Record corpus: authoring new records, assigning sequential numbers, superseding stale decisions with bidirectional links, and keeping the ADR log usable as an onboarding artifact. It applies the Nygard format (Context, Decision, Consequences, Alternatives Considered) by default, switches to MADR or Y-statements when team conventions require, and enforces the "decisions, not docs" constraint: an ADR captures a closed, consequential decision, never an in-flight proposal or meeting summary.

## Trigger phrases

Route to `adr-writing-worker-bee` when the user says any of:

- "write an ADR" / "record this decision"
- "supersede ADR-NNN"
- "set up our ADR log"
- "which ADR format should we use?" / "Nygard vs MADR"
- "document this architecture choice"
- "how do new engineers read our ADR log?"
- "set up Log4brains" / "adr-tools"

Or when the request implicitly involves recording or governing a closed architectural decision.

## Do NOT route when

- The request is general knowledge-base or domain documentation → `knowledge-worker-bee`
- The decision needs a full PRD or IRD → `library-worker-bee`
- The request is to extract code entities → `wiki-worker-bee`
- The request is a security review of the decision itself → `security-worker-bee` (this Bee escalates here after recording an ADR that touches auth, secrets, or PII)

If a request straddles ADR-recording and knowledge authorship, record the decision here first, then hand the narrative explanation to `knowledge-worker-bee`.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The decision to record (a closed choice, not an open proposal)
- The existing ADR location/format if any (`docs/decisions/`, `docs/adr/`, `adr-log.md`)
- Whether this supersedes an existing ADR (and which number)

If the "decision" is actually an in-flight proposal, do not invoke; redirect to an RFC/PRD.

## Outputs the Bee produces

- A new ADR file `NNNN-<kebab-title>.md` in the project's ADR directory
- Updated supersession links (bidirectional) when superseding
- Updated ADR log index (Log4brains build / adr-tools toc) when one exists

## Multi-Bee sequences this Bee participates in

- **Decision then review** — `adr-writing-worker-bee` records the decision; if it touches auth/secrets/PII it escalates to `security-worker-bee` for a posture review.
- **Decision then narrative** — `adr-writing-worker-bee` records the WHY; `knowledge-worker-bee` writes the surrounding domain explanation that references it.

## Critical directives the orchestrator should respect

- Determine the existing ADR format before writing; never impose a new format on an established log.
- Sequential numbers only — never reuse or gap-fill.
- Supersession is bidirectional; both links are mandatory.
- Never record a decision that is still open.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
