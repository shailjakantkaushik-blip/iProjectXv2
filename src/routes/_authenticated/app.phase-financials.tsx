import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PROJECT_PORTFOLIO_SELECT, FINANCIALS_MONTHLY_SELECT, STAGE_GATES_SELECT, STAGE_GATE_DEFINITIONS_SELECT } from "@/lib/query-selects";
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
  PieChart,
  Pie,
  Cell,
  LabelList,
} from "recharts";
import { ChartLegendList, legendItemsFromCounts } from "@/components/chart-legend-list";
import { ExpandableChart } from "@/components/expandable-chart";
import { groupGatesByProject } from "@/lib/project-phase";
import {
  formatProjectStreamRef,
  formatStreamLabel,
  fetchOrgStreams,
} from "@/lib/project-streams";
import {
  monthlyInWindow,
  monthlyTriple,
  phaseWindowsFromGates,
  stageMatchesPhaseFilter,
  type MonthlyFinanceRow,
} from "@/lib/finance-lifecycle";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/phase-financials")({
  component: PhaseFinancialsPage,
});

const fmtM = (n: number) => `$${(n / 1e6).toFixed(2)}M`;
/** Search/filter text includes both raw and $M display so column filters match what users see. */
const moneyFilterValue = (n: number) => `${n} ${fmtM(n)}`;
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
const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#22c55e", "#ec4899"];

