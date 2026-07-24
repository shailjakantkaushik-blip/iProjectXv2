import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle, PageHeading, KpiCard, RagChip } from "@/components/streamlit";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList, Cell } from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";
import {
  projectApprovedFunding,
  projectBenefitsTarget,
  projectRoiPercent,
} from "@/lib/project-finance";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/prioritisation")({
  component: Prioritisation,
});

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

const PRI_WEIGHT: Record<string, number> = {
  "P1 - Critical": 100,
  P1: 100,
  Critical: 100,
  "P2 - High": 75,
  P2: 75,
  High: 75,
  "P3 - Medium": 50,
  P3: 50,
  Medium: 50,
  "P4 - Low": 25,
  P4: 25,
  Low: 25,
};

function Prioritisation() {
  const { organization } = useAuth();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => (await supabase.from("projects").select("*")).data ?? [],
    enabled: !!organization,
  });

  const ranked = useMemo(() => {
    return projects
      .map((p: any) => {
        const funding = projectApprovedFunding(p);
        // Prefer stored roi_percent; else target ROI = (benefits − funding) / funding
        const roi = projectRoiPercent(p);
        const benTgt = projectBenefitsTarget(p);
        const priScore = PRI_WEIGHT[p.priority || ""] || 25;
        // Composite score (documented in page subtitle)
        const score =
          roi * 0.5 + priScore * 0.3 + (benTgt / 1_000_000) * 5 - (funding / 1_000_000) * 2;
        return { ...p, _score: Math.round(score * 10) / 10, _pri: priScore, _roi: roi, _funding: funding, _benTgt: benTgt };
      })
      .sort((a: any, b: any) => b._score - a._score);
  }, [projects]);

  const top10 = ranked.slice(0, 10);
  const bottom5 = ranked.slice(-5).reverse();

  const totalScore = ranked.reduce((s: number, p: any) => s + p._score, 0);
  const avgROI = ranked.length
    ? ranked.reduce((s: number, p: any) => s + Number(p._roi || 0), 0) / ranked.length
    : 0;
  const critical = projects.filter(
    (p: any) => (p.priority || "").startsWith("P1") || p.priority === "Critical",
  ).length;

  const bottomColumns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "name", label: "Project" },
      { key: "priority", label: "Priority" },
      { key: "_score", label: "Score" },
      { key: "_roi", label: "ROI" },
    ],
    [],
  );
  const bottomTable = useColumnarTable(bottom5, bottomColumns);

  const rankedWithRank = useMemo(
    () => ranked.map((p: any, i: number) => ({ ...p, _rank: i + 1 })),
    [ranked],
  );

  const rankColumns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "_rank", label: "Rank" },
      { key: "name", label: "Project" },
      { key: "program", label: "Program" },
      { key: "priority", label: "Priority" },
      { key: "rag", label: "RAG" },
      { key: "_funding", label: "Approved Funding" },
      { key: "_benTgt", label: "Benefits Tgt" },
      { key: "_roi", label: "ROI %" },
      { key: "_score", label: "Score" },
    ],
    [],
  );
  const rankTable = useColumnarTable(rankedWithRank, rankColumns);

  return (
    <div>
      <PageHeading
        icon="🏆"
        title="Prioritisation"
        subtitle="Composite score = (ROI% × 0.5) + (Priority weight × 0.3) + (Benefits target ÷ $1M × 5) − (Approved funding ÷ $1M × 2). ROI uses stored roi_percent, else target ROI."
      />

      <SectionFrame>
        <SectionTitle>Portfolio Prioritisation KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Projects Ranked" value={ranked.length} accent="#3b82f6" />
          <KpiCard label="P1 / Critical" value={critical} accent="#ef4444" />
          <KpiCard label="Avg ROI" value={`${avgROI.toFixed(1)}%`} accent="#22c55e" />
          <KpiCard label="Total Score" value={totalScore.toFixed(0)} accent="#8b5cf6" />
        </div>
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart title="Top 10 Priority Score" heightClass="h-72">
          <BarChart
            data={top10.map((p: any) => ({
              name: p.name.slice(0, 22),
              score: p._score,
              roi: p._roi || 0,
            }))}
            layout="vertical"
            margin={{ top: 5, right: 40, left: 120, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
            <Tooltip />
            <Bar dataKey="score" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
              <LabelList
                dataKey="score"
                position="right"
                style={{ fontSize: 10, fill: "#334155" }}
              />
            </Bar>
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionFrame>
          <ExpandableChart title="Top 5 by ROI" heightClass="h-56">
            <BarChart
              data={[...ranked]
                .sort((a: any, b: any) => (b._roi || 0) - (a._roi || 0))
                .slice(0, 5)
                .map((p: any) => ({ name: p.name.slice(0, 20), roi: Number(p._roi || 0) }))}
              layout="vertical"
              margin={{ top: 5, right: 40, left: 110, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
              <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
              <Bar dataKey="roi" fill="#22c55e" radius={[0, 4, 4, 0]}>
                <LabelList
                  dataKey="roi"
                  position="right"
                  formatter={(v: number) => `${v.toFixed(0)}%`}
                  style={{ fontSize: 10, fill: "#334155" }}
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
        </SectionFrame>

        <SectionFrame>
          <SectionTitle>Bottom 5 (candidates to defer)</SectionTitle>
          <ColumnarToolbar
            globalQ={bottomTable.globalQ}
            onGlobalQ={bottomTable.setGlobalQ}
            shown={bottomTable.rows.length}
            total={bottomTable.total}
            dirty={bottomTable.isDirty}
          onClear={bottomTable.clearAll}
            placeholder="Search bottom 5…"
          />
          <div className="overflow-x-auto">
            <table className="st-table">
              <thead>
                <tr>
                  {bottomColumns.map((col) => (
                    <ColumnarTh
                      key={col.key}
                      column={col}
                      filter={bottomTable.filters[col.key]}
                      onFilter={(v) => bottomTable.setColumnFilter(col.key, v)}
                      sortKey={bottomTable.sortKey}
                      sortDir={bottomTable.sortDir}
                      onToggleSort={bottomTable.toggleSort}
                      align={col.key === "_score" || col.key === "_roi" ? "right" : "left"}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {bottomTable.rows.map((p: any) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td>{p.priority || "—"}</td>
                    <td className="text-right tabular-nums">{p._score}</td>
                    <td className="text-right tabular-nums">
                      {Number(p._roi || 0).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionFrame>
      </div>

      <SectionFrame>
        <SectionTitle>Full Ranking</SectionTitle>
        <ColumnarToolbar
          globalQ={rankTable.globalQ}
          onGlobalQ={rankTable.setGlobalQ}
          shown={rankTable.rows.length}
          total={rankTable.total}
          dirty={rankTable.isDirty}
          onClear={rankTable.clearAll}
          placeholder="Search ranking…"
        />
        <div className="overflow-x-auto">
          <table className="st-table">
            <thead>
              <tr>
                {rankColumns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={rankTable.filters[col.key]}
                    onFilter={(v) => rankTable.setColumnFilter(col.key, v)}
                    sortKey={rankTable.sortKey}
                    sortDir={rankTable.sortDir}
                    onToggleSort={rankTable.toggleSort}
                    align={
                      ["_rank", "_funding", "_benTgt", "_roi", "_score"].includes(col.key)
                        ? "right"
                        : "left"
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rankTable.rows.map((p: any) => (
                <tr key={p.id}>
                  <td className="text-right font-mono">{p._rank}</td>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.program || "—"}</td>
                  <td>{p.priority || "—"}</td>
                  <td>
                    <RagChip rag={p.rag} />
                  </td>
                  <td className="text-right tabular-nums">{money(p._funding)}</td>
                  <td className="text-right tabular-nums">
                    {money(p._benTgt)}
                  </td>
                  <td className="text-right tabular-nums">
                    {Number(p._roi || 0).toFixed(1)}%
                  </td>
                  <td className="text-right tabular-nums font-semibold">{p._score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </div>
  );
}
