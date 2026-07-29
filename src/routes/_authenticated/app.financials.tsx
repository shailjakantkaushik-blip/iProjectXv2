import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  PROJECT_PORTFOLIO_SELECT,
  FINANCIALS_MONTHLY_SELECT,
  STAGE_GATES_SELECT,
  STAGE_GATE_DEFINITIONS_SELECT,
} from "@/lib/query-selects";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import {
  PortfolioFilters,
  emptyFilters,
  applyFilters,
  type PortfolioFilterState,
} from "@/components/portfolio-filters";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  ComposedChart,
  Line,
  Area,
  AreaChart,
  Cell,
} from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  projectApprovedFunding,
  projectIncurred,
  projectBenefitCostRatio,
  projectBenefitsRealised,
  projectRealisedRoi,
  projectForecast,
} from "@/lib/project-finance";
import {
  monthlyRowsForPhaseFilter,
  monthlyTriple,
  sumMonthlyActual,
  sumMonthlyForecast,
  sumMonthlyPlanned,
  syncOrgIncurredFromMonthly,
  type MonthlyFinanceRow,
} from "@/lib/finance-lifecycle";
import { syncOpexLaborPlannedFromWorkItems } from "@/lib/sync-opex-labor-planned";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/financials")({
  component: FinancialsPage,
});

const money = (n: number) =>
  "$" +
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n || 0);

const DEFAULT_STAGES = [
  "Discovery",
  "Business Case / Seed Funding",
  "Design",
  "Business Case / Full Funding",
  "Build",
  "Testing",
  "Deployment",
  "Handover",
  "Benefit Realisation",
];

