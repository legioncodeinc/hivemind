/**
 * Unit tests for the dashboard HTTP server. Each test binds to an
 * ephemeral port (port: 0) so CI doesn't fight over fixed ports and
 * tests can run in parallel.
 */

import { afterEach, describe, expect, it } from "vitest";

import { serveDashboardHtml, type ServeHandle } from "../../src/dashboard/serve.js";

async function fetchText(url: string): Promise<{ status: number; body: string; contentType: string | null }> {
  const r = await fetch(url);
  return { status: r.status, body: await r.text(), contentType: r.headers.get("content-type") };
}

describe("serveDashboardHtml", () => {
  let handles: ServeHandle[] = [];

  afterEach(async () => {
    await Promise.all(handles.map(h => h.close().catch(() => { /* already closed */ })));
    handles = [];
  });

  it("binds to an ephemeral port and serves the HTML at GET /", async () => {
    const h = await serveDashboardHtml({ html: "<!doctype html><h1>hello</h1>", port: 0 });
    handles.push(h);
    expect(h.port).toBeGreaterThan(0);
    expect(h.host).toBe("127.0.0.1");
    const r = await fetchText(`http://127.0.0.1:${h.port}/`);
    expect(r.status).toBe(200);
    expect(r.body).toContain("<h1>hello</h1>");
    expect(r.contentType).toContain("text/html");
  });

  it("treats /index.html and /?refresh=1 as the dashboard root", async () => {
    const h = await serveDashboardHtml({ html: "<!doctype html><b>root</b>", port: 0 });
    handles.push(h);
    const r1 = await fetchText(`http://127.0.0.1:${h.port}/index.html`);
    const r2 = await fetchText(`http://127.0.0.1:${h.port}/?refresh=1`);
    expect(r1.status).toBe(200);
    expect(r1.body).toContain("<b>root</b>");
    expect(r2.status).toBe(200);
    expect(r2.body).toContain("<b>root</b>");
  });

  it("returns 204 on GET /health for readiness probes", async () => {
    const h = await serveDashboardHtml({ html: "x", port: 0 });
    handles.push(h);
    const r = await fetch(`http://127.0.0.1:${h.port}/health`);
    expect(r.status).toBe(204);
  });

  it("returns 404 for unknown paths with a hint to /", async () => {
    const h = await serveDashboardHtml({ html: "x", port: 0 });
    handles.push(h);
    const r = await fetchText(`http://127.0.0.1:${h.port}/whatever`);
    expect(r.status).toBe(404);
    expect(r.body).toMatch(/lives at \//);
  });

  it("rejects non-GET methods (POST)", async () => {
    const h = await serveDashboardHtml({ html: "x", port: 0 });
    handles.push(h);
    const r = await fetch(`http://127.0.0.1:${h.port}/`, { method: "POST" });
    expect(r.status).toBe(404);
  });

  it("falls back to an ephemeral port when the preferred port is in use", async () => {
    // Grab a port first, then ask for the SAME port. The fallback
    // should pick a different ephemeral port and still bind.
    const first = await serveDashboardHtml({ html: "first", port: 0 });
    handles.push(first);
    const second = await serveDashboardHtml({ html: "second", port: first.port });
    handles.push(second);
    expect(second.port).not.toBe(first.port);
    expect(second.port).toBeGreaterThan(0);
    const r = await fetchText(`http://127.0.0.1:${second.port}/`);
    expect(r.body).toBe("second");
  });

  it("close() resolves and `stopped` resolves once the server shuts down", async () => {
    const h = await serveDashboardHtml({ html: "x", port: 0 });
    await h.close();
    await h.stopped; // must NOT hang
    // A second close() is a no-op-equivalent — the underlying server.close()
    // returns an error on a non-listening server; we swallow it in afterEach.
  });

  it("defaults the bind address to 127.0.0.1 (loopback only — no LAN exposure)", async () => {
    const h = await serveDashboardHtml({ html: "x", port: 0 });
    handles.push(h);
    expect(h.host).toBe("127.0.0.1");
    // sanity: try fetching from the loopback name — should resolve
    const r = await fetch(`http://127.0.0.1:${h.port}/`);
    expect(r.status).toBe(200);
  });
});
