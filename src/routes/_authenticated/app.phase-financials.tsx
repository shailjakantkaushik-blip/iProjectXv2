import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  PieChart,
  Pie,
  Cell,
  LabelList,
} from "recharts";
import { ChartLegendList, legendItemsFromCounts } from "@/components/chart-legend-list";
import { ExpandableChart } from "@/components/expandable-chart";
import { groupGatesByProject } from "@/lib/project-phase";
import { formatProjectStreamRef, formatStreamLabel, fetchOrgStreams } from "@/lib/project-streams";
import {
  monthKey,
  monthlyInWindow,
  monthlyTriple,
  phaseWindowsFromGates,
  uniqueGatesForPhaseWindows,
  stageMatchesPhaseFilter,
  type MonthlyFinanceRow,
} from "@/lib/finance-lifecycle";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";
import { explainForecast, explainGeneric } from "@/lib/explain-metric";

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
      (
        await supabase
          .from("projects")
          .select(PROJECT_PORTFOLIO_SELECT as "*")
          .order("project_code")
          .order("name")
      ).data ?? [],
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
    queryFn: async () =>
      (await supabase.from("stage_gates").select(STAGE_GATES_SELECT as "*")).data ?? [],
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
      (
        await supabase
          .from("financials_monthly")
          .select(FINANCIALS_MONTHLY_SELECT as "*")
          .order("period_month")
      ).data ?? [],
    enabled: !!organization,
  });

  const filtered = useMemo(
    () => applyFilters(projects, filters, { phaseMode: "ignore", gates }),
    [projects, filters, gates],
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

  /** Monthly rows keyed by lane: stream_id when set, else project_id.
   * Skip a blank-stream month only when that same period already has a stream row
   * (Plan + Forecast columns). Other blank months still attach to Core. */
  const monthlyByLane = useMemo(() => {
    const m = new Map<string, MonthlyFinanceRow[]>();
    const streamMonths = new Set<string>();
    for (const row of monthly as MonthlyFinanceRow[]) {
      if (!filteredIds.has(row.project_id) || !row.stream_id) continue;
      streamMonths.add(`${row.project_id}|${monthKey(row.period_month)}`);
    }
    for (const row of monthly as MonthlyFinanceRow[]) {
      if (!filteredIds.has(row.project_id)) continue;
      if (
        !row.stream_id &&
        streamMonths.has(`${row.project_id}|${monthKey(row.period_month)}`)
      ) {
        continue;
      }
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
      const windows = phaseWindowsFromGates(uniqueGatesForPhaseWindows(pgates), orgPhases);
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
          const inheritProjectMonthly = Boolean(s.is_default) || projectStreams.length === 1;
          const rows =
            monthlyByLane.get(s.id) ||
            (inheritProjectMonthly ? monthlyByLane.get(p.id) : undefined) ||
            [];
          attributeLane(p, s, gs, rows);
        }
      } else {
        const gs = gatesByProject.get(p.id) || [];
        const rows = monthlyByLane.get(p.id) || [];
        attributeLane(p, null, gs, rows);
      }
    }
    const merged = new Map<string, LaneSpend>();
    for (const r of out) {
      const prev = merged.get(r.key);
      if (!prev) {
        merged.set(r.key, { ...r });
        continue;
      }
      prev.planned += r.planned;
      prev.actual += r.actual;
      prev.forecast += r.forecast;
      prev.ftePlan += r.ftePlan;
      prev.fteActual += r.fteActual;
    }
    return Array.from(merged.values());
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
      {
        key: "project",
        label: "Project",
        getValue: (r) => r.project.project_code || r.project.name,
      },
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

  const totalPlanned = byPhase.reduce((s, r) => s + r.planned, 0);
  const totalActual = byPhase.reduce((s, r) => s + r.actual, 0);
  const totalForecast = byPhase.reduce((s, r) => s + r.forecast, 0);
  const totalFtePlan = byPhase.reduce((s, r) => s + r.ftePlan, 0);
  const totalFteActual = byPhase.reduce((s, r) => s + r.fteActual, 0);
  const consumed = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

  const distribution = byPhase
    .filter((r) => r.count > 0)
    .map((r) => ({ name: r.stage, value: r.count }));

  const explainForecastPhase = explainForecast({
    label: "Phase Forecast",
    currentForecast: totalForecast,
    monthly: monthly as MonthlyFinanceRow[],
    projects: filtered as any[],
  });
  const explainFte = explainGeneric({
    label: "FTE actual",
    value: fmtM(totalFteActual),
    headline:
      totalFtePlan > 0
        ? `Actual FTE is ${(((totalFteActual - totalFtePlan) / totalFtePlan) * 100).toFixed(0)}% ${totalFteActual >= totalFtePlan ? "above" : "below"} plan across phase windows`
        : `Actual FTE in phase windows is ${fmtM(totalFteActual)}`,
    bullets: [
      `FTE plan ${fmtM(totalFtePlan)}`,
      `FTE actual ${fmtM(totalFteActual)}`,
      `Variance ${fmtM(totalFteActual - totalFtePlan)}`,
    ],
  });
  const explainConsumed = explainGeneric({
    label: "Actual / Planned",
    value: `${consumed.toFixed(1)}%`,
    headline:
      consumed > 100
        ? `Actuals exceed phase planned spend (${consumed.toFixed(1)}%)`
        : `Phase actuals are at ${consumed.toFixed(1)}% of planned`,
    bullets: [
      `Planned ${fmtM(totalPlanned)}`,
      `Actual ${fmtM(totalActual)}`,
      `Forecast ${fmtM(totalForecast)}`,
    ],
  });

  return (
    <PageExport name="Phase_Financials" title="Phase Financials">
      <PageHeading icon="💠">Phase Financials</PageHeading>
      <div className="text-sm text-muted-foreground mb-3">
        Monthly financials have no stage-gate column. This page maps each month onto a phase using
        the gate <strong>planned date</strong> window (from that gate until the month before the
        next gate). <strong>Plan</strong> (OpEx / FTE) comes from Project Estimation Planning →
        Apply. <strong>Forecast</strong> comes from FY Allocation. Those are columns on the same
        project · stream · month row — not two records. CapEx plan is the FY budget split. Actuals
        are incurred spend. Duplicate gate names (project-level copy + stream gate) are merged.
        Blank-stream monthly rows attach to the Core / default stream only.
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
          <KpiCard
            label="Forecast"
            value={fmtM(totalForecast)}
            accent="#06b6d4"
            explain={explainForecastPhase}
          />
          <KpiCard label="Actual" value={fmtM(totalActual)} accent="#f59e0b" />
          <KpiCard label="FTE plan" value={fmtM(totalFtePlan)} accent="#6366f1" />
          <KpiCard
            label="FTE actual"
            value={fmtM(totalFteActual)}
            accent="#ea580c"
            explain={explainFte}
          />
          <KpiCard
            label="Actual / Planned"
            value={`${consumed.toFixed(1)}%`}
            accent={consumed > 100 ? "#ef4444" : "#22c55e"}
            explain={explainConsumed}
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
        <SectionTitle>Phase · stream detail</SectionTitle>
        <p className="mb-2 text-[12px] text-muted-foreground">
          Stage is inferred from gate planned dates, not a column on Financials Monthly. Same
          project · stream · phase is shown once.
        </p>
        <ColumnarToolbar
          globalQ={detailTable.globalQ}
          onGlobalQ={detailTable.setGlobalQ}
          shown={detailTable.rows.length}
          total={detailTable.total}
          dirty={detailTable.isDirty}
          onClear={detailTable.clearAll}
          placeholder="Search project / stream / stage…"
        />
        <div className="st-table-wrap overflow-x-auto">
          <table className="st-table !w-max min-w-full text-xs">
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
                        ? "st-num whitespace-nowrap"
                        : col.key === "project" || col.key === "stream"
                          ? "min-w-[7rem] whitespace-nowrap"
                          : "whitespace-nowrap"
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {detailTable.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={detailColumns.length}
                    className="py-6 text-center text-muted-foreground"
                  >
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
                        <td
                          key={col.key}
                          className="st-num text-right tabular-nums whitespace-nowrap"
                        >
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
