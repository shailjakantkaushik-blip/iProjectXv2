/**
 * Planned → Actual → Compare finance lifecycle.
 *
 * Plan:     FY Allocation (budget + forecast by year)
 *             ↓ cascadeMonthlyFromFyPlan
 *           financials_monthly.*_planned / *_forecast
 * Execute:  financials_monthly.*_actual (source of truth for spend)
 *             ↓ syncProjectIncurredFromMonthly
 *           projects.capex_incurred / opex_incurred
 * Compare:  monthly + phase windows (gate dates) planned vs actual vs forecast
 */

import { supabase } from "@/integrations/supabase/client";
import { fyMonthIndex, fyStartFor } from "@/lib/fiscal-year";
import {
  fyAllocBudget,
  fyAllocForecast,
  splitCapexOpex,
  type FyAllocationLike,
  type ProjectFinanceLike,
} from "@/lib/project-finance";
import type { StageGateLike } from "@/lib/project-phase";
import { sortGatesByOrgOrder } from "@/lib/project-phase";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type MonthlyFinanceRow = {
  project_id: string;
  period_month: string;
  capex_planned?: number | null;
  capex_actual?: number | null;
  capex_forecast?: number | null;
  opex_planned?: number | null;
  opex_actual?: number | null;
  opex_forecast?: number | null;
  benefits_planned?: number | null;
  benefits_actual?: number | null;
};

/** Parse FY26 / FY2026 → ending calendar year (2026). */
export function parseFyEndingYear(fy: string | null | undefined): number | null {
  if (!fy) return null;
  const m = /FY\s*(\d{2,4})/i.exec(fy.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (n >= 100) return n;
  // 2-digit: 00–69 → 2000s, 70–99 → 1900s (PMO horizon)
  return n >= 70 ? 1900 + n : 2000 + n;
}

/** Inclusive month starts (YYYY-MM-01) for an FY label. */
export function monthsForFyLabel(
  fy: string,
  fyStartMonth?: number | null,
): string[] {
  const endYear = parseFyEndingYear(fy);
  if (!endYear) return [];
  const startIdx = fyMonthIndex(fyStartMonth);
  // FY ends in `endYear` just before fy start month → start is previous calendar year at fyStart
  const start = new Date(endYear - 1, startIdx, 1);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
    );
  }
  return out;
}

