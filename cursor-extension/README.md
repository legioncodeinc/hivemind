# Hivemind for Cursor

VS Code / Cursor extension that surfaces Hivemind health, authentication, dashboard KPIs, codebase graph, rules, and skill sync inside the editor.

## Development

```bash
cd cursor-extension
npm install
npm run watch   # or npm run compile
```

Press F5 in VS Code with the extension folder open, or install the VSIX after packaging.

## Features

- Status bar health indicator (CLI, cursor-agent, hooks, login)
- One-click hook auto-wiring to `~/.cursor/hooks.json`
- Browser and API-key Hivemind login
- Dashboard webview: KPIs, settings, sessions, graph, rules, skills
- Cursor skill symlink bridge (`~/.cursor/skills-cursor/` and project `.cursor/skills/`)

## Requirements

- Hivemind CLI on PATH
- `cursor-agent` for session summaries
- Built hivemind bundle at `harnesses/cursor/bundle/` (run `npm run build` in repo root)
