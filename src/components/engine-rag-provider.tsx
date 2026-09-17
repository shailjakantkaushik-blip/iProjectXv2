import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { FINANCIALS_MONTHLY_SELECT, PROJECT_PORTFOLIO_SELECT } from "@/lib/query-selects";
import { parentEnvelopeContext } from "@/lib/hierarchy-envelope";
import { shownRag, type RagProjectLike } from "@/lib/ops-enhancements";
import { buildEngineRagById, useHealthEngineLookups } from "@/hooks/use-health-engine-lookups";

type Ctx = {
  byId: Map<string, string>;
  ready: boolean;
};

const EngineRagContext = createContext<Ctx>({
  byId: new Map(),
  ready: false,
});

export function useEngineRagMap() {
  return useContext(EngineRagContext).byId;
}

export function useEngineRagReady() {
  return useContext(EngineRagContext).ready;
}

/** RAG to show on chips / filters: override else Health Engine. */
export function useShownRag() {
  const byId = useEngineRagMap();
  return (project: RagProjectLike | null | undefined) => shownRag(project, byId);
}

export function EngineRagProvider({ children }: { children: ReactNode }) {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const fyStartMonth = organization?.fy_start_month || 4;
  const lookups = useHealthEngineLookups(orgId);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(PROJECT_PORTFOLIO_SELECT as "*");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gates")
        .select("id,project_id,stream_id,gate_name,planned_date,actual_date,status");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const { data: monthly = [] } = useQuery({
    queryKey: ["financials_monthly", orgId, "explain"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financials_monthly")
        .select(FINANCIALS_MONTHLY_SELECT as "*")
        .eq("org_id", orgId!)
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const parentCtx = useMemo(
    () => parentEnvelopeContext(projects as never, lookups.envelopeIndex),
    [projects, lookups.envelopeIndex],
  );

  const byId = useMemo(
    () =>
      buildEngineRagById(
        projects as { id?: string | null }[],
        lookups,
        gates as { project_id?: string | null }[],
        monthly as never,
        fyStartMonth,
        parentCtx,
      ),
    [projects, lookups, gates, monthly, fyStartMonth, parentCtx],
  );

  const ready = !!orgId && byId.size > 0;
  const value = useMemo(() => ({ byId, ready }), [byId, ready]);

  return <EngineRagContext.Provider value={value}>{children}</EngineRagContext.Provider>;
}
