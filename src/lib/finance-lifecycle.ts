/**
 * Budget / Plan / Forecast / Actual cashflow lifecycle.
 *
 * One financials_monthly row per project · stream · month. Plan and Forecast are
 * columns on that row — FY Allocation and Estimation Planning must not insert a
 * second record for the same month.
 *
 * Budget:   stream budget (Data Editor) — FY Allocation budget % is the year split
 * Plan:     CapEx planned ← FY budget CapEx
 *           OpEx planned + FTE ← Estimation Planning apply (FY save never writes OpEx plan)
 * Forecast: FY Allocation forecast % → monthly *_forecast (empty forecast starts = plan)
 * Actual:   financials_monthly.*_actual → projects.capex_incurred / opex_incurred
 * Demand:   work items — compare to Plan; never written here
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
import {
  isDoneGateStatus,
  matchPhase,
  normLabel,
  sortGatesByOrgOrder,
  type StageGateLike,
} from "@/lib/project-phase";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type MonthlyFinanceRow = {
  project_id: string;
  stream_id?: string | null;
  period_month: string;
  capex_planned?: number | null;
  capex_actual?: number | null;
  capex_forecast?: number | null;
  opex_planned?: number | null;
  opex_actual?: number | null;
  opex_forecast?: number | null;
  opex_labor_planned?: number | null;
  opex_labor_actual?: number | null;
  opex_other_actual?: number | null;
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
export function monthsForFyLabel(fy: string, fyStartMonth?: number | null): string[] {
  const endYear = parseFyEndingYear(fy);
  if (!endYear) return [];
  const startIdx = fyMonthIndex(fyStartMonth);
  // FY ends in `endYear` just before fy start month → start is previous calendar year at fyStart
  const start = new Date(endYear - 1, startIdx, 1);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
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

/** Map key for one monthly cashflow lane (blank stream_id → empty prefix). */
export function monthlyLaneKey(streamId: string | null | undefined, period: string): string {
  return `${streamId || ""}|${monthKey(period)}`;
}

export type MonthlyLaneLike = {
  id?: string;
  stream_id?: string | null;
  period_month: string;
  capex_planned?: number | null;
  opex_planned?: number | null;
  opex_labor_planned?: number | null;
  capex_forecast?: number | null;
  opex_forecast?: number | null;
  capex_actual?: number | null;
  opex_actual?: number | null;
  opex_labor_actual?: number | null;
  opex_other_actual?: number | null;
  benefits_planned?: number | null;
  benefits_actual?: number | null;
};

function shareOf(v: unknown, share: number) {
  return Math.round(num(v) * share * 100) / 100;
}

/** Prefer the lane that already has a value; otherwise take the blank-stream share. */
function preferLane(streamVal: unknown, blankVal: unknown, share: number) {
  return num(streamVal) > 0 ? num(streamVal) : shareOf(blankVal, share);
}

/**
 * Fold a leftover project-level (blank stream) month into a stream-scoped row.
 * Stream values win when already set (FY cascade / Estimation just wrote them).
 * Blank leftover fills only empty Plan / Forecast cells.
 * Actuals are summed so deleting the blank row does not drop incurred $.
 */
export function mergeBlankMonthlyIntoStream(
  blank: MonthlyLaneLike,
  stream: MonthlyLaneLike,
  share: number,
): Record<string, number> {
  return {
    capex_forecast: preferLane(stream.capex_forecast, blank.capex_forecast, share),
    opex_forecast: preferLane(stream.opex_forecast, blank.opex_forecast, share),
    capex_planned: preferLane(stream.capex_planned, blank.capex_planned, share),
    opex_planned: preferLane(stream.opex_planned, blank.opex_planned, share),
    opex_labor_planned: preferLane(stream.opex_labor_planned, blank.opex_labor_planned, share),
    capex_actual: num(stream.capex_actual) + shareOf(blank.capex_actual, share),
    opex_actual: num(stream.opex_actual) + shareOf(blank.opex_actual, share),
    opex_labor_actual: num(stream.opex_labor_actual) + shareOf(blank.opex_labor_actual, share),
    opex_other_actual: num(stream.opex_other_actual) + shareOf(blank.opex_other_actual, share),
    benefits_planned: preferLane(stream.benefits_planned, blank.benefits_planned, share),
    benefits_actual: num(stream.benefits_actual) + shareOf(blank.benefits_actual, share),
  };
}

