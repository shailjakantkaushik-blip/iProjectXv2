import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { ExpandableChart } from "@/components/expandable-chart";
import { CHART_SERIES, RAG_COLORS } from "@/lib/chart-theme";
import { PageLoading } from "@/components/page-loading";
import { projectApprovedFunding } from "@/lib/project-finance";
import { explainRag } from "@/lib/explain-metric";
import { isRagOverridden } from "@/lib/ops-enhancements";
import { EnvelopeBullet } from "@/components/envelope-bullet";
import { ExplainThis } from "@/components/explain-this";
import {
  buildExecutiveBriefing,
  type BriefingAction,
  type BriefingDecision,
  type BriefingGate,
  type BriefingProject,
  type BriefingRisk,
} from "@/lib/executive-briefing";
import type { HealthEngineInput } from "@/lib/project-health-engine";
import type { MonthlyFinanceRow } from "@/lib/finance-lifecycle";
import type { MetricExplanation } from "@/lib/explain-metric";

type SpendPoint = { month: string; actual: number; forecast: number };
type NamedCount = { name: string; value: number };
type QuestionKind = BriefingAction["kind"];

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

function kindLabel(kind: string) {
  if (kind === "decision") return "Decide";
  if (kind === "money") return "Money";
  if (kind === "schedule") return "Time";
  if (kind === "risk") return "Risk";
  return "Health";
}

function QuestionPanel({
  question,
  answer,
  detail,
  active,
  explain,
  onSelect,
}: {
  question: string;
  answer: string;
  detail: string;
  active: boolean;
  explain?: MetricExplanation | null;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`cursor-pointer rounded-lg border px-3 py-3 text-left transition-colors ${
        active
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-background hover:border-primary/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-foreground">{question}</p>
        {explain ? (
          <span onClick={(e) => e.stopPropagation()}>
            <ExplainThis explanation={explain} size="xs" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{answer}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
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
}) {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const ids = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const [askKind, setAskKind] = useState<QuestionKind | null>(null);
  const [showTrend, setShowTrend] = useState(false);
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
        .eq("org_id", orgId!);
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
        .select("id,project_id,status,rag,due_date,dependency_type")
        .eq("org_id", orgId!);
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
      ids,
    ],
  );

  const alignmentDollars = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((p) => {
      const k = p.portfolio || "Unassigned";
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

  const shownAsks = askKind
    ? briefing.actions.filter((a) => a.kind === askKind)
    : briefing.actions;
  const primaryAsk = shownAsks[0];
  const restAsks = shownAsks.slice(1);

  const selectQuestion = (kind: QuestionKind) => {
    setAskKind((prev) => (prev === kind ? null : kind));
    const target = kind === "money" ? "pack-money" : "pack-asks";
    requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  if (loading) {
    return <PageLoading label="Loading executive snapshot…" fullScreen={false} />;
  }

  const coverAccent = RAG_COLORS[briefing.overallRag] || "var(--color-border)";

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
            <p className="mt-2 text-xl font-semibold leading-snug text-foreground sm:text-2xl">
              {briefing.headline}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
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

      <div className="grid gap-3 sm:grid-cols-2">
        <QuestionPanel
          question="Do you need to decide?"
          answer={String(briefing.decisionsWaiting)}
          detail={
            briefing.decisionsWaiting ? "Waiting on steering" : "Nothing in the queue in this filter."
          }
          active={askKind === "decision"}
          explain={briefing.questionExplains.decisions}
          onSelect={() => selectQuestion("decision")}
        />
        <QuestionPanel
          question="Is the money still inside the envelope?"
          answer={money(totalForecast)}
          detail={
            briefing.moneyAtRisk > 0
              ? `${money(briefing.moneyAtRisk)} above budget`
              : `${money(remaining)} still unspent`
          }
          active={askKind === "money"}
          explain={briefing.questionExplains.money}
          onSelect={() => selectQuestion("money")}
        />
        <QuestionPanel
          question="Are we on time?"
          answer={String(briefing.lateGateCount + briefing.overdueCount)}
          detail={`${briefing.lateGateCount} late gates · ${briefing.overdueCount} overdue`}
          active={askKind === "schedule"}
          explain={briefing.questionExplains.time}
          onSelect={() => selectQuestion("schedule")}
        />
        <QuestionPanel
          question="What could still hurt us?"
          answer={String(briefing.criticalRisks)}
          detail={briefing.criticalRisks ? "Open critical risks" : "No critical risks open in this filter."}
          active={askKind === "risk"}
          explain={briefing.questionExplains.risk}
          onSelect={() => selectQuestion("risk")}
        />
      </div>

      <div id="pack-money">
        <EnvelopeBullet
          budget={approvedFunding}
          incurred={totalIncurred}
          forecast={totalForecast}
        />
      </div>

      <SectionFrame>
        <div id="pack-asks" className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <SectionTitle>Ask of this pack</SectionTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {askKind
                ? `Showing ${kindLabel(askKind).toLowerCase()} items. Click the question again to show all.`
                : "Ranked by health, late gates, open risks, and decisions waiting on you."}
            </p>
          </div>
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
            <Link
              to="/app/executive"
              search={{ tab: "summaries" }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Project summaries
            </Link>
          </div>
        </div>
        {shownAsks.length === 0 ? (
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
        )}
      </SectionFrame>

      <SectionFrame>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <SectionTitle>On this pack</SectionTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Why each project is here. RAG uses a manual override when set (M).
            </p>
          </div>
          <Link
            to="/app/executive"
            search={{ tab: "overview" }}
            className="text-xs font-medium text-primary hover:underline print:hidden"
          >
            Open detailed info
          </Link>
        </div>
        {briefing.watch.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Nothing Red, Amber, overdue, or over envelope in this filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="st-table text-sm">
              <thead>
                <tr>
                  <th className="text-left">Why it is here</th>
                  <th className="text-left">Project</th>
                  <th className="text-left">RAG</th>
                  <th className="text-right">Health</th>
                  <th className="text-right">Forecast vs budget</th>
                </tr>
              </thead>
              <tbody>
                {briefing.watch.map((w) => (
                  <tr key={w.project.id} className="hover:bg-muted/40">
                    <td className="text-left text-foreground">{w.topWhy}</td>
                    <td className="text-left">
                      <Link
                        to="/app/projects/$id"
                        params={{ id: w.project.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {w.project.project_code} · {w.project.name}
                      </Link>
                    </td>
                    <td className="text-left">
                      <RagChip rag={w.rag} manual={isRagOverridden(w.project)} />
                    </td>
                    <td className="text-right tabular-nums text-muted-foreground">{w.engine.score}</td>
                    <td className="text-right tabular-nums">
                      <span className={w.overrun > 0 ? "font-semibold text-red-600" : ""}>
                        {w.overrun > 0 ? `+${money(w.overrun)}` : money(0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>

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
        <div className="grid gap-4 lg:grid-cols-2" data-export-hide>
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

          {alignmentDollars.length === 0 ? (
            <SectionFrame>
              <SectionTitle>Where the envelope sits</SectionTitle>
              <p className="py-8 text-center text-sm text-muted-foreground">No alignment $ yet</p>
            </SectionFrame>
          ) : (
            <ExpandableChart title="Envelope by Strategic Alignment" heightClass="h-48">
              <BarChart data={alignmentDollars} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis dataKey="name" fontSize={11} />
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
