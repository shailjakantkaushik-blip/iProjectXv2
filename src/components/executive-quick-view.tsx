import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CircleAlert, Gavel, GitBranch, ListChecks, ListTodo } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle, RagChip } from "@/components/streamlit";
import { ExpandablePanel } from "@/components/expandable-panel";
import { ExpandableChart } from "@/components/expandable-chart";
import { CategoryTick } from "@/components/chart-category-tick";
import { CHART_SERIES, RAG_COLORS } from "@/lib/chart-theme";
import { PageLoading } from "@/components/page-loading";
import {
  projectApprovedFunding,
  projectCapexApproved,
  projectOpexApproved,
  projectRemaining,
} from "@/lib/project-finance";
import { healthScoreHeatClass, projectPortfolio } from "@/lib/project-health";
import { explainRag } from "@/lib/explain-metric";
import { isRagOverridden } from "@/lib/ops-enhancements";
import { isDecisionAwaiting } from "@/lib/decision-approval";
import { EnvelopeBullet } from "@/components/envelope-bullet";
import {
  buildExecutiveBriefing,
  type BriefingAction,
  type BriefingDecision,
  type BriefingGate,
  type BriefingProject,
  type BriefingRisk,
  type SteeringSignal,
} from "@/lib/executive-briefing";
import type { HealthEngineInput } from "@/lib/project-health-engine";
import type { MonthlyFinanceRow } from "@/lib/finance-lifecycle";

type SpendPoint = { month: string; actual: number; forecast: number };
type NamedCount = { name: string; value: number };
type QuestionKind = BriefingAction["kind"];

const SIGNAL_HREF: Record<
  SteeringSignal["key"],
  "/app/financials" | "/app/stage-gates" | "/app/risks" | "/app/timeline"
> = {
  money: "/app/financials",
  gates: "/app/stage-gates",
  risks: "/app/risks",
  overdue: "/app/timeline",
};

function isOpenRaid(status?: string | null) {
  const s = String(status || "").toLowerCase();
  return !/closed|mitigated|accepted|resolved|done|completed/.test(s);
}

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

function pct(n: number, d: number) {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

function healthHeat(score: number) {
  return healthScoreHeatClass(score);
}

function kindLabel(kind: string) {
  if (kind === "decision") return "Decide";
  if (kind === "money") return "Financials";
  if (kind === "schedule") return "Time";
  if (kind === "risk") return "Risk";
  return "Health";
}

function signalTone(tone: SteeringSignal["tone"]) {
  if (tone === "red") return { bar: "#dc2626", value: "text-rose-700" };
  if (tone === "amber") return { bar: "#d97706", value: "text-amber-800" };
  return { bar: "#15803d", value: "text-emerald-800" };
}

function SteeringSignalCard({ signal }: { signal: SteeringSignal }) {
  const tone = signalTone(signal.tone);
  return (
    <Link
      to={SIGNAL_HREF[signal.key]}
      className="rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.03]"
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 h-8 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: tone.bar }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {signal.label}
          </p>
          <p className={`mt-0.5 text-lg font-semibold tabular-nums tracking-tight ${tone.value}`}>
            {signal.value}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{signal.hint}</p>
        </div>
      </div>
    </Link>
  );
}

