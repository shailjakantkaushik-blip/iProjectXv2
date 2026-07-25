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
].join(",");

export const RESOURCE_ALLOCATIONS_SELECT = [
  "id",
  "project_id",
  "stream_id",
  "resource_id",
  "period_month",
  "allocation_percent",
  "allocated_hours",
  "role_on_project",
].join(",");

export const RISKS_SELECT = [
  "id",
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
].join(",");

export const ISSUES_SELECT = [
  "id",
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
].join(",");

export const ACTIONS_SELECT = [
  "id",
  "project_id",
  "title",
  "description",
  "owner",
  "priority",
  "status",
  "due_date",
  "completed_date",
].join(",");

export const DECISIONS_SELECT = [
  "id",
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

export const NOTIFICATIONS_SELECT =
  "id,kind,title,body,link,read_at,created_at" as const;

export const WORK_ITEMS_SELECT = [
  "id",
  "project_id",
  "stream_id",
  "parent_id",
  "title",
  "status",
  "priority",
  "owner",
  "owner_user_id",
  "percent_complete",
  "planned_end",
  "actual_end",
].join(",");
