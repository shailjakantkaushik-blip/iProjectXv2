import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PROJECT_PORTFOLIO_SELECT, FINANCIALS_MONTHLY_SELECT } from "@/lib/query-selects";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import {
  PortfolioFilters,
  emptyFilters,
  applyFilters,
  FyPicker,
  type PortfolioFilterState,
} from "@/components/portfolio-filters";
import { sortProjectsByCodeName } from "@/lib/project-sort";
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";
import {
  projectApprovedFunding,
  projectCapexApproved,
  projectOpexApproved,
} from "@/lib/project-finance";
import {
  fyLabelsSpanned,
  fyScopedBudget,
  fyYearWatches,
  monthlyInFyLabels,
  monthlyLayerSplit,
  sumFyAllocCapex,
  sumFyAllocOpex,
  type FyAllocRowLike,
} from "@/lib/fy-allocation-scope";
import { projectScheduleEnd, projectScheduleStart } from "@/lib/project-dates";
import type { MonthlyFinanceRow } from "@/lib/finance-lifecycle";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/budget-vs-plan")({
  component: BudgetVsPlanPage,
});

const money = (n: number) =>
  "$" +
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

const moneyFull = (n: number) =>
  "$" + new Intl.NumberFormat("en-US").format(Math.round(Number(n || 0)));

function flagLabel(over: boolean, overBy: number) {
  return over ? `Over ${moneyFull(overBy)}` : "Within";
}

