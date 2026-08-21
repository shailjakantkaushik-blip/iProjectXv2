import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  indexHierarchyEnvelopes,
  type HierarchyEnvelopeLayer,
  type HierarchyEnvelopeRow,
} from "@/lib/hierarchy-envelope";

export function useHierarchyEnvelopes(orgId: string | null | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["hierarchy_envelopes", orgId];

  const q = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hierarchy_envelopes" as never)
        .select("id,org_id,layer,name,envelope,notes")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as HierarchyEnvelopeRow[];
    },
    enabled: !!orgId,
    staleTime: 15_000,
  });

  const index = useMemo(() => indexHierarchyEnvelopes(q.data), [q.data]);

  const save = useMutation({
    mutationFn: async (input: {
      layer: HierarchyEnvelopeLayer;
      name: string;
      envelope: number | null;
    }) => {
      if (!orgId) throw new Error("Organisation is required");
      const name = input.name.trim() || "Unassigned";
      const payload = {
        org_id: orgId,
        layer: input.layer,
        name,
        envelope: input.envelope,
        updated_by: user?.id ?? null,
      };
      const { error } = await supabase
        .from("hierarchy_envelopes" as never)
        .upsert(payload as never, { onConflict: "org_id,layer,name" });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
    },
  });

  const saveEnvelope = useCallback(
    (layer: HierarchyEnvelopeLayer, name: string, envelope: number | null) =>
      save.mutateAsync({ layer, name, envelope }),
    [save],
  );

  return {
    rows: q.data ?? [],
    index,
    isLoading: q.isLoading,
    saveEnvelope,
    saving: save.isPending,
  };
}
