/**
 * FY Allocation is the approved budget for a project in a financial year —
 * a subset of the lifetime envelope (project / stream budget).
 *
 * When an FY is selected, Budget = those allocation rows.
 * Plan / Actual / Forecast for that year come from monthly cashflow in the
 * FY month window (Estimation Plan, incurred, outlook).
 * If Plan, Actual, or Forecast exceeds that year's allocation, finance health flags.
 */

import { fyOf } from "@/lib/project-dates";
import {
  fyAllocBudget,
  fyAllocCapex,
  fyAllocOpex,
  projectApprovedFunding,
  type FyAllocationLike,
  type ProjectFinanceLike,
} from "@/lib/project-finance";
import {
  monthKey,
  monthsForFyLabel,
  type MonthlyFinanceRow,
} from "@/lib/finance-lifecycle";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type FyAllocRowLike = FyAllocationLike & {
  project_id?: string | null;
  fy?: string | null;
};

export type FyYearWatch = {
  fy: string;
  allocation: number;
  allocCapex: number;
  allocOpex: number;
  plan: number;
  planCapex: number;
  planOpex: number;
  actual: number;
  actualCapex: number;
  actualOpex: number;
  forecast: number;
  forecastCapex: number;
  forecastOpex: number;
  peak: number;
  peakSource: "plan" | "actual" | "forecast";
  overBy: number;
  capexOverBy: number;
  opexOverBy: number;
};

/** Lifetime envelope. FY allocations must not present as more than this. */
export function overallProjectBudget(p: ProjectFinanceLike | null | undefined): number {
  return projectApprovedFunding(p);
}

/** Cap a year's (or years') allocation so it stays a subset of the envelope. */
export function capAllocationToOverall(allocated: number, overall: number): number {
  if (overall > 0) return Math.min(Math.max(0, allocated), overall);
  return Math.max(0, allocated);
}

export function monthlyLayerSplit(
  rows: MonthlyFinanceRow[],
  layer: "planned" | "actual" | "forecast",
): { capex: number; opex: number; total: number } {
  const capexKey =
    layer === "planned" ? "capex_planned" : layer === "actual" ? "capex_actual" : "capex_forecast";
  const opexKey =
    layer === "planned" ? "opex_planned" : layer === "actual" ? "opex_actual" : "opex_forecast";
  const capex = rows.reduce((s, r) => s + num((r as any)[capexKey]), 0);
  const opex = rows.reduce((s, r) => s + num((r as any)[opexKey]), 0);
  return { capex, opex, total: capex + opex };
}

export function sumFyAllocCapex(
  rows: FyAllocRowLike[] | null | undefined,
  fys?: string[] | null,
  project?: ProjectFinanceLike | null,
): number {
  const set = fys?.length ? new Set(fys) : null;
  return (rows ?? []).reduce((s, a) => {
    if (set && !set.has(String(a.fy || ""))) return s;
    return s + fyAllocCapex(a, project);
  }, 0);
}

export function sumFyAllocOpex(
  rows: FyAllocRowLike[] | null | undefined,
  fys?: string[] | null,
  project?: ProjectFinanceLike | null,
): number {
  const set = fys?.length ? new Set(fys) : null;
  return (rows ?? []).reduce((s, a) => {
    if (set && !set.has(String(a.fy || ""))) return s;
    return s + fyAllocOpex(a, project);
  }, 0);
}

export function sumFyAllocBudget(
  rows: FyAllocRowLike[] | null | undefined,
  fys?: string[] | null,
): number {
  const set = fys?.length ? new Set(fys) : null;
  return (rows ?? []).reduce((s, a) => {
    if (set && !set.has(String(a.fy || ""))) return s;
    return s + fyAllocBudget(a);
  }, 0);
}

/** FY labels whose month windows include this calendar month. */
export function fyLabelForMonth(period: string, fyStartMonth: number): string | null {
  return fyOf(monthKey(period), fyStartMonth);
}