/**
 * Prefer the exact stream·month row. If FY already created a blank-stream month
 * and Estimation (or a later FY save) targets a stream, reuse that row instead
 * of inserting a second record.
 */
export function findMonthlyRowForLane<T extends MonthlyLaneLike>(
  byKey: Map<string, T>,
  streamId: string | null | undefined,
  period: string,
): T | undefined {
  const exact = byKey.get(monthlyLaneKey(streamId, period));
  if (exact) return exact;
  if (streamId) return byKey.get(monthlyLaneKey(null, period));
  const want = monthKey(period);
  const matches: T[] = [];
  for (const row of byKey.values()) {
    if (monthKey(row.period_month) === want) matches.push(row);
  }
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Which stream lanes receive a project-level FY allocation.
 * Never returns both null and a named stream — that pair is what showed up as
 * two Phase · stream rows (FY on blank stream + Estimation on the named stream).
 */
export function fyCascadeTargetStreamIds(opts: {
  allocationStreamId?: string | null;
  existing: MonthlyLaneLike[];
  months: string[];
  defaultStreamId?: string | null;
}): (string | null)[] {
  if (opts.allocationStreamId) return [opts.allocationStreamId];
  const monthSet = new Set(opts.months.map((m) => monthKey(m)));
  const streams: string[] = [];
  const seen = new Set<string>();
  for (const r of opts.existing) {
    if (!monthSet.has(monthKey(r.period_month))) continue;
    if (!r.stream_id || seen.has(r.stream_id)) continue;
    seen.add(r.stream_id);
    streams.push(r.stream_id);
  }
  if (streams.length) return streams;
  if (opts.defaultStreamId) return [opts.defaultStreamId];
  return [null];
}

/** Split one FY month across stream lanes (by existing plan $, else equally). */
export function fyCascadeStreamShares(
  streamIds: (string | null)[],
  existing: MonthlyLaneLike[],
  months: string[],
): Map<string | null, number> {
  const shares = new Map<string | null, number>();
  if (!streamIds.length) return shares;
  if (streamIds.length === 1) {
    shares.set(streamIds[0] ?? null, 1);
    return shares;
  }
  const monthSet = new Set(months.map((m) => monthKey(m)));
  let total = 0;
  for (const sid of streamIds) {
    let w = 0;
    for (const r of existing) {
      if (!monthSet.has(monthKey(r.period_month))) continue;
      if ((r.stream_id || null) !== (sid || null)) continue;
      w += num(r.capex_planned) + num(r.opex_planned);
    }
    shares.set(sid, w);
    total += w;
  }
  if (total <= 0) {
    const eq = 1 / streamIds.length;
    for (const sid of streamIds) shares.set(sid, eq);
    return shares;
  }
  for (const sid of streamIds) shares.set(sid, (shares.get(sid) || 0) / total);
  return shares;
}

export function sumMonthlyPlanned(rows: MonthlyFinanceRow[]): number {
  return rows.reduce((s, r) => s + num(r.capex_planned) + num(r.opex_planned), 0);
}

export function sumMonthlyActual(rows: MonthlyFinanceRow[]): number {
  return rows.reduce((s, r) => s + num(r.capex_actual) + num(r.opex_actual), 0);
}

export function sumMonthlyForecast(rows: MonthlyFinanceRow[]): number {
  return rows.reduce((s, r) => s + num(r.capex_forecast) + num(r.opex_forecast), 0);
}

/**
 * Distribute FY Allocation into monthly columns on the existing stream·month row.
 * - *_forecast always from FY forecast $ (this is the Forecast layer)
 * - capex_planned from FY budget CapEx (capital is not on Estimation Planning)
 * - opex_planned / opex_labor_planned are never written here (Estimation Apply owns Plan)
 * Preserves actuals. Months outside project schedule are skipped when start/end
 * are provided; otherwise all 12 FY months are used.
 *
 * Project-level FY rows (blank stream_id) land on existing stream months, or the
 * default stream — never a parallel blank-stream record beside Estimation's lane.
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
  allocations: (FyAllocationLike & { stream_id?: string | null })[];
  fyStartMonth?: number | null;
  /** Force all allocations into this stream lane (optional). */
  streamId?: string | null;
}): Promise<{ monthsUpserted: number }> {
  const { orgId, projectId, project, allocations, fyStartMonth, streamId } = opts;
  const startIso =
    project.actual_start_date || project.planned_start_date || project.start_date || null;
  const endIso = project.actual_end_date || project.planned_end_date || project.end_date || null;
  const startBound = startIso ? monthKey(startIso) : null;
  const endBound = endIso ? monthKey(endIso) : null;

  const { data: existing } = await supabase
    .from("financials_monthly")
    .select("*")
    .eq("project_id", projectId);

  const { data: streamRows } = await supabase
    .from("project_streams")
    .select("id,is_default")
    .eq("project_id", projectId);
  const defaultStreamId =
    (streamRows ?? []).find((s: { is_default?: boolean | null }) => s.is_default)?.id ||
    ((streamRows ?? []).length === 1 ? (streamRows as { id: string }[])[0].id : null) ||
    null;

  const byKey = new Map(
    (existing ?? []).map((r: MonthlyLaneLike) => [monthlyLaneKey(r.stream_id, r.period_month), r]),
  );

  let upserted = 0;
  for (const a of allocations) {
    const fy = String((a as any).fy || "");
    if (!fy) continue;
    const allocationStreamId =
      streamId !== undefined ? streamId : ((a as any).stream_id ?? null);

    const budget = fyAllocBudget(a);
    const forecast = fyAllocForecast(a);
    const explicitCapex = num((a as any).capex);
    const explicitOpex = num((a as any).opex);
    const hasExplicitSplit = explicitCapex > 0 || explicitOpex > 0;
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
    const bSplit = hasExplicitSplit
      ? {
          capex: explicitCapex / months.length,
          opex: explicitOpex / months.length,
        }
      : splitCapexOpex(bEach, project);
    const fSplit = hasExplicitSplit
      ? {
          capex: budget > 0 ? (explicitCapex / budget) * fEach : 0,
          opex: budget > 0 ? (explicitOpex / budget) * fEach : fEach,
        }
      : splitCapexOpex(fEach, project);

    const targets = fyCascadeTargetStreamIds({
      allocationStreamId,
      existing: [...byKey.values()],
      months,
      defaultStreamId,
    });
    const shares = fyCascadeStreamShares(targets, [...byKey.values()], months);

    for (const m of months) {
      for (const laneStreamId of targets) {
        const share = shares.get(laneStreamId) ?? 1;
        const prev = findMonthlyRowForLane(byKey, laneStreamId, m);
        const fyCapexFc = Math.round(fSplit.capex * share * 100) / 100;
        const fyOpexFc = Math.round(fSplit.opex * share * 100) / 100;
        const fyCapexPlan = Math.round(bSplit.capex * share * 100) / 100;
        const row = {
          org_id: orgId,
          project_id: projectId,
          stream_id: laneStreamId,
          period_month: m,
          capex_planned: fyCapexPlan,
          capex_forecast: forecast > 0 || !prev ? fyCapexFc : num(prev.capex_forecast),
          opex_forecast: forecast > 0 || !prev ? fyOpexFc : num(prev.opex_forecast),
          capex_actual: num(prev?.capex_actual),
          opex_actual: num(prev?.opex_actual),
          benefits_planned: num(prev?.benefits_planned),
          benefits_actual: num(prev?.benefits_actual),
        };
        if (prev?.id) {
          const { error } = await supabase.from("financials_monthly").update(row).eq("id", prev.id);
          if (error) throw error;
          if (!prev.stream_id && laneStreamId) {
            byKey.delete(monthlyLaneKey(null, m));
          }
        } else {
          const { error } = await supabase.from("financials_monthly").insert(row);
          if (error) throw error;
        }
        byKey.set(monthlyLaneKey(laneStreamId, m), { ...prev, ...row });
        upserted++;
      }
    }
  }
  await absorbBlankMonthlyIntoStreams(projectId);
  return { monthsUpserted: upserted };
}

