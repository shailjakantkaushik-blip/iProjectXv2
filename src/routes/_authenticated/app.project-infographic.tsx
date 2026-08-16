import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  PROJECT_DETAIL_SELECT,
  RESOURCE_ALLOCATIONS_SELECT,
  RESOURCES_SELECT,
  FINANCIALS_MONTHLY_SELECT,
  BENEFITS_SELECT,
  RISKS_SELECT,
  ISSUES_SELECT,
  MILESTONES_SELECT,
  STAGE_GATE_DEFINITIONS_SELECT,
  selectWithRaidCodeFallback,
} from "@/lib/query-selects";
import { fetchStageGates } from "@/lib/stage-gates";
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
import {
  FileText,
  Link as LinkIcon,
  Save,
  Plus,
  Trash2,
  Presentation,
  FileDown,
} from "lucide-react";
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
} from "recharts";
import { PortfolioTimeline } from "@/components/portfolio-timeline";
import { Button } from "@/components/ui/button";
import { downloadProjectBriefPPT } from "@/lib/project-brief-ppt";
import { plannedCostByPhase } from "@/lib/apply-forecast-planned";
import {
  forecastPhaseKey,
  groupForecastRowsByStream,
  loadForecastPhases,
  parseForecastPhaseNotes,
  phasesForDeliveryMethod,
  withResolvedForecastStreamNames,
  type ForecastPhaseRow,
} from "@/lib/project-forecast";
import {
  briefForecastTotals,
  buildBriefForecastRows,
  formatForecastTotalsLine,
  mergeEstimateCommentary,
  moneyBrief,
} from "@/lib/project-brief-forecast";
import { exportElementPDF } from "@/components/page-export";
import { ExpandableChart } from "@/components/expandable-chart";
import { isDoneGateStatus, resolveCurrentStage, sortGatesByOrgOrder } from "@/lib/project-phase";
import {
  isGateScheduleDelayed,
  livePhaseForecast,
  phaseSpendByStage,
  type MonthlyFinanceRow,
} from "@/lib/finance-lifecycle";
import {
  expandProjectsToTimelineLanes,
  fetchProjectStreams,
  formatProjectStreamRef,
  formatStreamCode,
  formatStreamLabel,
  gatesForTimelineLane,
} from "@/lib/project-streams";
import {
  deliveryMethodsQueryKey,
  fetchDeliveryMethods,
  findDeliveryMethod,
  methodUsesStageGates,
} from "@/lib/delivery-methods";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";
import { entryHours } from "@/lib/resource-allocation-analytics";
import { ProjectInfographicWorkItems } from "@/components/project-infographic-work-items";
import { ProjectHealthEnginePanel } from "@/components/project-health-engine-panel";
import { ExplainThis } from "@/components/explain-this";
import {
  explainActualSpend,
  explainBudget,
  explainForecast,
  explainRemaining,
  explainRag,
  type MetricExplanation,
} from "@/lib/explain-metric";
import { evaluateProjectHealth } from "@/lib/project-health-engine";
import { displayRag, effectiveRag, isRagOverridden } from "@/lib/ops-enhancements";

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

function uniqueGateNames(gates: { gate_name?: string | null }[]) {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const g of gates) {
    const n = String(g.gate_name || "").trim();
    const key = n.toLowerCase();
    if (!n || seen.has(key)) continue;
    seen.add(key);
    names.push(n);
  }
  return names;
}

