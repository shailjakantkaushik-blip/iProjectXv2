/**
 * Shared Health Engine lookups so Executive / Cockpit score the same way.
 * Query keys match the cockpit so pages share the React Query cache.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HEALTH_ENGINE_RISKS_SELECT } from "@/lib/query-selects";
import {
  computeProjectHealth,
  type ProjectHealthComputed,
  type ProjectHealthLike,
  type StageGateHealthLike,
} from "@/lib/project-health";
import type { HealthEngineInput } from "@/lib/project-health-engine";
import {
  indexHierarchyEnvelopes,
  parentWatchesForProject,
  type ParentEnvelopeContext,
} from "@/lib/hierarchy-envelope";

export function groupRowsByProjectId<T extends { project_id?: string | null }>(rows: T[]) {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const id = r.project_id;
    if (!id) continue;
    const list = m.get(id) || [];
    list.push(r);
    m.set(id, list);
  }
  return m;
}

export function useHealthEngineLookups(orgId: string | null | undefined) {
  const risksQ = useQuery({
    queryKey: ["risks", orgId, "cockpit-health"],
    queryFn: async () =>
      (
        await supabase
          .from("risks")
          .select(HEALTH_ENGINE_RISKS_SELECT)
          .eq("org_id", orgId!)
          .limit(10000)
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const depsQ = useQuery({
    queryKey: ["dependencies", orgId, "portfolio-pulse"],
    queryFn: async () =>
      (
        await supabase
          .from("dependencies")
          .select("id,project_id,status,dep_type,needed_by")
          .eq("org_id", orgId!)
          .limit(10000)
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const workItemsQ = useQuery({
    queryKey: ["work_items", orgId, "portfolio-pulse"],
    queryFn: async () =>
      (
        await supabase
          .from("work_items" as never)
          .select("id,project_id,status,percent_complete,estimate_hours")
          .eq("org_id", orgId!)
          .limit(10000)
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const allocationsQ = useQuery({
    queryKey: ["resource_allocations", orgId, "portfolio-pulse"],
    queryFn: async () =>
      (
        await supabase
          .from("resource_allocations")
          .select("id,project_id,allocation_percent,allocated_hours")
          .eq("org_id", orgId!)
          .limit(10000)
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const crsQ = useQuery({
    queryKey: ["change_requests", orgId, "cockpit-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("change_requests" as never)
        .select("id,project_id,status,change_type,impact_cost,impact_schedule_days")
        .eq("org_id", orgId!)
        .limit(10000);
      if (error) return [];
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const fyAllocQ = useQuery({
    queryKey: ["fy_allocations", orgId, "health"],
    queryFn: async () =>
      (
        await supabase
          .from("fy_allocations")
          .select("id,project_id,fy,budget,forecast,capex,opex,benefits")
          .eq("org_id", orgId!)
          .limit(10000)
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const benefitsQ = useQuery({
    queryKey: ["benefits", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("benefits")
          .select("id,project_id,target_value,realised_value")
          .eq("org_id", orgId!)
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const envelopesQ = useQuery({
    queryKey: ["hierarchy_envelopes", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hierarchy_envelopes" as never)
        .select("id,org_id,layer,name,envelope,notes")
        .eq("org_id", orgId!);
      if (error) return [];
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 15_000,
  });

  const risksByProject = useMemo(
    () => groupRowsByProjectId((risksQ.data ?? []) as { project_id?: string | null }[]),
    [risksQ.data],
  );
  const depsByProject = useMemo(
    () => groupRowsByProjectId((depsQ.data ?? []) as { project_id?: string | null }[]),
    [depsQ.data],
  );
  const workItemsByProject = useMemo(
    () => groupRowsByProjectId((workItemsQ.data ?? []) as { project_id?: string | null }[]),
    [workItemsQ.data],
  );
  const allocationsByProject = useMemo(
    () => groupRowsByProjectId((allocationsQ.data ?? []) as { project_id?: string | null }[]),
    [allocationsQ.data],
  );
  const crsByProject = useMemo(
    () => groupRowsByProjectId((crsQ.data ?? []) as { project_id?: string | null }[]),
    [crsQ.data],
  );
  const benefitsByProject = useMemo(
    () => groupRowsByProjectId((benefitsQ.data ?? []) as { project_id?: string | null }[]),
    [benefitsQ.data],
  );
  const fyAllocByProject = useMemo(
    () => groupRowsByProjectId((fyAllocQ.data ?? []) as { project_id?: string | null }[]),
    [fyAllocQ.data],
  );
  const envelopeIndex = useMemo(
    () => indexHierarchyEnvelopes(envelopesQ.data as never),
    [envelopesQ.data],
  );

  return useMemo(
    () => ({
      risks: risksQ.data ?? [],
      dependencies: depsQ.data ?? [],
      workItems: workItemsQ.data ?? [],
      allocations: allocationsQ.data ?? [],
      changeRequests: crsQ.data ?? [],
      benefits: benefitsQ.data ?? [],
      fyAllocations: fyAllocQ.data ?? [],
      envelopes: envelopesQ.data ?? [],
      envelopeIndex,
      risksByProject,
      depsByProject,
      workItemsByProject,
      allocationsByProject,
      crsByProject,
      benefitsByProject,
      fyAllocByProject,
    }),
    [
      risksQ.data,
      depsQ.data,
      workItemsQ.data,
      allocationsQ.data,
      crsQ.data,
      benefitsQ.data,
      fyAllocQ.data,
      envelopesQ.data,
      envelopeIndex,
      risksByProject,
      depsByProject,
      workItemsByProject,
      allocationsByProject,
      crsByProject,
      benefitsByProject,
      fyAllocByProject,
    ],
  );
}

export function healthExtrasForProject(
  projectId: string,
  lookups: ReturnType<typeof useHealthEngineLookups>,
  monthly: HealthEngineInput["monthly"] = [],
  fyStartMonth?: number | null,
  parent?: {
    project: { portfolio?: string | null; program?: string | null };
    ctx: ParentEnvelopeContext;
  },
): Omit<Partial<HealthEngineInput>, "project" | "gates"> {
  return {
    monthly,
    fyStartMonth,
    fyAllocations: lookups.fyAllocByProject.get(projectId) || [],
    risks: lookups.risksByProject.get(projectId) || [],
    dependencies: lookups.depsByProject.get(projectId) || [],
    workItems: lookups.workItemsByProject.get(projectId) || [],
    allocations: lookups.allocationsByProject.get(projectId) || [],
    changeRequests: lookups.crsByProject.get(projectId) || [],
    benefitLines: lookups.benefitsByProject.get(projectId) || [],
    parentEnvelopes: parent
      ? parentWatchesForProject(
          parent.project,
          parent.ctx.envelopes,
          parent.ctx.alignmentApproved,
          parent.ctx.programApproved,
        )
      : undefined,
  } as Omit<Partial<HealthEngineInput>, "project" | "gates">;
}

/** Same Health Engine call the Cockpit matrix uses for the score / mix bar. */
export function computeEngineHealth(
  project: ProjectHealthLike,
  gates: StageGateHealthLike[],
  lookups: ReturnType<typeof useHealthEngineLookups>,
  monthly: HealthEngineInput["monthly"] = [],
  fyStartMonth?: number | null,
  parentCtx?: ParentEnvelopeContext,
): ProjectHealthComputed {
  const id = String(project.id || "");
  return computeProjectHealth(
    project,
    gates,
    healthExtrasForProject(
      id,
      lookups,
      monthly,
      fyStartMonth,
      parentCtx ? { project, ctx: parentCtx } : undefined,
    ),
  );
}
