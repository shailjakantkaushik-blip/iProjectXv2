import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type ProjectStream = Tables<"project_streams">;
export type ProjectStreamInsert = TablesInsert<"project_streams">;
export type ProjectStreamUpdate = TablesUpdate<"project_streams">;

/**
 * Short stable stream code under a project (Excel `stream_code`, UI badges).
 * Prefer explicit `code`, else CORE for default, else a compact name slug.
 */
export function formatStreamCode(stream: {
  code?: string | null;
  name?: string | null;
  is_default?: boolean | null;
}) {
  const code = String(stream.code || "").trim();
  if (code) return code.toUpperCase();
  if (stream.is_default) return "CORE";
  const name = String(stream.name || "").trim();
  if (!name) return "STR";
  const slug = name.replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
  return (slug.slice(0, 6) || "STR");
}

/** Display label: "Experience (XP)" when code differs from name. */
export function formatStreamLabel(stream: {
  code?: string | null;
  name?: string | null;
  is_default?: boolean | null;
}) {
  const name = String(stream.name || "").trim() || "Stream";
  const code = formatStreamCode(stream);
  return code && code !== name.toUpperCase() ? `${name} (${code})` : name;
}

/**
 * Cross-app identity for a stream within a project: `PRJ-001 · CORE`.
 * Prefer this over raw UUIDs in tables, timelines, and registers.
 */
