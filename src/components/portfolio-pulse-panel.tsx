/**
 * Portfolio Pulse — event-driven portfolio health + weekly change digest.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PROJECT_PORTFOLIO_SELECT } from "@/lib/project-selects";
import { FINANCIALS_MONTHLY_SELECT } from "@/lib/query-selects";
import { MAX_PAGE_SIZE } from "@/lib/portfolio-paging";
import { SectionFrame, SectionTitle, RagChip } from "@/components/streamlit";
import { explainRag } from "@/lib/explain-metric";
import { PageLoading } from "@/components/page-loading";
import {
  ExecutivePortfolioFilters,
  applyExecutivePortfolioFilters,
  emptyExecutiveFilters,
  executiveFilterScopeKey,
  type ExecutivePortfolioFilterState,
} from "@/components/portfolio-filters";
import {
  evaluatePortfolioPulse,
  maybeRefreshPulseSnapshot,
  pulseRagEmoji,
  pulseTrendGlyph,
  type PulseTrend,
} from "@/lib/portfolio-pulse";
import { ExecutiveFocusArea } from "@/components/executive-focus-area";

function groupByProjectId<T extends { project_id?: string | null }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.project_id) continue;
    const list = m.get(r.project_id) || [];
    list.push(r);
    m.set(r.project_id, list);
  }
  return m;
}

function TrendCell({ trend }: { trend: PulseTrend }) {
  const color =
    trend === "up"
      ? "text-emerald-600"
      : trend === "down"
        ? "text-rose-600"
        : "text-muted-foreground";
  return <span className={`text-base font-semibold ${color}`}>{pulseTrendGlyph(trend)}</span>;
}

export function PortfolioPulsePanel({
  compact = false,
  showTitle = true,
  showFilters = true,
}: {
  compact?: boolean;
  showTitle?: boolean;
  /** Same portfolio filters as Executive Dashboard (default on). */
  showFilters?: boolean;
}) {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const fyStartMonth = organization?.fy_start_month || 4;
  const [filters, setFilters] = useState<ExecutivePortfolioFilterState>(emptyExecutiveFilters);

  const projectsQ = useQuery({
    queryKey: ["projects", orgId, "portfolio-pulse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(PROJECT_PORTFOLIO_SELECT as "*")
        .eq("org_id", orgId!)
        .order("updated_at", { ascending: false })
        .limit(MAX_PAGE_SIZE);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const workItemsQ = useQuery({
    queryKey: ["work_items", orgId, "portfolio-pulse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_items" as any)
        .select("id,project_id,status,percent_complete,estimate_hours")
        .eq("org_id", orgId!)
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const gatesQ = useQuery({
    queryKey: ["stage_gates", orgId, "portfolio-pulse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gates")
        .select("id,project_id,stream_id,gate_name,planned_date,actual_date,status")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const risksQ = useQuery({
    queryKey: ["risks", orgId, "portfolio-pulse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risks")
        .select("id,project_id,status,severity,probability,impact,updated_at")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const depsQ = useQuery({
    queryKey: ["dependencies", orgId, "portfolio-pulse"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dependencies")
        .select("id,project_id,status,dep_type,needed_by")
        .eq("org_id", orgId!)
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const decisionsQ = useQuery({
    queryKey: ["decisions", orgId, "portfolio-pulse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decisions")
        .select("id,project_id,outcome,status,decision_date,updated_at")
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
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const monthlyQ = useQuery({
    queryKey: ["financials_monthly", orgId, "portfolio-pulse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financials_monthly")
        .select(FINANCIALS_MONTHLY_SELECT as "*")
        .eq("org_id", orgId!)
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const fyAllocQ = useQuery({
    queryKey: ["fy_allocations", orgId, "health"],
    queryFn: async () =>
      (
        await supabase
          .from("fy_allocations")
          .select("id,project_id,fy,budget,forecast,capex,opex,benefits")
          .eq("org_id", orgId!)
          .limit(10000)
      ).data ?? [],
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

  const loading =
    !!orgId &&
    (projectsQ.isLoading ||
      workItemsQ.isLoading ||
      gatesQ.isLoading ||
      risksQ.isLoading ||
      decisionsQ.isLoading);

  const filteredProjects = useMemo(() => {
    const all = projectsQ.data ?? [];
    return applyExecutivePortfolioFilters(all, filters, fyStartMonth, {
      gates: gatesQ.data ?? [],
      fyAllocations: (fyAllocQ.data ?? []) as any[],
    });
  }, [projectsQ.data, filters, fyStartMonth, gatesQ.data, fyAllocQ.data]);

  const snapshotScope = useMemo(() => executiveFilterScopeKey(filters), [filters]);

  const evaluated = useMemo(() => {
    if (!orgId || !projectsQ.data) return null;
    const wiBy = groupByProjectId(workItemsQ.data ?? []);
    const gatesBy = groupByProjectId(gatesQ.data ?? []);
    const risksBy = groupByProjectId(risksQ.data ?? []);
    const depsBy = groupByProjectId(depsQ.data ?? []);
    const allocBy = groupByProjectId(allocationsQ.data ?? []);
    const monthlyBy = groupByProjectId(monthlyQ.data ?? []);
    const benefitsBy = groupByProjectId(benefitsQ.data ?? []);
    const crsBy = groupByProjectId(changeRequestsQ.data ?? []);
    const fyBy = groupByProjectId((fyAllocQ.data ?? []) as { project_id?: string | null }[]);
    const idSet = new Set(filteredProjects.map((p) => p.id as string));

    const projects = filteredProjects.map((p) => ({
      project: p,
      workItems: wiBy.get(p.id) || [],
      gates: gatesBy.get(p.id) || [],
      risks: risksBy.get(p.id) || [],
      dependencies: depsBy.get(p.id) || [],
      allocations: allocBy.get(p.id) || [],
      monthly: monthlyBy.get(p.id) || [],
      benefitLines: benefitsBy.get(p.id) || [],
      changeRequests: crsBy.get(p.id) || [],
      fyAllocations: fyBy.get(p.id) || [],
    }));

    const allRisks = (risksQ.data ?? []).filter((r) => idSet.has(r.project_id));
    const allDecisions = (decisionsQ.data ?? []).filter((d) => idSet.has(d.project_id));

    return evaluatePortfolioPulse({
      orgId,
      projects,
      allRisks,
      allDecisions,
      snapshotScope,
      fyStartMonth,
    });
  }, [
    orgId,
    projectsQ.data,
    filteredProjects,
    workItemsQ.data,
    gatesQ.data,
    risksQ.data,
    depsQ.data,
    allocationsQ.data,
    monthlyQ.data,
    benefitsQ.data,
    changeRequestsQ.data,
    fyAllocQ.data,
    decisionsQ.data,
    snapshotScope,
    fyStartMonth,
  ]);

  useEffect(() => {
    if (!evaluated) return;
    maybeRefreshPulseSnapshot(evaluated.snapshot, Date.now(), evaluated.snapshotScope);
  }, [evaluated]);

  if (!orgId) return null;
  if (loading && !evaluated) {
    return <PageLoading label="Loading portfolio pulse…" />;
  }
  if (!evaluated) return null;

  const { pulse } = evaluated;
  const comparedLabel = pulse.comparedToAt
    ? `vs ${new Date(pulse.comparedToAt).toLocaleDateString()}`
    : "baseline will lock after this visit";

  return (
    <>
      {showFilters ? (
        <SectionFrame className="section-frame--filters" exportable={false}>
          <ExecutivePortfolioFilters
            projects={projectsQ.data ?? []}
            value={filters}
            onChange={setFilters}
            fyStartMonth={fyStartMonth}
          />
        </SectionFrame>
      ) : null}

      <SectionFrame exportName="portfolio-pulse" exportTitle="Portfolio Pulse">
        {showTitle ? (
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <SectionTitle>
                <span className="inline-flex items-center gap-2">
                  <Activity className="h-4 w-4 text-sky-600" />
                  Portfolio Pulse
                </span>
              </SectionTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Event-driven portfolio health — not a static register. Across {pulse.projectCount}{" "}
                project{pulse.projectCount === 1 ? "" : "s"}
                {filteredProjects.length !== (projectsQ.data?.length ?? 0)
                  ? ` (filtered from ${projectsQ.data?.length ?? 0})`
                  : ""}
                .
              </p>
            </div>
            {!compact ? (
              <Link
                to="/app/executive-cockpit"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open cockpit <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <Link
                to="/app/portfolio-pulse"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Full pulse <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        ) : null}

        <div
          className={`grid gap-4 ${compact ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]"}`}
        >
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/20 px-4 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Portfolio Health
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums">{pulse.healthPct}%</span>
              <span className="text-2xl" aria-hidden>
                {pulseRagEmoji(pulse.rag)}
              </span>
            </div>
            <div className="mt-2">
              <RagChip
                rag={pulse.rag}
                label={pulse.rag}
                manual={pulse.ragManual}
                explain={explainRag({
                  rag: pulse.rag,
                  source: "pulse",
                  score: pulse.healthPct,
                  overridden: pulse.ragManual,
                  extraBullets: pulse.areas
                    .map((a) => `${a.label} ${a.score}/100 (${a.status})`)
                    .concat(
                      pulse.ragManual
                        ? [
                            "M means a project RAG was updated manually. That colour is used here instead of calculated health for those projects.",
                          ]
                        : [],
                    ),
                })}
              />
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">{comparedLabel}</p>
            {pulse.ragManual ? (
              <p className="mt-1 text-center text-[11px] text-muted-foreground">
                M = manually updated RAG. Portfolio Health uses that colour for those projects.
              </p>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Area</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-center">Trend</th>
                  {!compact ? <th className="px-3 py-2 text-right">Score</th> : null}
                </tr>
              </thead>
              <tbody>
                {pulse.areas.map((a) => (
                  <tr key={a.key} className="border-t">
                    <td className="px-3 py-2 font-medium">{a.label}</td>
                    <td className="px-3 py-2">
                      <span className="mr-1.5" aria-hidden>
                        {pulseRagEmoji(a.status)}
                      </span>
                      <RagChip
                        rag={a.status}
                        explain={explainRag({
                          rag: a.status,
                          source: "pulse",
                          score: a.score,
                          extraBullets: [
                            `${a.label} is the average Health Engine ${a.label.toLowerCase()} dimension across in-scope projects.`,
                            a.delta
                              ? `Week-on-week change: ${a.delta > 0 ? "+" : ""}${a.delta} points.`
                              : "No week-on-week change recorded.",
                          ],
                        })}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <TrendCell trend={a.trend} />
                    </td>
                    {!compact ? (
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {a.score}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What changed this week?
            </div>
            <ul className="mt-2 space-y-1.5">
              {pulse.week.bullets.map((b) => (
                <li key={b} className="flex gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <Link to="/app/risks" className="text-primary hover:underline">
                Risks
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link to="/app/decisions" className="text-primary hover:underline">
                Decisions
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link to="/app/project-infographic" className="text-primary hover:underline">
                Project health
              </Link>
            </div>
          </div>
        </div>
      </SectionFrame>

      {!compact ? (
        <ExecutiveFocusArea
          projects={filteredProjects}
          gates={(gatesQ.data ?? []).filter((g: { project_id?: string }) =>
            filteredProjects.some((p) => p.id === g.project_id),
          )}
          monthly={monthlyQ.data ?? []}
        />
      ) : null}
    </>
  );
}
