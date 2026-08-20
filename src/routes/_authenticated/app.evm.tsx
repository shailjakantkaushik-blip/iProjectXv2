import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { PageLoading } from "@/components/page-loading";
import {
  PortfolioFilters,
  emptyFilters,
  applyFilters,
  type PortfolioFilterState,
} from "@/components/portfolio-filters";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";
import {
  computeProjectEvm,
  evmHealth,
  formatIndex,
  type EvmMetrics,
} from "@/lib/evm";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";
import { EntityComments } from "@/components/entity-comments";

export const Route = createFileRoute("/_authenticated/app/evm")({
  component: EvmPage,
});

const money = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

const PROJECT_EVM_SELECT = [
  "id",
  "project_code",
  "name",
  "status",
  "rag",
  "portfolio",
  "program",
  "budget",
  "baseline_budget",
  "baseline_capex",
  "baseline_opex",
  "baseline_date",
  "baseline_label",
  "capex_approved",
  "opex_approved",
  "capex_incurred",
  "opex_incurred",
  "start_date",
  "end_date",
  "planned_start_date",
  "planned_end_date",
  "actual_start_date",
  "actual_end_date",
  "delivery_method",
  "current_phase",
].join(",");

function EvmPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [filters, setFilters] = useState<PortfolioFilterState>(emptyFilters);
  const [selectedId, setSelectedId] = useState<string>("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects", orgId, "evm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(PROJECT_EVM_SELECT as "*")
        .order("project_code");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: workItems = [] } = useQuery({
    queryKey: ["work_items", orgId, "evm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_items" as any)
        .select("id,project_id,percent_complete,estimate_hours,status")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });

  const { data: monthly = [] } = useQuery({
    queryKey: ["financials_monthly", orgId, "evm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financials_monthly")
        .select("project_id,period_month,capex_planned,opex_planned,capex_actual,opex_actual");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", orgId],
    queryFn: async () =>
      (await supabase.from("stage_gates").select("id,project_id,stream_id,gate_name,status")).data ??
      [],
    enabled: !!orgId,
  });

  const filtered = useMemo(
    () => applyFilters(projects as any[], filters, { gates }),
    [projects, filters, gates],
  );

  const wiByProject = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const w of workItems) {
      const list = m.get(w.project_id) || [];
      list.push(w);
      m.set(w.project_id, list);
    }
    return m;
  }, [workItems]);

  const monthlyByProject = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const row of monthly) {
      const list = m.get(row.project_id) || [];
      list.push(row);
      m.set(row.project_id, list);
    }
    return m;
  }, [monthly]);

  const rows = useMemo(() => {
    return filtered.map((p: any) => {
      const metrics = computeProjectEvm({
        project: p,
        workItems: wiByProject.get(p.id) || [],
        monthly: monthlyByProject.get(p.id) || [],
      });
      return { project: p, metrics };
    });
  }, [filtered, wiByProject, monthlyByProject]);

  const selected = useMemo(() => {
    const id = selectedId || rows[0]?.project.id;
    return rows.find((r) => r.project.id === id) || null;
  }, [rows, selectedId]);

  const portfolio = useMemo(() => {
    const sum = (fn: (m: EvmMetrics) => number) =>
      rows.reduce((s, r) => s + fn(r.metrics), 0);
    const bac = sum((m) => m.bac);
    const ac = sum((m) => m.ac);
    const ev = sum((m) => m.ev);
    const pv = sum((m) => m.pv);
    return {
      bac,
      ac,
      ev,
      pv,
      cpi: ac > 0 ? ev / ac : null,
      spi: pv > 0 ? ev / pv : null,
    };
  }, [rows]);

  const columns: ColumnarColumn<(typeof rows)[0]>[] = useMemo(
    () => [
      {
        key: "code",
        label: "Project",
        getValue: (r) => r.project.project_code || "",
      },
      {
        key: "name",
        label: "Name",
        getValue: (r) => r.project.name || "",
      },
      {
        key: "bac",
        label: "BAC",
        getValue: (r) => String(r.metrics.bac),
      },
      {
        key: "pv",
        label: "PV",
        getValue: (r) => String(r.metrics.pv),
      },
      {
        key: "ev",
        label: "EV",
        getValue: (r) => String(r.metrics.ev),
      },
      {
        key: "ac",
        label: "AC",
        getValue: (r) => String(r.metrics.ac),
      },
      {
        key: "spi",
        label: "SPI",
        getValue: (r) => formatIndex(r.metrics.spi),
      },
      {
        key: "cpi",
        label: "CPI",
        getValue: (r) => formatIndex(r.metrics.cpi),
      },
      {
        key: "health",
        label: "Health",
        getValue: (r) => evmHealth(r.metrics.cpi, r.metrics.spi),
      },
    ],
    [],
  );

  const table = useColumnarTable(rows, columns);

  const chartData = useMemo(() => {
    if (!selected) return [];
    const m = selected.metrics;
    return [
      { name: "PV", value: m.pv },
      { name: "EV", value: m.ev },
      { name: "AC", value: m.ac },
      { name: "BAC", value: m.bac },
    ];
  }, [selected]);

  if (isLoading) return <PageLoading label="Loading EVM…" />;

  return (
    <PageExport name="EVM" title="Earned Value Management">
      <PageHeading
        title="Earned Value (EVM)"
        subtitle="PV · EV · AC with SPI / CPI from baselines, work-item % complete, and incurred cost"
      />

      <SectionFrame>
        <PortfolioFilters
          projects={projects as any[]}
          value={filters}
          onChange={setFilters}
        />
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Portfolio EVM</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="BAC" value={money(portfolio.bac)} />
          <KpiCard label="PV" value={money(portfolio.pv)} />
          <KpiCard label="EV" value={money(portfolio.ev)} />
          <KpiCard label="AC" value={money(portfolio.ac)} />
          <KpiCard label="SPI" value={formatIndex(portfolio.spi)} />
          <KpiCard label="CPI" value={formatIndex(portfolio.cpi)} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          BAC = baseline budget (else approved funding). EV = BAC × work-item % complete. PV =
          BAC × schedule % (or cumulative monthly plan). AC = CapEx + OpEx incurred. SPI = EV/PV ·
          CPI = EV/AC.
        </p>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Project EVM register</SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          dirty={table.isDirty}
          onClear={table.clearAll}
          placeholder="Search EVM…"
        />
        <div className="st-table-wrap overflow-x-auto">
          <table className="st-table text-xs">
            <thead>
              <tr>
                {columns.map((c) => (
                  <ColumnarTh
                    key={c.key}
                    column={c}
                    filter={table.filters[c.key]}
                    onFilter={(v) => table.setColumnFilter(c.key, v)}
                    sortKey={table.sortKey}
                    sortDir={table.sortDir}
                    onToggleSort={table.toggleSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => {
                const health = evmHealth(r.metrics.cpi, r.metrics.spi);
                const active = selected?.project.id === r.project.id;
                return (
                  <tr
                    key={r.project.id}
                    className={`cursor-pointer ${active ? "bg-sky-50" : ""}`}
                    onClick={() => setSelectedId(r.project.id)}
                  >
                    <td className="font-mono font-medium">{r.project.project_code}</td>
                    <td>{r.project.name}</td>
                    <td className="st-num text-right tabular-nums">{money(r.metrics.bac)}</td>
                    <td className="st-num text-right tabular-nums">{money(r.metrics.pv)}</td>
                    <td className="st-num text-right tabular-nums">{money(r.metrics.ev)}</td>
                    <td className="st-num text-right tabular-nums">{money(r.metrics.ac)}</td>
                    <td className="st-num text-right tabular-nums">{formatIndex(r.metrics.spi)}</td>
                    <td className="st-num text-right tabular-nums">{formatIndex(r.metrics.cpi)}</td>
                    <td>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          health === "Green"
                            ? "bg-emerald-100 text-emerald-800"
                            : health === "Amber"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {health}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      {selected ? (
        <>
          <SectionFrame>
            <SectionTitle>
              Detail — {selected.project.project_code} · {selected.project.name}
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <KpiCard label="% Complete" value={`${(selected.metrics.pctComplete * 100).toFixed(0)}%`} />
              <KpiCard label="Schedule %" value={`${(selected.metrics.schedulePct * 100).toFixed(0)}%`} />
              <KpiCard label="CV (EV−AC)" value={money(selected.metrics.cv)} />
              <KpiCard label="SV (EV−PV)" value={money(selected.metrics.sv)} />
              <KpiCard label="EAC" value={selected.metrics.eac != null ? money(selected.metrics.eac) : "—"} />
              <KpiCard label="ETC" value={selected.metrics.etc != null ? money(selected.metrics.etc) : "—"} />
              <KpiCard label="VAC" value={selected.metrics.vac != null ? money(selected.metrics.vac) : "—"} />
              <KpiCard label="TCPI" value={formatIndex(selected.metrics.tcpi)} />
            </div>
            {selected.metrics.baselineLabel ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Baseline: {selected.metrics.baselineLabel}
                {selected.project.baseline_date ? ` (${selected.project.baseline_date})` : ""}
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-amber-800">
                No baseline_label set — using approved funding as BAC. Snapshot baselines on the
                project detail / Data Editor.
              </p>
            )}
            <div className="mt-4">
              <ExpandableChart title="PV / EV / AC / BAC">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Legend />
                  <Bar dataKey="value" name="$">
                    {chartData.map((d) => (
                      <Cell
                        key={d.name}
                        fill={
                          d.name === "EV"
                            ? "#0ea5e9"
                            : d.name === "PV"
                              ? "#64748b"
                              : d.name === "AC"
                                ? "#f59e0b"
                                : "#22c55e"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ExpandableChart>
            </div>
          </SectionFrame>
          <SectionFrame>
            <SectionTitle>Discussion</SectionTitle>
            <EntityComments entityType="project_evm" entityId={selected.project.id} />
          </SectionFrame>
        </>
      ) : null}
    </PageExport>
  );
}
