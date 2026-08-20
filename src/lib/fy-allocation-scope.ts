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
  projectApprovedFunding,
  type FyAllocationLike,
  type ProjectFinanceLike,
} from "@/lib/project-finance";
import {
  monthKey,
  monthsForFyLabel,
  sumMonthlyActual,
  sumMonthlyForecast,
  sumMonthlyPlanned,
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
  plan: number;
  actual: number;
  forecast: number;
  peak: number;
  peakSource: "plan" | "actual" | "forecast";
  overBy: number;
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
}): FyYearWatch[] {
  const fyStartMonth = opts.fyStartMonth ?? 4;
  const overall = num(opts.overallBudget);
  const byFy = new Map<string, { allocation: number; months: MonthlyFinanceRow[] }>();

  for (const a of opts.allocations) {
    const fy = String(a.fy || "").trim();
    if (!fy) continue;
    const cur = byFy.get(fy) || { allocation: 0, months: [] };
    cur.allocation += fyAllocBudget(a);
    byFy.set(fy, cur);
  }

  for (const row of opts.monthly) {
    const fy = fyLabelForMonth(String(row.period_month || ""), fyStartMonth);
    if (!fy) continue;
    const cur = byFy.get(fy) || { allocation: 0, months: [] };
    cur.months.push(row);
    byFy.set(fy, cur);
  }

  const watches: FyYearWatch[] = [];
  for (const [fy, cur] of byFy) {
    const allocation = capAllocationToOverall(cur.allocation, overall || cur.allocation);
    const plan = sumMonthlyPlanned(cur.months);
    const actual = sumMonthlyActual(cur.months);
    const forecast = sumMonthlyForecast(cur.months);
    if (allocation <= 0 && plan <= 0 && actual <= 0 && forecast <= 0) continue;
    const { peak, peakSource } = peakOf(plan, actual, forecast);
    watches.push({
      fy,
      allocation,
      plan,
      actual,
      forecast,
      peak,
      peakSource,
      overBy: peak - allocation,
    });
  }
  return watches.sort((a, b) => a.fy.localeCompare(b.fy));
}

export function worstFyOverAllocation(watches: FyYearWatch[]): FyYearWatch | null {
  let worst: FyYearWatch | null = null;
  for (const w of watches) {
    if (w.allocation <= 0 || w.overBy <= 0) continue;
    if (!worst || w.overBy / w.allocation > worst.overBy / Math.max(worst.allocation, 1)) {
      worst = w;
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
