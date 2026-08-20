/**
 * Project-level stage-gate approval (delivery-method template).
 * Prefer `stage_gates` rows with null stream_id; fall back to the first
 * stream-owned row of the same gate name.
 */
import { supabase } from "@/integrations/supabase/client";
import { GATE_DIST_STATUSES } from "@/lib/stage-gate-flow";
import {
  defaultGatesForMethodCode,
  fetchGateNamesForMethod,
  findDeliveryMethod,
  methodUsesStageGates,
  type DeliveryMethodRow,
} from "@/lib/delivery-methods";
import { persistCurrentPhaseFromGates, sortGatesByOrgOrder } from "@/lib/project-phase";

export const GATE_APPROVAL_STATUSES = GATE_DIST_STATUSES;

export type GateApprovalStatus = (typeof GATE_APPROVAL_STATUSES)[number];

export type StageGateApprovalLike = {
  id?: string;
  project_id: string;
  stream_id?: string | null;
  gate_name?: string | null;
  status?: string | null;
};

/** Selected statuses per gate. Keys are `methodId::gateName` (legacy: gate name only). */
export type GateStatusFilter = Record<string, string[]>;

export type MethodGateGroup = {
  methodId: string;
  methodName: string;
  methodCode: string;
  gateNames: string[];
};

export type ProjectMethodLike = {
  id?: string;
  delivery_method_id?: string | null;
  delivery_method?: string | null;
};

export function methodGateFilterKey(methodId: string, gateName: string) {
  return `${methodId}::${gateName}`;
}

export function parseMethodGateFilterKey(key: string): { methodId: string; gateName: string } {
  const i = key.indexOf("::");
  if (i <= 0) return { methodId: "", gateName: key };
  return { methodId: key.slice(0, i), gateName: key.slice(i + 2) };
}

export function buildMethodGateGroups(
  methods: DeliveryMethodRow[],
  defs: {
    gate_name?: string | null;
    delivery_method_id?: string | null;
    sort_order?: number | null;
  }[] = [],
): MethodGateGroup[] {
  const gated = methods.filter((m) => methodUsesStageGates(m));
  return gated
    .map((m) => {
      const names = defs
        .filter((d) => (d.delivery_method_id || "") === m.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((d) => String(d.gate_name || "").trim())
        .filter(Boolean);
      const unique: string[] = [];
      const seen = new Set<string>();
      for (const n of names.length ? names : [...defaultGatesForMethodCode(m.code)]) {
        if (seen.has(n)) continue;
        seen.add(n);
        unique.push(n);
      }
      return {
        methodId: m.id,
        methodName: m.name,
        methodCode: m.code,
        gateNames: unique,
      };
    })
    .filter((g) => g.gateNames.length);
}

export function resolveProjectMethodId(
  project?: ProjectMethodLike | null,
  methods: DeliveryMethodRow[] = [],
) {
  if (project?.delivery_method_id) {
    if (!methods.length || methods.some((m) => m.id === project.delivery_method_id)) {
      return project.delivery_method_id;
    }
  }
  return findDeliveryMethod(methods, project?.delivery_method)?.id || "";
}

export function gateStatusFilterActive(f: GateStatusFilter | null | undefined) {
  if (!f) return false;
  return Object.values(f).some((s) => Array.isArray(s) && s.length > 0);
}

export function normalizeGateStatus(raw?: string | null): GateApprovalStatus {
  const s = String(raw || "Pending").trim();
  return (GATE_APPROVAL_STATUSES as readonly string[]).includes(s)
    ? (s as GateApprovalStatus)
    : "Pending";
}

function uniqueGatesByName<T extends StageGateApprovalLike>(rows: T[], orgPhases: string[] = []) {
  const byName = new Map<string, T>();
  for (const g of rows) {
    const n = String(g.gate_name || "").trim();
    if (!n) continue;
    const prev = byName.get(n);
    // Prefer project-level (null stream_id) when the same name exists on a stream.
    if (!prev || (prev.stream_id && !g.stream_id)) byName.set(n, g);
  }
  return sortGatesByOrgOrder([...byName.values()], orgPhases) as T[];
}

export function projectLevelGates<T extends StageGateApprovalLike>(
  gates: T[],
  projectId: string,
  orgPhases: string[] = [],
): T[] {
  return uniqueGatesByName(
    gates.filter((g) => g.project_id === projectId),
    orgPhases,
  );
}

/** Project gates that exist, ordered by the delivery-method template. */
export function projectApprovalGates<T extends StageGateApprovalLike>(
  gates: T[],
  projectId: string,
  methodGateNames: string[] = [],
): T[] {
  const unique = projectLevelGates(gates, projectId, methodGateNames);
  if (!methodGateNames.length) return unique;
  const byName = new Map(unique.map((g) => [String(g.gate_name || "").trim(), g] as const));
  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const n of methodGateNames) {
    const g = byName.get(n);
    if (!g || seen.has(n)) continue;
    ordered.push(g);
    seen.add(n);
  }
  for (const g of unique) {
    const n = String(g.gate_name || "").trim();
    if (!n || seen.has(n)) continue;
    ordered.push(g);
    seen.add(n);
  }
  return ordered;
}

