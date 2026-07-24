import { useMemo, useState } from "react";
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
  isAwaitingApproval,
  memberLabel,
  type DecisionOutcome,
  type OrgMember,
} from "@/lib/decision-approval";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

type Props = {
  projectId: string;
  projectCode?: string | null;
  projectName?: string | null;
  program?: string | null;
  sponsor?: string | null;
};

export function ProjectDecisionsPanel({
  projectId,
  projectCode,
  projectName,
  program,
  sponsor,
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

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );

  const [form, setForm] = useState({
    title: "",
    rationale: "",
    notes: "",
    forum: "Project Board",
    owner: profile?.full_name || "",
    approver_user_id: "",
    outcome: "In Review" as DecisionOutcome,
    decision_date: new Date().toISOString().slice(0, 10),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["decisions"] });
    qc.invalidateQueries({ queryKey: ["stage_gates"] });
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
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Decision sent to approver");
      setForm((f) => ({ ...f, title: "", rationale: "", notes: "" }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setOutcome = useMutation({
    mutationFn: async ({
      id,
      outcome,
    }: {
      id: string;
      outcome: DecisionOutcome;
    }) => {
      const patch: Record<string, unknown> = {
        outcome,
        status: outcome,
      };
      if (outcome === "Approved" || outcome === "Rejected") {
        patch.decided_by = profile?.full_name || profile?.email || "Approver";
        patch.approved_by = userId || null;
        patch.approved_at = new Date().toISOString();
      }
      const { error } = await supabase.from("decisions").update(patch as never).eq("id", id);
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

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "title", label: "Title" },
      {
        key: "approver",
        label: "Approver",
        getValue: (d) => {
          const m = d.approver_user_id ? memberById.get(d.approver_user_id) : null;
          return m ? memberLabel(m) : d.approvers || "";
        },
      },
      { key: "outcome", label: "Outcome" },
      { key: "decision_date", label: "Date" },
    ],
    [memberById],
  );

  const table = useColumnarTable(decisions, columns);

  return (
    <SectionFrame>
      <SectionTitle>Key Decisions</SectionTitle>
      <p className="mb-3 text-xs text-muted-foreground">
        Assign an organisation user as approver. They receive an in-app notification and can
        approve or reject from here or the Decisions Log.
        {projectCode || projectName
          ? ` Showing decisions for ${projectCode ? `${projectCode} · ` : ""}${projectName || ""}.`
          : ""}
      </p>

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
        <input
          className="st-input"
          placeholder="Forum"
          value={form.forum}
          onChange={(e) => setForm((f) => ({ ...f, forum: e.target.value }))}
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

      {isLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading decisions…</div>
      ) : (
        <>
          <ColumnarToolbar
            globalQ={table.globalQ}
            onGlobalQ={table.setGlobalQ}
            shown={table.rows.length}
            total={table.total}
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
                      <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
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
                          <td className="text-xs">
                            {approver ? memberLabel(approver) : d.approvers || "—"}
                            {d.approver_user_id === userId && isAwaitingApproval(d.outcome) ? (
                              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                                Awaiting you
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <span
                              className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${
                                DECISION_OUTCOME_CLASS[
                                  (d.outcome || "Pending") as DecisionOutcome
                                ] || ""
                              }`}
                            >
                              {d.outcome || "Pending"}
                            </span>
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
