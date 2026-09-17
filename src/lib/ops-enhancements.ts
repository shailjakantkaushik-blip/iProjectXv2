/** Shared constants and scoring for ops enhancements. */

export const FUNCTIONAL_AREAS = [
  "Finance",
  "HR",
  "IT",
  "Operations",
  "Legal",
  "Sales",
  "Marketing",
  "Customer",
  "Risk & Compliance",
  "Other",
] as const;

export const STRATEGIC_ALIGNMENT_LABEL = "Strategic Alignment";

export const GOVERNANCE_CADENCES = [
  "Daily",
  "Weekly",
  "Fortnightly",
  "Monthly",
  "Quarterly",
  "Half-yearly",
  "Annual",
  "Ad-hoc",
] as const;

/** Default day length when a resource has no hours_per_day. Prefer resourceHoursPerDay(). */
export const HOURS_PER_DAY = 8;

/** Earlier payback (fewer months) scores higher. 0–15 points. */
export function paybackScore(months: number | null | undefined) {
  const m = Number(months);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return Math.round(Math.max(0, (36 - m) / 36) * 15 * 10) / 10;
}

export function projectPaybackMonths(
  project: { payback_months?: number | null },
  benefitLines?: Array<{ project_id?: string; payback_months?: number | null }>,
  projectId?: string,
) {
  const fromLines = (benefitLines || [])
    .filter((b) => !projectId || b.project_id === projectId)
    .map((b) => Number(b.payback_months))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (fromLines.length) return Math.min(...fromLines);
  const p = Number(project.payback_months);
  return Number.isFinite(p) && p > 0 ? p : null;
}

export function isProjectKickedOff(project: {
  status?: string | null;
  actual_start_date?: string | null;
}) {
  const s = String(project.status || "");
  if (s === "In Progress" || s === "On Hold" || s === "Completed") return true;
  return Boolean(project.actual_start_date);
}

export function isRagOverridden(project: { rag_override?: string | null } | null | undefined) {
  const o = String(project?.rag_override || "").trim();
  return o === "Green" || o === "Amber" || o === "Red";
}

export type RagProjectLike = {
  id?: string | null;
  project_id?: string | null;
  rag?: string | null;
  rag_override?: string | null;
  /** Attached Health Engine RAG (Green / Amber / Red). */
  health_engine_rag?: string | null;
};

function canonicalRag(raw?: string | null): "Green" | "Amber" | "Red" | null {
  const s = String(raw || "").trim();
  if (s === "Green" || s === "Amber" || s === "Red") return s;
  return null;
}

/**
 * RAG chips / filters: manual override wins, else Health Engine, else the
 * stored register field (only when the engine has not been scored yet).
 */
export function effectiveRag(
  project: RagProjectLike | null | undefined,
  calculated?: string | null,
) {
  if (isRagOverridden(project)) return String(project?.rag_override).trim();
  const calc =
    canonicalRag(calculated) || canonicalRag(project?.health_engine_rag ?? null);
  if (calc) return calc;
  return project?.rag || null;
}

/** Same as {@link effectiveRag} — pass the engine colour as the second argument. */
export function displayRag(
  project: RagProjectLike | null | undefined,
  calculated?: string | null,
) {
  return effectiveRag(project, calculated);
}

/** Resolve RAG from an org-wide Health Engine map (override still wins). */
export function shownRag(
  project: RagProjectLike | null | undefined,
  engineById?: Map<string, string> | null,
) {
  const id = String(project?.id || project?.project_id || "");
  return effectiveRag(project, id && engineById ? engineById.get(id) : null);
}

/** Attach Health Engine RAG so `displayRag` / `effectiveRag` pick it up. */
export function withEngineRag<T extends RagProjectLike>(
  projects: T[],
  engineById?: Map<string, string> | null,
): T[] {
  if (!engineById?.size) return projects;
  return projects.map((p) => {
    const id = String(p.id || p.project_id || "");
    const calc = id ? engineById.get(id) : undefined;
    if (!calc) return p;
    return { ...p, health_engine_rag: calc };
  });
}

export function worstRagOf(rags: Array<string | null | undefined>): "Green" | "Amber" | "Red" {
  let amber = false;
  for (const raw of rags) {
    const r = String(raw || "").trim();
    if (r === "Red") return "Red";
    if (r === "Amber") amber = true;
  }
  return amber ? "Amber" : "Green";
}

/** Worst colour among steering RAGs (override, else Health Engine, else register). */
export function worstSteeringRag(
  projects: RagProjectLike[],
  engineById?: Map<string, string> | null,
): "Green" | "Amber" | "Red" {
  return worstRagOf(projects.map((p) => shownRag(p, engineById)));
}

export function workItemScheduleRag(item: {
  status?: string | null;
  planned_end?: string | null;
  planned_start?: string | null;
  percent_complete?: number | null;
}) {
  const status = String(item.status || "");
  if (status === "Done" || status === "Cancelled") return "Green" as const;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = item.planned_end ? new Date(item.planned_end) : null;
  if (end && !Number.isNaN(end.getTime()) && end < today) return "Red" as const;
  if (end && !Number.isNaN(end.getTime())) {
    const days = (end.getTime() - today.getTime()) / 86400000;
    if (days <= 7) return "Amber" as const;
  }
  if (status === "Blocked") return "Amber" as const;
  return "Green" as const;
}

export function isWorkItemLate(item: { status?: string | null; planned_end?: string | null }) {
  return workItemScheduleRag(item) === "Red";
}

export function dailyRateFromHourly(costRate: number | null | undefined) {
  return Math.round((Number(costRate) || 0) * HOURS_PER_DAY * 100) / 100;
}
