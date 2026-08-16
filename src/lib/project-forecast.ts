/**
 * Project Forecast Estimation — streams × delivery-method phases.
 * The estimate is the planned baseline. After start, actuals live on
 * streams / gates / incurred cost and must never be overwritten here.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  defaultGatesForMethodCode,
  findDeliveryMethod,
  type DeliveryMethodRow,
} from "@/lib/delivery-methods";
import { syncScheduleDates } from "@/lib/project-dates";

export const FORECAST_COST_CATEGORIES = [
  "Vendor / contractor",
  "Software / licences",
  "Travel",
  "Contingency",
  "Hardware",
  "Training",
  "Other",
] as const;

export const DEFAULT_PHASE_DAYS = 20;

export const FORECAST_PROJECT_STATUSES = new Set([
  "not started",
  "planning",
  "draft",
  "in progress",
  "on hold",
  "",
]);

export function isForecastableProjectStatus(status?: string | null) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "completed" || s === "cancelled" || s === "canceled" || s === "closed") return false;
  return FORECAST_PROJECT_STATUSES.has(s) || !s;
}

export type ForecastPhaseRow = {
  id?: string;
  stream_id?: string | null;
  stream_name?: string | null;
  gate_name: string;
  sort_order: number;
  duration_days: number;
  start_date?: string | null;
  end_date?: string | null;
  dates_overridden?: boolean;
};

export type ForecastStreamLike = {
  id: string;
  name?: string | null;
  is_default?: boolean | null;
  sort_order?: number | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
};

export type StageGateDefLike = {
  gate_name?: string | null;
  delivery_method_id?: string | null;
  sort_order?: number | null;
};

export function forecastPhaseKey(p: Pick<ForecastPhaseRow, "stream_id" | "gate_name">) {
  return `${p.stream_id || "proj"}::${p.gate_name}`;
}

export function addCalendarDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysToMonths(days: number): number {
  const n = Number(days) || 0;
  return Math.round((n / 30) * 10) / 10;
}

export function monthsToDays(months: number): number {
  const n = Number(months) || 0;
  return Math.max(0, Math.round(n * 30));
}

export function phasesForDeliveryMethod(
  methods: DeliveryMethodRow[],
  defs: StageGateDefLike[],
  project: { delivery_method?: string | null; delivery_method_id?: string | null },
): string[] {
  const method =
    (project.delivery_method_id && methods.find((m) => m.id === project.delivery_method_id)) ||
    findDeliveryMethod(methods, project.delivery_method);
  const fromDefs = defs
    .filter((d) => (method?.id ? d.delivery_method_id === method.id : !d.delivery_method_id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((d) => String(d.gate_name || "").trim())
    .filter(Boolean);
  if (fromDefs.length) return fromDefs;
  return [...defaultGatesForMethodCode(method?.code || "waterfall")];
}

export function mergeForecastPhases(
  templateNames: string[],
  streams: ForecastStreamLike[],
  stored: ForecastPhaseRow[],
): ForecastPhaseRow[] {
  const lanes = streams.length
    ? [...streams].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : [{ id: "", name: "Project", is_default: true, sort_order: 0 }];
  const byKey = new Map(stored.map((p) => [forecastPhaseKey(p), p]));
  const rows: ForecastPhaseRow[] = [];
  lanes.forEach((stream, si) => {
    const sid = stream.id || null;
    templateNames.forEach((name, i) => {
      const prev = byKey.get(forecastPhaseKey({ stream_id: sid, gate_name: name }));
      rows.push({
        id: prev?.id,
        stream_id: sid,
        stream_name: stream.name || "Stream",
        gate_name: name,
        sort_order: si * 100 + i,
        duration_days:
          Number(prev?.duration_days) > 0 ? Number(prev?.duration_days) : DEFAULT_PHASE_DAYS,
        start_date: prev?.start_date ?? null,
        end_date: prev?.end_date ?? null,
        dates_overridden: Boolean(prev?.dates_overridden),
      });
    });
  });
  return rows;
}

export function layoutForecastPhases(
  phases: ForecastPhaseRow[],
  projectStart: string | null | undefined,
): ForecastPhaseRow[] {
  const start = (projectStart || "").slice(0, 10) || null;
  const groups = new Map<string, ForecastPhaseRow[]>();
  for (const p of phases) {
    const k = p.stream_id || "proj";
    const list = groups.get(k) || [];
    list.push(p);
    groups.set(k, list);
  }
  const out: ForecastPhaseRow[] = [];
  for (const list of groups.values()) {
    let cursor = start;
    for (const p of list) {
      if (!cursor) {
        out.push({
          ...p,
          start_date: p.dates_overridden ? p.start_date || null : null,
          end_date: p.dates_overridden ? p.end_date || null : null,
        });
        continue;
      }
      const days = Math.max(0, Number(p.duration_days) || 0);
      if (p.dates_overridden && p.start_date && p.end_date) {
        cursor = addCalendarDays(p.end_date, 1);
        out.push({ ...p, start_date: p.start_date, end_date: p.end_date });
        continue;
      }
      const phaseStart = cursor;
      const phaseEnd = days > 0 ? addCalendarDays(phaseStart, Math.max(days - 1, 0)) : phaseStart;
      cursor = addCalendarDays(phaseEnd, 1);
      out.push({ ...p, start_date: phaseStart, end_date: phaseEnd });
    }
  }
  return out;
}

export function parseForecastPhaseNotes(notes: unknown): ForecastPhaseRow[] {
  if (!notes) return [];
  try {
    const raw = typeof notes === "string" ? JSON.parse(notes) : notes;
    const list = Array.isArray((raw as any)?.phases) ? (raw as any).phases : [];
    return list
      .map((p: any, i: number) => ({
        stream_id: p.stream_id || null,
        stream_name: p.stream_name || null,
        gate_name: String(p.gate_name || "").trim(),
        sort_order: Number(p.sort_order) || i,
        duration_days: Number(p.duration_days) || DEFAULT_PHASE_DAYS,
        start_date: p.start_date || null,
        end_date: p.end_date || null,
        dates_overridden: Boolean(p.dates_overridden),
      }))
      .filter((p: ForecastPhaseRow) => p.gate_name);
  } catch {
    return [];
  }
}

export function forecastNotesWithPhases(existingNotes: unknown, phases: ForecastPhaseRow[]): string {
  let base: Record<string, unknown> = {};
  if (existingNotes && typeof existingNotes === "string") {
    try {
      const parsed = JSON.parse(existingNotes);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) base = parsed;
    } catch {
      base = {};
    }
  } else if (existingNotes && typeof existingNotes === "object") {
    base = { ...(existingNotes as Record<string, unknown>) };
  }
  return JSON.stringify({
    ...base,
    phases: phases.map((p) => ({
      stream_id: p.stream_id || null,
      stream_name: p.stream_name || null,
      gate_name: p.gate_name,
      sort_order: p.sort_order,
      duration_days: p.duration_days,
      start_date: p.start_date || null,
      end_date: p.end_date || null,
      dates_overridden: Boolean(p.dates_overridden),
    })),
  });
}

function tableMissing(error: { message?: string; code?: string } | null | undefined) {
  const msg = String(error?.message || error?.code || "");
  return /does not exist|schema cache|Could not find the table|PGRST/i.test(msg);
}

export async function loadForecastPhases(forecastId: string): Promise<ForecastPhaseRow[]> {
  const { data, error } = await supabase
    .from("project_forecast_phases" as any)
    .select("*")
    .eq("forecast_id", forecastId)
    .order("sort_order");
  if (error) {
    if (tableMissing(error)) return [];
    throw error;
  }
  return ((data ?? []) as any[]).map((p, i) => ({
    id: p.id,
    stream_id: p.stream_id || null,
    stream_name: p.stream_name || null,
    gate_name: String(p.gate_name || "").trim(),
    sort_order: Number(p.sort_order) || i,
    duration_days: Number(p.duration_days) || DEFAULT_PHASE_DAYS,
    start_date: p.start_date || null,
    end_date: p.end_date || null,
    dates_overridden: Boolean(p.dates_overridden),
  }));
}

export async function persistForecastPhases(opts: {
  orgId: string;
  projectId: string;
  forecastId: string;
  phases: ForecastPhaseRow[];
  existingNotes?: unknown;
}): Promise<ForecastPhaseRow[]> {
  const laid = opts.phases.map((p, i) => ({ ...p, sort_order: i }));
  const payload = laid.map((p) => ({
    ...(p.id ? { id: p.id } : {}),
    org_id: opts.orgId,
    project_id: opts.projectId,
    forecast_id: opts.forecastId,
    stream_id: p.stream_id || null,
    gate_name: p.gate_name,
    sort_order: p.sort_order,
    duration_days: p.duration_days,
    start_date: p.start_date || null,
    end_date: p.end_date || null,
    dates_overridden: Boolean(p.dates_overridden),
  }));
  let { error } = await supabase
    .from("project_forecast_phases" as any)
    .upsert(payload, { onConflict: "forecast_id,stream_id,gate_name" });
  if (error) {
    const retry = await supabase
      .from("project_forecast_phases" as any)
      .upsert(
        payload.map(({ stream_id: _s, ...row }) => row),
        { onConflict: "forecast_id,gate_name" },
      );
    error = retry.error;
  }
  if (error) {
    if (tableMissing(error)) {
      await supabase
        .from("project_forecasts" as any)
        .update({ notes: forecastNotesWithPhases(opts.existingNotes, laid) })
        .eq("id", opts.forecastId);
      return laid;
    }
    throw error;
  }
  return loadForecastPhases(opts.forecastId);
}

/**
 * Write planned dates only. Actual start/end on the project, streams, and
 * gates are left untouched so timeline plan-vs-actual stays honest.
 */
