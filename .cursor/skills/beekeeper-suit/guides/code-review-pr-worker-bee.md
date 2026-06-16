# code-review-pr-worker-bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `code-review-pr-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/code-review-pr-worker-bee.md`](../../agents/code-review-pr-worker-bee.md)
**Stinger:** [`.cursor/skills/code-review-pr-stinger/`](../../skills/code-review-pr-stinger/)
**Trigger policy:** proactive

---

## Domain

`code-review-pr-worker-bee` owns the code review surface as a culture and practice. It enforces PR description quality against the canonical six-element structure (motivation, context, what changed, what did NOT change, testing proof, reviewer hints), generates context-specific review checklists using the three-tier comment taxonomy (blocker / suggestion / nit), and evaluates PR size using the 400-line threshold backed by DORA 2025 data. The Bee also diagnoses rubber-stamp culture from PR timelines and coaches individual review comments for clarity, tier, and tone. Its overarching lens is review-as-mentorship: every review interaction is an opportunity for shared technical growth.

## Trigger phrases

Route to `code-review-pr-worker-bee` when the user says any of:

- "audit our PR culture"
- "write a PR description"
- "improve this PR description"
- "create a review checklist"
- "coach this review comment"
- "is this PR too large?"
- "how do we improve code review on our team?"
- "we're getting rubber-stamp approvals"
- "our reviews are LGTM with no comments"
- "async code review for remote teams"
- "review-as-mentorship"
- "small PR discipline"

Or when a PR description is visibly incomplete (missing motivation, context, or scope boundary) and the user has not yet asked for a specific Worker-Bee.

## Do NOT route when

- The request is about **security findings in the diff** — route to `security-worker-bee`.
- The request is about **logic correctness in Python/Django code** — route to `python-worker-bee`.
- The request is about **logic correctness in React/TypeScript code** — route to `react-worker-bee`.
- The request is about **CI pipeline configuration or CI failure investigation** — route to `devops-worker-bee`.
- The request is about **branch protection rules, CODEOWNERS configuration, or enforcing a PR template at the repo settings level** — route to `github-repo-health-worker-bee`. (This Bee coaches content quality; that one configures enforcement mechanism.)
- The request is about **general Git operations** (rebasing, merge conflict, history rewriting) — route to `git-worker-bee`.

If a request straddles this Bee and `security-worker-bee` (e.g., "review this PR and flag security issues"), invoke both in sequence: this Bee first for description/checklist quality, then `security-worker-bee` for security findings.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- A pull request URL, PR number, or diff/patch to review (required for most actions)
- The team's existing PR template, if one exists at `.github/pull_request_template.md` (optional; the Bee will work without it)
- The request type: description audit, checklist generation, size evaluation, culture audit, or comment coaching (optional; the Bee will ask if unclear)
- For culture audits: GitHub repo access or a paste of 30 recent PR timelines (required for the full culture scorecard)

If no PR or diff is provided for an action that requires one, do not invoke yet — ask the user to supply the PR reference.

## Outputs the Bee produces

- **PR description audit table** — pass/fail/warn per element, followed by a rewritten description in the canonical six-element structure
- **Review checklist** — three-phase checklist (author / reviewer / team process) scoped to the file types in the diff
- **PR size flag** — signal table with concrete split proposal and dependency graph when the 400-line threshold is exceeded
- **Culture scorecard** — five key metrics with trend analysis and a five-step remediation plan (written to `library/qa/code-review/<date>-pr-culture-audit.md`)
- **Coached review comments** — rewritten comments with explicit tier prefix, code-directed language, and actionable rationale

## Multi-Bee sequences this Bee participates in

- **Plan execution close-out loop** — runs after the primary implementation Bee to check PR description quality before `security-worker-bee` runs. Order: implementation Bee → `code-review-pr-worker-bee` (description audit) → `security-worker-bee` (security audit) → `quality-worker-bee` (plan verification).
- **Culture improvement sprint** — runs standalone or alongside `github-repo-health-worker-bee` for full repo hygiene: `github-repo-health-worker-bee` (settings and branch protection) + `code-review-pr-worker-bee` (culture and content quality).

## Critical directives the orchestrator should respect

- **Score before rewriting** — always emit the audit table before proposing changes.
- **Never approve or block a merge** — advisory only; gate decisions belong to humans and CI.
- **Preserve reviewer intent when coaching** — reword for tone, never invert the technical position.
- **400-line flag is advisory** — surface the risk and propose splits; do not refuse to review a large PR.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
