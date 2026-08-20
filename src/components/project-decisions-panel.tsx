import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle } from "@/components/streamlit";
import {
  DECISION_OUTCOME_CLASS,
  DECISION_OUTCOMES,
  canActOnDecision,
  decisionOutcome,
  isDecisionAwaiting,
  memberLabel,
  type DecisionOutcome,
  type OrgMember,
} from "@/lib/decision-approval";
import { deliveryMethodsQueryKey, fetchDeliveryMethods } from "@/lib/delivery-methods";
import {
  ensureProjectLevelGates,
  gatesForRaidScope,
  remapGateIdForScope,
  setStageGateStatus,
} from "@/lib/stage-gate-approval";
import { StageGateApprovalSelect } from "@/components/stage-gate-approval-select";
import { RaidStreamSelect } from "@/components/raid-stream-select";
import { fetchOrgStreams } from "@/lib/project-streams";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";
import { ForumSelect } from "@/components/forum-select";
import { forumSelectNames, loadGovernanceChannels } from "@/lib/governance-forums";

type Props = {
  projectId: string;
  projectCode?: string | null;
  projectName?: string | null;
  program?: string | null;
  portfolio?: string | null;
  sponsor?: string | null;
  deliveryMethodId?: string | null;
  deliveryMethodName?: string | null;
  canEdit?: boolean;
};

