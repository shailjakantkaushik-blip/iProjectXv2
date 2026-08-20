/**
 * Resource allocation planned vs actual + timesheet labor cost rollups.
 * Allocated plan hours: resource_allocations (project / stream / stage_gate / month)
 * Work-item demand hours + demand FTE $: from work_items.estimate_hours × rates
 * Actual hours / Actual FTE $: approved timesheet_entries
 */

import type { WorkItemDemandSlice } from "@/lib/work-item-fte-plan";

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeUuid(v: string | null | undefined) {
  return UUID_RE.test(String(v || "").trim());
}

export function displayProjectName(p?: ProjectMeta | null, projectId?: string | null) {
  const code = String(p?.project_code || "").trim();
  const name = String(p?.name || "").trim();
  if (code && name && code !== name) return `${code} — ${name}`;
  if (code || name) return code || name;
  const id = String(projectId || "").trim();
  if (!id || looksLikeUuid(id) || id === "__non_billable__") {
    return id === "__non_billable__" ? "Non-billable" : "Unknown project";
  }
  return id;
}

export function displayStreamName(
  streamId: string | null | undefined,
  streamLabels?: Map<string, string>,
) {
  if (!streamId) return "Project";
  const s = String(streamLabels?.get(streamId) || "").trim();
  if (s && !looksLikeUuid(s)) return s;
  return "Stream";
}

export function displayPhaseName(
  gateId: string | null | undefined,
  gateLabels?: Map<string, string>,
  unassigned = "Unassigned phase",
) {
  if (!gateId) return unassigned;
  const g = String(gateLabels?.get(gateId) || "").trim();
  if (g && !looksLikeUuid(g)) return g;
  return "Phase";
}

/** Prefer a real projects.id; if project_id is missing/unknown, use the stream's project. */
export function resolveLinkedProjectId(opts: {
  projectId?: string | null;
  streamId?: string | null;
  projectsById: Map<string, { id: string }>;
  streamProjectById?: Map<string, string>;
}): string | null {
  const pid = opts.projectId || null;
  if (pid && opts.projectsById.has(pid)) return pid;
  const fromStream = opts.streamId ? opts.streamProjectById?.get(opts.streamId) : undefined;
  if (fromStream && opts.projectsById.has(fromStream)) return fromStream;
  if (pid && opts.streamProjectById?.has(pid)) {
    const via = opts.streamProjectById.get(pid);
    if (via && opts.projectsById.has(via)) return via;
  }
  return fromStream || pid;
}

/** If stream_id is missing/stale, recover it when project_id was actually a stream UUID. */
export function resolveLinkedStreamId(opts: {
  projectId?: string | null;
  streamId?: string | null;
  streamProjectById?: Map<string, string>;
}): string | null {
  const sid = opts.streamId || null;
  if (sid && opts.streamProjectById?.has(sid)) return sid;
  const pid = opts.projectId || null;
  if (pid && opts.streamProjectById?.has(pid)) return pid;
  return sid;
}

export type PvaGrain =
  "resource" | "project" | "stream" | "stage_gate" | "program" | "portfolio" | "month";

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
  /** Hours from resource_allocations. */
  planned_hours: number;
  planned_percent: number;
  /** Hours demanded by work-item planned hours. */
  demand_hours: number;
  actual_hours: number;
  /** Approved timesheet hours booked to projects / work items. */
  billable_hours: number;
  /** Approved non-billable / unallocated timesheet hours (no work item). */
  non_billable_hours: number;
  variance_hours: number;
  /** Allocated plan − work-item demand. */
  demand_gap_hours: number;
  utilization_pct: number | null;
  status: "Over" | "Optimal" | "Under" | "Unplanned";
  /** Actual FTE $ from timesheets. */
  labor_cost: number;
  /** Planned FTE $ from work items × rates. */
  planned_labor_cost: number;
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