function PhaseFinancialsPage() {
  const { organization } = useAuth();
  const [filters, setFilters] = useState<PortfolioFilterState>(emptyFilters);

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

  const { data: streams = [] } = useQuery({
    queryKey: ["project_streams", organization?.id],
    queryFn: async () => (organization ? fetchOrgStreams(organization.id) : []),
    enabled: !!organization,
  });

  const { data: monthly = [] } = useQuery({
    queryKey: ["financials_monthly", organization?.id],
    queryFn: async () =>
      (await supabase.from("financials_monthly").select(FINANCIALS_MONTHLY_SELECT as "*").order("period_month")).data ?? [],
    enabled: !!organization,
  });

  const filtered = useMemo(
    () => applyFilters(projects, filters, { phaseMode: "ignore" }),
    [projects, filters],
  );
  const filteredIds = useMemo(() => new Set(filtered.map((p: any) => p.id)), [filtered]);

  const orgPhases = useMemo(() => {
    const configured = gateDefs.map((g: any) => g.gate_name).filter(Boolean);
    return configured.length ? configured : DEFAULT_STAGES;
  }, [gateDefs]);

  const gatesByProject = useMemo(() => groupGatesByProject(gates as any[]), [gates]);

  const streamsByProject = useMemo(() => {
    const m = new Map<string, any[]>();
    (streams as any[]).forEach((s) => {
      if (!filteredIds.has(s.project_id)) return;
      const list = m.get(s.project_id) || [];
      list.push(s);
      m.set(s.project_id, list);
    });
    for (const list of m.values()) {
      list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    return m;
  }, [streams, filteredIds]);

  /** Monthly rows keyed by lane: stream_id when set, else project_id. */
  const monthlyByLane = useMemo(() => {
    const m = new Map<string, MonthlyFinanceRow[]>();
    for (const row of monthly as MonthlyFinanceRow[]) {
      if (!filteredIds.has(row.project_id)) continue;
      const key = row.stream_id || row.project_id;
      const list = m.get(key) || [];
      list.push(row);
      m.set(key, list);
    }
    return m;
  }, [monthly, filteredIds]);

  type LaneSpend = {
    key: string;
    project: any;
    streamLabel: string | null;
    streamRef: string | null;
    stage: string;
    planned: number;
    actual: number;
    forecast: number;
    ftePlan: number;
    fteActual: number;
  };

  const sumFte = (rows: MonthlyFinanceRow[]) => ({
    ftePlan: rows.reduce((s, r) => s + Number(r.opex_labor_planned || 0), 0),
    fteActual: rows.reduce((s, r) => s + Number(r.opex_labor_actual || 0), 0),
  });

  const laneSpendRowsAll = useMemo(() => {
    const out: LaneSpend[] = [];

    const attributeLane = (
      project: any,
      stream: any | null,
      pgates: any[],
      rows: MonthlyFinanceRow[],
    ) => {
      const windows = phaseWindowsFromGates(pgates, orgPhases);
      const streamLabel = stream ? formatStreamLabel(stream) : null;
      const streamRef = stream ? formatProjectStreamRef(project, stream) : null;
      const push = (
        stage: string,
        t: { planned: number; actual: number; forecast: number },
        fte: { ftePlan: number; fteActual: number },
      ) => {
        out.push({
          key: `${project.id}:${stream?.id || "proj"}:${stage}`,
          project,
          streamLabel,
          streamRef,
          stage,
          planned: t.planned,
          actual: t.actual,
          forecast: t.forecast,
          ftePlan: fte.ftePlan,
          fteActual: fte.fteActual,
        });
      };

      if (!windows.length) {
        const stage = (stream?.current_phase as string) || project.current_phase || "Unassigned";
        push(stage, monthlyTriple(rows), sumFte(rows));
        return;
      }
      let attributed = false;
      for (const w of windows) {
        const inWin = monthlyInWindow(rows, w);
        if (!inWin.length) continue;
        push(w.stage, monthlyTriple(inWin), sumFte(inWin));
        attributed = true;
      }
      if (!attributed && rows.length) {
        push(windows[0]?.stage || "Unassigned", monthlyTriple(rows), sumFte(rows));
      }
    };

    for (const p of filtered) {
      const projectStreams = streamsByProject.get(p.id) || [];
      if (projectStreams.length > 0) {
        for (const s of projectStreams) {
          const gs = (gates as any[]).filter(
            (g) => g.stream_id === s.id || (!g.stream_id && g.project_id === p.id && s.is_default),
          );
          const rows = monthlyByLane.get(s.id) || monthlyByLane.get(p.id) || [];
          attributeLane(p, s, gs, rows);
        }
      } else {
        const gs = gatesByProject.get(p.id) || [];
        const rows = monthlyByLane.get(p.id) || [];
        attributeLane(p, null, gs, rows);
      }
    }
    return out;
  }, [filtered, orgPhases, gatesByProject, monthlyByLane, streamsByProject, gates]);

  /** Phase filter scopes attributed spend rows (gate windows), not projects.current_phase. */
  const laneSpendRows = useMemo(() => {
    if (filters.phase === "All") return laneSpendRowsAll;
    return laneSpendRowsAll.filter((r) =>
      stageMatchesPhaseFilter(r.stage, filters.phase, orgPhases),
    );
  }, [laneSpendRowsAll, filters.phase, orgPhases]);

  /**
   * True phase spend: for each org stage, sum monthly planned/actual/forecast
   * whose period falls in that gate's date window (across filtered project/stream lanes).
   */
  const byPhase = useMemo(() => {
    const stages =
      filters.phase === "All"
        ? orgPhases
        : orgPhases.filter((s) => stageMatchesPhaseFilter(s, filters.phase, orgPhases));
    const acc = new Map<
      string,
      {
        stage: string;
        planned: number;
        actual: number;
        forecast: number;
        ftePlan: number;
        fteActual: number;
        count: number;
      }
    >();
    for (const stage of stages) {
      acc.set(stage, {
        stage,
        planned: 0,
        actual: 0,
        forecast: 0,
        ftePlan: 0,
        fteActual: 0,
        count: 0,
      });
    }
    for (const row of laneSpendRows) {
      const cur = acc.get(row.stage) || {
        stage: row.stage,
        planned: 0,
        actual: 0,
        forecast: 0,
        ftePlan: 0,
        fteActual: 0,
        count: 0,
      };
      cur.planned += row.planned;
      cur.actual += row.actual;
      cur.forecast += row.forecast;
      cur.ftePlan += row.ftePlan;
      cur.fteActual += row.fteActual;
      cur.count += 1;
      acc.set(row.stage, cur);
    }

    return stages
      .map((stage) => {
        const r = acc.get(stage) || {
          stage,
          planned: 0,
          actual: 0,
          forecast: 0,
          ftePlan: 0,
          fteActual: 0,
          count: 0,
        };
        return {
          ...r,
          variance: r.planned - r.actual,
          remaining: Math.max(0, r.planned - r.actual),
        };
      })
      .concat(
        Array.from(acc.values())
          .filter((r) => !stages.includes(r.stage))
          .map((r) => ({
            ...r,
            variance: r.planned - r.actual,
            remaining: Math.max(0, r.planned - r.actual),
          })),
      );
  }, [laneSpendRows, orgPhases, filters.phase]);

  const detailColumns: ColumnarColumn<(typeof laneSpendRows)[number]>[] = useMemo(
    () => [
      { key: "project", label: "Project", getValue: (r) => r.project.project_code || r.project.name },
      { key: "stream", label: "Stream", getValue: (r) => r.streamRef || r.streamLabel || "—" },
      { key: "stage", label: "Stage", getValue: (r) => r.stage },
      {
        key: "planned",
        label: "Planned",
        getValue: (r) => moneyFilterValue(r.planned),
        getSortValue: (r) => r.planned,
      },
      {
        key: "forecast",
        label: "Forecast",
        getValue: (r) => moneyFilterValue(r.forecast),
        getSortValue: (r) => r.forecast,
      },
      {
        key: "actual",
        label: "Actual",
        getValue: (r) => moneyFilterValue(r.actual),
        getSortValue: (r) => r.actual,
      },
      {
        key: "ftePlan",
        label: "FTE plan",
        getValue: (r) => moneyFilterValue(r.ftePlan),
        getSortValue: (r) => r.ftePlan,
      },
      {
        key: "fteActual",
        label: "FTE actual",
        getValue: (r) => moneyFilterValue(r.fteActual),
        getSortValue: (r) => r.fteActual,
      },
    ],
    [],
  );
  const detailTable = useColumnarTable(laneSpendRows, detailColumns);

  const phaseColumns: ColumnarColumn<(typeof byPhase)[number]>[] = useMemo(
    () => [
      { key: "stage", label: "Stage", getValue: (r) => r.stage },
      { key: "count", label: "Lanes", getValue: (r) => r.count, getSortValue: (r) => r.count },
      {
        key: "planned",
        label: "Planned",
        getValue: (r) => moneyFilterValue(r.planned),
        getSortValue: (r) => r.planned,
      },
      {
        key: "forecast",
        label: "Forecast",
        getValue: (r) => moneyFilterValue(r.forecast),
        getSortValue: (r) => r.forecast,
      },
      {
        key: "actual",
        label: "Actual",
        getValue: (r) => moneyFilterValue(r.actual),
        getSortValue: (r) => r.actual,
      },
      {
        key: "ftePlan",
        label: "FTE plan",
        getValue: (r) => moneyFilterValue(r.ftePlan),
        getSortValue: (r) => r.ftePlan,
      },
      {
        key: "fteActual",
        label: "FTE actual",
        getValue: (r) => moneyFilterValue(r.fteActual),
        getSortValue: (r) => r.fteActual,
      },
      {
        key: "variance",
        label: "Variance",
        getValue: (r) => moneyFilterValue(r.variance),
        getSortValue: (r) => r.variance,
      },
      {
        key: "remaining",
        label: "Remaining",
        getValue: (r) => moneyFilterValue(r.remaining),
        getSortValue: (r) => r.remaining,
      },
    ],
    [],
  );
  const phaseTable = useColumnarTable(byPhase, phaseColumns);

  const totalPlanned = byPhase.reduce((s, r) => s + r.planned, 0);
  const totalActual = byPhase.reduce((s, r) => s + r.actual, 0);
  const totalForecast = byPhase.reduce((s, r) => s + r.forecast, 0);
  const totalFtePlan = byPhase.reduce((s, r) => s + r.ftePlan, 0);
  const totalFteActual = byPhase.reduce((s, r) => s + r.fteActual, 0);
  const consumed = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

  const distribution = byPhase
    .filter((r) => r.count > 0)
    .map((r) => ({ name: r.stage, value: r.count }));

  return (
    <PageExport name="Phase_Financials" title="Phase Financials">
      <PageHeading icon="💠">Phase Financials</PageHeading>
      <div className="text-sm text-muted-foreground mb-3">
        Planned vs actual vs forecast spend inside each stage-gate date window (from monthly
        cashflow), plus FTE plan (work items) vs FTE actual (timesheets). Attributed per project
        stream when streams are configured. The phase filter scopes spend to that gate window —
        not only projects whose current phase matches.
      </div>
      <PortfolioFilters
        projects={projects}
        value={filters}
        onChange={setFilters}
        phaseOptions={orgPhases}
        phaseAllLabel="All phase windows"
      />

      <SectionFrame>
        <SectionTitle>Phase KPIs (Plan vs Actual)</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <KpiCard label="Stages" value={orgPhases.length} accent="#3b82f6" />
          <KpiCard label="Planned" value={fmtM(totalPlanned)} accent="#8b5cf6" />
          <KpiCard label="Forecast" value={fmtM(totalForecast)} accent="#06b6d4" />
          <KpiCard label="Actual" value={fmtM(totalActual)} accent="#f59e0b" />
          <KpiCard label="FTE plan" value={fmtM(totalFtePlan)} accent="#6366f1" />
          <KpiCard label="FTE actual" value={fmtM(totalFteActual)} accent="#ea580c" />
          <KpiCard
            label="Actual / Planned"
            value={`${consumed.toFixed(1)}%`}
            accent={consumed > 100 ? "#ef4444" : "#22c55e"}
          />
        </div>
      </SectionFrame>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionFrame className="lg:col-span-2">
          <ExpandableChart title="Planned vs Forecast vs Actual per Phase" heightClass="h-72">
            <BarChart data={byPhase} margin={{ top: 15, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="stage" fontSize={10} />
              <YAxis fontSize={11} tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} />
              <Tooltip formatter={(v: number) => fmtM(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="planned" name="Planned" fill="#93c5fd" />
              <Bar dataKey="forecast" name="Forecast" fill="#8b5cf6" />
              <Bar dataKey="actual" name="Actual" fill="#f59e0b">
                <LabelList
                  dataKey="count"
                  position="top"
                  style={{ fontSize: 10, fill: "#334155" }}
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
        </SectionFrame>

        <SectionFrame>
          <ExpandableChart title="Lanes touching each phase window" heightClass="h-72">
            {distribution.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No phase spend yet — add monthly financials and gate dates.
              </div>
            ) : (
              <PieChart>
                <Pie
                  data={distribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {distribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            )}
          </ExpandableChart>
          <ChartLegendList
            className="mt-2"
            items={legendItemsFromCounts(
              distribution.map((d) => ({ name: d.name, value: d.value })),
              COLORS,
            )}
          />
        </SectionFrame>
      </div>

      <SectionFrame>
        <SectionTitle>Phase register</SectionTitle>
        <ColumnarToolbar
          globalQ={phaseTable.globalQ}
          onGlobalQ={phaseTable.setGlobalQ}
          shown={phaseTable.rows.length}
          total={phaseTable.total}
          dirty={phaseTable.isDirty}
          onClear={phaseTable.clearAll}
          placeholder="Search phase register…"
        />
        <div className="st-table-wrap">
          <table className="st-table table-fixed min-w-[52rem]">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr>
                {phaseColumns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={phaseTable.filters[col.key]}
                    onFilter={(v) => phaseTable.setColumnFilter(col.key, v)}
                    sortKey={phaseTable.sortKey}
                    sortDir={phaseTable.sortDir}
                    onToggleSort={phaseTable.toggleSort}
                    align={col.key === "stage" ? "left" : "right"}
                    className={col.key === "stage" ? "" : "text-right"}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {phaseTable.rows.length === 0 ? (
                <tr>
                  <td colSpan={phaseColumns.length} className="py-6 text-center text-muted-foreground">
                    No phase rows match filters
                  </td>
                </tr>
              ) : (
                phaseTable.rows.map((r) => (
                  <tr key={r.stage}>
                    {phaseColumns.map((col) => {
                      if (col.key === "stage") {
                        return (
                          <td key={col.key} className="font-medium whitespace-nowrap">
                            {r.stage}
                          </td>
                        );
                      }
                      if (col.key === "count") {
                        return (
                          <td key={col.key} className="text-right tabular-nums whitespace-nowrap">
                            {r.count}
                          </td>
                        );
                      }
                      if (col.key === "variance") {
                        return (
                          <td
                            key={col.key}
                            className={
                              "text-right tabular-nums whitespace-nowrap " +
                              (r.variance < 0 ? "text-red-600" : "text-emerald-700")
                            }
                          >
                            {fmtM(r.variance)}
                          </td>
                        );
                      }
                      const amount =
                        col.key === "planned"
                          ? r.planned
                          : col.key === "forecast"
                            ? r.forecast
                            : col.key === "actual"
                              ? r.actual
                              : col.key === "ftePlan"
                                ? r.ftePlan
                                : col.key === "fteActual"
                                  ? r.fteActual
                                  : r.remaining;
                      return (
                        <td key={col.key} className="text-right tabular-nums whitespace-nowrap">
                          {fmtM(amount)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Phase · stream detail</SectionTitle>
        <ColumnarToolbar
          globalQ={detailTable.globalQ}
          onGlobalQ={detailTable.setGlobalQ}
          shown={detailTable.rows.length}
          total={detailTable.total}
          dirty={detailTable.isDirty}
          onClear={detailTable.clearAll}
          placeholder="Search project / stream / stage…"
        />
        <div className="st-table-wrap">
          <table className="st-table table-fixed min-w-[48rem]">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[18%]" />
              <col className="w-[20%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr>
                {detailColumns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={detailTable.filters[col.key]}
                    onFilter={(v) => detailTable.setColumnFilter(col.key, v)}
                    sortKey={detailTable.sortKey}
                    sortDir={detailTable.sortDir}
                    onToggleSort={detailTable.toggleSort}
                    align={
                      ["planned", "forecast", "actual", "ftePlan", "fteActual"].includes(col.key)
                        ? "right"
                        : "left"
                    }
                    className={
                      ["planned", "forecast", "actual", "ftePlan", "fteActual"].includes(col.key)
                        ? "text-right"
                        : ""
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {detailTable.rows.length === 0 ? (
                <tr>
                  <td colSpan={detailColumns.length} className="py-6 text-center text-muted-foreground">
                    No stream/phase spend rows match filters
                  </td>
                </tr>
              ) : (
                detailTable.rows.map((r) => (
                  <tr key={r.key}>
                    {detailColumns.map((col) => {
                      if (col.key === "project") {
                        return (
                          <td key={col.key} className="font-medium whitespace-nowrap">
                            {r.project.project_code || r.project.name}
                          </td>
                        );
                      }
                      if (col.key === "stream") {
                        return (
                          <td key={col.key} className="font-mono text-xs whitespace-nowrap">
                            {r.streamRef || r.streamLabel || "—"}
                          </td>
                        );
                      }
                      if (col.key === "stage") {
                        return (
                          <td key={col.key} className="whitespace-nowrap">
                            {r.stage}
                          </td>
                        );
                      }
                      const amount =
                        col.key === "planned"
                          ? r.planned
                          : col.key === "forecast"
                            ? r.forecast
                            : col.key === "ftePlan"
                              ? r.ftePlan
                              : col.key === "fteActual"
                                ? r.fteActual
                                : r.actual;
                      return (
                        <td key={col.key} className="text-right tabular-nums whitespace-nowrap">
                          {fmtM(amount)}
                        </td>
                      );
                    })}
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
