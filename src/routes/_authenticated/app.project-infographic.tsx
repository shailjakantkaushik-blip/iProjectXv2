import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle, PageHeading, RagChip, KpiCard } from "@/components/streamlit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FileText, Link as LinkIcon, Save, Plus, Trash2, Presentation, LayoutTemplate, ImageIcon } from "lucide-react";
import { ProjectSummary } from "@/components/project-summary";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  LabelList,
  Legend,
  Cell,
} from "recharts";
import { PortfolioTimeline } from "@/components/portfolio-timeline";
import { Button } from "@/components/ui/button";
import { downloadProjectBriefPPT } from "@/lib/project-brief-ppt";
import { ExpandableChart } from "@/components/expandable-chart";
import { isDoneGateStatus, resolveCurrentStage } from "@/lib/project-phase";
import { expandProjectsToTimelineLanes, fetchProjectStreams } from "@/lib/project-streams";

export const Route = createFileRoute("/_authenticated/app/project-infographic")({
  validateSearch: (s: Record<string, unknown>) => ({ pid: (s.pid as string) || "" }),
  component: InfographicPage,
});

const PHASES = [
  "Discovery",
  "Business Case / Seed Funding",
  "Design",
  "Business Case / Full Funding",
  "Build",
  "Testing",
  "Deployment",
  "Handover",
];

const STATUS_STYLE: Record<string, { dot: string; text: string; ring: string }> = {
  Approved: { dot: "bg-emerald-500", text: "text-emerald-700", ring: "ring-emerald-200" },
  Complete: { dot: "bg-emerald-500", text: "text-emerald-700", ring: "ring-emerald-200" },
  Completed: { dot: "bg-emerald-500", text: "text-emerald-700", ring: "ring-emerald-200" },
  Passed: { dot: "bg-emerald-500", text: "text-emerald-700", ring: "ring-emerald-200" },
  "In Review": { dot: "bg-sky-500", text: "text-sky-700", ring: "ring-sky-200" },
  "In Progress": { dot: "bg-blue-500", text: "text-blue-700", ring: "ring-blue-200" },
  "Not Started": { dot: "bg-slate-300", text: "text-slate-600", ring: "ring-slate-200" },
  Pending: { dot: "bg-slate-300", text: "text-slate-600", ring: "ring-slate-200" },
  "On Hold": { dot: "bg-amber-500", text: "text-amber-700", ring: "ring-amber-200" },
  Delayed: { dot: "bg-amber-500", text: "text-amber-700", ring: "ring-amber-200" },
  Blocked: { dot: "bg-red-500", text: "text-red-700", ring: "ring-red-200" },
  Rejected: { dot: "bg-red-500", text: "text-red-700", ring: "ring-red-200" },
};

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n || 0)
  );
}
function moneyM(n: number) {
  return "$" + ((n || 0) / 1_000_000).toFixed(2) + "M";
}
function fmtDate(d?: string | null) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

