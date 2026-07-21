import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  LabelList,
} from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";

export const Route = createFileRoute("/_authenticated/app/risk-roadmap")({
  head: () => ({
    meta: [
      { title: "Risk Roadmap — PMO Enterprise" },
      {
        name: "description",
        content: "Time-phased view of portfolio risks by severity and target resolution.",
      },
    ],
  }),
  component: RiskRoadmapPage,
});

const SEV_COLOR = (s: number) =>
  s >= 15 ? "#dc2626" : s >= 9 ? "#f59e0b" : s >= 4 ? "#eab308" : "#22c55e";
const SEV_LABEL = (s: number) =>
  s >= 15 ? "Critical" : s >= 9 ? "High" : s >= 4 ? "Medium" : "Low";

function RiskRoadmapPage() {
  const { organization } = useAuth();
  const [filters, setFilters] = useState<PortfolioFilterState>(emptyFilters);
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [sevFilter, setSevFilter] = useState<string>("All");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => (await supabase.from("projects").select("*")).data ?? [],
    enabled: !!organization,
  });
  const { data: risks = [] } = useQuery({
    queryKey: ["risks", organization?.id],
    queryFn: async () => (await supabase.from("risks").select("*")).data ?? [],
    enabled: !!organization,
  });

  const projectMap = useMemo(() => new Map(projects.map((p: any) => [p.id, p])), [projects]);
  const filteredProjects = useMemo(() => applyFilters(projects, filters), [projects, filters]);
  const projectIds = useMemo(
    () => new Set(filteredProjects.map((p: any) => p.id)),
    [filteredProjects],
  );

  const risksFiltered = useMemo(() => {
    return risks.filter((r: any) => {
      if (!projectIds.has(r.project_id)) return false;
      if (statusFilter !== "All" && (r.status || "Open") !== statusFilter) return false;
      const sev = Number(r.severity || 0);
      if (sevFilter === "Critical" && sev < 15) return false;
      if (sevFilter === "High" && (sev < 9 || sev >= 15)) return false;
      if (sevFilter === "Medium" && (sev < 4 || sev >= 9)) return false;
      if (sevFilter === "Low" && sev >= 4) return false;
      return true;
    });
  }, [risks, projectIds, statusFilter, sevFilter]);

  // KPIs
  const total = risksFiltered.length;
  const open = risksFiltered.filter((r: any) => (r.status || "Open") === "Open").length;
  const mit = risksFiltered.filter((r: any) => r.status === "Mitigating").length;
  const closed = risksFiltered.filter((r: any) => r.status === "Closed").length;
  const critical = risksFiltered.filter((r: any) => Number(r.severity || 0) >= 15).length;
  const overdue = risksFiltered.filter(
    (r: any) =>
      r.due_date && new Date(r.due_date) < new Date() && (r.status || "Open") !== "Closed",
  ).length;

  // Time-phased buckets by target resolution month
  const timeline = useMemo(() => {
    const buckets = new Map<
      string,
      { month: string; Critical: number; High: number; Medium: number; Low: number }
    >();
    for (const r of risksFiltered) {
      if (!r.due_date) continue;
      const d = new Date(r.due_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = buckets.get(key) || { month: key, Critical: 0, High: 0, Medium: 0, Low: 0 };
      const label = SEV_LABEL(Number(r.severity || 0));
      (b as any)[label] += 1;
      buckets.set(key, b);
    }
    return Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [risksFiltered]);

  // Heatmap probability × impact
  const heat = useMemo(() => {
    const grid: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
    for (const r of risksFiltered) {
      const p = Math.min(5, Math.max(1, Number(r.probability || 1))) - 1;
      const i = Math.min(5, Math.max(1, Number(r.impact || 1))) - 1;
      grid[p][i] += 1;
    }
    return grid;
  }, [risksFiltered]);

  // Scatter: probability vs impact (bubble = 1)
  const scatter = risksFiltered.map((r: any) => ({
    p: Number(r.probability || 1),
    i: Number(r.impact || 1),
    sev: Number(r.severity || 0),
    title: r.title,
    project: (projectMap.get(r.project_id) as any)?.name ?? "—",
  }));

  // By project stacked bar
  const byProject = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of risksFiltered) {
      const proj = projectMap.get(r.project_id) as any;
      const key = proj?.project_code || "—";
      const row = m.get(key) || {
        code: key,
        name: proj?.name ?? "—",
        Critical: 0,
        High: 0,
        Medium: 0,
        Low: 0,
        total: 0,
      };
      const l = SEV_LABEL(Number(r.severity || 0));
      row[l] += 1;
      row.total += 1;
      m.set(key, row);
    }
    return Array.from(m.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [risksFiltered, projectMap]);

  return (
    <PageExport name="Risk_Roadmap" title="Risk Roadmap">
      <PageHeading icon="🛡️">Risk Roadmap</PageHeading>
      <div className="text-sm text-muted-foreground mb-3">
        Time-phased portfolio risk view — target resolution timing, severity heat &amp; project
        rollup.
      </div>

      <PortfolioFilters projects={projects} value={filters} onChange={setFilters} />
      <div className="mb-3 flex flex-wrap gap-2 rounded-lg border bg-white/60 p-2">
        <span className="text-[11px] font-semibold text-muted-foreground">Risk filters:</span>
        <select
          className="h-8 rounded-md border bg-white px-2 text-[12px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All statuses</option>
          <option>Open</option>
          <option>Mitigating</option>
          <option>Closed</option>
        </select>
        <select
          className="h-8 rounded-md border bg-white px-2 text-[12px]"
          value={sevFilter}
          onChange={(e) => setSevFilter(e.target.value)}
        >
          <option value="All">All severities</option>
          <option>Critical</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
      </div>

      <SectionFrame>
        <SectionTitle>Risk KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Total Risks" value={total} accent="#3b82f6" />
          <KpiCard label="Open" value={open} accent="#f59e0b" />
          <KpiCard label="Mitigating" value={mit} accent="#8b5cf6" />
          <KpiCard label="Closed" value={closed} accent="#22c55e" />
          <KpiCard label="Critical" value={critical} accent="#dc2626" />
          <KpiCard label="Overdue" value={overdue} accent="#ef4444" />
        </div>
      </SectionFrame>

      <SectionFrame>
        {timeline.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No risks with target dates match current filters.
          </div>
        ) : (
          <ExpandableChart title="Roadmap — Risks by Target Resolution Month" heightClass="h-72">
            <BarChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Critical" stackId="a" fill="#dc2626" />
              <Bar dataKey="High" stackId="a" fill="#f59e0b" />
              <Bar dataKey="Medium" stackId="a" fill="#eab308" />
              <Bar dataKey="Low" stackId="a" fill="#22c55e" />
            </BarChart>
          </ExpandableChart>
        )}
      </SectionFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionFrame>
          <SectionTitle>Probability × Impact Heatmap</SectionTitle>
          <div className="overflow-x-auto">
            <table className="border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className="p-1 text-muted-foreground">P ↓ / I →</th>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <th key={i} className="p-1 text-center w-10">
                      {i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[5, 4, 3, 2, 1].map((p) => (
                  <tr key={p}>
                    <td className="p-1 pr-2 text-right font-medium">{p}</td>
                    {[1, 2, 3, 4, 5].map((i) => {
                      const cnt = heat[p - 1][i - 1];
                      const sev = p * i;
                      return (
                        <td key={i} className="p-0">
                          <div
                            className="m-0.5 flex h-10 w-10 items-center justify-center rounded text-white font-semibold"
                            style={{ background: SEV_COLOR(sev), opacity: cnt > 0 ? 1 : 0.25 }}
                          >
                            {cnt || ""}
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
          <ExpandableChart title="Risk Scatter (probability × impact)" heightClass="h-64">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis
                type="number"
                dataKey="p"
                domain={[0, 6]}
                name="Probability"
                fontSize={11}
                label={{ value: "Probability", position: "insideBottom", offset: -5, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="i"
                domain={[0, 6]}
                name="Impact"
                fontSize={11}
                label={{ value: "Impact", angle: -90, position: "insideLeft", fontSize: 11 }}
              />
              <ZAxis type="number" range={[40, 160]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(v: any, k: string) => (k === "p" || k === "i" ? v : v)}
                content={({ payload }) => {
                  const d: any = payload?.[0]?.payload;
                  if (!d) return null;
                  return (
                    <div className="rounded border bg-white p-2 text-[11px] shadow">
                      <div className="font-semibold">{d.title}</div>
                      <div className="text-muted-foreground">{d.project}</div>
                      <div>
                        Prob {d.p} • Impact {d.i} • Severity {d.sev}
                      </div>
                    </div>
                  );
                }}
              />
              <Scatter data={scatter}>
                {scatter.map((s, i) => (
                  <Cell key={i} fill={SEV_COLOR(s.sev)} />
                ))}
              </Scatter>
            </ScatterChart>
          </ExpandableChart>
        </SectionFrame>
      </div>

      <SectionFrame>
        {byProject.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No risks match filters.
          </div>
        ) : (
          <ExpandableChart title="Risks per Project (top 15)" heightClass="h-80">
            <BarChart
              data={byProject}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis type="number" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="code" fontSize={11} width={70} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Critical" stackId="a" fill="#dc2626" />
              <Bar dataKey="High" stackId="a" fill="#f59e0b" />
              <Bar dataKey="Medium" stackId="a" fill="#eab308" />
              <Bar dataKey="Low" stackId="a" fill="#22c55e">
                <LabelList
                  dataKey="total"
                  position="right"
                  style={{ fontSize: 10, fill: "#334155" }}
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
        )}
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Risk Register ({risksFiltered.length})</SectionTitle>
        <div className="max-h-[520px] overflow-auto">
          <table className="st-table">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th>Project</th>
                <th>Title</th>
                <th>Category</th>
                <th>Owner</th>
                <th className="text-center">Prob</th>
                <th className="text-center">Impact</th>
                <th className="text-center">Sev</th>
                <th>Status</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {risksFiltered.slice(0, 500).map((r: any) => {
                const proj = projectMap.get(r.project_id) as any;
                const sev = Number(r.severity || 0);
                const overdue =
                  r.due_date &&
                  new Date(r.due_date) < new Date() &&
                  (r.status || "Open") !== "Closed";
                return (
                  <tr key={r.id}>
                    <td className="font-mono text-[11px]">
                      {proj?.project_code ? (
                        <Link
                          to="/app/project-infographic"
                          search={{ pid: proj.id }}
                          className="text-primary hover:underline"
                        >
                          {proj.project_code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{r.title}</td>
                    <td>{r.category || "—"}</td>
                    <td>{r.owner || "—"}</td>
                    <td className="text-center">{r.probability ?? "—"}</td>
                    <td className="text-center">{r.impact ?? "—"}</td>
                    <td className="text-center">
                      <span
                        className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold text-white"
                        style={{ background: SEV_COLOR(sev) }}
                      >
                        {sev} · {SEV_LABEL(sev)}
                      </span>
                    </td>
                    <td>{r.status || "Open"}</td>
                    <td className={overdue ? "text-red-600 font-medium" : ""}>
                      {r.due_date || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </PageExport>
  );
}
