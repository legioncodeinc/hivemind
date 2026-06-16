# Guide: discovery-research-worker-bee

Continuous product discovery coach — Teresa Torres interview cadence, Opportunity Solution Trees, JTBD interviews, assumption mapping, and prototype experiment design.

---

## What this Bee owns

`discovery-research-worker-bee` owns the pre-build discovery cycle end to end. It runs BEFORE any implementation Bee when the team is uncertain what to build. Specifically, it owns:

- **Desired-outcome definition** — scoping a single, measurable outcome that anchors all discovery work.
- **Opportunity Solution Tree (OST)** — building and maintaining the tree (desired outcome → opportunity clusters → sub-opportunities → solutions → experiments).
- **Customer interview facilitation** — generating JTBD-style scripts in Teresa Torres' weekly cadence and synthesizing insights across sessions.
- **Assumption mapping** — enumerating desirability/viability/feasibility assumptions and prioritizing by importance × uncertainty on a 2×2.
- **Prototype experiment design** — specifying the smallest experiment (paper mock, Wizard of Oz, concierge, fake door) that validates or invalidates the highest-risk assumption.
- **Weekly discovery summary** — one-page stakeholder communication of top opportunities, recent interview insights, and next experiment.

It does NOT own:
- Shipped-feature usability testing → `quality-worker-bee`
- UI/UX design decisions → `ux-ui-worker-bee`
- PRD or feature-spec authorship → `library-worker-bee`
- Analytics result interpretation (no peer Bee yet; flag and defer)

## When to invoke

Delegate to `discovery-research-worker-bee`:

- When the user says "run a discovery session", "build an OST", "write an interview script", "map our assumptions", "design a prototype experiment", or "weekly discovery summary".
- When a team is unsure what to build next and needs discovery before planning.
- When a product goal or user story is stated but no validated opportunity exists yet.
- Proactively, before routing to `library-worker-bee` for a PRD — if no OST or desired outcome exists, discovery should run first.

Do **not** invoke when:
- The feature is already built and the team wants to test it → `quality-worker-bee`.
- The team has a validated opportunity and just needs a spec → `library-worker-bee`.
- The request is about visual design, tokens, or component states → `ux-ui-worker-bee`.

## Paired Stinger

`.cursor/skills/discovery-research-stinger/` — encodes Teresa Torres' continuous-discovery framework and cadence rules, OST node taxonomy, JTBD interview methodology (Five Acts, progress-forcing context, forces diagram), assumption-mapping 2×2 (DVFU), lightweight prototype experiment patterns, and the "build less, learn more" decision heuristics.

## Expected input

- A user story, product goal, or "we don't know what to build next" prompt.
- Optionally: an existing OST file or interview notes to extend.
- Optionally: a specific interview recording or transcript for JTBD coding.
- Optionally: a desired outcome statement (e.g., "increase week-3 retention by 10%") to anchor the OST.
- Optionally: a prototype or design mock to structure an assumption test around.

## Expected output

Markdown files authored to the `library/discovery/` subtree:

- `library/discovery/desired-outcome.md`
- `library/discovery/opportunity-solution-tree.md`
- `library/discovery/interview-scripts/<YYYY-MM-DD>-<opportunity-slug>.md`
- `library/discovery/assumption-maps/<solution-slug>.md`
- `library/discovery/experiments/<YYYY-MM-DD>-<experiment-slug>.md`

Plus inline coaching and synthesis in chat when no file output is warranted.

## Critical directives to respect when routing

- Never recommend building without at least one validated assumption test. If the team bypasses discovery, flag the risk explicitly.
- Always ensure a desired outcome is defined before generating interview scripts or OST nodes.
- Hand off TO `library-worker-bee` only after a validated opportunity + winning solution are confirmed — not before.
- Do not route to this Bee for shipped-feature usability testing; that belongs to `quality-worker-bee`.

## Typical failure modes

- **No desired outcome defined.** The Bee will refuse to generate an OST without a root outcome. Route through outcome-scoping first.
- **PRD requested too early.** If the user asks for a PRD before discovery is complete, `discovery-research-worker-bee` will flag the premature handoff and recommend completing at least one assumption test.
- **Build pressure overrides discovery.** If stakeholders demand building without testing, the Bee surfaces the risk from `guides/00-principles.md` and escalates to the user rather than complying silently.
