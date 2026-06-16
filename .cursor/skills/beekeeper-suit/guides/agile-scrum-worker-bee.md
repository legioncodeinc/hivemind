# Agile Scrum Worker-Bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `agile-scrum-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/agile-scrum-worker-bee.md`](../../agents/agile-scrum-worker-bee.md)
**Stinger:** [`.cursor/skills/agile-scrum-stinger/`](../../skills/agile-scrum-stinger/)
**Trigger policy:** on-demand

---

## Domain

`agile-scrum-worker-bee` owns the full Scrum methodology surface: Sprint ceremonies (Sprint Planning, Daily Scrum, Sprint Review, Sprint Retrospective, Backlog Refinement), Scrum roles (Scrum Master, Product Owner, Developers), artefacts (Product Backlog, Sprint Backlog, Increment), and commitments (Product Goal, Sprint Goal, Definition of Done). It conducts honest "is this actually Scrum?" audits grounded in the Scrum Guide 2020, coaches estimation techniques (Fibonacci, Planning Poker, T-shirt sizing, #NoEstimates), writes and audits Definitions of Done calibrated to team maturity (startup to enterprise), diagnoses anti-patterns (Zombie Scrum, HiPPO PO, no Sprint Goal, velocity gaming, absent SM), and recommends framework fit from a data-backed decision matrix (Scrum vs ScrumBan vs Kanban vs Shape Up). It does not configure project management tooling, implement CI/CD pipelines, or perform code review.

## Trigger phrases

Route to `agile-scrum-worker-bee` when the user says any of:

- "audit our Scrum process"
- "is this Scrum?"
- "is this actually Scrum?"
- "write our Definition of Done"
- "Sprint Planning help"
- "our retrospectives don't produce anything"
- "should we switch to Kanban" (when the team is currently on Scrum)
- "Scrum anti-patterns"
- "estimation coaching"
- "Fibonacci story points"
- "Sprint Goal help"
- "Zombie Scrum"
- "our velocity is going up but delivery isn't"
- "daily standup is a status report"
- "we stopped doing retrospectives"
- "is ScrumBan right for us?"

Or when the request involves Scrum ceremony health, Scrum role definition, Definition of Done authorship, or retrospective facilitation format selection.

## Do NOT route when

- The request is about Jira, ClickUp, Linear, or Azure DevOps configuration — those are tooling concerns outside this Bee's scope; handle inline or route to the team's tooling documentation
- The request is primarily about Kanban metrics, WIP limits, or flow-metric optimization without a Scrum context — route to **kanban-flow-worker-bee**
- The request is about code review, security review, or testing strategy — route to **security-worker-bee**, **react-worker-bee**, or **python-worker-bee**
- The request is about CI/CD implementation of DoD gates — `agile-scrum-worker-bee` defines the DoD requirement; route CI/CD implementation to **devops-worker-bee**
- The request is about general project management (budget, resourcing, roadmaps) without a Scrum framework context — handle inline

If a request straddles `agile-scrum-worker-bee` and `kanban-flow-worker-bee` (e.g., "should we add WIP limits to our Scrum board?"), prefer `agile-scrum-worker-bee` for the framework decision, then hand off to `kanban-flow-worker-bee` for Kanban-specific implementation guidance.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- Description of the team's current process (ceremonies run, cadences, roles filled, or not)
- Optional: specific ceremony or artefact to audit or improve
- Optional: team size, product domain, and engineering maturity
- Optional: specific anti-patterns the team suspects
- Optional: existing DoD, Sprint retrospective notes, or backlog health indicators

If the request is vague ("audit our process"), the Bee will ask one clarifying question to scope the audit before proceeding.

## Outputs the Bee produces

- **Scrum audit report** — scored compliance table, anti-pattern findings, DoD assessment, framework recommendation, priority action plan (using `templates/scrum-audit-report.md`)
- **Definition of Done** — maturity-tiered template (startup or enterprise) with team-specific adjustments
- **Sprint Planning agenda** — time-boxed agenda with Sprint Goal framing exercise
- **Retrospective format selection and facilitation guide** — one of six formats with facilitation notes and action item template
- **Framework recommendation** — Scrum / ScrumBan / Kanban / Shape Up with one-paragraph rationale
- **Estimation coaching output** — technique selection, calibration table, velocity gaming diagnosis

## Multi-Bee sequences this Bee participates in

- **Agile process setup** — `agile-scrum-worker-bee` defines the Scrum process (ceremonies, DoD, estimation); `devops-worker-bee` implements CI/CD gates referenced in the DoD; `kanban-flow-worker-bee` handles WIP-limit implementation if the team migrates to ScrumBan or Kanban
- **Post-plan execution audit** — after a feature is shipped, `quality-worker-bee` verifies the implementation against the plan; `agile-scrum-worker-bee` reviews whether the team's process supported or hindered delivery

## Critical directives the orchestrator should respect

- Always cite the Scrum Guide 2020 for normative claims; label community practices as such
- Never prescribe Scrum to a team for whom the framework selection matrix says it is a poor fit
- Retrospective action items must have an owner and a target sprint — do not accept vague outputs
- Hand tooling questions to the team's own tooling documentation or handle inline; do not route to a non-existent tooling Bee

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
