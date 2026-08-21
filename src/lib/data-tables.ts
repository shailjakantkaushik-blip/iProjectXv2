// Central schema for the Data Editor + Excel import/export.
// All tables are org-scoped. Project-scoped tables resolve via `project_code`
// (human-friendly column shown in exports) instead of the raw project_id UUID.

export type FieldType = "text" | "number" | "date" | "select" | "textarea";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  // In export/import, replace a UUID FK with a human-readable code column.
  fk?: "project" | "bu" | "stream" | "stage_gate" | "sprint" | "user";
  // Show in list/editor tables (default true)
  hidden?: boolean;
  // Width hint for the editor grid
  w?: string;
}

export interface TableDef {
  key: string; // supabase table name
  label: string;
  // Row-scope for import: unique key(s) used to upsert-match a row.
  // e.g. ["project_code","gate_name"] on stage_gates.
  matchOn?: string[];
  // Order results by this column
  orderBy?: string;
  // Whether new-row insert is supported through the editor (some tables
  // are derived, e.g. financials_monthly you can, milestones you can, etc.)
  fields: FieldDef[];
  // Extra description shown at top of the tab
  description?: string;
}

const RAG = ["Green", "Amber", "Red"];
const STATUS = ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"];
const PRIORITY = ["Low", "Medium", "High", "Critical"];
const DELIVERY = ["Waterfall", "Agile", "Hybrid"];
const GATE_STATUS = ["Pending", "In Review", "Approved", "Rejected", "On Hold"];
const DECISION_OUTCOME = ["Pending", "In Review", "Approved", "Rejected", "On Hold"];