function FinancialsPage() {
  const { organization } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<PortfolioFilterState>(emptyFilters);
  const [syncing, setSyncing] = useState(false);
  const [syncingFtePlan, setSyncingFtePlan] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () =>
      (await supabase
        .from("projects")
        .select(PROJECT_PORTFOLIO_SELECT as "*")
        .order("project_code")
        .order("name")).data ?? [],
    enabled: !!organization,
  });
  const { data: monthly = [] } = useQuery({
    queryKey: ["financials_monthly", organization?.id],
    queryFn: async () =>
      (await supabase.from("financials_monthly").select(FINANCIALS_MONTHLY_SELECT as "*").order("period_month")).data ?? [],
    enabled: !!organization,
  });
  const { data: gateDefs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", organization?.id],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gate_definitions")
          .select(STAGE_GATE_DEFINITIONS_SELECT as "*")
          .eq("org_id", organization!.id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
      ).data ?? [],
    enabled: !!organization,
  });
  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", organization?.id],
    queryFn: async () => (await supabase.from("stage_gates").select(STAGE_GATES_SELECT as "*")).data ?? [],
    enabled: !!organization,
  });

  const orgPhases = useMemo(() => {
    const configured = gateDefs.map((g: any) => g.gate_name).filter(Boolean);
    return configured.length ? configured : DEFAULT_STAGES;
  }, [gateDefs]);

  const baseFiltered = useMemo(
    () => applyFilters(projects, filters, { phaseMode: "ignore" }),
    [projects, filters],
  );

  const phaseScopedMonthlyByProject = useMemo(() => {
    const map = new Map<string, MonthlyFinanceRow[]>();
    for (const p of baseFiltered as any[]) {
      const projectGates = (gates as any[]).filter((g) => g.project_id === p.id);
      const projectMonthly = (monthly as MonthlyFinanceRow[]).filter((m) => m.project_id === p.id);
      if (filters.phase === "All") {
        map.set(p.id, projectMonthly);
        continue;
      }

      const streamIds = new Set<string | null>();
      for (const g of projectGates) streamIds.add(g.stream_id ?? null);
      for (const m of projectMonthly) streamIds.add(m.stream_id ?? null);
      if (streamIds.size === 0) streamIds.add(null);

      const seen = new Set<string>();
      const out: MonthlyFinanceRow[] = [];
      for (const sid of streamIds) {
        const gs = projectGates.filter((g) => (g.stream_id ?? null) === sid);
        const rows = projectMonthly.filter((m) => (m.stream_id ?? null) === sid);
        // Default-stream fallback: project-level gates (null stream_id) when lane has none.
        const gateRows =
          gs.length > 0
            ? gs
            : projectGates.filter((g) => !g.stream_id);
        const scoped = monthlyRowsForPhaseFilter(rows, gateRows, orgPhases, filters.phase);
        for (const row of scoped) {
          const key = `${row.stream_id ?? ""}|${String(row.period_month).slice(0, 10)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(row);
        }
      }
      map.set(p.id, out);
    }
    return map;
  }, [baseFiltered, monthly, gates, orgPhases, filters.phase]);

  const filtered = useMemo(() => {
    if (filters.phase === "All") return baseFiltered;
    return baseFiltered.filter((p: any) => (phaseScopedMonthlyByProject.get(p.id) || []).length > 0);
  }, [baseFiltered, filters.phase, phaseScopedMonthlyByProject]);

  const ids = useMemo(() => new Set(filtered.map((p: any) => p.id)), [filtered]);
  const mFiltered = useMemo(() => {
    if (filters.phase === "All") {
      return monthly.filter((m: any) => ids.has(m.project_id)) as MonthlyFinanceRow[];
    }
    const out: MonthlyFinanceRow[] = [];
    for (const id of ids) {
      out.push(...(phaseScopedMonthlyByProject.get(id) || []));
    }
    return out;
  }, [monthly, ids, filters.phase, phaseScopedMonthlyByProject]);

  const phaseTripleByProject = useMemo(() => {
    const map = new Map<string, ReturnType<typeof monthlyTriple>>();
    for (const p of filtered as any[]) {
      map.set(p.id, monthlyTriple(phaseScopedMonthlyByProject.get(p.id) || []));
    }
    return map;
  }, [filtered, phaseScopedMonthlyByProject]);

  const phaseScoped = filters.phase !== "All";

  const financeColumns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "project_code", label: "Code" },
      { key: "name", label: "Project" },
      { key: "program", label: "Program" },
      {
        key: "budget",
        label: phaseScoped ? "Phase Planned" : "Budget",
        getValue: (p) =>
          phaseScoped ? phaseTripleByProject.get(p.id)?.planned ?? 0 : projectApprovedFunding(p),
      },
      {
        key: "capex_approved",
        label: "CAPEX Appr.",
        getValue: (p) => (phaseScoped ? 0 : Number(p.capex_approved || 0)),
      },
      {
        key: "capex_incurred",
        label: phaseScoped ? "Phase Actual" : "CAPEX Incd.",
        getValue: (p) =>
          phaseScoped
            ? phaseTripleByProject.get(p.id)?.actual ?? 0
            : Number(p.capex_incurred || 0),
      },
      {
        key: "opex_approved",
        label: "OPEX Appr.",
        getValue: (p) => (phaseScoped ? 0 : Number(p.opex_approved || 0)),
      },
      {
        key: "opex_incurred",
        label: phaseScoped ? "Phase Forecast" : "OPEX Incd.",
        getValue: (p) =>
          phaseScoped
            ? phaseTripleByProject.get(p.id)?.forecast ?? 0
            : Number(p.opex_incurred || 0),
      },
      {
        key: "benefits",
        label: "Benefits",
        getValue: (p) => (phaseScoped ? 0 : projectBenefitsRealised(p)),
      },
      {
        key: "variance",
        label: "Variance",
        getValue: (p) => {
          if (phaseScoped) {
            const t = phaseTripleByProject.get(p.id);
            return (t?.planned ?? 0) - (t?.actual ?? 0);
          }
          return projectApprovedFunding(p) - projectIncurred(p);
        },
      },
      {
        key: "roi",
        label: "ROI %",
        getValue: (p) => (phaseScoped ? 0 : projectRealisedRoi(p)),
      },
    ],
    [phaseScoped, phaseTripleByProject],
  );
  const financeTable = useColumnarTable(filtered, financeColumns);

  const sum = (k: string) => filtered.reduce((s, p: any) => s + Number(p[k] || 0), 0);
  const capexApproved = phaseScoped ? 0 : sum("capex_approved");
  const capexIncurred = phaseScoped
    ? filtered.reduce((s, p: any) => s + (phaseTripleByProject.get(p.id)?.actual ?? 0), 0)
    : sum("capex_incurred");
  const opexApproved = phaseScoped ? 0 : sum("opex_approved");
  const opexIncurred = phaseScoped ? 0 : sum("opex_incurred");
  const totalBudget = phaseScoped
    ? filtered.reduce((s, p: any) => s + (phaseTripleByProject.get(p.id)?.planned ?? 0), 0)
    : filtered.reduce((s, p: any) => s + projectApprovedFunding(p), 0);
  const benefitsRealised = phaseScoped
    ? 0
    : filtered.reduce((s, p: any) => s + projectBenefitsRealised(p), 0);
  const totalApproved = totalBudget;
  const totalIncurred = phaseScoped
    ? filtered.reduce((s, p: any) => s + (phaseTripleByProject.get(p.id)?.actual ?? 0), 0)
    : filtered.reduce((s, p: any) => s + projectIncurred(p), 0);
  const spendPct = totalApproved > 0 ? (totalIncurred / totalApproved) * 100 : 0;
  const variance = totalApproved - totalIncurred;

  // Execution layer (monthly) — Plan vs Actual vs Forecast
  // These sums are totals across all monthly rows in the filter (should ≈ budget / FAC / incurred).
  const monthlyPlanned = sumMonthlyPlanned(mFiltered);
  const monthlyActual = sumMonthlyActual(mFiltered);
  const monthlyForecast = sumMonthlyForecast(mFiltered);
  const registerFac = phaseScoped
    ? 0
    : filtered.reduce((s, p: any) => s + projectForecast(p), 0);
  const planVsActualVar = monthlyPlanned - monthlyActual;
  const planVsActualPct =
    monthlyPlanned > 0 ? (monthlyActual / monthlyPlanned) * 100 : 0;

  const syncIncurred = async () => {
    if (!organization?.id) return;
    setSyncing(true);
    try {
      const n = await syncOrgIncurredFromMonthly(organization.id);
      toast.success(`Synced incurred from monthly actuals for ${n} projects.`);
      void qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const syncFtePlan = async () => {
    if (!organization?.id) return;
    setSyncingFtePlan(true);
    try {
      const r = await syncOpexLaborPlannedFromWorkItems(organization.id);
      toast.success(
        `Synced planned FTE $${r.plannedTotal.toLocaleString()} across ${r.monthsUpserted} month rows from work items.`,
      );
      void qc.invalidateQueries({ queryKey: ["financials_monthly"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      toast.error(
        /opex_labor_planned|column/i.test(msg)
          ? "Paste supabase/manual/opex_labor_planned_from_work_items.sql in Supabase, Reload schema, then retry."
          : msg,
      );
    } finally {
      setSyncingFtePlan(false);
    }
  };

  const fteLaborPlanned = mFiltered.reduce((s, m) => s + Number(m.opex_labor_planned || 0), 0);
  const fteLaborActual = mFiltered.reduce((s, m) => s + Number(m.opex_labor_actual || 0), 0);
  // Portfolio benefit/cost ratio (not EVM CPI). Per-project helper used in table contexts.
  const benefitCostRatio =
    totalIncurred > 0
      ? benefitsRealised / totalIncurred
      : !phaseScoped && filtered.length
        ? filtered.reduce((s, p: any) => s + projectBenefitCostRatio(p), 0) / filtered.length
        : 0;

  // By program
  const byProgram = Array.from(
    filtered
      .reduce((m: Map<string, any>, p: any) => {
        const k = p.program || "Unassigned";
        const cur = m.get(k) || {
          program: k,
          capex: 0,
          opex: 0,
          incurred: 0,
          budget: 0,
          benefits: 0,
        };
        if (phaseScoped) {
          const t = phaseTripleByProject.get(p.id);
          cur.capex += t?.planned ?? 0;
          cur.opex += 0;
          cur.incurred += t?.actual ?? 0;
          cur.budget += t?.planned ?? 0;
        } else {
          cur.capex += Number(p.capex_approved || 0);
          cur.opex += Number(p.opex_approved || 0);
          cur.incurred += projectIncurred(p);
          cur.budget += projectApprovedFunding(p);
          cur.benefits += projectBenefitsRealised(p);
        }
        m.set(k, cur);
        return m;
      }, new Map())
      .values(),
  );

  // Monthly cashflow (planned vs actual) + cumulative + FTE labor
  const monthlyAgg = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of mFiltered) {
      const key = String(m.period_month).slice(0, 7);
      const row = map.get(key) || {
        month: key,
        planned: 0,
        actual: 0,
        forecast: 0,
        ftePlan: 0,
        fteActual: 0,
      };
      row.planned += Number(m.capex_planned || 0) + Number(m.opex_planned || 0);
      row.actual += Number(m.capex_actual || 0) + Number(m.opex_actual || 0);
      row.forecast += Number(m.capex_forecast || 0) + Number(m.opex_forecast || 0);
      row.ftePlan += Number(m.opex_labor_planned || 0);
      row.fteActual += Number(m.opex_labor_actual || 0);
      map.set(key, row);
    }
    const rows = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
    let cp = 0,
      ca = 0;
    return rows.map((r) => {
      cp += r.planned;
      ca += r.actual;
      return { ...r, cumPlanned: cp, cumActual: ca };
    });
  }, [mFiltered]);

  const monthCount = monthlyAgg.length;
  const avgMonthlyPlanned = monthCount > 0 ? monthlyPlanned / monthCount : 0;
  const avgMonthlyActual = monthCount > 0 ? monthlyActual / monthCount : 0;
  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonthRow = monthlyAgg.find((r) => r.month === thisMonthKey) ?? null;

  // Top 10 variance (approved funding − incurred)
  const varianceTop = [...filtered]
    .map((p: any) => {
      if (phaseScoped) {
        const t = phaseTripleByProject.get(p.id);
        return {
          code: p.project_code,
          name: p.name,
          variance: (t?.planned ?? 0) - (t?.actual ?? 0),
        };
      }
      return {
        code: p.project_code,
        name: p.name,
        variance: projectApprovedFunding(p) - projectIncurred(p),
      };
    })
    .sort((a, b) => a.variance - b.variance)
    .slice(0, 10);

  return (
    <PageExport name="Financials" title="Financial Intelligence">
      <PageHeading icon="💰">Financial Intelligence — Plan vs Actual</PageHeading>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          <strong>Plan</strong> comes from FY Allocation (cascaded to monthly planned).{" "}
          <strong>Actual</strong> is captured each month after kickoff.{" "}
          <strong>Forecast</strong> is the live outlook.{" "}
          <strong>Planned FTE $</strong> comes from work-item planned hours × rates;{" "}
          <strong>Actual FTE $</strong> from approved timesheets (feeds OpEx incurred).
          {phaseScoped ? (
            <>
              {" "}
              Phase filter uses each project’s stage-gate <strong>date window</strong> (not only
              current phase).
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={syncingFtePlan || !organization}
            onClick={syncFtePlan}
          >
            {syncingFtePlan ? "Syncing…" : "Sync planned FTE from work items"}
          </Button>
          <Button variant="outline" size="sm" disabled={syncing || !organization} onClick={syncIncurred}>
            {syncing ? "Syncing…" : "Sync incurred from actuals"}
          </Button>
        </div>
      </div>
      <PortfolioFilters
        projects={projects}
        value={filters}
        onChange={setFilters}
        phaseOptions={orgPhases}
        phaseAllLabel="All phase windows"
      />

      <SectionFrame>
        <SectionTitle>Plan vs Actual vs Forecast (monthly cashflow)</SectionTitle>
        <p className="mb-3 text-xs text-muted-foreground">
          The Σ totals below sum <em>every</em> month in the filter — so for one project,{" "}
          <strong>Σ Planned ≈ Total Budget</strong> (e.g. PRJ-013 $3.4M), not the spend in a single
          month. Per-month planned is shown in the chart and table (typically a few hundred thousand
          for PRJ-013). Avg / this month KPIs are the true monthly cashflow view.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          <KpiCard
            label="Σ Planned (all months)"
            value={money(monthlyPlanned)}
            sub="Should ≈ Total Budget"
            accent="#93c5fd"
          />
          <KpiCard
            label="Σ Actual (all months)"
            value={money(monthlyActual)}
            sub="Should ≈ Total Incurred"
            accent="#1d4ed8"
          />
          <KpiCard
            label="Σ Forecast (all months)"
            value={money(monthlyForecast)}
            sub={!phaseScoped ? "Should ≈ Register FAC" : undefined}
            accent="#f59e0b"
          />
          {!phaseScoped ? (
            <KpiCard label="Register FAC" value={money(registerFac)} accent="#8b5cf6" />
          ) : null}
          <KpiCard
            label="Avg monthly planned"
            value={money(avgMonthlyPlanned)}
            sub={monthCount ? `${monthCount} months` : "No months"}
            accent="#64748b"
          />
          <KpiCard
            label="This month planned"
            value={thisMonthRow ? money(thisMonthRow.planned) : "—"}
            sub={
              thisMonthRow
                ? `${thisMonthKey} · actual ${money(thisMonthRow.actual)}`
                : thisMonthKey
            }
            accent="#0ea5e9"
          />
          <KpiCard
            label="Σ Plan − Σ Actual"
            value={money(planVsActualVar)}
            sub={
              monthlyPlanned
                ? `Actual / Planned ${planVsActualPct.toFixed(1)}% · avg act ${money(avgMonthlyActual)}`
                : undefined
            }
            accent={planVsActualVar < 0 ? "#ef4444" : "#22c55e"}
          />
          <KpiCard
            label="Actual / Planned"
            value={monthlyPlanned ? `${planVsActualPct.toFixed(1)}%` : "—"}
            accent={planVsActualPct > 100 ? "#ef4444" : "#0ea5e9"}
          />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Approved funding vs incurred (project register)</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <KpiCard label="CAPEX Approved" value={money(capexApproved)} accent="#1d4ed8" />
          <KpiCard label="CAPEX Incurred" value={money(capexIncurred)} accent="#3b82f6" />
          <KpiCard label="OPEX Approved" value={money(opexApproved)} accent="#15803d" />
          <KpiCard label="OPEX Incurred" value={money(opexIncurred)} accent="#22c55e" />
          <KpiCard label="Total Budget" value={money(totalBudget)} accent="#8b5cf6" />
          <KpiCard label="Total Incurred" value={money(totalIncurred)} accent="#f59e0b" />
          <KpiCard label="Planned FTE $" value={money(fteLaborPlanned)} accent="#6366f1" />
          <KpiCard label="Actual FTE $" value={money(fteLaborActual)} accent="#ea580c" />
          <KpiCard
            label="Spend %"
            value={`${spendPct.toFixed(1)}%`}
            accent={spendPct > 100 ? "#ef4444" : spendPct > 85 ? "#f59e0b" : "#22c55e"}
          />
          <KpiCard
            label="Benefits / Cost Ratio"
            value={benefitCostRatio.toFixed(2)}
            sub={`Variance ${money(variance)}`}
            accent="#0ea5e9"
          />
        </div>
        {!phaseScoped ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Incurred OpEx includes <strong>Actual FTE</strong> from approved timesheets (
            <code>opex_labor_actual</code>) plus other OpEx. <strong>Planned FTE</strong> (
            <code>opex_labor_planned</code>) is synced from work-item planned hours × rates and does
            not overwrite FY OpEx budget.
          </p>
        ) : null}
      </SectionFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionFrame>
          <ExpandableChart title="CAPEX vs OPEX vs Incurred by Program" heightClass="h-72">
            <BarChart data={byProgram} margin={{ top: 15, right: 10, left: 0, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="program" fontSize={10} angle={-25} textAnchor="end" interval={0} />
              <YAxis fontSize={11} tickFormatter={money} />
              <Tooltip formatter={(v: any) => money(Number(v))} />
              <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="capex" fill="#1d4ed8" name="CAPEX Appr." radius={[4, 4, 0, 0]} />
              <Bar dataKey="opex" fill="#15803d" name="OPEX Appr." radius={[4, 4, 0, 0]} />
              <Bar dataKey="incurred" fill="#f59e0b" name="Incurred" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ExpandableChart>
        </SectionFrame>

        <SectionFrame>
          <ExpandableChart title="Top 10 Budget Variance (Approved − Incurred)" heightClass="h-72">
            <BarChart
              data={varianceTop}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis type="number" fontSize={10} tickFormatter={money} />
              <YAxis type="category" dataKey="code" fontSize={10} width={70} />
              <Tooltip formatter={(v: any) => money(Number(v))} />
              <Bar dataKey="variance">
                {varianceTop.map((v, i) => (
                  <Cell key={i} fill={v.variance < 0 ? "#ef4444" : "#22c55e"} />
                ))}
                <LabelList
                  dataKey="variance"
                  position="right"
                  formatter={(x: number) => money(Number(x))}
                  style={{ fontSize: 10, fill: "#334155" }}
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
        </SectionFrame>
      </div>

      <SectionFrame>
        {monthlyAgg.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No monthly financial data yet.
          </div>
        ) : (
          <>
            <ExpandableChart
              title="Monthly Cashflow — Planned vs Actual vs Forecast (per month)"
              heightClass="h-80"
            >
              <ComposedChart data={monthlyAgg}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis dataKey="month" fontSize={10} />
                <YAxis fontSize={11} tickFormatter={money} />
                <Tooltip formatter={(v: any) => money(Number(v))} />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="planned" fill="#93c5fd" name="Planned" />
                <Bar dataKey="actual" fill="#1d4ed8" name="Actual" />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  name="Forecast"
                />
              </ComposedChart>
            </ExpandableChart>
            <div className="mt-3 max-h-64 overflow-auto">
              <table className="st-table w-full table-fixed text-xs">
                <thead className="sticky top-0 z-[1] bg-[#f1f3f6]">
                  <tr>
                    <th>Month</th>
                    <th className="st-num">Planned</th>
                    <th className="st-num">Actual</th>
                    <th className="st-num">Forecast</th>
                    <th className="st-num">FTE plan</th>
                    <th className="st-num">FTE actual</th>
                    <th className="st-num">Cum. planned</th>
                    <th className="st-num">Cum. actual</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyAgg.map((r) => (
                    <tr
                      key={r.month}
                      className={r.month === thisMonthKey ? "bg-sky-50/80" : undefined}
                    >
                      <td className="font-medium">
                        {r.month}
                        {r.month === thisMonthKey ? (
                          <span className="ml-1 text-[10px] text-sky-700">(this month)</span>
                        ) : null}
                      </td>
                      <td className="st-num">{money(r.planned)}</td>
                      <td className="st-num">{money(r.actual)}</td>
                      <td className="st-num">{money(r.forecast)}</td>
                      <td className="st-num">{money(r.ftePlan)}</td>
                      <td className="st-num">{money(r.fteActual)}</td>
                      <td className="st-num">{money(r.cumPlanned)}</td>
                      <td className="st-num">{money(r.cumActual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionFrame>

      <SectionFrame>
        {monthlyAgg.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No monthly financial data.
          </div>
        ) : (
          <ExpandableChart title="Cumulative Cashflow (S-curve)" heightClass="h-72">
            <AreaChart data={monthlyAgg}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="month" fontSize={10} />
              <YAxis fontSize={11} tickFormatter={money} />
              <Tooltip formatter={(v: any) => money(Number(v))} />
              <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="cumPlanned"
                stroke="#8b5cf6"
                fill="#c4b5fd"
                name="Cum. Planned"
              />
              <Area
                type="monotone"
                dataKey="cumActual"
                stroke="#1d4ed8"
                fill="#93c5fd"
                name="Cum. Actual"
              />
            </AreaChart>
          </ExpandableChart>
        )}
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>
          Project Financials ({financeTable.rows.length}
          {financeTable.rows.length !== financeTable.total ? ` of ${financeTable.total}` : ""})
        </SectionTitle>
        <ColumnarToolbar
          globalQ={financeTable.globalQ}
          onGlobalQ={financeTable.setGlobalQ}
          shown={financeTable.rows.length}
          total={financeTable.total}
          dirty={financeTable.isDirty}
          onClear={financeTable.clearAll}
          placeholder="Search project funding…"
        />
        <div className="max-h-[500px] overflow-auto">
          <table className="st-table">
            <thead className="sticky top-0 bg-white">
              <tr>
                {financeColumns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={financeTable.filters[col.key]}
                    onFilter={(v) => financeTable.setColumnFilter(col.key, v)}
                    sortKey={financeTable.sortKey}
                    sortDir={financeTable.sortDir}
                    onToggleSort={financeTable.toggleSort}
                    align={
                      ["project_code", "name", "program"].includes(col.key) ? "left" : "right"
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {financeTable.rows.map((p: any) => {
                const appr = projectApprovedFunding(p);
                const inc = projectIncurred(p);
                const ben = projectBenefitsRealised(p);
                const roi = projectRealisedRoi(p);
                const vari = appr - inc;
                return (
                  <tr key={p.id}>
                    <td className="font-mono text-[11px]">
                      <Link
                        to="/app/project-infographic"
                        search={{ pid: p.id }}
                        className="text-primary hover:underline"
                      >
                        {p.project_code}
                      </Link>
                    </td>
                    <td className="font-medium">{p.name}</td>
                    <td>{p.program || "—"}</td>
                    <td className="text-right tabular-nums">{money(appr)}</td>
                    <td className="text-right tabular-nums">
                      {money(Number(p.capex_approved || 0))}
                    </td>
                    <td className="text-right tabular-nums">
                      {money(Number(p.capex_incurred || 0))}
                    </td>
                    <td className="text-right tabular-nums">
                      {money(Number(p.opex_approved || 0))}
                    </td>
                    <td className="text-right tabular-nums">
                      {money(Number(p.opex_incurred || 0))}
                    </td>
                    <td className="text-right tabular-nums">{money(ben)}</td>
                    <td
                      className={
                        "text-right tabular-nums " + (vari < 0 ? "text-red-700" : "text-green-700")
                      }
                    >
                      {money(vari)}
                    </td>
                    <td
                      className={
                        "text-right tabular-nums " + (roi >= 0 ? "text-green-700" : "text-red-700")
                      }
                    >
                      {roi.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
              {financeTable.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={financeColumns.length}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    No projects match filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </PageExport>
  );
}
