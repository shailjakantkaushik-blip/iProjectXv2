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
  "current_phase",
  "created_at",
  "updated_at",
].join(",");

/** Home dashboard KPIs only. Use a dedicated query key — do not share with portfolio. */
export const PROJECT_HOME_SELECT =
  "id,name,status,rag,budget,capex_incurred,benefits_realised" as const;

export function projectHomeQueryKey(orgId: string | null | undefined) {
  return ["projects", orgId, "home"] as const;
}
