/**
 * Apply Project Forecast as the planned baseline for cost and FTE.
 *
 * Forecast (estimate) is edited on Project Forecast.
 * Apply writes planned money and resource allocations only — never actuals
 * and never monthly *forecast* columns (those stay in-flight FAC).
 */
import { supabase } from "@/integrations/supabase/client";
import { HOURS_PER_DAY } from "@/lib/ops-enhancements";
import type { ForecastPhaseRow } from "@/lib/project-forecast";
import { monthKeysInclusive } from "@/lib/work-item-fte-plan";

function effortDaysToHours(days: number) {
  return Math.round((Number(days) || 0) * HOURS_PER_DAY * 10) / 10;
}

function phaseKey(p: Pick<ForecastPhaseRow, "stream_id" | "gate_name">) {
  return `${p.stream_id || "proj"}::${p.gate_name}`;
}

export type ForecastPhaseResLike = {
  id?: string;
  resource_id?: string | null;
  stream_id?: string | null;
  phase_name?: string | null;
  forecast_phase_id?: string | null;
  effort_days?: number | null;
  labor_cost?: number | null;
};

export type ForecastOtherCostLike = {
  forecast_phase_id?: string | null;
  amount?: number | null;
};

export type ForecastResourceLike = {
  id: string;
  capacity_hours_week?: number | null;
};

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function monthKey(iso?: string | null) {
  const s = String(iso || "").slice(0, 7);
  return s ? `${s}-01` : "";
}

function laborForPhase(ph: ForecastPhaseRow, phaseRes: ForecastPhaseResLike[]) {
  return phaseRes
    .filter((r) => {
      if (ph.id && r.forecast_phase_id === ph.id) return true;
      return r.phase_name === ph.gate_name && (r.stream_id || null) === (ph.stream_id || null);
    })
    .reduce((s, r) => s + num(r.labor_cost), 0);
}

function otherForPhase(ph: ForecastPhaseRow, otherCosts: ForecastOtherCostLike[]) {
  if (!ph.id) return 0;
  return otherCosts
    .filter((c) => c.forecast_phase_id === ph.id)
    .reduce((s, c) => s + num(c.amount), 0);
}

export function plannedCostByPhase(
  phases: ForecastPhaseRow[],
  phaseRes: ForecastPhaseResLike[],
  otherCosts: ForecastOtherCostLike[],
): Map<string, { labor: number; other: number; total: number }> {
  const out = new Map<string, { labor: number; other: number; total: number }>();
  for (const ph of phases) {
    const labor = laborForPhase(ph, phaseRes);
    const other = otherForPhase(ph, otherCosts);
    out.set(phaseKey(ph), { labor, other, total: labor + other });
  }
  return out;
}

export async function loadForecastApplyInputs(forecastId: string): Promise<{
  phaseRes: ForecastPhaseResLike[];
  otherCosts: ForecastOtherCostLike[];
}> {
  const [{ data: phaseRes }, { data: otherCosts }] = await Promise.all([
    supabase.from("project_forecast_phase_resources" as any).select("*").eq("forecast_id", forecastId),
    supabase.from("project_forecast_other_costs" as any).select("*").eq("forecast_id", forecastId),
  ]);
  return {
    phaseRes: ((phaseRes ?? []) as ForecastPhaseResLike[]) || [],
    otherCosts: ((otherCosts ?? []) as ForecastOtherCostLike[]) || [],
  };
}

/**
 * Spread forecast labor + other into monthly *planned* cells, and forecast
 * effort into resource_allocations. Actuals and monthly forecast are untouched.
 */
