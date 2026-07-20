import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { EditableCell } from "@/components/editable-cell";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app/decisions")({
  component: DecisionsPage,
});

const OUTCOMES = ["Approved", "Rejected", "On Hold", "In Review", "Pending"] as const;
type Outcome = typeof OUTCOMES[number];

const outcomeClass: Record<Outcome, string> = {
  Approved: "bg-emerald-100 text-emerald-800",
  Rejected: "bg-rose-100 text-rose-800",
  "On Hold": "bg-amber-100 text-amber-800",
  "In Review": "bg-sky-100 text-sky-800",
  Pending: "bg-slate-100 text-slate-700",
};

function DecisionsPage() {
  const { organization } = useAuth();
  const qc = useQueryClient();
  const orgId = organization?.id;

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,name,project_code,program,sponsor").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stage_gates").select("id,project_id,gate_name,status,planned_date");
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ["decisions", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("decisions").select("*").order("decision_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const projectById = new Map(projects.map((p: any) => [p.id, p]));
  const gateById = new Map(gates.map((g: any) => [g.id, g]));

  const updateDecision = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { outcome?: string } }) => {
      const { error } = await supabase.from("decisions").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decisions", orgId] });
      qc.invalidateQueries({ queryKey: ["stage_gates", orgId] });
      toast.success("Decision updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    project_id: "",
    stage_gate_id: "",
    forum: "Portfolio Board",
    sponsor: "",
    approvers: "",
    owner: "",
    outcome: "In Review" as Outcome,
    decision_date: new Date().toISOString().slice(0, 10),
    title: "",
    rationale: "",
    notes: "",
  });

  const createDecision = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.project_id || !form.title) throw new Error("Project and title required");
      const proj = projectById.get(form.project_id) as any;
      const { error } = await supabase.from("decisions").insert({
        org_id: orgId,
        project_id: form.project_id,
        stage_gate_id: form.stage_gate_id || null,
        program: proj?.program || null,
        forum: form.forum || null,
        sponsor: form.sponsor || proj?.sponsor || null,
        approvers: form.approvers || null,
        owner: form.owner || null,
        outcome: form.outcome,
        decision_date: form.decision_date,
        title: form.title,
        rationale: form.rationale || null,
        notes: form.notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decisions", orgId] });
      qc.invalidateQueries({ queryKey: ["stage_gates", orgId] });
      toast.success("Decision recorded — stage gate status synced");
      setForm((f) => ({ ...f, title: "", rationale: "", notes: "", owner: "" }));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delDecision = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("decisions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["decisions", orgId] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const gatesForProject = gates.filter((g: any) => g.project_id === form.project_id);

  const total = decisions.length;
  const counts = OUTCOMES.reduce<Record<string, number>>((acc, o) => {
    acc[o] = decisions.filter((d: any) => d.outcome === o).length;
    return acc;
  }, {});
  const byOutcome = OUTCOMES.map((o) => ({ outcome: o, count: counts[o] })).filter((d) => d.count > 0);

  return (
    <PageExport name="Decisions_Log" title="Decisions Log">
      <PageHeading icon="🗳️" actions={<button className="st-btn-primary" onClick={() => document.getElementById("log-form")?.scrollIntoView({ behavior: "smooth", block: "start" })}>+ Log new decision</button>}>Decisions Log</PageHeading>

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
        <SectionTitle>Outcomes</SectionTitle>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={byOutcome}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="outcome" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionFrame>

      <SectionFrame id="log-form">
        <SectionTitle>Record a Decision</SectionTitle>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <select className="st-input" value={form.project_id}
            onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value, stage_gate_id: "" }))}>
            <option value="">— Project —</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}
          </select>
          <select className="st-input" value={form.stage_gate_id}
            onChange={(e) => setForm((f) => ({ ...f, stage_gate_id: e.target.value }))}
            disabled={!form.project_id}>
            <option value="">— Stage Gate (optional) —</option>
            {gatesForProject.map((g: any) => (
              <option key={g.id} value={g.id}>{g.gate_name} · {g.status || "Pending"}</option>
            ))}
          </select>
          <input className="st-input" placeholder="Forum" value={form.forum}
            onChange={(e) => setForm((f) => ({ ...f, forum: e.target.value }))} />
          <input className="st-input" placeholder="Sponsor" value={form.sponsor}
            onChange={(e) => setForm((f) => ({ ...f, sponsor: e.target.value }))} />
          <input className="st-input md:col-span-2" placeholder="Approvers (comma separated)" value={form.approvers}
            onChange={(e) => setForm((f) => ({ ...f, approvers: e.target.value }))} />
          <input className="st-input" placeholder="Owner" value={form.owner}
            onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} />
          <select className="st-input" value={form.outcome}
            onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value as Outcome }))}>
            {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input className="st-input" type="date" value={form.decision_date}
            onChange={(e) => setForm((f) => ({ ...f, decision_date: e.target.value }))} />
          <input className="st-input md:col-span-3" placeholder="Decision title" value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <button className="st-btn-primary" disabled={createDecision.isPending}
            onClick={() => createDecision.mutate()}>
            {createDecision.isPending ? "Saving…" : "Record decision"}
          </button>
          <textarea className="st-input md:col-span-2" placeholder="Rationale" rows={2}
            value={form.rationale}
            onChange={(e) => setForm((f) => ({ ...f, rationale: e.target.value }))} />
          <textarea className="st-input md:col-span-2" placeholder="Notes / info" rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          If a stage gate is selected, its status, approver, and actual date update automatically wherever the gate appears (timelines, dashboards, status pages).
        </p>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Decisions Register</SectionTitle>
        {decisions.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No decisions recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="st-table">
              <thead>
                <tr>
                  <th>Project</th><th>Title</th><th>Forum</th><th>Sponsor</th><th>Owner</th>
                  <th>Approvers</th><th>Stage Gate</th><th>Outcome</th><th>Date</th>
                  <th>Rationale</th><th>Notes</th><th></th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d: any) => {
                  const proj = projectById.get(d.project_id) as any;
                  const gate = d.stage_gate_id ? gateById.get(d.stage_gate_id) as any : null;
                  return (
                    <tr key={d.id}>
                      <td className="font-medium">{proj?.project_code || "—"}</td>
                      <td><EditableCell table="decisions" rowId={d.id} field="title" value={d.title} invalidateKeys={["decisions"]} /></td>
                      <td><EditableCell table="decisions" rowId={d.id} field="forum" value={d.forum} invalidateKeys={["decisions"]} /></td>
                      <td><EditableCell table="decisions" rowId={d.id} field="sponsor" value={d.sponsor} invalidateKeys={["decisions"]} /></td>
                      <td><EditableCell table="decisions" rowId={d.id} field="owner" value={d.owner} invalidateKeys={["decisions"]} /></td>
                      <td><EditableCell table="decisions" rowId={d.id} field="approvers" value={d.approvers} invalidateKeys={["decisions"]} /></td>
                      <td>{gate ? `${gate.gate_name} (${gate.status || "Pending"})` : "—"}</td>
                      <td>
                        <select
                          className={`st-input !py-0.5 !text-xs ${outcomeClass[(d.outcome || "Pending") as Outcome] || ""}`}
                          value={d.outcome || "Pending"}
                          onChange={(e) => updateDecision.mutate({ id: d.id, patch: { outcome: e.target.value } })}
                        >
                          {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td><EditableCell table="decisions" rowId={d.id} field="decision_date" value={d.decision_date} type="date" invalidateKeys={["decisions"]} /></td>
                      <td className="max-w-[220px]"><EditableCell table="decisions" rowId={d.id} field="rationale" value={d.rationale} invalidateKeys={["decisions"]} /></td>
                      <td className="max-w-[220px]"><EditableCell table="decisions" rowId={d.id} field="notes" value={d.notes} invalidateKeys={["decisions"]} /></td>
                      <td><button className="text-xs text-rose-600 hover:underline" onClick={() => confirm("Delete this decision?") && delDecision.mutate(d.id)}>Delete</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </PageExport>
  );
}
