/**
 * Unit tests for the dashboard HTML renderer. Pure-function tests
 * against fixtures — no IO, no mocks. Each test inspects substrings of
 * the output rather than asserting against a snapshot, so cosmetic
 * edits to the markup don't break the suite.
 */

import { describe, expect, it } from "vitest";

import type { DashboardData } from "../../src/dashboard/data.js";
import {
  escHtml,
  formatInt,
  formatTokensCompact,
  renderDashboardHtml,
  safeJsonForScript,
  transformSnapshotToVis,
} from "../../src/dashboard/render.js";

function baseData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    repoKey: "abcdef0123456789",
    repoProject: "demo-repo",
    generatedAt: "2026-05-21T00:00:00Z",
    kpis: {
      tokensSaved: 7000,
      tokensSource: "org",
      skillsCreated: 3,
      memorySearches: 42,
      sessionsCount: 5,
      userTokensSaved: 3500,
    },
    graph: {
      commitSha: "abc123def456789",
      snapshotPath: "/tmp/x/abc.json",
      nodeCount: 2,
      edgeCount: 1,
      snapshot: {
        directed: true,
        multigraph: true,
        graph: { commit_sha: "abc123def456789" },
        nodes: [
          { id: "a", label: "funcA", kind: "function", source_file: "src/a.ts", source_location: "L10" },
          { id: "b", label: "ClassB", kind: "class", source_file: "src/b.ts", source_location: "L1-50" },
        ],
        links: [
          { source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" },
        ],
      },
    },
    ...overrides,
  };
}

