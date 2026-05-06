/**
 * Per-agent delivery dispatch. The framework hands each adapter a rendered
 * plain-text notification block. The adapter writes it (or doesn't) in
 * whatever shape that agent's harness will surface to the user without
 * concatenating it into the existing memory/hivemind block.
 *
 * See AGENT_CHANNELS.md for which adapters are real vs no-op stubs and why.
 */

import type { Agent } from "../types.js";
import { emitClaudeCode } from "./claude-code.js";
import { emitCodex } from "./codex.js";
import { emitCursor } from "./cursor.js";
import { emitHermes } from "./hermes.js";

export type EmitFn = (rendered: string) => void;

const ADAPTERS: Record<Agent, EmitFn> = {
  "claude-code": emitClaudeCode,
  codex: emitCodex,
  cursor: emitCursor,
  hermes: emitHermes,
};

export function emit(agent: Agent, rendered: string): void {
  if (!rendered) return;
  ADAPTERS[agent](rendered);
}