/**
 * Gates offered when recording RAID against a project (and optional stream).
 * Stream-owned rows win when that stream has its own template; otherwise
 * fall back to project-level (null stream_id) rows.
 */
export function gatesForRaidScope<T extends StageGateApprovalLike>(
  gates: T[],
  projectId: string,
  streamId?: string | null,
  orgPhases: string[] = [],
): T[] {
  const all = gates.filter((g) => g.project_id === projectId);
  if (streamId) {
    const streamRows = all.filter((g) => g.stream_id === streamId);
    if (streamRows.length) return uniqueGatesByName(streamRows, orgPhases);
  }
  return projectLevelGates(all, projectId, orgPhases);
}

/** Keep the same gate name when the RAID stream (or project) scope changes. */
export function remapGateIdForScope(
  gates: StageGateApprovalLike[],
  projectId: string,
  streamId: string | null | undefined,
  currentGateId: string | null | undefined,
  orgPhases: string[] = [],
): string {
  const scoped = gatesForRaidScope(gates, projectId, streamId, orgPhases);
  if (currentGateId && scoped.some((g) => g.id === currentGateId)) return currentGateId;
  if (!currentGateId) return "";
  const current = gates.find((g) => g.id === currentGateId);
  const name = String(current?.gate_name || "").trim();
  if (!name) return "";
  return scoped.find((g) => String(g.gate_name || "").trim() === name)?.id || "";
}

export function projectHasGateStatus(
  gates: StageGateApprovalLike[],
  projectId: string,
  gateName: string,
  statuses: string[],
) {
  if (!statuses.length) return true;
  const wanted = new Set(statuses.map((s) => normalizeGateStatus(s)));
  const rows = gates.filter(
    (g) => g.project_id === projectId && String(g.gate_name || "").trim() === gateName,
  );
  if (!rows.length) return false;
  const top = rows.filter((g) => !g.stream_id);
  const check = top.length ? top : rows;
  return check.some((g) => wanted.has(normalizeGateStatus(g.status)));
}

/** AND across named gates for the project's delivery method. */
export function projectMatchesGateStatusFilter(
  gates: StageGateApprovalLike[],
  projectId: string,
  selected: GateStatusFilter | null | undefined,
  project?: ProjectMethodLike | null,
  methods: DeliveryMethodRow[] = [],
) {
  if (!gateStatusFilterActive(selected)) return true;
  const entries = Object.entries(selected!).filter(([, statuses]) => statuses?.length);
  if (!entries.length) return true;

  const methodId = resolveProjectMethodId(project, methods);
  const scoped = entries.filter(([key]) => parseMethodGateFilterKey(key).methodId);
  const forProject = entries.filter(([key]) => {
    const parsed = parseMethodGateFilterKey(key);
    if (!parsed.methodId) return true;
    return !!methodId && parsed.methodId === methodId;
  });

  if (scoped.length && !forProject.length) return false;

  return forProject.every(([key, statuses]) => {
    const { gateName } = parseMethodGateFilterKey(key);
    if (!gateName || !statuses?.length) return true;
    return projectHasGateStatus(gates, projectId, gateName, statuses);
  });
}

export async function methodGateNames(
  orgId: string,
  method?: Pick<DeliveryMethodRow, "id" | "code"> | null,
) {
  if (method?.id) {
    const names = await fetchGateNamesForMethod(orgId, method.id);
    if (names.length) return names;
  }
  return [...defaultGatesForMethodCode(method?.code || "waterfall")];
}

