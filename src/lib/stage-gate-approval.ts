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

/** Selected statuses per gate name. Empty object / empty arrays = no filter. */
export type GateStatusFilter = Record<string, string[]>;

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

export function projectLevelGates<T extends StageGateApprovalLike>(
  gates: T[],
  projectId: string,
  orgPhases: string[] = [],
): T[] {
  const all = gates.filter((g) => g.project_id === projectId);
  const top = all.filter((g) => !g.stream_id);
  const source = top.length ? top : all;
  const byName = new Map<string, T>();
  for (const g of source) {
    const n = String(g.gate_name || "").trim();
    if (!n || byName.has(n)) continue;
    byName.set(n, g);
  }
  return sortGatesByOrgOrder([...byName.values()], orgPhases) as T[];
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

/** AND across named gates: each selected gate must match one of its statuses. */
export function projectMatchesGateStatusFilter(
  gates: StageGateApprovalLike[],
  projectId: string,
  selected: GateStatusFilter | null | undefined,
) {
  if (!gateStatusFilterActive(selected)) return true;
  return Object.entries(selected!).every(([name, statuses]) => {
    if (!statuses?.length) return true;
    return projectHasGateStatus(gates, projectId, name, statuses);
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
 * Ensure a project-level (null stream_id) row exists for each method gate.
 * Copies status from an existing stream gate of the same name when creating.
 */
export async function ensureProjectLevelGates(opts: {
  orgId: string;
  projectId: string;
  deliveryMethodId?: string | null;
  deliveryMethodName?: string | null;
  methods?: DeliveryMethodRow[];
}): Promise<StageGateApprovalLike[]> {
  const method =
    (opts.deliveryMethodId
      ? (opts.methods || []).find((m) => m.id === opts.deliveryMethodId)
      : undefined) || findDeliveryMethod(opts.methods || [], opts.deliveryMethodName);
  const names = await methodGateNames(opts.orgId, method);
  const { data, error } = await supabase
    .from("stage_gates")
    .select("id,project_id,stream_id,gate_name,status")
    .eq("project_id", opts.projectId);
  if (error) throw error;
  const existing = (data ?? []) as StageGateApprovalLike[];
  const top = existing.filter((g) => !g.stream_id);
  const have = new Set(top.map((g) => String(g.gate_name || "").trim()));
  const toInsert = names
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
    .eq("project_id", opts.projectId)
    .is("stream_id", null);
  return (refreshed ?? []) as StageGateApprovalLike[];
}

export async function setStageGateStatus(opts: {
  gateId: string;
  projectId: string;
  status: string;
}) {
  const status = normalizeGateStatus(opts.status);
  const { error } = await supabase
    .from("stage_gates")
    .update({
      status,
      ...(/approved/i.test(status) ? { actual_date: new Date().toISOString().slice(0, 10) } : {}),
    } as never)
    .eq("id", opts.gateId);
  if (error) throw error;
  await persistCurrentPhaseFromGates(supabase as never, opts.projectId);
}
