/** Guided new-project wizard: step catalog + field help (Data Editor aligned). */

export type WizardStepId =
  | "project"
  | "streams"
  | "gates"
  | "fy"
  | "work"
  | "governance"
  | "review";

export type WizardStepDef = {
  id: WizardStepId;
  n: number;
  title: string;
  /** Shown under the step title; also used as hover help on the step heading. */
  description: string;
  dataEditorSheet: string;
};

export const WIZARD_STEPS: WizardStepDef[] = [
  {
    id: "project",
    n: 1,
    title: "Project register",
    description:
      "Same as Data Editor → Projects. Create the master row: code, name, portfolio, delivery method, schedule, and funding. A Core stream is created automatically in the database.",
    dataEditorSheet: "Projects",
  },
  {
    id: "streams",
    n: 2,
    title: "Delivery streams",
    description:
      "Same as Data Editor → Project Streams. Every project gets a Core lane. Add extra streams (e.g. Workstream A) when delivery is split across teams.",
    dataEditorSheet: "Project Streams",
  },
  {
    id: "gates",
    n: 3,
    title: "Stage gates",
    description:
      "Same as Data Editor → Stage Gates. Instantiate org gate definitions (Initiate → Close) with planned dates on every stream (Core and extras) so Forecast can show phases per lane. Skip or light-touch for pure Agile.",
    dataEditorSheet: "Stage Gates",
  },
  {
    id: "fy",
    n: 4,
    title: "FY allocation",
    description:
      "Same as Data Editor → FY Allocations. Split Budget / Forecast (and CapEx / OpEx) across financial years so portfolio charts and monthly cascade have a plan envelope.",
    dataEditorSheet: "FY Allocations",
  },
  {
    id: "work",
    n: 5,
    title: "Work items",
    description:
      "Same as Data Editor → Work Items. Seed the WBS / backlog so timesheets and EVM % complete have tasks. Optionally attribute to a stage gate or leave for Sprint later.",
    dataEditorSheet: "Work Items (WBS)",
  },
  {
    id: "governance",
    n: 6,
    title: "Governance starters",
    description:
      "Same as Data Editor → Risks / Stakeholders. Optional first risk and stakeholder so RAID and engagement registers are not empty on day one.",
    dataEditorSheet: "Risks · Stakeholders",
  },
  {
    id: "review",
    n: 7,
    title: "Review & open",
    description:
      "Confirm what will be written, then finish. Planned stage gates are created on every stream so Forecast shows those phases immediately.",
    dataEditorSheet: "Summary",
  },
];

/** Hover help for field labels (title attribute + tooltip). */
export const FIELD_HELP: Record<string, string> = {
  project_code:
    "Human key used across every sheet (gates, finance, work items). Keep short and unique in the organisation (e.g. PRJ-042).",
  name: "Display name on portfolio registers, Gantt, and executive views.",
  portfolio:
    "Portfolio bucket for executive health & segmentation: Business Strategic | IT Strategic | CAPEX | Unfunded.",
  program: "Optional program / theme grouping above the project.",
  sponsor: "Executive sponsor name (reporting / governance).",
  bu_id: "Business unit from org catalogue (Data Editor → Business Units).",
  priority: "Relative priority for prioritisation and demand views.",
  status: "Lifecycle status (Not Started → Completed / Cancelled).",
  rag: "Overall RAG for dashboards (Green / Amber / Red).",
  delivery_method:
    "Waterfall uses stage gates; Agile uses sprints; Hybrid can use both. Drives Work Items gate vs sprint pickers.",
  current_phase: "Optional starting phase label; usually mirrors the in-flight stage gate later.",
  planned_start_date: "Intended start — source of truth for schedule when Actual is blank.",
  planned_end_date: "Intended finish — used for Gantt, FY windows, and EVM schedule %.",
  actual_start_date: "When work actually started (overrides planned for Schedule Start).",
  actual_end_date: "When work actually finished.",
  start_date: "Schedule Start (auto-synced from Actual else Planned) — used by Gantt/FY.",
  end_date: "Schedule End (auto-synced from Actual else Planned).",
  target_go_live: "Target go-live / release date for roadmap views.",
  budget: "Approved total funding envelope for the project.",
  capex_approved: "Approved capital spend (part of funding / BAC inputs).",
  opex_approved: "Approved operating spend (labor + other OpEx plan).",
  capex_incurred: "Capital spent to date (usually left 0 at create; filled from actuals later).",
  opex_incurred: "Operating spent to date (usually left 0 at create).",
  benefits_target: "Target benefits $ (rollup; detail lives on Benefits sheet).",
  benefits_realised: "Benefits realised to date (usually 0 at create).",
  roi_percent: "Target ROI % = (benefits − budget) / budget × 100 when used.",
  description: "Free-text project summary for briefs and AI assist.",
  stream_name: "Stream display name. Core is created automatically; add more lanes if needed.",
  stream_code: "Short code for the stream (e.g. WS1). Used in Excel as stream_code.",
  gate_planned:
    "Planned review / decision date. Copied onto every stream so Forecast phases appear per lane after setup.",
  fy: "Financial year label (e.g. FY26 or 2025/26) matching your org convention.",
  fy_budget: "Budget $ allocated to this FY (drives portfolio FY charts).",
  fy_forecast: "Forecast $ for this FY.",
  fy_capex: "CapEx portion of the FY budget split.",
  fy_opex: "OpEx portion of the FY budget split.",
  wi_title: "Work item / task title shown on timesheets and the work board.",
  wi_wbs: "Optional WBS code for ordering (e.g. 1.1).",
  wi_hours: "Planned hours — feeds demand, week plan, and EVM weighting.",
  wi_gate: "Optional stage gate so labor attributes to that phase.",
  risk_title: "First risk title for the RAID register (optional).",
  stakeholder_name: "Key stakeholder name (optional).",
  stakeholder_role: "Stakeholder role / interest (optional).",
};

export const PORTFOLIO_OPTS = ["Business Strategic", "IT Strategic", "CAPEX", "Unfunded"] as const;
export const PRIORITY_OPTS = ["Low", "Medium", "High", "Critical"] as const;
export const STATUS_OPTS = ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"] as const;
export const RAG_OPTS = ["Green", "Amber", "Red"] as const;
export const DELIVERY_OPTS = ["Waterfall", "Agile", "Hybrid"] as const;
// Prefer org delivery_methods from the DB (see src/lib/delivery-methods.ts).
// DELIVERY_OPTS remains as a fallback when the table is not migrated yet.
