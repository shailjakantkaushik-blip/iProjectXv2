import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, RagChip } from "@/components/streamlit";
import { ExplainThis } from "@/components/explain-this";
import { EnvelopeBullet } from "@/components/envelope-bullet";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList, Legend } from "recharts";
import { fyLabel } from "@/lib/fiscal-year";
import { ExpandableChart } from "@/components/expandable-chart";
import {
  projectApprovedFunding,
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
import { explainPortfolioSnapshot, explainRag } from "@/lib/explain-metric";
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
  head: () => ({
    meta: [
      { title: "Executive Cockpit — PMO Enterprise" },
      { name: "description", content: "Portfolio scoreboard across money, health, and mix." },
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

function ScoreStat({
  label,
  value,
  hint,
  to,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  to?: string;
  accent?: string;
}) {
  const body = (
    <div className="h-full rounded-lg border border-border bg-muted/15 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
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
  const { organization } = useAuth();
  const orgId = organization?.id;
  const fyStartMonth = organization?.fy_start_month || 4;
  const listProjects = useServerFn(listPortfolioProjects);
  const fetchKpis = useServerFn(getPortfolioKpis);
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ExecutivePortfolioFilterState>(emptyExecutiveFilters);
  const asOf = new Date().toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

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

  const gatesByProject = useMemo(() => {
    const m = new Map<string, any[]>();
    gatesScoped.forEach((g) => {
      if (!g.project_id) return;
      const list = m.get(g.project_id) || [];
      list.push(g);
      m.set(g.project_id, list);
    });
    return m;
  }, [gatesScoped]);

  const {
    totalValue,
    capexApproved,
    opexApproved,
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
    const capexApproved = projects.reduce((s: number, p: any) => s + num(p.capex_approved), 0);
    const opexApproved = projects.reduce((s: number, p: any) => s + num(p.opex_approved), 0);
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
      const bf = rows.reduce((s: number, p: any) => s + benefitTargetFor(p), 0);
      return {
        name: cat,
        initiatives: rows.length,
        approved,
        actual,
        remaining: Math.max(0, approved - actual),
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
        const withBenefits = {
          ...p,
          benefits_target: sumBenefitsTarget(benefitsScoped as any[], p, p.id),
          benefits_realised: sumBenefitsRealised(benefitsScoped as any[], p, p.id),
        };
        const health = computeProjectHealth(withBenefits, gatesByProject.get(p.id) || []);
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
  }, [projects, benefitsScoped, gatesByProject, profileById]);

  const maxSegApproved = Math.max(1, ...segRows.map((r) => r.approved));
  const benefitsPct = benefitsForecastK
    ? Math.min(100, Math.round((benefitsRealisedK / benefitsForecastK) * 100))
    : 0;

  if (isColdLoading(projectsQ)) {
    return <PageLoading label="Loading portfolio scoreboard…" fullScreen={false} />;
  }

  return (
    <div className="space-y-4">
      <PageHeading
        icon="📊"
        title="Executive Cockpit"
        subtitle={`Portfolio scoreboard · as of ${asOf}${filtersOn ? ` · ${projects.length} of ${allProjects.length} projects` : ` · ${projects.length} projects`}`}
        actions={
          <>
            <Link
              to="/app/executive"
              search={{ tab: "quick" }}
              className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              Open Quick view
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

      <SectionFrame exportName="cockpit-money" exportTitle="Money">
        <div className="mb-2 flex items-center gap-2">
          <SectionTitle>Money</SectionTitle>
          {explains.budget ? <ExplainThis explanation={explains.budget} size="xs" /> : null}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-3">
            <EnvelopeBullet
              budget={approvedFundingK}
              incurred={actualSpendK}
              forecast={facK}
            />
            <div className="grid grid-cols-3 gap-2">
              <ScoreStat
                label="CapEx"
                value={money(capexApproved)}
                hint={totalValue ? `of ${money(totalValue)} value` : undefined}
              />
              <ScoreStat label="OpEx" value={money(opexApproved)} />
              <ScoreStat
                label="Remaining"
                value={money(remainingK)}
                hint={`${pct(remainingK, approvedFundingK)} of envelope`}
              />
            </div>
            {coverageWeak ? (
              <ScoreStat
                label="FY allocation coverage"
                value={`${allocationCoverage}%`}
                hint={`${projectsWithFY}/${projects.length} projects have an FY split`}
                to="/app/fy-allocation"
                accent={allocationCoverage < 50 ? "#dc2626" : "#d97706"}
              />
            ) : null}
          </div>
          <div>
            {fyData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No FY envelope yet</p>
            ) : (
              <ExpandableChart title="Budget vs Forecast by FY" heightClass="h-64">
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
        </div>
      </SectionFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionFrame exportName="cockpit-health-band" exportTitle="Health">
          <SectionTitle>Health</SectionTitle>
          <MixBar green={onTrackK} amber={atRiskK} red={delayedK} />
          <p className="mt-2 text-xs text-muted-foreground">
            {total} project{total === 1 ? "" : "s"} · {pct(onTrackK, total || 1)} Green
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <ScoreStat label="Strategic programs" value={strategicPrograms} />
            <ScoreStat label="CapEx programs" value={capexPrograms} />
            <ScoreStat label="Unfunded" value={unfundedInitiatives} />
          </div>
        </SectionFrame>

        <SectionFrame exportName="cockpit-governance" exportTitle="Governance">
          <SectionTitle>Governance</SectionTitle>
          <div className="mb-3">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                Benefits realised
              </span>
              <span className="tabular-nums text-muted-foreground">
                {money(benefitsRealisedK)} of {money(benefitsForecastK)} · {benefitsPct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${benefitsPct}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
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
        </SectionFrame>
      </div>

      <SectionFrame exportName="cockpit-segmentation" exportTitle="Mix by Strategic Alignment">
        <SectionTitle>Mix by Strategic Alignment</SectionTitle>
        {segRows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No alignment mix yet.</p>
        ) : (
          <div className="space-y-3">
            {segRows.map((r) => (
              <div key={r.name} className="grid items-center gap-3 md:grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)_10rem]">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="text-[11px] tabular-nums text-muted-foreground">
                    {r.initiatives} · {money(r.approved)}
                  </div>
                </div>
                <div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-400/80"
                      style={{ width: `${(r.approved / maxSegApproved) * 100}%` }}
                    />
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-emerald-600"
                      style={{
                        width: `${r.approved ? Math.min(100, (r.actual / r.approved) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <MixBar green={r.green} amber={r.amber} red={r.red} compact />
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Wide bar is approved envelope (relative). Thin bar is spend vs that envelope.
            </p>
          </div>
        )}
      </SectionFrame>

      <SectionFrame
        exportName="cockpit-health"
        exportTitle="Portfolio Health Snapshot"
        className="section-frame--filters overflow-visible"
      >
        <SectionTitle>Portfolio health matrix</SectionTitle>
        <p className="mb-2 text-[11px] text-muted-foreground">
          All in-scope projects, sorted worst RAG then lowest health score. Click a row for the
          infographic. Health score stays calculated; RAG uses a manual override when set (M).
        </p>
        <p className="mb-2 text-[11px] text-muted-foreground md:hidden">Swipe sideways to see all columns.</p>
        <div className="st-table-wrap max-h-[min(520px,70dvh)] overflow-auto overscroll-contain">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="sticky top-0 z-[2] bg-muted/90 text-xs uppercase text-muted-foreground backdrop-blur">
              <tr>
                <th className="sticky left-0 z-[3] bg-muted/90 px-3 py-2 text-left">Project</th>
                <th className="px-3 py-2 text-left">Strategic Alignment</th>
                <th className="px-3 py-2 text-left">Channel</th>
                <th className="px-3 py-2 text-left">Sponsor</th>
                <th className="px-3 py-2 text-left">Lead</th>
                <th className="px-3 py-2 text-right">Progress</th>
                <th className="px-3 py-2 text-right">Health</th>
                <th className="px-3 py-2 text-left">Schedule</th>
                <th className="px-3 py-2 text-left">Financial</th>
                <th className="px-3 py-2 text-left">Delivery</th>
                <th className="px-3 py-2 text-left">Benefit</th>
                <th className="px-3 py-2 text-left">RAG</th>
                <th className="px-3 py-2 text-left">30d</th>
              </tr>
            </thead>
            <tbody>
              {healthRows.map((p: any) => (
                <tr
                  key={p.id}
                  className="group cursor-pointer border-t hover:bg-muted/30"
                  onClick={() =>
                    navigate({ to: "/app/project-infographic", search: { pid: p.id } as any })
                  }
                >
                  <td className="sticky left-0 z-[1] bg-background px-3 py-2 group-hover:bg-muted/50">
                    <div className="font-mono text-[11px] text-primary">
                      {p.project_code || "—"}
                    </div>
                    <div className="max-w-[14rem] truncate text-xs">{p.name}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{p.portfolio || "—"}</td>
                  <td className="px-3 py-2 text-xs">{p.governance_channel || "—"}</td>
                  <td className="px-3 py-2 text-xs">{p.sponsor || "—"}</td>
                  <td className="px-3 py-2 text-xs">{p.delivery_lead || "—"}</td>
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
                        explain={explainRag({ rag: p.engine.predictive.likelyRag, engine: p.engine })}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Health Score is calculated (Schedule 20% · Financial 20% · Scope 10% · Delivery 15% ·
          Resource 10% · Risk 10% · Dependencies 10% · Benefits 5%). {healthRows.length} row(s).
        </div>
      </SectionFrame>
    </div>
  );
}
