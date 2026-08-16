import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, RagChip } from "@/components/streamlit";
import { ExplainThis } from "@/components/explain-this";
import { EnvelopeBullet } from "@/components/envelope-bullet";
import { ExpandablePanel } from "@/components/expandable-panel";
import { ExecutiveQuickView } from "@/components/executive-quick-view";
import { ProjectMeetingSummary } from "@/components/project-meeting-summary";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList, Legend, ResponsiveContainer } from "recharts";
import { fyLabel } from "@/lib/fiscal-year";
import { ExpandableChart } from "@/components/expandable-chart";
import { CategoryTick } from "@/components/chart-category-tick";
import {
  projectApprovedFunding,
  projectCapexApproved,
  projectOpexApproved,
  projectForecast,
  projectIncurred,
  fyAllocBudget,
  fyAllocForecast,
  sumBenefitsRealised,
  sumBenefitsTarget,
} from "@/lib/project-finance";
import {
  computeProjectHealth,
  portfolioSegmentLabels,
  projectPortfolio,
} from "@/lib/project-health";
import { getPortfolioKpis, listPortfolioProjects } from "@/lib/portfolio.functions";
import { MAX_PAGE_SIZE } from "@/lib/portfolio-paging";
import { FINANCIALS_MONTHLY_SELECT } from "@/lib/query-selects";
import { explainPortfolioSnapshot, explainRag, type MetricExplanation } from "@/lib/explain-metric";
import { displayRag, effectiveRag, isRagOverridden } from "@/lib/ops-enhancements";
import type { MonthlyFinanceRow } from "@/lib/finance-lifecycle";
import { isDecisionAwaiting } from "@/lib/decision-approval";
import { isColdLoading } from "@/lib/query-ui";
import { PageLoading } from "@/components/page-loading";
import {
  ExecutivePortfolioFilters,
  applyExecutivePortfolioFilters,
  emptyExecutiveFilters,
  executiveFiltersActive,
  type ExecutivePortfolioFilterState,
} from "@/components/portfolio-filters";

export const Route = createFileRoute("/_authenticated/app/executive-cockpit")({
  validateSearch: (s: Record<string, unknown>): { section?: "summaries" } => {
    if (String(s.section || "") === "summaries") return { section: "summaries" };
    return {};
  },
  head: () => ({
    meta: [
      { title: "Executive Cockpit — PMO Enterprise" },
      { name: "description", content: "Steering pack, portfolio scoreboard, and project summaries." },
    ],
  }),
  component: ExecutiveCockpit,
});

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}
function pct(n: number, d: number) {
  return d ? Math.round((n / d) * 100) + "%" : "—";
}
const num = (v: unknown) => Number(v || 0);

function byProjectId<T extends { project_id?: string | null }>(rows: T[]) {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const id = r.project_id;
    if (!id) continue;
    const list = m.get(id) || [];
    list.push(r);
    m.set(id, list);
  }
  return m;
}

function ragRank(rag?: string | null) {
  const r = String(rag || "").trim();
  if (r === "Red") return 0;
  if (r === "Amber") return 1;
  if (r === "Green") return 2;
  return 3;
}

function healthHeat(score: number) {
  if (!Number.isFinite(score) || score <= 0) return "bg-muted text-muted-foreground";
  if (score >= 75) return "bg-emerald-50 text-emerald-800";
  if (score >= 50) return "bg-amber-50 text-amber-900";
  return "bg-rose-50 text-rose-800";
}

function packWhy(p: {
  engine?: {
    drivers?: { severity?: string; message?: string }[];
    earlyWarnings?: { title?: string }[];
    forecast?: { message?: string };
  };
}) {
  const engine = p.engine;
  if (!engine) return "—";
  const topDriver = engine.drivers?.find((d) => d.severity === "Red") || engine.drivers?.[0];
  const topWarn = engine.earlyWarnings?.[0];
  return topWarn?.title || topDriver?.message || engine.forecast?.message || "—";
}

function ScoreStat({
  label,
  value,
  hint,
  to,
  accent,
  explain,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  to?: string;
  accent?: string;
  explain?: MetricExplanation | null;
}) {
  const body = (
    <div className="h-full rounded-lg border border-border bg-muted/15 px-3 py-2.5">
      <div className="flex items-center gap-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {explain ? <ExplainThis explanation={explain} size="xs" /> : null}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums leading-tight" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
  if (!to) return body;
  return (
    <Link to={to} className="block h-full transition-opacity hover:opacity-90">
      {body}
    </Link>
  );
}

function MixBar({
  green,
  amber,
  red,
  compact = false,
}: {
  green: number;
  amber: number;
  red: number;
  compact?: boolean;
}) {
  const total = Math.max(1, green + amber + red);
  const bar = (
    <div className={`flex overflow-hidden rounded-full bg-muted ${compact ? "h-2 flex-1" : "h-3"}`}>
      {green > 0 ? (
        <div className="bg-emerald-500" style={{ width: `${(green / total) * 100}%` }} />
      ) : null}
      {amber > 0 ? (
        <div className="bg-amber-500" style={{ width: `${(amber / total) * 100}%` }} />
      ) : null}
      {red > 0 ? (
        <div className="bg-rose-500" style={{ width: `${(red / total) * 100}%` }} />
      ) : null}
    </div>
  );
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {bar}
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {green}/{amber}/{red}
        </span>
      </div>
    );
  }
  return (
    <div>
      {bar}
      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
        <span className="tabular-nums text-emerald-700">{green} Green</span>
        <span className="tabular-nums text-amber-700">{amber} Amber</span>
        <span className="tabular-nums text-rose-700">{red} Red</span>
      </div>
    </div>
  );
}

