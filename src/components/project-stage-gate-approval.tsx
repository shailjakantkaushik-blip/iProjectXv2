import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SectionFrame, SectionTitle } from "@/components/streamlit";
import {
  deliveryMethodsQueryKey,
  fetchDeliveryMethods,
  fetchGateNamesForMethod,
  findDeliveryMethod,
  methodUsesStageGates,
} from "@/lib/delivery-methods";
import {
  GATE_APPROVAL_STATUSES,
  ensureProjectLevelGates,
  normalizeGateStatus,
  projectApprovalGates,
  setStageGateStatus,
} from "@/lib/stage-gate-approval";
import { GATE_STATUS_COLORS } from "@/lib/chart-theme";

export function ProjectStageGateApproval({
  orgId,
  projectId,
  deliveryMethodId,
  deliveryMethodName,
  canEdit = true,
}: {
  orgId: string;
  projectId: string;
  deliveryMethodId?: string | null;
  deliveryMethodName?: string | null;
  canEdit?: boolean;
}) {
  const qc = useQueryClient();

  const { data: methods = [] } = useQuery({
    queryKey: deliveryMethodsQueryKey(orgId),
    queryFn: () => fetchDeliveryMethods(orgId),
    enabled: !!orgId,
  });

  const usesGates = methodUsesStageGates(
    methods.find((m) => m.id === deliveryMethodId) || undefined,
    deliveryMethodName,
  );

  const method =
    (deliveryMethodId && methods.find((m) => m.id === deliveryMethodId)) ||
    findDeliveryMethod(methods, deliveryMethodName);

  const { data: methodGateNames = [] } = useQuery({
    queryKey: ["stage_gate_definitions", orgId, method?.id, "approval-names"],
    queryFn: () => fetchGateNamesForMethod(orgId, method?.id),
    enabled: !!orgId && usesGates && !!method?.id,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", orgId, projectId, "project-level"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gates")
        .select("id,project_id,stream_id,gate_name,status,planned_date")
        .eq("project_id", projectId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId && usesGates,
  });

  useEffect(() => {
    if (!canEdit || !usesGates || !orgId || !projectId || !methods.length) return;
    void ensureProjectLevelGates({
      orgId,
      projectId,
      deliveryMethodId,
      deliveryMethodName,
      methods,
    })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["stage_gates"] });
      })
      .catch(() => {
        /* insert may be denied for view-only roles */
      });
  }, [canEdit, usesGates, orgId, projectId, deliveryMethodId, deliveryMethodName, methods, qc]);

  const rows = projectApprovalGates(gates as never, projectId, methodGateNames);

  const setStatus = useMutation({
    mutationFn: (vars: { gateId: string; status: string }) =>
      setStageGateStatus({ gateId: vars.gateId, projectId, status: vars.status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stage_gates"] });
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Stage gate approval updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!usesGates) {
    return (
      <SectionFrame>
        <SectionTitle>Stage gate approval</SectionTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          This project&apos;s delivery method does not use stage gates.
        </p>
      </SectionFrame>
    );
  }

  return (
    <SectionFrame exportName="stage-gate-approval" exportTitle="Stage gate approval">
      <SectionTitle>Stage gate approval</SectionTitle>
      <p className="mt-1 text-sm text-muted-foreground">
        Gates that exist on this project, in{" "}
        {method?.name || deliveryMethodName || "delivery method"} order. Changing status updates
        every matching gate name on this project (including streams) so the Stage Gates page stays
        in lockstep.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="st-table">
          <thead>
            <tr>
              <th>Stage gate</th>
              <th>Approval status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-4 text-center text-xs text-muted-foreground">
                  No stage gates on this project yet. They come from the delivery method template
                  when the project (or a stream) is created.
                </td>
              </tr>
            ) : (
              rows.map((g: any) => {
                const status = normalizeGateStatus(g.status);
                return (
                  <tr key={g.id || g.gate_name}>
                    <td className="font-medium">{g.gate_name}</td>
                    <td>
                      {canEdit && g.id ? (
                        <select
                          className="st-input max-w-[11rem]"
                          value={status}
                          disabled={setStatus.isPending}
                          onChange={(e) =>
                            setStatus.mutate({ gateId: g.id, status: e.target.value })
                          }
                          style={{ borderColor: GATE_STATUS_COLORS[status] }}
                        >
                          {GATE_APPROVAL_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: GATE_STATUS_COLORS[status], color: "#0f172a" }}
                        >
                          {status}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </SectionFrame>
  );
}
