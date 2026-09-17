import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  LabelList,
} from "recharts";
import { SectionFrame, SectionTitle, RagChip } from "@/components/streamlit";
import { isRagOverridden } from "@/lib/ops-enhancements";
import { useShownRag } from "@/components/engine-rag-provider";
import { ChartLegendList, legendItemsFromCounts } from "@/components/chart-legend-list";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { exportElementPDF } from "@/components/page-export";
import { ExpandableChart } from "@/components/expandable-chart";
import { CategoryTick } from "@/components/chart-category-tick";
import { ExpandablePanel } from "@/components/expandable-panel";
import { RAG_COLORS, PRIORITY_COLORS, CHART_SERIES } from "@/lib/chart-theme";
import { PageLoading } from "@/components/page-loading";
import { QueryErrorPanel } from "@/components/query-error-panel";
import { SoftUpdatingLabel } from "@/components/soft-updating";
import { isColdLoading, logQueryError, queryErrorMessage } from "@/lib/query-ui";
import {
  matchPhase,
  normLabel,
  resolveCurrentStage as resolveStageShared,
} from "@/lib/project-phase";
import { portfolioSegmentLabels, projectPortfolio } from "@/lib/project-health";
import {
  computeEngineHealth,
  groupRowsByProjectId,
  useHealthEngineLookups,
} from "@/hooks/use-health-engine-lookups";
import { parentEnvelopeContext } from "@/lib/hierarchy-envelope";
import {
  projectApprovedFunding,
  projectForecast,
  projectIncurred,
  projectRemaining,
  projectRealisedRoi,
} from "@/lib/project-finance";
import { fyScopedBudget, monthlyInFyLabels } from "@/lib/fy-allocation-scope";
import {
  expandProjectsToTimelineLanes,
  fetchOrgStreams,
  formatProjectStreamRef,
  formatStreamLabel,
  normalizeTimelineLaneDates,
} from "@/lib/project-streams";
import { computeTimelineBounds, GanttGroup } from "@/components/portfolio-timeline";
import {
  ExecutivePortfolioFilters,
  applyExecutivePortfolioFilters,
  emptyExecutiveFilters,
  type ExecutivePortfolioFilterState,
} from "@/components/portfolio-filters";
import { unwrapList } from "@/lib/query";
import { listPortfolioProjects } from "@/lib/portfolio.functions";
import { useProjectVisibility } from "@/hooks/use-project-visibility";
import { MAX_PAGE_SIZE } from "@/lib/portfolio-paging";
import { ExplainThis } from "@/components/explain-this";
import {
  explainActualSpend,
  explainBudget,
  explainForecast,
  explainGeneric,
  explainRag,
  explainRemaining,
  type MetricExplanation,
} from "@/lib/explain-metric";
import type { MonthlyFinanceRow } from "@/lib/finance-lifecycle";
import {
  FINANCIALS_MONTHLY_SELECT,
  FINANCIALS_MONTHLY_SELECT_MIN,
  STAGE_GATE_DEFINITIONS_SELECT,
} from "@/lib/query-selects";
import { fetchStageGates } from "@/lib/stage-gates";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/executive")({
  validateSearch: (s: Record<string, unknown>): { _steer?: "pack" | "summaries" } => {
    const raw = String(s.tab || "");
    if (raw === "quick") return { _steer: "pack" };
    if (raw === "summaries") return { _steer: "summaries" };
    return {};
  },
  beforeLoad: ({ search }) => {
    if (search._steer === "summaries") {
      throw redirect({
        to: "/app/executive-cockpit",
        search: { section: "summaries" },
      });
    }
    if (search._steer === "pack") {
      throw redirect({ to: "/app/executive-cockpit" });
    }
  },
  component: ExecutiveDashboard,
});

const PHASES = ["Idea", "Discovery", "Design", "Build", "Test", "Deploy", "Benefits"];
const THEME_PALETTE = CHART_SERIES;
const CAPEX_COLORS = [CHART_SERIES[0], CHART_SERIES[1], CHART_SERIES[2], CHART_SERIES[3]];

const INACTIVE_STATUSES = new Set(["completed", "cancelled", "canceled", "closed", "archived"]);

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}
function moneyM(n: number) {
  return `$${(n / 1e6).toFixed(1)}M`;
}