export const TABLES: TableDef[] = [
  {
    key: "projects",
    label: "Projects",
    matchOn: ["project_code"],
    orderBy: "project_code",
    description:
      "Master project register. `project_code` is the human key used across every other sheet. " +
      "Edit Planned/Actual dates as the source of truth — Schedule Start/End stay auto-synced for Gantt & FY. " +
      "Current Phase mirrors the in-flight stage gate when gates are updated.",
    fields: [
      { key: "project_code", label: "Project Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      {
        key: "portfolio",
        label: "Strategic Alignment",
        type: "select",
        options: ["Business Strategic", "IT Strategic", "CAPEX", "Unfunded"],
      },
      { key: "program", label: "Program", type: "text" },
      {
        key: "functional_area",
        label: "Functional Area",
        type: "select",
        options: [
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
        ],
      },
      { key: "payback_months", label: "Payback (months)", type: "number" },
      { key: "manual_rank", label: "Manual rank", type: "number" },
      { key: "sponsor", label: "Sponsor (text)", type: "text" },
      {
        key: "sponsor_stakeholder_id",
        label: "Sponsor stakeholder id",
        type: "text",
      },
      { key: "bu_id", label: "Business Unit", type: "text", fk: "bu" },
      { key: "priority", label: "Priority", type: "select", options: PRIORITY },
      { key: "status", label: "Status", type: "select", options: STATUS },
      { key: "rag", label: "RAG", type: "select", options: RAG },
      {
        key: "current_phase",
        label: "Current Phase",
        type: "text",
        // Prefer editing via Stage Gates; this mirrors the resolved in-flight gate.
      },
      { key: "delivery_method", label: "Delivery", type: "select", options: DELIVERY },
      // Schedule Start/End = legacy window used by Gantt/FY. Auto-synced from
      // Actual (else Planned) on save — edit Planned/Actual as the source of truth.
      { key: "planned_start_date", label: "Planned Start", type: "date" },
      { key: "planned_end_date", label: "Planned End", type: "date" },
      { key: "actual_start_date", label: "Actual Start", type: "date" },
      { key: "actual_end_date", label: "Actual End", type: "date" },
      { key: "start_date", label: "Schedule Start (auto)", type: "date" },
      { key: "end_date", label: "Schedule End (auto)", type: "date" },
      { key: "target_go_live", label: "Target Go-Live", type: "date" },
      { key: "budget", label: "Budget", type: "number" },
      { key: "capex_approved", label: "CAPEX Approved", type: "number" },
      { key: "capex_incurred", label: "CAPEX Incurred", type: "number" },
      { key: "opex_approved", label: "OPEX Approved", type: "number" },
      { key: "opex_incurred", label: "OPEX Incurred", type: "number" },
      {
        key: "forecast_at_completion",
        label: "Forecast at Completion (FAC)",
        type: "number",
      },
      { key: "benefits_target", label: "Benefits Target (rollup)", type: "number" },
      { key: "benefits_realised", label: "Benefits Realised (rollup)", type: "number" },
      {
        key: "roi_percent",
        label: "ROI % (target)",
        type: "number",
      },
      { key: "baseline_budget", label: "Baseline Budget", type: "number" },
      { key: "baseline_capex", label: "Baseline CAPEX", type: "number" },
      { key: "baseline_opex", label: "Baseline OPEX", type: "number" },
      { key: "baseline_benefits", label: "Baseline Benefits", type: "number" },
      { key: "baseline_date", label: "Baseline Date", type: "date" },
      { key: "baseline_label", label: "Baseline Label", type: "text" },
      { key: "description", label: "Description", type: "textarea" },
      // Always-on Core: new projects default true; kept for import compat.
      {
        key: "streams_enabled",
        label: "Streams Enabled",
        type: "select",
        options: ["true", "false"],
      },
    ],
  },
  {
    key: "project_streams",
    label: "Project Streams",
    matchOn: ["project_code", "name"],
    orderBy: "sort_order",
    description:
      "Optional delivery lanes under a project. When streams are enabled, each stream owns planned/actual dates, " +
      "gates, Budget, and allocations; the project row is the rollup. Stream Budget is the approved envelope.",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "name", label: "Stream Name", type: "text", required: true },
      { key: "code", label: "Stream Code", type: "text" },
      { key: "owner", label: "Owner", type: "text" },
      { key: "status", label: "Status", type: "select", options: STATUS },
      { key: "rag", label: "RAG", type: "select", options: RAG },
      { key: "is_default", label: "Default", type: "select", options: ["true", "false"] },
      { key: "sort_order", label: "Order", type: "number" },
      { key: "planned_start_date", label: "Planned Start", type: "date" },
      { key: "planned_end_date", label: "Planned End", type: "date" },
      { key: "actual_start_date", label: "Actual Start", type: "date" },
      { key: "actual_end_date", label: "Actual End", type: "date" },
      { key: "budget", label: "Budget", type: "number" },
      { key: "capex_approved", label: "CAPEX Approved", type: "number" },
      { key: "capex_incurred", label: "CAPEX Incurred", type: "number" },
      { key: "opex_approved", label: "OPEX Approved", type: "number" },
      { key: "opex_incurred", label: "OPEX Incurred", type: "number" },
      { key: "forecast_at_completion", label: "FAC", type: "number" },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  {
    key: "business_units",
    label: "Business Units",
    matchOn: ["code"],
    orderBy: "name",
    fields: [
      { key: "code", label: "BU Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
    ],
  },
  {
    key: "stage_gate_definitions",
    label: "Stage Gate Definitions",
    matchOn: ["gate_name"],
    orderBy: "sort_order",
    description: "Org-wide list of stage gates used by every project.",
    fields: [
      { key: "gate_name", label: "Gate Name", type: "text", required: true },
      { key: "sort_order", label: "Order", type: "number" },
      { key: "is_active", label: "Active", type: "select", options: ["true", "false"] },
    ],
  },
  {
    key: "stage_gates",
    label: "Stage Gates",
    matchOn: ["project_code", "stream_code", "gate_name"],
    orderBy: "planned_date",
    description:
      "When streams are enabled, set `stream_code` (from Project Streams sheet). Leave blank for non-stream projects.",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "stream_id", label: "Stream", type: "text", fk: "stream" },
      { key: "gate_name", label: "Gate Name", type: "text", required: true },
      { key: "planned_date", label: "Planned Date", type: "date" },
      { key: "actual_date", label: "Actual Date", type: "date" },
      { key: "status", label: "Status", type: "select", options: GATE_STATUS },
      { key: "approver", label: "Approver", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "milestones",
    label: "Milestones",
    // Stage-gate rows auto-sync into milestones; use this sheet for add-on
    // (non-gate) milestones only. Matching by project + name avoids clobbering
    // gate-linked rows that share a gate name.
    matchOn: ["project_code", "stream_code", "name"],
    orderBy: "planned_date",
    description:
      "When streams are enabled, set `stream_code` so milestones sit on the correct delivery lane. Leave blank for non-stream projects.",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "stream_id", label: "Stream", type: "text", fk: "stream" },
      { key: "name", label: "Milestone", type: "text", required: true },
      { key: "planned_date", label: "Planned", type: "date" },
      { key: "actual_date", label: "Actual", type: "date" },
      { key: "status", label: "Status", type: "select", options: STATUS },
      { key: "owner", label: "Owner", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "risks",
    label: "Risks",
    matchOn: ["project_code", "title"],
    orderBy: "raid_code",
    description:
      "Optional `stream_code` records the risk against a delivery stream. Leave blank for project-level.",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "stream_id", label: "Stream", type: "text", fk: "stream" },
      { key: "raid_code", label: "Risk ID", type: "text" },
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "category", label: "Category", type: "text" },
      { key: "probability", label: "Probability (1-5)", type: "number" },
      { key: "impact", label: "Impact (1-5)", type: "number" },
      { key: "severity", label: "Severity", type: "number" },
      { key: "status", label: "Status", type: "select", options: ["Open", "Mitigating", "Closed"] },
      { key: "owner", label: "Owner", type: "text" },
      { key: "mitigation", label: "Mitigation", type: "textarea" },
      { key: "due_date", label: "Due", type: "date" },
    ],
  },
  {
    key: "issues",
    label: "Issues",
    matchOn: ["project_code", "title"],
    orderBy: "raid_code",
    description:
      "Optional `stream_code` records the issue against a delivery stream. Leave blank for project-level.",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "stream_id", label: "Stream", type: "text", fk: "stream" },
      { key: "raid_code", label: "Issue ID", type: "text" },
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "priority", label: "Priority", type: "select", options: PRIORITY },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Open", "In Progress", "Resolved", "Closed"],
      },
      { key: "owner", label: "Owner", type: "text" },
      { key: "raised_date", label: "Raised", type: "date" },
      { key: "target_date", label: "Target", type: "date" },
      { key: "resolved_date", label: "Resolved", type: "date" },
      { key: "resolution", label: "Resolution", type: "textarea" },
    ],
  },
  {
    key: "actions",
    label: "Actions",
    matchOn: ["project_code", "title"],
    orderBy: "raid_code",
    description:
      "Optional `stream_code` records the action against a delivery stream. Leave blank for project-level.",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "stream_id", label: "Stream", type: "text", fk: "stream" },
      { key: "raid_code", label: "Action ID", type: "text" },
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "owner", label: "Owner", type: "text" },
      { key: "priority", label: "Priority", type: "select", options: PRIORITY },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Open", "In Progress", "Done", "Cancelled"],
      },
      { key: "due_date", label: "Due", type: "date" },
      { key: "completed_date", label: "Completed", type: "date" },
    ],
  },
  {
    key: "decisions",
    label: "Decisions",
    matchOn: ["project_code", "title"],
    orderBy: "raid_code",
    description:
      "Optional `stream_code` records the decision against a delivery stream. `stage_gate_id` is the linked stage-gate approval; status is shared across the project and its streams.",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "stream_id", label: "Stream", type: "text", fk: "stream" },
      { key: "stage_gate_id", label: "Stage Gate", type: "text", fk: "stage_gate" },
      { key: "raid_code", label: "Decision ID", type: "text" },
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "program", label: "Program", type: "text" },
      { key: "forum", label: "Forum", type: "text" },
      { key: "sponsor", label: "Sponsor", type: "text" },
      { key: "decided_by", label: "Decided By", type: "text" },
      { key: "approvers", label: "Approvers (name)", type: "text" },
      { key: "approver_user_id", label: "Approver", type: "text", fk: "user" },
      { key: "outcome", label: "Outcome", type: "select", options: DECISION_OUTCOME },
      { key: "status", label: "Status", type: "text" },
      { key: "decision_date", label: "Date", type: "date" },
      { key: "rationale", label: "Rationale", type: "textarea" },
      { key: "impact", label: "Impact", type: "textarea" },
    ],
  },
  {
    key: "dependencies",
    label: "Dependencies",
    matchOn: ["project_code", "title"],
    orderBy: "needed_by",
    fields: [
      {
        key: "project_id",
        label: "Project (Successor)",
        type: "text",
        fk: "project",
        required: true,
      },
      {
        key: "depends_on_project_id",
        label: "Depends On (Predecessor)",
        type: "text",
        fk: "project",
      },
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      {
        key: "dep_type",
        label: "Type",
        type: "select",
        options: ["Finish-to-Start", "Start-to-Start", "Finish-to-Finish", "Start-to-Finish"],
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["On Track", "At Risk", "Blocked", "Resolved"],
      },
      { key: "owner", label: "Owner", type: "text" },
      { key: "needed_by", label: "Needed By", type: "date" },
    ],
  },
  {
    key: "benefits",
    label: "Benefits",
    matchOn: ["project_code", "title"],
    orderBy: "realisation_date",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "title", label: "Benefit", type: "text", required: true },
      {
        key: "benefit_type",
        label: "Type",
        type: "select",
        options: ["Cash", "Non-Cash", "Cost Avoidance", "Revenue"],
      },
      { key: "target_value", label: "Target", type: "number" },
      { key: "realised_value", label: "Realised", type: "number" },
      { key: "realisation_date", label: "Realisation Date", type: "date" },
      { key: "payback_months", label: "Payback (months)", type: "number" },
      { key: "owner", label: "Owner", type: "text" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Planned", "In Progress", "Realised", "At Risk"],
      },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "financials_monthly",
    label: "Financials (Monthly)",
    matchOn: ["project_code", "stream_code", "period_month"],
    orderBy: "period_month",
    description:
      "Execution cashflow. One row per project · stream · month: Plan and Forecast are columns, not two records. " +
      "CapEx Plan comes from Estimation Planning further costs tagged CapEx (FY Allocation only fills empty CapEx plan). " +
      "OpEx Plan and Planned FTE cascade from Project Estimation Planning (Apply). " +
      "Enter Actual after kickoff. Demand lives on Work Items — do not put demand hours in Plan columns. " +
      "Use Financials → Sync incurred from actuals to roll CapEx/OpEx actuals up to the project register.",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "stream_id", label: "Stream", type: "text", fk: "stream" },
      { key: "period_month", label: "Month (YYYY-MM-01)", type: "date", required: true },
      { key: "capex_planned", label: "CAPEX Plan", type: "number" },
      { key: "capex_actual", label: "CAPEX Actual", type: "number" },
      { key: "capex_forecast", label: "CAPEX Forecast", type: "number" },
      { key: "opex_planned", label: "OPEX Plan", type: "number" },
      { key: "opex_actual", label: "OPEX Actual (all)", type: "number" },
      { key: "opex_labor_planned", label: "OPEX Labor Plan (FTE)", type: "number" },
      { key: "opex_labor_actual", label: "OPEX Labor / FTE Actual", type: "number" },
      { key: "opex_other_actual", label: "OPEX Other", type: "number" },
      { key: "opex_forecast", label: "OPEX Forecast", type: "number" },
      { key: "benefits_planned", label: "Benefits Plan", type: "number" },
      { key: "benefits_actual", label: "Benefits Actual", type: "number" },
    ],
  },
  {
    key: "opex_other_costs",
    label: "Other OpEx Costs",
    matchOn: ["project_code", "stream_code", "cost_date", "category", "invoice_ref"],
    orderBy: "cost_date",
    description:
      "Non-labor OpEx line items (travel, vendors, software, etc.). Posted rows roll up to " +
      "Financials Monthly → OPEX Other, and OPEX Actual (all) = FTE Actual + OPEX Other. " +
      "Optional stream + stage gate for attribution.",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "stream_id", label: "Stream", type: "text", fk: "stream" },
      { key: "stage_gate_id", label: "Stage Gate", type: "text", fk: "stage_gate" },
      { key: "cost_date", label: "Cost Date", type: "date", required: true },
      {
        key: "category",
        label: "Category",
        type: "select",
        options: [
          "Travel",
          "Software",
          "Vendor / Contractor",
          "Facilities",
          "Training",
          "Licenses",
          "Contingency",
          "Other",
        ],
      },
      { key: "amount", label: "Amount", type: "number", required: true },
      { key: "vendor", label: "Vendor", type: "text" },
      { key: "invoice_ref", label: "Invoice / PO", type: "text" },
      { key: "description", label: "Description", type: "textarea" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["posted", "draft"],
      },
    ],
  },
  {
    key: "fy_allocations",
    label: "FY Allocations",
    matchOn: ["project_code", "stream_code", "fy"],
    orderBy: "fy",
    description:
      "Year slice of each project's approved envelope (subset of overall budget). " +
      "`budget` is the allocated $ for that FY; `forecast` is the in-flight year outlook. " +
      "CapEx/OpEx/Benefits are the detail split of that year budget. Compare to Estimation Plan CapEx/OpEx " +
      "on Budget vs Plan. Plan/Actual/Forecast above this allocation flags finance health.",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "stream_id", label: "Stream", type: "text", fk: "stream" },
      { key: "fy", label: "FY", type: "text", required: true },
      { key: "budget", label: "Budget $", type: "number" },
      { key: "forecast", label: "Forecast $", type: "number" },
      { key: "capex", label: "CAPEX (budget split)", type: "number" },
      { key: "opex", label: "OPEX (budget split)", type: "number" },
      { key: "benefits", label: "Benefits (FY)", type: "number" },
    ],
  },
  {
    key: "hierarchy_envelopes",
    label: "SA / Program Envelopes",
    matchOn: ["layer", "parent_name", "name"],
    orderBy: "layer",
    description:
      "Optional top-down pots. layer=alignment and name = Strategic Alignment (projects.portfolio), " +
      "parent_name blank. layer=program and name = Program, parent_name = the SA it sits under. " +
      "Prefer Programs → Hierarchy envelopes (dropdown of existing names). Leave envelope blank for rollup-only. " +
      "Project approved funding stays the project envelope; FY Allocation stays a year slice of that project envelope.",
    fields: [
      {
        key: "layer",
        label: "Layer",
        type: "select",
        options: ["alignment", "program"],
        required: true,
      },
      { key: "parent_name", label: "Parent SA (required for program)", type: "text" },
      { key: "name", label: "SA or Program name", type: "text", required: true },
      { key: "envelope", label: "Envelope $", type: "number" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "sprints",
    label: "Sprints",
    matchOn: ["project_code", "sprint_number"],
    orderBy: "start_date",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "sprint_number", label: "Sprint #", type: "number", required: true },
      { key: "name", label: "Name", type: "text" },
      { key: "start_date", label: "Start", type: "date" },
      { key: "end_date", label: "End", type: "date" },
      { key: "planned_points", label: "Planned Pts", type: "number" },
      { key: "completed_points", label: "Completed Pts", type: "number" },
      { key: "committed_stories", label: "Committed Stories", type: "number" },
      { key: "completed_stories", label: "Completed Stories", type: "number" },
      { key: "status", label: "Status", type: "select", options: ["Planned", "Active", "Closed"] },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "change_requests",
    label: "Release Register",
    matchOn: ["project_code", "cr_number"],
    orderBy: "raised_date",
    description:
      "Release & change register (same data as Governance → Release Register). " +
      "CR # + project_code uniquely identify a row.",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "cr_number", label: "CR / Release #", type: "text", required: true },
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      {
        key: "change_type",
        label: "Type",
        type: "select",
        options: ["Scope", "Schedule", "Budget", "Resource", "Technical", "Governance"],
      },
      {
        key: "impact_scope",
        label: "Impact",
        type: "select",
        options: ["Low", "Medium", "High", "Critical"],
      },
      { key: "impact_schedule_days", label: "Schedule Δ (days)", type: "number" },
      { key: "impact_cost", label: "Cost Δ", type: "number" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Submitted", "In Review", "Approved", "Rejected", "Deferred"],
      },
      { key: "owner", label: "Owner", type: "text" },
      { key: "raised_by", label: "Raised By", type: "text" },
      { key: "raised_date", label: "Raised", type: "date" },
      { key: "decision_date", label: "Decided", type: "date" },
      { key: "approver", label: "Approver", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "status_updates",
    label: "Status Updates",
    matchOn: ["project_code", "update_date"],
    orderBy: "update_date",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "update_date", label: "Date", type: "date", required: true },
      { key: "reporter", label: "Reporter", type: "text" },
      { key: "overall_rag", label: "Overall RAG", type: "select", options: RAG },
      { key: "schedule_rag", label: "Schedule", type: "select", options: RAG },
      { key: "cost_rag", label: "Cost", type: "select", options: RAG },
      { key: "scope_rag", label: "Scope", type: "select", options: RAG },
      { key: "progress_summary", label: "Progress", type: "textarea" },
      { key: "achievements", label: "Achievements", type: "textarea" },
      { key: "next_steps", label: "Next Steps", type: "textarea" },
      { key: "blockers", label: "Blockers", type: "textarea" },
    ],
  },
  {
    key: "stakeholders",
    label: "Stakeholders",
    matchOn: ["project_code", "name"],
    orderBy: "name",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "role", label: "Role", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "user_id", label: "Linked login", type: "text", fk: "user" },
      {
        key: "is_sponsor",
        label: "Sponsor",
        type: "select",
        options: ["true", "false"],
      },
      { key: "influence", label: "Influence", type: "select", options: ["Low", "Medium", "High"] },
      { key: "interest", label: "Interest", type: "select", options: ["Low", "Medium", "High"] },
      { key: "engagement_strategy", label: "Engagement", type: "textarea" },
    ],
  },
  {
    key: "resources",
    label: "Resources",
    matchOn: ["name"],
    orderBy: "name",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "email", label: "Email", type: "text" },
      { key: "role", label: "Role", type: "text" },
      { key: "skills", label: "Skills", type: "text" },
      { key: "bu_id", label: "Business Unit", type: "text", fk: "bu" },
      { key: "hours_per_day", label: "Hours / day", type: "number" },
      { key: "capacity_hours_week", label: "Capacity (h/wk)", type: "number" },
      { key: "cost_rate", label: "Cost Rate", type: "number" },
      { key: "location", label: "Location", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["Active", "Inactive"] },
      { key: "user_id", label: "Linked login", type: "text", fk: "user" },
      { key: "manager_user_id", label: "Manager", type: "text", fk: "user" },
    ],
  },
  {
    key: "resource_allocations",
    label: "Resource Allocations",
    matchOn: ["project_code", "stream_code", "resource_name", "period_month"],
    orderBy: "period_month",
    description:
      "Planned FTE from Project Estimation Planning (optional stream + stage gate). " +
      "allocation_percent is % of FTE for the month; allocated_hours is planned hours. " +
      "These hours are the planning ceiling on Work Items. Work-item hours are Demand, not Plan.",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "stream_id", label: "Stream", type: "text", fk: "stream" },
      { key: "stage_gate_id", label: "Stage Gate", type: "text", fk: "stage_gate" },
      { key: "resource_id", label: "Resource", type: "text", required: true },
      { key: "period_month", label: "Month", type: "date", required: true },
      { key: "allocation_percent", label: "Allocation %", type: "number" },
      { key: "allocated_hours", label: "Hours", type: "number" },
      { key: "role_on_project", label: "Role", type: "text" },
    ],
  },
  {
    key: "documents",
    label: "Documents",
    matchOn: ["project_code", "name"],
    orderBy: "uploaded_date",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "doc_type", label: "Type", type: "text" },
      { key: "url", label: "URL", type: "text" },
      { key: "version", label: "Version", type: "text" },
      { key: "owner", label: "Owner", type: "text" },
      { key: "uploaded_date", label: "Uploaded", type: "date" },
    ],
  },
  {
    key: "lessons_learned",
    label: "Lessons Learned",
    matchOn: ["project_code", "what_happened"],
    orderBy: "captured_date",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "category", label: "Category", type: "text" },
      { key: "what_happened", label: "What Happened", type: "textarea", required: true },
      { key: "root_cause", label: "Root Cause", type: "textarea" },
      { key: "recommendation", label: "Recommendation", type: "textarea" },
      { key: "captured_by", label: "Captured By", type: "text" },
      { key: "captured_date", label: "Date", type: "date" },
    ],
  },
  {
    key: "demand_pipeline",
    label: "Demand Pipeline",
    matchOn: ["idea_name"],
    orderBy: "submitted_date",
    fields: [
      { key: "idea_name", label: "Idea", type: "text", required: true },
      { key: "sponsor", label: "Sponsor", type: "text" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "bu_id", label: "Business Unit", type: "text", fk: "bu" },
      { key: "estimated_cost", label: "Est. Cost", type: "number" },
      { key: "estimated_benefit", label: "Est. Benefit", type: "number" },
      { key: "estimated_roi", label: "Est. ROI %", type: "number" },
      { key: "strategic_alignment", label: "Alignment (1–5)", type: "number" },
      { key: "complexity", label: "Complexity (1–5)", type: "number" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Idea", "Screening", "Business Case", "Approved", "Rejected", "On Hold"],
      },
      { key: "submitted_date", label: "Submitted", type: "date" },
    ],
  },
  {
    key: "work_items",
    label: "Work Items (WBS)",
    matchOn: ["project_code", "stream_code", "wbs_code", "title"],
    orderBy: "sort_order",
    description:
      "WBS / tasks. Set stream_code when the project has streams — blanks autopopulate to the Core stream when streams are enabled. " +
      "stage_gate_id links Waterfall/Hybrid tasks to a phase; sprint_id links Agile/Hybrid tasks to a sprint. " +
      "estimate_hours is Demand (assigned work), not Planned FTE. Planned FTE comes from Resource Allocations.",
    fields: [
      { key: "project_id", label: "Project", type: "text", fk: "project", required: true },
      { key: "stream_id", label: "Stream", type: "text", fk: "stream" },
      { key: "stage_gate_id", label: "Stage Gate", type: "text", fk: "stage_gate" },
      { key: "sprint_id", label: "Sprint", type: "text", fk: "sprint" },
      { key: "wbs_code", label: "WBS", type: "text" },
      { key: "title", label: "Title", type: "text", required: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["To Do", "In Progress", "Blocked", "Done", "Cancelled"],
      },
      {
        key: "priority",
        label: "Priority",
        type: "select",
        options: ["Critical", "High", "Medium", "Low"],
      },
      { key: "owner", label: "Owner", type: "text" },
      { key: "percent_complete", label: "% Complete", type: "number" },
      { key: "planned_start", label: "Planned Start", type: "date" },
      { key: "planned_end", label: "Planned End", type: "date" },
      { key: "actual_start", label: "Actual Start", type: "date" },
      { key: "actual_end", label: "Actual End", type: "date" },
      { key: "estimate_hours", label: "Planned Hours", type: "number" },
      { key: "actual_hours", label: "Actual Hours", type: "number" },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
];

export function getTable(key: string) {
  const t = TABLES.find((x) => x.key === key);
  if (!t) throw new Error(`Unknown table: ${key}`);
  return t;
}
