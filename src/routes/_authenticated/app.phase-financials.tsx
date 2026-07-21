import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard, RagChip } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { PortfolioFilters, emptyFilters, applyFilters, type PortfolioFilterState } from "@/components/portfolio-filters";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LabelList } from "recharts";
import { ChartLegendList, legendItemsFromCounts } from "@/components/chart-legend-list";

export const Route = createFileRoute("/_authenticated/app/phase-financials")({
  component: PhaseFinancialsPage,
});

const fmtM = (n: number) => `$${(n / 1e6).toFixed(2)}M`;
const DEFAULT_STAGES = ["Discovery", "Business Case", "Seed Funding", "Full Funding", "Planning", "Execution", "Deployment", "Benefits Realisation", "Closure"];
const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#22c55e", "#ec4899"];

function PhaseFinancialsPage() {
  const { organization } = useAuth();
  const [filters, setFilters] = useState<PortfolioFilterState>(emptyFilters);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => (await supabase.from("projects").select("*")).data ?? [],
    enabled: !!organization,
  });

  const { data: gateDefs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", organization?.id],
    queryFn: async () => (await supabase.from("stage_gate_definitions")
      .select("*").eq("org_id", organization!.id).eq("is_active", true)
      .order("sort_order", { ascending: true })).data ?? [],
    enabled: !!organization,
  });

  const filtered = useMemo(() => applyFilters(projects, filters), [projects, filters]);

  const stages = useMemo(() => {
    const configured = gateDefs.map((g: any) => g.name).filter(Boolean);
    const base = configured.length ? configured : DEFAULT_STAGES;
    const s = new Set<string>(base);
    filtered.forEach((p: any) => { if (p.current_phase) s.add(p.current_phase); });
    // preserve configured order first, then any extras from projects
    const ordered = [...base];
    Array.from(s).forEach((x) => { if (!ordered.includes(x)) ordered.push(x); });
    return ordered;
  }, [filtered, gateDefs]);

  const byPhase = useMemo(() => stages.map((stage) => {
    const rows = filtered.filter((p: any) => (p.current_phase || "Ideation") === stage);
    const budget = rows.reduce((s, p: any) => s + Number(p.budget || 0), 0);
    const incurred = rows.reduce((s, p: any) => s + Number(p.capex_incurred || 0) + Number(p.opex_incurred || 0), 0);
    const forecast = rows.reduce((s, p: any) => s + Number(p.capex_approved || 0) + Number(p.opex_approved || 0), 0);
    const benefits = rows.reduce((s, p: any) => s + Number(p.benefits_realised || 0), 0);
    return { stage, count: rows.length, budget, incurred, forecast, benefits, remaining: budget - incurred };
  }), [filtered, stages]);

  const totalBudget = byPhase.reduce((s, r) => s + r.budget, 0);
  const totalIncurred = byPhase.reduce((s, r) => s + r.incurred, 0);
  const totalForecast = byPhase.reduce((s, r) => s + r.forecast, 0);
  const consumed = totalBudget > 0 ? (totalIncurred / totalBudget) * 100 : 0;

  const distribution = byPhase.filter((r) => r.count > 0).map((r) => ({ name: r.stage, value: r.count }));

  return (
    <PageExport name="Phase_Financials" title="Phase Financials">
      <PageHeading icon="💠">Phase Financials</PageHeading>
      <div className="text-sm text-muted-foreground mb-3">Budget, forecast &amp; actuals rolled up by current stage-gate across the portfolio.</div>
      <PortfolioFilters projects={projects} value={filters} onChange={setFilters} />

      <SectionFrame>
        <SectionTitle>Phase KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiCard label="Stages" value={stages.length} accent="#3b82f6" />
          <KpiCard label="Portfolio Budget" value={fmtM(totalBudget)} accent="#8b5cf6" />
          <KpiCard label="Forecast" value={fmtM(totalForecast)} accent="#06b6d4" />
          <KpiCard label="Actual" value={fmtM(totalIncurred)} accent="#f59e0b" />
          <KpiCard label="Consumed" value={`${consumed.toFixed(1)}%`} accent={consumed > 100 ? "#ef4444" : "#22c55e"} />
        </div>
      </SectionFrame>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionFrame className="lg:col-span-2">
          <SectionTitle>Budget vs Forecast vs Actual per Phase</SectionTitle>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={byPhase} margin={{ top: 15, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis dataKey="stage" fontSize={10} />
                <YAxis fontSize={11} tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => fmtM(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="budget" name="Budget" fill="#1d4ed8" />
                <Bar dataKey="forecast" name="Forecast" fill="#8b5cf6" />
                <Bar dataKey="incurred" name="Actual" fill="#f59e0b">
                  <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: "#334155" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionFrame>

        <SectionFrame>
          <SectionTitle>Project Distribution</SectionTitle>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={distribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {distribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ChartLegendList items={legendItemsFromCounts(distribution, COLORS)} maxHeightClass="max-h-28" />
        </SectionFrame>
      </div>

      <SectionFrame>
        <SectionTitle>Benefits Realisation per Phase</SectionTitle>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={byPhase}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="stage" fontSize={10} />
              <YAxis fontSize={11} tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} />
              <Tooltip formatter={(v: number) => fmtM(v)} />
              <Bar dataKey="benefits" fill="#22c55e" name="Benefits Realised">
                <LabelList dataKey="benefits" position="top" formatter={(v: number) => fmtM(v)} style={{ fontSize: 10, fill: "#334155" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Phase Register</SectionTitle>
        <div className="overflow-x-auto">
          <table className="st-table">
            <thead>
              <tr>
                <th>Stage</th><th className="text-right">Projects</th>
                <th className="text-right">Budget</th><th className="text-right">Forecast</th>
                <th className="text-right">Actual</th><th className="text-right">Remaining</th>
                <th className="text-right">Benefits</th><th className="text-right">% Spent</th><th>Health</th>
              </tr>
            </thead>
            <tbody>
              {byPhase.map((r) => {
                const pct = r.budget > 0 ? (r.incurred / r.budget) * 100 : 0;
                const health = pct > 100 ? "Red" : pct > 80 ? "Amber" : "Green";
                return (
                  <tr key={r.stage}>
                    <td className="font-medium">{r.stage}</td>
                    <td className="text-right">{r.count}</td>
                    <td className="text-right tabular-nums">{fmtM(r.budget)}</td>
                    <td className="text-right tabular-nums">{fmtM(r.forecast)}</td>
                    <td className="text-right tabular-nums">{fmtM(r.incurred)}</td>
                    <td className="text-right tabular-nums">{fmtM(r.remaining)}</td>
                    <td className="text-right tabular-nums">{fmtM(r.benefits)}</td>
                    <td className="text-right tabular-nums">{pct.toFixed(1)}%</td>
                    <td><RagChip rag={health} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </PageExport>
  );
}
