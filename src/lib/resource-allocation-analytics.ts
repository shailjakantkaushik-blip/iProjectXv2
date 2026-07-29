/**
 * Resource allocation planned vs actual + timesheet labor cost rollups.
 * Planned: resource_allocations (project / stream / stage_gate / month)
 * Actual hours: approved timesheet_entries (via work item / stamped stream+gate)
 * Actual cost: timesheet_entries.labor_cost (FTE)
 */

export type AllocationPlanRow = {
  id?: string;
  resource_id: string;
  project_id: string;
  stream_id?: string | null;
  stage_gate_id?: string | null;
  period_month: string;
  allocation_percent?: number | null;
  allocated_hours?: number | null;
  role_on_project?: string | null;
};

export type TimesheetEffortRow = {
  resource_id?: string | null;
  project_id?: string | null;
  stream_id?: string | null;
  stage_gate_id?: string | null;
  period_month: string; // YYYY-MM-01 from week_start
  /** Original timesheet week start (YYYY-MM-DD) when available — for period filters. */
  week_start?: string | null;
  hours: number;
  labor_cost: number;
  billable?: boolean;
};

export type ProjectMeta = {
  id: string;
  name?: string | null;
  project_code?: string | null;
  program?: string | null;
  portfolio?: string | null;
};

export type PvaGrain =
  | "resource"
  | "project"
  | "stream"
  | "stage_gate"
  | "program"
  | "portfolio"
  | "month";