export function allocationStatus(
  plannedPct: number,
  actualHours: number,
  plannedHours: number,
): AllocationPvaRow["status"] {
  if (plannedHours <= 0 && actualHours > 0) return "Unplanned";
  const pct = plannedHours > 0 ? (actualHours / plannedHours) * 100 : plannedPct;
  if (pct > 110 || plannedPct > 100) return "Over";
  if (pct >= 60 || plannedPct >= 60) return "Optimal";
  return "Under";
}

/** Planned hours from an allocation row (estimation hours; else % of monthly FTE). */
export function hoursFromAllocation(a: AllocationPlanRow, capacityHoursWeek = 40): number {
  const explicit = num(a.allocated_hours);
  if (explicit > 0) return explicit;
  // ~4.33 weeks/month × weekly capacity × allocation %
  return Math.round(((capacityHoursWeek * 4.33 * num(a.allocation_percent)) / 100) * 100) / 100;
}

/**
 * Whether an allocation row applies to a work-item / analytics lane.
 *
 * Hierarchical: a blank stream/gate on the allocation is a wider pool that
 * rolls into more specific work items. A blank stream/gate on the work item
 * only matches equally blank allocations (avoids double-counting stream rows
 * into a project-only view).
 */
export function allocationMatchesLane(
  a: Pick<AllocationPlanRow, "project_id" | "stream_id" | "stage_gate_id" | "period_month">,
  opts: {
    projectId: string;
    streamId?: string | null;
    stageGateId?: string | null;
    periodMonth?: string | null;
  },
): boolean {
  if (a.project_id !== opts.projectId) return false;
  const aStream = a.stream_id || null;
  const wantStream = opts.streamId || null;
  if (wantStream) {
    if (aStream && aStream !== wantStream) return false;
  } else if (aStream) {
    return false;
  }
  const aGate = a.stage_gate_id || null;
  const wantGate = opts.stageGateId || null;
  if (wantGate) {
    // Stream/project-level allocations (no gate) still feed gated work items.
    if (aGate && aGate !== wantGate) return false;
  } else if (aGate) {
    return false;
  }
  const month = opts.periodMonth ? normMonth(opts.periodMonth) : null;
  if (month && normMonth(a.period_month) !== month) return false;
  return true;
}

/**
 * Sum planned resource-allocation hours for a project / stream / stage-gate lane.
 * When `periodMonth` is set (YYYY-MM-01), only that month is included.
 * Updates to Resource Allocations (Hours / Allocation %) flow here — not into
 * work_items.estimate_hours (that stays demand).
 */
