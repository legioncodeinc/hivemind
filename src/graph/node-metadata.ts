/**
 * Derived node metadata (Phase 1.5, B4): fan-in / fan-out / is_entrypoint.
 *
 * Computed in buildSnapshot AFTER cross-file edge resolution so the degrees
 * reflect the full graph (cross-file calls, repointed imports, resolved
 * heritage), not just intra-file edges. Pure + deterministic; mutates the
 * passed-in node objects in place (they are freshly built in buildSnapshot).
 */

import type { GraphEdge, GraphNode } from "./types.js";

/**
 * Set `fan_in`, `fan_out`, and `is_entrypoint` on every node from the resolved
 * edge set. `fan_in` = incoming edges (any relation), `fan_out` = outgoing.
 * `is_entrypoint` = exported && fan_in === 0 (a likely public/root symbol —
 * nothing in the graph depends on it).
 */
export function annotateNodeDegrees(nodes: readonly GraphNode[], links: readonly GraphEdge[]): void {
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const e of links) {
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }
  for (const n of nodes) {
    const fi = inDeg.get(n.id) ?? 0;
    const fo = outDeg.get(n.id) ?? 0;
    n.fan_in = fi;
    n.fan_out = fo;
    n.is_entrypoint = n.exported && fi === 0;
  }
}
