import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle, PageHeading, KpiCard } from "@/components/streamlit";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList, Cell } from "recharts";
import { ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ExpandableChart } from "@/components/expandable-chart";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/portfolio-movements")({
  component: Movements,
});

function daysBetween(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

function Movements() {
  const { organization } = useAuth();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => (await supabase.from("projects").select("*")).data ?? [],
    enabled: !!organization,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", organization?.id],
    queryFn: async () => (await supabase.from("stage_gates").select("*")).data ?? [],
    enabled: !!organization,
  });

  const { data: changes = [] } = useQuery({
    queryKey: ["change_requests", organization?.id],
    queryFn: async () => (await supabase.from("change_requests").select("*")).data ?? [],
    enabled: !!organization,
  });

  // Stage gate slippage
  const slippage = useMemo(() => {
    const rows: {
      project: string;
      gate: string;
      planned?: string;
      actual?: string;
      delta: number | null;
      status: string;
    }[] = [];
    gates.forEach((g: any) => {
      const proj = projects.find((p: any) => p.id === g.project_id);
      if (!proj) return;
      rows.push({
        project: proj.name,
        gate: g.gate_name,
        planned: g.planned_date,
        actual: g.actual_date,
        delta: daysBetween(g.planned_date, g.actual_date),
        status: g.status || "Pending",
      });
    });
    return rows.filter((r) => r.delta !== null).sort((a, b) => (b.delta || 0) - (a.delta || 0));
  }, [gates, projects]);

  const onTime = slippage.filter((r) => (r.delta || 0) <= 0).length;
  const late = slippage.filter((r) => (r.delta || 0) > 0 && (r.delta || 0) <= 14).length;
  const veryLate = slippage.filter((r) => (r.delta || 0) > 14).length;
  const avgDelta = slippage.length
    ? Math.round(slippage.reduce((s, r) => s + (r.delta || 0), 0) / slippage.length)
    : 0;

  const topSlips = slippage.slice(0, 10);
  const chartData = topSlips.map((r) => ({
    name: `${r.project.slice(0, 15)} · ${r.gate}`,
    delta: r.delta || 0,
  }));

  // Scope/schedule change impacts
  const totalCostImpact = changes.reduce((s: number, c: any) => s + Number(c.impact_cost || 0), 0);
  const totalDayImpact = changes.reduce(
    (s: number, c: any) => s + Number(c.impact_schedule_days || 0),
    0,
  );
  const approvedCR = changes.filter((c: any) => c.status === "Approved").length;
  const openCR = changes.filter((c: any) => c.status === "Open" || c.status === "In Review").length;

  const crColumns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "cr_number", label: "CR#" },
      { key: "title", label: "Title" },
      { key: "change_type", label: "Type" },
      { key: "status", label: "Status" },
      {
        key: "impact_cost",
        label: "Cost $",
        getValue: (c) => Number(c.impact_cost || 0),
      },
      {
        key: "impact_schedule_days",
        label: "Days",
        getValue: (c) => Number(c.impact_schedule_days || 0),
      },
      {
        key: "raised_date",
        label: "Raised",
        getValue: (c) => (c.raised_date ? new Date(c.raised_date).toLocaleDateString() : ""),
      },
    ],
    [],
  );
  const crTable = useColumnarTable(changes, crColumns);

  const gateDetailRows = useMemo(() => slippage.slice(0, 30), [slippage]);
  const gateColumns: ColumnarColumn<(typeof gateDetailRows)[number]>[] = useMemo(
    () => [
      { key: "project", label: "Project" },
      { key: "gate", label: "Gate" },
      { key: "status", label: "Status" },
      {
        key: "planned",
        label: "Planned",
        getValue: (r) => (r.planned ? new Date(r.planned).toLocaleDateString() : ""),
      },
      {
        key: "actual",
        label: "Actual",
        getValue: (r) => (r.actual ? new Date(r.actual).toLocaleDateString() : ""),
      },
      { key: "delta", label: "Delta", getValue: (r) => r.delta ?? 0 },
    ],
    [],
  );
  const gateTable = useColumnarTable(gateDetailRows, gateColumns);

  return (
    <div>
      <PageHeading
        icon="🔀"
        title="Portfolio Movements"
        subtitle="Stage-gate slippage & change requests moving the portfolio."
      />

      <SectionFrame>
        <SectionTitle>Movement KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Gate Events" value={slippage.length} accent="#3b82f6" />
          <KpiCard label="On-Time" value={onTime} accent="#22c55e" />
          <KpiCard label="Late (≤14d)" value={late} accent="#f59e0b" />
          <KpiCard label="Very Late (>14d)" value={veryLate} accent="#ef4444" />
          <KpiCard label="Avg Slippage" value={`${avgDelta}d`} accent="#8b5cf6" />
          <KpiCard
            label="Open CRs"
            value={openCR}
            sub={`${approvedCR} approved`}
            accent="#06b6d4"
          />
        </div>
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart title="Top 10 Gate Slippage (days late)" heightClass="h-72">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 40, left: 140, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} />
            <Tooltip formatter={(v: number) => `${v} days`} />
            <Bar dataKey="delta" radius={[0, 4, 4, 0]}>
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.delta > 14 ? "#ef4444" : d.delta > 0 ? "#f59e0b" : "#22c55e"}
                />
              ))}
              <LabelList
                dataKey="delta"
                position="right"
                formatter={(v: number) => `${v}d`}
                style={{ fontSize: 10, fill: "#334155" }}
              />
            </Bar>
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Change Request Impact</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-3">
          <KpiCard label="Total CRs" value={changes.length} accent="#3b82f6" />
          <KpiCard
            label="Cost Impact"
            value={`$${(totalCostImpact / 1e6).toFixed(2)}M`}
            accent="#ef4444"
          />
          <KpiCard label="Schedule Impact" value={`${totalDayImpact}d`} accent="#f59e0b" />
          <KpiCard label="Approved" value={approvedCR} accent="#22c55e" />
        </div>
        <ColumnarToolbar
          globalQ={crTable.globalQ}
          onGlobalQ={crTable.setGlobalQ}
          shown={crTable.rows.length}
          total={crTable.total}
          dirty={crTable.isDirty}
          onClear={crTable.clearAll}
          placeholder="Search change requests…"
        />
        <div className="overflow-x-auto">
          <table className="st-table">
            <thead>
              <tr>
                {crColumns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={crTable.filters[col.key]}
                    onFilter={(v) => crTable.setColumnFilter(col.key, v)}
                    sortKey={crTable.sortKey}
                    sortDir={crTable.sortDir}
                    onToggleSort={crTable.toggleSort}
                    align={
                      col.key === "impact_cost" || col.key === "impact_schedule_days"
                        ? "right"
                        : "left"
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {crTable.rows.length === 0 ? (
                <tr>
                  <td colSpan={crColumns.length} className="text-center text-muted-foreground py-4">
                    {crTable.total === 0
                      ? "No change requests recorded."
                      : "No matching change requests."}
                  </td>
                </tr>
              ) : (
                crTable.rows.map((c: any) => (
                  <tr key={c.id}>
                    <td className="font-mono text-[11px]">{c.cr_number || "—"}</td>
                    <td className="font-medium">{c.title}</td>
                    <td>{c.change_type || "—"}</td>
                    <td>{c.status || "—"}</td>
                    <td className="text-right tabular-nums">
                      {Number(c.impact_cost || 0).toLocaleString()}
                    </td>
                    <td className="text-right tabular-nums flex items-center justify-end gap-1">
                      {Number(c.impact_schedule_days || 0) > 0 ? (
                        <TrendingUp className="h-3 w-3 text-red-500" />
                      ) : Number(c.impact_schedule_days || 0) < 0 ? (
                        <TrendingDown className="h-3 w-3 text-green-500" />
                      ) : (
                        <Minus className="h-3 w-3 text-muted-foreground" />
                      )}
                      {c.impact_schedule_days || 0}
                    </td>
                    <td>{c.raised_date ? new Date(c.raised_date).toLocaleDateString() : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Gate Movement Detail</SectionTitle>
        <ColumnarToolbar
          globalQ={gateTable.globalQ}
          onGlobalQ={gateTable.setGlobalQ}
          shown={gateTable.rows.length}
          total={gateTable.total}
          dirty={gateTable.isDirty}
          onClear={gateTable.clearAll}
          placeholder="Search gate movements…"
        />
        <div className="overflow-x-auto">
          <table className="st-table">
            <thead>
              <tr>
                {gateColumns.slice(0, 4).map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={gateTable.filters[col.key]}
                    onFilter={(v) => gateTable.setColumnFilter(col.key, v)}
                    sortKey={gateTable.sortKey}
                    sortDir={gateTable.sortDir}
                    onToggleSort={gateTable.toggleSort}
                  />
                ))}
                <th></th>
                {gateColumns.slice(4).map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={gateTable.filters[col.key]}
                    onFilter={(v) => gateTable.setColumnFilter(col.key, v)}
                    sortKey={gateTable.sortKey}
                    sortDir={gateTable.sortDir}
                    onToggleSort={gateTable.toggleSort}
                    align={col.key === "delta" ? "right" : "left"}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {gateTable.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={gateColumns.length + 1}
                    className="text-center text-muted-foreground py-4"
                  >
                    {gateTable.total === 0 ? "No gate movements recorded." : "No matching rows."}
                  </td>
                </tr>
              ) : (
                gateTable.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-medium">{r.project}</td>
                    <td>{r.gate}</td>
                    <td>{r.status}</td>
                    <td>{r.planned ? new Date(r.planned).toLocaleDateString() : "—"}</td>
                    <td>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </td>
                    <td>{r.actual ? new Date(r.actual).toLocaleDateString() : "—"}</td>
                    <td
                      className={`text-right tabular-nums font-semibold ${(r.delta || 0) > 14 ? "text-red-600" : (r.delta || 0) > 0 ? "text-amber-600" : "text-emerald-600"}`}
                    >
                      {(r.delta || 0) > 0 ? "+" : ""}
                      {r.delta}d
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </div>
  );
}
