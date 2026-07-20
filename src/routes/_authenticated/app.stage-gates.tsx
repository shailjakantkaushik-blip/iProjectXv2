import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard, RagChip } from "@/components/streamlit";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip, Cell, Legend,
} from "recharts";
import { GATE_STATUS_COLORS as STATUS_COLORS, CHART_SERIES } from "@/lib/chart-theme";

export const Route = createFileRoute("/_authenticated/app/stage-gates")({
  component: StageGatesPage,
});

const PALETTE = CHART_SERIES;

function StageGatesPage() {
  const { organization } = useAuth();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => (await supabase.from("projects").select("*")).data ?? [],
    enabled: !!organization,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", organization?.id],
    queryFn: async () => (await supabase.from("stage_gates").select("*").order("planned_date")).data ?? [],
    enabled: !!organization,
  });

  const { data: defs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", organization?.id],
    queryFn: async () =>
      (await supabase.from("stage_gate_definitions")
        .select("*").eq("org_id", organization!.id).eq("is_active", true)
        .order("sort_order")).data ?? [],
    enabled: !!organization,
  });

  // Gate distribution: rows = gate_name from configured definitions, stacked by status.
  const distribution = useMemo(() => {
    const names = defs.length ? defs.map((d: any) => d.gate_name) :
      Array.from(new Set(gates.map((g: any) => g.gate_name).filter(Boolean)));
    const statuses = ["Approved", "In Review", "Pending", "On Hold", "Rejected"];
    return names.map((n: string) => {
      const row: any = { gate: n };
      statuses.forEach((s) => {
        row[s] = gates.filter((g: any) => g.gate_name === n && (g.status || "Pending") === s).length;
      });
      row.__total = statuses.reduce((sum, s) => sum + row[s], 0);
      return row;
    });
  }, [gates, defs]);

  // KPIs from actual gates
  const total = gates.length;
  const approved = gates.filter((g: any) => g.status === "Approved").length;
  const inReview = gates.filter((g: any) => g.status === "In Review").length;
  const pending = gates.filter((g: any) => (g.status || "Pending") === "Pending").length;
  const onHold = gates.filter((g: any) => g.status === "On Hold").length;
  const overdue = gates.filter((g: any) =>
    g.planned_date && new Date(g.planned_date) < new Date() && g.status !== "Approved" && g.status !== "Rejected"
  ).length;

  // Register: for each project, show CURRENT (latest approved / last touched) + NEXT (earliest upcoming un-approved) gate
  const gatesByProject = useMemo(() => {
    const m = new Map<string, any[]>();
    gates.forEach((g: any) => {
      if (!m.has(g.project_id)) m.set(g.project_id, []);
      m.get(g.project_id)!.push(g);
    });
    // Sort each project's gates by definition sort_order (fallback: planned_date)
    const orderIdx = new Map<string, number>();
    defs.forEach((d: any, i: number) => orderIdx.set(d.gate_name, d.sort_order ?? i));
    m.forEach((arr) => arr.sort((a, b) => {
      const oa = orderIdx.get(a.gate_name);
      const ob = orderIdx.get(b.gate_name);
      if (oa !== undefined && ob !== undefined) return oa - ob;
      const da = a.planned_date ? new Date(a.planned_date).getTime() : Infinity;
      const db = b.planned_date ? new Date(b.planned_date).getTime() : Infinity;
      return da - db;
    }));
    return m;
  }, [gates, defs]);

  const register = useMemo(() => {
    return projects.map((p: any) => {
      const gs = gatesByProject.get(p.id) || [];
      const current = [...gs].reverse().find((g) => g.status === "Approved") || gs[gs.length - 1];
      const next = gs.find((g) => g.status !== "Approved" && g.status !== "Rejected");
      return { project: p, current, next };
    });
  }, [projects, gatesByProject]);

  return (
    <div>
      <PageHeading icon="🚦">Stage Gates</PageHeading>

      <SectionFrame>
        <SectionTitle>Gate KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <KpiCard label="Total Gates" value={total} />
          <KpiCard label="Approved" value={approved} />
          <KpiCard label="In Review" value={inReview} />
          <KpiCard label="Pending" value={pending} />
          <KpiCard label="On Hold" value={onHold} />
          <KpiCard label="Overdue" value={overdue} />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Gate Distribution</SectionTitle>
        {distribution.length === 0 ? (
          <div className="rounded-md border p-6 text-center text-xs text-muted-foreground">
            No gates yet. Configure gates in <strong>Stage Gate Config</strong> and add them to projects.
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={distribution} margin={{ top: 20, right: 20, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis dataKey="gate" fontSize={11} angle={-15} textAnchor="end" interval={0} height={60} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Legend verticalAlign="top" height={28} />
                {["Approved", "In Review", "Pending", "On Hold", "Rejected"].map((s) => (
                  <Bar key={s} dataKey={s} stackId="s" fill={STATUS_COLORS[s]} radius={[2, 2, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Stage Gate Register</SectionTitle>
        <div className="overflow-x-auto">
          <table className="st-table">
            <thead>
              <tr>
                <th>Project</th><th>Program</th><th>Sponsor</th><th>RAG</th>
                <th>Current Gate</th><th>Current Status</th>
                <th>Next Gate</th><th>Next Planned Date</th><th>Next Status</th>
              </tr>
            </thead>
            <tbody>
              {register.map(({ project, current, next }) => (
                <tr key={project.id}>
                  <td className="font-medium">{project.name}</td>
                  <td>{project.program || "—"}</td>
                  <td>{project.sponsor || "—"}</td>
                  <td><RagChip rag={project.rag} /></td>
                  <td>{current?.gate_name || "—"}</td>
                  <td>
                    {current ? (
                      <span className="rounded px-2 py-0.5 text-[11px] text-white"
                        style={{ background: STATUS_COLORS[current.status] || "#94a3b8" }}>
                        {current.status || "Pending"}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="font-medium">{next?.gate_name || <span className="text-muted-foreground">All complete</span>}</td>
                  <td>{next?.planned_date || "—"}</td>
                  <td>
                    {next ? (
                      <span className="rounded px-2 py-0.5 text-[11px] text-white"
                        style={{ background: STATUS_COLORS[next.status] || "#94a3b8" }}>
                        {next.status || "Pending"}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </div>
  );
}
