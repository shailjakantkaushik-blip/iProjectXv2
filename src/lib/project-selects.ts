/**
 * Shared project column lists for portfolio pages.
 * Prefer these over `select("*")` so refetches stay small and fast.
 */

/** Columns used by Executive / Cockpit / Projects register / FY views. */
export const PROJECT_PORTFOLIO_SELECT = [
  "id",
  "org_id",
  "project_code",
  "name",
  "portfolio",
  "program",
  "sponsor",
  "sponsor_stakeholder_id",
  "priority",
  "status",
  "rag",
  "budget",
  "capex_approved",
  "capex_incurred",
  "opex_approved",
  "opex_incurred",
  "forecast_at_completion",
  "benefits_target",
  "benefits_realised",
  "roi_percent",
  "start_date",
  "end_date",
  "planned_start_date",
  "planned_end_date",
  "actual_start_date",
  "actual_end_date",
  "target_go_live",
  "pm_user_id",
  "delivery_method",
  "delivery_method_id",
  "current_phase",
  "created_at",
  "updated_at",
  "rag_override",
  "rag_override_reason",
  "rag_override_owner",
].join(",");

/** Opt-in extras — only use on pages that need them (migration 20260816090000). */
export const PROJECT_OPS_EXTRAS = ["functional_area", "payback_months", "manual_rank"].join(",");

/**
 * Home snapshot uses the same catalog as Projects / Executive.
 * Do not add optional ops columns here (`functional_area` lives on
 * PROJECT_OPS_EXTRAS) — a missing column empties the KPI strip.
 */
export const PROJECT_HOME_SELECT = PROJECT_PORTFOLIO_SELECT;

/** Shared React Query key with the projects register — same rows, same grants. */
export function projectHomeQueryKey(orgId: string | null | undefined) {
  return ["projects", orgId] as const;
}
