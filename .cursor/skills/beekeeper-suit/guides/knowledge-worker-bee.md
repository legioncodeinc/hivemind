# Knowledge Worker-Bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `knowledge-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/knowledge-worker-bee.md`](../../agents/knowledge-worker-bee.md)
**Stinger:** [`.cursor/skills/knowledge-stinger/`](../../skills/knowledge-stinger/)
**Trigger policy:** on-demand

---

## Domain

`knowledge-worker-bee` authors narrative knowledge documentation under `library/knowledge/private/<domain>/` — the human-readable, technically deep domain docs that explain HOW systems work, WHY they were designed that way, and WHAT the operational ground truth is. It produces system overviews with Mermaid diagrams, auth architecture docs with sequence diagrams, consolidated SQL schema references, security trust-boundary diagrams, and coding standards. It works from ADRs and PRDs as source material and transforms spec language into explanatory narrative; it never copies PRD content verbatim.

## Trigger phrases

Route to `knowledge-worker-bee` when the user says any of:

- "document the auth architecture" / "document how X works internally"
- "write the system overview"
- "create knowledge docs for this repo" / "build out the knowledge base"
- "consolidate the schema reference"
- "knowledge-worker-bee"

Or when the request implicitly involves writing deep internal domain documentation grounded in existing decisions and specs.

## Do NOT route when

- The request is a PRD or IRD → `library-worker-bee`
- The request is a closed architecture decision record → `adr-writing-worker-bee`
- The request is a QA report → `quality-worker-bee`
- The request is code-entity extraction into a wiki → `wiki-worker-bee`

`knowledge-worker-bee` owns the `library/knowledge/` domain only; PRDs/IRDs belong to `library-worker-bee`. Hand off immediately on those.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- Which domain(s) to document, or "the full knowledge base"
- Available source material: ADRs, PRDs, and read access to source code
- Whether this is targeted docs or a from-scratch knowledge-base build

If no ADRs/PRDs/source exist to ground the docs, ask — the Bee never invents technical facts.

## Outputs the Bee produces

- Narrative knowledge docs under `library/knowledge/private/<domain>/` using the strict header format
- `overview.md` entry point and `architecture/system-overview.md` with a Mermaid diagram (written first)
- Cross-linked Related sections across all authored docs

## Multi-Bee sequences this Bee participates in

- **Decision then narrative** — `adr-writing-worker-bee` records the WHY; `knowledge-worker-bee` writes the surrounding domain explanation.
- **Compounding documentation** — `wiki-worker-bee` builds the atomic entity graph; `library-worker-bee` owns PRDs; `knowledge-worker-bee` writes the deep domain narrative around them.

## Critical directives the orchestrator should respect

- Never write PRDs, IRDs, QA reports, or ADRs — hand off to the owning Bee.
- Never copy PRD spec language verbatim; transform it into narrative.
- Mermaid diagrams use no explicit colors and camelCase node IDs (dark-mode safe).
- Every doc needs the standard header and a Related section.

(Full list lives in the Bee file's anti-patterns and format sections.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
