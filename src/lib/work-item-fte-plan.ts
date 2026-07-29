/**
 * Work-item → demand hours + planned FTE cost.
 *
 * Planned hours: work_items.estimate_hours (split across assignees).
 * Planned FTE $: share_hours × resources.cost_rate.
 * Does NOT overwrite resource_allocations — use as demand rollup vs allocated plan.
 *
 * Month attribution: spread evenly across months from planned_start → planned_end
 * (inclusive). Missing dates → current calendar month so monthly finance can store it.
 */

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function normMonth(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v).slice(0, 10);
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[1]}-${m[2]}-01`;
}

export type WorkItemPlanInput = {
  id: string;
  project_id: string;
  stream_id?: string | null;
  stage_gate_id?: string | null;
  estimate_hours?: number | null;
  planned_start?: string | null;
  planned_end?: string | null;
  status?: string | null;
  owner_user_id?: string | null;
};

export type WorkItemAssigneeLink = {
  work_item_id: string;
  resource_id: string;
};

export type ResourceRateRow = {
  id: string;
  user_id?: string | null;
  cost_rate?: number | null;
};

/** One slice of demand attributed to a resource (+ optional month). */
export type WorkItemDemandSlice = {
  project_id: string;
  stream_id: string | null;
  stage_gate_id: string | null;
  resource_id: string | null;
  period_month: string;
  demand_hours: number;
  planned_labor_cost: number;
  work_item_id: string;
};

export function monthKeysInclusive(
  start?: string | null,
  end?: string | null,
  fallbackToday = true,
): string[] {
  const a = start ? normMonth(start) : "";
  const b = end ? normMonth(end) : "";
  let from = a || b;
  let to = b || a;
  if (!from || !to) {
    if (!fallbackToday) return [];
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return [cur];
  }
  if (from > to) [from, to] = [to, from];
  const out: string[] = [];
  const [fy, fm] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 120) break;
  }
  return out.length ? out : [from];
}

function assigneeIdsForItem(
  wi: WorkItemPlanInput,
  assigneesByWi: Map<string, string[]>,
  resources: ResourceRateRow[],
): string[] {
  const linked = assigneesByWi.get(wi.id) || [];
  if (linked.length) return linked;
  if (wi.owner_user_id) {
    const owner = resources.find((r) => r.user_id && r.user_id === wi.owner_user_id);
    if (owner) return [owner.id];
  }
  return [];
}

/**
 * Expand work items into demand slices (hours + planned FTE $) by
 * project / stream / stage gate / resource / month.
 */
export function buildWorkItemDemandSlices(opts: {
  workItems: WorkItemPlanInput[];
  assignees: WorkItemAssigneeLink[];
  resources: ResourceRateRow[];
}): WorkItemDemandSlice[] {
  const { workItems, assignees, resources } = opts;
  const rateById = new Map(resources.map((r) => [r.id, num(r.cost_rate)]));
  const assigneesByWi = new Map<string, string[]>();
  for (const a of assignees) {
    if (!a.resource_id || !a.work_item_id) continue;
    const list = assigneesByWi.get(a.work_item_id) || [];
    list.push(a.resource_id);
    assigneesByWi.set(a.work_item_id, list);
  }

  const out: WorkItemDemandSlice[] = [];
  for (const wi of workItems) {
    if (!wi.project_id) continue;
    if (wi.status === "Cancelled") continue;
    const hours = num(wi.estimate_hours);
    if (hours <= 0) continue;

    const months = monthKeysInclusive(wi.planned_start, wi.planned_end);
    const perMonth = hours / months.length;
    const resourceIds = assigneeIdsForItem(wi, assigneesByWi, resources);
    const shares =
      resourceIds.length > 0
        ? resourceIds.map((rid) => ({
            resource_id: rid,
            hours: perMonth / resourceIds.length,
            rate: rateById.get(rid) ?? 0,
          }))
        : [{ resource_id: null as string | null, hours: perMonth, rate: 0 }];

    for (const month of months) {
      for (const share of shares) {
        out.push({
          project_id: wi.project_id,
          stream_id: wi.stream_id || null,
          stage_gate_id: wi.stage_gate_id || null,
          resource_id: share.resource_id,
          period_month: month,
          demand_hours: Math.round(share.hours * 100) / 100,
          planned_labor_cost: Math.round(share.hours * share.rate * 100) / 100,
          work_item_id: wi.id,
        });
      }
    }
  }
  return out;
}

/** Σ demand hours for a project / stream / stage-gate lane (all months). */
export function sumLaneDemandHours(
  slices: WorkItemDemandSlice[],
  opts: {
    projectId: string;
    streamId?: string | null;
    stageGateId?: string | null;
    periodMonth?: string | null;
  },
): number {
  const month = opts.periodMonth ? normMonth(opts.periodMonth) : null;
  return slices.reduce((sum, s) => {
    if (s.project_id !== opts.projectId) return sum;
    const wantStream = opts.streamId || null;
    if (wantStream && (s.stream_id || null) !== wantStream) return sum;
    if (!wantStream && s.stream_id) return sum;
    const wantGate = opts.stageGateId || null;
    if (wantGate && (s.stage_gate_id || null) !== wantGate) return sum;
    if (!wantGate && s.stage_gate_id) return sum;
    if (month && normMonth(s.period_month) !== month) return sum;
    return sum + s.demand_hours;
  }, 0);
}

/** Σ planned FTE $ for a lane. */
export function sumLanePlannedFteCost(
  slices: WorkItemDemandSlice[],
  opts: {
    projectId: string;
    streamId?: string | null;
    stageGateId?: string | null;
    periodMonth?: string | null;
  },
): number {
  const month = opts.periodMonth ? normMonth(opts.periodMonth) : null;
  return slices.reduce((sum, s) => {
    if (s.project_id !== opts.projectId) return sum;
    const wantStream = opts.streamId || null;
    if (wantStream && (s.stream_id || null) !== wantStream) return sum;
    if (!wantStream && s.stream_id) return sum;
    const wantGate = opts.stageGateId || null;
    if (wantGate && (s.stage_gate_id || null) !== wantGate) return sum;
    if (!wantGate && s.stage_gate_id) return sum;
    if (month && normMonth(s.period_month) !== month) return sum;
    return sum + s.planned_labor_cost;
  }, 0);
}

/** Aggregate slices → monthly opex_labor_planned rows (project + stream + month). */
export function aggregateOpexLaborPlannedByMonth(slices: WorkItemDemandSlice[]): Array<{
  project_id: string;
  stream_id: string | null;
  period_month: string;
  opex_labor_planned: number;
  demand_hours: number;
}> {
  const map = new Map<
    string,
    {
      project_id: string;
      stream_id: string | null;
      period_month: string;
      opex_labor_planned: number;
      demand_hours: number;
    }
  >();
  for (const s of slices) {
    const stream = s.stream_id || null;
    const month = normMonth(s.period_month);
    const key = `${s.project_id}|${stream ?? "∅"}|${month}`;
    const cur = map.get(key) || {
      project_id: s.project_id,
      stream_id: stream,
      period_month: month,
      opex_labor_planned: 0,
      demand_hours: 0,
    };
    cur.opex_labor_planned += s.planned_labor_cost;
    cur.demand_hours += s.demand_hours;
    map.set(key, cur);
  }
  return Array.from(map.values()).map((r) => ({
    ...r,
    opex_labor_planned: Math.round(r.opex_labor_planned * 100) / 100,
    demand_hours: Math.round(r.demand_hours * 100) / 100,
  }));
}
