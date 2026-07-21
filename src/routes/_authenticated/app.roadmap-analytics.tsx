import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ReferenceLine, LabelList,
} from "recharts";
import { ChartLegendList } from "@/components/chart-legend-list";

export const Route = createFileRoute("/_authenticated/app/roadmap-analytics")({
  component: RoadmapAnalyticsPage,
});

type Project = {
  id: string; name: string; program?: string | null; priority?: string | null;
  rag?: string | null; budget?: number | null; capex_approved?: number | null;
  opex_approved?: number | null; theme?: string | null;
};

import { CHART_SERIES } from "@/lib/chart-theme";
const THEME_COLORS: Record<string, string> = {
  Transform: CHART_SERIES[0], Grow: CHART_SERIES[2], Run: CHART_SERIES[3],
};

// Deterministic theme derivation from project attributes
function themeFor(p: Project): "Transform" | "Grow" | "Run" {
  const s = `${p.program || ""} ${p.name || ""}`.toLowerCase();
  if (/(transform|ai|digital|modern|migration|automation|platform)/.test(s)) return "Transform";
  if (/(grow|expand|new|launch|customer|portal|contact|market)/.test(s)) return "Grow";
  if (/(upgrade|maintenance|run|ops|compliance|erp|infra)/.test(s)) return "Run";
  const pr = (p.priority || "").toLowerCase();
  if (pr === "high" || pr === "critical") return "Transform";
  if (pr === "medium") return "Grow";
  return "Run";
}

// Risk factor (stdev / mean) from RAG
function riskFactor(rag?: string | null): number {
  const r = (rag || "").toLowerCase();
  if (r === "red") return 0.35;
  if (r === "amber") return 0.18;
  return 0.08;
}

// Risk score 1-7 for heatmap
function riskScore(rag?: string | null): number {
  const r = (rag || "").toLowerCase();
  if (r === "red") return 7;
  if (r === "amber") return 5;
  return 2;
}

// Box-Muller normal sample
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * (p / 100);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function fmtM(v: number): string {
  return `$${(v / 1_000_000).toFixed(1)}M`;
}