function BudgetVsPlanPage() {
  const { organization } = useAuth();
  const fyStartMonth = organization?.fy_start_month || 4;
  const [filters, setFilters] = useState<PortfolioFilterState>(emptyFilters);
  const [fySelected, setFySelected] = useState<string[]>([]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () =>
      sortProjectsByCodeName(
        (await supabase
          .from("projects")
          .select(PROJECT_PORTFOLIO_SELECT as "*")
          .order("project_code")
          .order("name")).data ?? [],
      ),
    enabled: !!organization,
  });
  const { data: fyAlloc = [] } = useQuery({
    queryKey: ["fy_allocations", organization?.id],
    queryFn: async () => (await supabase.from("fy_allocations").select("*").order("fy")).data ?? [],
    enabled: !!organization,
  });
  const { data: monthly = [] } = useQuery({
    queryKey: ["financials_monthly", organization?.id, "budget-vs-plan"],
    queryFn: async () =>
      (
        await supabase
          .from("financials_monthly")
          .select(FINANCIALS_MONTHLY_SELECT as "*")
          .order("period_month")
      ).data ?? [],
    enabled: !!organization,
  });
  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", organization?.id],
    queryFn: async () =>
      (await supabase.from("stage_gates").select("id,project_id,stream_id,gate_name,status")).data ??
      [],
    enabled: !!organization,
  });

  const fyOptions = useMemo(() => {
    const s = new Set<string>();
    for (const a of fyAlloc as any[]) if (a.fy) s.add(String(a.fy));
    for (const p of projects as any[]) {
      for (const fy of fyLabelsSpanned(projectScheduleStart(p), projectScheduleEnd(p), fyStartMonth)) {
        s.add(fy);
      }
    }
    return Array.from(s).sort();
  }, [fyAlloc, projects, fyStartMonth]);

  const filtered = useMemo(
    () => applyFilters(projects, filters, { gates }),
    [projects, filters, gates],
  );

  const rows = useMemo(() => {
    return (filtered as any[]).map((p) => {
      const allocations = (fyAlloc as FyAllocRowLike[]).filter((a) => a.project_id === p.id);
      const months = monthlyInFyLabels(
        (monthly as MonthlyFinanceRow[]).filter((m) => m.project_id === p.id),
        fySelected,
        fyStartMonth,
      );
      const budget = projectApprovedFunding(p);
      const capexApproved = projectCapexApproved(p);
      const opexApproved = projectOpexApproved(p);
      const hasAlloc = allocations.length > 0;
      const allocated = fySelected.length
        ? fyScopedBudget({ allocations, overallBudget: budget, fySelected })
        : hasAlloc
          ? fyScopedBudget({
              allocations,
              overallBudget: budget,
              fySelected: allocations.map((a) => String(a.fy || "")).filter(Boolean),
            })
          : budget;
      const allocCapex = hasAlloc
        ? sumFyAllocCapex(allocations, fySelected.length ? fySelected : null, p)
        : capexApproved;
      const allocOpex = hasAlloc
        ? sumFyAllocOpex(allocations, fySelected.length ? fySelected : null, p)
        : opexApproved;
      const plan = monthlyLayerSplit(months, "planned");
      const actual = monthlyLayerSplit(months, "actual");
      const forecast = monthlyLayerSplit(months, "forecast");
      const capexOver = plan.capex - allocCapex;
      const opexOver = plan.opex - allocOpex;
      const totalOver = Math.max(plan.total, actual.total, forecast.total) - allocated;
      return {
        id: p.id,
        project_code: p.project_code || "",
        name: p.name || "",
        program: p.program || "",
        budget,
        capexApproved,
        opexApproved,
        allocated,
        allocCapex,
        allocOpex,
        planCapex: plan.capex,
        planOpex: plan.opex,
        planTotal: plan.total,
        forecastCapex: forecast.capex,
        forecastOpex: forecast.opex,
        forecastTotal: forecast.total,
        actualCapex: actual.capex,
        actualOpex: actual.opex,
        actualTotal: actual.total,
        capexOver,
        opexOver,
        totalOver,
        over: allocated > 0 && (totalOver > 0 || capexOver > 0 || opexOver > 0),
        project: p,
      };
    });
  }, [filtered, fyAlloc, monthly, fySelected, fyStartMonth]);

  const fyRows = useMemo(() => {
    const out: {
      id: string;
      project_code: string;
      name: string;
      fy: string;
      allocated: number;
      allocCapex: number;
      allocOpex: number;
      planCapex: number;
      planOpex: number;
      forecastCapex: number;
      forecastOpex: number;
      actualCapex: number;
      actualOpex: number;
      over: boolean;
    }[] = [];
    for (const p of filtered as any[]) {
      const watches = fyYearWatches({
        allocations: (fyAlloc as FyAllocRowLike[]).filter((a) => a.project_id === p.id),
        monthly: (monthly as MonthlyFinanceRow[]).filter((m) => m.project_id === p.id),
        fyStartMonth,
        overallBudget: projectApprovedFunding(p),
        project: p,
      });
      for (const w of watches) {
        if (fySelected.length && !fySelected.includes(w.fy)) continue;
        out.push({
          id: `${p.id}|${w.fy}`,
          project_code: p.project_code || "",
          name: p.name || "",
          fy: w.fy,
          allocated: w.allocation,
          allocCapex: w.allocCapex,
          allocOpex: w.allocOpex,
          planCapex: w.planCapex,
          planOpex: w.planOpex,
          forecastCapex: w.forecastCapex,
          forecastOpex: w.forecastOpex,
          actualCapex: w.actualCapex,
          actualOpex: w.actualOpex,
          over: w.allocation > 0 && (w.overBy > 0 || w.capexOverBy > 0 || w.opexOverBy > 0),
        });
      }
    }
    return out;
  }, [filtered, fyAlloc, monthly, fySelected, fyStartMonth]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (s, r) => ({
          budget: s.budget + r.budget,
          allocated: s.allocated + r.allocated,
          plan: s.plan + r.planTotal,
          forecast: s.forecast + r.forecastTotal,
          actual: s.actual + r.actualTotal,
          over: s.over + (r.over ? 1 : 0),
        }),
        { budget: 0, allocated: 0, plan: 0, forecast: 0, actual: 0, over: 0 },
      ),
    [rows],
  );

  const chart = useMemo(
    () =>
      rows.slice(0, 12).map((r) => ({
        name: r.project_code || r.name,
        Budget: Math.round(r.budget),
        Allocated: Math.round(r.allocated),
        Plan: Math.round(r.planTotal),
        Forecast: Math.round(r.forecastTotal),
        Actual: Math.round(r.actualTotal),
      })),
    [rows],
  );

  const columns: ColumnarColumn<(typeof rows)[number]>[] = useMemo(
    () => [
      { key: "project_code", label: "Code" },
      { key: "name", label: "Project" },
      { key: "budget", label: "Budget" },
      { key: "capexApproved", label: "CapEx approved" },
      { key: "opexApproved", label: "OpEx approved" },
      { key: "allocated", label: fySelected.length ? "FY allocation" : "Allocated" },
      { key: "allocCapex", label: "Alloc CapEx" },
      { key: "allocOpex", label: "Alloc OpEx" },
      { key: "planCapex", label: "Plan CapEx" },
      { key: "planOpex", label: "Plan OpEx" },
      { key: "forecastTotal", label: "Forecast" },
      { key: "actualTotal", label: "Actual" },
      { key: "over", label: "vs allocation" },
    ],
    [fySelected.length],
  );
  const table = useColumnarTable(rows, columns);

  const fyColumns: ColumnarColumn<(typeof fyRows)[number]>[] = useMemo(
    () => [
      { key: "project_code", label: "Code" },
      { key: "name", label: "Project" },
      { key: "fy", label: "FY" },
      { key: "allocCapex", label: "Alloc CapEx" },
      { key: "planCapex", label: "Plan CapEx" },
      { key: "forecastCapex", label: "Fcst CapEx" },
      { key: "actualCapex", label: "Actual CapEx" },
      { key: "allocOpex", label: "Alloc OpEx" },
      { key: "planOpex", label: "Plan OpEx" },
      { key: "forecastOpex", label: "Fcst OpEx" },
      { key: "actualOpex", label: "Actual OpEx" },
      { key: "over", label: "vs allocation" },
    ],
    [],
  );
  const fyTable = useColumnarTable(fyRows, fyColumns);

  return (
    <PageExport name="Budget_vs_Plan" title="Budget vs Plan vs Actuals">
      <PageHeading icon="📒">Budget vs Plan vs Actuals</PageHeading>
      <p className="mb-3 max-w-4xl text-sm text-muted-foreground">
        Overall budget is CapEx approved + OpEx approved. That envelope is allocated to financial
        years (including CapEx/OpEx). Estimation Plan is validated against those year slices.
        Forecast is the outlook; Actuals are incurred.{" "}
        <Link to="/app/fy-allocation" className="font-medium text-primary hover:underline">
          FY Allocation
        </Link>{" "}
        ·{" "}
        <Link to="/app/project-forecast" className="font-medium text-primary hover:underline">
          Estimation Planning
        </Link>
      </p>

      <PortfolioFilters projects={projects} value={filters} onChange={setFilters} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FyPicker options={fyOptions} selected={fySelected} onChange={setFySelected} />
        {fySelected.length ? (
          <span className="text-[11px] text-muted-foreground">
            Allocation, plan, forecast, and actuals are months in {fySelected.join(", ")}.
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            No FY selected — allocated is the sum of year slices (or overall budget if none).
          </span>
        )}
      </div>

      <SectionFrame>
        <SectionTitle>Portfolio</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Overall budget" value={money(totals.budget)} accent="#1d4ed8" />
          <KpiCard label="Allocated" value={money(totals.allocated)} accent="#3b82f6" />
          <KpiCard label="Plan" value={money(totals.plan)} accent="#15803d" />
          <KpiCard label="Forecast" value={money(totals.forecast)} accent="#c2410c" />
          <KpiCard label="Actual" value={money(totals.actual)} accent="#be185d" />
          <KpiCard
            label="Projects over allocation"
            value={String(totals.over)}
            accent={totals.over ? "#ef4444" : "#22c55e"}
          />
        </div>
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart title="Budget · Allocated · Plan · Forecast · Actual" heightClass="h-72">
          <BarChart data={chart} margin={{ top: 16, right: 12, left: 0, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
            <XAxis dataKey="name" fontSize={10} angle={-25} textAnchor="end" interval={0} />
            <YAxis fontSize={11} tickFormatter={money} />
            <Tooltip formatter={(v: number) => moneyFull(Number(v))} />
            <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Budget" fill="#1d4ed8" />
            <Bar dataKey="Allocated" fill="#93c5fd" />
            <Bar dataKey="Plan" fill="#15803d" />
            <Bar dataKey="Forecast" fill="#c2410c" />
            <Bar dataKey="Actual" fill="#be185d" />
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>By project</SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          dirty={table.isDirty}
          onClear={table.clearAll}
          placeholder="Search projects…"
        />
        <div className="max-h-[480px] overflow-auto">
          <table className="st-table">
            <thead className="sticky top-0 bg-white">
              <tr>
                {columns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={table.filters[col.key]}
                    onFilter={(v) => table.setColumnFilter(col.key, v)}
                    sortKey={table.sortKey}
                    sortDir={table.sortDir}
                    onToggleSort={table.toggleSort}
                    align={col.key === "project_code" || col.key === "name" || col.key === "over" ? "left" : "right"}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-8 text-center text-sm text-muted-foreground">
                    No projects in this filter.
                  </td>
                </tr>
              ) : (
                table.rows.map((r) => (
                  <tr key={r.id} className={r.over ? "bg-rose-50/70" : undefined}>
                    <td className="font-mono text-[11px]">
                      <Link
                        to="/app/project-infographic"
                        search={{ pid: r.id }}
                        className="text-primary hover:underline"
                      >
                        {r.project_code || "—"}
                      </Link>
                    </td>
                    <td>{r.name}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.budget)}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.capexApproved)}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.opexApproved)}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.allocated)}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.allocCapex)}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.allocOpex)}</td>
                    <td
                      className={`text-right tabular-nums ${r.capexOver > 0 ? "font-semibold text-rose-700" : ""}`}
                    >
                      {moneyFull(r.planCapex)}
                    </td>
                    <td
                      className={`text-right tabular-nums ${r.opexOver > 0 ? "font-semibold text-rose-700" : ""}`}
                    >
                      {moneyFull(r.planOpex)}
                    </td>
                    <td className="text-right tabular-nums">{moneyFull(r.forecastTotal)}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.actualTotal)}</td>
                    <td className={r.over ? "font-medium text-rose-700" : "text-emerald-700"}>
                      {r.over
                        ? [
                            r.capexOver > 0 ? `CapEx ${flagLabel(true, r.capexOver)}` : null,
                            r.opexOver > 0 ? `OpEx ${flagLabel(true, r.opexOver)}` : null,
                            r.totalOver > 0 && r.capexOver <= 0 && r.opexOver <= 0
                              ? flagLabel(true, r.totalOver)
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Over"
                        : "Within"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>By financial year</SectionTitle>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Each year&apos;s CapEx/OpEx allocation vs Estimation Plan, Forecast, and Actuals for that
          FY window.
        </p>
        <ColumnarToolbar
          globalQ={fyTable.globalQ}
          onGlobalQ={fyTable.setGlobalQ}
          shown={fyTable.rows.length}
          total={fyTable.total}
          dirty={fyTable.isDirty}
          onClear={fyTable.clearAll}
          placeholder="Search FY rows…"
        />
        <div className="max-h-[420px] overflow-auto">
          <table className="st-table">
            <thead className="sticky top-0 bg-white">
              <tr>
                {fyColumns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={fyTable.filters[col.key]}
                    onFilter={(v) => fyTable.setColumnFilter(col.key, v)}
                    sortKey={fyTable.sortKey}
                    sortDir={fyTable.sortDir}
                    onToggleSort={fyTable.toggleSort}
                    align={
                      col.key === "project_code" || col.key === "name" || col.key === "fy" || col.key === "over"
                        ? "left"
                        : "right"
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {fyTable.rows.length === 0 ? (
                <tr>
                  <td colSpan={fyColumns.length} className="py-8 text-center text-sm text-muted-foreground">
                    No FY allocation or monthly rows yet.
                  </td>
                </tr>
              ) : (
                fyTable.rows.map((r) => (
                  <tr key={r.id} className={r.over ? "bg-rose-50/70" : undefined}>
                    <td className="font-mono text-[11px]">{r.project_code || "—"}</td>
                    <td>{r.name}</td>
                    <td className="font-medium">{r.fy}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.allocCapex)}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.planCapex)}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.forecastCapex)}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.actualCapex)}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.allocOpex)}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.planOpex)}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.forecastOpex)}</td>
                    <td className="text-right tabular-nums">{moneyFull(r.actualOpex)}</td>
                    <td className={r.over ? "font-medium text-rose-700" : "text-emerald-700"}>
                      {r.over ? "Over" : "Within"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </PageExport>
  );
}