function countLabel(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function SteeringQuickLinks({
  decisionsPending,
  actionsOpen,
  openRisks,
  openIssues,
  demandPending,
}: {
  decisionsPending: number;
  actionsOpen: number;
  openRisks: number;
  openIssues: number;
  demandPending: number;
}) {
  const leads = [
    {
      to: "/app/demand-pipeline" as const,
      icon: GitBranch,
      label: "Demand Pipeline",
      detail: demandPending
        ? `${countLabel(demandPending, "item", "items")} awaiting approval`
        : "Nothing waiting on approval",
      tone: demandPending ? "text-amber-800" : "text-muted-foreground",
    },
    {
      to: "/app/prioritisation" as const,
      icon: ListChecks,
      label: "Prioritisation",
      detail: "Full ranking with payback",
      tone: "text-muted-foreground",
    },
  ];

  const raid = [
    {
      to: "/app/risks" as const,
      icon: AlertTriangle,
      label: "Risk",
      detail: openRisks ? `${countLabel(openRisks, "open", "open")}` : "None open",
      tone: openRisks ? "text-rose-800" : "text-muted-foreground",
    },
    {
      to: "/app/actions" as const,
      icon: ListTodo,
      label: "Action",
      detail: actionsOpen ? `${countLabel(actionsOpen, "pending", "pending")}` : "None pending",
      tone: actionsOpen ? "text-sky-800" : "text-muted-foreground",
    },
    {
      to: "/app/issues" as const,
      icon: CircleAlert,
      label: "Issue",
      detail: openIssues ? `${countLabel(openIssues, "open", "open")}` : "None open",
      tone: openIssues ? "text-amber-800" : "text-muted-foreground",
    },
    {
      to: "/app/decisions" as const,
      icon: Gavel,
      label: "Decision",
      detail: decisionsPending
        ? `${countLabel(decisionsPending, "awaiting", "awaiting")}`
        : "None awaiting",
      tone: decisionsPending ? "text-violet-800" : "text-muted-foreground",
    },
  ];

  const summary = [
    countLabel(openRisks, "risk", "risks"),
    countLabel(actionsOpen, "action", "actions"),
    countLabel(openIssues, "issue", "issues"),
    countLabel(decisionsPending, "decision", "decisions"),
    demandPending
      ? `${countLabel(demandPending, "demand item", "demand items")} awaiting approval`
      : "no demand awaiting approval",
  ].join(" · ");

  return (
    <div className="mt-4 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {leads.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="group rounded-lg border border-border bg-background px-3 py-2.5 transition-colors hover:border-primary/35 hover:bg-primary/[0.03]"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <p className="text-[12px] font-semibold tracking-tight text-foreground">{item.label}</p>
              </div>
              <p className={`mt-1.5 text-[11px] leading-snug ${item.tone}`}>{item.detail}</p>
            </Link>
          );
        })}
      </div>
      <div className="rounded-lg border border-border/80 bg-muted/20 px-2.5 py-2">
        <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          RAID registers
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {raid.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="group rounded-md border border-transparent bg-background px-2.5 py-2 transition-colors hover:border-primary/35 hover:bg-primary/[0.03]"
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                  <p className="text-[12px] font-semibold tracking-tight text-foreground">{item.label}</p>
                </div>
                <p className={`mt-1 text-[11px] tabular-nums leading-snug ${item.tone}`}>{item.detail}</p>
              </Link>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{summary}</p>
    </div>
  );
}

