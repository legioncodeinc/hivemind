# Cursor IDE Worker-Bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `cursor-ide-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/cursor-ide-worker-bee.md`](../../agents/cursor-ide-worker-bee.md)
**Stinger:** [`.cursor/skills/cursor-ide-stinger/`](../../skills/cursor-ide-stinger/)
**Trigger policy:** proactive

---

## Domain

`cursor-ide-worker-bee` owns the Cursor IDE platform surface: everything about configuring, extending, and mastering Cursor as a development platform, not the code it produces. Its domain covers project rules (`.cursorrules` migration and `.cursor/rules/*.mdc` authoring), MCP server registration and tool authoring (`mcp.json` schema, TypeScript MCP server stubs), the `@cursor/sdk` API for programmatic agent automation (`Agent.create`, `run.stream`, `CursorAgentError`), custom modes and their system-prompt design, the Agents Window and Cloud Agents (Cursor 3, April 2026+), and Cursor productivity patterns including slash commands (`/multitask`, `/worktree`, `/best-of-n`) and keybindings. It is the meta-worker-bee: it makes every other Legion Bee's workflow more powerful by ensuring Cursor itself is optimally configured.

## Trigger phrases

Route to `cursor-ide-worker-bee` when the user says any of:

- "review my `.cursorrules`" / "migrate my rules to MDC" / "create a rule file"
- "add an MCP tool" / "register an MCP server" / "build an MCP server"
- "Cursor SDK" / "`Agent.create`" / "`@cursor/sdk`" / "automate with Cursor"
- "create a custom mode" / "design a Cursor mode"
- "Cloud Agents" / "Agents Window" / "Background Agents" / `/multitask`
- "Cursor keybindings" / "Cursor shortcuts" / "productivity in Cursor"
- "Cursor extension" / "Cursor plugin" / "`vscode.cursor.*`"

Or when the request implicitly involves configuring Cursor's agent context, tooling, or automation layer.

## Do NOT route when

- The user wants code quality review of what a Cursor agent produced — route to the relevant language worker-bee (`react-worker-bee`, `python-worker-bee`, etc.).
- The user wants prompt engineering for external LLMs — route to `mind-worker-bee`.
- The user wants the CI/CD pipeline that runs an SDK script — route to `devops-worker-bee` (after `cursor-ide-worker-bee` provides the SDK code).
- The user wants a security audit of MCP server credential handling — route to `security-worker-bee`.
- The user is building React components inside a Cursor canvas — route to `react-worker-bee`.

If a request straddles two Bees' domains (e.g., "build an SDK script and wire it into GitHub Actions"), `cursor-ide-worker-bee` handles the SDK code, then hands off to `devops-worker-bee` for the pipeline.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- A description of the Cursor configuration problem, integration, or automation they want.
- Optionally: existing `.cursor/rules/` files, `mcp.json`, `settings.json`, or SDK script fragments to review or build on.
- Optionally: the user's current Cursor version (some features are version-gated to Cursor 3+).

If the Cursor version is unknown and the requested feature is version-gated, ask before proceeding.

## Outputs the Bee produces

- Modified or new `.cursor/rules/*.mdc` files with correct frontmatter and scoping.
- `mcp.json` entries and TypeScript MCP server stubs.
- `@cursor/sdk` TypeScript scripts with full error handling.
- Custom mode definitions (UI-guided, or a JSON structure for future file-based config).
- Advisory findings with references to the governing Cursor docs.

## Multi-Bee sequences this Bee participates in

- **IDE productivity setup** — `cursor-ide-worker-bee` configures Cursor (rules, MCP, SDK); `devops-worker-bee` wires the resulting SDK scripts into CI/CD pipelines; `security-worker-bee` audits any MCP credential handling.
- **Legion Bee Factory** — `cursor-ide-worker-bee` is the meta-tooling Bee; every factory Bee benefits from it being invoked first on a new repo to set up canonical rule files and MCP servers.

## Critical directives the orchestrator should respect

- Never write `.cursorrules` for a project already using `.cursor/rules/` — `.cursorrules` is silently ignored in Agent mode.
- Always include explicit JSON Schema on every MCP tool — Cursor silently rejects malformed schemas.
- Always show `CursorAgentError` handling in SDK examples — SDK runs fail silently without it.
- Prefer `alwaysApply: false` with narrow globs — `alwaysApply: true` rules share a ~2,000-token budget cap.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
