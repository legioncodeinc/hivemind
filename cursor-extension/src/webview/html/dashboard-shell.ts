import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

const D3_CDN = "https://d3js.org/d3.v7.min.js";

function getNonce(): string {
  return randomBytes(16).toString("hex");
}

function cspSource(webview: vscode.Webview): string {
  return webview.cspSource;
}

/** Self-contained dashboard HTML for panel or sidebar webview. */
export function getDashboardHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const csp = cspSource(webview);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'unsafe-inline'; script-src 'nonce-${nonce}' ${csp} https://d3js.org; img-src ${csp} data:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hivemind Dashboard</title>
  <style>
    :root {
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; min-height: 100vh; }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }
    header h1 { margin: 0; font-size: 1.1em; font-weight: 600; }
    .tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
    .tab {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid transparent; border-radius: 4px; padding: 4px 10px; cursor: pointer;
    }
    .tab.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    main { padding: 12px; }
    .pane { display: none; }
    .pane.active { display: block; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px; padding: 10px;
    }
    .card .label { font-size: 0.85em; opacity: 0.85; }
    .card .value { font-size: 1.35em; font-weight: 600; margin-top: 4px; }
    .meta { font-size: 0.85em; opacity: 0.8; margin-top: 8px; }
    button, .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; margin: 4px 4px 4px 0;
    }
    button:disabled { opacity: 0.5; cursor: default; }
    input[type="text"], textarea {
      width: 100%; background: var(--vscode-input-background);
      color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border);
      border-radius: 4px; padding: 6px 8px;
    }
    ul.list { list-style: none; padding: 0; margin: 0; }
    ul.list li {
      padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); cursor: pointer;
    }
    ul.list li:hover { background: var(--vscode-list-hoverBackground); }
    #graph-canvas { width: 100%; height: 420px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editor-background); }
    .empty { opacity: 0.75; font-style: italic; padding: 12px 0; }
    .error { color: var(--vscode-errorForeground); }
    .caveat { font-size: 0.85em; opacity: 0.85; margin: 8px 0; padding: 8px; border-left: 3px solid var(--vscode-textLink-foreground); }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    pre.summary { white-space: pre-wrap; background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; max-height: 320px; overflow: auto; }
    .skill-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); }
    .tag { font-size: 0.75em; padding: 2px 6px; border-radius: 3px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  </style>
</head>
<body>
  <header>
    <h1>Hivemind</h1>
    <button id="btn-refresh" title="Refresh dashboard">Refresh</button>
  </header>
  <nav class="tabs" role="tablist">
    <button class="tab active" data-pane="kpi" role="tab">KPIs</button>
    <button class="tab" data-pane="settings" role="tab">Settings</button>
    <button class="tab" data-pane="sessions" role="tab">Sessions</button>
    <button class="tab" data-pane="graph" role="tab">Graph</button>
    <button class="tab" data-pane="rules" role="tab">Rules</button>
    <button class="tab" data-pane="skills" role="tab">Skills</button>
  </nav>
  <main>
    <section id="pane-kpi" class="pane active" role="tabpanel">
      <div class="cards" id="kpi-cards"></div>
      <p class="meta" id="kpi-meta"></p>
    </section>
    <section id="pane-settings" class="pane" role="tabpanel">
      <h2>Org &amp; health</h2>
      <p id="settings-auth"></p>
      <p id="settings-health"></p>
      <div class="row">
        <input type="text" id="org-switch-input" placeholder="Org name or ID to switch to" style="flex:1" />
        <button id="btn-org-switch">Switch org</button>
      </div>
      <p class="meta" id="org-switch-result"></p>
      <h2>Embeddings</h2>
      <div class="row">
        <span id="embeddings-status">Loading…</span>
        <button id="btn-embeddings-toggle">Toggle</button>
      </div>
      <h2>Codebase graph</h2>
      <button id="btn-graph-build">Build graph (hivemind graph build)</button>
      <p class="meta" id="graph-build-result"></p>
      <h2>Skill sync</h2>
      <button id="btn-sync-skills">Sync skills to Cursor</button>
      <p class="meta" id="skill-sync-result"></p>
    </section>
    <section id="pane-sessions" class="pane" role="tabpanel">
      <ul class="list" id="session-list"></ul>
      <div id="session-detail" hidden>
        <h3>Session summary</h3>
        <pre class="summary" id="session-summary-text"></pre>
        <h4>Next Steps</h4>
        <div id="next-steps-list"></div>
        <p class="meta" id="next-steps-result"></p>
      </div>
    </section>
    <section id="pane-graph" class="pane" role="tabpanel">
      <div class="row">
        <button id="btn-impact">Show change impact</button>
        <button id="btn-impact-clear">Clear impact</button>
      </div>
      <p class="caveat" id="impact-caveat" hidden></p>
      <svg id="graph-canvas"></svg>
      <p class="meta" id="graph-meta"></p>
    </section>
    <section id="pane-rules" class="pane" role="tabpanel">
      <div class="row">
        <input type="text" id="rule-text" placeholder="New team rule text" />
        <button id="btn-rule-add">Add rule</button>
      </div>
      <ul class="list" id="rules-list"></ul>
    </section>
    <section id="pane-skills" class="pane" role="tabpanel">
      <p class="meta">Local skills available under Claude/Cursor skill directories. Use "Promote to team" to share a skill so teammates pull it on their next session.</p>
      <div id="skills-list"></div>
      <p class="meta" id="skill-promote-result"></p>
    </section>
  </main>
  <script nonce="${nonce}" src="${D3_CDN}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = { pane: "kpi", graph: null, impact: null, highlight: [] };

    function post(type, payload) {
      vscode.postMessage(Object.assign({ type }, payload || {}));
    }

    function esc(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    }

    function setPane(name) {
      state.pane = name;
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.pane === name));
      document.querySelectorAll(".pane").forEach(p => p.classList.toggle("active", p.id === "pane-" + name));
      post("setPane", { pane: name });
    }

    document.querySelectorAll(".tab").forEach(btn => {
      btn.addEventListener("click", () => setPane(btn.dataset.pane));
    });
    document.getElementById("btn-refresh").addEventListener("click", () => post("refresh"));
    document.getElementById("btn-embeddings-toggle").addEventListener("click", () => post("toggleEmbeddings"));
    document.getElementById("btn-graph-build").addEventListener("click", () => post("buildGraph"));
    document.getElementById("btn-sync-skills").addEventListener("click", () => post("syncSkills"));
    document.getElementById("btn-rule-add").addEventListener("click", () => {
      const text = document.getElementById("rule-text").value.trim();
      if (text) post("rulesAdd", { text });
    });
    document.getElementById("btn-org-switch").addEventListener("click", () => {
      const orgName = document.getElementById("org-switch-input").value.trim();
      if (orgName) post("switchOrg", { orgName });
    });
    document.getElementById("btn-impact").addEventListener("click", () => post("computeImpact"));
    document.getElementById("btn-impact-clear").addEventListener("click", () => {
      state.impact = null;
      document.getElementById("impact-caveat").hidden = true;
      renderGraph();
    });

    function formatTokens(n) {
      if (n == null) return "—";
      if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
      return Math.round(n).toString();
    }

    function formatAge(isoTs) {
      if (!isoTs) return "";
      const diffMs = Date.now() - new Date(isoTs).getTime();
      const mins = Math.round(diffMs / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return mins + " min ago";
      return Math.round(mins / 60) + " h ago";
    }

    function renderKpis(data) {
      const k = data.kpis || {};
      const sourceLabel = { org: "org-wide", local: "this machine", none: "no data yet" }[k.tokensSource] || k.tokensSource;
      const freshness = k.fetchedAt ? " · as of " + formatAge(k.fetchedAt) : "";
      const sourceNote = k.tokensSource === "none"
        ? "No sessions captured yet — token savings accumulate only when memory is recalled during a session."
        : k.tokensSource === "local"
        ? "Showing local usage data. Token savings accumulate on active memory recalls."
        : "";
      document.getElementById("kpi-cards").innerHTML = [
        { label: "Tokens saved", value: formatTokens(k.tokensSaved) },
        { label: "Memory searches", value: k.memorySearches ?? 0 },
        { label: "Skills created", value: k.skillsCreated ?? 0 },
        { label: "Sessions", value: k.sessionsCount == null ? "—" : k.sessionsCount },
      ].map(c => '<div class="card"><div class="label">' + esc(c.label) + '</div><div class="value">' + esc(c.value) + '</div></div>').join("");
      let meta = "Token source: " + sourceLabel + freshness + (data.repoProject ? " · " + data.repoProject : "");
      if (sourceNote) meta += "\\n" + sourceNote;
      document.getElementById("kpi-meta").textContent = meta;
    }

    function renderSettings(payload) {
      document.getElementById("settings-auth").textContent = payload.authLabel || "";
      document.getElementById("settings-health").textContent = payload.healthSummary || "";
      document.getElementById("embeddings-status").textContent = payload.embeddingsStatus || "Unknown";
      document.getElementById("skill-sync-result").textContent = payload.skillSyncSummary || "";
      document.getElementById("graph-build-result").textContent = payload.graphBuildMessage || "";
    }

    function renderSessions(sessions) {
      const ul = document.getElementById("session-list");
      if (!sessions || sessions.length === 0) {
        ul.innerHTML = '<li class="empty">No recent sessions recorded.</li>';
        return;
      }
      ul.innerHTML = sessions.map(s =>
        '<li data-session="' + esc(s.sessionId) + '"><strong>' + esc(s.sessionId.slice(0, 8)) + '…</strong> · ' +
        esc(s.endedAt) + ' · searches: ' + esc(s.memorySearchCount) + '</li>'
      ).join("");
      ul.querySelectorAll("li[data-session]").forEach(li => {
        li.addEventListener("click", () => post("openSession", { sessionId: li.dataset.session }));
      });
    }

    function renderRules(rules) {
      const ul = document.getElementById("rules-list");
      if (!rules || rules.length === 0) {
        ul.innerHTML = '<li class="empty">No active rules.</li>';
        return;
      }
      ul.innerHTML = rules.map(r =>
        '<li data-id="' + esc(r.id) + '">' +
        '<span class="tag">' + esc(r.status) + '</span> ' +
        '<span class="rule-text">' + esc(r.text) + '</span> ' +
        '<button class="btn edit-btn" data-id="' + esc(r.id) + '" data-text="' + esc(r.text) + '">Edit</button>' +
        '<button class="btn done-btn" data-id="' + esc(r.id) + '">Complete</button>' +
        '</li>'
      ).join("");
      ul.querySelectorAll(".done-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          post("rulesDone", { ruleId: btn.dataset.id });
        });
      });
      ul.querySelectorAll(".edit-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const li = btn.closest("li");
          if (li.querySelector(".edit-form")) return;
          const form = document.createElement("div");
          form.className = "edit-form row";
          form.innerHTML = '<input type="text" class="edit-input" value="' + esc(btn.dataset.text) + '" style="flex:1" />' +
            '<button class="btn save-btn">Save</button><button class="btn cancel-btn">Cancel</button>';
          li.appendChild(form);
          form.querySelector(".save-btn").addEventListener("click", () => {
            const newText = form.querySelector(".edit-input").value.trim();
            if (newText) post("rulesEdit", { ruleId: btn.dataset.id, text: newText });
            form.remove();
          });
          form.querySelector(".cancel-btn").addEventListener("click", () => form.remove());
        });
      });
    }

    function renderSkills(skills) {
      const root = document.getElementById("skills-list");
      if (!skills || skills.length === 0) {
        root.innerHTML = '<p class="empty">No local skills found.</p>';
        return;
      }
      root.innerHTML = skills.map(s =>
        '<div class="skill-row" data-dir="' + esc(s.dirName || s.label) + '">' +
        '<span>' + esc(s.label) + ' <span class="tag">' + esc(s.scope) + '</span></span>' +
        '<button class="btn promote-btn" data-dir="' + esc(s.dirName || s.label) + '">Promote to team</button>' +
        '</div>'
      ).join("");
      root.querySelectorAll(".promote-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          btn.disabled = true;
          btn.textContent = "Promoting…";
          post("promoteSkill", { dirName: btn.dataset.dir });
        });
      });
    }

  const GRAPH_NODE_CAP = 350;
  let simulation = null;
  function renderGraph() {
    const svg = d3.select("#graph-canvas");
    svg.selectAll("*").remove();
    const width = document.getElementById("graph-canvas").clientWidth || 600;
    const height = 420;
    svg.attr("viewBox", [0, 0, width, height]);

    const snap = state.graph;
    if (!snap || !Array.isArray(snap.nodes) || snap.nodes.length === 0) {
      document.getElementById("graph-meta").textContent = "No graph snapshot yet. Run hivemind graph build.";
      return;
    }

    const totalNodes = snap.nodes.length;
    let sourceNodes = snap.nodes;
    let lodNote = "";
    if (totalNodes > GRAPH_NODE_CAP) {
      // Level-of-detail: show highest fan_in nodes first so hubs are always visible.
      sourceNodes = snap.nodes
        .slice()
        .sort((a, b) => (b.fan_in || 0) - (a.fan_in || 0) || (b.fan_out || 0) - (a.fan_out || 0))
        .slice(0, GRAPH_NODE_CAP);
      lodNote = " (showing top " + GRAPH_NODE_CAP + " of " + totalNodes + " nodes by fan-in; large graph — level-of-detail applied)";
    }

    const nodes = sourceNodes.map(n => Object.assign({}, n));
    const links = (snap.links || []).map(l => ({ source: l.source, target: l.target, relation: l.relation }));
    const idSet = new Set(nodes.map(n => n.id));
    const validLinks = links.filter(l => idSet.has(l.source) && idSet.has(l.target));

    const impactOrigins = new Set((state.impact && state.impact.originNodeIds) || []);
    const impactDepth = new Map((state.impact && state.impact.dependents || []).map(d => [d.id, d.depth]));
    const highlight = new Set(state.highlight || []);

    const color = d => {
      if (impactOrigins.has(d.id)) return "#f7768e";
      if (impactDepth.has(d.id)) return "#e0af68";
      if (highlight.has(d.id)) return "#9ece6a";
      return "#7aa2f7";
    };

    simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(validLinks).id(d => d.id).distance(40))
      .force("charge", d3.forceManyBody().strength(-80))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg.append("g").attr("stroke", "#565f89").attr("stroke-opacity", 0.5)
      .selectAll("line").data(validLinks).join("line").attr("stroke-width", 1);

    const node = svg.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("r", 5).attr("fill", d => color(d))
      .call(d3.drag()
        .on("start", (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }))
      .on("click", (_, d) => post("graphNodeClick", { nodeId: d.id }));

    node.append("title").text(d => d.label + "\\n" + d.source_file + ":" + d.source_location);

    simulation.on("tick", () => {
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("cx", d => d.x).attr("cy", d => d.y);
    });

    document.getElementById("graph-meta").textContent =
      nodes.length + " nodes · " + validLinks.length + " edges" + lodNote;
  }

    function renderNextSteps(steps) {
      const container = document.getElementById("next-steps-list");
      if (!container) return;
      if (!steps || steps.length === 0) {
        container.innerHTML = '<p class="empty">No Next Steps found in this summary.</p>';
        return;
      }
      container.innerHTML = steps.map((s, i) =>
        '<div class="row" style="margin:4px 0">' +
        '<span style="flex:1">' + esc(s) + '</span>' +
        '<button class="btn step-goal-btn" data-step="' + esc(s) + '">Create goal</button>' +
        '</div>'
      ).join("");
      container.querySelectorAll(".step-goal-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          btn.disabled = true;
          post("nextStepsPromote", { text: btn.dataset.step });
        });
      });
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case "dashboardData":
          renderKpis(msg.data);
          state.graph = msg.data.graph && msg.data.graph.snapshot;
          renderGraph();
          break;
        case "settings":
          renderSettings(msg);
          break;
        case "sessions":
          renderSessions(msg.sessions);
          break;
        case "sessionSummary":
          document.getElementById("session-detail").hidden = false;
          document.getElementById("session-summary-text").textContent = msg.text || "(no summary on disk)";
          renderNextSteps(msg.nextSteps || []);
          break;
        case "rules":
          renderRules(msg.rules);
          break;
        case "skills":
          renderSkills(msg.skills);
          break;
        case "impact":
          state.impact = msg.impact;
          const caveat = document.getElementById("impact-caveat");
          caveat.hidden = !msg.impact;
          caveat.textContent = msg.impact ? msg.impact.caveat : "";
          renderGraph();
          break;
        case "graphHighlight":
          state.highlight = msg.nodeIds || [];
          renderGraph();
          break;
        case "error":
          console.error(msg.message);
          break;
        case "actionResult":
          if (msg.target === "graphBuild") {
            document.getElementById("graph-build-result").textContent = msg.message || "";
          }
          if (msg.target === "skillSync") {
            document.getElementById("skill-sync-result").textContent = msg.message || "";
          }
          if (msg.target === "rules") post("rulesList");
          if (msg.target === "skillPromote") {
            const el = document.getElementById("skill-promote-result");
            if (el) el.textContent = msg.message || "";
            document.querySelectorAll(".promote-btn").forEach(b => { b.disabled = false; b.textContent = "Promote to team"; });
          }
          if (msg.target === "nextStepsGoal") {
            const el = document.getElementById("next-steps-result");
            if (el) el.textContent = msg.message || "";
          }
          if (msg.target === "orgSwitch") {
            const el = document.getElementById("org-switch-result");
            if (el) el.textContent = msg.message || "";
          }
          break;
      }
    });

    post("ready");
  </script>
</body>
</html>`;
}
