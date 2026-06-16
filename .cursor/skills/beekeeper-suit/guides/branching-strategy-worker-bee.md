# Branching Strategy Worker-Bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `branching-strategy-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/branching-strategy-worker-bee.md`](../../agents/branching-strategy-worker-bee.md)
**Stinger:** [`.cursor/skills/branching-strategy-stinger/`](../../skills/branching-strategy-stinger/)
**Trigger policy:** proactive

---

## Domain

`branching-strategy-worker-bee` owns the strategic and tactical decisions around version-control workflow: which branching model to adopt (trunk-based development, GitHub Flow, GitLab Flow, or GitFlow), how to manage release branches and hotfixes, when to use feature flags instead of long-lived branches, how to evaluate the merge-vs-rebase choice, how to avoid the long-lived-branch trap, and when GitHub Merge Queue pays for its complexity. It produces a branching policy document committed to the repo and routes configuration work (protection rules, CI trigger changes) to the correct sibling Bees.

It does NOT own Git mechanics (interactive rebase, conflict resolution, history rewriting — that is `git-worker-bee`), branch protection ruleset configuration (that is `github-repo-health-worker-bee`), or CI/CD pipeline topology (that is `devops-worker-bee`).

## Trigger phrases

Route to `branching-strategy-worker-bee` when the user says any of:

- "which branching model should we use"
- "we have too many merge conflicts"
- "our release process is broken / unclear / chaotic"
- "GitFlow or trunk-based?"
- "GitHub Flow vs GitFlow"
- "should we use trunk-based development?"
- "merge or rebase?"
- "should I use a feature flag or a feature branch?"
- "our branches are getting too old / too big"
- "long-lived branches are causing problems"
- "hotfix process is unclear"
- "we want to migrate away from GitFlow"
- "set up GitHub Merge Queue"
- "our CI is failing because of concurrent merges"

Or when a PR, incident postmortem, or retrospective surfaces branching pain or unclear release processes.

## Do NOT route when

- The request involves Git mechanics: interactive rebase, conflict resolution, history surgery, filter-repo, LFS, worktrees → route to **git-worker-bee**
- The request involves configuring branch protection rules, required reviews, or CODEOWNERS in GitHub/GitLab → route to **github-repo-health-worker-bee**
- The request involves CI/CD pipeline design, Dockerfile hygiene, GitHub Actions architecture → route to **devops-worker-bee**
- The request is about release notes or changelog communication → route to **changelog-release-notes-worker-bee**
- Feature flag platform selection and implementation code → scope decision here; route implementation to **react-worker-bee** or **python-worker-bee**

If a request straddles branching-strategy-worker-bee and git-worker-bee (e.g., "help me rebase my old branches before migrating to trunk-based"), prefer branching-strategy-worker-bee for the strategy framing and explicitly escalate the mechanical rebase operations to git-worker-bee.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- **Release cadence** — continuous deployment, sprint-based, quarterly, or hotfix-heavy
- **Team size** — approximate number of engineers
- **Product type** — SaaS web app, mobile SDK, desktop software, library, internal tooling
- **Multi-version support** — does the team support multiple live production versions simultaneously?
- **Feature flag infrastructure** — already in use, planned, or none
- **Current pain points** — merge conflicts, unclear hotfix process, long-lived branches, rebase wars

Optional but helpful: `git log --oneline --graph` dump, branch list, or `.github/` folder for context.

## Outputs the Bee produces

- A branching model recommendation with explicit rationale (citing the 9-factor decision matrix)
- A merge strategy ruling (squash vs merge commit vs rebase, with team-level policy)
- A feature-flag vs branch verdict (with the Fowler flag taxonomy and cost/benefit accounting)
- A filled-in `docs/engineering/branching-policy.md` committed to the repo
- Escalation items: protection-rule deltas for `github-repo-health-worker-bee`, CI trigger changes for `devops-worker-bee`

## Multi-Bee sequences this Bee participates in

- **Branching model overhaul** — `branching-strategy-worker-bee` owns the strategy and policy document; `github-repo-health-worker-bee` applies the protection ruleset changes; `devops-worker-bee` updates CI workflows (e.g., adds `merge_group:` trigger for Merge Queue)
- **GitFlow migration** — `branching-strategy-worker-bee` writes the 5-step migration playbook; `git-worker-bee` may be invoked for the branch history cleanup steps
- **Release process setup** — `branching-strategy-worker-bee` defines the release branch lifecycle and hotfix protocol; `changelog-release-notes-worker-bee` owns the post-release communication

## Critical directives the orchestrator should respect

- Always ask for release cadence before recommending a model
- Never recommend GitFlow as a default — require multi-version justification
- Always surface the 2-working-day branch-age threshold (DORA 2025: elite teams median 0.8 days)
- Present feature flag costs honestly — not just benefits
- Route protection-ruleset configuration to `github-repo-health-worker-bee`, not `devops-worker-bee`

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