export function ProjectDecisionsPanel({
  projectId,
  projectCode,
  projectName,
  program,
  portfolio,
  sponsor,
  deliveryMethodId,
  deliveryMethodName,
  canEdit = true,
}: Props) {
  const { organization, session, profile } = useAuth();
  const orgId = organization?.id;
  const userId = session?.user?.id;
  const qc = useQueryClient();

  const { data: members = [] } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .eq("org_id", orgId!)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as OrgMember[];
    },
    enabled: !!orgId,
  });

  const { data: decisions = [], isLoading } = useQuery({
    queryKey: ["decisions", orgId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decisions")
        .select("*")
        .eq("project_id", projectId)
        .order("decision_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId && !!projectId,
  });

  const { data: methods = [] } = useQuery({
    queryKey: deliveryMethodsQueryKey(orgId),
    queryFn: () => fetchDeliveryMethods(orgId!),
    enabled: !!orgId,
  });

  const { data: streams = [] } = useQuery({
    queryKey: ["project_streams", orgId],
    queryFn: () => fetchOrgStreams(orgId!),
    enabled: !!orgId,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", orgId, projectId, "decisions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gates")
        .select("id,project_id,stream_id,gate_name,status")
        .eq("project_id", projectId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId && !!projectId,
  });

  const { data: channelPack } = useQuery({
    queryKey: ["governance_channels", orgId],
    queryFn: () => loadGovernanceChannels(),
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const forums = channelPack?.channels ?? [];

  useEffect(() => {
    if (!canEdit || !orgId || !projectId || !methods.length) return;
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
  }, [canEdit, orgId, projectId, deliveryMethodId, deliveryMethodName, methods, qc]);

  const [form, setForm] = useState({
    title: "",
    rationale: "",
    notes: "",
    forum: "",
    owner: profile?.full_name || "",
    approver_user_id: "",
    outcome: "In Review" as DecisionOutcome,
    decision_date: new Date().toISOString().slice(0, 10),
    stream_id: "",
    stage_gate_id: "",
  });

  useEffect(() => {
    const names = forumSelectNames(forums, {
      project: { id: projectId, program: program || null, portfolio: portfolio || null },
    });
    if (!names.length) return;
    setForm((f) => (f.forum && names.includes(f.forum) ? f : { ...f, forum: names[0] }));
  }, [forums, projectId, program, portfolio]);

  const methodGates = useMemo(
    () => gatesForRaidScope(gates as never, projectId, form.stream_id || null),
    [gates, projectId, form.stream_id],
  );
  const gateById = useMemo(
    () => new Map((gates as { id: string }[]).map((g) => [g.id, g])),
    [gates],
  );

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["decisions"] });
    qc.invalidateQueries({ queryKey: ["stage_gates"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    window.dispatchEvent(new CustomEvent("pmo:data-changed"));
  };

  const createDecision = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.title.trim()) throw new Error("Decision title is required");
      if (!form.approver_user_id) throw new Error("Select an approver");
      const approver = memberById.get(form.approver_user_id);
      const { error } = await supabase.from("decisions").insert({
        org_id: orgId,
        project_id: projectId,
        program: program || null,
        forum: form.forum || null,
        sponsor: sponsor || null,
        owner: form.owner || null,
        approver_user_id: form.approver_user_id,
        approvers: approver ? memberLabel(approver) : null,
        outcome: form.outcome,
        status: form.outcome,
        decision_date: form.decision_date,
        title: form.title.trim(),
        rationale: form.rationale || null,
        notes: form.notes || null,
        stream_id: form.stream_id || null,
        stage_gate_id: form.stage_gate_id || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Decision sent to approver");
      setForm((f) => ({
        ...f,
        title: "",
        rationale: "",
        notes: "",
        stream_id: "",
        stage_gate_id: "",
      }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setOutcome = useMutation({
    mutationFn: async ({ id, outcome }: { id: string; outcome: DecisionOutcome }) => {
      const patch: Record<string, unknown> = {
        outcome,
        status: outcome,
      };
      if (outcome === "Approved" || outcome === "Rejected") {
        patch.decided_by = profile?.full_name || profile?.email || "Approver";
        patch.approved_by = userId || null;
        patch.approved_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("decisions")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidate();
      toast.success(
        vars.outcome === "Approved"
          ? "Decision approved"
          : vars.outcome === "Rejected"
            ? "Decision rejected"
            : "Decision updated",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setGateStatus = useMutation({
    mutationFn: (vars: { gateId: string; status: string }) =>
      setStageGateStatus({ gateId: vars.gateId, projectId, status: vars.status }),
    onSuccess: () => {
      invalidate();
      toast.success("Stage gate approval updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDecisionGate = useMutation({
    mutationFn: async (vars: {
      id: string;
      stage_gate_id?: string | null;
      stream_id?: string | null;
      forum?: string | null;
    }) => {
      const patch: Record<string, unknown> = {};
      if ("stage_gate_id" in vars) patch.stage_gate_id = vars.stage_gate_id ?? null;
      if ("stream_id" in vars) patch.stream_id = vars.stream_id ?? null;
      if ("forum" in vars) patch.forum = vars.forum ?? null;
      const { error } = await supabase
        .from("decisions")
        .update(patch as never)
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Decision updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "title", label: "Title" },
      {
        key: "stream",
        label: "Stream",
        getValue: (d) => {
          const s = d.stream_id ? streams.find((x) => x.id === d.stream_id) : null;
          return s ? `${s.name || ""} ${s.code || ""}` : "";
        },
      },
      { key: "forum", label: "Forum" },
      {
        key: "approver",
        label: "Approver",
        getValue: (d) => {
          const m = d.approver_user_id ? memberById.get(d.approver_user_id) : null;
          return m ? memberLabel(m) : d.approvers || "";
        },
      },
      { key: "outcome", label: "Outcome" },
      {
        key: "stage_gate",
        label: "Stage gate approval",
        getValue: (d) => {
          const gate = d.stage_gate_id ? gateById.get(d.stage_gate_id) : null;
          return gate ? `${(gate as any).gate_name || ""} ${(gate as any).status || ""}` : "";
        },
      },
      { key: "decision_date", label: "Date" },
    ],
    [memberById, gateById, streams],
  );

  const table = useColumnarTable(decisions, columns);

  return (
    <SectionFrame>
      <SectionTitle>Key Decisions</SectionTitle>
      <p className="mb-3 text-xs text-muted-foreground">
        Assign an organisation user as approver. They receive an in-app notification and can approve
        or reject from here or the Decisions Log. Optionally record against a stream. Link a
        delivery-method stage gate and set its approval status — that status is kept in sync with
        the Stage Gates page.
        {projectCode || projectName
          ? ` Showing decisions for ${projectCode ? `${projectCode} · ` : ""}${projectName || ""}.`
          : ""}
      </p>

      {canEdit ? (
        <form
          className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            createDecision.mutate();
          }}
        >
          <input
            className="st-input md:col-span-2"
            placeholder="Decision title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <select
            className="st-input"
            value={form.approver_user_id}
            onChange={(e) => setForm((f) => ({ ...f, approver_user_id: e.target.value }))}
            required
          >
            <option value="">— Approver (required) —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {memberLabel(m)}
              </option>
            ))}
          </select>
          <select
            className="st-input"
            value={form.outcome}
            onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value as DecisionOutcome }))}
          >
            {DECISION_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <div className="md:col-span-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                Stream (optional)
              </label>
              <RaidStreamSelect
                streams={streams}
                projectId={projectId}
                value={form.stream_id}
                onChange={(stream_id) =>
                  setForm((f) => ({
                    ...f,
                    stream_id,
                    stage_gate_id: remapGateIdForScope(
                      gates as never,
                      projectId,
                      stream_id || null,
                      f.stage_gate_id,
                    ),
                  }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                Stage gate approval
              </label>
              <StageGateApprovalSelect
                gates={methodGates}
                gateId={form.stage_gate_id}
                onGateId={(stage_gate_id) => setForm((f) => ({ ...f, stage_gate_id }))}
                onStatus={(gateId, status) => setGateStatus.mutate({ gateId, status })}
                canEdit={canEdit}
                disabled={setGateStatus.isPending}
              />
            </div>
          </div>
          <ForumSelect
            channels={forums}
            project={{ id: projectId, program: program || null, portfolio: portfolio || null }}
            extra={[form.forum]}
            value={form.forum}
            onChange={(forum) => setForm((f) => ({ ...f, forum }))}
          />
          <input
            className="st-input"
            type="date"
            value={form.decision_date}
            onChange={(e) => setForm((f) => ({ ...f, decision_date: e.target.value }))}
          />
          <textarea
            className="st-input md:col-span-2"
            placeholder="Rationale"
            rows={2}
            value={form.rationale}
            onChange={(e) => setForm((f) => ({ ...f, rationale: e.target.value }))}
          />
          <button
            type="submit"
            className="st-btn-primary md:col-span-2"
            disabled={createDecision.isPending}
          >
            {createDecision.isPending ? "Saving…" : "Submit decision"}
          </button>
        </form>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">
          View only — you do not have edit rights on Decisions. Approvers can still approve or
          reject items assigned to them.
        </p>
      )}

      {isLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading decisions…</div>
      ) : (
        <>
          <ColumnarToolbar
            globalQ={table.globalQ}
            onGlobalQ={table.setGlobalQ}
            shown={table.rows.length}
            total={table.total}
            dirty={table.isDirty}
            onClear={table.clearAll}
            placeholder="Search decisions…"
          />
          {table.total === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No key decisions for this project yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="st-table">
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <ColumnarTh
                        key={col.key}
                        column={col}
                        filter={table.filters[col.key]}
                        onFilter={(v) => table.setColumnFilter(col.key, v)}
                        sortKey={table.sortKey}
                        sortDir={table.sortDir}
                        onToggleSort={table.toggleSort}
                      />
                    ))}
                    <th className="align-top">
                      <span className="font-semibold">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-xs text-muted-foreground">
                        No decisions match filters.
                      </td>
                    </tr>
                  ) : (
                    table.rows.map((d: any) => {
                      const approver = d.approver_user_id
                        ? memberById.get(d.approver_user_id)
                        : null;
                      const actionable = canActOnDecision(d, userId);
                      return (
                        <tr key={d.id}>
                          <td className="min-w-[10rem]">
                            <div className="font-medium">{d.title}</div>
                            {d.rationale ? (
                              <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                                {d.rationale}
                              </div>
                            ) : null}
                          </td>
                          <td className="min-w-[9rem]">
                            <RaidStreamSelect
                              compact
                              streams={streams}
                              projectId={projectId}
                              value={d.stream_id || ""}
                              disabled={!canEdit || setDecisionGate.isPending}
                              onChange={(stream_id) =>
                                setDecisionGate.mutate({
                                  id: d.id,
                                  stream_id: stream_id || null,
                                  stage_gate_id:
                                    remapGateIdForScope(
                                      gates as never,
                                      projectId,
                                      stream_id || null,
                                      d.stage_gate_id,
                                    ) || null,
                                })
                              }
                            />
                          </td>
                          <td className="min-w-[10rem]">
                            <ForumSelect
                              compact
                              channels={forums}
                              project={{
                                id: projectId,
                                program: program || null,
                                portfolio: portfolio || null,
                              }}
                              extra={[d.forum]}
                              value={d.forum || ""}
                              disabled={!canEdit || setDecisionGate.isPending}
                              onChange={(forum) =>
                                setDecisionGate.mutate({
                                  id: d.id,
                                  forum: forum || null,
                                })
                              }
                            />
                          </td>
                          <td className="text-xs">
                            {approver ? memberLabel(approver) : d.approvers || "—"}
                            {d.approver_user_id === userId && isDecisionAwaiting(d) ? (
                              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                                Awaiting you
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <span
                              className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${
                                DECISION_OUTCOME_CLASS[decisionOutcome(d)] || ""
                              }`}
                            >
                              {decisionOutcome(d)}
                            </span>
                          </td>
                          <td className="min-w-[14rem]">
                            <StageGateApprovalSelect
                              compact
                              gates={(() => {
                                const list = [
                                  ...gatesForRaidScope(
                                    gates as never,
                                    projectId,
                                    d.stream_id || null,
                                  ),
                                ];
                                if (
                                  d.stage_gate_id &&
                                  !list.some((g: any) => g.id === d.stage_gate_id)
                                ) {
                                  const extra = gateById.get(d.stage_gate_id);
                                  if (extra) list.push(extra as never);
                                }
                                return list;
                              })()}
                              gateId={d.stage_gate_id || ""}
                              onGateId={(id) =>
                                setDecisionGate.mutate({
                                  id: d.id,
                                  stage_gate_id: id || null,
                                })
                              }
                              onStatus={(gateId, status) =>
                                setGateStatus.mutate({ gateId, status })
                              }
                              canEdit={canEdit}
                              disabled={setGateStatus.isPending || setDecisionGate.isPending}
                            />
                          </td>
                          <td className="whitespace-nowrap text-xs">{d.decision_date || "—"}</td>
                          <td>
                            {actionable ? (
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                                  onClick={() =>
                                    setOutcome.mutate({ id: d.id, outcome: "Approved" })
                                  }
                                >
                                  <Check className="h-3 w-3" /> Approve
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700"
                                  onClick={() =>
                                    setOutcome.mutate({ id: d.id, outcome: "Rejected" })
                                  }
                                >
                                  <X className="h-3 w-3" /> Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </SectionFrame>
  );
}