function ExecutiveDashboard() {
  const { organization, user } = useAuth();
  const { filterProjects } = useProjectVisibility();
  const shownRagOf = useShownRag();
  const qc = useQueryClient();
  const listProjects = useServerFn(listPortfolioProjects);
  const [filters, setFilters] = useState<ExecutivePortfolioFilterState>(emptyExecutiveFilters);
  const { fySelected } = filters;
  type TimelineView =
    "Portfolio" | "Program" | "Health" | "Priority" | "Theme" | "Sponsor" | "Status";
  const [timelineView, setTimelineView] = useState<TimelineView>("Program");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showProjectTimeline, setShowProjectTimeline] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const projectsQ = useQuery({
    queryKey: ["projects", organization?.id, "executive", user?.id],
    queryFn: async () => {
      try {
        const page = await listProjects({
          data: {
            orgId: organization!.id,
            offset: 0,
            limit: MAX_PAGE_SIZE,
          },
        });
        return page.rows as any[];
      } catch (err) {
        logQueryError("executive.projects", err);
        throw new Error(queryErrorMessage(err));
      }
    },
    enabled: !!organization,
    staleTime: 60_000,
  });

  const gatesQ = useQuery({
    // Must include stream_id — shared cache key with other pages; omitting it
    // hides diamonds on stream lanes until a hard reload.
    queryKey: ["stage_gates", organization?.id],
    queryFn: fetchStageGates,
    enabled: !!organization,
  });

  const streamsQ = useQuery({
    queryKey: ["project_streams", organization?.id],
    queryFn: async () => {
      try {
        return await fetchOrgStreams(organization!.id);
      } catch (err) {
        logQueryError("executive.project_streams", err);
        throw new Error(queryErrorMessage(err));
      }
    },
    enabled: !!organization?.id,
  });

  const gateDefsQ = useQuery({
    queryKey: ["stage_gate_definitions", organization?.id],
    queryFn: async () => {
      try {
        return unwrapList(
          await supabase
            .from("stage_gate_definitions")
            .select(STAGE_GATE_DEFINITIONS_SELECT as "*")
            .eq("org_id", organization!.id)
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
        );
      } catch (err) {
        logQueryError("executive.stage_gate_definitions", err);
        throw new Error(queryErrorMessage(err));
      }
    },
    enabled: !!organization,
  });

  const monthlyQ = useQuery({
    queryKey: ["financials_monthly", organization?.id],
    queryFn: async () => {
      const full = await supabase
        .from("financials_monthly")
        .select(FINANCIALS_MONTHLY_SELECT as "*");
      if (!full.error) return full.data ?? [];
      logQueryError("financials_monthly.select", full.error);
      const min = await supabase
        .from("financials_monthly")
        .select(FINANCIALS_MONTHLY_SELECT_MIN as "*");
      if (!min.error) return min.data ?? [];
      logQueryError("financials_monthly.select.min", min.error);
      const star = await supabase.from("financials_monthly").select("*");
      if (star.error) {
        logQueryError("financials_monthly.select.*", star.error);
        throw new Error(queryErrorMessage(star.error));
      }
      return star.data ?? [];
    },
    enabled: !!organization,
  });

  const milestonesQ = useQuery({
    queryKey: ["milestones", organization?.id, "explain"],
    queryFn: async () =>
      (
        await supabase
          .from("milestones")
          .select("id,project_id,name,planned_date,actual_date,status")
      ).data ?? [],
    enabled: !!organization,
    staleTime: 60_000,
  });
  const otherCostsQ = useQuery({
    queryKey: ["opex_other_costs", organization?.id, "explain"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opex_other_costs" as any)
        .select("id,project_id,amount,category,vendor,description,period_month,cost_date");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!organization,
    staleTime: 60_000,
  });

  const projects = useMemo(
    () => filterProjects((projectsQ.data ?? []) as { id: string }[]),
    [projectsQ.data, filterProjects],
  );
  const gates = gatesQ.data ?? [];
  const streams = streamsQ.data ?? [];
  const gateDefs = gateDefsQ.data ?? [];
  const monthly = monthlyQ.data ?? [];
  const milestones = milestonesQ.data ?? [];
  const otherCosts = otherCostsQ.data ?? [];
  const healthLookups = useHealthEngineLookups(organization?.id);
  const parentCtx = useMemo(
    () => parentEnvelopeContext(projects as never, healthLookups.envelopeIndex),
    [projects, healthLookups.envelopeIndex],
  );
  const monthlyByProject = useMemo(
    () => groupRowsByProjectId(monthly as { project_id?: string | null }[]),
    [monthly],
  );
  const gatesByProject = useMemo(() => {
    const m = new Map<string, any[]>();
    (gates as any[]).forEach((g) => {
      const id = g?.project_id as string | undefined;
      if (!id) return;
      const list = m.get(id) || [];
      list.push(g);
      m.set(id, list);
    });
    return m;
  }, [gates]);
  // Cold load only — keep the dashboard visible while background refetch runs.
  // Projects + streams are required for the shell; gates/monthly degrade softly.
  const showColdLoad = isColdLoading(projectsQ) || isColdLoading(streamsQ);
  const softUpdating =
    projectsQ.isFetching ||
    gatesQ.isFetching ||
    streamsQ.isFetching ||
    gateDefsQ.isFetching ||
    monthlyQ.isFetching;
  const loadError = projectsQ.error || streamsQ.error;
  const softWarning =
    monthlyQ.error || gatesQ.error || gateDefsQ.error
      ? [
          monthlyQ.error ? `Financials: ${queryErrorMessage(monthlyQ.error)}` : null,
          gatesQ.error ? `Stage gates: ${queryErrorMessage(gatesQ.error)}` : null,
          gateDefsQ.error ? `Gate definitions: ${queryErrorMessage(gateDefsQ.error)}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : null;

  const retryAll = () => {
    void qc.invalidateQueries({ queryKey: ["projects", organization?.id] });
    void qc.invalidateQueries({ queryKey: ["stage_gates", organization?.id] });
    void qc.invalidateQueries({ queryKey: ["project_streams", organization?.id] });
    void qc.invalidateQueries({ queryKey: ["stage_gate_definitions", organization?.id] });
    void qc.invalidateQueries({ queryKey: ["financials_monthly", organization?.id] });
  };

  const fyStartMonth = organization?.fy_start_month || 4;

  const filtered = useMemo(
    () =>
      applyExecutivePortfolioFilters(projects, filters, fyStartMonth, {
        gates: gatesQ.data ?? [],
        fyAllocations: (healthLookups.fyAllocations ?? []) as any[],
      }),
    [projects, filters, fyStartMonth, gatesQ.data, healthLookups.fyAllocations],
  );

  const filteredIds = useMemo(() => new Set(filtered.map((p: any) => p.id as string)), [filtered]);

  /** Health Engine RAG (Green ≥ 80 / Amber 65–79 / Red < 65) — same as Cockpit health score. */
  const engineRagById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of filtered as any[]) {
      const id = String(p.id || "");
      if (!id) continue;
      const health = computeEngineHealth(
        p,
        (gatesByProject.get(id) || []) as never,
        healthLookups,
        (monthlyByProject.get(id) || []) as never,
        fyStartMonth,
        parentCtx,
      );
      m.set(id, health.overall_rag);
    }
    return m;
  }, [filtered, gatesByProject, monthlyByProject, healthLookups, fyStartMonth, parentCtx]);

  const engineRagOf = (p: { id?: string; project_id?: string }) =>
    engineRagById.get(String(p.project_id || p.id || "")) || null;

  // KPI totals + sparklines — memoized so filter typing doesn't rescan monthly ×8.
  const { approvedFunding, totalIncurred, totalForecast, remaining, kpis, ragData, capexBars } =
    useMemo(() => {
      const fyOn = fySelected.length > 0;
      const approvedFunding = fyOn
        ? filtered.reduce((s, p) => {
            const rows = (healthLookups.fyAllocations ?? []).filter(
              (a: any) => a.project_id === p.id,
            );
            return (
              s +
              fyScopedBudget({
                allocations: rows as any[],
                overallBudget: projectApprovedFunding(p),
                fySelected,
              })
            );
          }, 0)
        : filtered.reduce((s, p) => s + projectApprovedFunding(p), 0);
      let mAll = monthly.filter((m: any) => filteredIds.has(m.project_id)) as MonthlyFinanceRow[];
      if (fyOn) mAll = monthlyInFyLabels(mAll, fySelected, fyStartMonth);
      const totalIncurred = fyOn
        ? mAll.reduce((s, m) => s + Number(m.capex_actual || 0) + Number(m.opex_actual || 0), 0)
        : filtered.reduce((s, p) => s + projectIncurred(p), 0);
      const totalPlan = mAll.reduce(
        (s, m) => s + Number(m.capex_planned || 0) + Number(m.opex_planned || 0),
        0,
      );
      const totalForecast = fyOn
        ? mAll.reduce((s, m) => s + Number(m.capex_forecast || 0) + Number(m.opex_forecast || 0), 0)
        : filtered.reduce((s, p) => s + projectForecast(p), 0);
      const remaining = Math.max(0, approvedFunding - totalIncurred);
      const active = filtered.filter((p: any) => p.status === "In Progress").length;
      const completed = filtered.filter((p: any) => p.status === "Completed").length;
      const today = new Date();
      const overdue = filtered.filter(
        (p: any) => p.end_date && new Date(p.end_date) < today && p.status !== "Completed",
      ).length;
      const ragScore = filtered.length
        ? Math.round(
            (filtered.filter((p: any) => engineRagOf(p) === "Green").length / filtered.length) *
              100,
          )
        : 0;

      const buildSpark = (
        key: "capex_planned" | "capex_actual" | "capex_forecast" | "benefits_actual" | null,
        color: string,
      ) => {
        const rows = mAll;
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
        if (series.length < 6) {
          series = Array.from({ length: 12 }, (_, i) => ({ i, v: 0 }));
        }
        return { data: series, color };
      };

      const mRows = mAll;
      const ms = milestones.filter((m: any) => filteredIds.has(m.project_id));
      const gs = gates.filter((g: any) => filteredIds.has(g.project_id));
      const oc = otherCosts.filter((c: any) => filteredIds.has(c.project_id));

      const explainByLabel: Record<string, MetricExplanation> = {
        "Approved Funding": explainBudget({
          label: fyOn ? "FY allocation" : "Approved Funding",
          budget: approvedFunding,
          forecast: totalForecast,
          projects: filtered,
        }),
        Incurred: explainActualSpend({
          label: "Incurred",
          actual: totalIncurred,
          monthly: mRows,
          otherCosts: oc,
          projects: filtered,
        }),
        Forecast: explainForecast({
          label: "Forecast",
          currentForecast: totalForecast,
          monthly: mRows,
          milestones: ms,
          gates: gs,
          otherCosts: oc,
          projects: filtered,
        }),
        Remaining: explainRemaining({
          remaining,
          approved: approvedFunding,
          incurred: totalIncurred,
        }),
        Overdue: explainGeneric({
          label: "Overdue",
          value: overdue,
          headline: `${overdue} project${overdue === 1 ? "" : "s"} past planned end without completion`,
          bullets: [
            `${active} active · ${completed} completed`,
            "Overdue uses planned end date vs today for incomplete work",
          ],
        }),
        "RAG Score": explainGeneric({
          label: "RAG Score",
          value: `${ragScore}%`,
          headline: `${ragScore}% of filtered projects are Green on the Health Engine (same bands as Cockpit health score)`,
          bullets: [
            `Green ${filtered.filter((p: any) => engineRagOf(p) === "Green").length}`,
            `Amber ${filtered.filter((p: any) => engineRagOf(p) === "Amber").length}`,
            `Red ${filtered.filter((p: any) => engineRagOf(p) === "Red").length}`,
            "Green ≥ 80, Amber 65–79, Red < 65. Sponsor RAG override still shows on chips, not this mix.",
          ],
        }),
      };

      return {
        approvedFunding,
        totalIncurred,
        totalForecast,
        remaining,
        kpis: [
          {
            label: fyOn ? "FY allocation" : "Approved Funding",
            value: money(approvedFunding),
            spark: buildSpark("capex_planned", "#1d4ed8"),
            explain: explainByLabel["Approved Funding"],
          },
          ...(fyOn
            ? [
                {
                  label: "Plan",
                  value: money(totalPlan),
                  spark: buildSpark("capex_planned", "#93c5fd"),
                },
              ]
            : []),
          {
            label: "Incurred",
            value: money(totalIncurred),
            spark: buildSpark("capex_actual", "#15803d"),
            explain: explainByLabel.Incurred,
          },
          {
            label: "Forecast",
            value: money(totalForecast),
            spark: buildSpark("capex_forecast", "#f59e0b"),
            explain: explainByLabel.Forecast,
          },
          {
            label: "Remaining",
            value: money(remaining),
            spark: buildSpark(null, "#8b5cf6"),
            explain: explainByLabel.Remaining,
          },
          { label: "Active", value: active, spark: buildSpark(null, "#06b6d4") },
          { label: "Completed", value: completed, spark: buildSpark(null, "#15803d") },
          {
            label: "Overdue",
            value: overdue,
            spark: buildSpark(null, "#dc2626"),
            explain: explainByLabel.Overdue,
          },
          {
            label: "RAG Score",
            value: `${ragScore}%`,
            spark: buildSpark(null, "#8b5cf6"),
            explain: explainByLabel["RAG Score"],
          },
        ],
        ragData: ["Green", "Amber", "Red"]
          .map((r) => ({
            name: r,
            value: filtered.filter((p: any) => engineRagOf(p) === r).length,
          }))
          .filter((d) => d.value > 0),
        capexBars: [
          { name: fyOn ? "FY allocation" : "Approved", value: approvedFunding },
          ...(fyOn ? [{ name: "Plan", value: totalPlan }] : []),
          { name: "Incurred", value: totalIncurred },
          { name: "Forecast", value: totalForecast },
          { name: "Remaining", value: remaining },
        ],
      };
    }, [filtered, filteredIds, monthly, milestones, otherCosts, gates, engineRagById, fySelected, fyStartMonth, healthLookups.fyAllocations]);

  // Monthly Spend ($M) — Actual vs Forecast, bucketed by year-month (last 12)
  const monthlySpend = useMemo(() => {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
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
      const ai = order.indexOf(a.name);
      const bi = order.indexOf(b.name);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    return arr;
  }, [filtered]);

  // Top 10 by realised ROI (horizontal bar)
  const topROI = useMemo(
    () =>
      filtered
        .map((p: any) => {
          const roi = projectRealisedRoi(p);
          return { name: (p.name || "").slice(0, 22), roi: Math.round(roi * 10) / 10 };
        })
        .filter((x) => x.roi !== 0)
        .sort((a, b) => b.roi - a.roi)
        .slice(0, 10),
    [filtered],
  );

  // Portfolio Segmentation — canonical Strategic Alignment labels, all ticks shown
  const segmentation = useMemo(() => {
    const labels = portfolioSegmentLabels(filtered);
    const m = new Map<string, number>();
    filtered.forEach((p: any) => {
      const k = projectPortfolio(p);
      m.set(k, (m.get(k) || 0) + 1);
    });
    return labels.map((name) => ({ name, value: m.get(name) || 0 })).filter((r) => r.value > 0);
  }, [filtered]);

  // Governance Channel
  const governanceChannel = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((p: any) => {
      const k =
        p.governance_channel ||
        (Number(p.budget || 0) > 200000 ? "Channel B (>$200K)" : "Channel A (<$200K)");
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m, ([name, value]) => ({ name, value }));
  }, [filtered]);

  const orgPhases = useMemo(() => {
    const fromDefs = (gateDefs as any[]).map((d) => d.gate_name).filter(Boolean);
    return fromDefs.length > 0 ? fromDefs : PHASES;
  }, [gateDefs]);

  // ── Timeline (stream lanes by default; optional project rollup lane) ──
  const timelineLanes = useMemo(() => {
    return expandProjectsToTimelineLanes(filtered, streams as any[], {
      gates: gates as any[],
      resolvePhase: (p, streamGates) => resolveStageShared(p, streamGates, orgPhases),
      includeProjectRollup: showProjectTimeline,
    })
      .map((lane: any) => normalizeTimelineLaneDates(lane))
      .filter((p: any) => p.start_date && p.end_date);
  }, [filtered, streams, gates, orgPhases, showProjectTimeline]);

  const timelineGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    const keyFor = (p: any): string => {
      switch (timelineView) {
        case "Portfolio":
          return projectPortfolio(p) || p.portfolio || "Unassigned";
        case "Program":
          return p.program || "Unassigned";
        case "Health":
          return engineRagOf(p) || "Unrated";
        case "Priority":
          return p.priority || "Unset";
        case "Theme":
          return p.theme || "Unassigned";
        case "Sponsor":
          return p.sponsor || "Unassigned";
        case "Status":
          return p.status || "Unset";
      }
    };
    timelineLanes.forEach((p: any) => {
      const k = keyFor(p);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(p);
    });
    return Array.from(groups.entries()).sort();
  }, [timelineLanes, timelineView, engineRagById]);

  // Per-group bounds — each Program/Theme/etc. axis starts near its own bars
  // so earlier groups don't leave empty lead-in on later sections.
  // Multi-FY selection narrows the window to the union of selected years.
  const boundsByGroup = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeTimelineBounds>>();
    const fyArg = fySelected.length ? fySelected : "All";
    for (const [name, items] of timelineGroups) {
      m.set(name, computeTimelineBounds(items, fyArg, fyStartMonth));
    }
    return m;
  }, [timelineGroups, fySelected, fyStartMonth]);

  const toggleCollapse = (name: string) => setCollapsed((c) => ({ ...c, [name]: !c[name] }));

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

    const streamsByProject = new Map<string, any[]>();
    (streams as any[]).forEach((s) => {
      const list = streamsByProject.get(s.project_id) || [];
      list.push(s);
      streamsByProject.set(s.project_id, list);
    });

    const pushItem = (stage: string | null, item: any) => {
      if (stage && byPhase.has(stage)) {
        byPhase.get(stage)!.items.push(item);
        return;
      }
      const mapped = matchPhase(stage, orgPhases);
      if (mapped && byPhase.has(mapped)) byPhase.get(mapped)!.items.push(item);
      else other.push(item);
    };

    for (const p of activeProjects) {
      const projectStreams = (streamsByProject.get(p.id) || []).sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      if (projectStreams.length > 0) {
        for (const s of projectStreams) {
          const gs = (gates as any[]).filter(
            (g) => g.stream_id === s.id || (!g.stream_id && g.project_id === p.id && s.is_default),
          );
          const stage = resolveStageShared(p, gs, orgPhases);
          pushItem(stage, {
            ...p,
            _kanbanKey: `${p.id}:${s.id}`,
            _streamLabel: formatStreamLabel(s),
            _streamRef: formatProjectStreamRef(p, s),
            _streamRag: s.rag || shownRagOf(p),
          });
        }
      } else {
        const stage = resolveStageShared(p, gatesByProject.get(p.id) || [], orgPhases);
        pushItem(stage, {
          ...p,
          _kanbanKey: p.id,
          _streamLabel: null,
          _streamRef: null,
          _streamRag: shownRagOf(p),
        });
      }
    }

    const result = cols.map((c) => ({ ...c, items: c.items.slice(0, 48) }));
    if (other.length > 0) {
      result.push({ phase: "Other / Unmapped", items: other.slice(0, 48) });
    }
    return result;
  }, [filtered, orgPhases, gatesByProject, streams, gates]);

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

  const portfolioRegisterRows = useMemo(() => {
    const streamsByProject = new Map<string, any[]>();
    (streams as any[]).forEach((s) => {
      const list = streamsByProject.get(s.project_id) || [];
      list.push(s);
      streamsByProject.set(s.project_id, list);
    });
    const rows: {
      key: string;
      name: string;
      stream: string;
      program: string | null;
      sponsor: string | null;
      budget: number;
      incurred: number;
      rag: string | null;
      ragManual?: boolean;
      phase: string | null;
    }[] = [];
    for (const p of filtered) {
      const ps = (streamsByProject.get(p.id) || []).sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      if (ps.length > 0) {
        for (const s of ps) {
          const gs = (gates as any[]).filter(
            (g) => g.stream_id === s.id || (!g.stream_id && g.project_id === p.id && s.is_default),
          );
          rows.push({
            key: `${p.id}:${s.id}`,
            name: p.name,
            stream: formatProjectStreamRef(p, s),
            program: p.program,
            sponsor: s.owner || p.sponsor,
            budget: Number(s.budget || 0),
            incurred: Number(s.capex_incurred || 0) + Number(s.opex_incurred || 0),
            rag: s.rag || shownRagOf(p),
            ragManual: !s.rag && isRagOverridden(p),
            phase: resolveStageShared(p, gs, orgPhases),
          });
        }
      } else {
        rows.push({
          key: p.id,
          name: p.name,
          stream: "—",
          program: p.program,
          sponsor: p.sponsor,
          budget: projectApprovedFunding(p),
          incurred: projectIncurred(p),
          rag: shownRagOf(p),
          ragManual: isRagOverridden(p),
          phase: resolveStageShared(p, gatesByProject.get(p.id) || [], orgPhases),
        });
      }
    }
    return rows;
  }, [filtered, streams, gates, orgPhases, gatesByProject]);

  const portfolioColumns: ColumnarColumn<(typeof portfolioRegisterRows)[number]>[] = useMemo(
    () => [
      { key: "name", label: "Project" },
      { key: "stream", label: "Stream" },
      { key: "program", label: "Program", getValue: (r) => r.program || "" },
      { key: "sponsor", label: "Sponsor", getValue: (r) => r.sponsor || "" },
      { key: "budget", label: "Budget" },
      { key: "incurred", label: "Incurred" },
      { key: "rag", label: "RAG", getValue: (r) => r.rag || "" },
      { key: "phase", label: "Phase", getValue: (r) => r.phase || "" },
    ],
    [],
  );
  const portfolioTable = useColumnarTable(portfolioRegisterRows, portfolioColumns);

  return (
    <div>
      {/* Header + filters */}
      <SectionFrame>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="page-heading">Executive Dashboard</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Charts, timelines, and register. Executive Focus and project summaries live on{" "}
              <Link
                to="/app/executive-cockpit"
                className="font-medium text-primary hover:underline"
              >
                Executive Cockpit
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/app/executive-cockpit"
              className="print:hidden rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Open Cockpit
            </Link>
            <button
              type="button"
              onClick={() => void exportPdf()}
              disabled={exporting}
              className="print:hidden rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-60"
            >
              {exporting ? "Generating…" : "Generate Executive Dashboard PDF"}
            </button>
          </div>
        </div>
      </SectionFrame>

      <div ref={reportRef}>
        {loadError && (
          <QueryErrorPanel
            className="mb-4"
            title="Executive data failed to load"
            message={queryErrorMessage(
              loadError,
              "A temporary issue interrupted loading. Retry to refresh portfolio data.",
            )}
            onRetry={retryAll}
          />
        )}
        {softWarning && !loadError && (
          <div
            role="status"
            className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Some portfolio panels could not refresh</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs opacity-90">
                  {softWarning}
                </p>
                <p className="mt-2 text-xs opacity-80">
                  Retry to refresh. If this keeps happening, an administrator may need to apply
                  pending migrations and reload the Supabase schema.
                </p>
              </div>
              <button
                type="button"
                onClick={retryAll}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-muted"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <SectionFrame className="section-frame--filters" exportable={false}>
          <ExecutivePortfolioFilters
            projects={projects}
            value={filters}
            onChange={setFilters}
            fyStartMonth={fyStartMonth}
          />
        </SectionFrame>

        {/* Key Metrics */}
        <SectionFrame>
          <SectionTitle>Key Metrics</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {kpis.map((k) => (
              <div key={k.label} className="kpi-card">
                <div className="kpi-head">
                  <div className="kpi-label">{k.label}</div>
                  {"explain" in k && k.explain ? (
                    <ExplainThis explanation={k.explain} size="xs" />
                  ) : null}
                </div>
                <div className="kpi-value">{k.value}</div>
                <div className="mt-1 h-10">
                  <ResponsiveContainer>
                    <LineChart
                      data={k.spark.data}
                      margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
                    >
                      <Tooltip
                        cursor={{ stroke: k.spark.color, strokeWidth: 1, strokeDasharray: "3 3" }}
                        contentStyle={{ fontSize: 11, padding: "4px 8px", borderRadius: 6 }}
                        labelFormatter={(i: any) => `Point ${Number(i) + 1}`}
                        formatter={(v: any) => [
                          typeof k.value === "string" && k.value.startsWith("$")
                            ? money(Number(v))
                            : Math.round(Number(v) * 10) / 10,
                          k.label,
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke={k.spark.color}
                        strokeWidth={1.8}
                        dot={false}
                        activeDot={{ r: 3 }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </SectionFrame>

        {/* Portfolio Analytics — matches reference layout */}
        <SectionFrame>
          <div className="mb-1 flex items-center justify-between gap-2">
            <SectionTitle>Portfolio Analytics</SectionTitle>
            <SoftUpdatingLabel active={!showColdLoad && softUpdating} />
          </div>
          {showColdLoad ? (
            <PageLoading label="Loading executive view…" fullScreen={false} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Portfolio Health — donut */}
              <ChartBox
                title="Portfolio Health"
                legend={
                  <>
                    <p className="mb-1 text-[10px] leading-snug text-muted-foreground">
                      Health Engine mix — same bands as Cockpit health score (Green ≥ 80, Amber
                      65–79, Red &lt; 65). Sponsor RAG override still shows on chips, not this
                      donut.
                    </p>
                    {ragData.length > 0 ? (
                      <ChartLegendList
                        items={legendItemsFromCounts(ragData, RAG_COLORS)}
                        columns={ragData.length <= 3 ? 1 : 2}
                      />
                    ) : null}
                  </>
                }
              >
                {ragData.length === 0 ? (
                  <Empty />
                ) : (
                  <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <Pie
                      data={ragData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="48%"
                      outerRadius="74%"
                      paddingAngle={2}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {ragData.map((e) => (
                        <Cell key={e.name} fill={RAG_COLORS[e.name]} />
                      ))}
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
                    {capexBars.map((_, i) => (
                      <Cell key={i} fill={CAPEX_COLORS[i]} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="top"
                      fontSize={11}
                      formatter={(v: any) => moneyM(Number(v))}
                    />
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
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#22c55e"
                    strokeWidth={2}
                    name="Actual"
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    name="Forecast"
                    dot={{ r: 3 }}
                  />
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
                {themeData.length === 0 ? (
                  <Empty />
                ) : (
                  <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <Pie
                      data={themeData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="46%"
                      outerRadius="72%"
                      paddingAngle={2}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {themeData.map((_, i) => (
                        <Cell key={i} fill={THEME_PALETTE[i % THEME_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [`${v} projects`, n]} />
                  </PieChart>
                )}
              </ChartBox>

              {/* By Priority — horizontal */}
              <ChartBox title="By Priority">
                <BarChart
                  data={priorityData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                  <XAxis type="number" fontSize={10} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" fontSize={11} width={90} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {priorityData.map((d, i) => (
                      <Cell key={i} fill={PRIORITY_COLORS[d.name] || "#64748b"} />
                    ))}
                    <LabelList dataKey="value" position="right" fontSize={11} />
                  </Bar>
                </BarChart>
              </ChartBox>

              {/* Top 10 by ROI — horizontal */}
              <ChartBox title="Top 10 Projects by ROI %">
                {topROI.length === 0 ? (
                  <Empty msg="No ROI data — add benefits & incurred cost" />
                ) : (
                  <BarChart
                    data={topROI}
                    layout="vertical"
                    margin={{ top: 5, right: 40, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                    <XAxis type="number" fontSize={10} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" fontSize={10} width={130} />
                    <Tooltip formatter={(v: any) => `${v}%`} />
                    <Bar dataKey="roi" fill="#eab308" radius={[0, 4, 4, 0]}>
                      <LabelList
                        dataKey="roi"
                        position="right"
                        fontSize={10}
                        formatter={(v: any) => `${v}%`}
                      />
                    </Bar>
                  </BarChart>
                )}
              </ChartBox>

              {/* Portfolio Segmentation */}
              <ChartBox title="Segmentation — Projects by Strategic Alignment" heightClass="h-72">
                <BarChart data={segmentation} margin={{ top: 25, right: 12, left: 16, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    minTickGap={0}
                    tick={<CategoryTick />}
                    height={44}
                  />
                  <YAxis fontSize={10} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {segmentation.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? "#1d4ed8" : "#60a5fa"} />
                    ))}
                    <LabelList dataKey="value" position="top" fontSize={11} />
                  </Bar>
                </BarChart>
              </ChartBox>

              {/* Projects by Governance Channel */}
              <ChartBox title="Projects by Governance Channel" heightClass="h-72">
                <BarChart
                  data={governanceChannel}
                  margin={{ top: 25, right: 12, left: 16, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    minTickGap={0}
                    tick={<CategoryTick />}
                    height={44}
                  />
                  <YAxis fontSize={10} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {governanceChannel.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? "#1d4ed8" : "#93c5fd"} />
                    ))}
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
            title="Timeline and Roadmap"
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
                  <option value="Portfolio">View: Strategic Alignment</option>
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
                {timelineGroups.map(([groupName, items]) => {
                  const groupBounds = boundsByGroup.get(groupName);
                  if (!groupBounds) return null;
                  return (
                    <GanttGroup
                      key={groupName}
                      title={groupName}
                      items={items}
                      bounds={groupBounds}
                      gates={gates as any[]}
                      collapsed={!!collapsed[groupName]}
                      onToggle={() => toggleCollapse(groupName)}
                      showProjectTimeline={showProjectTimeline}
                      onShowProjectTimelineChange={setShowProjectTimeline}
                    />
                  );
                })}
              </div>
            )}
          </ExpandablePanel>
        </SectionFrame>

        {/* Governance Flow — stage columns with project links */}
        <SectionFrame>
          <ExpandablePanel
            title="Governance Flow — active projects / streams by current stage"
            compactMaxHeightClass="max-h-[min(60vh,640px)]"
          >
            <div
              className="grid min-w-[720px] gap-3"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, kanban.length)}, minmax(140px, 1fr))`,
              }}
            >
              {kanban.map((col, colIdx) => (
                <div
                  key={col.phase}
                  className="flex max-h-[520px] flex-col border-r border-border/60 last:border-r-0 pr-3 last:pr-0"
                >
                  <div
                    className="mb-3 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-gradient-to-br from-muted/80 via-background to-background shadow-sm"
                    title={col.phase}
                  >
                    <div
                      className="h-1 w-full"
                      style={{
                        background: `linear-gradient(90deg, var(--primary) ${Math.min(100, (colIdx + 1) * (100 / Math.max(1, kanban.length)))}%, var(--border) 0%)`,
                      }}
                    />
                    <div className="px-2.5 py-2">
                      <div className="truncate text-[11px] font-bold tracking-wide text-foreground">
                        {col.phase}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground">Stage</span>
                        <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                          {col.items.length}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                    {col.items.length === 0 ? (
                      <div className="px-0.5 py-2 text-[10px] text-muted-foreground">
                        No active projects
                      </div>
                    ) : (
                      col.items.map((p: any) => {
                        const rag = (p._streamRag as string) || shownRagOf(p) || "";
                        const ragColor = RAG_COLORS[rag] || "var(--muted-foreground)";
                        return (
                          <Link
                            key={p._kanbanKey || p.id}
                            to="/app/project-infographic"
                            search={{ pid: p.id }}
                            className="group flex items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60"
                            title={p._streamRef || p.name}
                          >
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                              style={{ background: ragColor }}
                              aria-label={rag ? `RAG ${rag}` : "RAG unset"}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] font-medium text-primary group-hover:underline">
                                {p._streamRef || p.project_code || p.name}
                              </span>
                              {p._streamLabel ? (
                                <span className="block truncate text-[10px] text-muted-foreground">
                                  {p.name} · {p._streamLabel}
                                </span>
                              ) : p.project_code ? (
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

        {/* Portfolio Register — stream-aware */}
        <SectionFrame>
          <SectionTitle>Portfolio Register</SectionTitle>
          <ColumnarToolbar
            globalQ={portfolioTable.globalQ}
            onGlobalQ={portfolioTable.setGlobalQ}
            shown={portfolioTable.rows.length}
            total={portfolioTable.total}
            dirty={portfolioTable.isDirty}
            onClear={portfolioTable.clearAll}
            placeholder="Search portfolio register…"
          />
          {portfolioTable.rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {portfolioTable.total === 0 ? "No projects match filters" : "No matching projects."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="st-table">
                <thead>
                  <tr>
                    {portfolioColumns.map((col) => (
                      <ColumnarTh
                        key={col.key}
                        column={col}
                        filter={portfolioTable.filters[col.key]}
                        onFilter={(v) => portfolioTable.setColumnFilter(col.key, v)}
                        sortKey={portfolioTable.sortKey}
                        sortDir={portfolioTable.sortDir}
                        onToggleSort={portfolioTable.toggleSort}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {portfolioTable.rows.map((r) => (
                    <tr key={r.key}>
                      <td className="font-medium">{r.name}</td>
                      <td className="font-mono text-xs">{r.stream}</td>
                      <td>{r.program ?? "—"}</td>
                      <td>{r.sponsor ?? "—"}</td>
                      <td>{money(r.budget)}</td>
                      <td>{money(r.incurred)}</td>
                      <td>
                        <RagChip
                          rag={r.rag}
                          manual={r.ragManual}
                          explain={explainRag({
                            rag: r.rag,
                            source: "register",
                            overridden: r.ragManual,
                          })}
                        />
                      </td>
                      <td>{r.phase ?? "—"}</td>
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
  heightClass,
}: {
  title: string;
  children: React.ReactElement;
  legend?: React.ReactNode;
  heightClass?: string;
}) {
  return (
    <ExpandableChart title={title} legend={legend} heightClass={heightClass}>
      {children}
    </ExpandableChart>
  );
}

function Empty({ msg = "No data" }: { msg?: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      {msg}
    </div>
  );
}