export function formatProjectStreamRef(
  project: { project_code?: string | null; name?: string | null },
  stream: { code?: string | null; name?: string | null; is_default?: boolean | null },
) {
  const proj = String(project.project_code || "").trim() || project.name || "Project";
  return `${proj} · ${formatStreamCode(stream)}`;
}

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
  const streamCode = formatStreamCode(s);
  const streamLabel = formatStreamLabel(s);
  const streamRef = formatProjectStreamRef(project, s);
  return {
    ...s,
    // Lane identity: unique per stream for gates + React keys
    id: s.id,
    stream_id: s.id,
    project_id: project.id,
    is_stream_lane: true as const,
    name: `${project.name || "Project"} · ${s.name}`,
    stream_name: s.name as string | null,
    stream_code: streamCode,
    stream_label: streamLabel,
    /** Human stream id under the project, e.g. PRJ-001 · CORE */
    stream_ref: streamRef,
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

/** Min/max dates + summed finance from streams (mirrors DB rollup_project_from_streams). */
export function rollupFieldsFromStreams(
  project: Record<string, any>,
  streams: (ProjectStream | Record<string, any>)[],
) {
  if (!streams.length) {
    return {
      planned_start_date: project.planned_start_date ?? null,
      planned_end_date: project.planned_end_date ?? null,
      actual_start_date: project.actual_start_date ?? null,
      actual_end_date: project.actual_end_date ?? null,
      start_date: project.start_date ?? project.planned_start_date ?? project.actual_start_date ?? null,
      end_date: project.end_date ?? project.actual_end_date ?? project.planned_end_date ?? null,
      budget: Number(project.budget || 0),
      capex_approved: Number(project.capex_approved || 0),
      capex_incurred: Number(project.capex_incurred || 0),
      opex_approved: Number(project.opex_approved || 0),
      opex_incurred: Number(project.opex_incurred || 0),
      forecast_at_completion: project.forecast_at_completion ?? null,
    };
  }
  const asRec = (s: ProjectStream | Record<string, any>) => s as Record<string, any>;
  const dates = (key: string) =>
    streams.map((s) => asRec(s)[key]).filter(Boolean).map((d) => String(d).slice(0, 10)).sort();
  const min = (key: string) => {
    const arr = dates(key);
    return arr.length ? arr[0] : null;
  };
  const max = (key: string) => {
    const arr = dates(key);
    return arr.length ? arr[arr.length - 1] : null;
  };
  const sum = (key: string) => streams.reduce((n, s) => n + Number(asRec(s)[key] || 0), 0);
  const plannedStart = min("planned_start_date");
  const plannedEnd = max("planned_end_date");
  const actualStart = min("actual_start_date");
  const actualEnd = max("actual_end_date");
  return {
    planned_start_date: plannedStart,
    planned_end_date: plannedEnd,
    actual_start_date: actualStart,
    actual_end_date: actualEnd,
    start_date: actualStart || plannedStart || project.start_date || null,
    end_date: actualEnd || plannedEnd || project.end_date || null,
    budget: sum("budget"),
    capex_approved: sum("capex_approved"),
    capex_incurred: sum("capex_incurred"),
    opex_approved: sum("opex_approved"),
    opex_incurred: sum("opex_incurred"),
    forecast_at_completion: streams.reduce(
      (n, s) => n + Number(s.forecast_at_completion ?? s.budget ?? 0),
      0,
    ),
  };
}

/** Project-level timeline lane (rollup of streams) for optional Project timeline view. */
export function projectToRollupLane(
  project: Record<string, any>,
  streams: (ProjectStream | Record<string, any>)[],
  phase?: string | null,
) {
  const rolled = rollupFieldsFromStreams(project, streams);
  return {
    ...project,
    ...rolled,
    id: project.id,
    project_id: project.id,
    stream_id: null,
    is_stream_lane: false as const,
    is_project_rollup: true as const,
    name: project.name,
    stream_name: null,
    project_name: project.name,
    current_phase: phase ?? project.current_phase,
  };
}

/**
 * Expand projects into timeline lanes.
 * Default: one lane per stream (always-on Core). Fallback to project row if no streams yet.
 * Optional `includeProjectRollup` prepends a project start→end / finance rollup lane.
 */
export function expandProjectsToTimelineLanes(
  projects: any[],
  streams: ProjectStream[] | Record<string, any>[],
  opts?: {
    gates?: { project_id: string; stream_id?: string | null; gate_name?: string | null; status?: string | null }[];
    resolvePhase?: (project: any, streamGates: any[]) => string | null;
    /** When true, insert a project rollup lane (dates + finance from streams) above stream lanes. */
    includeProjectRollup?: boolean;
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
    const projectStreams = byProject.get(p.id) || [];
    if (projectStreams.length === 0) {
      // No streams yet (pre-migration) — project lane only
      lanes.push({ ...p, is_stream_lane: false, is_project_rollup: false, project_id: p.id });
      continue;
    }

    if (opts?.includeProjectRollup) {
      const allGates = (opts?.gates || []).filter((g) => g.project_id === p.id);
      const phase = opts?.resolvePhase?.(p, allGates) ?? p.current_phase;
      lanes.push(projectToRollupLane(p, projectStreams, phase));
    }

    const multi = projectStreams.length > 1;
    for (const s of projectStreams) {
      const streamGates = (opts?.gates || []).filter(
        (g) => g.stream_id === s.id || (!g.stream_id && g.project_id === p.id && s.is_default),
      );
      const phase = opts?.resolvePhase?.(p, streamGates) ?? p.current_phase;
      const lane = streamToTimelineLane(p, s, phase);
      // Single Core without project rollup: project-first label, keep stream code identity.
      if (!multi && s.is_default && !opts?.includeProjectRollup) {
        lane.name = p.name || lane.name;
        // Keep stream_name / stream_code / stream_ref so the lane stays identifiable.
      }
      lanes.push(lane);
    }
  }
  return lanes;
}

/** Aggregate group header financials without double-counting project rollup + stream lanes. */
export function summarizeTimelineLaneFinancials(items: any[]) {
  const byPid = new Map<string, any[]>();
  for (const item of items) {
    const pid = String(item.project_id || item.id);
    const list = byPid.get(pid) || [];
    list.push(item);
    byPid.set(pid, list);
  }
  let budget = 0;
  let approved = 0;
  let incurred = 0;
  let fac = 0;
  let benefits = 0;
  let green = 0;
  let amber = 0;
  let red = 0;
  for (const lanes of byPid.values()) {
    const rollup = lanes.find((l) => l.is_project_rollup);
    const source = rollup
      ? [rollup]
      : lanes.filter((l) => l.is_stream_lane || (!l.is_stream_lane && !l.is_project_rollup));
    const use = source.length ? source : lanes;
    for (const row of use) {
      budget += Number(row.budget || 0);
      approved += Number(row.capex_approved || 0) + Number(row.opex_approved || 0);
      incurred += Number(row.capex_incurred || 0) + Number(row.opex_incurred || 0);
      fac += Number(row.forecast_at_completion || row.fac || 0);
      benefits += Number(row.benefits_realised || 0);
    }
    const ragRow = rollup || use[0];
    if (ragRow?.rag === "Green") green += 1;
    else if (ragRow?.rag === "Amber") amber += 1;
    else if (ragRow?.rag === "Red") red += 1;
  }
  return {
    projectCount: byPid.size,
    budget,
    approved,
    incurred,
    fac,
    benefits,
    utilPct: approved > 0 ? Math.round((incurred / approved) * 100) : 0,
    green,
    amber,
    red,
  };
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

/** Ensure Core stream exists (always-on model) + migrate null-stream children. */
export async function enableProjectStreams(projectId: string) {
  const { data, error } = await supabase.rpc("enable_project_streams", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return data as string;
}

/** Alias for always-on Core ensure (same RPC). */
export async function ensureProjectCoreStream(projectId: string) {
  return enableProjectStreams(projectId);
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
      status: source.status || "In Progress",
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
