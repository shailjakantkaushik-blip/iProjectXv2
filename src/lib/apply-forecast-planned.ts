/**
 * Apply Estimation Planning as the planned baseline for cost and FTE.
 *
 * The estimate is edited on Project Estimation Planning.
 * Apply writes planned money and resource allocations only — never actuals.
 * Monthly *_forecast is filled from plan only when still empty (forecast defaults to plan).
 * Reuses the FY Allocation month row when one already exists (Plan and Forecast are
 * columns, not two records).
 */
import { supabase } from "@/integrations/supabase/client";
import { HOURS_PER_DAY } from "@/lib/ops-enhancements";
import type { ForecastPhaseRow } from "@/lib/project-forecast";
import { monthKeysInclusive } from "@/lib/work-item-fte-plan";
import {
  absorbBlankMonthlyIntoStreams,
  findMonthlyRowForLane,
  monthlyLaneKey,
} from "@/lib/finance-lifecycle";

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

export type StageGateLike = {
  id: string;
  stream_id?: string | null;
  gate_name?: string | null;
};

export type PlannedAllocSlice = {
  streamId: string | null;
  stageGateId: string | null;
  resourceId: string;
  periodMonth: string;
  hours: number;
};

/** Match an estimation phase to the live stage gate (stream + gate name). */
export function resolvePhaseStageGateId(
  phase: Pick<ForecastPhaseRow, "stream_id" | "gate_name">,
  gates: StageGateLike[],
): string | null {
  const name = String(phase.gate_name || "").trim();
  if (!name) return null;
  const sid = phase.stream_id || null;
  const exact = gates.find(
    (g) => String(g.gate_name || "").trim() === name && (g.stream_id || null) === sid,
  );
  if (exact) return exact.id;
  if (sid) return null;
  return gates.find((g) => String(g.gate_name || "").trim() === name)?.id ?? null;
}

function allocSliceKey(s: {
  streamId?: string | null;
  stageGateId?: string | null;
  resourceId: string;
  periodMonth: string;
}) {
  return `${s.streamId || ""}|${s.stageGateId || ""}|${s.resourceId}|${s.periodMonth}`;
}

function ungatedComboKey(
  streamId: string | null | undefined,
  resourceId: string,
  periodMonth: string,
) {
  return `${streamId || ""}|${resourceId}|${periodMonth}`;
}

/**
 * Spread estimation effort-days into planned allocation hours per stream, phase
 * (stage gate), resource, and month. This is the Plan FTE hours baseline —
 * not work-item demand and not timesheet actuals.
 */
export function plannedAllocationHoursFromEstimate(opts: {
  phases: ForecastPhaseRow[];
  phaseRes: ForecastPhaseResLike[];
  gates?: StageGateLike[];
}): PlannedAllocSlice[] {
  const gates = opts.gates ?? [];
  const hoursMap = new Map<string, PlannedAllocSlice>();
  for (const ph of opts.phases) {
    const stageGateId = resolvePhaseStageGateId(ph, gates);
    const rows = opts.phaseRes.filter((r) => {
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
        const slice: PlannedAllocSlice = {
          streamId: ph.stream_id || null,
          stageGateId,
          resourceId: r.resource_id,
          periodMonth: m,
          hours: each,
        };
        const key = allocSliceKey(slice);
        const prev = hoursMap.get(key);
        if (prev) prev.hours += each;
        else hoursMap.set(key, slice);
      }
    }
  }
  return Array.from(hoursMap.values()).map((s) => ({
    ...s,
    hours: Math.round(s.hours * 10) / 10,
  }));
}

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
    supabase
      .from("project_forecast_phase_resources" as any)
      .select("*")
      .eq("forecast_id", forecastId),
    supabase
      .from("project_forecast_other_costs" as any)
      .select("*")
      .eq("forecast_id", forecastId),
  ]);
  return {
    phaseRes: ((phaseRes ?? []) as ForecastPhaseResLike[]) || [],
    otherCosts: ((otherCosts ?? []) as ForecastOtherCostLike[]) || [],
  };
}

