import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
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
  Cell,
} from "recharts";
import { toast } from "sonner";
import { ExpandableChart } from "@/components/expandable-chart";

export const Route = createFileRoute("/_authenticated/app/fy-allocation")({
  component: FYAllocationPage,
});

const fmtM = (n: number) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};
const fmt$ = (n: number) => "$" + new Intl.NumberFormat("en-US").format(Math.round(Number(n || 0)));
const fyKey = (fy: string) => {
  const m = /(\d+)/.exec(fy || "");
  return m ? Number(m[1]) : 0;
};
const sortFY = (a: string, b: string) => fyKey(a) - fyKey(b);

function TabButton({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={
        "px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition " +
        (active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function FYAllocationPage() {
  const { organization } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"allocate" | "portfolio" | "roadmap">("allocate");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => (await supabase.from("projects").select("*")).data ?? [],
    enabled: !!organization,
  });
  const { data: alloc = [] } = useQuery({
    queryKey: ["fy_allocations", organization?.id],
    queryFn: async () => (await supabase.from("fy_allocations").select("*").order("fy")).data ?? [],
    enabled: !!organization,
  });

  return (
    <PageExport name="FY_Allocation" title="FY Budget & Forecast Allocation">
      <PageHeading icon="📅">FY Budget &amp; Forecast Allocation</PageHeading>
      <div className="text-sm text-muted-foreground mb-3">
        Split each project's total Budget and Forecast across Financial Years, then track the
        resulting portfolio profile.
      </div>

      <div className="mb-3 flex gap-1 border-b">
        <TabButton active={tab === "allocate"} onClick={() => setTab("allocate")}>
          ✏️ Allocate
        </TabButton>
        <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")}>
          📊 Portfolio View
        </TabButton>
        <TabButton active={tab === "roadmap"} onClick={() => setTab("roadmap")}>
          🗺️ Roadmap &amp; Financials
        </TabButton>
      </div>

      {tab === "allocate" && (
        <AllocateTab
          projects={projects}
          alloc={alloc}
          orgId={organization?.id}
          onSaved={() => qc.invalidateQueries({ queryKey: ["fy_allocations"] })}
        />
      )}
      {tab === "portfolio" && <PortfolioViewTab projects={projects} alloc={alloc} />}
      {tab === "roadmap" && <RoadmapTab projects={projects} alloc={alloc} />}
    </PageExport>
  );
}

/* ─────────────── Tab 1: Allocate ─────────────── */
function AllocateTab({
  projects,
  alloc,
  orgId,
  onSaved,
}: {
  projects: any[];
  alloc: any[];
  orgId?: string;
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState<string>("");
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => (a.project_code || "").localeCompare(b.project_code || "")),
    [projects],
  );
  useEffect(() => {
    if (!projectId && sortedProjects.length) setProjectId(sortedProjects[0].id);
  }, [sortedProjects, projectId]);

  const project = useMemo(
    () => sortedProjects.find((p) => p.id === projectId),
    [sortedProjects, projectId],
  );
  const totalBudget = Number(project?.budget || 0);
  const totalForecast =
    Number(project?.capex_approved || 0) + Number(project?.opex_approved || 0) || totalBudget;

  // Derive FY suggestions from all allocations + project dates
  const knownFYs = useMemo(() => {
    const s = new Set<string>();
    for (const a of alloc) s.add(a.fy);
    // include a few default years
    const y = new Date().getFullYear();
    for (let i = -1; i <= 4; i++) s.add(`FY${String((y + i) % 100).padStart(2, "0")}`);
    return Array.from(s).sort(sortFY);
  }, [alloc]);

  const [selectedFYs, setSelectedFYs] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, { bp: number; fp: number; notes: string }>>({});

  useEffect(() => {
    if (!project) return;
    const existing = alloc.filter((a) => a.project_id === project.id);
    const fys = existing.length ? existing.map((a) => a.fy) : knownFYs.slice(0, 3);
    setSelectedFYs(Array.from(new Set(fys)).sort(sortFY));
    const rec: Record<string, { bp: number; fp: number; notes: string }> = {};
    for (const a of existing) {
      const amt = Number(a.capex || 0) + Number(a.opex || 0);
      rec[a.fy] = {
        bp: totalBudget > 0 ? +((amt / totalBudget) * 100).toFixed(2) : 0,
        fp: totalForecast > 0 ? +((amt / totalForecast) * 100).toFixed(2) : 0,
        notes: "",
      };
    }
    setRows(rec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, alloc]);

  const ensureRow = (fy: string) => rows[fy] || { bp: 0, fp: 0, notes: "" };
  const setCell = (fy: string, k: "bp" | "fp" | "notes", v: any) =>
    setRows((r) => ({ ...r, [fy]: { ...ensureRow(fy), [k]: v } }));

  const splitEvenly = () => {
    if (!selectedFYs.length) return;
    const share = +(100 / selectedFYs.length).toFixed(2);
    const next: typeof rows = {};
    selectedFYs.forEach((fy) => {
      next[fy] = { bp: share, fp: share, notes: ensureRow(fy).notes };
    });
    setRows(next);
  };
  const copyBudgetToForecast = () => {
    const next = { ...rows };
    selectedFYs.forEach((fy) => {
      next[fy] = { ...ensureRow(fy), fp: ensureRow(fy).bp };
    });
    setRows(next);
  };
  const clearRows = () => setRows({});

  const bpTotal = selectedFYs.reduce((s, fy) => s + Number(ensureRow(fy).bp || 0), 0);
  const fpTotal = selectedFYs.reduce((s, fy) => s + Number(ensureRow(fy).fp || 0), 0);
  const bAllocated = selectedFYs.reduce(
    (s, fy) => s + (Number(ensureRow(fy).bp || 0) * totalBudget) / 100,
    0,
  );
  const fAllocated = selectedFYs.reduce(
    (s, fy) => s + (Number(ensureRow(fy).fp || 0) * totalForecast) / 100,
    0,
  );

  const save = async () => {
    if (!project || !orgId) return;
    // delete then insert
    await supabase.from("fy_allocations").delete().eq("project_id", project.id);
    const inserts = selectedFYs
      .map((fy) => {
        const r = ensureRow(fy);
        const amt = ((Number(r.bp) || 0) * totalBudget) / 100;
        return {
          org_id: orgId,
          project_id: project.id,
          fy,
          capex: amt,
          opex: 0,
          benefits: 0,
        };
      })
      .filter((r) => r.capex > 0 || r.fy);
    if (inserts.length) {
      const { error } = await supabase.from("fy_allocations").insert(inserts);
      if (error) {
        toast.error("Save failed: " + error.message);
        return;
      }
    }
    toast.success("Allocation saved");
    onSaved();
  };

  return (
    <>
      <SectionFrame>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground mb-1">Project</div>
            <select
              className="h-9 w-full rounded-md border bg-white px-2 text-[13px]"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {sortedProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_code} · {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground mb-1">
              Financial Years
            </div>
            <div className="flex flex-wrap items-center gap-1 rounded-md border bg-white p-1 min-h-[36px]">
              {selectedFYs.map((fy) => (
                <span
                  key={fy}
                  className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[12px]"
                >
                  {fy}
                  <button
                    className="text-slate-500 hover:text-red-600"
                    onClick={() => setSelectedFYs(selectedFYs.filter((x) => x !== fy))}
                  >
                    ×
                  </button>
                </span>
              ))}
              <select
                className="h-7 border-none bg-transparent text-[12px] outline-none"
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && !selectedFYs.includes(v))
                    setSelectedFYs([...selectedFYs, v].sort(sortFY));
                }}
              >
                <option value="">+ add FY…</option>
                {knownFYs
                  .filter((f) => !selectedFYs.includes(f))
                  .map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <KpiCard label="Total Budget" value={fmt$(totalBudget)} accent="#3b82f6" />
          <KpiCard label="Total Forecast" value={fmt$(totalForecast)} accent="#8b5cf6" />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Allocation table (percentages must total 100)</SectionTitle>
        <div className="mb-2 grid grid-cols-3 gap-2">
          <button
            className="h-9 rounded-md border bg-white text-[12px] hover:bg-muted"
            onClick={splitEvenly}
          >
            Split evenly
          </button>
          <button
            className="h-9 rounded-md border bg-white text-[12px] hover:bg-muted"
            onClick={copyBudgetToForecast}
          >
            Copy Budget % → Forecast %
          </button>
          <button
            className="h-9 rounded-md border bg-white text-[12px] hover:bg-muted"
            onClick={clearRows}
          >
            Clear
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="st-table w-full table-fixed">
            <colgroup>
              <col style={{ width: "110px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "140px" }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th className="text-left">FY</th>
                <th className="text-right">Budget %</th>
                <th className="text-right">Forecast %</th>
                <th className="text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {selectedFYs.map((fy) => {
                const r = ensureRow(fy);
                return (
                  <tr key={fy}>
                    <td className="font-medium text-left align-middle">{fy}</td>
                    <td className="align-middle">
                      <input
                        type="number"
                        step="0.01"
                        value={r.bp}
                        onChange={(e) => setCell(fy, "bp", Number(e.target.value))}
                        className="h-8 w-full rounded border bg-white px-2 text-right text-[12px]"
                      />
                    </td>
                    <td className="align-middle">
                      <input
                        type="number"
                        step="0.01"
                        value={r.fp}
                        onChange={(e) => setCell(fy, "fp", Number(e.target.value))}
                        className="h-8 w-full rounded border bg-white px-2 text-right text-[12px]"
                      />
                    </td>
                    <td className="align-middle">
                      <input
                        type="text"
                        value={r.notes}
                        onChange={(e) => setCell(fy, "notes", e.target.value)}
                        className="h-8 w-full rounded border bg-white px-2 text-[12px]"
                      />
                    </td>
                  </tr>
                );
              })}
              {!selectedFYs.length && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-[12px] text-muted-foreground">
                    Add one or more FYs above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <KpiCard
            label="Budget % total"
            value={`${bpTotal.toFixed(1)}%`}
            accent={Math.abs(bpTotal - 100) < 0.5 ? "#22c55e" : "#ef4444"}
          />
          <KpiCard
            label="Forecast % total"
            value={`${fpTotal.toFixed(1)}%`}
            accent={Math.abs(fpTotal - 100) < 0.5 ? "#22c55e" : "#ef4444"}
          />
          <KpiCard label="Budget $ allocated" value={fmt$(bAllocated)} accent="#3b82f6" />
          <KpiCard label="Forecast $ allocated" value={fmt$(fAllocated)} accent="#8b5cf6" />
        </div>

        <div className="mt-3">
          <button
            className="h-9 rounded-md bg-primary px-4 text-[13px] font-medium text-white hover:opacity-90"
            onClick={save}
          >
            💾 Save allocation
          </button>
        </div>
      </SectionFrame>
    </>
  );
}

/* ─────────────── Tab 2: Portfolio View ─────────────── */
function PortfolioViewTab({ projects, alloc }: { projects: any[]; alloc: any[] }) {
  const [filters, setFilters] = useState<PortfolioFilterState>(emptyFilters);
  const filtered = useMemo(() => applyFilters(projects, filters), [projects, filters]);
  const projectMap = useMemo(() => new Map(filtered.map((p: any) => [p.id, p])), [filtered]);
  const ids = useMemo(() => new Set(filtered.map((p: any) => p.id)), [filtered]);
  const rowsF = useMemo(() => alloc.filter((a: any) => ids.has(a.project_id)), [alloc, ids]);

  const byFY = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of rowsF) {
      const row = m.get(r.fy) || {
        fy: r.fy,
        budget: 0,
        forecast: 0,
        capex: 0,
        opex: 0,
        benefits: 0,
      };
      const amt = Number(r.capex || 0) + Number(r.opex || 0);
      row.budget += amt;
      row.forecast += amt;
      row.capex += Number(r.capex || 0);
      row.opex += Number(r.opex || 0);
      row.benefits += Number(r.benefits || 0);
      m.set(r.fy, row);
    }
    return Array.from(m.values()).sort((a, b) => sortFY(a.fy, b.fy));
  }, [rowsF]);

  const totalBudget = byFY.reduce((s, r) => s + r.budget, 0);
  const totalForecast = byFY.reduce((s, r) => s + r.forecast, 0);
  const variance = totalForecast - totalBudget;
  const nAlloc = new Set(rowsF.map((r: any) => r.project_id)).size;
  const nAll = filtered.length;
  const coverage = nAll ? (nAlloc / nAll) * 100 : 0;
  const missing = Math.max(0, nAll - nAlloc);

  // Forecast Allocation Mix — Top 15 projects, stacked by FY
  const projTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rowsF) {
      const amt = Number(r.capex || 0) + Number(r.opex || 0);
      m.set(r.project_id, (m.get(r.project_id) || 0) + amt);
    }
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([id]) => id);
  }, [rowsF]);
  const fys = Array.from(new Set(byFY.map((r) => r.fy)));
  const mixData = useMemo(() => {
    return projTotals.map((pid) => {
      const p: any = projectMap.get(pid);
      const row: any = { name: p?.name || pid };
      for (const fy of fys) row[fy] = 0;
      for (const r of rowsF.filter((r: any) => r.project_id === pid)) {
        row[r.fy] = (row[r.fy] || 0) + Number(r.capex || 0) + Number(r.opex || 0);
      }
      return row;
    });
  }, [projTotals, projectMap, rowsF, fys]);
  const mixColors = ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"];

  // Heatmap (top 20)
  const heatProjects = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rowsF)
      m.set(r.project_id, (m.get(r.project_id) || 0) + Number(r.capex || 0) + Number(r.opex || 0));
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id]) => id);
  }, [rowsF]);
  const heat = useMemo(() => {
    const grid: Record<string, Record<string, number>> = {};
    for (const pid of heatProjects) {
      const p: any = projectMap.get(pid);
      grid[p?.name || pid] = Object.fromEntries(fys.map((f) => [f, 0]));
    }
    for (const r of rowsF) {
      const p: any = projectMap.get(r.project_id);
      const key = p?.name;
      if (!key || !grid[key]) continue;
      grid[key][r.fy] = (grid[key][r.fy] || 0) + Number(r.capex || 0) + Number(r.opex || 0);
    }
    const max = Math.max(1, ...Object.values(grid).flatMap((row) => Object.values(row)));
    return { grid, max };
  }, [heatProjects, projectMap, rowsF, fys]);

  return (
    <>
      <PortfolioFilters projects={projects} value={filters} onChange={setFilters} />

      <SectionFrame>
        <SectionTitle>Allocation KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Total Budget Allocated" value={fmtM(totalBudget)} accent="#3b82f6" />
          <KpiCard label="Total Forecast Allocated" value={fmtM(totalForecast)} accent="#8b5cf6" />
          <KpiCard
            label="Forecast vs Budget"
            value={fmtM(variance)}
            accent={variance >= 0 ? "#22c55e" : "#ef4444"}
          />
          <KpiCard label="Projects Allocated" value={`${nAlloc}/${nAll}`} accent="#0ea5e9" />
          <KpiCard label="Coverage" value={`${coverage.toFixed(0)}%`} accent="#22c55e" />
          <KpiCard
            label="Missing Allocation"
            value={missing}
            accent={missing ? "#ef4444" : "#22c55e"}
          />
        </div>
      </SectionFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionFrame>
          <ExpandableChart title="Budget vs Forecast by FY" heightClass="h-72">
            <BarChart data={byFY} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="fy" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => fmtM(v)} />
              <Tooltip formatter={(v: any) => fmtM(Number(v))} />
              <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="budget" name="Budget" fill="#3b82f6">
                <LabelList
                  dataKey="budget"
                  position="top"
                  formatter={(v: number) => fmtM(v)}
                  style={{ fontSize: 10, fill: "#334155" }}
                />
              </Bar>
              <Bar dataKey="forecast" name="Forecast" fill="#f59e0b">
                <LabelList
                  dataKey="forecast"
                  position="top"
                  formatter={(v: number) => fmtM(v)}
                  style={{ fontSize: 10, fill: "#334155" }}
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
        </SectionFrame>

        <SectionFrame>
          <ExpandableChart
            title={`Forecast Allocation Mix — Top ${mixData.length} Projects`}
            heightClass="h-72"
          >
            <BarChart data={mixData} margin={{ top: 10, right: 10, left: 0, bottom: 70 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis
                dataKey="name"
                fontSize={9}
                angle={-30}
                textAnchor="end"
                interval={0}
                height={80}
              />
              <YAxis fontSize={11} tickFormatter={(v) => fmtM(v)} />
              <Tooltip formatter={(v: any) => fmtM(Number(v))} />
              <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11 }} />
              {fys.map((fy, i) => (
                <Bar
                  key={fy}
                  dataKey={fy}
                  stackId="a"
                  fill={mixColors[i % mixColors.length]}
                  name={fy}
                />
              ))}
            </BarChart>
          </ExpandableChart>
        </SectionFrame>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionFrame>
          <SectionTitle>Forecast Heatmap — Project × FY</SectionTitle>
          <div className="overflow-auto max-h-[420px]">
            <table className="border-collapse text-[11px]">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="p-2 text-left text-muted-foreground">Project Name</th>
                  {fys.map((f) => (
                    <th key={f} className="p-2 text-center text-muted-foreground">
                      {f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(heat.grid).map(([name, row]) => (
                  <tr key={name}>
                    <td className="p-2 pr-4 font-medium">{name}</td>
                    {fys.map((f) => {
                      const v = row[f] || 0;
                      const intensity = v / heat.max;
                      return (
                        <td key={f} className="p-1">
                          <div
                            className="flex h-8 min-w-[70px] items-center justify-center rounded font-medium"
                            style={{
                              background: `rgba(29, 78, 216, ${0.08 + intensity * 0.82})`,
                              color: intensity > 0.5 ? "#fff" : "#0b1220",
                            }}
                          >
                            {v > 0 ? fmtM(v) : "—"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionFrame>

        <SectionFrame>
          <ExpandableChart title="Forecast Roll-Forward by FY" heightClass="h-72">
            <BarChart data={byFY} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="fy" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => fmtM(v)} />
              <Tooltip formatter={(v: any) => fmtM(Number(v))} />
              <Bar dataKey="forecast" name="Forecast">
                {byFY.map((_, i) => (
                  <Cell key={i} fill="#14b8a6" />
                ))}
                <LabelList
                  dataKey="forecast"
                  position="top"
                  formatter={(v: number) => fmtM(v)}
                  style={{ fontSize: 10, fill: "#334155" }}
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
        </SectionFrame>
      </div>

      <SectionFrame>
        <ExpandableChart title="Investment vs Benefit by FY" heightClass="h-64">
          <BarChart data={byFY}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
            <XAxis dataKey="fy" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={(v) => fmtM(v)} />
            <Tooltip formatter={(v: any) => fmtM(Number(v))} />
            <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="forecast" name="Investment" fill="#3b82f6" />
            <Bar dataKey="benefits" name="Benefits" fill="#22c55e" />
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart title="CAPEX vs OPEX by Fiscal Year" heightClass="h-72">
          <BarChart data={byFY} margin={{ top: 15, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
            <XAxis dataKey="fy" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={(v) => fmtM(v)} />
            <Tooltip formatter={(v: number) => fmtM(v)} />
            <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="capex" name="CAPEX" stackId="a" fill="#1d4ed8" />
            <Bar dataKey="opex" name="OPEX" stackId="a" fill="#f59e0b" />
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Allocation detail</SectionTitle>
        <div className="max-h-[420px] overflow-auto">
          <table className="st-table">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th>Project ID</th>
                <th>Project Name</th>
                <th>FY</th>
                <th className="text-right">Budget %</th>
                <th className="text-right">Forecast %</th>
                <th className="text-right">Budget Amount</th>
                <th className="text-right">Forecast Amount</th>
                <th>Portfolio Category</th>
                <th>Sponsor</th>
                <th>RAG</th>
              </tr>
            </thead>
            <tbody>
              {rowsF.slice(0, 500).map((r: any) => {
                const p: any = projectMap.get(r.project_id);
                const amt = Number(r.capex || 0) + Number(r.opex || 0);
                const projB = Number(p?.budget || 0);
                const bp = projB ? (amt / projB) * 100 : 0;
                return (
                  <tr key={r.id}>
                    <td className="font-mono text-[11px]">
                      {p?.project_code ? (
                        <Link
                          to="/app/project-infographic"
                          search={{ pid: p.id }}
                          className="text-primary hover:underline"
                        >
                          {p.project_code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{p?.name || "—"}</td>
                    <td className="font-medium">{r.fy}</td>
                    <td className="text-right tabular-nums">{bp.toFixed(0)}</td>
                    <td className="text-right tabular-nums">{bp.toFixed(0)}</td>
                    <td className="text-right tabular-nums">{fmt$(amt)}</td>
                    <td className="text-right tabular-nums">{fmt$(amt)}</td>
                    <td>{p?.portfolio_category || "—"}</td>
                    <td>{p?.sponsor || "—"}</td>
                    <td>{p?.rag || "NA"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </>
  );
}

/* ─────────────── Tab 3: Roadmap & Financials ─────────────── */
function RoadmapTab({ projects, alloc }: { projects: any[]; alloc: any[] }) {
  const [filters, setFilters] = useState<PortfolioFilterState>(emptyFilters);
  const filtered = useMemo(() => applyFilters(projects, filters), [projects, filters]);
  const projectMap = useMemo(() => new Map(filtered.map((p: any) => [p.id, p])), [filtered]);
  const ids = useMemo(() => new Set(filtered.map((p: any) => p.id)), [filtered]);
  const rowsF = useMemo(() => alloc.filter((a: any) => ids.has(a.project_id)), [alloc, ids]);
  const fys = useMemo(() => Array.from(new Set(rowsF.map((r: any) => r.fy))).sort(sortFY), [rowsF]);

  // Roadmap Gantt: 1 lane per project, one cell per FY, coloured by RAG
  const roadmapProjects = useMemo(() => {
    const set = new Map<string, Set<string>>();
    for (const r of rowsF) {
      if (!set.has(r.project_id)) set.set(r.project_id, new Set());
      set.get(r.project_id)!.add(r.fy);
    }
    return Array.from(set.entries())
      .map(([pid, fs]) => {
        const p: any = projectMap.get(pid);
        return { id: pid, name: p?.name || pid, rag: p?.rag || "NA", fys: fs };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rowsF, projectMap]);

  const ragColor = (r: string) =>
    r === "Green" ? "#22c55e" : r === "Amber" ? "#f59e0b" : r === "Red" ? "#ef4444" : "#94a3b8";

  // Per-project Budget-by-FY table
  const perProject = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of rowsF) {
      const key = r.project_id;
      const row = m.get(key) || { id: key };
      row[r.fy] = (row[r.fy] || 0) + Number(r.capex || 0) + Number(r.opex || 0);
      m.set(key, row);
    }
    return Array.from(m.values());
  }, [rowsF]);

  return (
    <>
      <PortfolioFilters projects={projects} value={filters} onChange={setFilters} />
      <div className="mb-3 text-[12px] text-muted-foreground">
        Loaded {rowsF.length} allocation rows across {roadmapProjects.length} projects and{" "}
        {fys.length} FYs.
      </div>

      <SectionFrame>
        <SectionTitle>FY Allocation Roadmap</SectionTitle>
        {!fys.length ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No allocations to display.
          </div>
        ) : (
          <div className="overflow-auto max-h-[520px]">
            <table className="border-collapse text-[11px] w-full">
              <thead className="sticky top-0 bg-white z-10">
                <tr>
                  <th className="p-2 text-left text-muted-foreground w-64 sticky left-0 bg-white">
                    Project
                  </th>
                  {fys.map((f) => (
                    <th key={f} className="p-2 text-center text-muted-foreground">
                      {f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roadmapProjects.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2 pr-4 font-medium sticky left-0 bg-white">{row.name}</td>
                    {fys.map((f) => (
                      <td key={f} className="p-1">
                        <div
                          className="h-6 rounded"
                          style={{
                            background: row.fys.has(f) ? ragColor(row.rag) : "transparent",
                            opacity: row.fys.has(f) ? 0.85 : 0,
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-[#22c55e]" />
                Green
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-[#f59e0b]" />
                Amber
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-[#ef4444]" />
                Red
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-[#94a3b8]" />
                NA
              </span>
            </div>
          </div>
        )}
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Per-project financials — Budget by FY</SectionTitle>
        <div className="max-h-[420px] overflow-auto">
          <table className="st-table">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th>Project ID</th>
                <th>Project Name</th>
                {fys.map((f) => (
                  <th key={f} className="text-right">
                    {f}
                  </th>
                ))}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {perProject.map((r: any) => {
                const p: any = projectMap.get(r.id);
                const tot = fys.reduce((s, f) => s + (r[f] || 0), 0);
                return (
                  <tr key={r.id}>
                    <td className="font-mono text-[11px]">
                      {p?.project_code ? (
                        <Link
                          to="/app/project-infographic"
                          search={{ pid: p.id }}
                          className="text-primary hover:underline"
                        >
                          {p.project_code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{p?.name || "—"}</td>
                    {fys.map((f) => (
                      <td key={f} className="text-right tabular-nums">
                        {r[f] ? fmt$(r[f]) : "0"}
                      </td>
                    ))}
                    <td className="text-right tabular-nums font-semibold">{fmt$(tot)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </>
  );
}