export function monthKey(iso: string | Date): string {
  if (iso instanceof Date) {
    return `${iso.getFullYear()}-${String(iso.getMonth() + 1).padStart(2, "0")}-01`;
  }
  const s = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return `${s.slice(0, 7)}-01`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function sumMonthlyPlanned(rows: MonthlyFinanceRow[]): number {
  return rows.reduce(
    (s, r) => s + num(r.capex_planned) + num(r.opex_planned),
    0,
  );
}

export function sumMonthlyActual(rows: MonthlyFinanceRow[]): number {
  return rows.reduce(
    (s, r) => s + num(r.capex_actual) + num(r.opex_actual),
    0,
  );
}

export function sumMonthlyForecast(rows: MonthlyFinanceRow[]): number {
  return rows.reduce(
    (s, r) => s + num(r.capex_forecast) + num(r.opex_forecast),
    0,
  );
}

/**
 * Distribute FY budget/forecast into monthly planned/forecast rows.
 * Preserves existing actuals. Months outside project schedule are skipped when
 * start/end are provided; otherwise all 12 FY months are used.
 */
export async function cascadeMonthlyFromFyPlan(opts: {
  orgId: string;
  projectId: string;
  project: ProjectFinanceLike & {
    start_date?: string | null;
    end_date?: string | null;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    actual_start_date?: string | null;
    actual_end_date?: string | null;
  };
  allocations: FyAllocationLike[];
  fyStartMonth?: number | null;
}): Promise<{ monthsUpserted: number }> {
  const { orgId, projectId, project, allocations, fyStartMonth } = opts;
  const startIso =
    project.actual_start_date ||
    project.planned_start_date ||
    project.start_date ||
    null;
  const endIso =
    project.actual_end_date ||
    project.planned_end_date ||
    project.end_date ||
    null;
  const startBound = startIso ? monthKey(startIso) : null;
  const endBound = endIso ? monthKey(endIso) : null;

  const { data: existing } = await supabase
    .from("financials_monthly")
    .select("*")
    .eq("project_id", projectId);
  const byMonth = new Map(
    (existing ?? []).map((r: any) => [monthKey(r.period_month), r]),
  );

  let upserted = 0;
  for (const a of allocations) {
    const fy = String((a as any).fy || "");
    if (!fy) continue;
    const budget = fyAllocBudget(a);
    const forecast = fyAllocForecast(a);
    let months = monthsForFyLabel(fy, fyStartMonth);
    if (startBound || endBound) {
      months = months.filter((m) => {
        if (startBound && m < startBound) return false;
        if (endBound && m > endBound) return false;
        return true;
      });
    }
    if (!months.length) continue;
    const bEach = budget / months.length;
    const fEach = forecast / months.length;
    const bSplit = splitCapexOpex(bEach, project);
    const fSplit = splitCapexOpex(fEach, project);

    for (const m of months) {
      const prev = byMonth.get(m);
      const row = {
        org_id: orgId,
        project_id: projectId,
        period_month: m,
        capex_planned: Math.round(bSplit.capex * 100) / 100,
        opex_planned: Math.round(bSplit.opex * 100) / 100,
        capex_forecast: Math.round(fSplit.capex * 100) / 100,
        opex_forecast: Math.round(fSplit.opex * 100) / 100,
        // preserve actuals + benefits
        capex_actual: num(prev?.capex_actual),
        opex_actual: num(prev?.opex_actual),
        benefits_planned: num(prev?.benefits_planned),
        benefits_actual: num(prev?.benefits_actual),
      };
      if (prev?.id) {
        const { error } = await supabase
          .from("financials_monthly")
          .update(row)
          .eq("id", prev.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("financials_monthly").insert(row);
        if (error) throw error;
      }
      byMonth.set(m, row);
      upserted++;
    }
  }
  return { monthsUpserted: upserted };
}

/** Roll monthly CapEx/OpEx actuals up to the project register. */
export async function syncProjectIncurredFromMonthly(
  projectId: string,
): Promise<{ capex: number; opex: number }> {
  const { data, error } = await supabase
    .from("financials_monthly")
    .select("capex_actual,opex_actual")
    .eq("project_id", projectId);
  if (error) throw error;
  const capex = (data ?? []).reduce((s, r) => s + num(r.capex_actual), 0);
  const opex = (data ?? []).reduce((s, r) => s + num(r.opex_actual), 0);
  const { error: uerr } = await supabase
    .from("projects")
    .update({
      capex_incurred: Math.round(capex * 100) / 100,
      opex_incurred: Math.round(opex * 100) / 100,
    })
    .eq("id", projectId);
  if (uerr) throw uerr;
  return { capex, opex };
}

export async function syncOrgIncurredFromMonthly(orgId: string): Promise<number> {
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id")
    .eq("org_id", orgId);
  if (error) throw error;
  let n = 0;
  for (const p of projects ?? []) {
    await syncProjectIncurredFromMonthly(p.id);
    n++;
  }
  return n;
}

export type PhaseWindow = {
  stage: string;
  start: string | null; // YYYY-MM-01
  end: string | null; // YYYY-MM-01 inclusive
};

/**
 * Build date windows per stage from ordered gate planned dates.
 * Window for gate i: [gate_i.planned, day before gate_{i+1}.planned].
 */
export function phaseWindowsFromGates(
  gates: StageGateLike[],
  orgPhases: string[],
): PhaseWindow[] {
  const sorted = sortGatesByOrgOrder(gates, orgPhases);
  const windows: PhaseWindow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    const name = g.gate_name || `Stage ${i + 1}`;
    const start = g.planned_date ? monthKey(g.planned_date) : null;
    const next = sorted[i + 1];
    let end: string | null = null;
    if (next?.planned_date) {
      const d = new Date(monthKey(next.planned_date) + "T00:00:00");
      d.setMonth(d.getMonth() - 1);
      end = monthKey(d);
    }
    windows.push({ stage: name, start, end });
  }
  return windows;
}

export function monthlyInWindow(
  rows: MonthlyFinanceRow[],
  window: PhaseWindow,
): MonthlyFinanceRow[] {
  return rows.filter((r) => {
    const m = monthKey(r.period_month);
    if (window.start && m < window.start) return false;
    if (window.end && m > window.end) return false;
    // If no dates on gate, include nothing unless both null (open) — then include all
    if (!window.start && !window.end) return true;
    return true;
  });
}

/** Aggregate plan/actual/forecast for a set of monthly rows. */
export function monthlyTriple(rows: MonthlyFinanceRow[]) {
  const planned = sumMonthlyPlanned(rows);
  const actual = sumMonthlyActual(rows);
  const forecast = sumMonthlyForecast(rows);
  return {
    planned,
    actual,
    forecast,
    variance: planned - actual,
    variancePct: planned > 0 ? ((planned - actual) / planned) * 100 : 0,
  };
}

/** Which FY a calendar month belongs to (label). */
export function fyLabelForMonth(
  periodMonth: string,
  fyStartMonth?: number | null,
): string {
  const d = new Date(monthKey(periodMonth) + "T00:00:00");
  const s = fyStartFor(d, fyStartMonth);
  return `FY${String(s.getFullYear() + 1).slice(-2)}`;
}