export function ExecutiveQuickView({
  filtered,
  approvedFunding,
  totalIncurred,
  totalForecast,
  remaining,
  monthlySpend,
  segmentation,
  gates,
  monthly,
  loading,
  mode = "full",
  asksHost = null,
}: {
  filtered: BriefingProject[];
  approvedFunding: number;
  totalIncurred: number;
  totalForecast: number;
  remaining: number;
  monthlySpend: SpendPoint[];
  segmentation: NamedCount[];
  gates: BriefingGate[];
  monthly: MonthlyFinanceRow[];
  loading?: boolean;
  /** Steering: headline and questions. Asks portal to `asksHost` at the end of Cockpit. */
  mode?: "full" | "steering";
  asksHost?: HTMLElement | null;
}) {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const ids = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const [askKind, setAskKind] = useState<QuestionKind | null>(null);
  const [showTrend, setShowTrend] = useState(false);
  const [asksCollapsed, setAsksCollapsed] = useState(true);
  const asOf = new Date().toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const risksQ = useQuery({
    queryKey: ["risks", orgId, "exec-brief"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risks")
        .select("id,project_id,raid_code,title,status,severity,probability,impact,owner")
        .eq("org_id", orgId!);
      if (error && /raid_code/i.test(error.message)) {
        const retry = await supabase
          .from("risks")
          .select("id,project_id,title,status,severity,probability,impact,owner")
          .eq("org_id", orgId!);
        if (retry.error) throw retry.error;
        return (retry.data ?? []) as BriefingRisk[];
      }
      if (error) throw error;
      return (data ?? []) as BriefingRisk[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const decisionsQ = useQuery({
    queryKey: ["decisions", orgId, "exec-brief"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decisions")
        .select("id,project_id,raid_code,title,outcome,status,required_date,recommendation")
        .eq("org_id", orgId!);
      if (error && /raid_code/i.test(error.message)) {
        const retry = await supabase
          .from("decisions")
          .select("id,project_id,title,outcome,status,required_date,recommendation")
          .eq("org_id", orgId!);
        if (retry.error) throw retry.error;
        return (retry.data ?? []) as BriefingDecision[];
      }
      if (error) throw error;
      return (data ?? []) as BriefingDecision[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const workItemsQ = useQuery({
    queryKey: ["work_items", orgId, "portfolio-pulse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_items" as never)
        .select("id,project_id,status,percent_complete,estimate_hours")
        .eq("org_id", orgId!)
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const depsQ = useQuery({
    queryKey: ["dependencies", orgId, "portfolio-pulse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dependencies")
        .select("id,project_id,status,dep_type,needed_by")
        .eq("org_id", orgId!)
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const allocationsQ = useQuery({
    queryKey: ["resource_allocations", orgId, "portfolio-pulse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_allocations")
        .select("id,project_id,allocation_percent,allocated_hours")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const benefitsQ = useQuery({
    queryKey: ["benefits", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("benefits")
        .select("id,project_id,target_value,realised_value")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const changeRequestsQ = useQuery({
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

  const actionsQ = useQuery({
    queryKey: ["actions", orgId, "exec-brief"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("actions")
        .select("id,project_id,status")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const issuesQ = useQuery({
    queryKey: ["issues", orgId, "exec-brief"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issues")
        .select("id,project_id,status")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const demandQ = useQuery({
    queryKey: ["demand_pipeline", orgId, "exec-brief"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demand_pipeline")
        .select("id,status")
        .eq("org_id", orgId!);
      if (error) return [];
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const briefing = useMemo(
    () =>
      buildExecutiveBriefing({
        projects: filtered,
        gates,
        monthly: monthly.filter((m) => m.project_id && m.period_month),
        risks: (risksQ.data ?? []).filter((r) => ids.includes(r.project_id)),
        decisions: (decisionsQ.data ?? []).filter((d) => ids.includes(d.project_id)),
        workItems: (workItemsQ.data ?? []) as HealthEngineInput["workItems"],
        dependencies: (depsQ.data ?? []) as HealthEngineInput["dependencies"],
        allocations: (allocationsQ.data ?? []) as HealthEngineInput["allocations"],
        changeRequests: (changeRequestsQ.data ?? []) as HealthEngineInput["changeRequests"],
        benefitLines: (benefitsQ.data ?? []) as HealthEngineInput["benefitLines"],
      }),
    [
      filtered,
      gates,
      monthly,
      risksQ.data,
      decisionsQ.data,
      workItemsQ.data,
      depsQ.data,
      allocationsQ.data,
      changeRequestsQ.data,
      benefitsQ.data,
      ids,
    ],
  );

  const alignmentDollars = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((p) => {
      const k = projectPortfolio(p);
      m.set(k, (m.get(k) || 0) + projectApprovedFunding(p));
    });
    if (m.size === 0 && segmentation.length) {
      return segmentation.map((s) => ({ name: s.name, value: s.value }));
    }
    return Array.from(m, ([name, value]) => ({ name, value })).filter((r) => r.value > 0);
  }, [filtered, segmentation]);

  const spendOfBudget = pct(totalIncurred, approvedFunding);
  const facVsBudget = approvedFunding
    ? Math.round(((totalForecast - approvedFunding) / approvedFunding) * 100)
    : 0;

  const inFilter = (projectId?: string | null) => !projectId || ids.includes(projectId);
  const decisionsPending = (decisionsQ.data ?? []).filter(
    (d) => inFilter(d.project_id) && isDecisionAwaiting(d),
  ).length;
  const actionsOpen = (actionsQ.data ?? []).filter(
    (a: { project_id?: string; status?: string | null }) => inFilter(a.project_id) && isOpenRaid(a.status),
  ).length;
  const openRisks = (risksQ.data ?? []).filter((r) => inFilter(r.project_id) && isOpenRaid(r.status)).length;
  const openIssues = (issuesQ.data ?? []).filter(
    (i: { project_id?: string; status?: string | null }) => inFilter(i.project_id) && isOpenRaid(i.status),
  ).length;
  const demandPending = (demandQ.data ?? []).filter((d: { status?: string | null }) =>
    /^(idea|screening|business case|under review)$/i.test(String(d.status || "")),
  ).length;

  const shownAsks = askKind
    ? briefing.actions.filter((a) => a.kind === askKind)
    : briefing.actions;
  const primaryAsk = shownAsks[0];
  const restAsks = shownAsks.slice(1);

  if (loading) {
    return <PageLoading label="Loading executive snapshot…" fullScreen={false} />;
  }

  const coverAccent = RAG_COLORS[briefing.overallRag] || "var(--color-border)";

  const asksBody =
    shownAsks.length === 0 ? (
      <p className="py-4 text-sm text-muted-foreground">
        {askKind
          ? `Nothing in this filter for ${kindLabel(askKind).toLowerCase()}.`
          : "Nothing needs a steering decision in this filter."}
      </p>
    ) : (
      <div className="space-y-3">
        {primaryAsk ? (
          <article className="rounded-xl border border-border bg-background p-4 sm:p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {kindLabel(primaryAsk.kind)}
              </span>
              <RagChip rag={primaryAsk.severity} />
            </div>
            <h3 className="text-base font-semibold leading-snug text-foreground sm:text-lg">
              {primaryAsk.title}
            </h3>
            <p className="mt-1 text-sm">
              <Link
                to="/app/projects/$id"
                params={{ id: primaryAsk.projectId }}
                className="font-medium text-primary hover:underline"
              >
                {primaryAsk.projectLabel}
              </Link>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-foreground">{primaryAsk.why}</p>
            <p className="mt-3 text-sm font-medium text-foreground">Ask: {primaryAsk.ask}</p>
            {primaryAsk.amount ? (
              <p className="mt-1 text-sm tabular-nums text-red-600">
                {money(primaryAsk.amount)} exposure
              </p>
            ) : null}
          </article>
        ) : null}
        {restAsks.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {restAsks.map((a) => (
              <article key={a.id} className="rounded-lg border border-border bg-background p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {kindLabel(a.kind)}
                  </span>
                  <RagChip rag={a.severity} />
                </div>
                <div className="text-sm font-semibold leading-snug text-foreground">{a.title}</div>
                <p className="mt-1 text-xs">
                  <Link
                    to="/app/projects/$id"
                    params={{ id: a.projectId }}
                    className="text-primary hover:underline"
                  >
                    {a.projectLabel}
                  </Link>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-foreground">{a.why}</p>
                <p className="mt-2 text-xs font-medium text-foreground">Ask: {a.ask}</p>
                {a.amount ? (
                  <p className="mt-1 text-xs tabular-nums text-red-600">
                    {money(a.amount)} exposure
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    );

  const asksToolbar = (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      {askKind ? (
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setAskKind(null)}
        >
          Show all asks
        </button>
      ) : null}
    </div>
  );

  const asksHint = askKind
    ? `Showing ${kindLabel(askKind).toLowerCase()} items. Click the question again to show all.`
    : "Ranked by health, late gates, open risks, and decisions waiting on you.";

  const asksSection = (
    <SectionFrame exportName="cockpit-asks" exportTitle="Ask of this pack">
      {mode === "steering" ? (
        <ExpandablePanel
          id="pack-asks"
          title="Ask of this pack"
          collapsible
          collapsed={asksCollapsed}
          onCollapsedChange={setAsksCollapsed}
          collapsedSummary={`${briefing.actions.length} ranked ask${briefing.actions.length === 1 ? "" : "s"} · click Show or a question tile`}
          compactMaxHeightClass="max-h-[min(80vh,960px)]"
          toolbar={asksToolbar}
        >
          <p className="mb-3 text-xs text-muted-foreground">{asksHint}</p>
          {asksBody}
        </ExpandablePanel>
      ) : (
        <>
          <div id="pack-asks" className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <SectionTitle>Ask of this pack</SectionTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{asksHint}</p>
            </div>
            {asksToolbar}
          </div>
          {asksBody}
        </>
      )}
    </SectionFrame>
  );

  return (
    <div className="space-y-5">
      <div
        className="rounded-xl border border-border bg-surface px-4 py-5 sm:px-6"
        style={{ borderLeftWidth: 4, borderLeftColor: coverAccent }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Steering pack · as of {asOf}
            </p>
            {briefing.headlineSignals.length === 0 ? (
              <p className="mt-2 text-xl font-semibold leading-snug text-foreground sm:text-2xl">
                {briefing.headline}
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                {briefing.headlineSignals.map((signal) => (
                  <SteeringSignalCard key={signal.key} signal={signal} />
                ))}
              </div>
            )}
            <SteeringQuickLinks
              decisionsPending={decisionsPending}
              actionsOpen={actionsOpen}
              openRisks={openRisks}
              openIssues={openIssues}
              demandPending={demandPending}
            />
            <p className="mt-3 text-sm text-muted-foreground">
              {filtered.length} project{filtered.length === 1 ? "" : "s"} · spend {spendOfBudget} of
              budget · FAC {facVsBudget >= 0 ? "+" : ""}
              {facVsBudget}% vs envelope.
            </p>
          </div>
          <RagChip
            rag={briefing.overallRag}
            label={`${briefing.overallRag} · ${briefing.healthPct}%`}
            manual={briefing.ragManual}
            explain={explainRag({
              rag: briefing.overallRag,
              source: "pulse",
              score: briefing.healthPct,
              overridden: briefing.ragManual,
              extraBullets: [
                "Portfolio RAG uses each project's sponsor override when one is set, otherwise its Health Engine colour. M means at least one RAG is manually updated.",
                `Average calculated health score is ${briefing.healthPct}% (${briefing.calculatedRag} if overrides are ignored).`,
              ],
            })}
          />
        </div>
      </div>

      {mode === "full" ? (
        <div id="pack-money">
          <EnvelopeBullet
            budget={approvedFunding}
            incurred={totalIncurred}
            forecast={totalForecast}
          />
        </div>
      ) : null}

      {mode === "steering"
        ? asksHost
          ? createPortal(asksSection, asksHost)
          : null
        : asksSection}

      {mode === "full" ? (
      <SectionFrame>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <SectionTitle>On this pack</SectionTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Current Health Engine score and 30-day outlook per project. RAG uses a manual
              override when set (M).
            </p>
          </div>
          <Link
            to="/app/executive"
            className="text-xs font-medium text-primary hover:underline print:hidden"
          >
            Open detailed info
          </Link>
        </div>
        {briefing.pack.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No projects match the current filters.</p>
        ) : (
          <div className="st-table-wrap overflow-x-auto">
            <table className="st-table w-full min-w-[1280px] text-xs">
              <thead>
                <tr>
                  <th className="text-left">Strategic Alignment</th>
                  <th className="text-left">Program</th>
                  <th className="text-left">Project</th>
                  <th className="text-left">Why</th>
                  <th className="text-left" title="Health Engine score and steering RAG">
                    Current
                  </th>
                  <th
                    className="text-left"
                    title="Health Engine 30-day outlook (forecast score and likely RAG)"
                  >
                    30 days prediction
                  </th>
                  <th className="text-right">Budget</th>
                  <th className="text-right">CapEx</th>
                  <th className="text-right">OpEx</th>
                  <th className="text-right">Incurred</th>
                  <th className="text-right">Remaining</th>
                  <th className="text-right">Forecast</th>
                </tr>
              </thead>
              <tbody>
                {briefing.pack.map((w) => {
                  const pred = w.engine.predictive;
                  return (
                    <tr key={w.project.id} className="hover:bg-muted/40">
                      <td className="text-left">{projectPortfolio(w.project)}</td>
                      <td className="text-left">{w.project.program || "—"}</td>
                      <td className="text-left">
                        <Link
                          to="/app/projects/$id"
                          params={{ id: w.project.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {w.project.project_code} · {w.project.name}
                        </Link>
                      </td>
                      <td className="max-w-[16rem] text-left text-muted-foreground">{w.topWhy}</td>
                      <td className="whitespace-nowrap text-left">
                        <span className="inline-flex items-center gap-1.5">
                          <RagChip
                            rag={w.rag}
                            manual={isRagOverridden(w.project)}
                            explain={explainRag({
                              rag: w.rag,
                              engine: isRagOverridden(w.project) ? null : w.engine,
                              source: isRagOverridden(w.project) ? "register" : undefined,
                              overridden: isRagOverridden(w.project),
                            })}
                          />
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums ${healthHeat(w.engine.score)}`}
                          >
                            {w.engine.score}
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-left">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums ${healthHeat(pred.forecastScore30d)}`}
                          >
                            {pred.forecastScore30d}
                          </span>
                          <RagChip
                            rag={pred.likelyRag}
                            explain={explainRag({ rag: pred.likelyRag, engine: w.engine })}
                          />
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{money(w.budget)}</td>
                      <td className="text-right tabular-nums">
                        {money(projectCapexApproved(w.project))}
                      </td>
                      <td className="text-right tabular-nums">
                        {money(projectOpexApproved(w.project))}
                      </td>
                      <td className="text-right tabular-nums">{money(w.incurred)}</td>
                      <td className="text-right tabular-nums">
                        {money(projectRemaining(w.project))}
                      </td>
                      <td className="text-right tabular-nums">
                        <span className={w.overrun > 0 ? "font-semibold text-red-600" : ""}>
                          {money(w.fac)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {briefing.pack.length > 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Current is today&apos;s Health Engine score and steering RAG. 30 days prediction is the
            30-day outlook (forecast score and likely RAG). Forecast over envelope is shown in red.
          </p>
        ) : null}
      </SectionFrame>
      ) : null}

      <div className="print:hidden">
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setShowTrend((v) => !v)}
        >
          {showTrend ? "Hide trend" : "Show trend"}
        </button>
      </div>

      {showTrend ? (
        <div
          className={mode === "steering" ? "grid gap-4" : "grid gap-4 lg:grid-cols-2"}
          data-export-hide
        >
          {monthlySpend.length === 0 ? (
            <SectionFrame>
              <SectionTitle>Spend vs forecast</SectionTitle>
              <p className="py-8 text-center text-sm text-muted-foreground">
                No monthly cashflow yet in this filter.
              </p>
            </SectionFrame>
          ) : (
            <ExpandableChart title="Spend vs forecast (last 12 months)" heightClass="h-48">
              <LineChart data={monthlySpend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={10} tickFormatter={(v) => `$${v}M`} />
                <Tooltip
                  formatter={(v: number | string, n: string | number) => [
                    `$${Number(v).toFixed(2)}M`,
                    String(n),
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#15803d"
                  strokeWidth={2.2}
                  name="Actual"
                  dot={{ r: 2.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="#d97706"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  name="Forecast"
                  dot={{ r: 2.5 }}
                />
              </LineChart>
            </ExpandableChart>
          )}

          {mode === "steering" ? null : alignmentDollars.length === 0 ? (
            <SectionFrame>
              <SectionTitle>Where the envelope sits</SectionTitle>
              <p className="py-8 text-center text-sm text-muted-foreground">No alignment $ yet</p>
            </SectionFrame>
          ) : (
            <ExpandableChart title="Envelope by Strategic Alignment" heightClass="h-56">
              <BarChart
                data={alignmentDollars}
                margin={{ top: 16, right: 12, left: 16, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis
                  dataKey="name"
                  interval={0}
                  minTickGap={0}
                  tick={<CategoryTick />}
                  height={44}
                />
                <YAxis fontSize={10} tickFormatter={(v) => money(Number(v))} />
                <Tooltip formatter={(v: number | string) => money(Number(v))} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Budget">
                  {alignmentDollars.map((_, i) => (
                    <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ExpandableChart>
          )}
        </div>
      ) : null}
    </div>
  );
}
