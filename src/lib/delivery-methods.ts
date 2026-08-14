/**
 * Org delivery methods (Waterfall / Agile / Hybrid + custom).
 * Controls whether a project uses stage gates and/or sprints, and which
 * stage-gate definition template applies.
 */
import { supabase } from "@/integrations/supabase/client";

export type DeliveryMethodRow = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  description?: string | null;
  uses_stage_gates: boolean;
  uses_sprints: boolean;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
};

export const WATERFALL_GATE_DEFAULTS = [
  "Discovery",
  "Business Case / Seed Funding",
  "Design",
  "Business Case / Full Funding",
  "Build",
  "Testing",
  "Deployment",
  "Handover",
  "Benefit Realisation",
] as const;

export const AGILE_GATE_DEFAULTS = [
  "Discovery",
  "MVP Definition",
  "Build / Iterate",
  "Release Readiness",
  "Launch",
  "Hypercare",
] as const;

export function slugifyDeliveryCode(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || `method-${Date.now().toString(36)}`;
}

export function deliveryMethodsQueryKey(orgId: string | null | undefined) {
  return ["delivery_methods", orgId] as const;
}

/** Ensure built-in methods + default gate templates exist for the org. */
export async function ensureOrgDeliveryMethods(orgId: string) {
  const { error } = await supabase.rpc("ensure_org_delivery_methods", {
    p_org_id: orgId,
  });
  if (error) throw error;
}

export async function fetchDeliveryMethods(orgId: string, opts?: { activeOnly?: boolean }) {
  await ensureOrgDeliveryMethods(orgId).catch(() => {
    /* table/fn may not exist yet on older DBs — fall through to select */
  });
  let q = supabase
    .from("delivery_methods")
    .select("*")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true });
  if (opts?.activeOnly !== false) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DeliveryMethodRow[];
}

export function findDeliveryMethod(
  methods: DeliveryMethodRow[],
  nameOrCode?: string | null,
): DeliveryMethodRow | undefined {
  const key = String(nameOrCode || "").trim().toLowerCase();
  if (!key) return methods.find((m) => m.code === "waterfall") ?? methods[0];
  return (
    methods.find((m) => m.name.toLowerCase() === key || m.code === key) ??
    methods.find((m) => m.code === "waterfall") ??
    methods[0]
  );
}

/** Prefer DB flags; fall back to legacy name heuristics. */
export function methodUsesStageGates(
  method?: Pick<DeliveryMethodRow, "uses_stage_gates" | "name" | "code"> | null,
  deliveryMethodName?: string | null,
) {
  if (method) return Boolean(method.uses_stage_gates);
  const m = String(deliveryMethodName || "").trim().toLowerCase();
  return !m || m === "waterfall" || m === "hybrid";
}

export function methodUsesSprints(
  method?: Pick<DeliveryMethodRow, "uses_sprints" | "name" | "code"> | null,
  deliveryMethodName?: string | null,
) {
  if (method) return Boolean(method.uses_sprints);
  const m = String(deliveryMethodName || "").trim().toLowerCase();
  return m === "agile" || m === "hybrid";
}

export function defaultGatesForMethodCode(code: string): readonly string[] {
  if (code === "agile") return AGILE_GATE_DEFAULTS;
  return WATERFALL_GATE_DEFAULTS;
}