/**
 * If a blank-stream month sits beside stream-scoped months for the same period,
 * merge Plan / Forecast / Actuals onto those stream rows, then drop the blank
 * record so Phase · stream detail does not show two lanes.
 */
export async function absorbBlankMonthlyIntoStreams(projectId: string): Promise<number> {
  const { data, error } = await supabase
    .from("financials_monthly")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw error;

  const byMonth = new Map<string, { blank?: MonthlyLaneLike; streams: MonthlyLaneLike[] }>();
  for (const r of (data ?? []) as MonthlyLaneLike[]) {
    const m = monthKey(r.period_month);
    const cur = byMonth.get(m) || { streams: [] };
    if (r.stream_id) cur.streams.push(r);
    else cur.blank = r;
    byMonth.set(m, cur);
  }

  let deleted = 0;
  for (const { blank, streams } of byMonth.values()) {
    if (!blank?.id || !streams.length) continue;
    const shares = fyCascadeStreamShares(
      streams.map((s) => s.stream_id || null),
      streams,
      [blank.period_month],
    );
    for (const s of streams) {
      if (!s.id) continue;
      const share = shares.get(s.stream_id || null) ?? 1 / streams.length;
      const patch = mergeBlankMonthlyIntoStream(blank, s, share);
      const { error: uerr } = await supabase
        .from("financials_monthly")
        .update(patch as never)
        .eq("id", s.id);
      if (uerr && !/opex_labor|opex_other|schema cache|column/i.test(uerr.message)) throw uerr;
      if (uerr) {
        const {
          opex_labor_planned: _lp,
          opex_labor_actual: _la,
          opex_other_actual: _oa,
          ...withoutLabor
        } = patch;
        const retry = await supabase
          .from("financials_monthly")
          .update(withoutLabor as never)
          .eq("id", s.id);
        if (retry.error) throw retry.error;
      }
    }
    const { error: derr } = await supabase.from("financials_monthly").delete().eq("id", blank.id);
    if (derr) throw derr;
    deleted += 1;
  }
  return deleted;
}