export async function applyForecastPlannedMoneyAndFte(opts: {
  orgId: string;
  projectId: string;
  phases: ForecastPhaseRow[];
  phaseRes?: ForecastPhaseResLike[];
  otherCosts?: ForecastOtherCostLike[];
  resources?: ForecastResourceLike[];
  onlyFillEmpty?: boolean;
}): Promise<{ monthsUpdated: number; allocationsUpserted: number }> {
  const phaseRes = opts.phaseRes ?? [];
  const otherCosts = opts.otherCosts ?? [];
  const costs = plannedCostByPhase(opts.phases, phaseRes, otherCosts);

  const monthMoney = new Map<string, { labor: number; other: number }>();
  for (const ph of opts.phases) {
    const $ = costs.get(phaseKey(ph));
    if (!$ || ($.labor <= 0 && $.other <= 0)) continue;
    const months = monthKeysInclusive(ph.start_date, ph.end_date, false);
    if (!months.length) continue;
    const laborEach = $.labor / months.length;
    const otherEach = $.other / months.length;
    for (const m of months) {
      const key = `${ph.stream_id || ""}|${m}`;
      const prev = monthMoney.get(key) || { labor: 0, other: 0 };
      monthMoney.set(key, {
        labor: prev.labor + laborEach,
        other: prev.other + otherEach,
      });
    }
  }

  const { data: existingMonths } = await supabase
    .from("financials_monthly")
    .select("id,stream_id,period_month,opex_planned,opex_labor_planned,capex_actual,opex_actual,capex_forecast,opex_forecast,capex_planned,benefits_planned,benefits_actual")
    .eq("project_id", opts.projectId);

  const monthRow = new Map(
    ((existingMonths ?? []) as any[]).map((r) => [
      `${r.stream_id || ""}|${monthKey(r.period_month)}`,
      r,
    ]),
  );

  let monthsUpdated = 0;
  for (const [key, amt] of monthMoney) {
    const [streamId, period] = key.split("|");
    const prev = monthRow.get(key);
    const planned = Math.round((amt.labor + amt.other) * 100) / 100;
    const labor = Math.round(amt.labor * 100) / 100;
    if (opts.onlyFillEmpty && prev && (num(prev.opex_planned) > 0 || num(prev.opex_labor_planned) > 0)) {
      continue;
    }
    const patch = {
      org_id: opts.orgId,
      project_id: opts.projectId,
      stream_id: streamId || null,
      period_month: period,
      opex_planned: planned,
      opex_labor_planned: labor,
      capex_actual: num(prev?.capex_actual),
      opex_actual: num(prev?.opex_actual),
      capex_forecast: prev?.capex_forecast ?? null,
      opex_forecast: prev?.opex_forecast ?? null,
      capex_planned: prev?.capex_planned ?? 0,
      benefits_planned: num(prev?.benefits_planned),
      benefits_actual: num(prev?.benefits_actual),
    };
    if (prev?.id) {
      const { error } = await supabase
        .from("financials_monthly")
        .update(patch as never)
        .eq("id", prev.id);
      if (error && !/opex_labor_planned|schema cache|column/i.test(error.message)) throw error;
      if (error) {
        const { opex_labor_planned: _l, ...withoutLabor } = patch;
        const retry = await supabase
          .from("financials_monthly")
          .update(withoutLabor as never)
          .eq("id", prev.id);
        if (retry.error) throw retry.error;
      }
    } else {
      const { error } = await supabase.from("financials_monthly").insert(patch as never);
      if (error && !/opex_labor_planned|schema cache|column/i.test(error.message)) throw error;
      if (error) {
        const { opex_labor_planned: _l, ...withoutLabor } = patch;
        const retry = await supabase.from("financials_monthly").insert(withoutLabor as never);
        if (retry.error) throw retry.error;
      }
    }
    monthsUpdated += 1;
  }

  const { data: resourceRows } = opts.resources
    ? { data: opts.resources }
    : await supabase.from("resources").select("id,capacity_hours_week").eq("org_id", opts.orgId);
  const capacityById = new Map(
    ((resourceRows ?? []) as ForecastResourceLike[]).map((r) => [r.id, num(r.capacity_hours_week) || 40]),
  );

  const allocHours = new Map<string, number>();
  for (const ph of opts.phases) {
    const rows = phaseRes.filter((r) => {
      if (ph.id && r.forecast_phase_id === ph.id) return true;
      return r.phase_name === ph.gate_name && (r.stream_id || null) === (ph.stream_id || null);
    });
    const months = monthKeysInclusive(ph.start_date, ph.end_date, false);
    if (!months.length) continue;
    for (const r of rows) {
      if (!r.resource_id) continue;
      const hours = effortDaysToHours(num(r.effort_days));
      if (hours <= 0) continue;
      const each = hours / months.length;
      for (const m of months) {
        const key = `${ph.stream_id || ""}|${r.resource_id}|${m}`;
        allocHours.set(key, (allocHours.get(key) || 0) + each);
      }
    }
  }

  const { data: existingAlloc } = await supabase
    .from("resource_allocations")
    .select("id,stream_id,resource_id,period_month,allocated_hours,allocation_percent")
    .eq("project_id", opts.projectId);

  const allocRow = new Map(
    ((existingAlloc ?? []) as any[]).map((r) => [
      `${r.stream_id || ""}|${r.resource_id}|${monthKey(r.period_month)}`,
      r,
    ]),
  );

  let allocationsUpserted = 0;
  for (const [key, hours] of allocHours) {
    const [streamId, resourceId, period] = key.split("|");
    const prev = allocRow.get(key);
    if (opts.onlyFillEmpty && prev && num(prev.allocated_hours) > 0) continue;
    const weekCap = capacityById.get(resourceId) || 40;
    const monthCap = weekCap * (HOURS_PER_DAY === 8 ? 4.33 : 4.33);
    const pct = monthCap > 0 ? Math.round((hours / monthCap) * 1000) / 10 : 0;
    const row = {
      org_id: opts.orgId,
      project_id: opts.projectId,
      stream_id: streamId || null,
      resource_id: resourceId,
      period_month: period,
      allocated_hours: Math.round(hours * 10) / 10,
      allocation_percent: pct,
    };
    if (prev?.id) {
      const { error } = await supabase.from("resource_allocations").update(row).eq("id", prev.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("resource_allocations").insert(row);
      if (error && !/duplicate|unique/i.test(error.message)) throw error;
    }
    allocationsUpserted += 1;
  }

  return { monthsUpdated, allocationsUpserted };
}
