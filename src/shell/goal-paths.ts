/**
 * Path classifier + decompose/compose helpers for goal and KPI paths
 * inside the Deeplake VFS.
 *
 * The agent operates on a normal-looking filesystem under the memory
 * mount; the VFS in deeplake-fs.ts uses these helpers to detect goal
 * and KPI paths and dispatch reads/writes to the dedicated
 * hivemind_goals / hivemind_kpis tables instead of the generic memory
 * table. Path encoding is the source of truth for owner / status /
 * goal_id / kpi_id; the row `content` column stores only the
 * descriptive markdown body.
 *
 * Path conventions (always absolute, always start with the memory
 * mount; the mount prefix itself is stripped before classification):
 *
 *   /memory/goal/<owner>/<status>/<goal_id>.md
 *   /memory/kpi/<goal_id>/<kpi_id>.md
 *
 * status ∈ {opened, in_progress, closed}. owner is the user_email or
 * userName the agent reports. goal_id and kpi_id are stable UUID-ish
 * slugs the agent generates at create time.
 *
 * Anything that does not match these prefixes is classified as
 * "memory" and handled by the existing VFS code path. Malformed
 * goal/kpi paths (wrong number of segments, missing .md extension,
 * unknown status value) are also "memory" — the caller can decide to
 * reject them at the write boundary if desired.
 */

const VALID_STATUS = new Set(["opened", "in_progress", "closed"]);

/** Classification result for a VFS path. */
export type PathKind = "goal" | "kpi" | "memory";

export interface GoalPathParts {
  owner: string;
  status: "opened" | "in_progress" | "closed";
  goal_id: string;
}

export interface KpiPathParts {
  goal_id: string;
  kpi_id: string;
}

/**
 * Strip any leading mount prefix and split the remainder into path
 * segments. Returns `null` for empty paths.
 *
 * The deeplake-shell mount is configurable: in production the
 * default is `/` and goal paths arrive as `/goal/...`, while some
 * test configurations use `/memory` mount and paths arrive as
 * `/memory/goal/...`. Accept either form so the classifier is
 * mount-agnostic.
 */
function segmentsUnderMemory(p: string): string[] | null {
  let s = p.replace(/^\/+/, "").replace(/\/+$/, "");
  if (s.length === 0) return null;
  // Optional "memory/" prefix — strip when present so the rest of
  // the helper treats both mounts uniformly.
  if (s === "memory") return null;
  if (s.startsWith("memory/")) s = s.slice("memory/".length);
  if (s.length === 0) return null;
  return s.split("/");
}

/**
 * Classify a VFS path into "goal", "kpi", or "memory". Performs the
 * minimum validation needed to dispatch — full validation (status
 * enum, segment count, .md extension) happens via decompose helpers.
 */
export function classifyPath(p: string): PathKind {
  const segs = segmentsUnderMemory(p);
  if (!segs) return "memory";
  if (segs[0] === "goal") {
    // /memory/goal/<owner>/<status>/<goal_id>.md → 4 segs after stripping "memory/"
    if (segs.length === 4 && segs[3].endsWith(".md") && VALID_STATUS.has(segs[2])) {
      return "goal";
    }
    return "memory";
  }
  if (segs[0] === "kpi") {
    // /memory/kpi/<goal_id>/<kpi_id>.md → 3 segs
    if (segs.length === 3 && segs[2].endsWith(".md")) {
      return "kpi";
    }
    return "memory";
  }
  return "memory";
}

/**
 * Decompose a goal path into its structural parts. Throws when the
 * path is not a well-formed goal path — call `classifyPath` first if
 * you want a soft check.
 */
export function decomposeGoalPath(p: string): GoalPathParts {
  const segs = segmentsUnderMemory(p);
  if (!segs || segs.length !== 4 || segs[0] !== "goal") {
    throw new Error(`Not a goal path: ${p}`);
  }
  const status = segs[2];
  if (!VALID_STATUS.has(status)) {
    throw new Error(`Invalid goal status in path: ${p} (got '${status}')`);
  }
  const filename = segs[3];
  if (!filename.endsWith(".md")) {
    throw new Error(`Goal path must end with .md: ${p}`);
  }
  return {
    owner: segs[1],
    status: status as GoalPathParts["status"],
    goal_id: filename.slice(0, -".md".length),
  };
}

/**
 * Decompose a kpi path into (goal_id, kpi_id). Throws on malformed
 * paths.
 */
export function decomposeKpiPath(p: string): KpiPathParts {
  const segs = segmentsUnderMemory(p);
  if (!segs || segs.length !== 3 || segs[0] !== "kpi") {
    throw new Error(`Not a kpi path: ${p}`);
  }
  const filename = segs[2];
  if (!filename.endsWith(".md")) {
    throw new Error(`KPI path must end with .md: ${p}`);
  }
  return {
    goal_id: segs[1],
    kpi_id: filename.slice(0, -".md".length),
  };
}

/**
 * Build the canonical goal path from its parts. Output matches the
 * VFS-internal form (no mount prefix) because that is what
 * deeplake-fs caches and DB rows store.
 */
export function composeGoalPath(parts: GoalPathParts): string {
  return `/goal/${parts.owner}/${parts.status}/${parts.goal_id}.md`;
}

/**
 * Build the canonical kpi path from its parts. Output matches the
 * VFS-internal form (no mount prefix).
 */
export function composeKpiPath(parts: KpiPathParts): string {
  return `/kpi/${parts.goal_id}/${parts.kpi_id}.md`;
}
