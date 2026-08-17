/**
 * Shared PostgREST column lists to cut Supabase egress.
 * Prefer these over `select("*")` on list/dashboard pages.
 *
 * IMPORTANT: do not put a narrow select on a query key that other pages fill
 * with wider rows (see `project-options.ts`). Portfolio pages share
 * `["projects", orgId]` with `PROJECT_PORTFOLIO_SELECT`.
 */

import {
  PROJECT_PORTFOLIO_SELECT,
  PROJECT_HOME_SELECT,
  projectHomeQueryKey,
} from "@/lib/project-selects";

export { PROJECT_PORTFOLIO_SELECT, PROJECT_HOME_SELECT, projectHomeQueryKey };

/** Single-project / brief pages — portfolio cols plus narrative fields. */
export const PROJECT_DETAIL_SELECT = [
  PROJECT_PORTFOLIO_SELECT,
  "description",
  "bu_id",
  "streams_enabled",
].join(",");

/** Monthly cashflow columns used by Financials / Executive / Phase views. */
export const FINANCIALS_MONTHLY_SELECT = [
  "id",
  "project_id",
  "stream_id",
  "period_month",
  "capex_planned",
  "capex_actual",
  "capex_forecast",
  "opex_planned",
  "opex_actual",
  "opex_labor_planned",
  "opex_labor_actual",
  "opex_other_actual",
  "opex_forecast",
  "benefits_planned",
  "benefits_actual",
].join(",");

/** Fallback when schema cache lags behind opex_labor_actual / opex_other_actual. */
export const FINANCIALS_MONTHLY_SELECT_MIN = [
  "id",
  "project_id",
  "stream_id",
  "period_month",
  "capex_planned",
  "capex_actual",
  "capex_forecast",
  "opex_planned",
  "opex_actual",
  "opex_forecast",
  "benefits_planned",
  "benefits_actual",
].join(",");

export const RESOURCES_SELECT = [
  "id",
  "name",
  "email",
  "role",
  "skills",
  "bu_id",
  "capacity_hours_week",
  "cost_rate",
  "location",
  "status",
  "user_id",
].join(",");

/** Extended resource fields for timesheets (requires timesheets migration). */
export const RESOURCES_TIMESHEET_SELECT = [RESOURCES_SELECT, "manager_user_id"].join(",");

export const RESOURCE_ALLOCATIONS_SELECT = [
  "id",
  "project_id",
  "stream_id",
  "stage_gate_id",
  "resource_id",
  "period_month",
  "allocation_percent",
  "allocated_hours",
  "role_on_project",
].join(",");

export const RISKS_SELECT = [
  "id",
  "raid_code",
  "project_id",
  "title",
  "description",
  "category",
  "probability",
  "impact",
  "severity",
  "status",
  "owner",
  "mitigation",
  "notes",
  "due_date",
  "escalated_at",
  "escalation_level",
  "escalation_reason",
].join(",");

/** Columns the Health Engine reads — must exist on `risks` or the query returns no rows. */
export const HEALTH_ENGINE_RISKS_SELECT =
  "id,project_id,status,severity,probability,impact" as const;

export const ISSUES_SELECT = [
  "id",
  "raid_code",
  "project_id",
  "title",
  "description",
  "priority",
  "status",
  "owner",
  "raised_date",
  "target_date",
  "resolved_date",
  "resolution",
  "escalated_at",
  "escalation_level",
  "escalation_reason",
].join(",");

export const ACTIONS_SELECT = [
  "id",
  "raid_code",
  "project_id",
  "title",
  "description",
  "owner",
  "priority",
  "status",
  "due_date",
  "completed_date",
  "escalated_at",
  "escalation_level",
  "escalation_reason",
].join(",");

export const DECISIONS_SELECT = [
  "id",
  "raid_code",
  "project_id",
  "title",
  "description",
  "program",
  "forum",
  "sponsor",
  "decided_by",
  "approvers",
  "approver_user_id",
  "outcome",
  "status",
  "decision_date",
  "rationale",
  "impact",
].join(",");

export const BENEFITS_SELECT = [
  "id",
  "project_id",
  "title",
  "benefit_type",
  "target_value",
  "realised_value",
  "realisation_date",
  "owner",
  "status",
  "notes",
].join(",");

export const STAGE_GATES_SELECT = [
  "id",
  "project_id",
  "stream_id",
  "gate_name",
  "planned_date",
  "actual_date",
  "status",
  "approver",
  "notes",
].join(",");

export const STAGE_GATE_DEFINITIONS_SELECT = [
  "id",
  "org_id",
  "delivery_method_id",
  "gate_name",
  "sort_order",
  "is_active",
].join(",");

export const MILESTONES_SELECT = [
  "id",
  "project_id",
  "stream_id",
  "stage_gate_id",
  "name",
  "planned_date",
  "actual_date",
  "status",
  "owner",
  "notes",
  "updated_at",
].join(",");

export const NOTIFICATIONS_SELECT = "id,kind,title,body,link,read_at,created_at" as const;

export const WORK_ITEMS_SELECT = [
  "id",
  "org_id",
  "project_id",
  "stream_id",
  "stage_gate_id",
  "sprint_id",
  "parent_id",
  "wbs_code",
  "title",
  "status",
  "priority",
  "owner",
  "owner_user_id",
  "percent_complete",
  "planned_start",
  "planned_end",
  "actual_end",
  "estimate_hours",
  "actual_hours",
  "sort_order",
].join(",");

/** Drop raid_code from a select list when the column is not migrated yet. */
export function selectWithoutRaidCode(select: string) {
  return select
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "raid_code")
    .join(",");
}

export function isMissingRaidCodeColumn(error: { message?: string } | null | undefined) {
  return /raid_code/i.test(String(error?.message || ""));
}

export async function selectWithRaidCodeFallback(
  run: (select: string) => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
  select: string,
) {
  const first = await run(select);
  if (!first.error) return (first.data as unknown[]) ?? [];
  if (!isMissingRaidCodeColumn(first.error)) throw first.error;
  const second = await run(selectWithoutRaidCode(select));
  if (second.error) throw second.error;
  return (second.data as unknown[]) ?? [];
}
