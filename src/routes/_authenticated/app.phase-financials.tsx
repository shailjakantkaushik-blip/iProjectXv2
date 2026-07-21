import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import {
  PortfolioFilters,
  emptyFilters,
  applyFilters,
  type PortfolioFilterState,
} from "@/components/portfolio-filters";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from "recharts";
import { ChartLegendList, legendItemsFromCounts } from "@/components/chart-legend-list";
import { ExpandableChart } from "@/components/expandable-chart";
import { groupGatesByProject } from "@/lib/project-phase";
import {
  monthlyInWindow,
  monthlyTriple,
  phaseWindowsFromGates,
  type MonthlyFinanceRow,
} from "@/lib/finance-lifecycle";

export const Route = createFileRoute("/_authenticated/app/phase-financials")({
  component: PhaseFinancialsPage,
});

const fmtM = (n: number) => `$${(n / 1e6).toFixed(2)}M`;
const DEFAULT_STAGES = [
  "Discovery",
  "Business Case / Seed Funding",
  "Design",
  "Business Case / Full Funding",
  "Build",
  "Testing",
  "Deployment",
  "Handover",
  "Benefit Realisation",
];
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
    queryFn: async () =>
      (
        await supabase
          .from("stage_gate_definitions")
          .select("*")
          .eq("org_id", organization!.id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
      ).data ?? [],
    enabled: !!organization,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", organization?.id],
    queryFn: async () => (await supabase.from("stage_gates").select("*")).data ?? [],
    enabled: !!organization,
  });

  const { data: monthly = [] } = useQuery({
    queryKey: ["financials_monthly", organization?.id],
    queryFn: async () =>
      (await supabase.from("financials_monthly").select("*").order("period_month")).data ?? [],
    enabled: !!organization,
  });

  const filtered = useMemo(() => applyFilters(projects, filters), [projects, filters]);
  const filteredIds = useMemo(() => new Set(filtered.map((p: any) => p.id)), [filtered]);

  const orgPhases = useMemo(() => {
    const configured = gateDefs.map((g: any) => g.gate_name).filter(Boolean);
    return configured.length ? configured : DEFAULT_STAGES;
  }, [gateDefs]);

  const gatesByProject = useMemo(() => groupGatesByProject(gates as any[]), [gates]);

  const monthlyByProject = useMemo(() => {
    const m = new Map<string, MonthlyFinanceRow[]>();
    for (const row of monthly as MonthlyFinanceRow[]) {
      if (!filteredIds.has(row.project_id)) continue;
      const list = m.get(row.project_id) || [];
      list.push(row);
      m.set(row.project_id, list);
    }
    return m;
  }, [monthly, filteredIds]);

  /**
   * True phase spend: for each org stage, sum monthly planned/actual/forecast
   * whose period falls in that gate's date window (across filtered projects).
   */
  const byPhase = useMemo(() => {
    const acc = new Map<
      string,
      { stage: string; planned: number; actual: number; forecast: number; count: number }
    >();
    for (const stage of orgPhases) {
      acc.set(stage, { stage, planned: 0, actual: 0, forecast: 0, count: 0 });
    }

    for (const p of filtered) {
      const pgates = gatesByProject.get(p.id) || [];
      const windows = phaseWindowsFromGates(pgates, orgPhases);
      const rows = monthlyByProject.get(p.id) || [];
      if (!windows.length) {
        // Fallback: attribute all monthly to current_phase / Unassigned
        const stage = p.current_phase || "Unassigned";
        const cur = acc.get(stage) || {
          stage,
          planned: 0,
          actual: 0,
          forecast: 0,
          count: 0,
        };
        const t = monthlyTriple(rows);
        cur.planned += t.planned;
        cur.actual += t.actual;
        cur.forecast += t.forecast;
        cur.count += 1;
        acc.set(stage, cur);
        continue;
      }
      let attributed = false;
      for (const w of windows) {
        const inWin = monthlyInWindow(rows, w);
        if (!inWin.length) continue;
        const t = monthlyTriple(inWin);
        const cur = acc.get(w.stage) || {
          stage: w.stage,
          planned: 0,
          actual: 0,
          forecast: 0,
          count: 0,
        };
        cur.planned += t.planned;
        cur.actual += t.actual;
        cur.forecast += t.forecast;
        cur.count += 1;
        acc.set(w.stage, cur);
        attributed = true;
      }
      if (!attributed && rows.length) {
        const stage = windows[0]?.stage || "Unassigned";
        const cur = acc.get(stage) || {
          stage,
          planned: 0,
          actual: 0,
          forecast: 0,
          count: 0,
        };
        const t = monthlyTriple(rows);
        cur.planned += t.planned;
        cur.actual += t.actual;
        cur.forecast += t.forecast;
        cur.count += 1;
        acc.set(stage, cur);
      }
    }

    return orgPhases
      .map((stage) => {
        const r = acc.get(stage) || {
          stage,
          planned: 0,
          actual: 0,
          forecast: 0,
          count: 0,
        };
        return {
          ...r,
          variance: r.planned - r.actual,
          remaining: Math.max(0, r.planned - r.actual),
        };
      })
      .concat(
        Array.from(acc.values())
          .filter((r) => !orgPhases.includes(r.stage))
          .map((r) => ({
            ...r,
            variance: r.planned - r.actual,
            remaining: Math.max(0, r.planned - r.actual),
          })),
      );
  }, [filtered, orgPhases, gatesByProject, monthlyByProject]);

  const totalPlanned = byPhase.reduce((s, r) => s + r.planned, 0);
  const totalActual = byPhase.reduce((s, r) => s + r.actual, 0);
  const totalForecast = byPhase.reduce((s, r) => s + r.forecast, 0);
  const consumed = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

  const distribution = byPhase
    .filter((r) => r.count > 0)
    .map((r) => ({ name: r.stage, value: r.count }));

  return (
    <PageExport name="Phase_Financials" title="Phase Financials">
      <PageHeading icon="💠">Phase Financials</PageHeading>
      <div className="text-sm text-muted-foreground mb-3">
        Planned vs actual vs forecast spend inside each stage-gate date window (from monthly
        cashflow), not whole-project totals dumped on the current phase.
      </div>
      <PortfolioFilters projects={projects} value={filters} onChange={setFilters} />

      <SectionFrame>
        <SectionTitle>Phase KPIs (Plan vs Actual)</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiCard label="Stages" value={orgPhases.length} accent="#3b82f6" />
          <KpiCard label="Planned" value={fmtM(totalPlanned)} accent="#8b5cf6" />
          <KpiCard label="Forecast" value={fmtM(totalForecast)} accent="#06b6d4" />
          <KpiCard label="Actual" value={fmtM(totalActual)} accent="#f59e0b" />
          <KpiCard
            label="Actual / Planned"
            value={`${consumed.toFixed(1)}%`}
            accent={consumed > 100 ? "#ef4444" : "#22c55e"}
          />
        </div>
      </SectionFrame>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionFrame className="lg:col-span-2">
          <ExpandableChart title="Planned vs Forecast vs Actual per Phase" heightClass="h-72">
            <BarChart data={byPhase} margin={{ top: 15, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="stage" fontSize={10} />
              <YAxis fontSize={11} tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} />
              <Tooltip formatter={(v: number) => fmtM(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="planned" name="Planned" fill="#93c5fd" />
              <Bar dataKey="forecast" name="Forecast" fill="#8b5cf6" />
              <Bar dataKey="actual" name="Actual" fill="#f59e0b">
                <LabelList
                  dataKey="count"
                  position="top"
                  style={{ fontSize: 10, fill: "#334155" }}
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
        </SectionFrame>

        <SectionFrame>
          <ExpandableChart title="Projects touching each phase window" heightClass="h-72">
            {distribution.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No phase spend yet — add monthly financials and gate dates.
              </div>
            ) : (
              <PieChart>
                <Pie
                  data={distribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {distribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            )}
          </ExpandableChart>
          <ChartLegendList
            className="mt-2"
            items={legendItemsFromCounts(
              distribution.map((d) => ({ name: d.name, value: d.value })),
              COLORS,
            )}
          />
        </SectionFrame>
      </div>

      <SectionFrame>
        <SectionTitle>Phase register</SectionTitle>
        <div className="overflow-x-auto">
          <table className="st-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th className="text-right">Projects</th>
                <th className="text-right">Planned</th>
                <th className="text-right">Forecast</th>
                <th className="text-right">Actual</th>
                <th className="text-right">Variance</th>
                <th className="text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {byPhase.map((r) => (
                <tr key={r.stage}>
                  <td className="font-medium">{r.stage}</td>
                  <td className="text-right tabular-nums">{r.count}</td>
                  <td className="text-right tabular-nums">{fmtM(r.planned)}</td>
                  <td className="text-right tabular-nums">{fmtM(r.forecast)}</td>
                  <td className="text-right tabular-nums">{fmtM(r.actual)}</td>
                  <td
                    className={
                      "text-right tabular-nums " +
                      (r.variance < 0 ? "text-red-600" : "text-emerald-700")
                    }
                  >
                    {fmtM(r.variance)}
                  </td>
                  <td className="text-right tabular-nums">{fmtM(r.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </PageExport>
  );
}