/* Sports-car tachometer style semicircle gauge */
function Gauge({
  value,
  max,
  label,
  color = "#3b82f6",
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const rawPct = value / safeMax;
  const pct = Math.min(1, Math.max(0, rawPct));
  const CX = 130,
    CY = 132;
  const R = 104; // arc radius
  const RT = R + 8; // tick outer
  const RTL = R + 22; // tick label
  const polar = (frac: number, r: number) => {
    const a = Math.PI * (1 - frac);
    return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
  };
  // colored zone arcs (0-60 green, 60-90 amber, 90-100 red)
  const zoneArc = (a: number, b: number) => {
    const p1 = polar(a, R),
      p2 = polar(b, R);
    const large = 0; // semicircle sweep is always < 180°
    return `M ${p1.x} ${p1.y} A ${R} ${R} 0 ${large} 1 ${p2.x} ${p2.y}`;
  };
  const majorTicks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const minorTicks = Array.from({ length: 51 }, (_, i) => i / 50);
  const needleTip = polar(pct, R - 14);
  const needleTailL = polar(pct + 0.5, 10);
  const needleTailR = polar(pct - 0.5, 10);
  const uid = useId();
  const pctText = (pct * 100).toFixed(1) + "%";
  return (
    <div className="flex flex-col items-center w-full">
      <div className="text-xs font-semibold text-slate-700 mb-1 tracking-wide uppercase">
        {label}
      </div>
      <svg viewBox="0 0 260 170" className="w-full max-w-[300px]">
        <defs>
          <radialGradient id={`face-${uid}`} cx="50%" cy="85%" r="85%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="60%" stopColor="#0b1220" />
            <stop offset="100%" stopColor="#020617" />
          </radialGradient>
          <linearGradient id={`bezel-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id={`needle-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="60%" stopColor={color} />
            <stop offset="100%" stopColor="#7f1d1d" />
          </linearGradient>
          <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer bezel */}
        <path
          d={`M ${CX - R - 14} ${CY} A ${R + 14} ${R + 14} 0 1 1 ${CX + R + 14} ${CY} L ${CX + R + 14} ${CY + 6} L ${CX - R - 14} ${CY + 6} Z`}
          fill={`url(#bezel-${uid})`}
        />
        {/* Dial face */}
        <path
          d={`M ${CX - R - 4} ${CY} A ${R + 4} ${R + 4} 0 1 1 ${CX + R + 4} ${CY} Z`}
          fill={`url(#face-${uid})`}
        />

        {/* Colored zones */}
        <path d={zoneArc(0, 0.6)} stroke="#22c55e" strokeWidth={7} fill="none" opacity="0.85" />
        <path d={zoneArc(0.6, 0.9)} stroke="#f59e0b" strokeWidth={7} fill="none" opacity="0.9" />
        <path d={zoneArc(0.9, 1)} stroke="#ef4444" strokeWidth={7} fill="none" opacity="0.95" />

        {/* Minor ticks */}
        {minorTicks.map((t, i) => {
          const a = polar(t, R - 6),
            b = polar(t, R - 12);
          return (
            <line
              key={`mn-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#334155"
              strokeWidth={1}
            />
          );
        })}
        {/* Major ticks + labels */}
        {majorTicks.map((t, i) => {
          const a = polar(t, R - 6),
            b = polar(t, R - 18);
          const lbl = polar(t, R - 30);
          return (
            <g key={`mj-${i}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#e2e8f0" strokeWidth={2} />
              <text
                x={lbl.x}
                y={lbl.y + 3}
                fontSize="8"
                fill="#cbd5e1"
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
              >
                {Math.round(t * 100)}
              </text>
            </g>
          );
        })}
        {/* Outer scale labels ($) */}
        {[0, 0.5, 1].map((t, i) => {
          const p = polar(t, RTL);
          return (
            <text
              key={`sc-${i}`}
              x={p.x}
              y={p.y}
              fontSize="9"
              fill="#94a3b8"
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
            >
              {money(t * safeMax)}
            </text>
          );
        })}

        {/* Needle */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleTailL.x},${needleTailL.y} ${needleTailR.x},${needleTailR.y}`}
          fill={`url(#needle-${uid})`}
          filter={`url(#glow-${uid})`}
        />
        {/* Hub */}
        <circle cx={CX} cy={CY} r={10} fill="#0f172a" stroke="#64748b" strokeWidth={1.5} />
        <circle cx={CX} cy={CY} r={4} fill={color} />

        {/* Digital readout */}
        <rect
          x={CX - 46}
          y={CY + 16}
          width={92}
          height={30}
          rx={5}
          fill="#020617"
          stroke="#1e293b"
        />
        <text
          x={CX}
          y={CY + 32}
          fontSize="14"
          fontWeight="700"
          fill={color}
          textAnchor="middle"
          fontFamily="ui-monospace, monospace"
          letterSpacing="1"
        >
          {pctText}
        </text>
        <text
          x={CX}
          y={CY + 42}
          fontSize="7.5"
          fill="#64748b"
          textAnchor="middle"
          fontFamily="ui-monospace, monospace"
          letterSpacing="0.5"
        >
          {money(value)} / {money(safeMax)}
        </text>
      </svg>
    </div>
  );
}

function InfographicPage() {
  const { organization } = useAuth();
  const search = Route.useSearch();
  const [pid, setPid] = useState<string>(search.pid || "");
  const [showPvA, setShowPvA] = useState<boolean>(false);
  const [showProjectTimeline, setShowProjectTimeline] = useState<boolean>(false);
  const [pageView, setPageView] = useState<"infographic" | "summary">("infographic");
  useEffect(() => {
    if (search.pid) setPid(search.pid);
  }, [search.pid]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => (await supabase.from("projects").select("*")).data ?? [],
    enabled: !!organization,
  });

  const project: any = useMemo(
    () => projects.find((p: any) => p.id === pid) || projects[0],
    [projects, pid],
  );

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", project?.id],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gates")
          .select("*")
          .eq("project_id", project.id)
          .order("planned_date")
      ).data ?? [],
    enabled: !!project,
  });

  const { data: projectStreams = [] } = useQuery({
    queryKey: ["project_streams", project?.id],
    queryFn: () => fetchProjectStreams(project.id),
    enabled: !!project?.id,
  });
  const hasStreams = (projectStreams as any[]).length > 0;

  const { data: projectAllocations = [] } = useQuery({
    queryKey: ["resource_allocations", project?.id],
    queryFn: async () =>
      (
        await supabase
          .from("resource_allocations")
          .select("*")
          .eq("project_id", project.id)
          .order("period_month")
      ).data ?? [],
    enabled: !!project?.id,
  });

  const { data: allResources = [] } = useQuery({
    queryKey: ["resources", organization?.id],
    queryFn: async () => (await supabase.from("resources").select("*")).data ?? [],
    enabled: !!organization?.id,
  });

  const timelineLanes = useMemo(() => {
    if (!project) return [];
    return expandProjectsToTimelineLanes([project], projectStreams as any[], {
      gates: gates as any[],
      resolvePhase: (p, streamGates) => resolveCurrentStage(p, streamGates, []),
      includeProjectRollup: showProjectTimeline,
    })
      .map((lane: any) => ({
        ...lane,
        start_date: lane.planned_start_date || lane.actual_start_date || lane.start_date,
        end_date: lane.actual_end_date || lane.planned_end_date || lane.end_date,
      }))
      .filter((p: any) => p.start_date && p.end_date);
  }, [project, projectStreams, gates, showProjectTimeline]);
  const { data: monthly = [] } = useQuery({
    queryKey: ["financials_monthly", project?.id],
    queryFn: async () =>
      (
        await supabase
          .from("financials_monthly")
          .select("*")
          .eq("project_id", project.id)
          .order("period_month")
      ).data ?? [],
    enabled: !!project,
  });
  const { data: benefits = [] } = useQuery({
    queryKey: ["benefits", project?.id],
    queryFn: async () =>
      (await supabase.from("benefits").select("*").eq("project_id", project.id)).data ?? [],
    enabled: !!project,
  });
  const { data: risks = [] } = useQuery({
    queryKey: ["risks", project?.id],
    queryFn: async () =>
      (
        await supabase
          .from("risks")
          .select("*")
          .eq("project_id", project.id)
          .order("severity", { ascending: false })
      ).data ?? [],
    enabled: !!project,
  });
  const { data: issues = [] } = useQuery({
    queryKey: ["issues", project?.id],
    queryFn: async () =>
      (await supabase.from("issues").select("*").eq("project_id", project.id)).data ?? [],
    enabled: !!project,
  });
  const { data: milestones = [] } = useQuery({
    queryKey: ["milestones", project?.id],
    queryFn: async () =>
      (
        await supabase
          .from("milestones")
          .select("*")
          .eq("project_id", project.id)
          .order("planned_date")
      ).data ?? [],
    enabled: !!project,
  });
  const { data: documents = [] } = useQuery({
    queryKey: ["documents", project?.id],
    queryFn: async () =>
      (
        await supabase
          .from("documents")
          .select("*")
          .eq("project_id", project.id)
          .order("uploaded_date", { ascending: false })
      ).data ?? [],
    enabled: !!project,
  });
  const { data: deps = [] } = useQuery({
    queryKey: ["dependencies-brief", project?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("dependencies")
        .select("*")
        .or(`from_project_id.eq.${project.id},to_project_id.eq.${project.id}`);
      return data ?? [];
    },
    enabled: !!project,
  });
  const { data: stakeholders = [] } = useQuery({
    queryKey: ["stakeholders", project?.id],
    queryFn: async () =>
      (await supabase.from("stakeholders").select("*").eq("project_id", project.id)).data ?? [],
    enabled: !!project,
  });

  if (!projects.length) {
    return (
      <div>
        <PageHeading icon="🖼️" title="Project Infographic" />
        <SectionFrame>
          <div className="p-12 text-center text-sm text-muted-foreground">
            No projects available.
          </div>
        </SectionFrame>
      </div>
    );
  }
  if (!project) return null;

  const budget = Number(project.budget || 0);
  const approved = Number(
    project.approved_funding ||
      budget ||
      Number(project.capex_approved || 0) + Number(project.opex_approved || 0) ||
      0,
  );
  const incurred =
    Number(project.capex_incurred || 0) + Number(project.opex_incurred || 0);
  const forecast = Number(
    project.forecast ||
      project.forecast_at_completion ||
      Number(project.capex_approved || 0) + Number(project.opex_approved || 0) ||
      budget ||
      0,
  );
  const remaining = Math.max(0, budget - incurred);
  const utilPct = budget ? (incurred / budget) * 100 : 0;

  // Build phase list — merge PHASES with any gates in DB, prefer DB row when present
  const gateByName = new Map<string, any>();
  gates.forEach((g: any) => gateByName.set((g.gate_name || "").trim(), g));
  const phaseCards = PHASES.map((name) => {
    const g = gateByName.get(name);
    return {
      name,
      status: g?.status || "Not Started",
      planned: g?.planned_date,
      actual: g?.actual_date,
      approver: g?.approver,
      budget: Number(g?.phase_budget ?? 0),
      forecast: Number(g?.phase_forecast ?? 0),
      actualSpend: Number(g?.phase_actual ?? 0),
    };
  });

  // Health chips (simple heuristics)
  const scheduleHealth = phaseCards.some((p) => p.status === "Delayed" || p.status === "Blocked")
    ? "Amber"
    : "Green";
  const finHealthPct = budget ? incurred / budget : 0;
  const financialHealth = finHealthPct > 1 ? "Red" : finHealthPct > 0.9 ? "Amber" : "Green";
  const overallHealth =
    (project.rag as string) ||
    (scheduleHealth === "Green" && financialHealth === "Green" ? "Green" : "Amber");

  // Phase financials chart
  const phaseChart = phaseCards.map((p) => ({
    name: p.name,
    "Phase Budget": p.budget,
    "Phase Forecast": p.forecast,
    "Phase Actual Spend": p.actualSpend,
  }));
  const hasPhaseFinancials = phaseChart.some(
    (r) => r["Phase Budget"] || r["Phase Forecast"] || r["Phase Actual Spend"],
  );

  // Timeline
  const startDate = project.start_date ? new Date(project.start_date) : null;
  const endDate = project.end_date ? new Date(project.end_date) : null;
  const today = new Date();
  const timelineMs =
    startDate && endDate ? Math.max(1, endDate.getTime() - startDate.getTime()) : 1;
  const progressPct =
    startDate && endDate
      ? Math.min(100, Math.max(0, ((today.getTime() - startDate.getTime()) / timelineMs) * 100))
      : 0;
  const gateMarkers = phaseCards
    .map((p) => {
      const d = p.planned ? new Date(p.planned) : null;
      if (!d || !startDate || !endDate) return null;
      const left = Math.min(
        100,
        Math.max(0, ((d.getTime() - startDate.getTime()) / timelineMs) * 100),
      );
      const done = isDoneGateStatus(p.status);
      return { name: p.name, left, done, status: p.status };
    })
    .filter(Boolean) as { name: string; left: number; done: boolean; status: string }[];

  const monthlyChart = monthly.map((m: any) => ({
    month: new Date(m.period_month).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    }),
    Planned: Number(m.capex_planned || 0),
    Actual: Number(m.capex_actual || 0),
    Forecast: Number(m.capex_forecast || 0),
  }));

  const benefitsChart = benefits.map((b: any) => ({
    name: b.title,
    Target: Number(b.target_value || 0),
    Realised: Number(b.realised_value || 0),
  }));

  const streamById = useMemo(() => {
    const m = new Map<string, any>();
    (projectStreams as any[]).forEach((s) => m.set(s.id, s));
    return m;
  }, [projectStreams]);

  const resourceById = useMemo(() => {
    const m = new Map<string, any>();
    (allResources as any[]).forEach((r) => m.set(r.id, r));
    return m;
  }, [allResources]);

  const allocationMonths = useMemo(() => {
    const keys = Array.from(
      new Set((projectAllocations as any[]).map((a) => String(a.period_month || "").slice(0, 7)).filter(Boolean)),
    ).sort();
    return keys.map((k) => {
      const [y, mo] = k.split("-");
      const d = new Date(Number(y), Number(mo) - 1, 1);
      return {
        key: k,
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      };
    });
  }, [projectAllocations]);

  /** One row per resource (+ stream when present) with monthly % */
  const resourcePlanRows = useMemo(() => {
    type Row = {
      key: string;
      resourceId: string;
      name: string;
      role: string | null;
      streamId: string | null;
      streamName: string | null;
      months: Record<string, number>;
      total: number;
    };
    const map = new Map<string, Row>();
    for (const a of projectAllocations as any[]) {
      const streamId = a.stream_id || null;
      const key = `${a.resource_id}::${streamId || "_"}`;
      const res = resourceById.get(a.resource_id);
      if (!map.has(key)) {
        map.set(key, {
          key,
          resourceId: a.resource_id,
          name: res?.name || "Unknown",
          role: res?.role || a.role_on_project || null,
          streamId,
          streamName: streamId ? streamById.get(streamId)?.name || streamById.get(streamId)?.code || "Stream" : null,
          months: {},
          total: 0,
        });
      }
      const row = map.get(key)!;
      const mk = String(a.period_month || "").slice(0, 7);
      const pct = Number(a.allocation_percent || 0);
      row.months[mk] = (row.months[mk] || 0) + pct;
      row.total += pct;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name) || String(a.streamName).localeCompare(String(b.streamName)));
  }, [projectAllocations, resourceById, streamById]);

  const allocHeat = (pct: number) => {
    if (pct <= 0) return "bg-transparent text-muted-foreground";
    if (pct < 30) return "bg-amber-100 text-amber-900";
    if (pct < 70) return "bg-sky-100 text-sky-900";
    return "bg-emerald-100 text-emerald-900 font-semibold";
  };

  return (
    <div>
      <PageHeading
        icon="🖼️"
        title={pageView === "summary" ? "Project Summary" : "Project Infographic"}
        subtitle={
          pageView === "summary"
            ? "Delivery-plan style overview — streams, capacity, cost and brief."
            : "One-page visual summary for any project."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-border bg-surface p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPageView("infographic")}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 font-medium ${
                  pageView === "infographic"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Infographic
              </button>
              <button
                type="button"
                onClick={() => setPageView("summary")}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 font-medium ${
                  pageView === "summary"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <LayoutTemplate className="h-3.5 w-3.5" />
                Project Summary
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={async () => {
                const b: any = project.brief || {};
                const s1: any = b.section1 || {};
                const s2: any = b.section2 || {};
                const incurredSpend =
                  Number(project.capex_incurred || 0) + Number(project.opex_incurred || 0);
                await downloadProjectBriefPPT({
                  project: {
                    project_code: project.project_code,
                    name: project.name,
                    portfolio: s1.portfolio_workstream ?? null,
                    workstream: null,
                    sponsor_name: s1.sponsor ?? project.sponsor ?? null,
                    business_owner: s1.business_owner ?? null,
                    business_solution_manager: s1.business_solution_manager ?? null,
                    strategic_alignment: s1.strategic_alignment ?? null,
                    approved_budget: project.budget ?? project.approved_budget,
                    actual_spend: incurredSpend || project.actual_spend,
                    forecast_at_completion: project.forecast_at_completion,
                    expected_benefit: project.benefits_target ?? project.expected_benefit,
                    planned_start_date: project.planned_start_date ?? project.start_date,
                    planned_end_date: project.planned_end_date ?? project.end_date,
                    actual_start_date: project.actual_start_date,
                    actual_end_date: project.actual_end_date,
                    target_go_live: project.target_go_live,
                    priority: project.priority,
                    rag_overall: project.rag,
                    program: project.program,
                    status: project.status,
                    brief: {
                      section1: {
                        background_context: s1.background_context,
                        opportunity_problem: s1.opportunity_problem,
                        objective: s1.objective_smart,
                        assumptions_constraints: s1.assumptions_constraints,
                        scope_in: s1.scope_in,
                        scope_out: s1.scope_out,
                        success_measures: s1.key_metrics_success,
                      },
                      section2: s2,
                    },
                  },
                  milestones: (milestones as any[]).map((m) => ({
                    name: m.name,
                    planned_date: m.planned_date,
                    status: m.status,
                    owner: m.owner,
                  })),
                  risks: (risks as any[]).map((r) => ({
                    description: r.description,
                    category: r.category,
                    residual_rating: r.residual_rating ?? r.severity,
                    mitigation_plan: r.mitigation_plan,
                    owner: r.owner,
                  })),
                  dependencies: (deps as any[]).map((d) => ({
                    from_project: d.from_project_name,
                    to_project: d.to_project_name,
                    dependency_type: d.dependency_type,
                    status: d.status,
                    description: d.description,
                  })),
                });
              }}
            >
              <Presentation className="h-3.5 w-3.5" /> Download Project Brief (PPT)
            </Button>
            <Select value={project.id} onValueChange={setPid}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.project_code ? `${p.project_code} · ` : ""}
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {pageView === "summary" ? (
        <>
          <ProjectSummary
            project={project}
            streams={projectStreams as any[]}
            gates={gates as any[]}
            resourceRows={resourcePlanRows}
            allocationMonths={allocationMonths}
            monthly={monthly as any[]}
            benefits={benefits as any[]}
            phaseCards={phaseCards}
          />
          <ProjectBrief project={project} />
        </>
      ) : null}

      {pageView === "infographic" ? (
      <>
      {/* Project header */}
      <SectionFrame>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground">
              {project.project_code} · {project.program || "—"}
            </div>
            <div className="text-2xl font-bold">{project.name}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {project.description || "No description."}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <RagChip rag={project.rag} />
            <div className="text-xs text-muted-foreground">
              Sponsor: <span className="font-medium text-foreground">{project.sponsor || "—"}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Priority:{" "}
              <span className="font-medium text-foreground">{project.priority || "—"}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Method:{" "}
              <span className="font-medium text-foreground">{project.delivery_method || "—"}</span>
            </div>
          </div>
        </div>
      </SectionFrame>

      {/* Stage Gates & Phase $ header */}
      <SectionFrame>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            🔷 Stage Gates &amp; Phase $
          </div>
          <span className="text-xs text-slate-600 ml-2">Health:</span>
          <HealthChip label={`Schedule · ${scheduleHealth}`} rag={scheduleHealth} />
          <HealthChip label={`Financial · ${financialHealth}`} rag={financialHealth} />
          <HealthChip label={`Overall · ${overallHealth}`} rag={overallHealth} />
          <span className="text-xs text-slate-600 ml-2">
            <span className="font-semibold">Budget</span>{" "}
            <code className="bg-slate-100 px-1 rounded">{moneyM(budget)}</code> ·{" "}
            <span className="font-semibold">**Actual**</span> {moneyM(incurred)} (
            {utilPct.toFixed(1)}%) · <span className="font-semibold">Remaining</span>{" "}
            {moneyM(remaining)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ExpandableChart
            title="Phase Budget / Forecast / Actual"
            heightClass="h-72"
            legend={
              hasPhaseFinancials ? undefined : (
                <div className="text-[11px] text-slate-500 text-center">
                  No phase-level financials captured on stage gates yet.
                </div>
              )
            }
          >
            <BarChart data={phaseChart} margin={{ top: 10, right: 15, left: 0, bottom: 70 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9 }}
                angle={-25}
                textAnchor="end"
                interval={0}
                height={70}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={money} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Phase Budget" fill="#3b82f6" />
              <Bar dataKey="Phase Forecast" fill="#8b5cf6" />
              <Bar dataKey="Phase Actual Spend" fill="#f59e0b" />
            </BarChart>
          </ExpandableChart>

          <div className="bg-white rounded border border-slate-200 p-2">
            <Gauge
              value={incurred}
              max={Math.max(approved, budget, 1)}
              label="Spend vs Approved Budget"
              color={finHealthPct > 1 ? "#ef4444" : finHealthPct > 0.9 ? "#f59e0b" : "#22c55e"}
            />
          </div>
        </div>
      </SectionFrame>

      {/* Stage Gate cards */}
      <SectionFrame>
        <SectionTitle>Stage Gates</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8">
          {phaseCards.map((p) => {
            const s = STATUS_STYLE[p.status] || STATUS_STYLE["Not Started"];
            const done = isDoneGateStatus(p.status);
            return (
              <div
                key={p.name}
                className={`bg-white rounded-lg border border-slate-200 p-3 ring-1 ${s.ring} min-h-[110px]`}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={`w-5 h-5 rounded-full ${s.dot} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}
                    title={done ? "Approved / completed" : p.status}
                  >
                    {done ? "✓" : "○"}
                  </div>
                  <div className="text-xs font-semibold text-slate-800 leading-tight">{p.name}</div>
                </div>
                <div className={`text-xs mt-2 font-medium ${s.text}`}>{p.status}</div>
                {p.planned && (
                  <div className="text-[10px] text-slate-500 mt-1">Plan: {fmtDate(p.planned)}</div>
                )}
                {p.actual && (
                  <div className="text-[10px] text-slate-500">Actual: {fmtDate(p.actual)}</div>
                )}
                {(p.budget > 0 || p.actualSpend > 0) && (
                  <div className="text-[10px] text-slate-600 mt-1 border-t pt-1">
                    <div>Bud: {money(p.budget)}</div>
                    <div>Act: {money(p.actualSpend)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionFrame>

      {/* Project Timeline — matches Executive Dashboard timeline */}
      <SectionFrame>
        <SectionTitle>📅 Project Timeline</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mb-4">
          <div>
            <div className="text-xs text-muted-foreground">Start</div>
            <div className="font-medium">{fmtDate(project.start_date)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Target Go-Live</div>
            <div className="font-medium">{fmtDate(project.target_go_live)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">End</div>
            <div className="font-medium">{fmtDate(project.end_date)}</div>
          </div>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background/95 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-muted"
            title="Show planned vs actual timelines"
          >
            <input
              type="checkbox"
              checked={showPvA}
              onChange={(e) => setShowPvA(e.target.checked)}
              className="h-3 w-3"
            />
            Show Planned vs Actual
          </label>
          {hasStreams ? (
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background/95 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-muted"
              title="Show project rollup lane (start→end + financials from streams)"
            >
              <input
                type="checkbox"
                checked={showProjectTimeline}
                onChange={(e) => setShowProjectTimeline(e.target.checked)}
                className="h-3 w-3"
              />
              Project timeline
            </label>
          ) : null}
        </div>
        <PortfolioTimeline
          projects={timelineLanes}
          gates={gates}
          title={
            hasStreams
              ? `${project.name || "Project"} · Streams`
              : project.name || "Project Timeline"
          }
          showPlannedVsActual={showPvA}
          showProjectTimeline={showProjectTimeline}
          onShowProjectTimelineChange={hasStreams ? setShowProjectTimeline : undefined}
          captureId="project-timeline-capture"
        />
      </SectionFrame>

      {/* Financials & Benefits */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionFrame>
          <ExpandableChart
            title="Monthly Financials — Planned vs Actual vs Forecast"
            heightClass="h-56"
            legend={
              <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                <MiniKpi label="Budget" value={moneyM(budget)} color="#3b82f6" />
                <MiniKpi label="Forecast" value={moneyM(forecast)} color="#8b5cf6" />
                <MiniKpi label="Actual" value={moneyM(incurred)} color="#f59e0b" />
                <MiniKpi label="Remaining" value={moneyM(remaining)} color="#22c55e" />
              </div>
            }
          >
            <LineChart data={monthlyChart} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={money} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="Planned" stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="Actual" stroke="#22c55e" strokeWidth={2} />
              <Line
                type="monotone"
                dataKey="Forecast"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
            </LineChart>
          </ExpandableChart>
        </SectionFrame>

        <SectionFrame>
          <SectionTitle>Benefits</SectionTitle>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <KpiCard
              label="Expected"
              value={moneyM(
                benefits.reduce((s: number, b: any) => s + Number(b.target_value || 0), 0),
              )}
              accent="#3b82f6"
            />
            <KpiCard
              label="Realised"
              value={moneyM(
                benefits.reduce((s: number, b: any) => s + Number(b.realised_value || 0), 0),
              )}
              accent="#22c55e"
            />
            <KpiCard
              label="Realisation %"
              value={(() => {
                const t = benefits.reduce(
                  (s: number, b: any) => s + Number(b.target_value || 0),
                  0,
                );
                const r = benefits.reduce(
                  (s: number, b: any) => s + Number(b.realised_value || 0),
                  0,
                );
                return (t ? (r / t) * 100 : 0).toFixed(1) + "%";
              })()}
              accent="#8b5cf6"
            />
          </div>
          <ExpandableChart title="Benefits — Target vs Realised" heightClass="h-48">
            <BarChart data={benefitsChart} margin={{ top: 15, right: 10, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9 }}
                angle={-15}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={money} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Target" name="Target Value" fill="#1d4ed8" />
              <Bar dataKey="Realised" name="Realised Value" fill="#93c5fd">
                <LabelList
                  dataKey="Realised"
                  position="top"
                  formatter={(v: number) => money(v)}
                  style={{ fontSize: 9, fill: "#334155" }}
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
        </SectionFrame>
      </div>

      {/* Top Risks & Issues */}
      <SectionFrame>
        <SectionTitle>⚠️ Top Risks &amp; Issues</SectionTitle>
        <div className="overflow-x-auto">
          <table className="st-table text-xs">
            <thead>
              <tr>
                <th>RAID ID</th>
                <th>Project ID</th>
                <th>Type</th>
                <th>Description</th>
                <th>Probability</th>
                <th>Impact</th>
                <th>RAG</th>
                <th>Owner</th>
                <th>Target Resolution Date</th>
                <th>Mitigation</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...risks.map((r: any, i: number) => ({
                  raid: "R" + String(i + 1).padStart(3, "0"),
                  type: "Risk",
                  desc: r.title,
                  probability: r.probability >= 4 ? "High" : r.probability >= 2 ? "Medium" : "Low",
                  impact:
                    r.impact >= 4
                      ? "Critical"
                      : r.impact >= 3
                        ? "High"
                        : r.impact >= 2
                          ? "Medium"
                          : "Low",
                  rag: (r.severity || 0) >= 12 ? "Red" : (r.severity || 0) >= 6 ? "Amber" : "Green",
                  owner: r.owner,
                  due: r.due_date,
                  mitigation: r.mitigation,
                  status: r.status,
                })),
                ...issues.map((r: any, i: number) => ({
                  raid: "I" + String(i + 1).padStart(3, "0"),
                  type: "Issue",
                  desc: r.title,
                  probability: "—",
                  impact: r.priority || "—",
                  rag:
                    r.priority === "Critical" ? "Red" : r.priority === "High" ? "Amber" : "Green",
                  owner: r.owner,
                  due: r.target_date,
                  mitigation: r.resolution,
                  status: r.status,
                })),
              ]
                .slice(0, 10)
                .map((r) => (
                  <tr key={r.raid}>
                    <td className="font-mono">{r.raid}</td>
                    <td className="font-mono text-blue-600">{project.project_code || "—"}</td>
                    <td>{r.type}</td>
                    <td>{r.desc}</td>
                    <td>{r.probability}</td>
                    <td>{r.impact}</td>
                    <td>
                      <RagChip rag={r.rag} />
                    </td>
                    <td>{r.owner || "NA"}</td>
                    <td>{fmtDate(r.due)}</td>
                    <td>{r.mitigation || "—"}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              {risks.length === 0 && issues.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center text-slate-500 py-4">
                    No open risks or issues.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      {/* Upcoming Milestones — sourced from Stage Gate register */}
      <SectionFrame>
        <SectionTitle>📌 Upcoming Milestones (Stage Gates)</SectionTitle>
        <div className="overflow-x-auto">
          <table className="st-table text-xs">
            <thead>
              <tr>
                <th>Gate ID</th>
                <th>Project ID</th>
                <th>Project Name</th>
                {hasStreams ? <th>Stream</th> : null}
                <th>Stage Gate</th>
                <th>Planned Date</th>
                <th>Actual Date</th>
                <th>Status</th>
                <th>Approver</th>
                <th>Notes</th>
                <th>Sponsor</th>
                <th>Program</th>
              </tr>
            </thead>
            <tbody>
              {gates.length === 0 ? (
                <tr>
                  <td colSpan={hasStreams ? 12 : 11} className="text-center text-slate-500 py-4">
                    No stage gates captured.
                  </td>
                </tr>
              ) : (
                (gates as any[]).map((g: any, i: number) => (
                  <tr key={g.id}>
                    <td className="font-mono">SG{String(i + 1).padStart(4, "0")}</td>
                    <td className="font-mono text-blue-600">{project.project_code || "—"}</td>
                    <td>{project.name}</td>
                    {hasStreams ? (
                      <td>
                        {g.stream_id
                          ? streamById.get(g.stream_id)?.name || streamById.get(g.stream_id)?.code || "Stream"
                          : "—"}
                      </td>
                    ) : null}
                    <td>{g.gate_name}</td>
                    <td>{fmtDate(g.planned_date)}</td>
                    <td>{g.actual_date ? fmtDate(g.actual_date) : "NA"}</td>
                    <td>{g.status || "Planned"}</td>
                    <td>{g.approver || "NA"}</td>
                    <td>{g.notes || "NA"}</td>
                    <td>{project.sponsor || "NA"}</td>
                    <td>{project.program || "NA"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      {/* Project Brief — tabbed form */}
      <ProjectBrief project={project} />

      {/* Stage Gates table */}
      <SectionFrame>
        <SectionTitle>Stage Gate Detail</SectionTitle>
        <div className="overflow-x-auto">
          <table className="st-table text-xs">
            <thead>
              <tr>
                <th>Gate</th>
                <th>Status</th>
                <th>Planned</th>
                <th>Actual</th>
                <th>Approver</th>
                <th className="text-right">Phase Budget</th>
                <th className="text-right">Phase Forecast</th>
                <th className="text-right">Phase Actual</th>
              </tr>
            </thead>
            <tbody>
              {phaseCards.map((p) => (
                <tr key={p.name}>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.status}</td>
                  <td>{fmtDate(p.planned)}</td>
                  <td>{fmtDate(p.actual)}</td>
                  <td>{p.approver || "—"}</td>
                  <td className="text-right tabular-nums">{money(p.budget)}</td>
                  <td className="text-right tabular-nums">{money(p.forecast)}</td>
                  <td className="text-right tabular-nums">{money(p.actualSpend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      {/* Resources & allocations — always last */}
      <SectionFrame>
        <SectionTitle>
          Resources & allocations
          {hasStreams ? " (by stream)" : ""}
        </SectionTitle>
        <p className="mb-3 text-xs text-muted-foreground">
          People allocated to this project
          {hasStreams
            ? ", broken out by stream when allocations are stream-scoped."
            : "."}
        </p>
        {resourcePlanRows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No resource allocations for this project yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="st-table text-xs">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Role</th>
                  {hasStreams ? <th>Stream</th> : null}
                  {allocationMonths.map((m) => (
                    <th key={m.key} className="text-center">
                      {m.label}
                    </th>
                  ))}
                  <th className="text-right">Σ %</th>
                </tr>
              </thead>
              <tbody>
                {resourcePlanRows.map((r) => (
                  <tr key={r.key}>
                    <td className="font-medium">{r.name}</td>
                    <td>{r.role || "—"}</td>
                    {hasStreams ? (
                      <td>
                        {r.streamName ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{r.streamName}</span>
                        ) : (
                          <span className="text-muted-foreground">Project</span>
                        )}
                      </td>
                    ) : null}
                    {allocationMonths.map((m) => {
                      const pct = r.months[m.key] || 0;
                      return (
                        <td key={m.key} className="text-center">
                          <span
                            className={`inline-flex min-w-[2.25rem] justify-center rounded px-1.5 py-0.5 tabular-nums ${allocHeat(pct)}`}
                          >
                            {pct > 0 ? `${Math.round(pct)}%` : "·"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="text-right tabular-nums font-semibold">{Math.round(r.total)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-amber-100 ring-1 ring-amber-200" /> Low (&lt;30%)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-sky-100 ring-1 ring-sky-200" /> Medium
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-emerald-100 ring-1 ring-emerald-200" /> High (≥70%)
              </span>
            </div>
          </div>
        )}
      </SectionFrame>
      </>
      ) : null}
    </div>
  );
}

function HealthChip({ label, rag }: { label: string; rag: string }) {
  const bg =
    rag === "Green"
      ? "bg-emerald-500"
      : rag === "Amber"
        ? "bg-amber-500"
        : rag === "Red"
          ? "bg-red-500"
          : "bg-slate-400";
  return <span className={`text-xs text-white px-2 py-0.5 rounded-full ${bg}`}>{label}</span>;
}

function BriefCard({ title, icon, person }: { title: string; icon: string; person: any }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        {icon} {title}
      </div>
      <div className="text-lg font-semibold text-slate-800">{person?.name || "—"}</div>
      <div className="text-xs text-slate-600 mt-1">{person?.role || "—"}</div>
      {person?.email && person.email !== "—" && (
        <a
          href={`mailto:${person.email}`}
          className="text-xs text-blue-600 hover:underline block mt-1"
        >
          {person.email}
        </a>
      )}
    </div>
  );
}

function BriefField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-3 py-2">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

function MiniKpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded border border-slate-200 bg-white px-2 py-1.5"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-800 tabular-nums">{value}</div>
    </div>
  );
}

/* ============================================================
   Project Brief — tabbed editor (Business Owner / Solution Manager / Document Links)
   Persists to projects.brief (JSONB) and public.documents.
============================================================ */

type BriefSection1 = {
  portfolio_workstream?: string;
  sponsor?: string;
  business_owner?: string;
  business_solution_manager?: string;
  strategic_alignment?: string;
  background_context?: string;
  opportunity_problem?: string;
  objective_smart?: string;
  scope_in?: string;
  scope_out?: string;
  assumptions_constraints?: string;
  key_metrics_success?: string;
};
type BriefSection2 = {
  approval_type?: string;
  funding_ask?: string;
  funding_source?: string;
  resource_ask?: string;
  estimate_commentary?: string;
  pl_benefits_commentary?: string;
  delivery_milestones_variance?: string;
  project_risks?: string;
  dependencies?: string;
};

const STRATEGIC_ALIGNMENT_OPTIONS = [
  "Growth",
  "Efficiency",
  "Compliance",
  "Customer Experience",
  "Digital Transformation",
  "Risk Reduction",
  "Innovation",
  "Cost Optimisation",
];

function ProjectBrief({ project }: { project: any }) {
  const qc = useQueryClient();
  const brief = (project.brief || {}) as { section1?: BriefSection1; section2?: BriefSection2 };
  const [s1, setS1] = useState<BriefSection1>(brief.section1 || { sponsor: project.sponsor || "" });
  const [s2, setS2] = useState<BriefSection2>(brief.section2 || {});
  const [saving, setSaving] = useState<null | 1 | 2>(null);

  // Reload state when active project changes
  useEffect(() => {
    const b = (project.brief || {}) as any;
    setS1(b.section1 || { sponsor: project.sponsor || "" });
    setS2(b.section2 || {});
  }, [project.id]);

  const { data: links = [] } = useQuery({
    queryKey: ["documents", project.id],
    queryFn: async () =>
      (
        await supabase
          .from("documents")
          .select("*")
          .eq("project_id", project.id)
          .order("uploaded_date", { ascending: false })
      ).data ?? [],
    enabled: !!project.id,
  });

  const saveSection = async (section: 1 | 2) => {
    setSaving(section);
    try {
      const next = { ...(project.brief || {}), section1: s1, section2: s2 };
      const { error } = await supabase
        .from("projects")
        .update({ brief: next })
        .eq("id", project.id);
      if (error) throw error;
      toast.success(`Section ${section} saved`);
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const onS1KeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      saveSection(1);
    }
  };

  return (
    <SectionFrame>
      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-5 w-5 text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-800">Project Brief — {project.name}</h2>
      </div>

      <Tabs defaultValue="s1" className="w-full">
        <TabsList className="w-full justify-start bg-transparent border-b border-slate-200 rounded-none p-0 h-auto">
          <TabsTrigger
            value="s1"
            className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 rounded-none bg-transparent px-4 py-2 text-sm"
          >
            Section 1 · Business Owner
          </TabsTrigger>
          <TabsTrigger
            value="s2"
            className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 rounded-none bg-transparent px-4 py-2 text-sm"
          >
            Section 2 · Solution Manager
          </TabsTrigger>
          <TabsTrigger
            value="docs"
            className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 rounded-none bg-transparent px-4 py-2 text-sm"
          >
            <LinkIcon className="h-3.5 w-3.5 mr-1" /> Document Links
          </TabsTrigger>
        </TabsList>

        {/* ── Section 1 ─────────────────────────────────────── */}
        <TabsContent value="s1" className="mt-4">
          <div
            className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4"
            onKeyDown={onS1KeyDown}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <BriefInput
                label="Portfolio / Workstream"
                value={s1.portfolio_workstream}
                onChange={(v) => setS1({ ...s1, portfolio_workstream: v })}
              />
              <BriefInput
                label="Sponsor"
                value={s1.sponsor}
                onChange={(v) => setS1({ ...s1, sponsor: v })}
              />
              <BriefInput
                label="Business Owner"
                value={s1.business_owner}
                onChange={(v) => setS1({ ...s1, business_owner: v })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <BriefInput
                label="Business Solution Manager"
                value={s1.business_solution_manager}
                onChange={(v) => setS1({ ...s1, business_solution_manager: v })}
              />
              <BriefSelect
                label="Strategic Alignment"
                value={s1.strategic_alignment}
                options={STRATEGIC_ALIGNMENT_OPTIONS}
                onChange={(v) => setS1({ ...s1, strategic_alignment: v })}
              />
            </div>
            <BriefTextarea
              label="Background and Context"
              rows={3}
              value={s1.background_context}
              onChange={(v) => setS1({ ...s1, background_context: v })}
            />
            <BriefTextarea
              label="Opportunity / Problem Statement"
              rows={3}
              value={s1.opportunity_problem}
              onChange={(v) => setS1({ ...s1, opportunity_problem: v })}
              hint="Press Ctrl+Enter to submit form"
              highlight
            />
            <BriefTextarea
              label="Objective (SMART)"
              rows={3}
              value={s1.objective_smart}
              onChange={(v) => setS1({ ...s1, objective_smart: v })}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <BriefTextarea
                label="What is in Scope?"
                rows={3}
                value={s1.scope_in}
                onChange={(v) => setS1({ ...s1, scope_in: v })}
              />
              <BriefTextarea
                label="What is out of Scope?"
                rows={3}
                value={s1.scope_out}
                onChange={(v) => setS1({ ...s1, scope_out: v })}
              />
            </div>
            <BriefTextarea
              label="Assumptions & Constraints"
              rows={3}
              help
              value={s1.assumptions_constraints}
              onChange={(v) => setS1({ ...s1, assumptions_constraints: v })}
            />
            <BriefTextarea
              label="Key Metrics / Success Measures"
              rows={3}
              help
              value={s1.key_metrics_success}
              onChange={(v) => setS1({ ...s1, key_metrics_success: v })}
            />
            <div>
              <button
                onClick={() => saveSection(1)}
                disabled={saving === 1}
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5 text-purple-600" />
                {saving === 1 ? "Saving…" : "Save Section 1"}
              </button>
            </div>
          </div>
        </TabsContent>

        {/* ── Section 2 ─────────────────────────────────────── */}
        <TabsContent value="s2" className="mt-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <BriefInput
                label="Approval Type"
                value={s2.approval_type}
                onChange={(v) => setS2({ ...s2, approval_type: v })}
              />
              <BriefInput
                label="Funding Ask"
                value={s2.funding_ask}
                onChange={(v) => setS2({ ...s2, funding_ask: v })}
              />
              <BriefInput
                label="Funding Source"
                value={s2.funding_source}
                onChange={(v) => setS2({ ...s2, funding_source: v })}
              />
              <BriefInput
                label="Resource Ask"
                value={s2.resource_ask}
                onChange={(v) => setS2({ ...s2, resource_ask: v })}
              />
            </div>
            <BriefTextarea
              label="Estimate Commentary"
              rows={3}
              value={s2.estimate_commentary}
              onChange={(v) => setS2({ ...s2, estimate_commentary: v })}
            />
            <BriefTextarea
              label="P&L Benefits Commentary"
              rows={3}
              value={s2.pl_benefits_commentary}
              onChange={(v) => setS2({ ...s2, pl_benefits_commentary: v })}
            />
            <BriefTextarea
              label="Summary of Delivery Milestones & Variance"
              rows={3}
              help
              value={s2.delivery_milestones_variance}
              onChange={(v) => setS2({ ...s2, delivery_milestones_variance: v })}
            />
            <BriefTextarea
              label="Project Risks"
              rows={3}
              help
              value={s2.project_risks}
              onChange={(v) => setS2({ ...s2, project_risks: v })}
            />
            <BriefTextarea
              label="Dependencies"
              rows={3}
              help
              value={s2.dependencies}
              onChange={(v) => setS2({ ...s2, dependencies: v })}
            />
            <div>
              <button
                onClick={() => saveSection(2)}
                disabled={saving === 2}
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5 text-purple-600" />
                {saving === 2 ? "Saving…" : "Save Section 2"}
              </button>
            </div>
          </div>
        </TabsContent>

        {/* ── Document Links ────────────────────────────────── */}
        <TabsContent value="docs" className="mt-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="text-xs text-slate-500">
              Attach reference documents (SharePoint, Confluence, OneDrive, etc.)
            </div>
            {links.length === 0 ? (
              <div className="rounded bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-slate-700">
                No links yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                <table className="st-table text-xs">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>URL</th>
                      <th>Category</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((d: any) => (
                      <tr key={d.id}>
                        <td className="font-medium">{d.name || "—"}</td>
                        <td>
                          {d.url ? (
                            <a
                              href={d.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline break-all"
                            >
                              {d.url}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{d.doc_type || "—"}</td>
                        <td>
                          <button
                            onClick={async () => {
                              await supabase.from("documents").delete().eq("id", d.id);
                              qc.invalidateQueries({ queryKey: ["documents", project.id] });
                            }}
                            className="text-slate-400 hover:text-red-600"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <AddLinkRow projectId={project.id} orgId={project.org_id} />
          </div>
        </TabsContent>
      </Tabs>
    </SectionFrame>
  );
}

function AddLinkRow({ projectId, orgId }: { projectId: string; orgId?: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!title.trim() || !url.trim()) {
      toast.error("Title and URL required");
      return;
    }
    try {
      new URL(url);
    } catch {
      toast.error("Invalid URL");
      return;
    }
    setBusy(true);
    try {
      const payload: any = {
        project_id: projectId,
        name: title.trim().slice(0, 200),
        url: url.trim().slice(0, 1000),
        doc_type: category.trim().slice(0, 100) || null,
        uploaded_date: new Date().toISOString().slice(0, 10),
      };
      if (orgId) payload.org_id = orgId;
      const { error } = await supabase.from("documents").insert(payload);
      if (error) throw error;
      setTitle("");
      setUrl("");
      setCategory("");
      qc.invalidateQueries({ queryKey: ["documents", projectId] });
      toast.success("Link added");
    } catch (e: any) {
      toast.error(e.message || "Failed to add link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.5fr_1fr]">
        <BriefInput label="Title" value={title} onChange={setTitle} />
        <BriefInput label="URL" value={url} onChange={setUrl} placeholder="https://…" />
        <BriefInput
          label="Category"
          value={category}
          onChange={setCategory}
          placeholder="e.g. Business Case"
        />
      </div>
      <div className="mt-3">
        <button
          onClick={add}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5 text-purple-600" />
          {busy ? "Adding…" : "Add link"}
        </button>
      </div>
    </div>
  );
}

function BriefInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-600 mb-1">{label}</div>
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={500}
        className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function BriefSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-600 mb-1">{label}</div>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value=""></option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function BriefTextarea({
  label,
  value,
  onChange,
  rows = 3,
  hint,
  help,
  highlight,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  rows?: number;
  hint?: string;
  help?: boolean;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-medium text-slate-600">{label}</div>
        {help && (
          <span className="text-slate-400 text-xs" title="Help">
            ⓘ
          </span>
        )}
      </div>
      <div className="relative">
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          maxLength={5000}
          className={`w-full rounded border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
            highlight
              ? "border-blue-500 focus:ring-blue-500"
              : "border-slate-300 focus:ring-blue-500"
          }`}
        />
        {hint && (
          <div className="absolute bottom-1 right-2 text-[10px] text-slate-400 pointer-events-none">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}
