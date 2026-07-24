import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { EditableCell } from "@/components/editable-cell";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import {
  DECISION_OUTCOME_CLASS,
  DECISION_OUTCOMES,
  canActOnDecision,
  isAwaitingApproval,
  memberLabel,
  type DecisionOutcome,
  type OrgMember,
} from "@/lib/decision-approval";
import { ExpandableChart } from "@/components/expandable-chart";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

type DecisionsSearch = {
  awaiting?: "me" | "all";
};

export const Route = createFileRoute("/_authenticated/app/decisions")({
  validateSearch: (s: Record<string, unknown>): DecisionsSearch => ({
    awaiting: s.awaiting === "me" ? "me" : undefined,
  }),
  component: DecisionsPage,
});

function DecisionsPage() {
  const { organization, session, profile } = useAuth();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const orgId = organization?.id;
  const userId = session?.user?.id;
  const [awaitingOnly, setAwaitingOnly] = useState(search.awaiting === "me");

  useEffect(() => {
    if (search.awaiting === "me") setAwaitingOnly(true);
  }, [search.awaiting]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,project_code,program,sponsor")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

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

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gates")
        .select("id,project_id,gate_name,status,planned_date");
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ["decisions", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decisions")
        .select("*")
        .order("decision_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const projectById = useMemo(() => new Map(projects.map((p: any) => [p.id, p])), [projects]);
  const gateById = useMemo(() => new Map(gates.map((g: any) => [g.id, g])), [gates]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["decisions", orgId] });
    qc.invalidateQueries({ queryKey: ["stage_gates", orgId] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    window.dispatchEvent(new CustomEvent("pmo:data-changed"));
  };

  const updateDecision = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("decisions")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Decision updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    project_id: "",
    stage_gate_id: "",
    forum: "Portfolio Board",
    sponsor: "",
    approver_user_id: "",
    owner: "",
    outcome: "In Review" as DecisionOutcome,
    decision_date: new Date().toISOString().slice(0, 10),
    title: "",
    rationale: "",
    notes: "",
  });

  const createDecision = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.project_id || !form.title) {
        throw new Error("Project and title required");
      }
      if (!form.approver_user_id) throw new Error("Select an approver to notify");
      const proj = projectById.get(form.project_id) as any;
      const approver = memberById.get(form.approver_user_id);
      const { error } = await supabase.from("decisions").insert({
        org_id: orgId,
        project_id: form.project_id,
        stage_gate_id: form.stage_gate_id || null,
        program: proj?.program || null,
        forum: form.forum || null,
        sponsor: form.sponsor || proj?.sponsor || null,
        approver_user_id: form.approver_user_id,
        approvers: approver ? memberLabel(approver) : null,
        owner: form.owner || null,
        outcome: form.outcome,
        status: form.outcome,
        decision_date: form.decision_date,
        title: form.title,
        rationale: form.rationale || null,
        notes: form.notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Decision recorded — approver notified");
      setForm((f) => ({ ...f, title: "", rationale: "", notes: "", owner: "" }));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delDecision = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("decisions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const decide = (id: string, outcome: "Approved" | "Rejected") => {
    updateDecision.mutate({
      id,
      patch: {
        outcome,
        status: outcome,
        decided_by: profile?.full_name || profile?.email || "Approver",
        approved_by: userId || null,
        approved_at: new Date().toISOString(),
      },
    });
  };

  const requestApproval = (d: any) => {
    if (!d.approver_user_id) {
      toast.error("Assign an approver first");
      return;
    }
    updateDecision.mutate({
      id: d.id,
      patch: {
        outcome: "In Review",
        status: "In Review",
        approval_requested_at: new Date().toISOString(),
      },
    });
  };

  const gatesForProject = gates.filter((g: any) => g.project_id === form.project_id);

  const visibleDecisions = useMemo(() => {
    if (!awaitingOnly || !userId) return decisions;
    return decisions.filter(
      (d: any) => d.approver_user_id === userId && isAwaitingApproval(d.outcome),
    );
  }, [awaitingOnly, decisions, userId]);

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      {
        key: "project",
        label: "Project",
        getValue: (d) => (projectById.get(d.project_id) as any)?.project_code || "",
      },
      { key: "title", label: "Title" },
      { key: "forum", label: "Forum" },
      { key: "sponsor", label: "Sponsor" },
      { key: "owner", label: "Owner" },
      {
        key: "approver",
        label: "Approver",
        getValue: (d) => {
          const m = d.approver_user_id ? memberById.get(d.approver_user_id) : null;
          return m ? memberLabel(m) : d.approvers || "";
        },
      },
      {
        key: "stage_gate",
        label: "Stage Gate",
        getValue: (d) => {
          const gate = d.stage_gate_id ? (gateById.get(d.stage_gate_id) as any) : null;
          return gate ? `${gate.gate_name} (${gate.status || "Pending"})` : "";
        },
      },
      { key: "outcome", label: "Outcome" },
      { key: "decision_date", label: "Date" },
      { key: "rationale", label: "Rationale" },
      { key: "notes", label: "Notes" },
    ],
    [projectById, gateById, memberById],
  );

  const table = useColumnarTable(visibleDecisions, columns);

  const myAwaitingCount = useMemo(
    () =>
      decisions.filter((d: any) => d.approver_user_id === userId && isAwaitingApproval(d.outcome))
        .length,
    [decisions, userId],
  );

  const total = decisions.length;
  const counts = DECISION_OUTCOMES.reduce<Record<string, number>>((acc, o) => {
    acc[o] = decisions.filter((d: any) => d.outcome === o).length;
    return acc;
  }, {});
  const byOutcome = DECISION_OUTCOMES.map((o) => ({
    outcome: o,
    count: counts[o],
  })).filter((d) => d.count > 0);

  const dataColsBeforeActions = columns.slice(0, 9);
  const dataColsAfterActions = columns.slice(9);

  return (
    <PageExport name="Decisions_Log" title="Decisions Log">
      <PageHeading
        icon="🗳️"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                awaitingOnly
                  ? "border-sky-300 bg-sky-50 text-sky-800"
                  : "border-border bg-surface text-foreground"
              }`}
              onClick={() => setAwaitingOnly((v) => !v)}
            >
              Awaiting my approval{myAwaitingCount ? ` (${myAwaitingCount})` : ""}
            </button>
            <button
              className="st-btn-primary"
              onClick={() =>
                document.getElementById("log-form")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
            >
              + Log new decision
            </button>
          </div>
        }
      >
        Decisions Log
      </PageHeading>

      <SectionFrame>
        <SectionTitle>Decision KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiCard label="Total" value={total} />
          <KpiCard label="Approved" value={counts.Approved || 0} />
          <KpiCard label="Rejected" value={counts.Rejected || 0} />
          <KpiCard label="On Hold" value={counts["On Hold"] || 0} />
          <KpiCard label="In Review" value={counts["In Review"] || 0} />
        </div>
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart title="Outcomes" heightClass="h-64">
          <BarChart data={byOutcome}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
            <XAxis dataKey="outcome" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Bar dataKey="count" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame id="log-form">
        <SectionTitle>Record a Decision</SectionTitle>
        <form
          className="grid grid-cols-1 gap-2 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            createDecision.mutate();
          }}
        >
          <select
            className="st-input"
            value={form.project_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, project_id: e.target.value, stage_gate_id: "" }))
            }
            required
          >
            <option value="">— Project —</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.project_code} · {p.name}
              </option>
            ))}
          </select>
          <select
            className="st-input"
            value={form.stage_gate_id}
            onChange={(e) => setForm((f) => ({ ...f, stage_gate_id: e.target.value }))}
            disabled={!form.project_id}
          >
            <option value="">— Stage Gate (optional) —</option>
            {gatesForProject.map((g: any) => (
              <option key={g.id} value={g.id}>
                {g.gate_name} · {g.status || "Pending"}
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
            placeholder="Sponsor"
            value={form.sponsor}
            onChange={(e) => setForm((f) => ({ ...f, sponsor: e.target.value }))}
          />
          <select
            className="st-input md:col-span-2"
            value={form.approver_user_id}
            onChange={(e) => setForm((f) => ({ ...f, approver_user_id: e.target.value }))}
            required
          >
            <option value="">— Approver (notifies in-app) —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {memberLabel(m)}
              </option>
            ))}
          </select>
          <input
            className="st-input"
            placeholder="Owner"
            value={form.owner}
            onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
          />
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
            type="date"
            value={form.decision_date}
            onChange={(e) => setForm((f) => ({ ...f, decision_date: e.target.value }))}
          />
          <input
            className="st-input md:col-span-4"
            placeholder="Decision title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <textarea
            className="st-input md:col-span-2"
            placeholder="Rationale"
            rows={2}
            value={form.rationale}
            onChange={(e) => setForm((f) => ({ ...f, rationale: e.target.value }))}
          />
          <textarea
            className="st-input md:col-span-2"
            placeholder="Notes / info"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <button
            type="submit"
            className="st-btn-primary md:col-span-4"
            disabled={createDecision.isPending}
          >
            {createDecision.isPending ? "Saving…" : "Submit decision"}
          </button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Submitting records the decision and notifies the selected approver in-app. If a stage gate
          is linked, its status and approver sync automatically.
        </p>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>
          {awaitingOnly ? "Decisions awaiting my approval" : "Decisions Register"}
        </SectionTitle>
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
          <div className="py-8 text-center text-sm text-muted-foreground">
            {awaitingOnly ? "Nothing waiting for your approval." : "No decisions recorded yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="st-table">
              <thead>
                <tr>
                  {dataColsBeforeActions.map((col) => (
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
                  {dataColsAfterActions.map((col) => (
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {table.rows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-6 text-center text-sm text-muted-foreground">
                      No decisions match filters.
                    </td>
                  </tr>
                ) : (
                  table.rows.map((d: any) => {
                    const proj = projectById.get(d.project_id) as any;
                    const gate = d.stage_gate_id ? (gateById.get(d.stage_gate_id) as any) : null;
                    const approver = d.approver_user_id ? memberById.get(d.approver_user_id) : null;
                    const actionable = canActOnDecision(d, userId);
                    return (
                      <tr key={d.id}>
                        <td className="font-medium">{proj?.project_code || "—"}</td>
                        <td>
                          <EditableCell
                            table="decisions"
                            rowId={d.id}
                            field="title"
                            value={d.title}
                            invalidateKeys={["decisions"]}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="decisions"
                            rowId={d.id}
                            field="forum"
                            value={d.forum}
                            invalidateKeys={["decisions"]}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="decisions"
                            rowId={d.id}
                            field="sponsor"
                            value={d.sponsor}
                            invalidateKeys={["decisions"]}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="decisions"
                            rowId={d.id}
                            field="owner"
                            value={d.owner}
                            invalidateKeys={["decisions"]}
                          />
                        </td>
                        <td>
                          <select
                            className="st-input !py-0.5 !text-xs"
                            value={d.approver_user_id || ""}
                            onChange={(e) => {
                              const id = e.target.value || null;
                              const m = id ? memberById.get(id) : null;
                              updateDecision.mutate({
                                id: d.id,
                                patch: {
                                  approver_user_id: id,
                                  approvers: m ? memberLabel(m) : null,
                                  outcome: isAwaitingApproval(d.outcome)
                                    ? d.outcome || "In Review"
                                    : "In Review",
                                  status: isAwaitingApproval(d.outcome)
                                    ? d.outcome || "In Review"
                                    : "In Review",
                                },
                              });
                            }}
                          >
                            <option value="">— Assign —</option>
                            {members.map((m) => (
                              <option key={m.id} value={m.id}>
                                {memberLabel(m)}
                              </option>
                            ))}
                          </select>
                          {approver ? (
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              {memberLabel(approver)}
                            </div>
                          ) : d.approvers ? (
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              {d.approvers}
                            </div>
                          ) : null}
                        </td>
                        <td>{gate ? `${gate.gate_name} (${gate.status || "Pending"})` : "—"}</td>
                        <td>
                          <select
                            className={`st-input !py-0.5 !text-xs ${
                              DECISION_OUTCOME_CLASS[(d.outcome || "Pending") as DecisionOutcome] ||
                              ""
                            }`}
                            value={d.outcome || "Pending"}
                            onChange={(e) =>
                              updateDecision.mutate({
                                id: d.id,
                                patch: {
                                  outcome: e.target.value,
                                  status: e.target.value,
                                },
                              })
                            }
                          >
                            {DECISION_OUTCOMES.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <EditableCell
                            table="decisions"
                            rowId={d.id}
                            field="decision_date"
                            value={d.decision_date}
                            type="date"
                            invalidateKeys={["decisions"]}
                          />
                        </td>
                        <td className="min-w-[9rem]">
                          {actionable ? (
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                                onClick={() => decide(d.id, "Approved")}
                              >
                                <Check className="h-3 w-3" /> Approve
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700"
                                onClick={() => decide(d.id, "Rejected")}
                              >
                                <X className="h-3 w-3" /> Reject
                              </button>
                            </div>
                          ) : d.approver_user_id && !isAwaitingApproval(d.outcome) ? (
                            <span className="text-[11px] text-muted-foreground">Done</span>
                          ) : d.approver_user_id ? (
                            <button
                              type="button"
                              className="text-[11px] font-medium text-primary hover:underline"
                              onClick={() => requestApproval(d)}
                            >
                              Re-notify
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Assign</span>
                          )}
                        </td>
                        <td className="max-w-[220px]">
                          <EditableCell
                            table="decisions"
                            rowId={d.id}
                            field="rationale"
                            value={d.rationale}
                            invalidateKeys={["decisions"]}
                          />
                        </td>
                        <td className="max-w-[220px]">
                          <EditableCell
                            table="decisions"
                            rowId={d.id}
                            field="notes"
                            value={d.notes}
                            invalidateKeys={["decisions"]}
                          />
                        </td>
                        <td>
                          <button
                            className="text-xs text-rose-600 hover:underline"
                            onClick={() =>
                              confirm("Delete this decision?") && delDecision.mutate(d.id)
                            }
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </PageExport>
  );
}
