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
    stream_name: s.name,
    project_name: project.name,
    project_code: project.project_code,
    program: project.program,
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
    for (const s of projectStreams) {
      const streamGates = (opts?.gates || []).filter(
        (g) => g.stream_id === s.id || (!g.stream_id && g.project_id === p.id && s.is_default),
      );
      const phase = opts?.resolvePhase?.(p, streamGates) ?? p.current_phase;
      lanes.push(streamToTimelineLane(p, s, phase));
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