describe("escHtml", () => {
  it("escapes the standard set of HTML-sensitive characters", () => {
    expect(escHtml(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
  it("returns input unchanged when it contains no unsafe characters", () => {
    expect(escHtml("plain text 123")).toBe("plain text 123");
  });
});

describe("safeJsonForScript", () => {
  it("escapes `</` so a malicious '</script>' substring can't close the tag", () => {
    const out = safeJsonForScript({ msg: "</script><img src=x>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("<\\/script>");
  });
  it("escapes HTML comments to avoid script-block confusion (no literal bytes)", () => {
    const out = safeJsonForScript({ a: "<!-- evil -->" });
    expect(out).not.toContain("<!--");
    expect(out).not.toContain("-->");
  });
  it("produces JSON that the browser's JSON.parse(textContent) can read directly", () => {
    // The browser-side path is JSON.parse(scriptEl.textContent). textContent
    // returns the literal bytes of the element, so JSON.parse must accept
    // the output as-is. The earlier '<\!--' / '--\>' escapes were not
    // valid JSON; codex caught that.
    const value = {
      a: "</nope>",
      b: "<!-- comment -->",
      c: ["before -->", "<!-- between", "after"],
      d: 1,
    };
    const escaped = safeJsonForScript(value);
    const decoded = JSON.parse(escaped); // must NOT throw
    expect(decoded).toEqual(value);
  });
  it("preserves the original string values through encode+parse for `<!--` and `-->`", () => {
    const value = { weird: "x <!-- y --> z" };
    const escaped = safeJsonForScript(value);
    expect(escaped).not.toContain("<!--");
    expect(escaped).not.toContain("-->");
    expect(JSON.parse(escaped).weird).toBe("x <!-- y --> z");
  });
});

describe("formatTokensCompact", () => {
  it("returns '0' for non-positive or non-finite inputs", () => {
    expect(formatTokensCompact(0)).toBe("0");
    expect(formatTokensCompact(-100)).toBe("0");
    expect(formatTokensCompact(NaN)).toBe("0");
    expect(formatTokensCompact(Infinity)).toBe("0");
  });
  it("formats sub-1k values as rounded integers", () => {
    expect(formatTokensCompact(950)).toBe("950");
  });
  it("formats 1k-100k with one decimal place", () => {
    expect(formatTokensCompact(1234)).toBe("1.2k");
    expect(formatTokensCompact(12345)).toBe("12.3k");
  });
  it("formats 100k-1M as rounded thousands", () => {
    expect(formatTokensCompact(123_456)).toBe("123k");
  });
  it("formats 1M+ as decimal millions", () => {
    expect(formatTokensCompact(2_500_000)).toBe("2.5M");
  });
});

describe("formatInt", () => {
  it("groups with en-US thousands separators", () => {
    expect(formatInt(42_000)).toBe("42,000");
    expect(formatInt(0)).toBe("0");
  });
  it("rounds non-integers", () => {
    expect(formatInt(99.6)).toBe("100");
  });
  it("returns '0' on non-finite inputs", () => {
    expect(formatInt(NaN)).toBe("0");
  });
});

describe("transformSnapshotToVis", () => {
  it("maps graphify nodes to vis-network nodes with kind-based color and title", () => {
    const snapshot = {
      nodes: [{ id: "n1", label: "myFn", kind: "function", source_file: "src/x.ts", source_location: "L5" }],
      links: [],
    };
    const out = transformSnapshotToVis(snapshot);
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0].id).toBe("n1");
    expect(out.nodes[0].label).toBe("myFn");
    expect(out.nodes[0].group).toBe("function");
    expect(out.nodes[0].title).toContain("function");
    expect(out.nodes[0].title).toContain("src/x.ts:L5");
    expect(out.nodes[0].color).toBeDefined();
  });
  it("maps edges and surfaces relation + confidence in the title", () => {
    const snapshot = {
      nodes: [{ id: "a" }, { id: "b" }],
      links: [{ source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" }],
    };
    const out = transformSnapshotToVis(snapshot);
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0].from).toBe("a");
    expect(out.edges[0].to).toBe("b");
    expect(out.edges[0].title).toBe("calls [EXTRACTED]");
  });
  it("drops nodes without a string id and edges without both endpoints", () => {
    const snapshot = {
      nodes: [{ id: "ok" }, { label: "no-id" }, { id: 42 }],
      links: [{ source: "ok" }, { target: "ok" }, { source: "ok", target: "ok" }],
    };
    const out = transformSnapshotToVis(snapshot);
    expect(out.nodes.map(n => n.id)).toEqual(["ok"]);
    expect(out.edges).toHaveLength(1);
  });
  it("deduplicates nodes with repeated ids", () => {
    const snapshot = {
      nodes: [{ id: "a" }, { id: "a" }, { id: "b" }],
      links: [],
    };
    const out = transformSnapshotToVis(snapshot);
    expect(out.nodes.map(n => n.id)).toEqual(["a", "b"]);
  });
  it("returns empty arrays for non-object snapshots", () => {
    expect(transformSnapshotToVis(null)).toEqual({ nodes: [], edges: [] });
    expect(transformSnapshotToVis("string")).toEqual({ nodes: [], edges: [] });
    expect(transformSnapshotToVis(42)).toEqual({ nodes: [], edges: [] });
  });
  it("keeps edges whose target is not a known node (Phase 1 cross-file)", () => {
    const snapshot = {
      nodes: [{ id: "a" }],
      links: [{ source: "a", target: "external", relation: "calls" }],
    };
    const out = transformSnapshotToVis(snapshot);
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0].to).toBe("external");
  });
  it("HTML-escapes node tooltip text (vis renders title as HTML)", () => {
    // If the snapshot is built from a file path / id with HTML in it,
    // and we pass the raw string to vis as `title`, the hover tooltip
    // would render the markup. Codex review on commit 2 flagged this.
    const snapshot = {
      nodes: [{
        id: "<img src=x onerror=alert(1)>",
        label: "ok",
        kind: "function",
        source_file: "src/<bad>.ts",
        source_location: "L1",
      }],
      links: [],
    };
    const out = transformSnapshotToVis(snapshot);
    expect(out.nodes[0].title).not.toContain("<img");
    expect(out.nodes[0].title).not.toContain("<bad>");
    expect(out.nodes[0].title).toContain("&lt;bad&gt;.ts");
  });
  it("HTML-escapes edge tooltip text", () => {
    const snapshot = {
      nodes: [{ id: "<x>" }, { id: "<y>" }],
      links: [{ source: "<x>", target: "<y>" }], // no relation/confidence => fallback title path
    };
    const out = transformSnapshotToVis(snapshot);
    expect(out.edges[0].title).not.toContain("<x>");
    expect(out.edges[0].title).toContain("&lt;x&gt;");
    expect(out.edges[0].title).toContain("&lt;y&gt;");
  });
});

describe("renderDashboardHtml", () => {
  it("produces a valid HTML5 document with the project name in the title", () => {
    const html = renderDashboardHtml(baseData());
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<title>Hivemind Dashboard · demo-repo</title>");
    expect(html).toContain(`repo_key abcdef0123456789`);
  });

  it("renders KPI cards with formatted values", () => {
    const html = renderDashboardHtml(baseData());
    expect(html).toContain("Tokens saved");
    expect(html).toContain("~7.0k"); // 7000 → 7.0k
    expect(html).toContain("Skills created");
    expect(html).toContain(">3<");
    expect(html).toContain("Org-wide");
  });

  it("shows em-dash and 'Run a session' sub when source=none", () => {
    const html = renderDashboardHtml(baseData({
      kpis: {
        tokensSaved: null, tokensSource: "none",
        skillsCreated: 0, memorySearches: 0,
        sessionsCount: null, userTokensSaved: null,
      },
    }));
    expect(html).toContain("—");
    expect(html).toContain("Run a session to start tracking");
  });

  it("shows 'Local (this machine)' sub when source=local (no creds, local-only KPIs)", () => {
    // CodeRabbit nitpick on PR #194: source=org and source=none were
    // covered; the local-fallback branch wasn't asserted directly.
    const html = renderDashboardHtml(baseData({
      kpis: {
        tokensSaved: 5000,
        tokensSource: "local",
        skillsCreated: 2,
        memorySearches: 10,
        sessionsCount: 3,
        userTokensSaved: 5000,
      },
    }));
    expect(html).toContain("~5.0k");
    expect(html).toContain("Local (this machine)");
    // Other cards should also reflect the local source label.
    expect(html).toContain("Local");
    // And the "Org-wide" copy must NOT appear in local mode.
    expect(html).not.toContain("Org-wide");
  });

  it("renders graph empty-state when data.graph is null", () => {
    const html = renderDashboardHtml(baseData({ graph: null }));
    expect(html).toContain("No graph snapshot yet for this repo.");
    expect(html).toContain("<code>hivemind graph build</code>");
    expect(html).not.toContain("hm-graph-data");
    expect(html).not.toContain("vis-network");
  });

  it("embeds the graph data, vis-network script tag, and an initializer when graph is present", () => {
    const html = renderDashboardHtml(baseData());
    expect(html).toContain(`id="hm-graph-data"`);
    expect(html).toContain("unpkg.com/vis-network");
    expect(html).toContain("new vis.Network(container");
    expect(html).toContain("commit abc123def456");
    expect(html).toContain("2 nodes · 1 edges");
  });

  it("escapes a malicious project name so it cannot inject markup", () => {
    const html = renderDashboardHtml(baseData({ repoProject: `<script>alert(1)</script>` }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes a malicious snapshot value so it cannot close the JSON script tag", () => {
    const html = renderDashboardHtml(baseData({
      graph: {
        commitSha: null, snapshotPath: "/x", nodeCount: 1, edgeCount: 0,
        snapshot: {
          nodes: [{ id: "n", label: "</script><img src=x onerror=alert(1)>" }],
          links: [],
        },
      },
    }));
    // The literal sequence "</script>" must not appear inside the
    // JSON PAYLOAD (between the opening application/json tag and its
    // first closing tag). If escaping failed, the payload would
    // contain the attacker's </script> AND get truncated at it.
    const openMarker = `id="hm-graph-data">`;
    const payloadStart = html.indexOf(openMarker) + openMarker.length;
    const payloadEnd = html.indexOf("</script>", payloadStart);
    const payload = html.slice(payloadStart, payloadEnd);
    expect(payload).not.toContain("</script>");
    expect(payload).toContain("<\\/script>");
    // And it should still parse as JSON (rough check: starts with {).
    expect(payload.trimStart().startsWith("{")).toBe(true);
  });

  it("renders the loose-dir commit label when commitSha is null", () => {
    const html = renderDashboardHtml(baseData({
      graph: {
        commitSha: null, snapshotPath: "/x", nodeCount: 0, edgeCount: 0,
        snapshot: { nodes: [], links: [] },
      },
    }));
    expect(html).toContain("no commit (loose dir)");
  });
});