function ExecutiveCockpit() {
  const { section } = Route.useSearch();
  const { organization } = useAuth();
  const orgId = organization?.id;
  const fyStartMonth = organization?.fy_start_month || 4;
  const listProjects = useServerFn(listPortfolioProjects);
  const fetchKpis = useServerFn(getPortfolioKpis);
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ExecutivePortfolioFilterState>(emptyExecutiveFilters);
  const [summariesCollapsed, setSummariesCollapsed] = useState(section !== "summaries");
  const [openSummaryIds, setOpenSummaryIds] = useState<Set<string>>(() => new Set());
  const [asksHost, setAsksHost] = useState<HTMLElement | null>(null);
  const asOf = new Date().toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  useEffect(() => {
    if (section !== "summaries") return;
    setSummariesCollapsed(false);
    const t = window.setTimeout(() => {
      document.getElementById("project-summaries")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [section]);

  const projectsQ = useQuery({
    queryKey: ["projects", orgId, "cockpit"],
    queryFn: () =>
      listProjects({
        data: { orgId: orgId!, offset: 0, limit: MAX_PAGE_SIZE },
      }),
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const allProjects = (projectsQ.data?.rows ?? []) as any[];
  const projects = useMemo(
    () => applyExecutivePortfolioFilters(allProjects, filters, fyStartMonth),
    [allProjects, filters, fyStartMonth],
  );
  const filteredIds = useMemo(() => new Set(projects.map((p: any) => p.id)), [projects]);
  const filtersOn = executiveFiltersActive(filters);

  const { data: kpis } = useQuery({
    queryKey: ["portfolio-kpis", orgId],
    queryFn: () => fetchKpis({ data: { orgId: orgId! } }),
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gates")
          .select("id,project_id,stream_id,gate_name,planned_date,actual_date,status")
      ).data ?? [],
    enabled: !!orgId,
  });
  const { data: decisions = [] } = useQuery({
    queryKey: ["decisions", orgId],
    queryFn: async () =>
      (await supabase.from("decisions").select("id,project_id,outcome,status")).data ?? [],
    enabled: !!orgId,
  });
  const { data: actions = [] } = useQuery({
    queryKey: ["actions", orgId],
    queryFn: async () =>
      (await supabase.from("actions").select("id,project_id,status,due_date")).data ?? [],
    enabled: !!orgId,
  });
  const { data: benefits = [] } = useQuery({
    queryKey: ["benefits", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("benefits")
          .select("id,project_id,target_value,realised_value")
      ).data ?? [],
    enabled: !!orgId,
  });
  const { data: fyAlloc = [] } = useQuery({
    queryKey: ["fy_allocations", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("fy_allocations")
          .select("id,project_id,fy,budget,forecast,capex,opex,benefits,allocated_amount,forecast_amount")
      ).data ?? [],
    enabled: !!orgId,
  });
  const { data: monthly = [] } = useQuery({
    queryKey: ["financials_monthly", orgId, "explain"],
    queryFn: async () =>
      (
        await supabase
          .from("financials_monthly")
          .select(FINANCIALS_MONTHLY_SELECT as "*")
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const { data: milestones = [] } = useQuery({
    queryKey: ["milestones", orgId, "explain"],
    queryFn: async () =>
      (
        await supabase
          .from("milestones")
          .select("id,project_id,name,planned_date,actual_date,status")
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const { data: otherCosts = [] } = useQuery({
    queryKey: ["opex_other_costs", orgId, "explain"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opex_other_costs" as any)
        .select("id,project_id,amount,category,vendor,description,period_month,cost_date");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles", orgId],
    queryFn: async () =>
      (await supabase.from("profiles").select("id,full_name,email")).data ?? [],
    enabled: !!orgId,
  });
  const { data: risks = [] } = useQuery({
    queryKey: ["risks", orgId, "cockpit-health"],
    queryFn: async () =>
      (
        await supabase
          .from("risks")
          .select("id,project_id,status,severity,probability,impact,priority,rating")
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const { data: dependencies = [] } = useQuery({
    queryKey: ["dependencies", orgId, "portfolio-pulse"],
    queryFn: async () =>
      (
        await supabase
          .from("dependencies")
          .select("id,project_id,status,dep_type,needed_by")
          .eq("org_id", orgId!)
          .limit(10000)
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const { data: workItems = [] } = useQuery({
    queryKey: ["work_items", orgId, "portfolio-pulse"],
    queryFn: async () =>
      (
        await supabase
          .from("work_items" as never)
          .select("id,project_id,status,percent_complete,estimate_hours")
          .eq("org_id", orgId!)
          .limit(10000)
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const { data: allocations = [] } = useQuery({
    queryKey: ["resource_allocations", orgId, "portfolio-pulse"],
    queryFn: async () =>
      (
        await supabase
          .from("resource_allocations")
          .select("id,project_id,allocation_percent,allocated_hours")
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const { data: changeRequests = [] } = useQuery({
    queryKey: ["change_requests", orgId, "cockpit-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("change_requests" as never)
        .select("id,project_id,status,change_type,impact_cost,impact_schedule_days");
      if (error) return [];
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const profileById = useMemo(
    () => new Map((profiles as any[]).map((p) => [p.id, p])),
    [profiles],
  );

  const inScope = (projectId?: string | null) =>
    !filtersOn || (!!projectId && filteredIds.has(projectId));

  const gatesScoped = useMemo(
    () => (gates as any[]).filter((g) => inScope(g.project_id)),
    [gates, filtersOn, filteredIds],
  );
  const benefitsScoped = useMemo(
    () => (benefits as any[]).filter((b) => inScope(b.project_id)),
    [benefits, filtersOn, filteredIds],
  );
  const fyAllocScoped = useMemo(
    () => (fyAlloc as any[]).filter((a) => inScope(a.project_id)),
    [fyAlloc, filtersOn, filteredIds],
  );

  const gatesByProject = useMemo(() => byProjectId(gatesScoped as any[]), [gatesScoped]);
  const risksByProject = useMemo(() => byProjectId(risks as any[]), [risks]);
  const depsByProject = useMemo(() => byProjectId(dependencies as any[]), [dependencies]);
  const workItemsByProject = useMemo(() => byProjectId(workItems as any[]), [workItems]);
  const allocationsByProject = useMemo(() => byProjectId(allocations as any[]), [allocations]);
  const crsByProject = useMemo(() => byProjectId(changeRequests as any[]), [changeRequests]);
  const monthlyByProject = useMemo(() => byProjectId(monthly as any[]), [monthly]);

  const {
    totalValue,
    capexApproved,
    opexApproved,
    capexIncurred,
    opexIncurred,
    approvedFunding,
    actualSpend,
    remaining,
    fac,
    total,
    onTrack,
    atRisk,
    delayed,
    strategicPrograms,
    capexPrograms,
    unfundedInitiatives,
    benefitsForecast,
    benefitsRealised,
    decisionsPending,
    overdueActions,
    upcomingGates,
    segRows,
  } = useMemo(() => {
    const benefitsByProject = new Map<string, any[]>();
    benefitsScoped.forEach((b) => {
      if (!b.project_id) return;
      const list = benefitsByProject.get(b.project_id) || [];
      list.push(b);
      benefitsByProject.set(b.project_id, list);
    });
    const benefitTargetFor = (p: any) =>
      sumBenefitsTarget(benefitsByProject.get(p.id) || [], p, p.id);

    const totalValue = projects.reduce((s: number, p: any) => s + num(p.budget), 0);
    const capexApproved = projects.reduce((s: number, p: any) => s + projectCapexApproved(p), 0);
    const opexApproved = projects.reduce((s: number, p: any) => s + projectOpexApproved(p), 0);
    const capexIncurred = projects.reduce((s: number, p: any) => s + num(p.capex_incurred), 0);
    const opexIncurred = projects.reduce((s: number, p: any) => s + num(p.opex_incurred), 0);
    const approvedFunding = projects.reduce(
      (s: number, p: any) => s + projectApprovedFunding(p),
      0,
    );
    const actualSpend = projects.reduce((s: number, p: any) => s + projectIncurred(p), 0);
    const remaining = Math.max(0, approvedFunding - actualSpend);
    const fac = projects.reduce((s: number, p: any) => s + projectForecast(p), 0);

    const total = projects.length;
    const onTrack = projects.filter((p: any) => (displayRag(p) || "").toLowerCase() === "green").length;
    const atRisk = projects.filter((p: any) => (displayRag(p) || "").toLowerCase() === "amber").length;
    const delayed = projects.filter((p: any) => (displayRag(p) || "").toLowerCase() === "red").length;
    const strategicPrograms = new Set(
      projects
        .filter((p: any) => {
          const cat = projectPortfolio(p);
          return cat === "Business Strategic" || cat === "IT Strategic";
        })
        .map((p: any) => p.program)
        .filter(Boolean),
    ).size;
    const capexPrograms = new Set(
      projects
        .filter((p: any) => projectPortfolio(p) === "CAPEX")
        .map((p: any) => p.program)
        .filter(Boolean),
    ).size;
    const unfundedInitiatives = projects.filter(
      (p: any) => projectPortfolio(p).toLowerCase() === "unfunded",
    ).length;

    const benefitsForecast = benefitsScoped.reduce((s: number, b: any) => s + num(b.target_value), 0);
    const benefitsRealised = benefitsScoped.reduce((s: number, b: any) => s + num(b.realised_value), 0);

    const decisionsPending = (decisions as any[]).filter((d) => {
      if (!inScope(d.project_id)) return false;
      return isDecisionAwaiting(d);
    }).length;
    const today = new Date();
    const overdueActions = (actions as any[]).filter((a) => {
      if (!inScope(a.project_id)) return false;
      const s = String(a.status || "").toLowerCase();
      if (s === "closed" || s === "done" || s === "completed") return false;
      if (!a.due_date) return false;
      return new Date(a.due_date) < today;
    }).length;
    const upcomingGates = gatesScoped.filter((g: any) => {
      if (!g.planned_date) return false;
      const d = new Date(g.planned_date);
      const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 30;
    }).length;

    const segLabels = portfolioSegmentLabels(projects as any[]);
    const segRows = segLabels.map((cat) => {
      const rows = projects.filter((p: any) => projectPortfolio(p) === cat);
      const approved = rows.reduce((s: number, p: any) => s + projectApprovedFunding(p), 0);
      const actual = rows.reduce((s: number, p: any) => s + projectIncurred(p), 0);
      const capex = rows.reduce((s: number, p: any) => s + projectCapexApproved(p), 0);
      const opex = rows.reduce((s: number, p: any) => s + projectOpexApproved(p), 0);
      const forecast = rows.reduce((s: number, p: any) => s + projectForecast(p), 0);
      const bf = rows.reduce((s: number, p: any) => s + benefitTargetFor(p), 0);
      return {
        name: cat,
        initiatives: rows.length,
        approved,
        actual,
        capex,
        opex,
        remaining: Math.max(0, approved - actual),
        forecast,
        benefits: bf,
        green: rows.filter((p: any) => (displayRag(p) || "").toLowerCase() === "green").length,
        amber: rows.filter((p: any) => (displayRag(p) || "").toLowerCase() === "amber").length,
        red: rows.filter((p: any) => (displayRag(p) || "").toLowerCase() === "red").length,
      };
    });

    return {
    totalValue,
    capexApproved,
    opexApproved,
    capexIncurred,
    opexIncurred,
    approvedFunding,
      actualSpend,
      remaining,
      fac,
      total,
      onTrack,
      atRisk,
      delayed,
      strategicPrograms,
      capexPrograms,
      unfundedInitiatives,
      benefitsForecast,
      benefitsRealised,
      decisionsPending,
      overdueActions,
      upcomingGates,
      segRows,
    };
  }, [projects, benefitsScoped, decisions, actions, gatesScoped, filtersOn, filteredIds]);

  const useCache = Boolean(kpis?.from_cache) && !filtersOn;
  const approvedFundingK = useCache ? kpis!.approved_funding : approvedFunding;
  const actualSpendK = useCache ? kpis!.incurred : actualSpend;
  const remainingK = Math.max(0, approvedFundingK - actualSpendK);
  const facK = useCache ? kpis!.forecast_at_completion : fac;
  const facDelta = facK - approvedFundingK;
  const onTrackK = useCache ? kpis!.rag_green : onTrack;
  const atRiskK = useCache ? kpis!.rag_amber : atRisk;
  const delayedK = useCache ? kpis!.rag_red : delayed;
  const benefitsForecastK = useCache ? kpis!.benefits_target : benefitsForecast;
  const benefitsRealisedK = useCache ? kpis!.benefits_realised : benefitsRealised;

  const explains = useMemo(
    () =>
      explainPortfolioSnapshot({
        projects,
        monthly: (monthly as MonthlyFinanceRow[]).filter((m) => inScope((m as any).project_id)),
        milestones: (milestones as any[]).filter((m) => inScope(m.project_id)),
        gates: gatesScoped,
        otherCosts: (otherCosts as any[]).filter((c) => inScope(c.project_id)),
      }),
    [projects, monthly, milestones, gatesScoped, otherCosts, filtersOn, filteredIds],
  );

  const fyData = useMemo(() => {
    const map = new Map<string, { fy: string; budget: number; forecast: number }>();
    fyAllocScoped.forEach((a: any) => {
      const fy = a.fy || a.financial_year;
      if (!fy) return;
      const cur = map.get(fy) || { fy, budget: 0, forecast: 0 };
      cur.budget += fyAllocBudget(a);
      cur.forecast += fyAllocForecast(a);
      map.set(fy, cur);
    });
    if (map.size === 0) {
      projects.forEach((p: any) => {
        const start = p.start_date ? fyLabel(new Date(p.start_date), fyStartMonth) : null;
        if (!start) return;
        const cur = map.get(start) || { fy: start, budget: 0, forecast: 0 };
        cur.budget += projectApprovedFunding(p);
        cur.forecast += projectForecast(p);
        map.set(start, cur);
      });
    }
    return Array.from(map.values()).sort((a, b) => a.fy.localeCompare(b.fy));
  }, [fyAllocScoped, projects, fyStartMonth]);

  const monthlySpend = useMemo(() => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const rows = (monthly as any[]).filter((m) => inScope(m.project_id));
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
  }, [monthly, filtersOn, filteredIds]);

  const planTotal = useMemo(() => {
    return (monthly as MonthlyFinanceRow[])
      .filter((m) => inScope((m as any).project_id))
      .reduce((s, m) => s + num(m.capex_planned) + num(m.opex_planned), 0);
  }, [monthly, filtersOn, filteredIds]);

  const projectsWithFY =
    new Set(fyAllocScoped.map((a: any) => a.project_id).filter(Boolean)).size ||
    projects.filter((p: any) => p.start_date).length;
  const allocationCoverage = projects.length
    ? Math.round((projectsWithFY / projects.length) * 100)
    : 0;
  const coverageWeak = allocationCoverage < 85;

  const healthRows = useMemo(() => {
    return projects
      .slice()
      .map((p: any) => {
        const health = computeProjectHealth(p, gatesByProject.get(p.id) || [], {
          monthly: monthlyByProject.get(p.id) || [],
          risks: risksByProject.get(p.id) || [],
          dependencies: depsByProject.get(p.id) || [],
          workItems: workItemsByProject.get(p.id) || [],
          allocations: allocationsByProject.get(p.id) || [],
          changeRequests: crsByProject.get(p.id) || [],
          benefitLines: (benefitsScoped as any[]).filter((b) => b.project_id === p.id),
        });
        const pm = p.pm_user_id ? profileById.get(p.pm_user_id) : null;
        const deliveryLead =
          (pm?.full_name || pm?.email || p.delivery_lead || p.pm_name || "").trim() || "—";
        const shown = effectiveRag(p, health.overall_rag);
        return { ...p, ...health, delivery_lead: deliveryLead, shown_rag: shown };
      })
      .sort((a: any, b: any) => {
        const rr = ragRank(a.shown_rag) - ragRank(b.shown_rag);
        if (rr !== 0) return rr;
        return (num(a.health_score) || 999) - (num(b.health_score) || 999);
      });
  }, [
    projects,
    benefitsScoped,
    gatesByProject,
    profileById,
    monthlyByProject,
    risksByProject,
    depsByProject,
    workItemsByProject,
    allocationsByProject,
    crsByProject,
  ]);

  const benefitsPct = benefitsForecastK
    ? Math.min(100, Math.round((benefitsRealisedK / benefitsForecastK) * 100))
    : 0;
  const benefitsGap = benefitsForecastK - benefitsRealisedK;

  const benefitRows = useMemo(() => {
    return projects
      .map((p: any) => {
        const target = sumBenefitsTarget(benefitsScoped as any[], p, p.id);
        const realised = sumBenefitsRealised(benefitsScoped as any[], p, p.id);
        return {
          id: p.id,
          code: p.project_code || "",
          name: p.name || "Project",
          label: p.project_code || String(p.name || "Project").slice(0, 16),
          target,
          realised,
          gap: target - realised,
          rate: target > 0 ? Math.round((realised / target) * 100) : 0,
        };
      })
      .filter((r) => r.target > 0 || r.realised > 0)
      .sort((a, b) => b.target - a.target);
  }, [projects, benefitsScoped]);

  const benefitChart = useMemo(
    () =>
      benefitRows.slice(0, 10).map((r) => ({
        name: r.label,
        Target: r.target,
        Realised: r.realised,
      })),
    [benefitRows],
  );

  if (isColdLoading(projectsQ)) {
    return <PageLoading label="Loading portfolio scoreboard…" fullScreen={false} />;
  }

  return (
    <div className="space-y-4">
      <PageHeading
        icon="📊"
        title="Executive Cockpit"
        subtitle={`Steering pack and portfolio pulse · as of ${asOf}${filtersOn ? ` · ${projects.length} of ${allProjects.length} projects` : ` · ${projects.length} projects`}`}
        actions={
          <>
            <Link
              to="/app/executive"
              className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              Open Dashboard
            </Link>
            <Link
              to="/app/portfolio-pulse"
              className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              Open Pulse
            </Link>
          </>
        }
      />

      <SectionFrame className="section-frame--filters" exportable={false}>
        <ExecutivePortfolioFilters
          projects={allProjects}
          value={filters}
          onChange={setFilters}
          fyStartMonth={fyStartMonth}
        />
      </SectionFrame>

      <ExecutiveQuickView
        mode="steering"
        asksHost={asksHost}
        filtered={projects}
        approvedFunding={approvedFundingK}
        totalIncurred={actualSpendK}
        totalForecast={facK}
        remaining={remainingK}
        monthlySpend={monthlySpend}
        segmentation={segRows.map((r) => ({ name: r.name, value: r.approved }))}
        gates={gatesScoped}
        monthly={(monthly as MonthlyFinanceRow[]).filter((m) => inScope((m as any).project_id))}
      />

      <SectionFrame exportName="cockpit-money" exportTitle="Financials" id="pack-money">
        <div className="mb-2 flex items-center gap-2">
          <SectionTitle>Financials</SectionTitle>
          {explains.budget ? <ExplainThis explanation={explains.budget} size="xs" /> : null}
        </div>
        <div className="space-y-3">
          <EnvelopeBullet
            budget={approvedFundingK}
            incurred={actualSpendK}
            forecast={facK}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <ScoreStat
              label="Budget"
              value={money(approvedFundingK)}
              hint="Approved envelope"
              explain={explains.budget}
              to="/app/financials"
            />
            <ScoreStat
              label="Plan"
              value={money(planTotal)}
              hint={planTotal ? "Monthly CapEx + OpEx plan" : "No monthly plan yet"}
            />
            <ScoreStat
              label="Incurred"
              value={money(actualSpendK)}
              hint={`${pct(actualSpendK, approvedFundingK)} of envelope`}
              explain={explains.actual}
            />
            <ScoreStat
              label="Forecast"
              value={money(facK)}
              hint="At completion"
              explain={explains.forecast}
            />
            <ScoreStat
              label="Remaining"
              value={money(remainingK)}
              hint={`${pct(remainingK, approvedFundingK)} of envelope`}
              explain={explains.remaining}
            />
            <ScoreStat
              label="FAC vs envelope"
              value={`${facDelta > 0 ? "+" : facDelta < 0 ? "−" : ""}${money(Math.abs(facDelta))}`}
              hint={facDelta > 0 ? "over budget" : facDelta < 0 ? "under budget" : "on envelope"}
              accent={facDelta > 0 ? "#dc2626" : facDelta < 0 ? "#15803d" : undefined}
            />
            <ScoreStat
              label="CapEx approved"
              value={money(capexApproved)}
              hint={totalValue ? `of ${money(totalValue)} value` : undefined}
            />
            <ScoreStat
              label="CapEx incurred"
              value={money(capexIncurred)}
              hint={`${pct(capexIncurred, capexApproved)} of CapEx`}
            />
            <ScoreStat
              label="OpEx approved"
              value={money(opexApproved)}
            />
            <ScoreStat
              label="OpEx incurred"
              value={money(opexIncurred)}
              hint={`${pct(opexIncurred, opexApproved)} of OpEx`}
            />
            <ScoreStat
              label="Benefits target"
              value={money(benefitsForecastK)}
              explain={explains.benefits}
              to="/app/benefits"
            />
            <ScoreStat
              label="Benefits realised"
              value={money(benefitsRealisedK)}
              hint={`${pct(benefitsRealisedK, benefitsForecastK)} of target`}
              to="/app/benefits"
            />
            <ScoreStat
              label="FY coverage"
              value={`${allocationCoverage}%`}
              hint={`${projectsWithFY}/${projects.length} projects have an FY split`}
              to="/app/fy-allocation"
              accent={coverageWeak ? (allocationCoverage < 50 ? "#dc2626" : "#d97706") : undefined}
            />
          </div>
          {fyData.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No FY envelope yet</p>
          ) : (
            <ExpandableChart
              title="Budget vs Forecast by FY"
              heightClass="h-64"
              collapsible
              defaultCollapsed
              collapsedSummary="Chart hidden. Financials KPIs stay visible above."
            >
              <BarChart data={fyData} margin={{ top: 20, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fy" fontSize={11} />
                <YAxis
                  fontSize={10}
                  tickFormatter={(v: number) => money(v)}
                />
                <Tooltip formatter={(v: number) => money(v)} />
                <Legend verticalAlign="top" />
                <Bar dataKey="budget" name="Budget" fill="#3b82f6">
                  <LabelList
                    dataKey="budget"
                    position="top"
                    style={{ fontSize: 10 }}
                    formatter={(v: number) => money(v)}
                  />
                </Bar>
                <Bar dataKey="forecast" name="Forecast" fill="#f59e0b">
                  <LabelList
                    dataKey="forecast"
                    position="top"
                    style={{ fontSize: 10 }}
                    formatter={(v: number) => money(v)}
                  />
                </Bar>
              </BarChart>
            </ExpandableChart>
          )}
        </div>
      </SectionFrame>

      <SectionFrame
        exportName="cockpit-health"
        exportTitle="Portfolio Health Snapshot"
        className="section-frame--filters overflow-visible"
      >
        <ExpandablePanel
          title="Portfolio health matrix"
          compactMaxHeightClass="max-h-[min(520px,70dvh)]"
        >
          <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
            <div>
              <MixBar green={onTrackK} amber={atRiskK} red={delayedK} />
              <p className="mt-2 text-xs text-muted-foreground">
                {total} project{total === 1 ? "" : "s"} · {pct(onTrackK, total || 1)} Green
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ScoreStat label="Strategic programs" value={strategicPrograms} />
              <ScoreStat label="CapEx programs" value={capexPrograms} />
              <ScoreStat label="Unfunded" value={unfundedInitiatives} />
            </div>
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            All in-scope projects, sorted worst RAG then lowest health score. Click a row for the
            infographic. Health score stays calculated; RAG uses a manual override when set (M).
            Financials live in Mix by Strategic Alignment.
          </p>
          <p className="mb-2 text-[11px] text-muted-foreground md:hidden">
            Swipe sideways to see all columns.
          </p>
          <div className="st-table-wrap overflow-auto overscroll-contain">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="sticky top-0 z-[2] bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-[3] bg-muted px-3 py-2 text-left shadow-[4px_0_8px_-2px_rgba(15,23,42,0.18)]">
                    Project
                  </th>
                  <th className="px-3 py-2 text-right">Progress</th>
                  <th className="px-3 py-2 text-right">Health</th>
                  <th className="px-3 py-2 text-left">RAG</th>
                  <th
                    className="px-3 py-2 text-left"
                    title="Health Engine 30-day outlook (forecast score and likely RAG)"
                  >
                    30 days prediction
                  </th>
                  <th className="px-3 py-2 text-left">Schedule</th>
                  <th className="px-3 py-2 text-left">Financial</th>
                  <th className="px-3 py-2 text-left">Delivery</th>
                  <th className="px-3 py-2 text-left">Benefit</th>
                  <th className="px-3 py-2 text-left">Strategic Alignment</th>
                  <th className="px-3 py-2 text-left">Program</th>
                  <th className="px-3 py-2 text-left">Channel</th>
                  <th className="px-3 py-2 text-left">Sponsor</th>
                  <th className="px-3 py-2 text-left">Lead</th>
                  <th className="px-3 py-2 text-left">Why</th>
                </tr>
              </thead>
              <tbody>
                {healthRows.map((p: any) => {
                  return (
                    <tr
                      key={p.id}
                      className="group cursor-pointer border-t hover:bg-muted/30"
                      onClick={() =>
                        navigate({ to: "/app/project-infographic", search: { pid: p.id } as any })
                      }
                    >
                      <td className="sticky left-0 z-[1] bg-surface px-3 py-2 shadow-[4px_0_8px_-2px_rgba(15,23,42,0.18)] group-hover:bg-muted">
                        <div className="font-mono text-[11px] text-primary">
                          {p.project_code || "—"}
                        </div>
                        <div className="max-w-[14rem] truncate text-xs">{p.name}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {Math.round(num(p.progress_percent))}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${healthHeat(num(p.health_score))}`}
                        >
                          {num(p.health_score) || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <RagChip
                          rag={p.shown_rag || p.overall_rag || displayRag(p)}
                          label={p.shown_rag || p.overall_rag || displayRag(p)}
                          manual={isRagOverridden(p)}
                          explain={explainRag({
                            rag: p.shown_rag || p.overall_rag || displayRag(p),
                            engine: isRagOverridden(p) ? null : p.engine,
                            source: isRagOverridden(p) ? "register" : undefined,
                            overridden: isRagOverridden(p),
                            manualRag: p.rag,
                          })}
                        />
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <span className="mr-1 tabular-nums text-xs">
                          {p.engine?.predictive?.forecastScore30d ?? "—"}
                        </span>
                        {p.engine?.predictive?.likelyRag ? (
                          <RagChip
                            rag={p.engine.predictive.likelyRag}
                            explain={explainRag({
                              rag: p.engine.predictive.likelyRag,
                              engine: p.engine,
                              extraBullets: [
                                `30-day outlook: score ${p.engine.predictive.forecastScore30d}/100 → ${p.engine.predictive.likelyRag}.`,
                              ],
                            })}
                          />
                        ) : null}
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <RagChip
                          rag={p.schedule_rag}
                          label={p.schedule_rag}
                          explain={explainRag({ rag: p.schedule_rag, engine: p.engine, dimension: "schedule" })}
                        />
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <RagChip
                          rag={p.financial_rag}
                          label={p.financial_rag}
                          explain={explainRag({ rag: p.financial_rag, engine: p.engine, dimension: "financial" })}
                        />
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <RagChip
                          rag={p.delivery_rag}
                          label={p.delivery_rag}
                          explain={explainRag({ rag: p.delivery_rag, engine: p.engine, dimension: "delivery" })}
                        />
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <RagChip
                          rag={p.benefit_rag}
                          label={p.benefit_rag}
                          explain={explainRag({ rag: p.benefit_rag, engine: p.engine, dimension: "benefits" })}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs">{p.portfolio || "—"}</td>
                      <td className="px-3 py-2 text-xs">{p.program || "—"}</td>
                      <td className="px-3 py-2 text-xs">{p.governance_channel || "—"}</td>
                      <td className="px-3 py-2 text-xs">{p.sponsor || "—"}</td>
                      <td className="px-3 py-2 text-xs">{p.delivery_lead || "—"}</td>
                      <td className="max-w-[16rem] px-3 py-2 text-xs text-muted-foreground">
                        {packWhy(p)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Health Score is calculated (Schedule 20% · Financial 20% · Scope 10% · Delivery 15% ·
            Resource 10% · Risk 10% · Dependencies 10% · Benefits 5%). {healthRows.length} row(s).
          </div>
        </ExpandablePanel>
      </SectionFrame>

      <SectionFrame exportName="cockpit-governance" exportTitle="Governance">
        <SectionTitle>Governance</SectionTitle>
        <div className="mb-4 grid grid-cols-3 gap-2">
          <ScoreStat
            label="Decisions"
            value={decisionsPending}
            hint="Awaiting outcome"
            to="/app/decisions"
            accent={decisionsPending ? "#2563eb" : undefined}
          />
          <ScoreStat
            label="Overdue actions"
            value={overdueActions}
            to="/app/actions"
            accent={overdueActions ? "#dc2626" : undefined}
          />
          <ScoreStat
            label="Gates (30d)"
            value={upcomingGates}
            hint="Planned in 30 days"
            to="/app/stage-gates"
            accent={upcomingGates ? "#7c3aed" : undefined}
          />
        </div>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <SectionTitle>Benefits</SectionTitle>
          <Link
            to="/app/benefits"
            className="text-xs font-medium text-primary hover:underline"
          >
            Open benefits register
          </Link>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ScoreStat
            label="Target"
            value={money(benefitsForecastK)}
            explain={explains.benefits}
          />
          <ScoreStat
            label="Realised"
            value={money(benefitsRealisedK)}
            hint={`${benefitsPct}% of target`}
          />
          <ScoreStat
            label="Gap"
            value={money(Math.abs(benefitsGap))}
            hint={benefitsGap > 0 ? "still to realise" : benefitsGap < 0 ? "ahead of target" : "on target"}
            accent={benefitsGap > 0 ? "#d97706" : benefitsGap < 0 ? "#15803d" : undefined}
          />
          <ScoreStat
            label="Realisation"
            value={`${benefitsPct}%`}
            hint={`${benefitRows.length} project${benefitRows.length === 1 ? "" : "s"} with benefits`}
          />
        </div>
        {benefitChart.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No benefit target or realised value in this filter.</p>
        ) : (
          <ExpandablePanel
            title="Benefits — Target vs Realised"
            collapsible
            defaultCollapsed
            collapsedSummary={`${benefitRows.length} project${benefitRows.length === 1 ? "" : "s"} · ${money(benefitsRealisedK)} of ${money(benefitsForecastK)} · ${benefitsPct}% realised. Click Show or Expand.`}
          >
            <div className="space-y-3">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={benefitChart}
                    isAnimationActive={false}
                    margin={{ top: 24, right: 12, left: 4, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" interval={0} minTickGap={0} tick={<CategoryTick />} height={44} />
                    <YAxis fontSize={10} tickFormatter={(v: number) => money(v)} />
                    <Tooltip formatter={(v: number, n: string) => [money(v), n]} />
                    <Legend verticalAlign="top" />
                    <Bar dataKey="Target" name="Target" fill="#1d4ed8" radius={[4, 4, 0, 0]}>
                      <LabelList
                        dataKey="Target"
                        position="top"
                        style={{ fontSize: 10 }}
                        formatter={(v: number) => money(v)}
                      />
                    </Bar>
                    <Bar dataKey="Realised" name="Realised" fill="#10b981" radius={[4, 4, 0, 0]}>
                      <LabelList
                        dataKey="Realised"
                        position="top"
                        style={{ fontSize: 10 }}
                        formatter={(v: number) => money(v)}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="st-table-wrap overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Project</th>
                      <th className="px-2 py-1.5 text-right">Target</th>
                      <th className="px-2 py-1.5 text-right">Realised</th>
                      <th className="px-2 py-1.5 text-right">Gap</th>
                      <th className="px-2 py-1.5 text-right">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benefitRows.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-2 py-2">
                          <Link
                            to="/app/projects/$id"
                            params={{ id: r.id }}
                            search={{ tab: "summary" }}
                            className="font-medium text-primary hover:underline"
                          >
                            {r.code ? `${r.code} · ${r.name}` : r.name}
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(r.target)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(r.realised)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          <span className={r.gap > 0 ? "text-amber-700" : r.gap < 0 ? "text-emerald-700" : ""}>
                            {money(Math.abs(r.gap))}
                            {r.gap < 0 ? " ahead" : ""}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {benefitRows.length > 10 ? (
                <p className="text-[11px] text-muted-foreground">
                  Chart shows the top 10 by target. Table lists all {benefitRows.length} projects with
                  benefits.
                </p>
              ) : null}
            </div>
          </ExpandablePanel>
        )}
      </SectionFrame>

      <SectionFrame exportName="cockpit-segmentation" exportTitle="Mix by Strategic Alignment">
        <SectionTitle>Mix by Strategic Alignment</SectionTitle>
        {segRows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No alignment mix yet.</p>
        ) : (
          <div className="space-y-4">
            <ExpandableChart
              title="Budget, incurred, and forecast by Strategic Alignment"
              heightClass="h-72"
              collapsible
              defaultCollapsed
              collapsedSummary="Chart hidden. Mix table stays visible below."
            >
              <BarChart data={segRows} margin={{ top: 28, right: 16, left: 8, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} minTickGap={0} tick={<CategoryTick />} height={44} />
                <YAxis fontSize={10} tickFormatter={(v: number) => money(v)} />
                <Tooltip
                  formatter={(v: number, n: string) => [money(v), n]}
                  labelFormatter={(label) => String(label)}
                />
                <Legend verticalAlign="top" />
                <Bar dataKey="approved" name="Budget" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="approved"
                    position="top"
                    style={{ fontSize: 10 }}
                    formatter={(v: number) => money(v)}
                  />
                </Bar>
                <Bar dataKey="actual" name="Incurred" fill="#10b981" radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="actual"
                    position="top"
                    style={{ fontSize: 10 }}
                    formatter={(v: number) => money(v)}
                  />
                </Bar>
                <Bar dataKey="forecast" name="Forecast" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="forecast"
                    position="top"
                    style={{ fontSize: 10 }}
                    formatter={(v: number) => money(v)}
                  />
                </Bar>
              </BarChart>
            </ExpandableChart>
            <div className="st-table-wrap overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Strategic Alignment</th>
                    <th className="px-2 py-1.5 text-right">Projects</th>
                    <th className="px-2 py-1.5 text-right">Budget</th>
                    <th className="px-2 py-1.5 text-right">CapEx</th>
                    <th className="px-2 py-1.5 text-right">OpEx</th>
                    <th className="px-2 py-1.5 text-right">Incurred</th>
                    <th className="px-2 py-1.5 text-right">Remaining</th>
                    <th className="px-2 py-1.5 text-right">Forecast</th>
                    <th className="px-2 py-1.5 text-left">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {segRows.map((r) => (
                    <tr key={r.name} className="border-t border-border">
                      <td className="px-2 py-2 font-medium">{r.name}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.initiatives}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{money(r.approved)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{money(r.capex)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{money(r.opex)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{money(r.actual)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{money(r.remaining)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        <span className={r.forecast > r.approved ? "font-semibold text-red-600" : ""}>
                          {money(r.forecast)}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <MixBar green={r.green} amber={r.amber} red={r.red} compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Budget, CapEx, OpEx, Incurred, Remaining, and Forecast. Forecast over envelope is
              shown in red.
            </p>
          </div>
        )}
      </SectionFrame>

      <SectionFrame exportName="cockpit-summaries" exportTitle="Project summaries">
        <ExpandablePanel
          id="project-summaries"
          title="Project summaries"
          collapsible
          collapsed={summariesCollapsed}
          onCollapsedChange={setSummariesCollapsed}
          collapsedSummary={`${projects.length} project${projects.length === 1 ? "" : "s"} · meeting notes since last steering. Click Show or Expand.`}
          compactMaxHeightClass="max-h-[min(80vh,960px)]"
          toolbar={
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <button
                type="button"
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSummariesCollapsed(false);
                  setOpenSummaryIds(new Set(projects.map((p: any) => p.id)));
                }}
              >
                Expand all
              </button>
              <button
                type="button"
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setOpenSummaryIds(new Set())}
              >
                Collapse all
              </button>
            </div>
          }
        >
          <p className="mb-3 text-sm text-muted-foreground">
            Read-only rollup of each project&apos;s Project Summary tab. Open the project name to
            edit notes, meeting dates, and RAG override on Project Summary.
          </p>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects match the current filters.</p>
          ) : (
            <div className="space-y-2">
              {projects.map((p: any) => {
                const open = openSummaryIds.has(p.id);
                return (
                  <Collapsible
                    key={p.id}
                    open={open}
                    onOpenChange={(next) => {
                      setOpenSummaryIds((prev) => {
                        const n = new Set(prev);
                        if (next) n.add(p.id);
                        else n.delete(p.id);
                        return n;
                      });
                    }}
                  >
                    <div className="rounded-lg border border-border">
                      <div className="flex w-full items-center justify-between gap-3 px-3 py-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <CollapsibleTrigger
                            type="button"
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={open ? `Hide ${p.name}` : `Show ${p.name}`}
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`}
                            />
                          </CollapsibleTrigger>
                          <Link
                            to="/app/projects/$id"
                            params={{ id: p.id }}
                            search={{ tab: "summary" }}
                            className="min-w-0 truncate text-xs font-semibold text-primary hover:underline"
                          >
                            {p.project_code} · {p.name}
                          </Link>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Link
                            to="/app/projects/$id"
                            params={{ id: p.id }}
                            search={{ tab: "summary" }}
                            className="text-[10px] font-medium text-primary hover:underline"
                          >
                            Project Summary
                          </Link>
                          <RagChip rag={displayRag(p)} manual={isRagOverridden(p)} />
                        </div>
                      </div>
                      <CollapsibleContent>
                        <ProjectMeetingSummary projectId={p.id} project={p} readOnly />
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </ExpandablePanel>
      </SectionFrame>

      <div id="pack-asks-end" ref={setAsksHost} />
    </div>
  );
}
