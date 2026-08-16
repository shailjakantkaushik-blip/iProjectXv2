import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PROJECT_PORTFOLIO_SELECT } from "@/lib/query-selects";
import { PROJECT_OPS_EXTRAS } from "@/lib/project-selects";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle, PageHeading, KpiCard, RagChip } from "@/components/streamlit";
import { explainRag } from "@/lib/explain-metric";
import { displayRag, isRagOverridden } from "@/lib/ops-enhancements";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList, Cell } from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";
import {
  projectApprovedFunding,
  projectBenefitsTarget,
  projectRoiPercent,
} from "@/lib/project-finance";
import { paybackScore, projectPaybackMonths } from "@/lib/ops-enhancements";
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
  const qc = useQueryClient();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id, "prioritisation"],
    queryFn: async () => {
      const wide = await supabase
        .from("projects")
        .select(`${PROJECT_PORTFOLIO_SELECT},${PROJECT_OPS_EXTRAS}` as "*");
      if (!wide.error) return wide.data ?? [];
      const { data } = await supabase.from("projects").select(PROJECT_PORTFOLIO_SELECT as "*");
      return data ?? [];
    },
    enabled: !!organization,
  });

  const { data: benefits = [] } = useQuery({
    queryKey: ["benefits", organization?.id, "payback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("benefits")
        .select("project_id,payback_months");
      if (error) return [];
      return data ?? [];
    },
    enabled: !!organization,
  });

  const saveRank = useMutation({
    mutationFn: async ({ id, manual_rank }: { id: string; manual_rank: number | null }) => {
      const { error } = await supabase.from("projects").update({ manual_rank } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", organization?.id, "prioritisation"] });
      toast.success("Manual rank saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ranked = useMemo(() => {
    return projects
      .map((p: any) => {
        const funding = projectApprovedFunding(p);
        const roi = projectRoiPercent(p);
        const benTgt = projectBenefitsTarget(p);
        const priScore = PRI_WEIGHT[p.priority || ""] || 25;
        const months = projectPaybackMonths(p, benefits as any[], p.id);
        const pb = paybackScore(months);
        const score =
          roi * 0.5 +
          priScore * 0.3 +
          (benTgt / 1_000_000) * 5 -
          (funding / 1_000_000) * 2 +
          pb;
        return {
          ...p,
          _score: Math.round(score * 10) / 10,
          _pri: priScore,
          _roi: roi,
          _funding: funding,
          _benTgt: benTgt,
          _payback: months,
          _pb: pb,
        };
      })
      .sort((a: any, b: any) => {
        const am = a.manual_rank == null ? null : Number(a.manual_rank);
        const bm = b.manual_rank == null ? null : Number(b.manual_rank);
        if (am != null && bm != null) return am - bm;
        if (am != null) return -1;
        if (bm != null) return 1;
        return b._score - a._score;
      });
  }, [projects, benefits]);

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
      { key: "_payback", label: "Payback mo" },
      { key: "_score", label: "Score" },
      { key: "manual_rank", label: "Manual rank" },
    ],
    [],
  );
  const rankTable = useColumnarTable(rankedWithRank, rankColumns);

  return (
    <div>
      <PageHeading
        icon="🏆"
        title="Prioritisation"
        subtitle="Score = (ROI% × 0.5) + (Priority weight × 0.3) + (Benefits ÷ $1M × 5) − (Funding ÷ $1M × 2) + early-payback bonus (up to 15). Manual rank overrides sort when set. Clear the box to return to computed order."
      />

      <SectionFrame>
        <SectionTitle>Strategic Alignment Prioritisation KPIs</SectionTitle>
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
                      ["_rank", "_funding", "_benTgt", "_roi", "_payback", "_score", "manual_rank"].includes(col.key)
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
                    <RagChip
                      rag={displayRag(p)}
                      manual={isRagOverridden(p)}
                      explain={explainRag({
                        rag: displayRag(p),
                        source: "register",
                        overridden: isRagOverridden(p),
                      })}
                    />
                  </td>
                  <td className="text-right tabular-nums">{money(p._funding)}</td>
                  <td className="text-right tabular-nums">
                    {money(p._benTgt)}
                  </td>
                  <td className="text-right tabular-nums">
                    {Number(p._roi || 0).toFixed(1)}%
                  </td>
                  <td className="text-right tabular-nums">{p._payback ?? "—"}</td>
                  <td className="text-right tabular-nums font-semibold">{p._score}</td>
                  <td className="text-right">
                    <input
                      className="st-input !w-16 !py-0.5 text-right"
                      type="number"
                      min={1}
                      placeholder="—"
                      defaultValue={p.manual_rank ?? ""}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const next = raw === "" ? null : Number(raw);
                        const prev = p.manual_rank == null ? null : Number(p.manual_rank);
                        if (next === prev) return;
                        saveRank.mutate({ id: p.id, manual_rank: Number.isFinite(next as number) ? (next as number) : null });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </div>
  );
}