/** Method template first, then any extra live gate names the timeline would still show. */
function mergePhaseNames(template: string[], actual: { gate_name?: string | null }[]) {
  const names = [...template];
  const seen = new Set(template.map((n) => n.trim().toLowerCase()).filter(Boolean));
  for (const n of uniqueGateNames(actual)) {
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(n);
  }
  return names.length ? names : [...PHASES];
}

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
function formatDuration(start?: string | null, end?: string | null) {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const days = Math.round(ms / 86400000);
  const months = Math.round(days / 30.44);
  if (months >= 2) return `${months} months`;
  const weeks = Math.max(1, Math.round(days / 7));
  return weeks === 1 ? "1 week" : `${weeks} weeks`;
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
  const [showProjectTimeline, setShowProjectTimeline] = useState<boolean>(true);
  const [showGates, setShowGates] = useState<boolean>(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (search.pid) setPid(search.pid);
  }, [search.pid]);

  const { data: projects = [] } = useQuery({
    // Dedicated key — wider detail select must not overwrite portfolio cache rows.
    queryKey: ["projects", organization?.id, "detail"],
    queryFn: async () =>
      (await supabase.from("projects").select(PROJECT_DETAIL_SELECT as "*")).data ?? [],
    enabled: !!organization,
  });

  const project: any = useMemo(
    () => projects.find((p: any) => p.id === pid) || projects[0],
    [projects, pid],
  );

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", project?.id],
    queryFn: async () => {
      const all = await fetchStageGates();
      return all.filter((g) => g.project_id === project.id);
    },
    enabled: !!project,
  });

  const { data: projectStreams = [] } = useQuery({
    queryKey: ["project_streams", project?.id],
    queryFn: () => fetchProjectStreams(project.id),
    enabled: !!project?.id,
  });
  const hasStreams = (projectStreams as any[]).length > 0;

  const orgId = organization?.id;
  const { data: deliveryMethods = [] } = useQuery({
    queryKey: deliveryMethodsQueryKey(orgId),
    queryFn: () => fetchDeliveryMethods(orgId!, { activeOnly: true }),
    enabled: !!orgId,
  });
  const { data: gateDefs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gate_definitions")
          .select(STAGE_GATE_DEFINITIONS_SELECT as "*")
          .eq("org_id", orgId!)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
      ).data ?? [],
    enabled: !!orgId,
  });
  const deliveryMethod = useMemo(
    () =>
      project
        ? (project.delivery_method_id &&
            deliveryMethods.find((m) => m.id === project.delivery_method_id)) ||
          findDeliveryMethod(deliveryMethods, project.delivery_method)
        : undefined,
    [project, deliveryMethods],
  );
  const orgPhases = useMemo(() => {
    if (!project) return [...PHASES];
    const template = methodUsesStageGates(deliveryMethod, project.delivery_method)
      ? phasesForDeliveryMethod(deliveryMethods, gateDefs as any[], project)
      : [];
    if (template.length) return template;
    const live = uniqueGateNames(gates as any[]);
    return live.length ? live : [...PHASES];
  }, [project, deliveryMethod, deliveryMethods, gateDefs, gates]);

  const { data: projectAllocations = [] } = useQuery({
    queryKey: ["resource_allocations", project?.id],
    queryFn: async () =>
      (
        await supabase
          .from("resource_allocations")
          .select(RESOURCE_ALLOCATIONS_SELECT as "*")
          .eq("project_id", project.id)
          .order("period_month")
      ).data ?? [],
    enabled: !!project?.id,
  });

  const { data: allResources = [] } = useQuery({
    queryKey: ["resources", organization?.id],
    queryFn: async () =>
      (await supabase.from("resources").select(RESOURCES_SELECT as "*")).data ?? [],
    enabled: !!organization?.id,
  });

  /** Approved timesheet actuals for this project (resource × month hours). */
  const { data: projectTimesheetActuals = [] } = useQuery({
    queryKey: ["timesheet_effort", organization?.id, "infographic", project?.id],
    queryFn: async () => {
      const { data: sheets, error } = await (supabase as any)
        .from("timesheets")
        .select("id,resource_id,week_start,status")
        .eq("status", "approved");
      if (error) throw error;
      const ids = ((sheets ?? []) as any[]).map((s) => s.id);
      if (!ids.length) return [] as Array<{ resource_id: string; month: string; hours: number }>;
      const sheetById = new Map<string, any>(((sheets ?? []) as any[]).map((s) => [s.id, s]));
      const { data: entries, error: e2 } = await (supabase as any)
        .from("timesheet_entries")
        .select(
          "timesheet_id,project_id,billable,hours_mon,hours_tue,hours_wed,hours_thu,hours_fri,hours_sat,hours_sun",
        )
        .eq("project_id", project.id)
        .in("timesheet_id", ids);
      if (e2) throw e2;
      const byKey = new Map<string, { resource_id: string; month: string; hours: number }>();
      for (const e of (entries ?? []) as any[]) {
        const ts = sheetById.get(e.timesheet_id);
        const rid = ts?.resource_id;
        if (!rid) continue;
        const week = ts?.week_start ? String(ts.week_start).slice(0, 10) : "";
        const month = week ? week.slice(0, 7) : "";
        if (!month) continue;
        const key = `${rid}::${month}`;
        const cur = byKey.get(key) || { resource_id: rid, month, hours: 0 };
        cur.hours += entryHours(e);
        byKey.set(key, cur);
      }
      return Array.from(byKey.values());
    },
    enabled: !!organization?.id && !!project?.id,
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
  const { data: planForecast } = useQuery({
    queryKey: ["project_forecasts", project?.id, "infographic-plan"],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_forecasts" as any)
        .select("id,notes")
        .eq("project_id", project.id)
        .maybeSingle();
      return data as { id: string; notes?: unknown } | null;
    },
    enabled: !!project?.id,
  });
  const { data: planPhases = [] } = useQuery({
    queryKey: ["project_forecast_phases", planForecast?.id, "infographic-plan"],
    queryFn: () => loadForecastPhases(planForecast!.id),
    enabled: !!planForecast?.id,
  });
  const { data: planPhaseRes = [] } = useQuery({
    queryKey: ["project_forecast_phase_resources", planForecast?.id, "infographic-plan"],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_forecast_phase_resources" as any)
        .select("*")
        .eq("forecast_id", planForecast!.id);
      return (data ?? []) as any[];
    },
    enabled: !!planForecast?.id,
  });
  const { data: planOtherCosts = [] } = useQuery({
    queryKey: ["project_forecast_other_costs", planForecast?.id, "infographic-plan"],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_forecast_other_costs" as any)
        .select("*")
        .eq("forecast_id", planForecast!.id);
      return (data ?? []) as any[];
    },
    enabled: !!planForecast?.id,
  });
  const forecastPlannedByPhase = useMemo(() => {
    const stored =
      planPhases.length > 0 ? planPhases : parseForecastPhaseNotes(planForecast?.notes);
    return plannedCostByPhase(stored, planPhaseRes as any[], planOtherCosts as any[]);
  }, [planPhases, planForecast?.notes, planPhaseRes, planOtherCosts]);

  const { data: monthly = [] } = useQuery({
    queryKey: ["financials_monthly", project?.id],
    queryFn: async () =>
      (
        await supabase
          .from("financials_monthly")
          .select(FINANCIALS_MONTHLY_SELECT as "*")
          .eq("project_id", project.id)
          .order("period_month")
      ).data ?? [],
    enabled: !!project,
  });
  const { data: benefits = [] } = useQuery({
    queryKey: ["benefits", project?.id],
    queryFn: async () =>
      (
        await supabase
          .from("benefits")
          .select(BENEFITS_SELECT as "*")
          .eq("project_id", project.id)
      ).data ?? [],
    enabled: !!project,
  });
  const { data: risks = [] } = useQuery({
    queryKey: ["risks", project?.id],
    queryFn: async () =>
      selectWithRaidCodeFallback(
        (sel) =>
          supabase
            .from("risks")
            .select(sel as "*")
            .eq("project_id", project.id)
            .order("severity", { ascending: false }),
        RISKS_SELECT,
      ),
    enabled: !!project,
  });
  const { data: issues = [] } = useQuery({
    queryKey: ["issues", project?.id],
    queryFn: async () =>
      selectWithRaidCodeFallback(
        (sel) =>
          supabase
            .from("issues")
            .select(sel as "*")
            .eq("project_id", project.id),
        ISSUES_SELECT,
      ),
    enabled: !!project,
  });
  const { data: milestones = [] } = useQuery({
    queryKey: ["milestones", project?.id],
    queryFn: async () =>
      (
        await supabase
          .from("milestones")
          .select(MILESTONES_SELECT as "*")
          .eq("project_id", project.id)
          .order("planned_date")
      ).data ?? [],
    enabled: !!project,
  });
  const { data: otherCosts = [] } = useQuery({
    queryKey: ["opex_other_costs", project?.id, "explain"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opex_other_costs" as any)
        .select("id,project_id,amount,category,vendor,description,period_month,cost_date")
        .eq("project_id", project.id);
      if (error) throw error;
      return (data ?? []) as any[];
    },
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

  // ── Hooks that must run every render (React #310) — before any early return ──
  const resourceById = useMemo(() => {
    const m = new Map<string, any>();
    (allResources as any[]).forEach((r) => m.set(r.id, r));
    return m;
  }, [allResources]);

  /** Normalize period_month → YYYY-MM (no TZ shift). */
  const normAllocMonth = (v: string | null | undefined) => {
    if (!v) return "";
    const m = /^(\d{4})-(\d{2})/.exec(String(v).slice(0, 10));
    return m ? `${m[1]}-${m[2]}` : String(v).slice(0, 7);
  };

  const hoursToMonthPct = (hours: number, capacityHoursWeek = 40) => {
    const monthCap = (Number(capacityHoursWeek) || 40) * 4.33;
    if (monthCap <= 0 || !Number.isFinite(hours)) return 0;
    return Math.round((hours / monthCap) * 100);
  };

  const pctStatus = (pct: number): "Over" | "Optimal" | "Under" => {
    if (pct > 100) return "Over";
    if (pct >= 60) return "Optimal";
    return "Under";
  };

  const pvaStatus = (
    planPct: number,
    actualPct: number,
  ): "Over" | "Optimal" | "Under" | "Unplanned" => {
    if (planPct <= 0 && actualPct > 0) return "Unplanned";
    if (planPct <= 0) return "Under";
    const ratio = (actualPct / planPct) * 100;
    if (ratio > 110) return "Over";
    if (ratio >= 60) return "Optimal";
    return "Under";
  };

  const allocationMonths = useMemo(() => {
    const keys = Array.from(
      new Set([
        ...(projectAllocations as any[]).map((a) => normAllocMonth(a.period_month)).filter(Boolean),
        ...projectTimesheetActuals.map((a) => a.month).filter(Boolean),
      ]),
    ).sort();
    // Fill contiguous months between first and last so columns never “shift”.
    if (keys.length >= 2) {
      const [y0, m0] = keys[0].split("-").map(Number);
      const [y1, m1] = keys[keys.length - 1].split("-").map(Number);
      const filled: string[] = [];
      let y = y0;
      let mo = m0;
      while (y < y1 || (y === y1 && mo <= m1)) {
        filled.push(`${y}-${String(mo).padStart(2, "0")}`);
        mo += 1;
        if (mo > 12) {
          mo = 1;
          y += 1;
        }
      }
      keys.splice(0, keys.length, ...filled);
    }
    return keys.map((k) => {
      const [y, mo] = k.split("-").map(Number);
      const d = new Date(y, mo - 1, 1);
      return {
        key: k,
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      };
    });
  }, [projectAllocations, projectTimesheetActuals]);

  /**
   * One row per resource on this project (streams rolled up) with monthly
   * plan % and actual % (timesheet hours → % of FTE month).
   */
  const resourcePlanRows = useMemo(() => {
    type Row = {
      key: string;
      resourceId: string;
      name: string;
      role: string | null;
      capacity: number;
      planMonths: Record<string, number>;
      actualMonths: Record<string, number>;
      planTotal: number;
      actualTotal: number;
    };
    if (!project) return [] as Row[];
    const map = new Map<string, Row>();
    const ensure = (resourceId: string, roleHint?: string | null) => {
      if (!map.has(resourceId)) {
        const res = resourceById.get(resourceId);
        map.set(resourceId, {
          key: resourceId,
          resourceId,
          name: res?.name || "Unknown",
          role: res?.role || roleHint || null,
          capacity: Number(res?.capacity_hours_week) || 40,
          planMonths: {},
          actualMonths: {},
          planTotal: 0,
          actualTotal: 0,
        });
      }
      return map.get(resourceId)!;
    };
    for (const a of projectAllocations as any[]) {
      const row = ensure(a.resource_id, a.role_on_project);
      const mk = normAllocMonth(a.period_month);
      if (!mk) continue;
      const pct = Number(a.allocation_percent || 0);
      row.planMonths[mk] = (row.planMonths[mk] || 0) + pct;
      row.planTotal += pct;
    }
    for (const a of projectTimesheetActuals) {
      const row = ensure(a.resource_id);
      const pct = hoursToMonthPct(a.hours, row.capacity);
      row.actualMonths[a.month] = (row.actualMonths[a.month] || 0) + pct;
      row.actualTotal += pct;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projectAllocations, projectTimesheetActuals, resourceById, project]);

  /** Avg monthly plan % vs actual % per resource + three status lenses. */
  const resourceUtilChart = useMemo(() => {
    const monthCount = Math.max(1, allocationMonths.length);
    return resourcePlanRows
      .map((r) => {
        const planPct = Math.round(r.planTotal / monthCount);
        const actualPct = Math.round(r.actualTotal / monthCount);
        return {
          resource: r.name,
          resourceId: r.resourceId,
          planPct,
          actualPct,
          planStatus: pctStatus(planPct),
          actualStatus: pctStatus(actualPct),
          pvaStatus: pvaStatus(planPct, actualPct),
        };
      })
      .sort((a, b) => Math.max(b.planPct, b.actualPct) - Math.max(a.planPct, a.actualPct));
  }, [resourcePlanRows, allocationMonths]);

  const raidRows = useMemo(() => {
    if (!project) return [] as any[];
    return [
      ...risks.map((r: any) => ({
        raid: r.raid_code || "RSK",
        project_code: project.project_code || "",
        type: "Risk",
        desc: r.title,
        probability: r.probability >= 4 ? "High" : r.probability >= 2 ? "Medium" : "Low",
        impact:
          r.impact >= 4 ? "Critical" : r.impact >= 3 ? "High" : r.impact >= 2 ? "Medium" : "Low",
        rag: (r.severity || 0) >= 12 ? "Red" : (r.severity || 0) >= 6 ? "Amber" : "Green",
        owner: r.owner,
        due: r.due_date,
        mitigation: r.mitigation,
        status: r.status,
      })),
      ...issues.map((r: any) => ({
        raid: r.raid_code || "ISS",
        project_code: project.project_code || "",
        type: "Issue",
        desc: r.title,
        probability: "—",
        impact: r.priority || "—",
        rag: r.priority === "Critical" ? "Red" : r.priority === "High" ? "Amber" : "Green",
        owner: r.owner,
        due: r.target_date,
        mitigation: r.resolution,
        status: r.status,
      })),
    ].slice(0, 10);
  }, [project, risks, issues]);

  const raidColumns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "raid", label: "RAID ID" },
      { key: "project_code", label: "Project ID" },
      { key: "type", label: "Type" },
      { key: "desc", label: "Description" },
      { key: "probability", label: "Probability" },
      { key: "impact", label: "Impact" },
      { key: "rag", label: "RAG" },
      { key: "owner", label: "Owner" },
      { key: "due", label: "Target Resolution Date" },
      { key: "mitigation", label: "Mitigation" },
      { key: "status", label: "Status" },
    ],
    [],
  );
  const raidTable = useColumnarTable(raidRows, raidColumns);

  /** Upcoming milestones grouped by stream (or project when no streams). */
  const milestoneSections = useMemo(() => {
    if (!project)
      return [] as {
        key: string;
        streamLabel: string;
        streamRef: string;
        project_code: string;
        project_name: string;
        program: string;
        sponsor: string;
        rows: {
          id: string;
          gate_id: string;
          gate_name: string;
          planned_date: string | null;
          actual_date: string | null;
          status: string;
          approver: string;
          notes: string;
        }[];
      }[];

    const mapGate = (g: any, idx: number) => ({
      id: g.id as string,
      gate_id: "SG" + String(idx + 1).padStart(4, "0"),
      gate_name: g.gate_name as string,
      planned_date: g.planned_date as string | null,
      actual_date: g.actual_date as string | null,
      status: (g.status as string) || "Planned",
      approver: (g.approver as string) || "",
      notes: (g.notes as string) || "",
    });

    const sortedStreams = [...(projectStreams as any[])].sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        String(a.name || "").localeCompare(String(b.name || "")),
    );

    if (sortedStreams.length > 0) {
      let seq = 0;
      return sortedStreams
        .map((stream) => {
          const streamGates = sortGatesByOrgOrder(
            gatesForTimelineLane(
              {
                project_id: project.id,
                stream_id: stream.id,
                is_default: stream.is_default,
                is_stream_lane: true,
              },
              gates as any[],
            ),
            orgPhases,
          );
          const rows = streamGates.map((g) => mapGate(g, seq++));
          return {
            key: stream.id as string,
            streamLabel: formatStreamLabel(stream),
            streamRef: formatProjectStreamRef(project, stream),
            project_code: project.project_code || "",
            project_name: project.name as string,
            program: (project.program as string) || "",
            sponsor: (project.sponsor as string) || "",
            rows,
          };
        })
        .filter((s) => s.rows.length > 0);
    }

    const projectGates = sortGatesByOrgOrder(gates as any[], orgPhases);
    return [
      {
        key: "project",
        streamLabel: "Project",
        streamRef: project.project_code || project.name || "Project",
        project_code: project.project_code || "",
        project_name: project.name as string,
        program: (project.program as string) || "",
        sponsor: (project.sponsor as string) || "",
        rows: projectGates.map((g, i) => mapGate(g, i)),
      },
    ].filter((s) => s.rows.length > 0);
  }, [project, projectStreams, gates, orgPhases]);

  /** Monthly cashflow keyed by stream_id, else project_id (null-stream / no-stream projects). */
  const monthlyByLane = useMemo(() => {
    const m = new Map<string, MonthlyFinanceRow[]>();
    if (!project?.id) return m;
    for (const row of monthly as MonthlyFinanceRow[]) {
      const key = row.stream_id || project.id;
      const list = m.get(key) || [];
      list.push(row);
      m.set(key, list);
    }
    return m;
  }, [monthly, project?.id]);

  const sortedStreams = useMemo(
    () =>
      [...(projectStreams as any[])].sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)),
      ),
    [projectStreams],
  );

  /** Phase budget/forecast/actual from monthly cashflow + gate date windows (not stage_gates.phase_*). */
  const phaseSpendSections = useMemo(() => {
    if (!project) {
      return {
        phaseCards: [] as {
          name: string;
          status: string;
          planned?: string | null;
          actual?: string | null;
          approver?: string | null;
          budget: number;
          forecast: number;
          actualSpend: number;
        }[],
        streamGateSections: [] as {
          stream: any;
          streamCode: string;
          streamLabel: string;
          streamRef: string;
          cards: {
            name: string;
            status: string;
            planned?: string | null;
            actual?: string | null;
            approver?: string | null;
            budget: number;
            forecast: number;
            actualSpend: number;
          }[];
        }[],
      };
    }

    const spendFor = (
      pgates: any[],
      rows: MonthlyFinanceRow[],
      name: string,
      streamId?: string | null,
      gate?: { planned_date?: string | null; actual_date?: string | null; status?: string | null },
    ) => {
      const spend = phaseSpendByStage(pgates, rows, orgPhases).get(name);
      const fromEstimate =
        forecastPlannedByPhase.get(
          forecastPhaseKey({ stream_id: streamId || null, gate_name: name }),
        )?.total ?? 0;
      const plan = spend?.planned || fromEstimate;
      const actual = spend?.actual ?? 0;
      return {
        budget: plan,
        forecast: livePhaseForecast({
          plan,
          storedForecast: spend?.forecast,
          actual,
          delayed: isGateScheduleDelayed(gate || {}),
        }),
        actualSpend: actual,
      };
    };

    const streamGateSections =
      sortedStreams.length > 0
        ? sortedStreams.map((stream) => {
            const streamGates = gatesForTimelineLane(
              {
                project_id: project.id,
                stream_id: stream.id,
                is_default: stream.is_default,
                is_stream_lane: true,
              },
              gates as any[],
            );
            const rows = monthlyByLane.get(stream.id) || monthlyByLane.get(project.id) || [];
            const byName = new Map<string, any>();
            streamGates.forEach((g) => byName.set((g.gate_name || "").trim(), g));
            const cards = mergePhaseNames(orgPhases, streamGates).map((name) => {
              const g = byName.get(name);
              const $ = spendFor(streamGates, rows, name, stream.id, g);
              return {
                name,
                status: g?.status || "Not Started",
                planned: g?.planned_date,
                actual: g?.actual_date,
                approver: g?.approver,
                ...$,
              };
            });
            return {
              stream,
              streamCode: formatStreamCode(stream),
              streamLabel: formatStreamLabel(stream),
              streamRef: formatProjectStreamRef(project, stream),
              cards,
            };
          })
        : [];

    const phaseCards = orgPhases.map((name) => {
      const matching = (gates as any[]).filter((g) => (g.gate_name || "").trim() === name);
      const g = matching.find((x) => !isDoneGateStatus(x.status)) || matching[0];
      let budget = 0;
      let forecast = 0;
      let actualSpend = 0;
      if (streamGateSections.length > 0) {
        for (const section of streamGateSections) {
          const card = section.cards.find((c) => c.name === name);
          budget += card?.budget ?? 0;
          forecast += card?.forecast ?? 0;
          actualSpend += card?.actualSpend ?? 0;
        }
      } else {
        const rows = monthlyByLane.get(project.id) || (monthly as MonthlyFinanceRow[]);
        const $ = spendFor(gates as any[], rows, name, null, g);
        budget = $.budget;
        forecast = $.forecast;
        actualSpend = $.actualSpend;
      }
      return {
        name,
        status: g?.status || "Not Started",
        planned: g?.planned_date,
        actual: g?.actual_date,
        approver: g?.approver,
        budget,
        forecast,
        actualSpend,
      };
    });

    const sections =
      streamGateSections.length > 0
        ? streamGateSections
        : [
            {
              stream: null,
              streamCode: "",
              streamLabel: "Project",
              streamRef: project.project_code || project.name || "Project",
              cards: phaseCards,
            },
          ];

    return { phaseCards, streamGateSections: sections };
  }, [project, sortedStreams, gates, monthlyByLane, monthly, forecastPlannedByPhase, orgPhases]);

  const gateDetailRows = useMemo(() => {
    return phaseSpendSections.streamGateSections.flatMap((section) =>
      section.cards.map((p) => ({
        key: `${section.streamRef}:${p.name}`,
        streamLabel: section.streamLabel,
        streamRef: section.streamRef,
        name: p.name,
        status: p.status,
        planned: p.planned,
        actual: p.actual,
        approver: p.approver || "",
        budget: p.budget,
        forecast: p.forecast,
        actualSpend: p.actualSpend,
      })),
    );
  }, [phaseSpendSections]);

  const gateDetailColumns: ColumnarColumn<any>[] = useMemo(
    () => [
      ...(hasStreams
        ? [
            {
              key: "stream",
              label: "Stream",
              getValue: (p: any) => p.streamLabel || p.streamRef || "",
            },
          ]
        : []),
      { key: "name", label: "Gate" },
      { key: "status", label: "Status" },
      { key: "planned", label: "Planned" },
      { key: "actual", label: "Actual" },
      { key: "approver", label: "Approver" },
      { key: "budget", label: "Planned" },
      { key: "forecast", label: "Forecast" },
      { key: "actualSpend", label: "Actual" },
    ],
    [hasStreams],
  );
  const gateDetailTable = useColumnarTable(gateDetailRows, gateDetailColumns);

  const healthEngine = useMemo(() => {
    if (!project) return null;
    return evaluateProjectHealth({
      project,
      gates: gates as any[],
      risks: risks as any[],
      dependencies: deps as any[],
      monthly: monthly as any[],
      allocations: projectAllocations as any[],
    });
  }, [project, gates, risks, deps, monthly, projectAllocations]);

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
  const incurred = Number(project.capex_incurred || 0) + Number(project.opex_incurred || 0);
  const ftePlan = (monthly as any[]).reduce((s, m) => s + Number(m.opex_labor_planned || 0), 0);
  const fteActual = (monthly as any[]).reduce((s, m) => s + Number(m.opex_labor_actual || 0), 0);
  const forecast = Number(
    project.forecast ||
      project.forecast_at_completion ||
      Number(project.capex_approved || 0) + Number(project.opex_approved || 0) ||
      budget ||
      0,
  );
  const remaining = Math.max(0, budget - incurred);
  const utilPct = budget ? (incurred / budget) * 100 : 0;
  const finHealthPct = budget ? incurred / budget : 0;

  const explains = {
    forecast: explainForecast({
      label: "Forecast at Completion",
      currentForecast: forecast,
      monthly: monthly as MonthlyFinanceRow[],
      milestones: milestones as any[],
      gates: gates as any[],
      otherCosts: otherCosts as any[],
      projects: [project],
    }),
    actual: explainActualSpend({
      label: "Actual spend",
      actual: incurred,
      monthly: monthly as MonthlyFinanceRow[],
      otherCosts: otherCosts as any[],
      projects: [project],
    }),
    budget: explainBudget({
      label: "Budget",
      budget: budget || approved,
      forecast,
      projects: [project],
    }),
    remaining: explainRemaining({
      remaining,
      approved: budget || approved,
      incurred,
    }),
  };

  // Project-level phase rollup + stream gate cards (spend from monthly + gate windows)
  const phaseCards = phaseSpendSections.phaseCards;
  const streamGateSections = phaseSpendSections.streamGateSections;

  // Health chips — Health Engine (same logic as financials Explain)
  const scheduleHealth = healthEngine
    ? healthEngine.dimensions.find((d) => d.key === "schedule")?.rag || "Green"
    : "Green";
  const financialHealth = healthEngine
    ? healthEngine.dimensions.find((d) => d.key === "financial")?.rag || "Green"
    : "Green";
  const overallHealth = effectiveRag(project, healthEngine?.rag) || "Amber";
  const ragExplains = {
    overall: explainRag({
      rag: overallHealth,
      engine: isRagOverridden(project) ? null : healthEngine,
      source: isRagOverridden(project) ? "register" : undefined,
      overridden: isRagOverridden(project),
      manualRag: project.rag,
    }),
    schedule: explainRag({
      rag: scheduleHealth,
      engine: healthEngine,
      dimension: "schedule",
    }),
    financial: explainRag({
      rag: financialHealth,
      engine: healthEngine,
      dimension: "financial",
    }),
    register: explainRag({
      rag: displayRag(project),
      source: "register",
      overridden: isRagOverridden(project),
      extraBullets: healthEngine
        ? [
            `Health Engine calculated RAG is ${healthEngine.rag} (${healthEngine.score}/100). ${isRagOverridden(project) ? "Dashboards use the manual override (M)." : healthEngine.rag === project.rag ? "Matches the register field." : "Differs from the register field."}`,
          ]
        : [],
    }),
  };

  // Phase financials chart
  const phaseChart = phaseCards.map((p) => ({
    name: p.name,
    Planned: p.budget,
    Forecast: p.forecast,
    Actual: p.actualSpend,
  }));
  const hasPhaseFinancials = phaseChart.some((r) => r.Planned || r.Forecast || r.Actual);

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

  const monthlyChart = monthly.map((m: any) => {
    const key = String(m.period_month || "").slice(0, 7);
    const [ys, ms] = key.split("-");
    const y = Number(ys);
    const mo = Number(ms);
    const label =
      y && mo
        ? new Date(y, mo - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
        : key;
    return {
      month: label,
      Planned: Number(m.capex_planned || 0),
      Actual: Number(m.capex_actual || 0),
      Forecast: Number(m.capex_forecast || 0),
    };
  });

  const benefitsChart = benefits.map((b: any) => ({
    name: b.title,
    Target: Number(b.target_value || 0),
    Realised: Number(b.realised_value || 0),
  }));

  const ALLOC_STATUS = {
    Over: "#dc2626",
    Optimal: "#16a34a",
    Under: "#f59e0b",
    Unplanned: "#7c3aed",
  } as const;
  const PLAN_BAR = "#2563eb";
  const ACTUAL_BAR = "#0d9488";
  const heatColor = (pct: number) => {
    if (pct <= 0) return "rgba(148,163,184,0.25)";
    if (pct < 60) return "rgb(22,163,74)";
    if (pct <= 100) return "rgb(234,179,8)";
    return "rgb(220,38,38)";
  };
  const statusChip = (status: keyof typeof ALLOC_STATUS) => (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
      style={{ background: ALLOC_STATUS[status] }}
    >
      {status}
    </span>
  );

  const durationLabel = formatDuration(
    project.planned_start_date || project.start_date,
    project.planned_end_date || project.end_date || project.target_go_live,
  );
  const goLive = project.target_go_live || project.planned_end_date || project.end_date;

  const downloadInfographicPdf = async () => {
    if (!exportRef.current) return;
    setExportingPdf(true);
    toast.info("Preparing PDF…");
    // Hide on-screen chrome (download buttons, etc.) so the PDF matches the content,
    // not the app chrome / action controls.
    const hideEls = Array.from(
      exportRef.current.querySelectorAll<HTMLElement>(".print\\:hidden, [data-export-hide]"),
    );
    const prev = hideEls.map((el) => el.style.display);
    hideEls.forEach((el) => {
      el.style.display = "none";
    });
    try {
      const code = String(project.project_code || "project").replace(/[^\w.-]+/g, "_");
      await exportElementPDF(exportRef.current, `${code}_Infographic`, {
        orientation: "portrait",
      });
      toast.success("PDF downloaded");
    } catch {
      /* toast handled in exportElementPDF */
    } finally {
      hideEls.forEach((el, i) => {
        el.style.display = prev[i] || "";
      });
      setExportingPdf(false);
    }
  };

  return (
    <div>
      <PageHeading
        icon="🖼️"
        title="Project Infographic"
        subtitle="One-page visual summary for any project."
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={exportingPdf}
              onClick={() => void downloadInfographicPdf()}
            >
              <FileDown className="h-3.5 w-3.5" />
              {exportingPdf ? "Preparing PDF…" : "Download PDF"}
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

      <div ref={exportRef} className="space-y-4 bg-background">
        {/* Project header */}
        <SectionFrame>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">
                {project.project_code} · {project.program || "—"}
              </div>
              <div className="text-2xl font-bold">{project.name}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {project.description || "No description."}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <RagChip
                rag={displayRag(project) || overallHealth}
                manual={isRagOverridden(project)}
                explain={ragExplains.register}
              />
              <div className="text-xs text-muted-foreground">
                Sponsor:{" "}
                <span className="font-medium text-foreground">{project.sponsor || "—"}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Priority:{" "}
                <span className="font-medium text-foreground">{project.priority || "—"}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Method:{" "}
                <span className="font-medium text-foreground">
                  {project.delivery_method || "—"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="kpi-card">
              <div className="kpi-head">
                <div className="kpi-label">Duration</div>
              </div>
              <div className="kpi-value">{durationLabel}</div>
              <div className="kpi-sub">
                {fmtDate(project.planned_start_date || project.start_date)} →{" "}
                {fmtDate(project.planned_end_date || project.end_date || project.target_go_live)}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-head">
                <div className="kpi-label">Cost</div>
                <ExplainThis explanation={explains.forecast} size="xs" />
              </div>
              <div className="kpi-value">{money(budget)}</div>
              <div className="kpi-sub">
                Budget · Actual {money(incurred)} · FAC {money(forecast)}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-head">
                <div className="kpi-label">Go-Live Date</div>
              </div>
              <div className="kpi-value">{fmtDate(goLive)}</div>
              <div className="kpi-sub">Target go-live</div>
            </div>
          </div>
        </SectionFrame>

        <ProjectHealthEnginePanel
          project={project}
          gates={(gates as any[]).filter((g) => g.project_id === project.id)}
          risks={risks as any[]}
          dependencies={deps as any[]}
          monthly={monthly as any[]}
          allocations={projectAllocations as any[]}
        />

        {/* Stage Gates & Phase $ header */}
        <SectionFrame>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              🔷 Stage Gates &amp; Phase $
            </div>
            <span className="text-xs text-slate-600 ml-2">Health:</span>
            <HealthChip
              label={`Schedule · ${scheduleHealth}`}
              rag={scheduleHealth}
              explain={ragExplains.schedule}
            />
            <HealthChip
              label={`Financial · ${financialHealth}`}
              rag={financialHealth}
              explain={ragExplains.financial}
            />
            <HealthChip
              label={`Overall · ${overallHealth}`}
              rag={overallHealth}
              explain={ragExplains.overall}
            />
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
              title="Phase Planned / Forecast / Actual"
              heightClass="h-72"
              legend={
                hasPhaseFinancials ? undefined : (
                  <div className="text-[11px] text-slate-500 text-center">
                    No estimation plan or phase actuals yet.
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
                <Bar dataKey="Planned" fill="#3b82f6" />
                <Bar dataKey="Forecast" fill="#8b5cf6" />
                <Bar dataKey="Actual" fill="#f59e0b" />
              </BarChart>
            </ExpandableChart>

            <div className="bg-white rounded border border-slate-200 p-2">
              <Gauge
                value={incurred}
                max={Math.max(approved, budget, 1)}
                label="Spend vs Approved Budget"
                color={finHealthPct > 1 ? "#ef4444" : finHealthPct > 0.9 ? "#f59e0b" : "#22c55e"}
              />
              <div className="mt-2 grid grid-cols-2 gap-2 px-1">
                <div className="rounded bg-slate-50 px-2 py-1.5 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Planned FTE
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-indigo-700">
                    {money(ftePlan)}
                  </div>
                </div>
                <div className="rounded bg-slate-50 px-2 py-1.5 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Actual FTE
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-amber-700">
                    {money(fteActual)}
                  </div>
                </div>
              </div>
              <p className="mt-1 px-1 text-[10px] text-muted-foreground">
                Planned FTE from Estimation Planning allocations; actual FTE from timesheets (in
                incurred). Work-item hours are Demand, not Plan.
              </p>
            </div>
          </div>
        </SectionFrame>

        {/* Stage Gate cards — one lane per stream */}
        <SectionFrame>
          <SectionTitle>Stage Gates{hasStreams ? " by Stream" : ""}</SectionTitle>
          <p className="mb-3 text-xs text-muted-foreground">
            {deliveryMethod?.name || project.delivery_method || "Delivery method"} stage-gate
            template, same sequence as the timeline.
          </p>
          <div className="space-y-5">
            {streamGateSections.map((section) => (
              <div key={section.stream?.id || "project"}>
                {hasStreams ? (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {section.streamLabel}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.streamRef}
                    </span>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
                  {section.cards.map((p) => {
                    const s = STATUS_STYLE[p.status] || STATUS_STYLE["Not Started"];
                    const done = isDoneGateStatus(p.status);
                    return (
                      <div
                        key={`${section.streamRef}:${p.name}`}
                        className={`bg-white rounded-lg border border-slate-200 p-3 ring-1 ${s.ring} min-h-[110px]`}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={`w-5 h-5 rounded-full ${s.dot} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}
                            title={done ? "Approved / completed" : p.status}
                          >
                            {done ? "✓" : "○"}
                          </div>
                          <div className="text-xs font-semibold text-slate-800 leading-tight">
                            {p.name}
                          </div>
                        </div>
                        <div className={`text-xs mt-2 font-medium ${s.text}`}>{p.status}</div>
                        {p.planned && (
                          <div className="text-[10px] text-slate-500 mt-1">
                            Plan: {fmtDate(p.planned)}
                          </div>
                        )}
                        {p.actual && (
                          <div className="text-[10px] text-slate-500">
                            Actual: {fmtDate(p.actual)}
                          </div>
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
              </div>
            ))}
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
          <div className="mb-2 flex flex-wrap items-center gap-2" data-export-hide>
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
              Planned vs Actual
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
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background/95 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-muted"
              title="Show or hide stage-gate markers on the timeline"
            >
              <input
                type="checkbox"
                checked={showGates}
                onChange={(e) => setShowGates(e.target.checked)}
                className="h-3 w-3"
              />
              Stage gates
            </label>
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
            showGates={showGates}
            showProjectTimeline={showProjectTimeline}
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
                  <MiniKpi
                    label="Budget"
                    value={moneyM(budget)}
                    color="#3b82f6"
                    explain={explains.budget}
                  />
                  <MiniKpi
                    label="Forecast"
                    value={moneyM(forecast)}
                    color="#8b5cf6"
                    explain={explains.forecast}
                  />
                  <MiniKpi
                    label="Actual"
                    value={moneyM(incurred)}
                    color="#f59e0b"
                    explain={explains.actual}
                  />
                  <MiniKpi
                    label="Remaining"
                    value={moneyM(remaining)}
                    color="#22c55e"
                    explain={explains.remaining}
                  />
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
          <ColumnarToolbar
            globalQ={raidTable.globalQ}
            onGlobalQ={raidTable.setGlobalQ}
            shown={raidTable.rows.length}
            total={raidTable.total}
            dirty={raidTable.isDirty}
            onClear={raidTable.clearAll}
            placeholder="Search risks & issues…"
          />
          <div className="overflow-x-auto">
            <table className="st-table text-xs">
              <thead>
                <tr>
                  {raidColumns.map((col) => (
                    <ColumnarTh
                      key={col.key}
                      column={col}
                      filter={raidTable.filters[col.key]}
                      onFilter={(v) => raidTable.setColumnFilter(col.key, v)}
                      sortKey={raidTable.sortKey}
                      sortDir={raidTable.sortDir}
                      onToggleSort={raidTable.toggleSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {raidTable.rows.map((r) => (
                  <tr key={r.raid}>
                    <td className="font-mono">{r.raid}</td>
                    <td className="font-mono text-blue-600">{r.project_code || "—"}</td>
                    <td>{r.type}</td>
                    <td>{r.desc}</td>
                    <td>{r.probability}</td>
                    <td>{r.impact}</td>
                    <td>
                      <RagChip rag={r.rag} explain={explainRag({ rag: r.rag, source: "raid" })} />
                    </td>
                    <td>{r.owner || "NA"}</td>
                    <td>{fmtDate(r.due)}</td>
                    <td>{r.mitigation || "—"}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
                {raidTable.total === 0 && (
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

        {/* Upcoming Milestones — stage gates grouped by stream / project */}
        <SectionFrame>
          <SectionTitle>
            📌 Upcoming Milestones (Stage Gates){hasStreams ? " by Stream" : ""}
          </SectionTitle>
          <p className="mb-3 text-xs text-muted-foreground">
            Ordered by stream and stage-gate sequence for{" "}
            <span className="font-medium text-foreground">
              {project.project_code || project.name}
            </span>
            {project.program ? (
              <>
                {" "}
                · Program <span className="font-medium text-foreground">{project.program}</span>
              </>
            ) : null}
            .
          </p>
          {milestoneSections.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">No stage gates captured.</p>
          ) : (
            <div className="space-y-5">
              {milestoneSections.map((section) => (
                <div key={section.key}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {hasStreams ? (
                      <>
                        <span className="text-sm font-semibold text-foreground">
                          {section.streamLabel}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {section.streamRef}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm font-semibold text-foreground">
                        {section.project_code || section.project_name}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {section.rows.length} gate{section.rows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="st-table text-xs">
                      <thead>
                        <tr>
                          <th>Gate ID</th>
                          <th>Project</th>
                          <th>Stage Gate</th>
                          <th>Planned</th>
                          <th>Actual</th>
                          <th>Status</th>
                          <th>Approver</th>
                          <th>Notes</th>
                          <th>Sponsor</th>
                          <th>Program</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((g) => (
                          <tr key={g.id}>
                            <td className="font-mono">{g.gate_id}</td>
                            <td>
                              <div className="leading-tight">
                                <div className="font-mono text-blue-600">
                                  {section.project_code || "—"}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {section.project_name}
                                </div>
                              </div>
                            </td>
                            <td className="font-medium">{g.gate_name}</td>
                            <td>{fmtDate(g.planned_date)}</td>
                            <td>{g.actual_date ? fmtDate(g.actual_date) : "NA"}</td>
                            <td>{g.status || "Planned"}</td>
                            <td>{g.approver || "NA"}</td>
                            <td>{g.notes || "NA"}</td>
                            <td>{section.sponsor || "NA"}</td>
                            <td>{section.program || "NA"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionFrame>

        <ProjectInfographicWorkItems
          projectId={project.id}
          projectStreams={projectStreams as any[]}
        />

        {/* Project Brief — tabbed form */}
        <ProjectBrief
          project={project}
          milestones={milestones as any[]}
          risks={risks as any[]}
          deps={deps as any[]}
        />

        {/* Stage Gates table */}
        <SectionFrame>
          <SectionTitle>Stage Gate Detail{hasStreams ? " by Stream" : ""}</SectionTitle>
          <p className="mb-2 text-xs text-muted-foreground">
            Plan is the applied Estimation Planning baseline (monthly plan in the gate window).
            Forecast is the FY / monthly outlook and starts equal to Plan; it rises if the gate is
            late or actuals already exceed plan. Actual is incurred in the gate window.
          </p>
          <ColumnarToolbar
            globalQ={gateDetailTable.globalQ}
            onGlobalQ={gateDetailTable.setGlobalQ}
            shown={gateDetailTable.rows.length}
            total={gateDetailTable.total}
            dirty={gateDetailTable.isDirty}
            onClear={gateDetailTable.clearAll}
            placeholder="Search stage gates…"
          />
          <div className="overflow-x-auto">
            <table className="st-table text-xs">
              <thead>
                <tr>
                  {gateDetailColumns.map((col) => (
                    <ColumnarTh
                      key={col.key}
                      column={col}
                      filter={gateDetailTable.filters[col.key]}
                      onFilter={(v) => gateDetailTable.setColumnFilter(col.key, v)}
                      sortKey={gateDetailTable.sortKey}
                      sortDir={gateDetailTable.sortDir}
                      onToggleSort={gateDetailTable.toggleSort}
                      align={
                        col.key === "budget" || col.key === "forecast" || col.key === "actualSpend"
                          ? "right"
                          : "left"
                      }
                      className={
                        col.key === "budget" || col.key === "forecast" || col.key === "actualSpend"
                          ? "text-right"
                          : undefined
                      }
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {gateDetailTable.rows.map((p) => (
                  <tr key={p.key}>
                    {hasStreams ? (
                      <td>
                        <div className="leading-tight">
                          <div className="font-medium">{p.streamLabel}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {p.streamRef}
                          </div>
                        </div>
                      </td>
                    ) : null}
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

        {/* Resources & allocations — plan vs actual by project (streams rolled up) */}
        <SectionFrame>
          <SectionTitle>Resources & allocations (by project)</SectionTitle>
          <p className="mb-3 text-xs text-muted-foreground">
            Planned allocation vs approved timesheet actuals for this project (streams rolled up).
            Planned % comes from resource allocations generated when you apply Estimation Planning.
            Actual % converts timesheet hours to % of monthly FTE capacity. Statuses:{" "}
            <strong>Plan</strong> from allocation %, <strong>Actual</strong> from timesheet %,{" "}
            <strong>Plan vs actual</strong> from actual÷plan (Over &gt;110%, Optimal ≥60%, else
            Under; Unplanned when hours are booked with no plan).
          </p>
          {resourcePlanRows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              No resource allocations or timesheet actuals for this project yet.
            </div>
          ) : (
            <div className="space-y-4">
              <ExpandableChart
                title="Resource utilisation — plan % vs actual %"
                heightClass="h-72"
                legend={
                  <div className="mt-1 flex flex-wrap justify-end gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ background: PLAN_BAR }}
                      />
                      Plan
                    </span>
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ background: ACTUAL_BAR }}
                      />
                      Actual
                    </span>
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ background: ALLOC_STATUS.Over }}
                      />{" "}
                      Over
                    </span>
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ background: ALLOC_STATUS.Optimal }}
                      />{" "}
                      Optimal
                    </span>
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ background: ALLOC_STATUS.Under }}
                      />{" "}
                      Under
                    </span>
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ background: ALLOC_STATUS.Unplanned }}
                      />{" "}
                      Unplanned
                    </span>
                  </div>
                }
              >
                <BarChart
                  data={resourceUtilChart}
                  margin={{ top: 20, right: 48, left: 12, bottom: 56 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                  <XAxis
                    dataKey="resource"
                    fontSize={11}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                    height={56}
                  />
                  <YAxis
                    fontSize={11}
                    domain={[0, 120]}
                    label={{
                      value: "% of capacity",
                      angle: -90,
                      position: "insideLeft",
                      fontSize: 11,
                    }}
                  />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="planPct" name="Plan %" fill={PLAN_BAR} radius={[3, 3, 0, 0]}>
                    <LabelList
                      dataKey="planPct"
                      position="top"
                      formatter={(v: number) => `${v}%`}
                      fontSize={9}
                    />
                  </Bar>
                  <Bar dataKey="actualPct" name="Actual %" fill={ACTUAL_BAR} radius={[3, 3, 0, 0]}>
                    <LabelList
                      dataKey="actualPct"
                      position="top"
                      formatter={(v: number) => `${v}%`}
                      fontSize={9}
                    />
                  </Bar>
                </BarChart>
              </ExpandableChart>

              <div className="overflow-auto">
                <table className="w-full min-w-[36rem] border-collapse text-xs">
                  <thead>
                    <tr className="border-b bg-[#f1f3f6]">
                      <th className="px-2 py-1.5 text-left font-semibold">Resource</th>
                      <th className="px-2 py-1.5 text-right font-semibold tabular-nums">Plan %</th>
                      <th className="px-2 py-1.5 text-right font-semibold tabular-nums">
                        Actual %
                      </th>
                      <th className="px-2 py-1.5 text-left font-semibold">Plan status</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Actual status</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Plan vs actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resourceUtilChart.map((u) => (
                      <tr key={u.resourceId} className="border-b border-[#eef0f3]">
                        <td className="px-2 py-1.5 font-medium">{u.resource}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{u.planPct}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{u.actualPct}</td>
                        <td className="px-2 py-1.5">{statusChip(u.planStatus)}</td>
                        <td className="px-2 py-1.5">{statusChip(u.actualStatus)}</td>
                        <td className="px-2 py-1.5">{statusChip(u.pvaStatus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Month-wise allocation heatmap · by project (plan / actual)
                </div>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Each cell shows <span style={{ color: PLAN_BAR }}>plan%</span> /{" "}
                  <span style={{ color: ACTUAL_BAR }}>actual%</span>. Colour uses the higher of the
                  two.
                </p>
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-max border-separate border-spacing-0 text-xs">
                    <thead>
                      <tr>
                        <th className="sticky left-0 top-0 z-30 w-40 min-w-40 max-w-40 bg-background px-1.5 py-1 text-left shadow-[2px_0_4px_-2px_rgba(15,23,42,0.18)]">
                          Resource
                        </th>
                        {allocationMonths.map((m) => (
                          <th
                            key={m.key}
                            className="sticky top-0 z-20 w-16 min-w-16 bg-background p-0.5 text-center font-normal text-muted-foreground"
                          >
                            {m.label}
                          </th>
                        ))}
                        <th className="sticky top-0 z-20 bg-background px-1.5 py-1 text-right whitespace-nowrap">
                          Avg P / A
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {resourcePlanRows.map((r) => {
                        const monthCount = Math.max(1, allocationMonths.length);
                        const avgPlan = Math.round(r.planTotal / monthCount);
                        const avgActual = Math.round(r.actualTotal / monthCount);
                        return (
                          <tr key={r.key}>
                            <td className="sticky left-0 z-10 w-40 min-w-40 max-w-40 bg-background px-1.5 py-0.5 font-medium shadow-[2px_0_4px_-2px_rgba(15,23,42,0.18)]">
                              <div className="truncate" title={r.name}>
                                {r.name}
                              </div>
                              {r.role ? (
                                <div
                                  className="truncate text-[10px] font-normal text-muted-foreground"
                                  title={r.role}
                                >
                                  {r.role}
                                </div>
                              ) : null}
                            </td>
                            {allocationMonths.map((m) => {
                              const planPct = Math.round(r.planMonths[m.key] || 0);
                              const actualPct = Math.round(r.actualMonths[m.key] || 0);
                              const peak = Math.max(planPct, actualPct);
                              return (
                                <td key={m.key} className="p-0.5">
                                  <div
                                    className="flex h-8 w-16 flex-col items-center justify-center rounded text-[9px] font-semibold leading-tight tabular-nums"
                                    style={{
                                      background: heatColor(peak),
                                      color: peak === 0 ? "#64748b" : "#fff",
                                    }}
                                    title={`${r.name} · ${m.label}: plan ${planPct}% · actual ${actualPct}%`}
                                  >
                                    <span>{planPct}%</span>
                                    <span className="opacity-90">{actualPct}%</span>
                                  </div>
                                </td>
                              );
                            })}
                            <td className="px-1.5 py-0.5 text-right font-semibold tabular-nums text-[11px]">
                              {avgPlan}% / {avgActual}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: PLAN_BAR }}
                    />
                    Top = plan
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: ACTUAL_BAR }}
                    />
                    Bottom = actual
                  </span>
                  <div className="flex max-w-xs flex-1 items-center gap-2">
                    <span>0%</span>
                    <div
                      className="h-2 flex-1 rounded"
                      style={{
                        background:
                          "linear-gradient(to right, rgb(22,163,74), rgb(234,179,8), rgb(220,38,38))",
                      }}
                    />
                    <span>120%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SectionFrame>
      </div>
    </div>
  );
}

function HealthChip({
  label,
  rag,
  explain,
}: {
  label: string;
  rag: string;
  explain?: MetricExplanation | null;
}) {
  const bg =
    rag === "Green"
      ? "bg-emerald-500"
      : rag === "Amber"
        ? "bg-amber-500"
        : rag === "Red"
          ? "bg-red-500"
          : "bg-slate-400";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`text-xs text-white px-2 py-0.5 rounded-full ${bg}`}>{label}</span>
      {explain ? <ExplainThis explanation={explain} size="xs" /> : null}
    </span>
  );
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

function MiniKpi({
  label,
  value,
  color,
  explain,
}: {
  label: string;
  value: string;
  color: string;
  explain?: MetricExplanation | null;
}) {
  return (
    <div
      className="rounded border border-slate-200 bg-white px-2 py-1.5"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="text-[10px] text-slate-500">{label}</div>
        {explain ? <ExplainThis explanation={explain} size="xs" /> : null}
      </div>
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

function ProjectBrief({
  project,
  milestones = [],
  risks = [],
  deps = [],
}: {
  project: any;
  milestones?: any[];
  risks?: any[];
  deps?: any[];
}) {
  const qc = useQueryClient();
  const brief = (project.brief || {}) as { section1?: BriefSection1; section2?: BriefSection2 };
  const [s1, setS1] = useState<BriefSection1>(brief.section1 || { sponsor: project.sponsor || "" });
  const [s2, setS2] = useState<BriefSection2>(brief.section2 || {});
  const [saving, setSaving] = useState<null | 1 | 2>(null);
  const [downloadingBrief, setDownloadingBrief] = useState(false);

  const { data: forecast } = useQuery({
    queryKey: ["project_forecasts", project.id, "brief"],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_forecasts" as any)
        .select("*")
        .eq("project_id", project.id)
        .maybeSingle();
      return data as any;
    },
    enabled: !!project.id,
  });

  const { data: storedPhases = [] } = useQuery({
    queryKey: ["project_forecast_phases", forecast?.id, "brief"],
    queryFn: () => loadForecastPhases(forecast.id),
    enabled: !!forecast?.id,
  });

  const { data: phaseRes = [] } = useQuery({
    queryKey: ["project_forecast_phase_resources", forecast?.id, "brief"],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_forecast_phase_resources" as any)
        .select("*")
        .eq("forecast_id", forecast.id);
      return (data ?? []) as any[];
    },
    enabled: !!forecast?.id,
  });

  const { data: otherCosts = [] } = useQuery({
    queryKey: ["project_forecast_other_costs", forecast?.id, "brief"],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_forecast_other_costs" as any)
        .select("*")
        .eq("forecast_id", forecast.id)
        .order("sort_order");
      return (data ?? []) as any[];
    },
    enabled: !!forecast?.id,
  });

  const { data: briefStreams = [] } = useQuery({
    queryKey: ["project_streams", project.id, "brief"],
    queryFn: () => fetchProjectStreams(project.id),
    enabled: !!project.id,
  });

  const labeledBriefStreams = useMemo(
    () =>
      briefStreams.map((s) => ({
        id: s.id,
        name: formatStreamLabel(s),
        code: s.code,
        is_default: s.is_default,
        sort_order: s.sort_order,
      })),
    [briefStreams],
  );

  const forecastPhases = useMemo<ForecastPhaseRow[]>(() => {
    const stored =
      storedPhases.length > 0 ? storedPhases : parseForecastPhaseNotes(forecast?.notes);
    if (!stored.length) return [];
    return withResolvedForecastStreamNames(stored, labeledBriefStreams);
  }, [storedPhases, forecast?.notes, labeledBriefStreams]);

  const forecastRows = useMemo(
    () =>
      buildBriefForecastRows(
        forecastPhases,
        phaseRes as any[],
        otherCosts as any[],
        labeledBriefStreams,
      ),
    [forecastPhases, phaseRes, otherCosts, labeledBriefStreams],
  );
  const forecastRowGroups = useMemo(
    () => groupForecastRowsByStream(forecastRows, labeledBriefStreams),
    [forecastRows, labeledBriefStreams],
  );
  const forecastTotals = useMemo(() => briefForecastTotals(forecastRows), [forecastRows]);
  const forecastTotalsLine = useMemo(
    () =>
      forecastRows.length
        ? formatForecastTotalsLine(forecastTotals.labor, forecastTotals.other, forecastTotals.total)
        : "",
    [forecastRows.length, forecastTotals],
  );

  // Reload state when active project changes
  useEffect(() => {
    const b = (project.brief || {}) as any;
    setS1(b.section1 || { sponsor: project.sponsor || "" });
    setS2(b.section2 || {});
  }, [project.id]);

  useEffect(() => {
    if (!forecastTotalsLine) return;
    setS2((prev) => ({
      ...prev,
      estimate_commentary: mergeEstimateCommentary(prev.estimate_commentary, forecastTotalsLine),
    }));
  }, [forecastTotalsLine, project.id]);

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

  const linkColumns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "name", label: "Title" },
      { key: "url", label: "URL" },
      { key: "doc_type", label: "Category" },
      { key: "actions", label: "", filterable: false, sortable: false },
    ],
    [],
  );
  const linkTable = useColumnarTable(links, linkColumns);

  const saveSection = async (section: 1 | 2) => {
    setSaving(section);
    try {
      const section2 = forecastTotalsLine
        ? {
            ...s2,
            estimate_commentary: mergeEstimateCommentary(
              s2.estimate_commentary,
              forecastTotalsLine,
            ),
          }
        : s2;
      const next = { ...(project.brief || {}), section1: s1, section2 };
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

  const downloadBriefPpt = async () => {
    setDownloadingBrief(true);
    toast.info("Preparing PPT…");
    try {
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
          rag_overall: displayRag(project) || project.rag,
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
            section2: forecastTotalsLine
              ? {
                  ...s2,
                  estimate_commentary: mergeEstimateCommentary(
                    s2.estimate_commentary,
                    forecastTotalsLine,
                  ),
                }
              : s2,
          },
        },
        forecastRows,
        milestones: (milestones ?? []).map((m: any) => ({
          name: m.name,
          planned_date: m.planned_date,
          status: m.status,
          owner: m.owner,
        })),
        risks: (risks ?? []).map((r: any) => ({
          description: r.description,
          category: r.category,
          residual_rating: r.residual_rating ?? r.probability,
          mitigation_plan: r.mitigation_plan,
          owner: r.owner,
        })),
        dependencies: (deps ?? []).map((d: any) => ({
          from_project: d.from_project_name ?? d.from_project ?? d.from_project_id ?? null,
          to_project: d.to_project_name ?? d.to_project ?? d.to_project_id ?? null,
          dependency_type: d.dependency_type,
          status: d.status,
          description: d.description,
        })),
      });
      toast.success("Project brief PPT downloaded");
    } catch (e: any) {
      console.error("Project brief PPT failed", e);
      toast.error(e?.message || "Could not download the project brief PPT");
    } finally {
      setDownloadingBrief(false);
    }
  };

  return (
    <SectionFrame>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-800">Project Brief — {project.name}</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 print:hidden"
          disabled={downloadingBrief}
          onClick={() => void downloadBriefPpt()}
        >
          <Presentation className="h-3.5 w-3.5" />
          {downloadingBrief ? "Preparing PPT…" : "Download Project Brief (PPT)"}
        </Button>
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
            value="s3"
            className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 rounded-none bg-transparent px-4 py-2 text-sm"
          >
            Section 3 · Forecast Estimate
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
            <div>
              <BriefTextarea
                label="Estimate Commentary"
                rows={4}
                value={s2.estimate_commentary}
                onChange={(v) => setS2({ ...s2, estimate_commentary: v })}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {forecastTotalsLine
                  ? "The first line stays in sync with Project Estimation Planning totals."
                  : "Open Project Estimation Planning to populate planned labor / other / total here."}
              </p>
            </div>
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

        {/* ── Section 3 ─────────────────────────────────────── */}
        <TabsContent value="s3" className="mt-4">
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">
              Tabular summary from{" "}
              <a href="/app/project-forecast" className="font-medium text-blue-700 hover:underline">
                Project Estimation Planning
              </a>
              . Rows are grouped by stream, then phase. Labor and other costs are the planned
              baseline for each stream phase.
            </p>
            {forecastRows.length === 0 ? (
              <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-slate-700">
                No estimate yet for this project. Create one on Project Estimation Planning, then
                return here.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Planned labor
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                      {moneyBrief(forecastTotals.labor)}
                    </div>
                  </div>
                  <div className="rounded border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Planned other
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                      {moneyBrief(forecastTotals.other)}
                    </div>
                  </div>
                  <div className="rounded border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Planned total
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                      {moneyBrief(forecastTotals.total)}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                  <table className="st-table text-xs">
                    <thead>
                      <tr>
                        <th>Stream</th>
                        <th>Phase</th>
                        <th>Start</th>
                        <th>End</th>
                        <th className="st-num">Days</th>
                        <th className="st-num">Labor</th>
                        <th className="st-num">Other</th>
                        <th className="st-num">Phase total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecastRowGroups.map((group) => (
                        <Fragment key={group.streamKey}>
                          <tr className="st-stream-group">
                            <td colSpan={8}>
                              Stream · {group.streamLabel}
                              <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                                {group.rows.length} phase{group.rows.length === 1 ? "" : "s"}
                              </span>
                            </td>
                          </tr>
                          {group.rows.map((row) => (
                            <tr key={row.key}>
                              <td className="text-muted-foreground">{group.streamLabel}</td>
                              <td className="font-medium">{row.gate_name}</td>
                              <td>{row.start_date || "—"}</td>
                              <td>{row.end_date || "—"}</td>
                              <td className="st-num tabular-nums">{row.duration_days || "—"}</td>
                              <td className="st-num tabular-nums">{moneyBrief(row.labor)}</td>
                              <td className="st-num tabular-nums">{moneyBrief(row.other)}</td>
                              <td className="st-num tabular-nums font-semibold">
                                {moneyBrief(row.total)}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                      <tr>
                        <td colSpan={5} className="font-semibold">
                          Total
                        </td>
                        <td className="st-num font-semibold tabular-nums">
                          {moneyBrief(forecastTotals.labor)}
                        </td>
                        <td className="st-num font-semibold tabular-nums">
                          {moneyBrief(forecastTotals.other)}
                        </td>
                        <td className="st-num font-semibold tabular-nums">
                          {moneyBrief(forecastTotals.total)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* ── Document Links ────────────────────────────────── */}
        <TabsContent value="docs" className="mt-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="text-xs text-slate-500">
              Attach reference documents (SharePoint, Confluence, OneDrive, etc.)
            </div>
            {linkTable.total === 0 ? (
              <div className="rounded bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-slate-700">
                No links yet.
              </div>
            ) : (
              <div className="space-y-2">
                <ColumnarToolbar
                  globalQ={linkTable.globalQ}
                  onGlobalQ={linkTable.setGlobalQ}
                  shown={linkTable.rows.length}
                  total={linkTable.total}
                  dirty={linkTable.isDirty}
                  onClear={linkTable.clearAll}
                  placeholder="Search document links…"
                />
                <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                  <table className="st-table text-xs">
                    <thead>
                      <tr>
                        {linkColumns.map((col) => (
                          <ColumnarTh
                            key={col.key}
                            column={col}
                            filter={linkTable.filters[col.key]}
                            onFilter={(v) => linkTable.setColumnFilter(col.key, v)}
                            sortKey={linkTable.sortKey}
                            sortDir={linkTable.sortDir}
                            onToggleSort={linkTable.toggleSort}
                            className={col.key === "actions" ? "w-10" : undefined}
                          />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {linkTable.rows.map((d: any) => (
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