/** Register FAC = sum of FY Allocation forecast $ for the project. */
export async function syncProjectFacFromFyAllocations(projectId: string): Promise<number> {
  const { data, error } = await supabase
    .from("fy_allocations")
    .select("forecast,forecast_amount,budget,allocated_amount")
    .eq("project_id", projectId);
  if (error) throw error;
  const fac = Math.round((data ?? []).reduce((s, r) => s + fyAllocForecast(r), 0) * 100) / 100;
  const { error: uerr } = await supabase
    .from("projects")
    .update({ forecast_at_completion: fac } as never)
    .eq("id", projectId);
  if (uerr) throw uerr;
  return fac;
}

/** Gate is late when planned date has passed without completion, or actual > planned. */
export function isGateScheduleDelayed(
  gate: {
    planned_date?: string | null;
    actual_date?: string | null;
    status?: string | null;
  },
  today = new Date(),
): boolean {
  if (isDoneGateStatus(gate.status)) return false;
  const planned = String(gate.planned_date || "").slice(0, 10);
  const actual = String(gate.actual_date || "").slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);
  if (planned && actual && actual > planned) return true;
  if (planned && !actual && planned < todayIso) return true;
  return false;
}

/**
 * Phase forecast equals plan unless a stored FY/monthly forecast exists or the
 * gate has slipped. Late gates cannot forecast below actuals-to-date or plan.
 */
