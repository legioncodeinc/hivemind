/**
 * Defensive parser for the `kpis` JSONB column on `hivemind_tasks`.
 *
 * T3 ships tasks without LLM-generated KPIs — every freshly-INSERTed row
 * carries `kpis = '[]'`. T4 will plug an LLM call into `insertTask` that
 * fills this column with agent-generated KPI objects. The validator lives
 * here in T3 so the read path (read.ts → renderer in T6) treats the JSONB
 * column as data-it-cannot-trust from the start — anything that doesn't
 * match the canonical shape collapses to `[]` rather than crashing the
 * SessionStart inject.
 *
 * Canonical shape (per the plan doc's "KPI shape" block):
 *
 *   [
 *     {
 *       "kpi_id":       string (required, stable per kpi within task),
 *       "name":         string (required, human-readable),
 *       "target":       number (required, finite),
 *       "current":      number (optional snapshot; canonical source = events),
 *       "unit":         string (required, e.g. "count"),
 *       "generated_by": string (required, model name or "manual"),
 *       "generated_at": string (required, ISO 8601)
 *     },
 *     ...
 *   ]
 *
 * Anything else is treated as untrusted. The validator never throws —
 * Deeplake row reads should not be able to take down a SessionStart hook.
 */

export interface Kpi {
  kpi_id: string;
  name: string;
  target: number;
  current?: number;
  unit: string;
  generated_by: string;
  generated_at: string;
}

/**
 * Coerce a value pulled from the kpis JSONB column into a `Kpi[]`.
 *
 * Accepts:
 *   - `null` / `undefined` / empty string  → `[]`
 *   - a JSON string holding an array       → parsed + per-item validated
 *   - an already-decoded array             → per-item validated
 *
 * Returns `[]` on any parse failure or shape mismatch. Use the typed
 * return value as the canonical KPI list; callers should not need to
 * defensively check shape again.
 */
export function parseKpis(raw: unknown): Kpi[] {
  if (raw == null || raw === "") return [];

  let arr: unknown;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  } else {
    arr = raw;
  }

  if (!Array.isArray(arr)) return [];
  const out: Kpi[] = [];
  for (const item of arr) {
    const kpi = validateOne(item);
    if (kpi) out.push(kpi);
  }
  return out;
}

/**
 * Round-trip a `Kpi[]` to the canonical JSONB string. Mirror of
 * `parseKpis` for the write path. Drops any malformed entries the same
 * way the parser would — defensive symmetry so we never store data
 * we'd subsequently silently drop on read.
 */
export function stringifyKpis(kpis: Kpi[]): string {
  const validated = kpis
    .map(validateOne)
    .filter((k): k is Kpi => k !== null);
  return JSON.stringify(validated);
}

function validateOne(item: unknown): Kpi | null {
  if (!isObject(item)) return null;
  // Codex legacy audit pass 3 P1.B: KPI `name` and `unit` are
  // rendered verbatim into the SessionStart prompt block. A
  // newline-bearing value would let any caller (LLM gen, manual
  // input, malicious row) inject a forged section header into every
  // agent's context. Reject any newlines at the validator level so
  // bad rows never enter the table; the renderer's sanitize-on-read
  // pass handles already-persisted rows from a vulnerable client.
  // kpi_id / generated_by / generated_at are control values not
  // rendered to the agent, but rejecting newlines there too keeps
  // the contract uniform and protects future renderers.
  const kpi_id = safeStr(item.kpi_id);
  const name = safeStr(item.name);
  const target = num(item.target);
  const unit = safeStr(item.unit);
  const generated_by = safeStr(item.generated_by);
  const generated_at = safeStr(item.generated_at);
  if (
    kpi_id === null ||
    name === null ||
    target === null ||
    unit === null ||
    generated_by === null ||
    generated_at === null
  ) {
    return null;
  }
  // Target must be a POSITIVE INTEGER. The spec + prompt contract say
  // so; the renderer would otherwise show "PRs merged: 0/0" or
  // "/-1 count" which are confusing or impossible goals. Codex legacy
  // audit caught the prior over-permissive `num()` check that let
  // 0, -1, and 1.5 through. `current` stays loose (can be any number).
  if (!Number.isInteger(target) || target <= 0) {
    return null;
  }
  const out: Kpi = {
    kpi_id,
    name,
    target,
    unit,
    generated_by,
    generated_at,
  };
  const current = num(item.current);
  if (current !== null) out.current = current;
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0) return null;
  return v;
}

/**
 * Like `str` but additionally rejects any embedded line terminator
 * (CR, LF, CRLF, U+2028, U+2029, U+0085). KPI metadata gets inlined
 * into the SessionStart prompt block, and a line-bearing value is a
 * prompt-injection vector. See src/hooks/shared/context-renderer.ts
 * for the render-side counterpart that handles already-persisted
 * rows from older clients. Codex pass 4 surfaced that the original
 * CR/LF-only check let Unicode line separators through.
 */
function safeStr(v: unknown): string | null {
  const s = str(v);
  if (s === null) return null;
  if (/[\r\n\u2028\u2029\u0085]/.test(s)) return null;
  return s;
}

function num(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}
