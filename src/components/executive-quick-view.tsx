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
import { CategoryTick } from "@/components/chart-category-tick";
import { CHART_SERIES, RAG_COLORS } from "@/lib/chart-theme";
import { PageLoading } from "@/components/page-loading";
import {
  projectApprovedFunding,
  projectCapexApproved,
  projectOpexApproved,
  projectRemaining,
} from "@/lib/project-finance";
import { projectPortfolio } from "@/lib/project-health";
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

function healthHeat(score: number) {
  if (!Number.isFinite(score) || score <= 0) return "bg-muted text-muted-foreground";
  if (score >= 75) return "bg-emerald-50 text-emerald-800";
  if (score >= 50) return "bg-amber-50 text-amber-900";
  return "bg-rose-50 text-rose-800";
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
  mode = "full",
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
  /** Steering: headline, questions, and asks. Money envelope, pack table, and alignment chart live on Cockpit. */
  mode?: "full" | "steering";
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

      {mode === "full" ? (
        <div id="pack-money">
          <EnvelopeBullet
            budget={approvedFunding}
            incurred={totalIncurred}
            forecast={totalForecast}
          />
        </div>
      ) : null}

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
              to="/app/executive-cockpit"
              search={{ section: "summaries" }}
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
                    30d
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
            Current is today&apos;s Health Engine score and steering RAG. 30d is the 30-day outlook
            (forecast score and likely RAG). Forecast over envelope is shown in red.
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
