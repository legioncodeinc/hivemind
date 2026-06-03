/**
 * impact/<pattern> — blast radius (B5).
 *
 * "If I change this symbol, what could be affected?" Answers with the
 * transitive set of DEPENDENTS: every node that reaches the target by
 * following edges in reverse (incoming `calls`/`imports`/`extends`/
 * `implements`/`method_of`), grouped by BFS depth. Deterministic, AST-only,
 * over the fully-resolved snapshot edges (so cross-file dependents count).
 *
 * Honest scope: only resolved edges are traversed — cross-file relationships
 * via bare/aliased/barrel/dynamic imports are not in the graph, so the impact
 * set is a LOWER BOUND, not a proof of total safety.
 */

import type { GraphSnapshot, GraphEdge } from "../types.js";

/** Max dependents listed before truncating (the true total is still reported). */
const IMPACT_CAP = 80;
/** Safety bound on BFS depth so a pathological graph can't run away. */
const MAX_DEPTH = 25;

export function renderImpact(snap: GraphSnapshot, pattern: string): string {
  const needle = pattern.toLowerCase();
  const matches = snap.nodes.filter((n) => n.id.toLowerCase().includes(needle));
  if (matches.length === 0) {
    return `No node matches "${pattern}". Try cat memory/graph/find/${pattern} to explore.`;
  }
  if (matches.length > 1) {
    const lines = [`"${pattern}" matches ${matches.length} nodes — be more specific:`, ""];
    for (const m of matches.slice(0, 20)) lines.push(`  ${m.id}`);
    if (matches.length > 20) lines.push(`  ... and ${matches.length - 20} more`);
    return lines.join("\n");
  }
  const target = matches[0]!;

  // Reverse adjacency: target -> [edges pointing at it]. Build once. Only edges
  // whose SOURCE is a real node are kept, so a dependent is always a graph node
  // (defensive consistency with tour/path/neighborhood; codex review).
  const nodeIds = new Set(snap.nodes.map((n) => n.id));
  const incoming = new Map<string, GraphEdge[]>();
  for (const e of snap.links) {
    if (!nodeIds.has(e.source)) continue;
    const list = incoming.get(e.target);
    if (list) list.push(e); else incoming.set(e.target, [e]);
  }

  // BFS over reverse edges. Record the depth + the relation/source that first
  // reached each dependent (stable: process queue in id order per level).
  const depthOf = new Map<string, number>();
  const viaOf = new Map<string, { rel: string; from: string }>();
  depthOf.set(target.id, 0);
  let frontier = [target.id];
  let depth = 0;
  while (frontier.length > 0 && depth < MAX_DEPTH) {
    depth++;
    const next: string[] = [];
    for (const id of frontier) {
      const edges = (incoming.get(id) ?? []).slice().sort((a, b) =>
        a.source.localeCompare(b.source) || a.relation.localeCompare(b.relation));
      for (const e of edges) {
        if (depthOf.has(e.source)) continue; // already reached at a shallower/equal depth
        depthOf.set(e.source, depth);
        viaOf.set(e.source, { rel: e.relation, from: id });
        next.push(e.source);
      }
    }
    next.sort();
    frontier = next;
  }

  // Collect dependents (everything except the target itself), by depth.
  const dependents = [...depthOf.entries()].filter(([id]) => id !== target.id);
  const total = dependents.length;

  const lines: string[] = [];
  lines.push(`Impact of ${target.id}`);
  if (target.signature) lines.push(`  ${target.signature}`);
  lines.push("");
  if (total === 0) {
    lines.push("No resolved dependents — nothing in the graph reaches this symbol.");
    lines.push("(Cross-file resolution is partial; this is a lower bound, not proof it's unused.)");
    return lines.join("\n");
  }

  lines.push(`${total} dependent${total === 1 ? "" : "s"} (transitive), by depth:`);
  lines.push("");

  // Group by depth, sorted; within a depth, sort by id.
  const byDepth = new Map<number, string[]>();
  for (const [id, d] of dependents) {
    const list = byDepth.get(d) ?? [];
    list.push(id);
    byDepth.set(d, list);
  }
  let shown = 0;
  for (const d of [...byDepth.keys()].sort((a, b) => a - b)) {
    const ids = byDepth.get(d)!.sort();
    lines.push(`  depth ${d} (${ids.length}):`);
    for (const id of ids) {
      if (shown >= IMPACT_CAP) break;
      const via = viaOf.get(id);
      const tag = via ? `  [${via.rel} → ${via.from}]` : "";
      lines.push(`    ${id}${tag}`);
      shown++;
    }
    if (shown >= IMPACT_CAP) break;
  }
  if (total > shown) lines.push(`  ... and ${total - shown} more`);
  lines.push("");
  lines.push("Note: only RESOLVED edges are traversed (cross-file resolution is partial),");
  lines.push("so this is a lower bound on impact, not a completeness guarantee.");
  return lines.join("\n");
}
