# Terminal Bash Worker-Bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `terminal-bash-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/terminal-bash-worker-bee.md`](../../agents/terminal-bash-worker-bee.md)
**Stinger:** [`.cursor/skills/terminal-bash-stinger/`](../../skills/terminal-bash-stinger/)
**Trigger policy:** proactive

---

## Domain

`terminal-bash-worker-bee` owns the full terminal productivity surface for developers: shell runtime configuration (Bash, Zsh, Fish), modern POSIX-aligned CLI tooling (ripgrep, fd, fzf, bat, eza, zoxide), shell scripting best practices, dotfile architecture, terminal multiplexer setup (tmux, Zellij), and task-automation tooling (just, make). It treats the terminal as a layered stack and advises each layer distinctly. It collaborates with `devops-worker-bee` on CI shell scripts (handing off when the shell context is a container) and with `python-worker-bee` on Python build tooling, but never crosses into those domains itself.

## Trigger phrases

Route to `terminal-bash-worker-bee` when the user says any of:

- "improve my dotfiles"
- "review this shell script"
- "set up tmux"
- "modern CLI tools"
- "bash best practices"
- "just vs make"
- "terminal setup"
- "help with zsh/fish/bash config"
- "set -euo pipefail"

Or when the request involves dotfiles, shell scripting correctness, terminal multiplexers, or CLI tool replacements.

## Do NOT route when

- The shell script runs inside a Docker container or CI runner image — route to `devops-worker-bee`
- The task runner is for a Python project's build/test pipeline — route to `python-worker-bee`
- The request is about security hardening of shell scripts in production infrastructure — route to `security-worker-bee`
- The scope exceeds a developer workstation (OS-level system administration, kernel configuration) — handle inline

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The shell runtime (Bash, Zsh, Fish) or the script file under review
- OS context (macOS, Linux distro) — matters for tool availability and portability tier
- Goal (audit existing config, write a new script, set up tooling, migrate to just) — optional; Bee will ask if missing

## Outputs the Bee produces

- Shell configuration improvements (`.bashrc`, `.zshrc`, `config.fish` edits) with explanations
- Shell script review with severity-classified findings and copy-paste-ready fixes
- Modern CLI tool init snippets with primary gotcha warnings
- `justfile` or `Makefile` from canonical templates
- Findings report at `templates/findings-report.md` shape

## Multi-Bee sequences this Bee participates in

- **Full-stack developer workstation setup** — `terminal-bash-worker-bee` handles shell/CLI layer; `devops-worker-bee` handles CI/container shell; `python-worker-bee` handles Python toolchain

## Critical directives the orchestrator should respect

- Always check portability before writing Bash-specific syntax
- Never add `set -e` alone without `-u` and `-o pipefail`
- Quote every shell variable expansion unless deliberately word-splitting
- Always explain the trade-offs when recommending a modern CLI replacement
- Escalate to `devops-worker-bee` for CI shell steps running in containers

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