/**
 * Ensure a project-level (null stream_id) row exists for each gate that
 * already lives on this project (stream or project). Do not insert extra
 * delivery-method template names the project does not have.
 */
export async function ensureProjectLevelGates(opts: {
  orgId: string;
  projectId: string;
  deliveryMethodId?: string | null;
  deliveryMethodName?: string | null;
  methods?: DeliveryMethodRow[];
}): Promise<StageGateApprovalLike[]> {
  const { data, error } = await supabase
    .from("stage_gates")
    .select("id,project_id,stream_id,gate_name,status")
    .eq("project_id", opts.projectId);
  if (error) throw error;
  const existing = (data ?? []) as StageGateApprovalLike[];
  const top = existing.filter((g) => !g.stream_id);
  const have = new Set(top.map((g) => String(g.gate_name || "").trim()).filter(Boolean));
  const onProject = new Set(existing.map((g) => String(g.gate_name || "").trim()).filter(Boolean));
  const toInsert = [...onProject]
    .filter((n) => n && !have.has(n))
    .map((gate_name) => {
      const fromStream = existing.find((g) => String(g.gate_name || "").trim() === gate_name);
      return {
        org_id: opts.orgId,
        project_id: opts.projectId,
        stream_id: null,
        gate_name,
        status: normalizeGateStatus(fromStream?.status),
      };
    });
  if (toInsert.length) {
    const { error: insErr } = await supabase.from("stage_gates").insert(toInsert as never);
    if (insErr) throw insErr;
  }
  const { data: refreshed } = await supabase
    .from("stage_gates")
    .select("id,project_id,stream_id,gate_name,status")
    .eq("project_id", opts.projectId);
  return projectApprovalGates(
    (refreshed ?? []) as StageGateApprovalLike[],
    opts.projectId,
    await methodGateNames(
      opts.orgId,
      (opts.deliveryMethodId
        ? (opts.methods || []).find((m) => m.id === opts.deliveryMethodId)
        : undefined) || findDeliveryMethod(opts.methods || [], opts.deliveryMethodName),
    ),
  );
}

/**
 * Set approval status for a gate and keep every row of the same
 * project + gate name in lockstep (project-level and each stream).
 * That way Stage Gates, Overview, and Decisions never diverge.
 */
export async function setStageGateStatus(opts: {
  gateId: string;
  projectId: string;
  status: string;
}) {
  const status = normalizeGateStatus(opts.status);
  const patch = {
    status,
    ...(/approved/i.test(status) ? { actual_date: new Date().toISOString().slice(0, 10) } : {}),
  };

  const { data: source, error: srcErr } = await supabase
    .from("stage_gates")
    .select("id,org_id,project_id,gate_name")
    .eq("id", opts.gateId)
    .maybeSingle();
  if (srcErr) throw srcErr;

  const projectId = opts.projectId || (source?.project_id as string | undefined);
  const gateName = String(source?.gate_name || "").trim();

  if (!projectId || !gateName) {
    const { error } = await supabase
      .from("stage_gates")
      .update(patch as never)
      .eq("id", opts.gateId);
    if (error) throw error;
    if (projectId) await persistCurrentPhaseFromGates(supabase as never, projectId);
    return;
  }

  const { error } = await supabase
    .from("stage_gates")
    .update(patch as never)
    .eq("project_id", projectId)
    .eq("gate_name", gateName);
  if (error) throw error;

  // Overview / Decisions prefer null-stream rows. Create one if the register
  // only had stream-owned gates (common after Core stream enable).
  const { data: top, error: topErr } = await supabase
    .from("stage_gates")
    .select("id")
    .eq("project_id", projectId)
    .eq("gate_name", gateName)
    .is("stream_id", null)
    .limit(1);
  if (topErr) throw topErr;
  if (!top?.length && source?.org_id) {
    const { error: insErr } = await supabase.from("stage_gates").insert({
      org_id: source.org_id,
      project_id: projectId,
      stream_id: null,
      gate_name: gateName,
      ...patch,
    } as never);
    if (insErr) throw insErr;
  }

  await persistCurrentPhaseFromGates(supabase as never, projectId);
}
