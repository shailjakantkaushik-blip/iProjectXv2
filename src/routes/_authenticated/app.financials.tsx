import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
} from "@/lib/project-finance";
import {
  sumMonthlyActual,
  sumMonthlyForecast,
  sumMonthlyPlanned,
  syncOrgIncurredFromMonthly,
  type MonthlyFinanceRow,
} from "@/lib/finance-lifecycle";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/financials")({
  component: FinancialsPage,
});

const money = (n: number) =>
  "$" +
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n || 0);

function FinancialsPage() {
  const { organization } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<PortfolioFilterState>(emptyFilters);
  const [syncing, setSyncing] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => (await supabase.from("projects").select("*")).data ?? [],
    enabled: !!organization,
  });
  const { data: monthly = [] } = useQuery({
    queryKey: ["financials_monthly", organization?.id],
    queryFn: async () =>
      (await supabase.from("financials_monthly").select("*").order("period_month")).data ?? [],
    enabled: !!organization,
  });

  const filtered = useMemo(() => applyFilters(projects, filters), [projects, filters]);
  const ids = useMemo(() => new Set(filtered.map((p: any) => p.id)), [filtered]);
  const mFiltered = useMemo(
    () => monthly.filter((m: any) => ids.has(m.project_id)) as MonthlyFinanceRow[],
    [monthly, ids],
  );

  const financeColumns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "project_code", label: "Code" },
      { key: "name", label: "Project" },
      { key: "program", label: "Program" },
      {
        key: "budget",
        label: "Budget",
        getValue: (p) => projectApprovedFunding(p),
      },
      {
        key: "capex_approved",
        label: "CAPEX Appr.",
        getValue: (p) => Number(p.capex_approved || 0),
      },
      {
        key: "capex_incurred",
        label: "CAPEX Incd.",
        getValue: (p) => Number(p.capex_incurred || 0),
      },
      {
        key: "opex_approved",
        label: "OPEX Appr.",
        getValue: (p) => Number(p.opex_approved || 0),
      },
      {
        key: "opex_incurred",
        label: "OPEX Incd.",
        getValue: (p) => Number(p.opex_incurred || 0),
      },
      {
        key: "benefits",
        label: "Benefits",
        getValue: (p) => projectBenefitsRealised(p),
      },
      {
        key: "variance",
        label: "Variance",
        getValue: (p) => projectApprovedFunding(p) - projectIncurred(p),
      },
      {
        key: "roi",
        label: "ROI %",
        getValue: (p) => projectRealisedRoi(p),
      },
    ],
    [],
  );
  const financeTable = useColumnarTable(filtered, financeColumns);

  const sum = (k: string) => filtered.reduce((s, p: any) => s + Number(p[k] || 0), 0);
  const capexApproved = sum("capex_approved");
  const capexIncurred = sum("capex_incurred");
  const opexApproved = sum("opex_approved");
  const opexIncurred = sum("opex_incurred");
  const totalBudget = filtered.reduce((s, p: any) => s + projectApprovedFunding(p), 0);
  const benefitsRealised = filtered.reduce((s, p: any) => s + projectBenefitsRealised(p), 0);
  const totalApproved = filtered.reduce((s, p: any) => s + projectApprovedFunding(p), 0);
  const totalIncurred = filtered.reduce((s, p: any) => s + projectIncurred(p), 0);
  const spendPct = totalApproved > 0 ? (totalIncurred / totalApproved) * 100 : 0;
  const variance = totalApproved - totalIncurred;

  // Execution layer (monthly) — Plan vs Actual vs Forecast
  const monthlyPlanned = sumMonthlyPlanned(mFiltered);
  const monthlyActual = sumMonthlyActual(mFiltered);
  const monthlyForecast = sumMonthlyForecast(mFiltered);
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
  // Portfolio benefit/cost ratio (not EVM CPI). Per-project helper used in table contexts.
  const benefitCostRatio =
    totalIncurred > 0
      ? benefitsRealised / totalIncurred
      : filtered.length
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
        cur.capex += Number(p.capex_approved || 0);
        cur.opex += Number(p.opex_approved || 0);
        cur.incurred += projectIncurred(p);
        cur.budget += projectApprovedFunding(p);
        cur.benefits += projectBenefitsRealised(p);
        m.set(k, cur);
        return m;
      }, new Map())
      .values(),
  );

  // Monthly cashflow (planned vs actual) + cumulative
  const monthlyAgg = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of mFiltered) {
      const key = String(m.period_month).slice(0, 7);
      const row = map.get(key) || { month: key, planned: 0, actual: 0, forecast: 0 };
      row.planned += Number(m.capex_planned || 0) + Number(m.opex_planned || 0);
      row.actual += Number(m.capex_actual || 0) + Number(m.opex_actual || 0);
      row.forecast += Number(m.capex_forecast || 0) + Number(m.opex_forecast || 0);
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

  // Top 10 variance (approved funding − incurred)
  const varianceTop = [...filtered]
    .map((p: any) => ({
      code: p.project_code,
      name: p.name,
      variance: projectApprovedFunding(p) - projectIncurred(p),
    }))
    .sort((a, b) => a.variance - b.variance)
    .slice(0, 10);

  return (
    <PageExport name="Financials" title="Financial Intelligence">
      <PageHeading icon="💰">Financial Intelligence — Plan vs Actual</PageHeading>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          <strong>Plan</strong> comes from FY Allocation (cascaded to monthly planned).{" "}
          <strong>Actual</strong> is captured each month after kickoff.{" "}
          <strong>Forecast</strong> is the live outlook. Compare them below; project CapEx/OpEx
          incurred can be synced from monthly actuals.
        </p>
        <Button variant="outline" size="sm" disabled={syncing || !organization} onClick={syncIncurred}>
          {syncing ? "Syncing…" : "Sync incurred from actuals"}
        </Button>
      </div>
      <PortfolioFilters projects={projects} value={filters} onChange={setFilters} />

      <SectionFrame>
        <SectionTitle>Plan vs Actual vs Forecast (monthly cashflow)</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <KpiCard label="Monthly Planned" value={money(monthlyPlanned)} accent="#93c5fd" />
          <KpiCard label="Monthly Actual" value={money(monthlyActual)} accent="#1d4ed8" />
          <KpiCard label="Monthly Forecast" value={money(monthlyForecast)} accent="#f59e0b" />
          <KpiCard
            label="Plan − Actual"
            value={money(planVsActualVar)}
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <KpiCard label="CAPEX Approved" value={money(capexApproved)} accent="#1d4ed8" />
          <KpiCard label="CAPEX Incurred" value={money(capexIncurred)} accent="#3b82f6" />
          <KpiCard label="OPEX Approved" value={money(opexApproved)} accent="#15803d" />
          <KpiCard label="OPEX Incurred" value={money(opexIncurred)} accent="#22c55e" />
          <KpiCard label="Total Budget" value={money(totalBudget)} accent="#8b5cf6" />
          <KpiCard label="Total Incurred" value={money(totalIncurred)} accent="#f59e0b" />
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
          <ExpandableChart
            title="Monthly Cashflow — Planned vs Actual vs Forecast"
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
