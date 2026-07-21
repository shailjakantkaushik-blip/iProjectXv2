/**
 * Shared stage / current-phase resolution.
 * Prefer live stage_gates over free-text projects.current_phase so gate
 * progress automatically flows into portfolio views.
 */

export type StageGateLike = {
  gate_name?: string | null;
  status?: string | null;
  planned_date?: string | null;
  actual_date?: string | null;
};

export type ProjectPhaseLike = {
  id?: string;
  current_phase?: string | null;
};

export function normLabel(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Map a free-text phase/gate name onto the org's configured stage list. */
export function matchPhase(value: string | null | undefined, phases: string[]): string | null {
  if (!value) return null;
  const n = normLabel(value);
  const exact = phases.find((p) => normLabel(p) === n);
  if (exact) return exact;

  const tokens = n.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const fuzzy = phases.find((p) => {
    const pn = normLabel(p);
    if (pn.includes(n) || n.includes(pn)) return true;
    const pTokens = pn.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    return tokens.some((t) => pTokens.includes(t) || pn.includes(t));
  });
  return fuzzy ?? null;
}

export function isActiveGateStatus(status: string | null | undefined) {
  const s = normLabel(status || "pending");
  return [
    "pending",
    "in progress",
    "in-progress",
    "in review",
    "open",
    "on hold",
  ].includes(s);
}

export function isApprovedGateStatus(status: string | null | undefined) {
  return normLabel(status || "") === "approved";
}

export function isRejectedGateStatus(status: string | null | undefined) {
  return normLabel(status || "") === "rejected";
}

export function sortGatesByOrgOrder(gates: StageGateLike[], orgPhases: string[]) {
  const orderIdx = new Map<string, number>();
  orgPhases.forEach((name, i) => orderIdx.set(normLabel(name), i));
  return [...gates].sort((a, b) => {
    const oa = orderIdx.get(normLabel(a.gate_name || ""));
    const ob = orderIdx.get(normLabel(b.gate_name || ""));
    if (oa !== undefined && ob !== undefined) return oa - ob;
    const da = a.planned_date ? new Date(a.planned_date).getTime() : Infinity;
    const db = b.planned_date ? new Date(b.planned_date).getTime() : Infinity;
    return da - db;
  });
}

/**
 * Current stage: first in-flight gate, else last approved, else
 * projects.current_phase (fuzzy-matched to org gates).
 */
export function resolveCurrentStage(
  project: ProjectPhaseLike | null | undefined,
  gates: StageGateLike[] | null | undefined,
  orgPhases: string[] = [],
): string | null {
  const gs = gates ?? [];
  const sorted = sortGatesByOrgOrder(gs, orgPhases);

  const inFlight = sorted.find((g) => isActiveGateStatus(g.status));
  if (inFlight?.gate_name) {
    return matchPhase(inFlight.gate_name, orgPhases) ?? inFlight.gate_name;
  }

  const fromPhase = matchPhase(project?.current_phase, orgPhases);
  if (fromPhase) return fromPhase;

  const lastApproved = [...sorted].reverse().find((g) => isApprovedGateStatus(g.status));
  if (lastApproved?.gate_name) {
    return matchPhase(lastApproved.gate_name, orgPhases) ?? lastApproved.gate_name;
  }

  if (project?.current_phase) return project.current_phase;
  return null;
}

/** Current + next gate for register views (aligned with resolveCurrentStage). */
export function resolveCurrentAndNextGate(
  gates: StageGateLike[] | null | undefined,
  orgPhases: string[] = [],
) {
  const sorted = sortGatesByOrgOrder(gates ?? [], orgPhases);
  const current =
    sorted.find((g) => isActiveGateStatus(g.status)) ||
    [...sorted].reverse().find((g) => isApprovedGateStatus(g.status)) ||
    sorted[sorted.length - 1] ||
    null;
  const next =
    sorted.find((g) => !isApprovedGateStatus(g.status) && !isRejectedGateStatus(g.status)) || null;
  return { current, next };
}

/** Group project gates by project_id. */
export function groupGatesByProject<T extends StageGateLike & { project_id: string }>(
  gates: T[],
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const g of gates) {
    const list = m.get(g.project_id) || [];
    list.push(g);
    m.set(g.project_id, list);
  }
  return m;
}

/**
 * Persist resolved stage onto projects.current_phase so filters / data editor
 * stay aligned when stage gates are the source of truth.
 */
export async function persistCurrentPhaseFromGates(
  client: { from: (table: string) => any },
  projectId: string,
  orgPhases: string[] = [],
): Promise<string | null> {
  const { data: gates } = await client
    .from("stage_gates")
    .select("gate_name,status,planned_date,actual_date")
    .eq("project_id", projectId);
  const { data: project } = await client
    .from("projects")
    .select("current_phase")
    .eq("id", projectId)
    .maybeSingle();

  let phases = orgPhases;
  if (!phases.length) {
    const { data: defs } = await client
      .from("stage_gate_definitions")
      .select("gate_name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    phases = (defs ?? []).map((d: any) => d.gate_name).filter(Boolean);
  }

  const resolved = resolveCurrentStage(project, gates ?? [], phases);
  if (!resolved || resolved === project?.current_phase) return resolved;
  await client.from("projects").update({ current_phase: resolved }).eq("id", projectId);
  return resolved;
}
