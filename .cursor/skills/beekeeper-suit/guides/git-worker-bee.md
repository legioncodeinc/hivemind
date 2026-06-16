# Git Worker-Bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `git-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/git-worker-bee.md`](../../agents/git-worker-bee.md)
**Stinger:** [`.cursor/skills/git-stinger/`](../../skills/git-stinger/)
**Trigger policy:** on-demand

---

## Domain

`git-worker-bee` owns the full Git workflow surface for developers: interactive rebase (`rebase -i` squash / fixup / reword / drop / autosquash), conflict resolution (merge conflicts, rebase conflicts, rerere, mergetool), history rewriting (`git filter-repo`, BFG — never `filter-branch`), the reset/reflog recovery toolkit (all three reset types, recovering deleted branches and commits, `ORIG_HEAD`), Git worktrees for parallel branch work, client-side hooks (pre-commit, commit-msg, pre-push; Husky, lefthook), submodules vs subtrees decision matrix, large-file storage (Git LFS, partial clone, sparse checkout), and commit signing. It does not own CI/CD pipeline configuration, server-side hooks in CI infrastructure, or credential rotation after a secrets incident — those escalate to `devops-worker-bee` and `security-worker-bee` respectively.

## Trigger phrases

Route to `git-worker-bee` when the user says any of:

- "squash my commits"
- "interactive rebase"
- "I accidentally pushed a secret / credential / API key"
- "my repo is huge / too big / slow to clone"
- "undo that rebase"
- "recover my deleted branch"
- "recover a lost commit"
- "work on two branches at the same time"
- "set up Git hooks"
- "submodules vs subtrees"
- "Git LFS"
- "partial clone"
- "sparse checkout"
- "git filter-repo"
- "remove file from Git history"
- "force push is blocked"
- "git reflog"
- "git reset --hard regret"
- "autosquash"
- "rerere"

Or when the request involves any Git workflow, history operation, or recovery scenario.

## Do NOT route when

- The request is about CI/CD pipeline configuration triggered by Git events (push hooks, PR pipelines) — route to **devops-worker-bee**
- Server-side Git hooks (`pre-receive`, `update`, `post-receive`) in a CI runner or hosting platform — route to **devops-worker-bee**
- Credential rotation after a leaked secret is discovered — route to **security-worker-bee** (in parallel with git-worker-bee for history cleanup)
- Secret scanning configuration, repository security policies, branch protection rules on GitHub/GitLab — route to **security-worker-bee** or **devops-worker-bee**
- The request is primarily about GitHub/GitLab REST API usage (creating PRs programmatically, webhook configuration) — route to **devops-worker-bee** or handle inline

If a request straddles git-worker-bee and devops-worker-bee (e.g., "set up a pre-push hook that runs in CI"), prefer git-worker-bee for the local hook setup and explicitly escalate the CI portion to devops-worker-bee.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The Git problem or goal: "squash my last 5 commits", "I accidentally pushed a secret to main", "my repo is 4 GB"
- The repository context (helpful but not required): monorepo vs polyrepo, public vs private, team-shared vs solo
- Optional: Git version (`git --version`) — the Bee will check this itself for advanced features
- Optional: the specific branch name, commit sha, or error message when diagnosing a problem

If the goal is unclear, the Bee will ask for clarification before proceeding — it will never guess on a potentially destructive operation.

## Outputs the Bee produces

- Exact shell commands in fenced code blocks, annotated line by line
- The escape hatch command (recovery) before any destructive operation
- A before-state / operation / after-state explanation
- Template files from `templates/`: `.gitattributes`, hook scripts, rebase cheat-sheet
- Escalation items for `security-worker-bee` (credential rotation) or `devops-worker-bee` (CI hooks) when applicable

## Multi-Bee sequences this Bee participates in

- **Secrets-in-history incident response** — `git-worker-bee` handles history rewriting and force-push coordination; `security-worker-bee` handles credential rotation, access log audit, and stakeholder notification. Both run in parallel; neither waits for the other.
- **Developer workstation setup** — `git-worker-bee` handles Git configuration and hooks; `terminal-bash-worker-bee` handles shell tooling and dotfiles; `devops-worker-bee` handles CI/CD.
- **Monorepo architecture** — `git-worker-bee` advises on sparse checkout and subtrees; `devops-worker-bee` handles CI configuration for the monorepo.

## Critical directives the orchestrator should respect

- Always show the escape hatch (recovery command) before any destructive Git operation
- Use `--force-with-lease` instead of `--force` for every force-push recommendation
- Never recommend `git filter-branch` — always use `git filter-repo` or BFG
- Escalate credential rotation to `security-worker-bee` immediately when a secret is discovered in history
- Confirm Git version before recommending worktrees, partial clone, sparse checkout, or `--rebase-merges`

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