export type AllocationPvaRow = {
  key: string;
  label: string;
  resource_id?: string | null;
  project_id?: string | null;
  stream_id?: string | null;
  stage_gate_id?: string | null;
  program?: string | null;
  portfolio?: string | null;
  period_month?: string | null;
  planned_hours: number;
  planned_percent: number;
  actual_hours: number;
  variance_hours: number;
  utilization_pct: number | null;
  status: "Over" | "Optimal" | "Under" | "Unplanned";
  labor_cost: number;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function normMonth(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v).slice(0, 10);
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[1]}-${m[2]}-01`;
}

export function allocationStatus(plannedPct: number, actualHours: number, plannedHours: number): AllocationPvaRow["status"] {
  if (plannedHours <= 0 && actualHours > 0) return "Unplanned";
  const pct = plannedHours > 0 ? (actualHours / plannedHours) * 100 : plannedPct;
  if (pct > 110 || plannedPct > 100) return "Over";
  if (pct >= 60 || plannedPct >= 60) return "Optimal";
  return "Under";
}

function hoursFromAllocation(a: AllocationPlanRow, capacityHoursWeek = 40): number {
  const explicit = num(a.allocated_hours);
  if (explicit > 0) return explicit;
  // ~4.33 weeks/month × weekly capacity × allocation %
  return Math.round(((capacityHoursWeek * 4.33 * num(a.allocation_percent)) / 100) * 100) / 100;
}

type Agg = {
  key: string;
  label: string;
  resource_id?: string | null;
  project_id?: string | null;
  stream_id?: string | null;
  stage_gate_id?: string | null;
  program?: string | null;
  portfolio?: string | null;
  period_month?: string | null;
  planned_hours: number;
  planned_percent: number;
  actual_hours: number;
  labor_cost: number;
};

function grainKey(
  grain: PvaGrain,
  opts: {
    resourceId?: string | null;
    projectId?: string | null;
    streamId?: string | null;
    stageGateId?: string | null;
    program?: string | null;
    portfolio?: string | null;
    month?: string | null;
  },
): string {
  switch (grain) {
    case "resource":
      return `r:${opts.resourceId || "—"}`;
    case "project":
      return `p:${opts.projectId || "—"}`;
    case "stream":
      return `s:${opts.projectId || "—"}|${opts.streamId || "—"}`;
    case "stage_gate":
      return `g:${opts.projectId || "—"}|${opts.streamId || "—"}|${opts.stageGateId || "—"}`;
    case "program":
      return `prog:${opts.program || "Unassigned"}`;
    case "portfolio":
      return `port:${opts.portfolio || "Unassigned"}`;
    case "month":
      return `m:${opts.month || "—"}`;
  }
}

export function buildAllocationPva(opts: {
  grain: PvaGrain;
  plans: AllocationPlanRow[];
  actuals: TimesheetEffortRow[];
  projectsById: Map<string, ProjectMeta>;
  resourceNames?: Map<string, string>;
  streamLabels?: Map<string, string>;
  gateLabels?: Map<string, string>;
  capacityByResource?: Map<string, number>;
}): AllocationPvaRow[] {
  const {
    grain,
    plans,
    actuals,
    projectsById,
    resourceNames,
    streamLabels,
    gateLabels,
    capacityByResource,
  } = opts;
  const acc = new Map<string, Agg>();

  const touch = (partial: Omit<Agg, "planned_hours" | "planned_percent" | "actual_hours" | "labor_cost"> & Partial<Agg>) => {
    const cur = acc.get(partial.key) || {
      key: partial.key,
      label: partial.label,
      resource_id: partial.resource_id ?? null,
      project_id: partial.project_id ?? null,
      stream_id: partial.stream_id ?? null,
      stage_gate_id: partial.stage_gate_id ?? null,
      program: partial.program ?? null,
      portfolio: partial.portfolio ?? null,
      period_month: partial.period_month ?? null,
      planned_hours: 0,
      planned_percent: 0,
      actual_hours: 0,
      labor_cost: 0,
    };
    cur.planned_hours += num(partial.planned_hours);
    cur.planned_percent += num(partial.planned_percent);
    cur.actual_hours += num(partial.actual_hours);
    cur.labor_cost += num(partial.labor_cost);
    acc.set(partial.key, cur);
  };

  for (const a of plans) {
    const p = projectsById.get(a.project_id);
    const month = normMonth(a.period_month);
    const cap = capacityByResource?.get(a.resource_id) ?? 40;
    const key = grainKey(grain, {
      resourceId: a.resource_id,
      projectId: a.project_id,
      streamId: a.stream_id,
      stageGateId: a.stage_gate_id,
      program: p?.program,
      portfolio: p?.portfolio,
      month,
    });
    const label = labelFor(grain, {
      resourceId: a.resource_id,
      projectId: a.project_id,
      streamId: a.stream_id,
      stageGateId: a.stage_gate_id,
      program: p?.program,
      portfolio: p?.portfolio,
      month,
      projectsById,
      resourceNames,
      streamLabels,
      gateLabels,
    });
    touch({
      key,
      label,
      resource_id: a.resource_id,
      project_id: a.project_id,
      stream_id: a.stream_id,
      stage_gate_id: a.stage_gate_id,
      program: p?.program,
      portfolio: p?.portfolio,
      period_month: month,
      planned_hours: hoursFromAllocation(a, cap),
      planned_percent: num(a.allocation_percent),
    });
  }

  for (const e of actuals) {
    if (!e.project_id && grain !== "resource" && grain !== "month") continue;
    const p = e.project_id ? projectsById.get(e.project_id) : undefined;
    const month = normMonth(e.period_month);
    const key = grainKey(grain, {
      resourceId: e.resource_id,
      projectId: e.project_id,
      streamId: e.stream_id,
      stageGateId: e.stage_gate_id,
      program: p?.program,
      portfolio: p?.portfolio,
      month,
    });
    const label = labelFor(grain, {
      resourceId: e.resource_id,
      projectId: e.project_id,
      streamId: e.stream_id,
      stageGateId: e.stage_gate_id,
      program: p?.program,
      portfolio: p?.portfolio,
      month,
      projectsById,
      resourceNames,
      streamLabels,
      gateLabels,
    });
    touch({
      key,
      label,
      resource_id: e.resource_id,
      project_id: e.project_id,
      stream_id: e.stream_id,
      stage_gate_id: e.stage_gate_id,
      program: p?.program,
      portfolio: p?.portfolio,
      period_month: month,
      actual_hours: num(e.hours),
      labor_cost: num(e.labor_cost),
    });
  }

  return Array.from(acc.values())
    .map((r) => {
      const variance = Math.round((r.planned_hours - r.actual_hours) * 100) / 100;
      const util =
        r.planned_hours > 0
          ? Math.round((r.actual_hours / r.planned_hours) * 1000) / 10
          : null;
      return {
        ...r,
        planned_hours: Math.round(r.planned_hours * 100) / 100,
        planned_percent: Math.round(r.planned_percent * 10) / 10,
        actual_hours: Math.round(r.actual_hours * 100) / 100,
        variance_hours: variance,
        utilization_pct: util,
        status: allocationStatus(r.planned_percent, r.actual_hours, r.planned_hours),
        labor_cost: Math.round(r.labor_cost * 100) / 100,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function labelFor(
  grain: PvaGrain,
  opts: {
    resourceId?: string | null;
    projectId?: string | null;
    streamId?: string | null;
    stageGateId?: string | null;
    program?: string | null;
    portfolio?: string | null;
    month?: string | null;
    projectsById: Map<string, ProjectMeta>;
    resourceNames?: Map<string, string>;
    streamLabels?: Map<string, string>;
    gateLabels?: Map<string, string>;
  },
): string {
  const p = opts.projectId ? opts.projectsById.get(opts.projectId) : undefined;
  const pName = p?.project_code || p?.name || opts.projectId || "—";
  switch (grain) {
    case "resource":
      return opts.resourceNames?.get(opts.resourceId || "") || opts.resourceId || "—";
    case "project":
      return pName;
    case "stream":
      return `${pName} · ${opts.streamLabels?.get(opts.streamId || "") || opts.streamId || "Core"}`;
    case "stage_gate":
      return `${pName} · ${opts.streamLabels?.get(opts.streamId || "") || "—"} · ${
        opts.gateLabels?.get(opts.stageGateId || "") || opts.stageGateId || "Unassigned gate"
      }`;
    case "program":
      return opts.program || "Unassigned";
    case "portfolio":
      return opts.portfolio || "Unassigned";
    case "month":
      return (opts.month || "—").slice(0, 7);
  }
}

/** Sum entry daily hours. */
export function entryHours(e: {
  hours_mon?: number | null;
  hours_tue?: number | null;
  hours_wed?: number | null;
  hours_thu?: number | null;
  hours_fri?: number | null;
  hours_sat?: number | null;
  hours_sun?: number | null;
}): number {
  return (
    num(e.hours_mon) +
    num(e.hours_tue) +
    num(e.hours_wed) +
    num(e.hours_thu) +
    num(e.hours_fri) +
    num(e.hours_sat) +
    num(e.hours_sun)
  );
}
