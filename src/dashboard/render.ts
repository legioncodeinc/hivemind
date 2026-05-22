/**
 * HTML rendering for `hivemind dashboard`.
 *
 * Pure string-builder: takes the DashboardData envelope produced by
 * `./data.ts` and returns a fully self-contained HTML document. No
 * imports of node:fs, no fetches, no DOM dependencies — every test
 * can call this with a fixture and inspect the output.
 *
 * Dependency on the network is limited to one CDN-hosted script tag
 * (vis-network ~150 KB minified). Picked vis-network over D3 because:
 *
 *   - One include, one constructor call — no D3 layout boilerplate.
 *   - Handles 1k+ nodes with reasonable physics out of the box.
 *   - Built-in zoom / pan / drag / hover tooltip.
 *
 * The graphify-shape snapshot is transformed into vis-network's
 * `{ nodes, edges }` here (not in `./data.ts`) so the data layer stays
 * data-shape-agnostic and the renderer owns its own UI concerns.
 *
 * Security: every string that originates from outside (project name,
 * repo_key, snapshot JSON, file paths) goes through `escHtml` before
 * landing in markup, or through `safeJsonForScript` before landing in
 * an embedded `<script type="application/json">` block. We never use
 * `<script>VAR = ...</script>` injection — the embedded JSON is parsed
 * by a separate inline script, so a malicious `</script>` substring in
 * data can't escape the JSON container even if it's not pre-escaped
 * (we escape it anyway as defense-in-depth).
 */

import type { DashboardData, DashboardKpis } from "./data.js";

const VIS_NETWORK_CDN = "https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js";

/**
 * Node-kind colors aligned to graphify-style palette. Each kind gets a
 * distinct hue at low saturation so the dark background is comfortable
 * to look at for more than a few seconds.
 */
const KIND_COLORS: Record<string, string> = {
  function: "#7aa2f7", // soft blue
  class: "#bb9af7",    // purple
  method: "#9ece6a",   // green
  interface: "#e0af68", // amber
  type_alias: "#7dcfff", // cyan
  enum: "#f7768e",      // pink
  const: "#9d7cd8",     // muted purple
  module: "#565f89",    // slate
};
const DEFAULT_NODE_COLOR = "#565f89";

interface VisNode {
  id: string;
  label: string;
  title: string;
  group?: string;
  color?: { background: string; border: string };
}

interface VisEdge {
  from: string;
  to: string;
  title: string;
  /** Showing edge labels gets noisy past ~50 edges; we omit by default. */
  label?: string;
}

interface RawSnapshot {
  nodes?: unknown;
  links?: unknown;
}

interface RawNode {
  id?: unknown;
  label?: unknown;
  kind?: unknown;
  source_file?: unknown;
  source_location?: unknown;
}