export function monthKeysForFyLabels(fys: string[], fyStartMonth?: number | null): Set<string> {
  const out = new Set<string>();
  for (const fy of fys) {
    for (const m of monthsForFyLabel(fy, fyStartMonth)) out.add(m);
  }
  return out;
}

export function monthlyInFyLabels<T extends { period_month?: string | Date | null }>(
  rows: T[],
  fys: string[],
  fyStartMonth?: number | null,
): T[] {
  if (!fys.length) return rows;
  const months = monthKeysForFyLabels(fys, fyStartMonth);
  return rows.filter((r) => months.has(monthKey(String(r.period_month || ""))));
}

/** Every FY label spanned by a schedule window (inclusive months). */
export function fyLabelsSpanned(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  fyStartMonth: number,
): string[] {
  const start = String(startIso || "").slice(0, 10);
  const end = String(endIso || "").slice(0, 10) || start;
  if (!start) return [];
  const out = new Set<string>();
  const d = new Date(`${start.slice(0, 7)}-01T00:00:00`);
  const last = new Date(`${end.slice(0, 7)}-01T00:00:00`);
  if (isNaN(d.getTime()) || isNaN(last.getTime())) {
    const a = fyOf(start, fyStartMonth);
    const b = fyOf(end, fyStartMonth);
    return [a, b].filter((x, i, arr): x is string => !!x && arr.indexOf(x) === i);
  }
  let guard = 0;
  while (d <= last && guard < 240) {
    const lab = fyOf(d.toISOString().slice(0, 10), fyStartMonth);
    if (lab) out.add(lab);
    d.setMonth(d.getMonth() + 1);
    guard += 1;
  }
  return [...out];
}

export function projectTouchesSelectedFy(
  project: {
    id?: string;
    start_date?: string | null;
    end_date?: string | null;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    actual_start_date?: string | null;
    actual_end_date?: string | null;
  },
  fySelected: string[],
  fyStartMonth: number,
  allocations: FyAllocRowLike[] = [],
): boolean {
  if (!fySelected.length) return true;
  const set = new Set(fySelected);
  const pid = project.id;
  if (pid && allocations.some((a) => a.project_id === pid && set.has(String(a.fy || "")))) {
    return true;
  }
  const start =
    project.actual_start_date || project.planned_start_date || project.start_date || null;
  const end = project.actual_end_date || project.planned_end_date || project.end_date || null;
  return fyLabelsSpanned(start, end, fyStartMonth).some((fy) => set.has(fy));
}

function peakOf(plan: number, actual: number, forecast: number): {
  peak: number;
  peakSource: "plan" | "actual" | "forecast";
} {
  if (plan >= actual && plan >= forecast) return { peak: plan, peakSource: "plan" };
  if (actual >= plan && actual >= forecast) return { peak: actual, peakSource: "actual" };
  return { peak: forecast, peakSource: "forecast" };
}

