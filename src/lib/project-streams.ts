import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type ProjectStream = Tables<"project_streams">;
export type ProjectStreamInsert = TablesInsert<"project_streams">;
export type ProjectStreamUpdate = TablesUpdate<"project_streams">;

/** Shape a stream row into a timeline / PvA lane (project-compatible fields). */
export function streamToTimelineLane(
  project: {
    id: string;
    name?: string | null;
    project_code?: string | null;
    program?: string | null;
    sponsor?: string | null;
    current_phase?: string | null;
    status?: string | null;
    priority?: string | null;
    theme?: string | null;
    benefits_realised?: number | null;
    benefits_target?: number | null;
  },
  stream: ProjectStream | Record<string, any>,
  phase?: string | null,
) {
  const s = stream as ProjectStream;
  const plannedStart = s.planned_start_date;
  const plannedEnd = s.planned_end_date;
  const actualStart = s.actual_start_date;
  const actualEnd = s.actual_end_date;
  const start = plannedStart || actualStart || null;
  const end = actualEnd || plannedEnd || null;
  return {
    ...s,
    // Lane identity: unique per stream for gates + React keys
    id: s.id,
    stream_id: s.id,
    project_id: project.id,
    is_stream_lane: true as const,
    name: `${project.name || "Project"} · ${s.name}`,
    stream_name: s.name as string | null,
    project_name: project.name,
    project_code: project.project_code,
    program: project.program,
    // Grouping dimensions stay at project level for portfolio/executive views
    status: project.status ?? s.status ?? null,
    priority: project.priority ?? null,
    theme: project.theme ?? null,
    sponsor: s.owner || project.sponsor,
    current_phase: phase ?? project.current_phase,
    rag: s.rag || null,
    planned_start_date: plannedStart,
    planned_end_date: plannedEnd,
    actual_start_date: actualStart,
    actual_end_date: actualEnd,
    start_date: start,
    end_date: end,
    budget: s.budget,
    capex_approved: s.capex_approved,
    capex_incurred: s.capex_incurred,
    opex_approved: s.opex_approved,
    opex_incurred: s.opex_incurred,
    forecast_at_completion: s.forecast_at_completion,
    benefits_realised: project.benefits_realised,
    benefits_target: project.benefits_target,
  };
}

/** Expand projects into timeline lanes: one row per project, or one per stream when enabled. */
export function expandProjectsToTimelineLanes(
  projects: any[],
  streams: ProjectStream[] | Record<string, any>[],
  opts?: {
    gates?: { project_id: string; stream_id?: string | null; gate_name?: string | null; status?: string | null }[];
    resolvePhase?: (project: any, streamGates: any[]) => string | null;
  },
) {
  const byProject = new Map<string, any[]>();
  for (const s of streams) {
    const list = byProject.get(s.project_id) || [];
    list.push(s);
    byProject.set(s.project_id, list);
  }
  for (const list of byProject.values()) {
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)));
  }

  const lanes: any[] = [];
  for (const p of projects) {
    if (!p.streams_enabled) {
      lanes.push({
        ...p,
        is_stream_lane: false,
        project_id: p.id,
      });
      continue;
    }
    const projectStreams = byProject.get(p.id) || [];
    if (projectStreams.length === 0) {
      // Enabled but no streams yet — keep project lane as fallback
      lanes.push({ ...p, is_stream_lane: false, project_id: p.id });
      continue;
    }
    const multi = projectStreams.length > 1;
    for (const s of projectStreams) {
      const streamGates = (opts?.gates || []).filter(
        (g) => g.stream_id === s.id || (!g.stream_id && g.project_id === p.id && s.is_default),
      );
      const phase = opts?.resolvePhase?.(p, streamGates) ?? p.current_phase;
      const lane = streamToTimelineLane(p, s, phase);
      // Single default stream: project-first label; stream_id still keys gates/finance.
      if (!multi && s.is_default) {
        lane.name = p.name || lane.name;
        lane.stream_name = null;
      }
      lanes.push(lane);
    }
  }
  return lanes;
}

/** Group gates by lane key: stream_id when present, else project_id. */
export function groupGatesByLane<T extends { project_id: string; stream_id?: string | null }>(
  gates: T[],
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const g of gates) {
    const key = g.stream_id || g.project_id;
    const list = m.get(key) || [];
    list.push(g);
    m.set(key, list);
  }
  return m;
}