interface RawEdge {
  source?: unknown;
  target?: unknown;
  relation?: unknown;
  confidence?: unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Build the vis-network `{ nodes, edges }` payload from a graphify-shape
 *  snapshot. Defensive: any node missing an `id` is dropped; any edge
 *  whose endpoint id doesn't match a known node is dropped. The
 *  rendered graph stays consistent even if the snapshot was generated
 *  by an older schema. */
export function transformSnapshotToVis(snapshot: unknown): { nodes: VisNode[]; edges: VisEdge[] } {
  if (!isObject(snapshot)) return { nodes: [], edges: [] };
  const raw = snapshot as RawSnapshot;

  const visNodes: VisNode[] = [];
  const ids = new Set<string>();
  if (Array.isArray(raw.nodes)) {
    for (const n of raw.nodes) {
      if (!isObject(n)) continue;
      const node = n as RawNode;
      const id = asString(node.id);
      if (!id) continue;
      if (ids.has(id)) continue; // dedup defensively — snapshot.ts sorts but doesn't dedup
      ids.add(id);

      const label = asString(node.label) ?? id;
      const kind = asString(node.kind);
      const sourceFile = asString(node.source_file);
      const sourceLoc = asString(node.source_location);
      const titleParts: string[] = [];
      if (kind) titleParts.push(kind);
      if (sourceFile) {
        const loc = sourceLoc ? `${sourceFile}:${sourceLoc}` : sourceFile;
        titleParts.push(loc);
      }
      const color = kind && KIND_COLORS[kind] ? KIND_COLORS[kind] : DEFAULT_NODE_COLOR;
      // vis-network renders `title` as HTML, NOT text — so any markup
      // in a snapshot id / source_file / source_location would execute
      // on hover. Pre-escape every component that lands in a tooltip
      // string. Labels are passed to the canvas-rendered node face
      // and are text-only by vis design, so they don't need this.
      visNodes.push({
        id,
        label,
        title: titleParts.length > 0
          ? titleParts.map(escHtml).join(" · ")
          : escHtml(id),
        group: kind ?? undefined,
        color: { background: color, border: color },
      });
    }
  }

  const visEdges: VisEdge[] = [];
  if (Array.isArray(raw.links)) {
    for (const l of raw.links) {
      if (!isObject(l)) continue;
      const edge = l as RawEdge;
      const from = asString(edge.source);
      const to = asString(edge.target);
      if (!from || !to) continue;
      // Don't filter on `ids.has(...)` — Phase 1 emits edges with
      // unresolved targets (cross-file calls), and surfacing those as
      // dangling endpoints is useful information for the viewer.
      // vis-network auto-creates ghost nodes for unknown endpoints.
      const relation = asString(edge.relation);
      const confidence = asString(edge.confidence);
      const titleParts: string[] = [];
      if (relation) titleParts.push(relation);
      if (confidence) titleParts.push(`[${confidence}]`);
      // Same HTML-in-tooltip concern as nodes; escape every component
      // that ends up in vis-network's `title`. The fallback string
      // includes node ids, which are also potentially attacker-controlled.
      visEdges.push({
        from,
        to,
        title: titleParts.length > 0
          ? titleParts.map(escHtml).join(" ")
          : `${escHtml(from)} → ${escHtml(to)}`,
      });
    }
  }

  return { nodes: visNodes, edges: visEdges };
}

/** HTML-attribute / text-content escape. Covers the five chars browsers
 *  may interpret inside markup. Skips `'` deliberately — every attribute
 *  in the rendered output uses double-quote delimiters. */
export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Serialize a value for embedding inside
 *  `<script type="application/json">...</script>`. The standard JSON
 *  output is HTML-safe EXCEPT for three substrings the HTML parser
 *  can latch onto:
 *
 *    - `</` could close the script tag → escape to `<\/` (a valid
 *      JSON string escape that parses back to "</")
 *    - `<!--` and `-->` could be reinterpreted as an HTML comment
 *      inside the script element by legacy / lenient parsers → use
 *      `!` and `>` (unicode escapes; valid JSON; parse back
 *      to literal `<!--` and `-->` so callers see the original
 *      string)
 *
 *  Earlier version used `<\!--` and `--\>` literals; those are NOT
 *  valid JSON escapes (`\!` and `\>` aren't defined) so any snapshot
 *  string containing `<!--` or `-->` made JSON.parse fail in the
 *  browser. Codex review on this commit caught it. */
export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/<\//g, "<\\/")
    .replace(/<!--/g, "<\\u0021--")
    .replace(/-->/g, "--\\u003e");
}

/** 1234 → "1.2k", 12345 → "12.3k", 1234567 → "1.2M". Caller decides
 *  whether to prepend "~". 0 and negative produce "0" so the UI never
 *  shows a misleading "-1k saved". */
export function formatTokensCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return `${Math.round(n)}`;
  if (n < 100_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** 42000 → "42,000". en-US grouping; matches primary-banner's body line. */
export function formatInt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}

function renderKpiCards(kpis: DashboardKpis): string {
  const tokensValue = kpis.tokensSaved == null
    ? "—"
    : `~${formatTokensCompact(kpis.tokensSaved)}`;
  const tokensSub = (() => {
    if (kpis.tokensSource === "org") {
      return kpis.userTokensSaved != null
        ? `Org-wide · you ~${formatTokensCompact(kpis.userTokensSaved)}`
        : "Org-wide";
    }
    if (kpis.tokensSource === "local") return "Local (this machine)";
    return "Run a session to start tracking";
  })();

  const memoryValue = kpis.memorySearches > 0
    ? formatInt(kpis.memorySearches)
    : kpis.tokensSource === "none" ? "—" : "0";

  const sessionsValue = kpis.sessionsCount == null
    ? "—"
    : formatInt(kpis.sessionsCount);

  const cards = [
    {
      label: "Tokens saved",
      value: tokensValue,
      sub: tokensSub,
    },
    {
      label: "Skills created",
      value: formatInt(kpis.skillsCreated),
      sub: "~/.claude/skills/",
    },
    {
      label: "Memory recalls",
      value: memoryValue,
      sub: kpis.tokensSource === "org" ? "Org-wide" : kpis.tokensSource === "local" ? "Local" : "",
    },
    {
      label: "Sessions",
      value: sessionsValue,
      sub: kpis.tokensSource === "org" ? "Org-wide" : kpis.tokensSource === "local" ? "Local" : "",
    },
  ];

  return cards.map(c => `
        <div class="kpi">
          <div class="kpi-label">${escHtml(c.label)}</div>
          <div class="kpi-value">${escHtml(c.value)}</div>
          <div class="kpi-sub">${escHtml(c.sub)}</div>
        </div>`).join("");
}

function renderGraphSection(data: DashboardData): string {
  if (data.graph == null) {
    return `
      <div class="graph-card">
        <h2>Codebase graph</h2>
        <div class="empty">
          No graph snapshot yet for this repo.<br>
          Run <code>hivemind graph build</code> to generate one.
        </div>
      </div>`;
  }

  const visPayload = transformSnapshotToVis(data.graph.snapshot);
  const commitLabel = data.graph.commitSha
    ? `commit ${data.graph.commitSha.slice(0, 12)}`
    : "no commit (loose dir)";
  const meta = `${formatInt(data.graph.nodeCount)} nodes · ${formatInt(data.graph.edgeCount)} edges · ${commitLabel}`;

  return `
      <div class="graph-card">
        <h2>Codebase graph</h2>
        <div class="graph-meta">${escHtml(meta)}</div>
        <div id="graph"></div>
      </div>
      <script type="application/json" id="hm-graph-data">${safeJsonForScript(visPayload)}</script>
      <script src="${VIS_NETWORK_CDN}"></script>
      <script>
        (function () {
          var holder = document.getElementById('hm-graph-data');
          var container = document.getElementById('graph');
          if (!holder || !container || typeof vis === 'undefined') return;
          var payload;
          try { payload = JSON.parse(holder.textContent); }
          catch (e) { container.textContent = 'graph payload parse failed'; return; }
          if (!payload || !Array.isArray(payload.nodes) || payload.nodes.length === 0) {
            container.textContent = 'snapshot has no nodes';
            return;
          }
          new vis.Network(container, payload, {
            nodes: {
              shape: 'dot',
              size: 9,
              font: { color: '#e8eaed', size: 11, face: 'system-ui, sans-serif' },
              borderWidth: 1,
            },
            edges: {
              color: { color: 'rgba(120, 130, 150, 0.45)', highlight: '#f5b80a', hover: '#e8eaed' },
              arrows: { to: { enabled: true, scaleFactor: 0.45 } },
              smooth: { enabled: true, type: 'continuous', roundness: 0.2 },
              width: 1,
            },
            physics: {
              stabilization: { iterations: 120 },
              barnesHut: { gravitationalConstant: -2200, springLength: 80, springConstant: 0.04 },
            },
            interaction: { hover: true, dragNodes: true, tooltipDelay: 120 },
          });
        }());
      </script>`;
}

const STYLES = `
        :root {
          color-scheme: dark;
          --bg: #0b0d10;
          --fg: #e8eaed;
          --muted: #8b9099;
          --accent: #f5b80a;
          --card: #15181d;
          --border: #22272e;
        }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body {
          font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: var(--bg);
          color: var(--fg);
          padding: 24px;
        }
        .header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
        .brand { font-weight: 600; font-size: 18px; }
        .brand .bee { color: var(--accent); margin-right: 4px; }
        .brand .repo { color: var(--muted); font-weight: 400; margin-left: 8px; }
        .header .ts { color: var(--muted); font-size: 12px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 32px; }
        .kpi { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; }
        .kpi-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
        .kpi-value { font-size: 28px; font-weight: 600; margin-top: 6px; line-height: 1.1; }
        .kpi-sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
        .graph-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
        .graph-card h2 { margin: 0 0 8px; font-size: 15px; font-weight: 500; }
        .graph-meta { color: var(--muted); font-size: 12px; margin-bottom: 12px; }
        #graph { height: 70vh; border: 1px solid var(--border); border-radius: 4px; background: #0e1116; }
        .empty { padding: 48px 16px; text-align: center; color: var(--muted); }
        .empty code { background: #1c2128; padding: 2px 6px; border-radius: 3px; color: var(--fg); font-family: ui-monospace, "SFMono-Regular", monospace; }
        .footer { color: var(--muted); font-size: 11px; margin-top: 24px; text-align: right; }
`;

/**
 * Build the complete dashboard HTML document. Pure: deterministic on
 * the input (no Date.now() reads — `data.generatedAt` is the only
 * timestamp surfaced, and the caller pre-stamps it).
 */
export function renderDashboardHtml(data: DashboardData): string {
  const title = `Hivemind Dashboard · ${data.repoProject}`;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escHtml(title)}</title>
    <style>${STYLES}</style>
  </head>
  <body>
    <div class="header">
      <div class="brand">
        <span class="bee">\u{1F41D}</span>hivemind dashboard
        <span class="repo">/ ${escHtml(data.repoProject)}</span>
      </div>
      <div class="ts">${escHtml(data.generatedAt)}</div>
    </div>
    <div class="kpi-grid">${renderKpiCards(data.kpis)}
    </div>
    ${renderGraphSection(data)}
    <div class="footer">repo_key ${escHtml(data.repoKey)}</div>
  </body>
</html>
`;
}
