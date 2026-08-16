import { useMemo } from "react";
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
import { SectionFrame, SectionTitle, RagChip, KpiCard } from "@/components/streamlit";
import { ExpandableChart } from "@/components/expandable-chart";
import { CHART_SERIES } from "@/lib/chart-theme";
import { PageLoading } from "@/components/page-loading";
import { projectApprovedFunding } from "@/lib/project-finance";
import { explainRag } from "@/lib/explain-metric";
import { isRagOverridden } from "@/lib/ops-enhancements";
import { EnvelopeBullet } from "@/components/envelope-bullet";
import {
  buildExecutiveBriefing,
  type BriefingDecision,
  type BriefingGate,
  type BriefingProject,
  type BriefingRisk,
} from "@/lib/executive-briefing";
import type { HealthEngineInput } from "@/lib/project-health-engine";
import type { MonthlyFinanceRow } from "@/lib/finance-lifecycle";

type SpendPoint = { month: string; actual: number; forecast: number };
type NamedCount = { name: string; value: number };

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

function ragBanner(rag: string) {
  if (rag === "Red") return "border-red-300 bg-red-50";
  if (rag === "Amber") return "border-amber-300 bg-amber-50";
  return "border-emerald-300 bg-emerald-50";
}

function kindLabel(kind: string) {
  if (kind === "decision") return "Decide";
  if (kind === "money") return "Money";
  if (kind === "schedule") return "Time";
  if (kind === "risk") return "Risk";
  return "Health";
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

  if (loading) {
    return <PageLoading label="Loading executive snapshot…" fullScreen={false} />;
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border px-4 py-4 sm:px-5 ${ragBanner(briefing.overallRag)}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Steering snapshot
            </div>
            <p className="text-lg font-semibold leading-snug text-foreground sm:text-xl">
              {briefing.headline}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered.length} project{filtered.length === 1 ? "" : "s"} · spend {spendOfBudget} of
              budget · FAC {facVsBudget >= 0 ? "+" : ""}
              {facVsBudget}% vs envelope.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Do you need to decide?"
          value={String(briefing.decisionsWaiting)}
          sub={briefing.decisionsWaiting ? "Waiting on steering" : "Nothing in the queue"}
          accent={briefing.decisionsWaiting ? "#d97706" : "#15803d"}
          explain={briefing.questionExplains.decisions}
        />
        <KpiCard
          label="Is the money still inside the envelope?"
          value={money(totalForecast)}
          sub={
            briefing.moneyAtRisk > 0
              ? `${money(briefing.moneyAtRisk)} above budget`
              : `${money(remaining)} still unspent`
          }
          accent={briefing.moneyAtRisk > 0 ? "#dc2626" : "#1d4ed8"}
          explain={briefing.questionExplains.money}
        />
        <KpiCard
          label="Are we on time?"
          value={String(briefing.lateGateCount + briefing.overdueCount)}
          sub={`${briefing.lateGateCount} late gates · ${briefing.overdueCount} overdue`}
          accent={briefing.lateGateCount || briefing.overdueCount ? "#dc2626" : "#15803d"}
          explain={briefing.questionExplains.time}
        />
        <KpiCard
          label="What could still hurt us?"
          value={String(briefing.criticalRisks)}
          sub={briefing.criticalRisks ? "Open critical risks" : "No critical risks open"}
          explain={briefing.questionExplains.risk}
          accent={briefing.criticalRisks ? "#dc2626" : "#15803d"}
        />
      </div>

      <SectionFrame>
        <div className="mb-3 flex items-end justify-between gap-2">
          <div>
            <SectionTitle>Ask of this pack</SectionTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ranked by the health engine, late gates, open risks, and decisions waiting on you.
            </p>
          </div>
          <Link
            to="/app/executive-intelligence"
            className="text-sm font-medium text-primary hover:underline"
          >
            More intelligence
          </Link>
        </div>
        {briefing.actions.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nothing needs a steering decision in this filter.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {briefing.actions.map((a) => (
              <Link
                key={a.id}
                to="/app/projects/$id"
                params={{ id: a.projectId }}
                className="rounded-lg border border-border bg-background p-3 transition hover:border-primary/40 hover:shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {kindLabel(a.kind)}
                  </span>
                  <RagChip rag={a.severity} />
                </div>
                <div className="text-sm font-semibold leading-snug text-foreground">{a.title}</div>
                <p className="mt-1 text-xs text-muted-foreground">{a.projectLabel}</p>
                <p className="mt-2 text-xs leading-relaxed text-foreground">{a.why}</p>
                <p className="mt-2 text-xs font-medium text-primary">Ask: {a.ask}</p>
                {a.amount ? (
                  <p className="mt-1 text-xs tabular-nums text-red-600">
                    {money(a.amount)} exposure
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Money at a glance</SectionTitle>
        <EnvelopeBullet
          budget={approvedFunding}
          incurred={totalIncurred}
          forecast={totalForecast}
        />
      </SectionFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        {monthlySpend.length === 0 ? (
          <SectionFrame>
            <SectionTitle>Spend vs forecast</SectionTitle>
            <p className="py-8 text-center text-sm text-muted-foreground">
              No monthly cashflow yet
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

      <SectionFrame>
        <div className="mb-2 flex items-end justify-between gap-2">
          <div>
            <SectionTitle>Watch list — why it is on the pack</SectionTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              RAG is the sponsor override when one is set (marked M); otherwise Health Engine colour.
              Health score stays calculated.
            </p>
          </div>
          <Link
            to="/app/executive"
            search={{ tab: "overview" }}
            className="text-sm font-medium text-primary hover:underline"
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
                  <th className="text-left">Project</th>
                  <th className="text-left">RAG</th>
                  <th className="text-left">Health</th>
                  <th className="text-right">Forecast vs budget</th>
                  <th className="text-left">Why it is here</th>
                </tr>
              </thead>
              <tbody>
                {briefing.watch.map((w) => (
                  <tr key={w.project.id}>
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
                    <td className="text-left">
                      <span className="inline-flex items-center gap-2">
                        <RagChip rag={w.engine.rag} />
                        <span className="tabular-nums text-muted-foreground">{w.engine.score}</span>
                      </span>
                    </td>
                    <td className="text-right tabular-nums">
                      <span className={w.overrun > 0 ? "font-semibold text-red-600" : ""}>
                        {w.overrun > 0 ? `+${money(w.overrun)}` : money(0)}
                      </span>
                    </td>
                    <td className="text-left text-muted-foreground">{w.topWhy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </div>
  );
}