export async function applyForecastToProjectPlan(opts: {
  orgId: string;
  projectId: string;
  startDate: string;
  phases: ForecastPhaseRow[];
  streams?: ForecastStreamLike[];
  /** When true, only fill blank planned dates (PM later overrides stay). */
  onlyFillEmpty?: boolean;
}): Promise<{ plannedEnd: string | null }> {
  const start = opts.startDate.slice(0, 10);
  const laid = layoutForecastPhases(opts.phases, start);
  const plannedEnd =
    laid
      .map((p) => p.end_date)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || start;

  const { data: project } = await supabase
    .from("projects")
    .select("planned_start_date,planned_end_date,actual_start_date,actual_end_date,start_date,end_date")
    .eq("id", opts.projectId)
    .maybeSingle();

  const next = syncScheduleDates({
    planned_start_date: start,
    planned_end_date:
      opts.onlyFillEmpty && project?.planned_end_date ? project.planned_end_date : plannedEnd,
    actual_start_date: project?.actual_start_date ?? null,
    actual_end_date: project?.actual_end_date ?? null,
    start_date: project?.start_date ?? null,
    end_date: project?.end_date ?? null,
  });

  const { error: pe } = await supabase
    .from("projects")
    .update({
      planned_start_date: next.planned_start_date,
      planned_end_date: next.planned_end_date,
      start_date: next.start_date,
      end_date: next.end_date,
    } as never)
    .eq("id", opts.projectId);
  if (pe) throw pe;

  const streams = opts.streams ?? [];
  for (const stream of streams) {
    const streamPhases = laid.filter((p) => p.stream_id === stream.id);
    if (!streamPhases.length) continue;
    const sStart = streamPhases[0].start_date || start;
    const sEnd = streamPhases[streamPhases.length - 1].end_date || plannedEnd;
    const patch: Record<string, string | null> = {};
    if (!opts.onlyFillEmpty || !stream.planned_start_date) patch.planned_start_date = sStart;
    if (!opts.onlyFillEmpty || !stream.planned_end_date) patch.planned_end_date = sEnd;
    if (Object.keys(patch).length) {
      const { error } = await supabase
        .from("project_streams")
        .update(patch as never)
        .eq("id", stream.id);
      if (error) throw error;
    }
  }

  const { data: gates } = await supabase
    .from("stage_gates")
    .select("id,gate_name,planned_date,actual_date,stream_id")
    .eq("project_id", opts.projectId);

  for (const phase of laid) {
    const matches = ((gates ?? []) as any[]).filter((g) => {
      if (g.gate_name !== phase.gate_name) return false;
      if (phase.stream_id) return g.stream_id === phase.stream_id || !g.stream_id;
      return true;
    });
    if (matches.length === 0) {
      const { error } = await supabase.from("stage_gates").insert({
        org_id: opts.orgId,
        project_id: opts.projectId,
        stream_id: phase.stream_id || null,
        gate_name: phase.gate_name,
        planned_date: phase.end_date,
        status: "Pending",
      } as never);
      if (error) throw error;
      continue;
    }
    for (const g of matches) {
      if (g.actual_date) continue;
      if (opts.onlyFillEmpty && g.planned_date) continue;
      const { error } = await supabase
        .from("stage_gates")
        .update({ planned_date: phase.end_date } as never)
        .eq("id", g.id);
      if (error) throw error;
    }
  }

  await supabase
    .from("project_forecasts" as any)
    .update({
      plan_start_date: start,
      applied_to_plan_at: new Date().toISOString(),
    })
    .eq("project_id", opts.projectId)
    .eq("org_id", opts.orgId);

  return { plannedEnd };
}