/**
 * Spread estimation labor + other into monthly *planned* cells, and effort
 * into resource_allocations (Planned FTE). Actuals are untouched.
 * opex_forecast is set to the plan amount only when it is still empty.
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
    .select(
      "id,stream_id,period_month,opex_planned,opex_labor_planned,capex_actual,opex_actual,capex_forecast,opex_forecast,capex_planned,benefits_planned,benefits_actual",
    )
    .eq("project_id", opts.projectId);

  const monthRow = new Map(
    ((existingMonths ?? []) as any[]).map((r) => [
      monthlyLaneKey(r.stream_id, r.period_month),
      r,
    ]),
  );

  let monthsUpdated = 0;
  for (const [key, amt] of monthMoney) {
    const [streamIdRaw, period] = key.split("|");
    const streamId = streamIdRaw || null;
    const prev = findMonthlyRowForLane(monthRow, streamId, period);
    const planned = Math.round((amt.labor + amt.other) * 100) / 100;
    const labor = Math.round(amt.labor * 100) / 100;
    if (
      opts.onlyFillEmpty &&
      prev &&
      (num(prev.opex_planned) > 0 || num(prev.opex_labor_planned) > 0)
    ) {
      continue;
    }
    const patch = {
      org_id: opts.orgId,
      project_id: opts.projectId,
      stream_id: streamId || prev?.stream_id || null,
      period_month: period,
      opex_planned: planned,
      opex_labor_planned: labor,
      capex_actual: num(prev?.capex_actual),
      opex_actual: num(prev?.opex_actual),
      capex_forecast: prev?.capex_forecast ?? null,
      opex_forecast: num(prev?.opex_forecast) > 0 ? num(prev.opex_forecast) : planned,
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
      if (!prev.stream_id && streamId) {
        monthRow.delete(monthlyLaneKey(null, period));
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
    monthRow.set(monthlyLaneKey(streamId, period), { ...prev, ...patch });
    monthsUpdated += 1;
  }

  try {
    await absorbBlankMonthlyIntoStreams(opts.projectId);
  } catch {
    // Older orgs may lack stream_id on monthly; Plan columns are already written.
  }

  const { data: resourceRows } = opts.resources
    ? { data: opts.resources }
    : await supabase.from("resources").select("id,capacity_hours_week").eq("org_id", opts.orgId);
  const capacityById = new Map(
    ((resourceRows ?? []) as ForecastResourceLike[]).map((r) => [
      r.id,
      num(r.capacity_hours_week) || 40,
    ]),
  );

  const { data: gateRows } = await supabase
    .from("stage_gates")
    .select("id,stream_id,gate_name")
    .eq("project_id", opts.projectId);
  const slices = plannedAllocationHoursFromEstimate({
    phases: opts.phases,
    phaseRes,
    gates: ((gateRows ?? []) as StageGateLike[]) || [],
  });

  const { data: existingAlloc } = await supabase
    .from("resource_allocations")
    .select(
      "id,stream_id,stage_gate_id,resource_id,period_month,allocated_hours,allocation_percent",
    )
    .eq("project_id", opts.projectId);

  const existing = ((existingAlloc ?? []) as any[]) || [];
  const gatedRow = new Map<string, any>();
  const ungatedRow = new Map<string, any>();
  for (const r of existing) {
    const period = monthKey(r.period_month);
    const full = allocSliceKey({
      streamId: r.stream_id,
      stageGateId: r.stage_gate_id,
      resourceId: r.resource_id,
      periodMonth: period,
    });
    gatedRow.set(full, r);
    if (!r.stage_gate_id) {
      ungatedRow.set(ungatedComboKey(r.stream_id, r.resource_id, period), r);
    }
  }

  const newCountByUngated = new Map<string, number>();
  for (const s of slices) {
    const combo = ungatedComboKey(s.streamId, s.resourceId, s.periodMonth);
    newCountByUngated.set(combo, (newCountByUngated.get(combo) || 0) + 1);
  }

  const usedIds = new Set<string>();
  let allocationsUpserted = 0;
  for (const s of slices) {
    const fullKey = allocSliceKey(s);
    const combo = ungatedComboKey(s.streamId, s.resourceId, s.periodMonth);
    let prev = gatedRow.get(fullKey);
    if (!prev && s.stageGateId && (newCountByUngated.get(combo) || 0) === 1) {
      prev = ungatedRow.get(combo);
    }
    if (opts.onlyFillEmpty && prev && num(prev.allocated_hours) > 0) continue;
    const weekCap = capacityById.get(s.resourceId) || 40;
    const monthCap = weekCap * 4.33;
    const pct = monthCap > 0 ? Math.round((s.hours / monthCap) * 1000) / 10 : 0;
    const row = {
      org_id: opts.orgId,
      project_id: opts.projectId,
      stream_id: s.streamId,
      stage_gate_id: s.stageGateId,
      resource_id: s.resourceId,
      period_month: s.periodMonth,
      allocated_hours: s.hours,
      allocation_percent: pct,
    };
    if (prev?.id) {
      const { error } = await supabase.from("resource_allocations").update(row).eq("id", prev.id);
      if (error) throw error;
      usedIds.add(prev.id);
    } else {
      const { error } = await supabase.from("resource_allocations").insert(row);
      if (error && !/duplicate|unique/i.test(error.message)) throw error;
    }
    allocationsUpserted += 1;
  }

  // After splitting plan hours onto stream + phase rows, drop the old
  // stream-only (null gate) row for the same resource/month so Plan vs actual
  // does not double-count estimation hours.
  const leftoverUngated = existing.filter((r) => {
    if (r.stage_gate_id || usedIds.has(r.id)) return false;
    const combo = ungatedComboKey(r.stream_id, r.resource_id, monthKey(r.period_month));
    return slices.some(
      (s) => s.stageGateId && ungatedComboKey(s.streamId, s.resourceId, s.periodMonth) === combo,
    );
  });
  for (const r of leftoverUngated) {
    const { error } = await supabase.from("resource_allocations").delete().eq("id", r.id);
    if (error) throw error;
  }

  return { monthsUpdated, allocationsUpserted };
}
