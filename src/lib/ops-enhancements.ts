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

export function displayRag(project: { rag?: string | null; rag_override?: string | null } | null | undefined) {
  if (isRagOverridden(project)) return String(project?.rag_override).trim();
  return project?.rag || null;
}

/** Sponsor override wins; otherwise calculated health RAG, then register RAG. */
export function effectiveRag(
  project: { rag?: string | null; rag_override?: string | null } | null | undefined,
  calculated?: string | null,
) {
  if (isRagOverridden(project)) return String(project?.rag_override).trim();
  const calc = String(calculated || "").trim();
  if (calc === "Green" || calc === "Amber" || calc === "Red") return calc;
  return project?.rag || null;
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

/** Worst colour among steering RAGs (override, else register). */
export function worstSteeringRag(
  projects: Array<{ rag?: string | null; rag_override?: string | null }>,
): "Green" | "Amber" | "Red" {
  return worstRagOf(projects.map((p) => displayRag(p)));
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