export function livePhaseForecast(opts: {
  plan: number;
  storedForecast?: number | null;
  actual?: number | null;
  delayed?: boolean;
}): number {
  const plan = num(opts.plan);
  const actual = num(opts.actual);
  const stored = num(opts.storedForecast);
  const base = stored > 0 ? stored : plan;
  if (opts.delayed) return Math.max(base, actual, plan);
  return base > 0 ? base : plan;
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
 * One gate name → one phase window. Monthly financials have no stage_gate_id;
 * spend is attributed by planned_date (this gate → month before the next).
 * Prefer a stream-owned row when the same name also exists as a project-level copy.
 */
export function uniqueGatesForPhaseWindows<T extends StageGateLike & { stream_id?: string | null }>(
  gates: T[],
): T[] {
  const byName = new Map<string, T>();
  for (const g of gates) {
    const n = String(g.gate_name || "").trim() || "Stage";
    const prev = byName.get(n);
    if (!prev) {
      byName.set(n, g);
      continue;
    }
    if (!prev.stream_id && g.stream_id) byName.set(n, g);
  }
  return [...byName.values()];
}

/** Window for gate i: [gate_i.planned, day before gate_{i+1}.planned]. */
export function phaseWindowsFromGates(gates: StageGateLike[], orgPhases: string[]): PhaseWindow[] {
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

/** True when a stage/gate label matches the selected portfolio phase filter. */
export function stageMatchesPhaseFilter(
  stage: string | null | undefined,
  phaseFilter: string,
  orgPhases: string[] = [],
): boolean {
  if (!phaseFilter || phaseFilter === "All") return true;
  if (!stage) return false;
  const target = matchPhase(phaseFilter, orgPhases) ?? phaseFilter;
  const mapped = matchPhase(stage, orgPhases) ?? stage;
  return normLabel(mapped) === normLabel(target) || normLabel(stage) === normLabel(phaseFilter);
}

/** Windows whose stage matches the selected phase filter. */
export function phaseWindowsForFilter(
  gates: StageGateLike[],
  orgPhases: string[],
  phaseFilter: string,
): PhaseWindow[] {
  const windows = phaseWindowsFromGates(gates, orgPhases);
  if (!phaseFilter || phaseFilter === "All") return windows;
  return windows.filter((w) => stageMatchesPhaseFilter(w.stage, phaseFilter, orgPhases));
}

/** Monthly cashflow rows that fall inside the selected phase's gate date window(s). */
export function monthlyRowsForPhaseFilter(
  rows: MonthlyFinanceRow[],
  gates: StageGateLike[],
  orgPhases: string[],
  phaseFilter: string,
): MonthlyFinanceRow[] {
  if (!phaseFilter || phaseFilter === "All") return rows;
  const windows = phaseWindowsForFilter(gates, orgPhases, phaseFilter);
  if (!windows.length) return [];
  const seen = new Set<string>();
  const out: MonthlyFinanceRow[] = [];
  for (const w of windows) {
    for (const row of monthlyInWindow(rows, w)) {
      const key = `${row.project_id}|${row.stream_id ?? ""}|${monthKey(row.period_month)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
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

/**
 * Attribute monthly cashflow into stage gates by planned-date windows.
 * Keys are trimmed gate/stage names. Used by Phase Financials + Project Infographic.
 */
export function phaseSpendByStage(
  gates: StageGateLike[],
  rows: MonthlyFinanceRow[],
  orgPhases: string[],
): Map<string, { planned: number; actual: number; forecast: number }> {
  const out = new Map<string, { planned: number; actual: number; forecast: number }>();
  for (const w of phaseWindowsFromGates(gates, orgPhases)) {
    const key = (w.stage || "").trim();
    if (!key) continue;
    out.set(key, monthlyTriple(monthlyInWindow(rows, w)));
  }
  return out;
}

/** Which FY a calendar month belongs to (label). */
export function fyLabelForMonth(periodMonth: string, fyStartMonth?: number | null): string {
  const d = new Date(monthKey(periodMonth) + "T00:00:00");
  const s = fyStartFor(d, fyStartMonth);
  return `FY${String(s.getFullYear() + 1).slice(-2)}`;
}
