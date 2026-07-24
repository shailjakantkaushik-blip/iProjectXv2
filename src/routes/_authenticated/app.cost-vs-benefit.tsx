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
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
  BarChart,
  Bar,
  Legend,
  LabelList,
} from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";
import {
  projectApprovedFunding,
  projectBenefitsTarget,
  projectTargetRoi,
} from "@/lib/project-finance";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/cost-vs-benefit")({
  component: CostVsBenefitPage,
});

const fmtM = (n: number) => `$${(n / 1e6).toFixed(2)}M`;
const RAG_COLOR: Record<string, string> = { Red: "#ef4444", Amber: "#f59e0b", Green: "#22c55e" };

function CostVsBenefitPage() {
  const { organization } = useAuth();
  const [filters, setFilters] = useState<PortfolioFilterState>(emptyFilters);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => (await supabase.from("projects").select("*")).data ?? [],
    enabled: !!organization,
  });

  const filtered = useMemo(() => applyFilters(projects, filters), [projects, filters]);

  const scored = useMemo(
    () =>
      filtered.map((p: any) => {
        const cost = projectApprovedFunding(p);
        const benefit = projectBenefitsTarget(p);
        const roi = projectTargetRoi(p);
        return { ...p, cost, benefit, roi, net: benefit - cost };
      }),
    [filtered],
  );

  const totalCost = scored.reduce((s, p) => s + p.cost, 0);
  const totalBenefit = scored.reduce((s, p) => s + p.benefit, 0);
  const netValue = totalBenefit - totalCost;
  const portfolioRoi = totalCost > 0 ? (netValue / totalCost) * 100 : 0;
  const projectsWithBenefits = scored.filter((p) => p.benefit > 0).length;

  const top10 = [...scored].sort((a, b) => b.roi - a.roi).slice(0, 10);
  const bottom10 = [...scored].sort((a, b) => a.roi - b.roi).slice(0, 10);

  const detailRows = useMemo(
    () => [...scored].sort((a, b) => b.roi - a.roi),
    [scored],
  );

  const detailColumns: ColumnarColumn<(typeof detailRows)[number]>[] = useMemo(
    () => [
      { key: "project_code", label: "Code" },
      { key: "name", label: "Project" },
      { key: "program", label: "Program", getValue: (p) => p.program || "" },
      { key: "cost", label: "Cost" },
      { key: "benefit", label: "Benefit" },
      { key: "net", label: "Net" },
      { key: "roi", label: "ROI" },
    ],
    [],
  );

  const detailTable = useColumnarTable(detailRows, detailColumns);

  // Quadrant classification (below/above median cost & benefit)
  const medCost = scored.length
    ? [...scored].sort((a, b) => a.cost - b.cost)[Math.floor(scored.length / 2)].cost
    : 0;
  const medBen = scored.length
    ? [...scored].sort((a, b) => a.benefit - b.benefit)[Math.floor(scored.length / 2)].benefit
    : 0;
  const quadrants = { quickWins: 0, bigBets: 0, fillIns: 0, questionable: 0 };
  for (const p of scored) {
    if (p.benefit >= medBen && p.cost < medCost) quadrants.quickWins++;
    else if (p.benefit >= medBen && p.cost >= medCost) quadrants.bigBets++;
    else if (p.benefit < medBen && p.cost < medCost) quadrants.fillIns++;
    else quadrants.questionable++;
  }

  return (
    <PageExport name="Cost_vs_Benefit" title="Cost vs Benefit">
      <PageHeading icon="⚖️">Cost vs Benefit</PageHeading>
      <PortfolioFilters projects={projects} value={filters} onChange={setFilters} />

      <SectionFrame>
        <SectionTitle>Portfolio Value KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiCard label="Total Cost" value={fmtM(totalCost)} accent="#ef4444" />
          <KpiCard label="Total Benefit" value={fmtM(totalBenefit)} accent="#22c55e" />
          <KpiCard
            label="Net Value"
            value={fmtM(netValue)}
            accent={netValue >= 0 ? "#22c55e" : "#ef4444"}
          />
          <KpiCard label="Portfolio ROI" value={`${portfolioRoi.toFixed(1)}%`} accent="#3b82f6" />
          <KpiCard
            label="Projects w/ Benefits"
            value={projectsWithBenefits}
            sub={`of ${scored.length}`}
            accent="#8b5cf6"
          />
        </div>
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart
          title="Cost vs Benefit — Quadrant Matrix (bubble = budget · colour = RAG)"
          heightClass="h-96"
        >
          <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
            <XAxis
              type="number"
              dataKey="cost"
              name="Cost"
              fontSize={11}
              tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`}
              label={{ value: "Cost", position: "insideBottom", offset: -15, fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="benefit"
              name="Benefit"
              fontSize={11}
              tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`}
              label={{ value: "Benefit", angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <ZAxis type="number" dataKey="cost" range={[80, 500]} />
            <ReferenceLine
              x={medCost}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              label={{ value: "median cost", fontSize: 10, fill: "#64748b" }}
            />
            <ReferenceLine
              y={medBen}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              label={{ value: "median benefit", fontSize: 10, fill: "#64748b" }}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ payload }) => {
                const d: any = payload?.[0]?.payload;
                if (!d) return null;
                return (
                  <div className="rounded border bg-white p-2 text-[11px] shadow">
                    <div className="font-semibold">{d.name}</div>
                    <div className="text-muted-foreground">{d.program || "—"}</div>
                    <div>
                      Cost {fmtM(d.cost)} · Benefit {fmtM(d.benefit)}
                    </div>
                    <div>
                      Net {fmtM(d.net)} · ROI {d.roi.toFixed(1)}%
                    </div>
                  </div>
                );
              }}
            />
            <Scatter data={scored}>
              {scored.map((p, i) => (
                <Cell key={i} fill={RAG_COLOR[p.rag || "Green"] || "#3b82f6"} />
              ))}
            </Scatter>
          </ScatterChart>
        </ExpandableChart>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
          <div className="rounded border bg-green-50 p-2">
            <div className="font-semibold text-green-700">Quick Wins</div>
            <div>
              Low cost · High benefit — <b>{quadrants.quickWins}</b>
            </div>
          </div>
          <div className="rounded border bg-blue-50 p-2">
            <div className="font-semibold text-blue-700">Big Bets</div>
            <div>
              High cost · High benefit — <b>{quadrants.bigBets}</b>
            </div>
          </div>
          <div className="rounded border bg-slate-50 p-2">
            <div className="font-semibold text-slate-700">Fill-ins</div>
            <div>
              Low cost · Low benefit — <b>{quadrants.fillIns}</b>
            </div>
          </div>
          <div className="rounded border bg-red-50 p-2">
            <div className="font-semibold text-red-700">Questionable</div>
            <div>
              High cost · Low benefit — <b>{quadrants.questionable}</b>
            </div>
          </div>
        </div>
      </SectionFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionFrame>
          <ExpandableChart title="Top 10 Projects by ROI" heightClass="h-72">
            <BarChart
              data={top10}
              layout="vertical"
              margin={{ top: 5, right: 40, left: 60, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis type="number" fontSize={10} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <YAxis type="category" dataKey="project_code" fontSize={10} width={70} />
              <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
              <Bar dataKey="roi" fill="#22c55e">
                <LabelList
                  dataKey="roi"
                  position="right"
                  formatter={(v: number) => `${v.toFixed(0)}%`}
                  style={{ fontSize: 10, fill: "#166534" }}
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
        </SectionFrame>
        <SectionFrame>
          <ExpandableChart title="Bottom 10 Projects by ROI" heightClass="h-72">
            <BarChart
              data={bottom10}
              layout="vertical"
              margin={{ top: 5, right: 40, left: 60, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis type="number" fontSize={10} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <YAxis type="category" dataKey="project_code" fontSize={10} width={70} />
              <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
              <Bar dataKey="roi" fill="#ef4444">
                <LabelList
                  dataKey="roi"
                  position="right"
                  formatter={(v: number) => `${v.toFixed(0)}%`}
                  style={{ fontSize: 10, fill: "#991b1b" }}
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
        </SectionFrame>
      </div>

      <SectionFrame>
        <SectionTitle>Detail — All Projects ({scored.length})</SectionTitle>
        <ColumnarToolbar
          globalQ={detailTable.globalQ}
          onGlobalQ={detailTable.setGlobalQ}
          shown={detailTable.rows.length}
          total={detailTable.total}
          onClear={detailTable.clearAll}
          placeholder="Search cost vs benefit…"
        />
        <div className="max-h-[420px] overflow-auto">
          <table className="st-table">
            <thead className="sticky top-0 bg-white">
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
                    align={["cost", "benefit", "net", "roi"].includes(col.key) ? "right" : "left"}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {detailTable.rows.length === 0 ? (
                <tr>
                  <td colSpan={detailColumns.length} className="py-8 text-center text-sm text-muted-foreground">
                    {detailTable.total === 0 ? "No projects match filters." : "No matching projects."}
                  </td>
                </tr>
              ) : (
                detailTable.rows.map((p) => (
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
                    <td className="text-right tabular-nums">{fmtM(p.cost)}</td>
                    <td className="text-right tabular-nums">{fmtM(p.benefit)}</td>
                    <td
                      className={
                        "text-right tabular-nums " +
                        (p.net >= 0 ? "text-green-700" : "text-red-700")
                      }
                    >
                      {fmtM(p.net)}
                    </td>
                    <td
                      className={
                        "text-right tabular-nums " +
                        (p.roi >= 0 ? "text-green-700" : "text-red-700")
                      }
                    >
                      {p.roi.toFixed(1)}%
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
