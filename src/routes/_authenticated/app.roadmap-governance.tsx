import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard, RagChip } from "@/components/streamlit";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app/roadmap-governance")({
  component: RoadmapGovPage,
});

const STAGES = ["Idea", "Discovery", "Definition", "Design", "Build", "Test", "Deploy", "Closure"];
const STAGE_COLORS = ["#94a3b8", "#60a5fa", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#22c55e", "#15803d"];

function RoadmapGovPage() {
  const { organization } = useAuth();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*");
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  const active = projects.filter((p) => p.status !== "Completed" && p.status !== "Cancelled");
  const stageCounts = STAGES.map((s) => ({
    stage: s,
    count: active.filter((p) => (p.current_phase || "").toLowerCase() === s.toLowerCase()).length,
  }));

  const kpis = {
    inFlight: active.length,
    completed: projects.filter((p) => p.status === "Completed").length,
    goLiveNext30: projects.filter((p) => {
      if (!p.target_go_live) return false;
      const d = new Date(p.target_go_live);
      const now = new Date();
      const in30 = new Date(); in30.setDate(in30.getDate() + 30);
      return d >= now && d <= in30;
    }).length,
    overdue: projects.filter((p) => {
      if (!p.end_date) return false;
      return new Date(p.end_date) < new Date() && p.status !== "Completed";
    }).length,
  };

  return (
    <div>
      <PageHeading icon="🏛️">Governance — Stage Gates & Approvals</PageHeading>

      <SectionFrame>
        <SectionTitle>Governance KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="In-Flight" value={kpis.inFlight} />
          <KpiCard label="Completed" value={kpis.completed} />
          <KpiCard label="Go-Live in 30d" value={kpis.goLiveNext30} />
          <KpiCard label="Overdue" value={kpis.overdue} />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Stage-Gate Flow (active projects)</SectionTitle>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={stageCounts}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="stage" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#1d4ed8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {STAGES.map((s, i) => (
            <div key={s} className="flex items-center gap-2 text-[11px]">
              <span className="h-3 w-3 rounded" style={{ background: STAGE_COLORS[i] }} />
              {s}
            </div>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Governance Register</SectionTitle>
        <div className="overflow-x-auto">
          <table className="st-table">
            <thead>
              <tr>
                <th>Project</th><th>Program</th><th>Current Phase</th><th>Status</th>
                <th>RAG</th><th>Sponsor</th><th>Target Go-Live</th><th>End</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.program || "—"}</td>
                  <td>{p.current_phase || "—"}</td>
                  <td>{p.status}</td>
                  <td><RagChip rag={p.rag} /></td>
                  <td>{p.sponsor || "—"}</td>
                  <td>{p.target_go_live || "—"}</td>
                  <td>{p.end_date || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </div>
  );
}
