import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell,
  Legend, LineChart, Line, CartesianGrid, LabelList,
} from "recharts";
import { SectionFrame, SectionTitle, RagChip } from "@/components/streamlit";
import { ChartLegendList, legendItemsFromCounts } from "@/components/chart-legend-list";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { exportElementPDF } from "@/components/page-export";
import { ExpandableChart } from "@/components/expandable-chart";
import { ExpandablePanel } from "@/components/expandable-panel";
import { ChevronDown, ChevronRight } from "lucide-react";
import { RAG_COLORS, PRIORITY_COLORS, CHART_SERIES } from "@/lib/chart-theme";
import { PageLoading } from "@/components/page-loading";
import {
  matchPhase,
  normLabel,
  resolveCurrentStage as resolveStageShared,
} from "@/lib/project-phase";
import { fyOf, projectScheduleEnd, projectScheduleStart } from "@/lib/project-dates";
import {
  projectApprovedFunding,
  projectForecast,
  projectIncurred,
  projectRemaining,
  projectRealisedRoi,
} from "@/lib/project-finance";
import {
  expandProjectsToTimelineLanes,
  fetchOrgStreams,
  summarizeTimelineLaneFinancials,
} from "@/lib/project-streams";

export const Route = createFileRoute("/_authenticated/app/executive")({
  component: ExecutiveDashboard,
});

const PHASES = ["Idea", "Discovery", "Design", "Build", "Test", "Deploy", "Benefits"];
const PHASE_HEADER_COLORS: Record<string, string> = {
  Idea: "var(--ct-chart-1)", Discovery: "var(--ct-chart-4)", Design: "var(--ct-chart-6)",
  Build: "var(--ct-chart-3)", Test: "var(--ct-rag-red)", Deploy: "var(--ct-chart-5)", Benefits: "var(--ct-chart-2)",
};
const THEME_PALETTE = CHART_SERIES;
const CAPEX_COLORS = [CHART_SERIES[0], CHART_SERIES[1], CHART_SERIES[2], CHART_SERIES[3]];

const INACTIVE_STATUSES = new Set([
  "completed",
  "cancelled",
  "canceled",
  "closed",
  "archived",
]);

function money(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
}
function moneyM(n: number) { return `$${(n / 1e6).toFixed(1)}M`; }

