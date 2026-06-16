# HTTP/REST Fundamentals Worker-Bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `http-rest-fundamentals-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/http-rest-fundamentals-worker-bee.md`](../../agents/http-rest-fundamentals-worker-bee.md)
**Stinger:** [`.cursor/skills/http-rest-fundamentals-stinger/`](../../skills/http-rest-fundamentals-stinger/)
**Trigger policy:** proactive

---

## Domain

`http-rest-fundamentals-worker-bee` owns the HTTP protocol surface and REST architectural-style compliance for any stack. It covers HTTP methods and their RFC-defined safety and idempotency contracts, status-code semantics (including the "200 with error body" anti-pattern), request/response headers (caching, content negotiation, security-adjacent), CORS preflight mechanics and the wildcard-with-credentials footgun, conditional requests (ETag, If-None-Match, If-Match), range requests, HTTP/2 multiplexing, HTTP/3 QUIC transport, and the architectural constraints that distinguish REST from RPC-over-HTTP. All rulings are grounded in RFC citations (primarily RFC 9110, 9113, 9114, 9000, WHATWG Fetch spec, and RFC 9457).

## Trigger phrases

Route to `http-rest-fundamentals-worker-bee` when the user says any of:

- "Is this status code correct?" / "Should this be a 200 or a 201?"
- "Why is CORS failing?" / "explain CORS preflight" / "CORS blocked in browser"
- "PUT vs PATCH" / "which HTTP method should I use?"
- "Is this API REST?" / "audit this OpenAPI spec" / "review this API design"
- "HTTP/3 ready?" / "do we support HTTP/3?" / "QUIC setup"
- "ETag not working" / "conditional request" / "If-None-Match"
- "Range request" / "partial content download"
- "Cache-Control for this endpoint" / "why is this being cached?" / "Vary header"
- "Content negotiation" / "Accept header" / "406 error"
- "400 vs 422" / "401 vs 403"

Or when the request implicitly involves reviewing HTTP semantics in route handlers, OpenAPI specs, or HTTP traces.

## Do NOT route when

- The concern is TLS, cipher suites, certificate validity, or mTLS -- route to `devops-worker-bee`.
- The concern is authentication token semantics, JWT validation, OAuth flows, or session management -- route to `auth-worker-bee`.
- The concern is `Authorization` header internals (bearer token format, scope validation) -- route to `auth-worker-bee`; this Bee handles the HTTP-layer 401/403 distinction only.
- The concern is SEO-relevant HTTP headers (X-Robots-Tag, canonical link, hreflang) -- route to `seo-aeo-worker-bee`.
- The concern is OWASP-level security header enforcement (CSP, X-Frame-Options, HSTS policy decisions) -- route to `security-worker-bee`; this Bee surfaces the HTTP semantics and hands off.
- The concern is infrastructure-level HTTP/2 or HTTP/3 enablement (load balancer config, TLS termination) -- route to `devops-worker-bee`.

If a request straddles two domains (e.g., HTTP 401 semantics + JWT validation), route the HTTP-layer portion to `http-rest-fundamentals-worker-bee` and the auth-token portion to `auth-worker-bee`.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- A code diff, route handler file, OpenAPI spec, Postman collection, or HTTP trace showing the HTTP-layer decisions under review.
- Optionally: the framework stack (Next.js, Express, FastAPI, Django, etc.) for context.
- Optionally: a specific concern ("why is Chrome sending a preflight?", "is this status code right?") -- if absent, the Bee performs a general audit.

If no code or spec is provided and the request is general ("explain CORS"), the Bee can answer educationally using `guides/04-cors.md`.

## Outputs the Bee produces

- **Primary deliverable:** Markdown findings report following `templates/findings-report.md`, with severity-tagged findings (Critical / High / Medium / Informational), RFC citations per finding, and concrete remediation steps.
- **Location:** Written to `library/qa/<branch>-http-audit.md` or returned inline when no library path is available.
- **Secondary:** Explicit handoff list to `security-worker-bee` (OWASP-level findings) and `auth-worker-bee` (auth-header semantics).

## Multi-Bee sequences this Bee participates in

- **Plan execution loop** -- `http-rest-fundamentals-worker-bee` may run as a domain-specific implementation Bee before `security-worker-bee` (OWASP audit) and `quality-worker-bee` (plan-vs-implementation verification).
- **API design review sequence** -- `http-rest-fundamentals-worker-bee` reviews HTTP semantics; `security-worker-bee` audits security header enforcement; `quality-worker-bee` verifies the final API against the original spec or PRD.

## Critical directives the orchestrator should respect

- Cite the RFC section for every ruling; "the RFC says so" is not auditable.
- Flag CORS wildcard-with-credentials as Critical (not Informational); it is a security boundary.
- Do not audit TLS, auth tokens, or OWASP-level concerns; hand off explicitly.
- Always read `guides/00-principles.md` before making any ruling.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