/** One watch row per FY allocation (and years that have monthly $ but no allocation). */
export function fyYearWatches(opts: {
  allocations: FyAllocRowLike[];
  monthly: MonthlyFinanceRow[];
  fyStartMonth?: number | null;
  overallBudget?: number;
  project?: ProjectFinanceLike | null;
}): FyYearWatch[] {
  const fyStartMonth = opts.fyStartMonth ?? 4;
  const overall = num(opts.overallBudget);
  const byFy = new Map<
    string,
    { allocation: number; allocCapex: number; allocOpex: number; months: MonthlyFinanceRow[] }
  >();

  for (const a of opts.allocations) {
    const fy = String(a.fy || "").trim();
    if (!fy) continue;
    const cur = byFy.get(fy) || { allocation: 0, allocCapex: 0, allocOpex: 0, months: [] };
    cur.allocation += fyAllocBudget(a);
    cur.allocCapex += fyAllocCapex(a, opts.project);
    cur.allocOpex += fyAllocOpex(a, opts.project);
    byFy.set(fy, cur);
  }

  for (const row of opts.monthly) {
    const fy = fyLabelForMonth(String(row.period_month || ""), fyStartMonth);
    if (!fy) continue;
    const cur = byFy.get(fy) || { allocation: 0, allocCapex: 0, allocOpex: 0, months: [] };
    cur.months.push(row);
    byFy.set(fy, cur);
  }

  const watches: FyYearWatch[] = [];
  for (const [fy, cur] of byFy) {
    const allocation = capAllocationToOverall(cur.allocation, overall || cur.allocation);
    const allocCapex = capAllocationToOverall(cur.allocCapex, overall || cur.allocCapex);
    const allocOpex = capAllocationToOverall(cur.allocOpex, overall || cur.allocOpex);
    const planSplit = monthlyLayerSplit(cur.months, "planned");
    const actualSplit = monthlyLayerSplit(cur.months, "actual");
    const forecastSplit = monthlyLayerSplit(cur.months, "forecast");
    if (
      allocation <= 0 &&
      planSplit.total <= 0 &&
      actualSplit.total <= 0 &&
      forecastSplit.total <= 0
    ) {
      continue;
    }
    const { peak, peakSource } = peakOf(planSplit.total, actualSplit.total, forecastSplit.total);
    const capexPeak = Math.max(planSplit.capex, actualSplit.capex, forecastSplit.capex);
    const opexPeak = Math.max(planSplit.opex, actualSplit.opex, forecastSplit.opex);
    watches.push({
      fy,
      allocation,
      allocCapex,
      allocOpex,
      plan: planSplit.total,
      planCapex: planSplit.capex,
      planOpex: planSplit.opex,
      actual: actualSplit.total,
      actualCapex: actualSplit.capex,
      actualOpex: actualSplit.opex,
      forecast: forecastSplit.total,
      forecastCapex: forecastSplit.capex,
      forecastOpex: forecastSplit.opex,
      peak,
      peakSource,
      overBy: peak - allocation,
      capexOverBy: capexPeak - allocCapex,
      opexOverBy: opexPeak - allocOpex,
    });
  }
  return watches.sort((a, b) => a.fy.localeCompare(b.fy));
}

export function worstFyOverAllocation(watches: FyYearWatch[]): FyYearWatch | null {
  let worst: FyYearWatch | null = null;
  let worstRatio = 0;
  for (const w of watches) {
    if (w.allocation <= 0) continue;
    const totalRatio = w.overBy > 0 ? w.overBy / w.allocation : 0;
    const capexRatio =
      w.capexOverBy > 0 ? w.capexOverBy / Math.max(w.allocCapex, w.allocation * 0.01) : 0;
    const opexRatio =
      w.opexOverBy > 0 ? w.opexOverBy / Math.max(w.allocOpex, w.allocation * 0.01) : 0;
    const ratio = Math.max(totalRatio, capexRatio, opexRatio);
    if (ratio <= 0) continue;
    if (!worst || ratio > worstRatio) {
      worst = w;
      worstRatio = ratio;
    }
  }
  return worst;
}

/** Budget shown when FY chips are selected: allocation for those years, capped to overall. */
export function fyScopedBudget(opts: {
  allocations: FyAllocRowLike[];
  overallBudget: number;
  fySelected: string[];
}): number {
  if (!opts.fySelected.length) return opts.overallBudget;
  return capAllocationToOverall(sumFyAllocBudget(opts.allocations, opts.fySelected), opts.overallBudget);
}

/** True when stored FY allocation $ sums above the lifetime envelope. */
export function fyEnvelopeOverAllocation(opts: {
  allocations: FyAllocRowLike[] | null | undefined;
  overallBudget: number;
}): { allocated: number; overall: number; overBy: number } | null {
  const overall = num(opts.overallBudget);
  const allocated = sumFyAllocBudget(opts.allocations);
  if (overall <= 0 || allocated <= overall * 1.005) return null;
  return { allocated, overall, overBy: allocated - overall };
}
