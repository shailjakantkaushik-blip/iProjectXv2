import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle, PageHeading, KpiCard, RagChip } from "@/components/streamlit";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, Cell } from "recharts";

export const Route = createFileRoute("/_authenticated/app/prioritisation")({
  component: Prioritisation,
});

function money(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
}

const PRI_WEIGHT: Record<string, number> = {
  "P1 - Critical": 100, "P1": 100, "Critical": 100,
  "P2 - High": 75, "P2": 75, "High": 75,
  "P3 - Medium": 50, "P3": 50, "Medium": 50,
  "P4 - Low": 25, "P4": 25, "Low": 25,
};

function Prioritisation() {
  const { organization } = useAuth();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => (await supabase.from("projects").select("*")).data ?? [],
    enabled: !!organization,
  });

  const ranked = useMemo(() => {
    return projects.map((p: any) => {
      const budget = Number(p.budget || 0);
      const roi = Number(p.roi_percent || 0);
      const benTgt = Number(p.benefits_target || 0);
      const priScore = PRI_WEIGHT[p.priority || ""] || 25;
      // Simple composite: (ROI + PriorityWeight + Benefits/1M) - Cost/1M penalty
      const score = roi * 0.5 + priScore * 0.3 + (benTgt / 1_000_000) * 5 - (budget / 1_000_000) * 2;
      return { ...p, _score: Math.round(score * 10) / 10, _pri: priScore };
    }).sort((a: any, b: any) => b._score - a._score);
  }, [projects]);

  const top10 = ranked.slice(0, 10);
  const bottom5 = ranked.slice(-5).reverse();

  const totalScore = ranked.reduce((s: number, p: any) => s + p._score, 0);
  const avgROI = ranked.length ? ranked.reduce((s: number, p: any) => s + Number(p.roi_percent || 0), 0) / ranked.length : 0;
  const critical = projects.filter((p: any) => (p.priority || "").startsWith("P1") || p.priority === "Critical").length;

  return (
    <div>
      <PageHeading icon="🏆" title="Prioritisation" subtitle="Composite score = ROI × 0.5 + Priority × 0.3 + Benefits − Cost." />

      <SectionFrame>
        <SectionTitle>Portfolio Prioritisation KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Projects Ranked" value={ranked.length} accent="#3b82f6" />
          <KpiCard label="P1 / Critical" value={critical} accent="#ef4444" />
          <KpiCard label="Avg ROI" value={`${avgROI.toFixed(1)}%`} accent="#22c55e" />
          <KpiCard label="Total Score" value={totalScore.toFixed(0)} accent="#8b5cf6" />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Top 10 Priority Score</SectionTitle>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={top10.map((p: any) => ({ name: p.name.slice(0, 22), score: p._score, roi: p.roi_percent || 0 }))} layout="vertical" margin={{ top: 5, right: 40, left: 120, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
              <Tooltip />
              <Bar dataKey="score" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="score" position="right" style={{ fontSize: 10, fill: "#334155" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionFrame>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionFrame>
          <SectionTitle>Top 5 by ROI</SectionTitle>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={[...ranked].sort((a: any, b: any) => (b.roi_percent || 0) - (a.roi_percent || 0)).slice(0, 5).map((p: any) => ({ name: p.name.slice(0, 20), roi: Number(p.roi_percent || 0) }))} layout="vertical" margin={{ top: 5, right: 40, left: 110, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                <Bar dataKey="roi" fill="#22c55e" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="roi" position="right" formatter={(v: number) => `${v.toFixed(0)}%`} style={{ fontSize: 10, fill: "#334155" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionFrame>

        <SectionFrame>
          <SectionTitle>Bottom 5 (candidates to defer)</SectionTitle>
          <div className="overflow-x-auto">
            <table className="st-table">
              <thead><tr><th>Project</th><th>Priority</th><th className="text-right">Score</th><th className="text-right">ROI</th></tr></thead>
              <tbody>
                {bottom5.map((p: any) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td>{p.priority || "—"}</td>
                    <td className="text-right tabular-nums">{p._score}</td>
                    <td className="text-right tabular-nums">{Number(p.roi_percent || 0).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionFrame>
      </div>

      <SectionFrame>
        <SectionTitle>Full Ranking</SectionTitle>
        <div className="overflow-x-auto">
          <table className="st-table">
            <thead><tr>
              <th className="text-right">Rank</th><th>Project</th><th>Program</th><th>Priority</th><th>RAG</th>
              <th className="text-right">Budget</th><th className="text-right">Benefits Tgt</th><th className="text-right">ROI %</th><th className="text-right">Score</th>
            </tr></thead>
            <tbody>
              {ranked.map((p: any, i: number) => (
                <tr key={p.id}>
                  <td className="text-right font-mono">{i + 1}</td>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.program || "—"}</td>
                  <td>{p.priority || "—"}</td>
                  <td><RagChip rag={p.rag} /></td>
                  <td className="text-right tabular-nums">{money(Number(p.budget || 0))}</td>
                  <td className="text-right tabular-nums">{money(Number(p.benefits_target || 0))}</td>
                  <td className="text-right tabular-nums">{Number(p.roi_percent || 0).toFixed(1)}%</td>
                  <td className="text-right tabular-nums font-semibold">{p._score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </div>
  );
}