export function sumLaneAllocatedHours(
  plans: AllocationPlanRow[],
  opts: {
    projectId: string;
    streamId?: string | null;
    stageGateId?: string | null;
    periodMonth?: string | null;
  },
): number {
  return plans.reduce((sum, a) => {
    if (!allocationMatchesLane(a, opts)) return sum;
    return sum + hoursFromAllocation(a);
  }, 0);
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
  demand_hours: number;
  actual_hours: number;
  billable_hours: number;
  non_billable_hours: number;
  labor_cost: number;
  planned_labor_cost: number;
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
  /** Work-item demand + planned FTE $ (optional). */
  demand?: WorkItemDemandSlice[];
  projectsById: Map<string, ProjectMeta>;
  resourceNames?: Map<string, string>;
  streamLabels?: Map<string, string>;
  gateLabels?: Map<string, string>;
  capacityByResource?: Map<string, number>;
  /** stream id → project id, to recover labels when timesheets store a stale project_id. */
  streamProjectById?: Map<string, string>;
}): AllocationPvaRow[] {
  const {
    grain,
    plans,
    actuals,
    demand = [],
    projectsById,
    resourceNames,
    streamLabels,
    gateLabels,
    capacityByResource,
    streamProjectById,
  } = opts;
  const acc = new Map<string, Agg>();

  const touch = (
    partial: Omit<
      Agg,
      | "planned_hours"
      | "planned_percent"
      | "demand_hours"
      | "actual_hours"
      | "billable_hours"
      | "non_billable_hours"
      | "labor_cost"
      | "planned_labor_cost"
    > &
      Partial<Agg>,
  ) => {
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
      demand_hours: 0,
      actual_hours: 0,
      billable_hours: 0,
      non_billable_hours: 0,
      labor_cost: 0,
      planned_labor_cost: 0,
    };
    cur.planned_hours += num(partial.planned_hours);
    cur.planned_percent += num(partial.planned_percent);
    cur.demand_hours += num(partial.demand_hours);
    cur.actual_hours += num(partial.actual_hours);
    cur.billable_hours += num(partial.billable_hours);
    cur.non_billable_hours += num(partial.non_billable_hours);
    cur.labor_cost += num(partial.labor_cost);
    cur.planned_labor_cost += num(partial.planned_labor_cost);
    acc.set(partial.key, cur);
  };

  for (const a of plans) {
    const projectId = resolveLinkedProjectId({
      projectId: a.project_id,
      streamId: a.stream_id,
      projectsById,
      streamProjectById,
    });
    const streamId = resolveLinkedStreamId({
      projectId: a.project_id,
      streamId: a.stream_id,
      streamProjectById,
    });
    const p = projectId ? projectsById.get(projectId) : undefined;
    const month = normMonth(a.period_month);
    const cap = capacityByResource?.get(a.resource_id) ?? 40;
    const key = grainKey(grain, {
      resourceId: a.resource_id,
      projectId,
      streamId,
      stageGateId: a.stage_gate_id,
      program: p?.program,
      portfolio: p?.portfolio,
      month,
    });
    const label = labelFor(grain, {
      resourceId: a.resource_id,
      projectId,
      streamId,
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
      project_id: projectId,
      stream_id: streamId,
      stage_gate_id: a.stage_gate_id,
      program: p?.program,
      portfolio: p?.portfolio,
      period_month: month,
      planned_hours: hoursFromAllocation(a, cap),
      planned_percent: num(a.allocation_percent),
    });
  }

  for (const d of demand) {
    if (!d.project_id && grain !== "resource" && grain !== "month") continue;
    const projectId = resolveLinkedProjectId({
      projectId: d.project_id,
      streamId: d.stream_id,
      projectsById,
      streamProjectById,
    });
    const streamId = resolveLinkedStreamId({
      projectId: d.project_id,
      streamId: d.stream_id,
      streamProjectById,
    });
    const p = projectId ? projectsById.get(projectId) : undefined;
    const month = normMonth(d.period_month);
    const key = grainKey(grain, {
      resourceId: d.resource_id,
      projectId,
      streamId,
      stageGateId: d.stage_gate_id,
      program: p?.program,
      portfolio: p?.portfolio,
      month,
    });
    const label = labelFor(grain, {
      resourceId: d.resource_id,
      projectId,
      streamId,
      stageGateId: d.stage_gate_id,
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
      resource_id: d.resource_id,
      project_id: projectId,
      stream_id: streamId,
      stage_gate_id: d.stage_gate_id,
      program: p?.program,
      portfolio: p?.portfolio,
      period_month: month,
      demand_hours: num(d.demand_hours),
      planned_labor_cost: num(d.planned_labor_cost),
    });
  }

  for (const e of actuals) {
    const isBillable = e.billable !== false && Boolean(e.project_id || e.stream_id);
    const linkedId = resolveLinkedProjectId({
      projectId: e.project_id,
      streamId: e.stream_id,
      projectsById,
      streamProjectById,
    });
    const linkedStreamId = resolveLinkedStreamId({
      projectId: e.project_id,
      streamId: e.stream_id,
      streamProjectById,
    });
    // Non-billable / unallocated (no project/work item) still rolls into resource & month grains,
    // and appears under a dedicated bucket for project/stream/gate views.
    const projectId =
      linkedId ||
      e.project_id ||
      (grain === "project" || grain === "stream" || grain === "stage_gate"
        ? "__non_billable__"
        : null);
    if (!projectId && grain !== "resource" && grain !== "month") continue;
    const p =
      projectId && projectId !== "__non_billable__" ? projectsById.get(projectId) : undefined;
    const month = normMonth(e.period_month);
    const streamId = isBillable ? linkedStreamId : null;
    const key = grainKey(grain, {
      resourceId: e.resource_id,
      projectId,
      streamId,
      stageGateId: isBillable ? e.stage_gate_id : null,
      program: p?.program ?? (projectId === "__non_billable__" ? "Non-billable" : null),
      portfolio: p?.portfolio ?? (projectId === "__non_billable__" ? "Non-billable" : null),
      month,
    });
    const label =
      projectId === "__non_billable__" &&
      (grain === "project" || grain === "stream" || grain === "stage_gate")
        ? "Non-billable / unallocated"
        : labelFor(grain, {
            resourceId: e.resource_id,
            projectId,
            streamId,
            stageGateId: e.stage_gate_id,
            program: p?.program,
            portfolio: p?.portfolio,
            month,
            projectsById,
            resourceNames,
            streamLabels,
            gateLabels,
          });
    const hrs = num(e.hours);
    touch({
      key,
      label,
      resource_id: e.resource_id,
      project_id: projectId === "__non_billable__" ? null : projectId,
      stream_id: streamId,
      stage_gate_id: isBillable ? e.stage_gate_id : null,
      program: p?.program ?? (projectId === "__non_billable__" ? "Non-billable" : null),
      portfolio: p?.portfolio ?? (projectId === "__non_billable__" ? "Non-billable" : null),
      period_month: month,
      actual_hours: hrs,
      billable_hours: isBillable ? hrs : 0,
      non_billable_hours: isBillable ? 0 : hrs,
      labor_cost: num(e.labor_cost),
    });
  }

  return Array.from(acc.values())
    .map((r) => {
      const variance = Math.round((r.planned_hours - r.actual_hours) * 100) / 100;
      const demandGap = Math.round((r.planned_hours - r.demand_hours) * 100) / 100;
      const util =
        r.planned_hours > 0 ? Math.round((r.actual_hours / r.planned_hours) * 1000) / 10 : null;
      return {
        ...r,
        planned_hours: Math.round(r.planned_hours * 100) / 100,
        planned_percent: Math.round(r.planned_percent * 10) / 10,
        demand_hours: Math.round(r.demand_hours * 100) / 100,
        actual_hours: Math.round(r.actual_hours * 100) / 100,
        billable_hours: Math.round(r.billable_hours * 100) / 100,
        non_billable_hours: Math.round(r.non_billable_hours * 100) / 100,
        variance_hours: variance,
        demand_gap_hours: demandGap,
        utilization_pct: util,
        status: allocationStatus(r.planned_percent, r.actual_hours, r.planned_hours),
        labor_cost: Math.round(r.labor_cost * 100) / 100,
        planned_labor_cost: Math.round(r.planned_labor_cost * 100) / 100,
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
  const pName = displayProjectName(p, opts.projectId);
  switch (grain) {
    case "resource":
      return (
        opts.resourceNames?.get(opts.resourceId || "") ||
        (looksLikeUuid(opts.resourceId) ? "Unknown resource" : opts.resourceId) ||
        "—"
      );
    case "project":
      return pName;
    case "stream":
      return `${pName} · ${displayStreamName(opts.streamId, opts.streamLabels)}`;
    case "stage_gate":
      return `${pName} · ${displayStreamName(opts.streamId, opts.streamLabels)} · ${displayPhaseName(
        opts.stageGateId,
        opts.gateLabels,
        "Unassigned gate",
      )}`;
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