export async function fetchProjectStreams(projectId: string) {
  const { data, error } = await supabase
    .from("project_streams")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProjectStream[];
}

export async function fetchOrgStreams(orgId: string) {
  const { data, error } = await supabase
    .from("project_streams")
    .select("*")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProjectStream[];
}

/** Enable streams on a project: creates Core + migrates children. */
export async function enableProjectStreams(projectId: string) {
  const { data, error } = await supabase.rpc("enable_project_streams", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return data as string;
}

export async function createProjectStream(
  values: Omit<ProjectStreamInsert, "id"> & { org_id: string; project_id: string; name: string },
) {
  const { data, error } = await supabase
    .from("project_streams")
    .insert(values as never)
    .select("*")
    .single();
  if (error) throw error;
  return data as ProjectStream;
}

export async function updateProjectStream(streamId: string, patch: ProjectStreamUpdate) {
  const { data, error } = await supabase
    .from("project_streams")
    .update(patch as never)
    .eq("id", streamId)
    .select("*")
    .single();
  if (error) throw error;
  return data as ProjectStream;
}

export async function deleteProjectStream(streamId: string) {
  const { error } = await supabase.from("project_streams").delete().eq("id", streamId);
  if (error) throw error;
}

/** Build a unique stream name like "Core (copy)" / "Core (copy 2)". */
export function nextDuplicatedStreamName(baseName: string, existingNames: string[]): string {
  const names = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const root = (baseName || "Stream").replace(/\s*\(copy(?:\s+\d+)?\)\s*$/i, "").trim() || "Stream";
  let candidate = `${root} (copy)`;
  let n = 2;
  while (names.has(candidate.toLowerCase())) {
    candidate = `${root} (copy ${n})`;
    n += 1;
  }
  return candidate;
}

function nextDuplicatedStreamCode(baseCode: string | null | undefined, existingCodes: (string | null)[]): string | null {
  if (!baseCode || !String(baseCode).trim()) return null;
  const codes = new Set(
    existingCodes.filter((c): c is string => !!c && !!String(c).trim()).map((c) => String(c).trim().toLowerCase()),
  );
  const root = String(baseCode).replace(/-COPY(?:\d+)?$/i, "").trim();
  let candidate = `${root}-COPY`;
  let n = 2;
  while (codes.has(candidate.toLowerCase())) {
    candidate = `${root}-COPY${n}`;
    n += 1;
  }
  return candidate;
}

export type DuplicateStreamResult = {
  stream: ProjectStream;
  gatesCopied: number;
  milestonesCopied: number;
  fyCopied: number;
  monthlyCopied: number;
};

/**
 * Duplicate a stream as a setup template:
 * - copies planned schedule, approved funding, description
 * - clears actual dates / incurred (fresh delivery lane)
 * - copies stage gates (planned dates; status reset to Pending)
 * - copies standalone milestones (planned only)
 * - copies FY + monthly financial plan rows (actuals zeroed)
 * - does NOT copy resource allocations (avoids double-booking people)
 */
export async function duplicateProjectStream(
  sourceStreamId: string,
  opts?: { existingStreams?: ProjectStream[] },
): Promise<DuplicateStreamResult> {
  const { data: source, error: srcErr } = await supabase
    .from("project_streams")
    .select("*")
    .eq("id", sourceStreamId)
    .maybeSingle();
  if (srcErr) throw srcErr;
  if (!source) throw new Error("Stream not found");

  const existing =
    opts?.existingStreams ??
    (await fetchProjectStreams(source.project_id));

  const name = nextDuplicatedStreamName(
    source.name,
    existing.map((s) => s.name),
  );
  const code = nextDuplicatedStreamCode(
    source.code,
    existing.map((s) => s.code),
  );
  const maxSort = existing.reduce((m, s) => Math.max(m, Number(s.sort_order || 0)), 0);

  const { data: created, error: createErr } = await supabase
    .from("project_streams")
    .insert({
      org_id: source.org_id,
      project_id: source.project_id,
      name,
      code,
      description: source.description,
      owner: source.owner,
      status: source.status || "Active",
      rag: source.rag || "Green",
      is_default: false,
      sort_order: maxSort + 1,
      planned_start_date: source.planned_start_date,
      planned_end_date: source.planned_end_date,
      // Fresh actuals — template for a new lane
      actual_start_date: null,
      actual_end_date: null,
      budget: source.budget ?? 0,
      capex_approved: source.capex_approved ?? 0,
      capex_incurred: 0,
      opex_approved: source.opex_approved ?? 0,
      opex_incurred: 0,
      forecast_at_completion: source.forecast_at_completion,
      notes: source.notes,
    } as never)
    .select("*")
    .single();
  if (createErr) throw createErr;
  const stream = created as ProjectStream;

  // Stage gates → planned template
  const { data: gates, error: gatesErr } = await supabase
    .from("stage_gates")
    .select("*")
    .eq("stream_id", sourceStreamId);
  if (gatesErr) throw gatesErr;

  let gatesCopied = 0;
  if (gates && gates.length > 0) {
    const rows = gates.map((g: any) => ({
      org_id: g.org_id,
      project_id: g.project_id,
      stream_id: stream.id,
      gate_name: g.gate_name,
      planned_date: g.planned_date,
      actual_date: null,
      status: "Pending",
      approver: g.approver ?? null,
      notes: g.notes ?? null,
    }));
    const { error } = await supabase.from("stage_gates").insert(rows as never);
    if (error) throw error;
    gatesCopied = rows.length;
  }

  // Standalone milestones only (gate-linked ones usually regenerate from gates)
  const { data: milestones, error: msErr } = await supabase
    .from("milestones")
    .select("*")
    .eq("stream_id", sourceStreamId)
    .is("stage_gate_id", null);
  if (msErr) throw msErr;

  let milestonesCopied = 0;
  if (milestones && milestones.length > 0) {
    const rows = milestones.map((m: any) => ({
      org_id: m.org_id,
      project_id: m.project_id,
      stream_id: stream.id,
      name: m.name,
      planned_date: m.planned_date,
      actual_date: null,
      status: m.status && String(m.status).toLowerCase().includes("complete") ? "Not Started" : (m.status || "Not Started"),
      owner: m.owner ?? null,
      notes: m.notes ?? null,
      stage_gate_id: null,
    }));
    const { error } = await supabase.from("milestones").insert(rows as never);
    if (error) throw error;
    milestonesCopied = rows.length;
  }

  // FY allocations — copy plan figures
  const { data: fys, error: fyErr } = await supabase
    .from("fy_allocations")
    .select("*")
    .eq("stream_id", sourceStreamId);
  if (fyErr) throw fyErr;

  let fyCopied = 0;
  if (fys && fys.length > 0) {
    const rows = fys.map((f: any) => ({
      org_id: f.org_id,
      project_id: f.project_id,
      stream_id: stream.id,
      fy: f.fy,
      budget: f.budget ?? 0,
      forecast: f.forecast ?? f.budget ?? 0,
      capex: f.capex ?? 0,
      opex: f.opex ?? 0,
      benefits: f.benefits ?? 0,
    }));
    const { error } = await supabase.from("fy_allocations").insert(rows as never);
    if (error) throw error;
    fyCopied = rows.length;
  }

  // Monthly financials — keep planned/forecast, zero actuals
  const { data: monthly, error: monErr } = await supabase
    .from("financials_monthly")
    .select("*")
    .eq("stream_id", sourceStreamId);
  if (monErr) throw monErr;

  let monthlyCopied = 0;
  if (monthly && monthly.length > 0) {
    const rows = monthly.map((r: any) => ({
      org_id: r.org_id,
      project_id: r.project_id,
      stream_id: stream.id,
      period_month: r.period_month,
      capex_planned: r.capex_planned ?? 0,
      capex_forecast: r.capex_forecast ?? r.capex_planned ?? 0,
      capex_actual: 0,
      opex_planned: r.opex_planned ?? 0,
      opex_forecast: r.opex_forecast ?? r.opex_planned ?? 0,
      opex_actual: 0,
      benefits_planned: r.benefits_planned ?? 0,
      benefits_actual: 0,
    }));
    const { error } = await supabase.from("financials_monthly").insert(rows as never);
    if (error) throw error;
    monthlyCopied = rows.length;
  }

  return { stream, gatesCopied, milestonesCopied, fyCopied, monthlyCopied };
}