function RoadmapAnalyticsPage() {
  const { organization } = useAuth();
  const [iterations, setIterations] = useState(2000);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-roadmap", organization?.id],
    queryFn: async () => (await supabase.from("projects").select("*")).data as Project[] ?? [],
    enabled: !!organization,
  });

  const enriched = useMemo(() => projects.map((p) => ({
    ...p,
    theme: themeFor(p),
    budget: Number(p.budget || p.capex_approved || 0) + Number(p.opex_approved || 0),
    sigma: riskFactor(p.rag),
    score: riskScore(p.rag),
  })), [projects]);

  const approvedBudget = enriched.reduce((s, p) => s + p.budget, 0);

  // Investment mix
  const mix = useMemo(() => {
    const m: Record<string, number> = { Transform: 0, Grow: 0, Run: 0 };
    for (const p of enriched) m[p.theme] += p.budget;
    return Object.entries(m).map(([theme, value]) => ({ theme, value }));
  }, [enriched]);

  // Risk exposure by program (avg risk score, weighted by budget)
  const riskByProgram = useMemo(() => {
    const m = new Map<string, { sum: number; weight: number }>();
    for (const p of enriched) {
      const k = p.program || "Unassigned";
      const cur = m.get(k) || { sum: 0, weight: 0 };
      const w = Math.max(1, p.budget);
      cur.sum += p.score * w;
      cur.weight += w;
      m.set(k, cur);
    }
    return Array.from(m.entries())
      .map(([program, v]) => ({ program, score: v.weight ? +(v.sum / v.weight).toFixed(2) : 0 }))
      .sort((a, b) => b.score - a.score);
  }, [enriched]);

  // Monte Carlo simulation
  const mc = useMemo(() => {
    if (enriched.length === 0) return { samples: [] as number[], histogram: [] as { bin: number; count: number }[], p50: 0, p80: 0, p95: 0 };
    const samples: number[] = new Array(iterations);
    for (let i = 0; i < iterations; i++) {
      let total = 0;
      for (const p of enriched) {
        // Truncated normal (no negatives)
        const s = Math.max(0, p.budget * (1 + p.sigma * randn()));
        total += s;
      }
      samples[i] = total;
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p80 = percentile(sorted, 80);
    const p95 = percentile(sorted, 95);

    // 30-bin histogram in $M
    const min = sorted[0] / 1_000_000;
    const max = sorted[sorted.length - 1] / 1_000_000;
    const bins = 30;
    const width = Math.max(0.0001, (max - min) / bins);
    const hist: { bin: number; count: number }[] = [];
    for (let b = 0; b < bins; b++) hist.push({ bin: +(min + b * width + width / 2).toFixed(2), count: 0 });
    for (const s of samples) {
      const v = s / 1_000_000;
      const idx = Math.min(bins - 1, Math.floor((v - min) / width));
      hist[idx].count += 1;
    }
    return { samples, histogram: hist, p50, p80, p95 };
  }, [enriched, iterations]);

  // Heatmap-style color for risk bars
  const riskColor = (s: number) => {
    const t = Math.max(0, Math.min(1, (s - 1) / 6));
    const r = Math.round(254 + t * (139 - 254));
    const g = Math.round(226 + t * (0 - 226));
    const b = Math.round(226 + t * (0 - 226));
    return `rgb(${r},${g},${b})`;
  };

  return (
    <PageExport name="Roadmap_Analytics" title="Strategic Roadmap Analytics + Predictive Risk">
      <PageHeading icon="🧠">Strategic Roadmap Analytics + Predictive Risk</PageHeading>


      <SectionFrame>
        <div className="text-xs font-medium text-muted-foreground mb-2">Monte-Carlo Iterations</div>
        <div className="flex items-center gap-4">
          <input
            type="range" min={500} max={5000} step={100}
            value={iterations}
            onChange={(e) => setIterations(Number(e.target.value))}
            className="flex-1 accent-blue-600"
          />
          <div className="w-16 text-right tabular-nums font-semibold">{iterations}</div>
        </div>
      </SectionFrame>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
        <KpiCard label="Approved Budget" value={fmtM(approvedBudget)} />
        <KpiCard label="P50" value={fmtM(mc.p50)} />
        <KpiCard label="P80" value={fmtM(mc.p80)} />
        <KpiCard label="P95" value={fmtM(mc.p95)} />
      </div>

      <SectionFrame>
        <SectionTitle>Investment Mix</SectionTitle>
        <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_12rem]">
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={mix} dataKey="value" nameKey="theme"
                  cx="50%" cy="50%"
                  innerRadius={70} outerRadius={110}
                  label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {mix.map((m) => <Cell key={m.theme} fill={THEME_COLORS[m.theme]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtM(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ChartLegendList
            columns={1}
            items={mix.map((m) => ({
              name: m.theme,
              color: THEME_COLORS[m.theme] || "#64748b",
              detail: fmtM(m.value),
            }))}
          />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Risk Exposure by Program</SectionTitle>
        <div className="h-80">
          <ResponsiveContainer>
            <BarChart data={riskByProgram} margin={{ top: 10, right: 20, left: 20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="program" fontSize={11} angle={-20} textAnchor="end" interval={0} height={60}
                     label={{ value: "Program", position: "insideBottom", offset: -5, fontSize: 11 }} />
              <YAxis domain={[0, 7]} fontSize={11}
                     label={{ value: "Risk Score", angle: -90, position: "insideLeft", fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="score">
                {riskByProgram.map((r, i) => <Cell key={i} fill={riskColor(r.score)} />)}
                <LabelList dataKey="score" position="top" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
          <span>Low</span>
          <div className="h-2 w-32 rounded"
               style={{ background: "linear-gradient(to right, rgb(254,226,226), rgb(139,0,0))" }} />
          <span>High</span>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Monte-Carlo Portfolio Cost ($M)</SectionTitle>
        <div className="h-96">
          <ResponsiveContainer>
            <BarChart data={mc.histogram} margin={{ top: 10, right: 20, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="bin" fontSize={11}
                     tickFormatter={(v: number) => v.toFixed(0)} />
              <YAxis fontSize={11} />
              <Tooltip
                formatter={(v: number) => [v, "Iterations"]}
                labelFormatter={(l) => `~$${l}M`}
              />
              <ReferenceLine x={mc.histogram.find(h => h.bin >= approvedBudget / 1_000_000)?.bin}
                             stroke="#16a34a" strokeWidth={2}
                             label={{ value: "Approved", position: "insideTopLeft", fill: "#16a34a", fontSize: 11 }} />
              <ReferenceLine x={mc.histogram.find(h => h.bin >= mc.p80 / 1_000_000)?.bin}
                             stroke="#f59e0b" strokeWidth={2}
                             label={{ value: "P80", position: "insideTopRight", fill: "#b45309", fontSize: 11 }} />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Simulated {iterations.toLocaleString()} portfolio cost outcomes using per-project budget × RAG-derived volatility (Green 8%, Amber 18%, Red 35%).
        </div>
      </SectionFrame>
    </PageExport>
  );
}