function ExecutiveDashboard() {
  const { organization } = useAuth();
  const [program, setProgram] = useState("All");
  const [sponsor, setSponsor] = useState("All");
  const [priority, setPriority] = useState("All");
  const [status, setStatus] = useState("All");
  const [fy, setFy] = useState("All");
  type TimelineView = "Portfolio" | "Program" | "Health" | "Priority" | "Theme" | "Sponsor" | "Status";
  const [timelineView, setTimelineView] = useState<TimelineView>("Program");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showProjectTimeline, setShowProjectTimeline] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", organization?.id],
    queryFn: async () => (await supabase.from("stage_gates").select("*")).data ?? [],
    enabled: !!organization,
  });

  const { data: streams = [] } = useQuery({
    queryKey: ["project_streams", organization?.id],
    queryFn: () => fetchOrgStreams(organization!.id),
    enabled: !!organization?.id,
  });

  const { data: gateDefs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", organization?.id],
    queryFn: async () => (await supabase.from("stage_gate_definitions")
      .select("*").eq("org_id", organization!.id).eq("is_active", true)
      .order("sort_order", { ascending: true })).data ?? [],
    enabled: !!organization,
  });

  const { data: monthly = [] } = useQuery({
    queryKey: ["financials_monthly", organization?.id],
    queryFn: async () => (await supabase.from("financials_monthly").select("*")).data ?? [],
    enabled: !!organization,
  });

  const fyStartMonth = organization?.fy_start_month || 4;
  const opts = (col: string) => Array.from(new Set(projects.map((p: any) => p[col]).filter(Boolean))).sort();

  const fyOptions = useMemo(() => {
    const s = new Set<string>();
    projects.forEach((p: any) => {
      const a = fyOf(projectScheduleStart(p), fyStartMonth);
      const b = fyOf(projectScheduleEnd(p), fyStartMonth);
      if (a) s.add(a); if (b) s.add(b);
    });
    return Array.from(s).sort();
  }, [projects, fyStartMonth]);

  const filtered = useMemo(() => projects.filter((p: any) =>
    (program === "All" || p.program === program) &&
    (sponsor === "All" || p.sponsor === sponsor) &&
    (priority === "All" || p.priority === priority) &&
    (status === "All" || p.status === status) &&
    (fy === "All" ||
      fyOf(projectScheduleStart(p), fyStartMonth) === fy ||
      fyOf(projectScheduleEnd(p), fyStartMonth) === fy)
  ), [projects, program, sponsor, priority, status, fy, fyStartMonth]);

  const filteredIds = new Set(filtered.map((p: any) => p.id));

  // KPI totals — approved funding / incurred / FAC / remaining via project-finance helpers
  const approvedFunding = filtered.reduce((s, p) => s + projectApprovedFunding(p), 0);
  const totalIncurred = filtered.reduce((s, p) => s + projectIncurred(p), 0);
  const totalForecast = filtered.reduce((s, p) => s + projectForecast(p), 0);
  const remaining = filtered.reduce((s, p) => s + projectRemaining(p), 0);
  const active = filtered.filter((p: any) => p.status === "In Progress").length;
  const completed = filtered.filter((p: any) => p.status === "Completed").length;
  const today = new Date();
  const overdue = filtered.filter((p: any) => p.end_date && new Date(p.end_date) < today && p.status !== "Completed").length;
  const ragScore = filtered.length
    ? Math.round((filtered.filter((p: any) => p.rag === "Green").length / filtered.length) * 100)
    : 0;

  const buildSpark = (
    key: "capex_planned" | "capex_actual" | "capex_forecast" | "benefits_actual" | null,
    color: string,
  ) => {
    const rows = monthly.filter((m: any) => filteredIds.has(m.project_id));
    const buckets = new Map<string, number>();
    if (key && rows.length) {
      rows.forEach((r: any) => {
        const k = String(r.period_month || "").slice(0, 7);
        if (!k) return;
        buckets.set(k, (buckets.get(k) || 0) + Number(r[key] || 0));
      });
    }
    let series = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([_m, v], i) => ({ i, v }));
    // Do not invent synthetic sparklines for financial KPIs when monthly data is thin.
    if (series.length < 6) {
      series = Array.from({ length: 12 }, (_, i) => ({ i, v: 0 }));
    }
    return { data: series, color };
  };

  const kpis = [
    { label: "Approved Funding", value: money(approvedFunding), spark: buildSpark("capex_planned", "#1d4ed8") },
    { label: "Incurred", value: money(totalIncurred), spark: buildSpark("capex_actual", "#15803d") },
    { label: "Forecast", value: money(totalForecast), spark: buildSpark("capex_forecast", "#f59e0b") },
    { label: "Remaining", value: money(remaining), spark: buildSpark(null, "#8b5cf6") },
    { label: "Active", value: active, spark: buildSpark(null, "#06b6d4") },
    { label: "Completed", value: completed, spark: buildSpark(null, "#15803d") },
    { label: "Overdue", value: overdue, spark: buildSpark(null, "#dc2626") },
    { label: "RAG Score", value: `${ragScore}%`, spark: buildSpark(null, "#8b5cf6") },
  ];

  // ── Charts data ──────────────────────────────────────────────
  // Portfolio Health (donut RAG)
  const ragData = ["Green", "Amber", "Red"].map((r) => ({
    name: r, value: filtered.filter((p: any) => p.rag === r).length,
  })).filter((d) => d.value > 0);

  // Funding vs Actual (4 bars)
  const capexBars = [
    { name: "Approved", value: approvedFunding },
    { name: "Incurred", value: totalIncurred },
    { name: "Forecast", value: totalForecast },
    { name: "Remaining", value: remaining },
  ];

  // Monthly Spend ($M) — Actual vs Forecast, bucketed by year-month (last 12)
  const monthlySpend = useMemo(() => {
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const rows = monthly.filter((m: any) => filteredIds.has(m.project_id));
    const buckets = new Map<string, { actual: number; forecast: number }>();
    rows.forEach((r: any) => {
      const d = new Date(r.period_month);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cur = buckets.get(key) || { actual: 0, forecast: 0 };
      cur.actual += Number(r.capex_actual || 0) + Number(r.opex_actual || 0);
      cur.forecast += Number(r.capex_forecast || 0) + Number(r.opex_forecast || 0);
      buckets.set(key, cur);
    });
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, v]) => {
        const [y, m] = key.split("-");
        return {
          month: `${monthNames[Number(m) - 1]} '${y.slice(-2)}`,
          actual: v.actual / 1e6,
          forecast: v.forecast / 1e6,
        };
      });
  }, [monthly, filteredIds]);

  // By Theme (donut)
  const themeData = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((p: any) => {
      const k = p.theme || p.program || "Unassigned";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m, ([name, value]) => ({ name, value }));
  }, [filtered]);

  // By Priority (horizontal bar)
  const priorityData = useMemo(() => {
    const order = ["P1 - Critical", "P2 - High", "P3 - Medium", "P4 - Low"];
    const m = new Map<string, number>();
    filtered.forEach((p: any) => {
      const k = p.priority || "P4 - Low";
      m.set(k, (m.get(k) || 0) + 1);
    });
    const arr = Array.from(m, ([name, value]) => ({ name, value }));
    arr.sort((a, b) => {
      const ai = order.indexOf(a.name); const bi = order.indexOf(b.name);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    return arr;
  }, [filtered]);

  // Top 10 by realised ROI (horizontal bar)
  const topROI = useMemo(() => filtered
    .map((p: any) => {
      const roi = projectRealisedRoi(p);
      return { name: (p.name || "").slice(0, 22), roi: Math.round(roi * 10) / 10 };
    })
    .filter((x) => x.roi !== 0)
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 10), [filtered]);

  // Portfolio Segmentation
  const segmentation = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((p: any) => {
      const k = p.portfolio_category || p.portfolio || (Number(p.budget || 0) > 500000 ? "Business Strategic" : "IT Strategic");
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m, ([name, value]) => ({ name, value }));
  }, [filtered]);

  // Governance Channel
  const governanceChannel = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((p: any) => {
      const k = p.governance_channel || (Number(p.budget || 0) > 200000 ? "Channel B (>$200K)" : "Channel A (<$200K)");
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m, ([name, value]) => ({ name, value }));
  }, [filtered]);

  const orgPhases = useMemo(() => {
    const fromDefs = (gateDefs as any[]).map((d) => d.gate_name).filter(Boolean);
    return fromDefs.length > 0 ? fromDefs : PHASES;
  }, [gateDefs]);

  // Project-level gates (kanban / register). Timeline uses lane-keyed map below.
  const gatesByProject = useMemo(() => {
    const m = new Map<string, any[]>();
    gates.forEach((g: any) => {
      if (!m.has(g.project_id)) m.set(g.project_id, []);
      m.get(g.project_id)!.push(g);
    });
    return m;
  }, [gates]);

  // Stream lanes own their gates; non-stream projects key by project_id.
  const gatesByLane = useMemo(() => {
    const m = new Map<string, any[]>();
    gates.forEach((g: any) => {
      const laneKey = g.stream_id || g.project_id;
      if (!m.has(laneKey)) m.set(laneKey, []);
      m.get(laneKey)!.push(g);
    });
    return m;
  }, [gates]);

  // ── Timeline (stream lanes by default; optional project rollup lane) ──
  const timelineLanes = useMemo(() => {
    return expandProjectsToTimelineLanes(filtered, streams as any[], {
      gates: gates as any[],
      resolvePhase: (p, streamGates) => resolveStageShared(p, streamGates, orgPhases),
      includeProjectRollup: showProjectTimeline,
    });
  }, [filtered, streams, gates, orgPhases, showProjectTimeline]);

  const timelineGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    const keyFor = (p: any): string => {
      switch (timelineView) {
        case "Portfolio": return "Portfolio";
        case "Program":   return p.program || "Unassigned";
        case "Health":    return p.rag || "Unrated";
        case "Priority":  return p.priority || "Unset";
        case "Theme":     return p.theme || "Unassigned";
        case "Sponsor":   return p.sponsor || "Unassigned";
        case "Status":    return p.status || "Unset";
      }
    };
    timelineLanes.forEach((p: any) => {
      if (!projectScheduleStart(p) || !projectScheduleEnd(p)) return;
      const k = keyFor(p);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(p);
    });
    return Array.from(groups.entries()).sort();
  }, [timelineLanes, timelineView]);

  // FY runs per org's fy_start_month. FY label uses ending year.
  const timelineBounds = useMemo(() => {
    const startIdx = Math.max(1, Math.min(12, fyStartMonth)) - 1;
    const fyStartFor = (d: Date) => {
      const y = d.getFullYear();
      const startYear = d.getMonth() >= startIdx ? y : y - 1;
      return new Date(startYear, startIdx, 1);
    };
    const fyEndFor = (d: Date) => {
      const s = fyStartFor(d);
      return new Date(s.getFullYear() + 1, s.getMonth(), 0, 23, 59, 59);
    };
    const fyLabel = (d: Date) => `FY${String(fyStartFor(d).getFullYear() + 1).slice(-2)}`;

    let minD: Date | null = null;
    let maxD: Date | null = null;

    if (fy !== "All") {
      const yy = parseInt(fy.replace(/[^0-9]/g, ""), 10);
      const endYear = 2000 + yy;
      minD = new Date(endYear - 1, startIdx, 1);
      maxD = new Date(endYear, startIdx, 0, 23, 59, 59);
    } else {
      timelineLanes.forEach((p: any) => {
        const s = projectScheduleStart(p);
        const e = projectScheduleEnd(p);
        if (s) { const d = new Date(s); if (!minD || d < minD) minD = d; }
        if (e) { const d = new Date(e); if (!maxD || d > maxD) maxD = d; }
      });
      if (!minD || !maxD) {
        const now = new Date();
        minD = fyStartFor(now); maxD = fyEndFor(now);
      } else {
        minD = fyStartFor(minD); maxD = fyEndFor(maxD);
      }
    }

    // Build month columns and FY groups
    const months: { key: string; label: string; year: number; monthIndex: number; fy: string }[] = [];
    const cur = new Date(minD.getFullYear(), minD.getMonth(), 1);
    while (cur <= maxD) {
      const mLabel = cur.toLocaleString("en", { month: "short" });
      months.push({
        key: `${cur.getFullYear()}-${cur.getMonth()}`,
        label: mLabel,
        year: cur.getFullYear(),
        monthIndex: cur.getMonth(),
        fy: fyLabel(cur),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    const fyGroups: { fy: string; span: number }[] = [];
    months.forEach((m) => {
      const last = fyGroups[fyGroups.length - 1];
      if (last && last.fy === m.fy) last.span += 1;
      else fyGroups.push({ fy: m.fy, span: 1 });
    });

    return {
      start: minD, end: maxD,
      totalMs: maxD.getTime() - minD.getTime(),
      months, fyGroups,
    };
  }, [timelineLanes, fy, fyStartMonth]);

  const toggleCollapse = (name: string) =>
    setCollapsed((c) => ({ ...c, [name]: !c[name] }));

  const phaseColor = (name: string, i: number) =>
    PHASE_HEADER_COLORS[name] || THEME_PALETTE[i % THEME_PALETTE.length];

  const resolveCurrentStage = (p: any): string | null =>
    resolveStageShared(p, gatesByProject.get(p.id) || [], orgPhases);

  const kanban = useMemo(() => {
    const activeProjects = filtered.filter((p: any) => {
      const s = normLabel(p.status || "");
      return !INACTIVE_STATUSES.has(s);
    });

    const cols = orgPhases.map((ph) => ({ phase: ph, items: [] as any[] }));
    const byPhase = new Map(cols.map((c) => [c.phase, c]));
    const other: any[] = [];

    for (const p of activeProjects) {
      const stage = resolveCurrentStage(p);
      if (stage && byPhase.has(stage)) {
        byPhase.get(stage)!.items.push(p);
        continue;
      }
      const mapped = matchPhase(stage, orgPhases);
      if (mapped && byPhase.has(mapped)) {
        byPhase.get(mapped)!.items.push(p);
      } else {
        other.push(p);
      }
    }

    const result = cols.map((c) => ({ ...c, items: c.items.slice(0, 24) }));
    if (other.length > 0) {
      result.push({ phase: "Other / Unmapped", items: other.slice(0, 24) });
    }
    return result;
    // resolveCurrentStage closes over gatesByProject + orgPhases
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, orgPhases, gatesByProject]);

  const exportPdf = async () => {
    if (!reportRef.current) {
      toast.error("Dashboard is not ready to export yet.");
      return;
    }
    setExporting(true);
    toast.info("Generating executive PDF…");
    try {
      await exportElementPDF(
        reportRef.current,
        `executive-dashboard-${new Date().toISOString().slice(0, 10)}`,
        { orientation: "portrait" },
      );
      toast.success("PDF downloaded");
    } catch {
      /* exportElementPDF already toasts the error */
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      {/* Header + filters */}
      <SectionFrame>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="page-heading">📊 PMO Portfolio — Executive Summary</div>
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={exporting}
            className="print:hidden rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-60"
          >
            {exporting ? "Generating…" : "Generate Executive Dashboard PDF"}
          </button>
        </div>
      </SectionFrame>

      <div ref={reportRef}>
      <SectionFrame>
        <div className="mb-3 page-heading text-base font-semibold">Portfolio filters</div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["Program", program, setProgram, opts("program")],
            ["Sponsor", sponsor, setSponsor, opts("sponsor")],
            ["Priority", priority, setPriority, opts("priority")],
            ["Status", status, setStatus, opts("status")],
            ["FY", fy, setFy, fyOptions],
          ].map(([label, val, setter, options]: any) => (
            <select key={label} value={val} onChange={(e) => setter(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs">
              <option value="All">{label}: All</option>
              {options.map((o: string) => (<option key={o} value={o}>{label}: {o}</option>))}
            </select>
          ))}
        </div>
      </SectionFrame>

      {/* Key Metrics */}
      <SectionFrame>
        <SectionTitle>Key Metrics</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-md border border-border bg-surface p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div className="mt-0.5 text-lg font-bold text-foreground">{k.value}</div>
              <div className="mt-1 h-10">
                <ResponsiveContainer>
                  <LineChart data={k.spark.data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                    <Tooltip
                      cursor={{ stroke: k.spark.color, strokeWidth: 1, strokeDasharray: "3 3" }}
                      contentStyle={{ fontSize: 11, padding: "4px 8px", borderRadius: 6 }}
                      labelFormatter={(i: any) => `Point ${Number(i) + 1}`}
                      formatter={(v: any) => [typeof k.value === "string" && k.value.startsWith("$") ? money(Number(v)) : Math.round(Number(v) * 10) / 10, k.label]}
                    />
                    <Line type="monotone" dataKey="v" stroke={k.spark.color} strokeWidth={1.8} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      </SectionFrame>

      {/* Portfolio Analytics — matches reference layout */}
      <SectionFrame>
        <SectionTitle>Portfolio Analytics</SectionTitle>
        {isLoading ? (
          <PageLoading label="Loading executive view…" fullScreen={false} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Portfolio Health — donut */}
            <ChartBox
              title="Portfolio Health"
              legend={
                ragData.length > 0 ? (
                  <ChartLegendList
                    items={legendItemsFromCounts(ragData, RAG_COLORS)}
                    columns={ragData.length <= 3 ? 1 : 2}
                  />
                ) : undefined
              }
            >
              {ragData.length === 0 ? <Empty /> : (
                <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                  <Pie data={ragData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius="48%" outerRadius="74%"
                    paddingAngle={2} stroke="#fff" strokeWidth={2}>
                    {ragData.map((e) => <Cell key={e.name} fill={RAG_COLORS[e.name]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [`${v} projects`, n]} />
                </PieChart>
              )}
            </ChartBox>

            {/* Funding vs Actual */}
            <ChartBox title="Funding vs Actual">
              <BarChart data={capexBars} margin={{ top: 25, right: 15, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={10} tickFormatter={(v) => money(v)} />
                <Tooltip formatter={(v: any) => money(Number(v))} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {capexBars.map((_, i) => <Cell key={i} fill={CAPEX_COLORS[i]} />)}
                  <LabelList dataKey="value" position="top" fontSize={11} formatter={(v: any) => moneyM(Number(v))} />
                </Bar>
              </BarChart>
            </ChartBox>

            {/* Monthly Spend $M */}
            <ChartBox title="Monthly Spend ($M)">
              <LineChart data={monthlySpend} margin={{ top: 15, right: 15, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={10} />
                <Tooltip formatter={(v: any) => `$${Number(v).toFixed(2)}M`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="actual" stroke="#22c55e" strokeWidth={2} name="Actual" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="forecast" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 4" name="Forecast" dot={{ r: 3 }} />
              </LineChart>
            </ChartBox>

            {/* By Theme */}
            <ChartBox
              title="By Theme"
              legend={
                themeData.length > 0 ? (
                  <ChartLegendList items={legendItemsFromCounts(themeData, THEME_PALETTE)} />
                ) : undefined
              }
            >
              {themeData.length === 0 ? <Empty /> : (
                <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                  <Pie data={themeData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius="46%" outerRadius="72%"
                    paddingAngle={2} stroke="#fff" strokeWidth={2}>
                    {themeData.map((_, i) => <Cell key={i} fill={THEME_PALETTE[i % THEME_PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [`${v} projects`, n]} />
                </PieChart>
              )}
            </ChartBox>

            {/* By Priority — horizontal */}
            <ChartBox title="By Priority">
              <BarChart data={priorityData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis type="number" fontSize={10} allowDecimals={false} />
                <YAxis type="category" dataKey="name" fontSize={11} width={90} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {priorityData.map((d, i) => <Cell key={i} fill={PRIORITY_COLORS[d.name] || "#64748b"} />)}
                  <LabelList dataKey="value" position="right" fontSize={11} />
                </Bar>
              </BarChart>
            </ChartBox>

            {/* Top 10 by ROI — horizontal */}
            <ChartBox title="Top 10 Projects by ROI %">
              {topROI.length === 0 ? <Empty msg="No ROI data — add benefits & incurred cost" /> : (
                <BarChart data={topROI} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                  <XAxis type="number" fontSize={10} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" fontSize={10} width={130} />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Bar dataKey="roi" fill="#eab308" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="roi" position="right" fontSize={10} formatter={(v: any) => `${v}%`} />
                  </Bar>
                </BarChart>
              )}
            </ChartBox>

            {/* Portfolio Segmentation */}
            <ChartBox title="Portfolio Segmentation — Projects by Portfolio">
              <BarChart data={segmentation} margin={{ top: 25, right: 15, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={10} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {segmentation.map((_, i) => <Cell key={i} fill={i === 0 ? "#1d4ed8" : "#60a5fa"} />)}
                  <LabelList dataKey="value" position="top" fontSize={11} />
                </Bar>
              </BarChart>
            </ChartBox>

            {/* Projects by Governance Channel */}
            <ChartBox title="Projects by Governance Channel">
              <BarChart data={governanceChannel} margin={{ top: 25, right: 15, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={10} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {governanceChannel.map((_, i) => <Cell key={i} fill={i === 0 ? "#1d4ed8" : "#93c5fd"} />)}
                  <LabelList dataKey="value" position="top" fontSize={11} />
                </Bar>
              </BarChart>
            </ChartBox>
          </div>
        )}
      </SectionFrame>

      {/* Portfolio Timelines — collapsible Gantt swim-lanes (expandable + scrollable) */}
      <SectionFrame>
        <ExpandablePanel
          title="Portfolio Timelines"
          compactMaxHeightClass="max-h-[min(68vh,760px)]"
          toolbar={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const allCollapsed = timelineGroups.every(([g]) => collapsed[g]);
                  const next: Record<string, boolean> = {};
                  timelineGroups.forEach(([g]) => {
                    next[g] = !allCollapsed;
                  });
                  setCollapsed(next);
                }}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs hover:bg-muted"
              >
                {timelineGroups.every(([g]) => collapsed[g]) ? "Expand all" : "Collapse all"}
              </button>
              <select
                value={timelineView}
                onChange={(e) => setTimelineView(e.target.value as TimelineView)}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              >
                <option value="Portfolio">View: Portfolio</option>
                <option value="Program">View: Program</option>
                <option value="Health">View: Health (RAG)</option>
                <option value="Priority">View: Priority</option>
                <option value="Theme">View: Theme</option>
                <option value="Sponsor">View: Sponsor</option>
                <option value="Status">View: Status</option>
              </select>
            </div>
          }
        >
          {timelineGroups.length === 0 ? (
            <Empty msg="No projects with start/end dates match filters" />
          ) : (
            <div className="space-y-3">
              {timelineGroups.map(([groupName, items]) => (
                <GanttGroup
                  key={groupName}
                  title={groupName}
                  items={items}
                  bounds={timelineBounds}
                  gatesByLane={gatesByLane}
                  orgPhases={orgPhases}
                  collapsed={!!collapsed[groupName]}
                  onToggle={() => toggleCollapse(groupName)}
                  showProjectTimeline={showProjectTimeline}
                  onShowProjectTimelineChange={setShowProjectTimeline}
                />
              ))}
            </div>
          )}
        </ExpandablePanel>
      </SectionFrame>

      {/* Governance Flow — stage columns with project links */}
      <SectionFrame>
        <ExpandablePanel
          title="Governance Flow — active projects by current stage"
          compactMaxHeightClass="max-h-[min(60vh,640px)]"
        >
          <div
            className="grid min-w-[720px] gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, kanban.length)}, minmax(140px, 1fr))` }}
          >
            {kanban.map((col) => (
              <div
                key={col.phase}
                className="flex max-h-[520px] flex-col border-r border-border last:border-r-0 pr-3 last:pr-0"
              >
                <div
                  className="mb-2 shrink-0 border-b border-border pb-2"
                  title={col.phase}
                >
                  <div className="truncate text-[11px] font-semibold text-foreground">{col.phase}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {col.items.length} project{col.items.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                  {col.items.length === 0 ? (
                    <div className="px-0.5 py-2 text-[10px] text-muted-foreground">No active projects</div>
                  ) : (
                    col.items.map((p: any) => {
                      const rag = (p.rag as string) || "";
                      const ragColor = RAG_COLORS[rag] || "var(--muted-foreground)";
                      return (
                        <Link
                          key={p.id}
                          to="/app/project-infographic"
                          search={{ pid: p.id }}
                          className="group flex items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60"
                          title={p.name}
                        >
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                            style={{ background: ragColor }}
                            aria-label={rag ? `RAG ${rag}` : "RAG unset"}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-medium text-primary group-hover:underline">
                              {p.project_code || p.name}
                            </span>
                            {p.project_code ? (
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {p.name}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </ExpandablePanel>
      </SectionFrame>

      {/* Portfolio Register */}
      <SectionFrame>
        <SectionTitle>Portfolio Register</SectionTitle>
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No projects match filters</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="st-table">
              <thead>
                <tr>
                  <th>Project</th><th>Program</th><th>Sponsor</th><th>Budget</th>
                  <th>Incurred</th><th>RAG</th><th>Phase</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 20).map((p: any) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td>{p.program ?? "—"}</td>
                    <td>{p.sponsor ?? "—"}</td>
                    <td>{money(projectApprovedFunding(p))}</td>
                    <td>{money(projectIncurred(p))}</td>
                    <td><RagChip rag={p.rag} /></td>
                    <td>{resolveCurrentStage(p) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>

      </div>
    </div>
  );
}

function ChartBox({
  title,
  children,
  legend,
}: {
  title: string;
  children: React.ReactElement;
  legend?: React.ReactNode;
}) {
  return <ExpandableChart title={title} legend={legend}>{children}</ExpandableChart>;
}

function Empty({ msg = "No data" }: { msg?: string }) {
  return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{msg}</div>;
}

type TimelineBounds = {
  start: Date; end: Date; totalMs: number;
  months: { key: string; label: string; year: number; monthIndex: number; fy: string }[];
  fyGroups: { fy: string; span: number }[];
};

function GanttGroup({
  title, items, bounds, gatesByLane, orgPhases = [], collapsed, onToggle,
  showProjectTimeline, onShowProjectTimelineChange,
}: {
  title: string; items: any[]; bounds: TimelineBounds;
  gatesByLane: Map<string, any[]>; orgPhases?: string[]; collapsed: boolean; onToggle: () => void;
  showProjectTimeline?: boolean;
  onShowProjectTimelineChange?: (v: boolean) => void;
}) {
  const laneKeyOf = (p: any) =>
    p.is_project_rollup ? (p.project_id || p.id) : (p.stream_id || p.project_id || p.id);
  const phaseOf = (p: any) =>
    p.is_project_rollup
      ? (p.current_phase || null)
      : resolveStageShared(p, gatesByLane.get(laneKeyOf(p)) || [], orgPhases);
  const { start: rangeStart, totalMs, months, fyGroups } = bounds;
  const monthShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  const monthCount = months.length || 1;
  // Align to the equal-width month grid used by the header. See portfolio-timeline.tsx.
  const dateToPct = (d: Date) => {
    const y = d.getFullYear();
    const m = d.getMonth();
    const idx = months.findIndex((mm) => mm.year === y && mm.monthIndex === m);
    if (idx === -1) {
      const first = months[0];
      const last = months[monthCount - 1];
      const firstMs = new Date(first.year, first.monthIndex, 1).getTime();
      const lastMs = new Date(last.year, last.monthIndex + 1, 0, 23, 59, 59).getTime();
      if (d.getTime() < firstMs) return -1;
      if (d.getTime() > lastMs) return 101;
      return 0;
    }
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const frac = (d.getDate() - 1 + d.getHours() / 24) / daysInMonth;
    return ((idx + frac) / monthCount) * 100;
  };
  const todayPct = dateToPct(now);
  const fmtShort = (d: Date) => `${d.getDate()} ${monthShort[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
  // Reference totalMs/rangeStart so TS doesn't flag them as unused after refactor.
  void totalMs; void rangeStart;


  const COL_PROJECT = 240;
  const COL_SPONSOR = 130;
  const COL_FIN = 200;
  const LEFT = COL_PROJECT + COL_SPONSOR + COL_FIN;

  // aggregate group financials without double-counting rollup + stream lanes
  const fin = summarizeTimelineLaneFinancials(items);
  const groupIncurred = fin.incurred;
  const groupApproved = fin.approved;
  const groupFAC = fin.fac;
  const groupBenefits = fin.benefits;
  const groupUtil = fin.utilPct;
  const rGreen = fin.green;
  const rAmber = fin.amber;
  const rRed = fin.red;

  const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex flex-col items-start leading-tight">
      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-[12px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );

  const rangeLabel = fyGroups.length === 1
    ? fyGroups[0].fy
    : `${fyGroups[0].fy} – ${fyGroups[fyGroups.length - 1].fy}`;

  const [showGates, setShowGates] = useState(true);
  const [showPvA, setShowPvA] = useState(false);

  return (
    <div className="relative rounded-md border border-border bg-surface shadow-sm">
      {/* Collapsible header with portfolio summary row */}
      <button
        onClick={onToggle}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-3 py-2 text-left hover:bg-muted/50"
        aria-expanded={!collapsed}
      >
        <div className="flex min-w-0 items-center gap-2">
          {collapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {rangeLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Stat label="Projects" value={fin.projectCount} />
          <Stat label="Approved" value={money(groupApproved)} />
          <Stat label="Actual" value={money(groupIncurred)} />
          <Stat label="FAC" value={money(groupFAC)} />
          <Stat label="Utilisation" value={`${groupUtil}%`} />
          <Stat label="Benefits" value={money(groupBenefits)} />
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">RAG</span>
            <span className="flex items-center gap-1.5 text-[12px] font-semibold tabular-nums text-foreground">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: RAG_COLORS.Green }} />{rGreen}
              <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: RAG_COLORS.Amber }} />{rAmber}
              <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: RAG_COLORS.Red }} />{rRed}
            </span>
          </div>
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-border p-3 overflow-x-auto">
          <div style={{ minWidth: LEFT + Math.max(560, monthCount * 34) }}>
          {/* Timeline controls — placed above the grid to avoid overlapping the RAG summary */}
          <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted">
              <input type="checkbox" checked={showPvA} onChange={(e) => setShowPvA(e.target.checked)} className="h-3 w-3" />
              Planned vs Actual
            </label>
            {onShowProjectTimelineChange && (
              <label
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted"
                title="Show project rollup lane (start→end + financials from streams)"
              >
                <input
                  type="checkbox"
                  checked={!!showProjectTimeline}
                  onChange={(e) => onShowProjectTimelineChange(e.target.checked)}
                  className="h-3 w-3"
                />
                Project timeline
              </label>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted">
              <input type="checkbox" checked={showGates} onChange={(e) => setShowGates(e.target.checked)} className="h-3 w-3" />
              Stage gates
            </label>
          </div>

          {/* FY header row */}
          <div className="flex items-stretch text-[10px] font-semibold uppercase tracking-wide">
            <div style={{ width: LEFT }} className="shrink-0" />
            <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${monthCount}, minmax(34px, 1fr))` }}>
              {fyGroups.map((g, i) => (
                <div key={`${g.fy}-${i}`}
                  className="border-l border-border/60 bg-muted/40 py-1 text-center text-primary"
                  style={{ gridColumn: `span ${g.span}` }}>
                  {g.fy}
                </div>
              ))}
            </div>
          </div>
          {/* Month header row */}
          <div className="flex items-center border-b border-border pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <div style={{ width: COL_PROJECT }} className="shrink-0 pl-1">Project / Stream</div>
            <div style={{ width: COL_SPONSOR }} className="shrink-0">Sponsor · Phase</div>
            <div style={{ width: COL_FIN }} className="shrink-0">Budget · Incurred · %</div>
            <div className="relative grid flex-1" style={{ gridTemplateColumns: `repeat(${monthCount}, minmax(34px, 1fr))` }}>
              {months.map((m) => (
                <div key={m.key} className="border-l border-border/60 pl-1 text-center">
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            {items.map((p: any) => {
              const projectId = p.project_id || p.id;
              const startIso = projectScheduleStart(p);
              const endIso = projectScheduleEnd(p);
              const s = startIso ? new Date(startIso).getTime() : NaN;
              const e = endIso ? new Date(endIso).getTime() : NaN;
              const rawStartPct = dateToPct(new Date(s));
              const rawEndPct = dateToPct(new Date(e));
              const startPct = Math.max(0, Math.min(100, rawStartPct));
              const endPct = Math.max(0, Math.min(100, rawEndPct));
              const widthPct = Math.max(0.6, endPct - startPct);
              const clippedLeft = rawStartPct < 0;
              const clippedRight = rawEndPct > 100;
              const color = RAG_COLORS[p.rag as string] || "#64748b";
              const budget = Number(p.budget || 0);
              const incurred = projectIncurred(p);
              const pct = budget > 0 ? Math.min(100, Math.round((incurred / budget) * 100)) : 0;
              const overBudget = incurred > budget && budget > 0;
              const laneKey = laneKeyOf(p);
              const projGates = p.is_project_rollup
                ? []
                : (gatesByLane.get(laneKey) || [])
                    .filter((g: any) => g.planned_date || g.actual_date)
                    .sort((a: any, b: any) =>
                      new Date(a.actual_date || a.planned_date).getTime() -
                      new Date(b.actual_date || b.planned_date).getTime()
                    );
              const rowKey = p.is_project_rollup ? `rollup:${projectId}` : p.id;

              return (
                <div
                  key={rowKey}
                  className={`flex items-center border-b border-border/40 py-2 hover:bg-muted/30 ${
                    p.is_project_rollup ? "bg-muted/20" : ""
                  }`}
                >
                  <div style={{ width: COL_PROJECT }} className="shrink-0 pl-1 pr-2">
                    <Link
                      to="/app/project-infographic"
                      search={{ pid: projectId }}
                      className="block truncate text-[12px] font-medium text-foreground hover:text-primary hover:underline"
                      title={p.name}
                    >
                      {p.is_project_rollup ? (
                        <>
                          <span>{p.name}</span>
                          <span className="ml-1.5 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                            Project
                          </span>
                        </>
                      ) : p.is_stream_lane && p.stream_name ? (
                        <>
                          <span className="text-muted-foreground">{p.project_name || "Project"}</span>
                          <span className="text-muted-foreground"> · </span>
                          <span>{p.stream_name}</span>
                        </>
                      ) : (
                        p.name
                      )}
                    </Link>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {p.project_code ? (
                        <Link to="/app/project-infographic" search={{ pid: projectId }} className="text-primary hover:underline">{p.project_code}</Link>
                      ) : "—"}{" "}
                      · {p.is_project_rollup ? "Rollup" : p.is_stream_lane ? "Stream" : p.program || "Unassigned"}
                      {(p.is_stream_lane || p.is_project_rollup) && p.program ? ` · ${p.program}` : ""}
                    </div>
                  </div>
                  <div style={{ width: COL_SPONSOR }} className="shrink-0 pr-2">
                    <div className="truncate text-[11px] text-foreground">{p.sponsor || "—"}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{phaseOf(p) || "—"}</div>
                  </div>
                  <div style={{ width: COL_FIN }} className="shrink-0 pr-2">
                    <div className="text-[11px] font-medium tabular-nums text-foreground">
                      {money(budget)} <span className="text-muted-foreground">·</span> {money(incurred)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: overBudget ? "#dc2626" : color }} />
                      </div>
                      <span className={`text-[10px] tabular-nums ${overBudget ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>{pct}%</span>
                    </div>
                  </div>
                  <div className="relative h-10 flex-1 rounded bg-muted/30">
                    {/* month gridlines with stronger FY dividers */}
                    <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${monthCount}, minmax(34px, 1fr))` }}>
                      {months.map((m, i) => {
                        const prev = months[i - 1];
                        const fyBreak = prev && prev.fy !== m.fy;
                        return <div key={m.key} className={fyBreak ? "border-l-2 border-primary/40" : "border-l border-border/40"} />;
                      })}
                    </div>
                    {/* schedule bar(s) */}
                    {(() => {
                      if (!showPvA) {
                        return (
                          <div
                            className="absolute top-2 h-6 shadow-sm"
                            style={{
                              left: `${startPct}%`, width: `${widthPct}%`, background: color, opacity: 0.9,
                              borderTopLeftRadius: clippedLeft ? 0 : 6,
                              borderBottomLeftRadius: clippedLeft ? 0 : 6,
                              borderTopRightRadius: clippedRight ? 0 : 6,
                              borderBottomRightRadius: clippedRight ? 0 : 6,
                            }}
                            title={`${startIso} → ${endIso} · ${money(budget)} budget · ${money(incurred)} incurred (${pct}%)`}
                          >
                            <div className="h-full" style={{ width: `${pct}%`, background: "rgba(255,255,255,0.28)", borderTopLeftRadius: clippedLeft ? 0 : 6, borderBottomLeftRadius: clippedLeft ? 0 : 6 }} />
                            {widthPct > 10 && (
                              <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-medium text-white">
                                <span className="truncate">{fmtShort(new Date(s))} → {fmtShort(new Date(e))}</span>
                                <span className="tabular-nums">{money(incurred)}/{money(budget)}</span>
                              </div>
                            )}
                          </div>
                        );
                      }
                      const pS = p.planned_start_date ? new Date(p.planned_start_date).getTime() : s;
                      const pE = p.planned_end_date ? new Date(p.planned_end_date).getTime() : e;
                      const aS = p.actual_start_date ? new Date(p.actual_start_date).getTime() : s;
                      const aE = p.actual_end_date ? new Date(p.actual_end_date).getTime() : e;
                      const seg = (start: number, end: number) => {
                        const rs = dateToPct(new Date(start));
                        const re = dateToPct(new Date(end));
                        const ls = Math.max(0, Math.min(100, rs));
                        const le = Math.max(0, Math.min(100, re));
                        return { left: ls, width: Math.max(0.6, le - ls) };
                      };
                      const plan = seg(pS, pE);
                      const act = seg(aS, aE);
                      const slipDays = Math.round((aE - pE) / 86400000);
                      return (
                        <>
                          <div
                            className="absolute top-0.5 h-4 rounded border-2 border-dashed"
                            style={{ left: `${plan.left}%`, width: `${plan.width}%`, borderColor: color, background: "transparent" }}
                            title={`Planned · ${p.planned_start_date || p.start_date} → ${p.planned_end_date || p.end_date}`}
                          >
                            {plan.width > 10 && (
                              <div className="absolute inset-0 flex items-center px-2 text-[9px] font-medium" style={{ color }}>
                                <span className="truncate">Plan: {fmtShort(new Date(pS))} → {fmtShort(new Date(pE))}</span>
                              </div>
                            )}
                          </div>
                          <div
                            className="absolute bottom-0.5 h-4 rounded shadow-sm"
                            style={{ left: `${act.left}%`, width: `${act.width}%`, background: color, opacity: 0.9 }}
                            title={`Actual · ${p.actual_start_date || p.start_date} → ${p.actual_end_date || p.end_date} · slip ${slipDays >= 0 ? "+" : ""}${slipDays}d`}
                          >
                            <div className="h-full rounded-l" style={{ width: `${pct}%`, background: "rgba(255,255,255,0.28)" }} />
                            {act.width > 10 && (
                              <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] font-medium text-white">
                                <span className="truncate">Actual: {fmtShort(new Date(aS))} → {fmtShort(new Date(aE))}</span>
                                <span className="tabular-nums">{slipDays >= 0 ? "+" : ""}{slipDays}d</span>
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                    {/* Stage gate markers */}
                    {showGates && projGates.map((g: any, idx: number) => {
                      const gd = new Date(g.actual_date || g.planned_date).getTime();
                      let pctX = dateToPct(new Date(gd));
                      const outside = pctX < 0 || pctX > 100;
                      pctX = Math.max(0.5, Math.min(99.5, pctX));
                      const st = String(g.status || "Pending").toLowerCase();
                      const isDone = st.includes("approv") || st.includes("complete") || st.includes("pass") || !!g.actual_date;
                      const gcolor = isDone ? "#15803d"
                        : st.includes("reject") || st.includes("fail") ? "#dc2626"
                        : st.includes("progress") || st.includes("review") ? "#f59e0b" : "#3b82f6";
                      const label = String(g.gate_name || "Gate");
                      const stagger = idx % 2 === 0 ? "top-0" : "bottom-0";
                      return (
                        <div key={g.id} className={`absolute z-20 -translate-x-1/2 ${stagger}`}
                          style={{ left: `${pctX}%`, opacity: outside ? 0.5 : 1 }}
                          title={`${label} · planned ${g.planned_date || "—"}${g.actual_date ? ` · actual ${g.actual_date}` : ""} · ${g.status || "Pending"}${outside ? " (outside visible range)" : ""}`}>
                          <div className="flex flex-col items-center">
                            <div className="relative h-3 w-3 rotate-45 border border-white shadow" style={{ background: gcolor }}>
                              {isDone && (
                                <span className="absolute inset-0 -rotate-45 flex items-center justify-center text-[8px] font-bold leading-none text-white">✓</span>
                              )}
                            </div>
                            <div className="mt-0.5 max-w-[80px] truncate rounded bg-white/95 px-1 text-[8px] font-medium text-foreground shadow-sm">
                              {label.slice(0, 14)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {todayPct >= 0 && todayPct <= 100 && (
              <div className="pointer-events-none absolute inset-0 z-10 flex">
                <div style={{ width: LEFT }} className="shrink-0" />
                <div className="relative flex-1">
                  <div className="absolute top-0 bottom-0" style={{ left: `${todayPct}%`, borderLeft: "2px dashed #dc2626" }}>
                    <div className="-ml-6 mt-1 whitespace-nowrap rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      {now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
