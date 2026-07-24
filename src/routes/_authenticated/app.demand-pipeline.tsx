import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle, PageHeading, KpiCard } from "@/components/streamlit";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExpandableChart } from "@/components/expandable-chart";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/demand-pipeline")({
  component: DemandPipeline,
});

const STAGES = ["Idea", "Screening", "Business Case", "Approved", "Rejected", "On Hold"];
const STAGE_COLORS: Record<string, string> = {
  Idea: "#94a3b8",
  Screening: "#3b82f6",
  "Business Case": "#8b5cf6",
  Approved: "#22c55e",
  Rejected: "#ef4444",
  "On Hold": "#f59e0b",
};

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

function DemandPipeline() {
  const { organization } = useAuth();
  const [statusF, setStatusF] = useState("All");

  const { data: ideas = [] } = useQuery({
    queryKey: ["demand_pipeline", organization?.id],
    queryFn: async () =>
      (
        await supabase
          .from("demand_pipeline")
          .select("*")
          .order("submitted_date", { ascending: false })
      ).data ?? [],
    enabled: !!organization,
  });

  const filtered = useMemo(
    () => (statusF === "All" ? ideas : ideas.filter((i: any) => i.status === statusF)),
    [ideas, statusF],
  );

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "idea_name", label: "Idea" },
      { key: "sponsor", label: "Sponsor" },
      { key: "status", label: "Status" },
      { key: "estimated_cost", label: "Est Cost" },
      { key: "estimated_benefit", label: "Est Benefit" },
      { key: "estimated_roi", label: "ROI %" },
      { key: "strategic_alignment", label: "Align" },
      { key: "complexity", label: "Complex" },
      { key: "submitted_date", label: "Submitted" },
    ],
    [],
  );

  const table = useColumnarTable(filtered, columns);

  const funnel = useMemo(
    () =>
      STAGES.map((s) => ({
        name: s,
        count: ideas.filter((i: any) => i.status === s).length,
        cost: ideas
          .filter((i: any) => i.status === s)
          .reduce((sum: number, x: any) => sum + Number(x.estimated_cost || 0), 0),
        benefit: ideas
          .filter((i: any) => i.status === s)
          .reduce((sum: number, x: any) => sum + Number(x.estimated_benefit || 0), 0),
        color: STAGE_COLORS[s],
      })),
    [ideas],
  );

  const totalCost = filtered.reduce((s: number, i: any) => s + Number(i.estimated_cost || 0), 0);
  const totalBenefit = filtered.reduce(
    (s: number, i: any) => s + Number(i.estimated_benefit || 0),
    0,
  );
  const approved = ideas.filter((i: any) => i.status === "Approved").length;
  const conversion = ideas.length ? Math.round((approved / ideas.length) * 100) : 0;
  const avgROI = filtered.length
    ? filtered.reduce((s: number, i: any) => s + Number(i.estimated_roi || 0), 0) / filtered.length
    : 0;

  const scatter = filtered.map((i: any) => ({
    name: i.idea_name,
    x: Number(i.estimated_cost || 0),
    y: Number(i.estimated_benefit || 0),
    z: Number(i.strategic_alignment || 3) * 60,
    complexity: Number(i.complexity || 3),
    status: i.status,
  }));

  return (
    <div>
      <PageHeading
        icon="📥"
        title="Demand Pipeline"
        subtitle="Ideas & business cases moving from intake to approval."
        actions={
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All statuses</SelectItem>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <SectionFrame>
        <SectionTitle>Pipeline KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Ideas" value={ideas.length} accent="#3b82f6" />
          <KpiCard label="In Pipeline" value={filtered.length} accent="#06b6d4" />
          <KpiCard label="Approved" value={approved} accent="#22c55e" />
          <KpiCard label="Conversion" value={`${conversion}%`} accent="#8b5cf6" />
          <KpiCard label="Est. Cost" value={money(totalCost)} accent="#f59e0b" />
          <KpiCard
            label="Avg ROI"
            value={`${avgROI.toFixed(1)}%`}
            sub={money(totalBenefit)}
            accent="#ec4899"
          />
        </div>
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart title="Funnel — Ideas by Stage" heightClass="h-64">
          <BarChart data={funnel} margin={{ top: 15, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {funnel.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
              <LabelList
                dataKey="count"
                position="top"
                style={{ fontSize: 11, fill: "#334155", fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart
          title="Cost vs Benefit (bubble = strategic alignment)"
          heightClass="h-80"
          legend={
            <div className="flex flex-wrap justify-center gap-3 text-[11px] mt-2">
              {STAGES.map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: STAGE_COLORS[s] }} />
                  {s}
                </span>
              ))}
            </div>
          }
        >
          <ScatterChart margin={{ top: 15, right: 20, left: 10, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis
              type="number"
              dataKey="x"
              name="Cost"
              tickFormatter={money}
              tick={{ fontSize: 10 }}
              label={{
                value: "Estimated Cost",
                position: "insideBottom",
                offset: -8,
                fontSize: 11,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Benefit"
              tickFormatter={money}
              tick={{ fontSize: 10 }}
              label={{
                value: "Estimated Benefit",
                angle: -90,
                position: "insideLeft",
                fontSize: 11,
              }}
            />
            <ZAxis type="number" dataKey="z" range={[50, 400]} />
            <ReferenceLine
              stroke="#94a3b8"
              strokeDasharray="3 3"
              segment={[
                { x: 0, y: 0 },
                { x: 1e7, y: 1e7 },
              ]}
            />
            <Tooltip
              content={({ payload }: any) => {
                const p = payload?.[0]?.payload;
                if (!p) return null;
                return (
                  <div className="rounded border bg-background p-2 text-xs shadow">
                    <div className="font-semibold">{p.name}</div>
                    <div>Cost: {money(p.x)}</div>
                    <div>Benefit: {money(p.y)}</div>
                    <div>Complexity: {p.complexity}/5</div>
                    <div>Status: {p.status}</div>
                  </div>
                );
              }}
            />
            {STAGES.map((s) => (
              <Scatter
                key={s}
                name={s}
                data={scatter.filter((d) => d.status === s)}
                fill={STAGE_COLORS[s]}
              />
            ))}
          </ScatterChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Pipeline Register</SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          dirty={table.isDirty}
          onClear={table.clearAll}
          placeholder="Search pipeline register…"
        />
        <div className="overflow-x-auto">
          <table className="st-table">
            <thead>
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
                    align={
                      [
                        "estimated_cost",
                        "estimated_benefit",
                        "estimated_roi",
                        "strategic_alignment",
                        "complexity",
                      ].includes(col.key)
                        ? "right"
                        : "left"
                    }
                    className={
                      [
                        "estimated_cost",
                        "estimated_benefit",
                        "estimated_roi",
                        "strategic_alignment",
                        "complexity",
                      ].includes(col.key)
                        ? "text-right"
                        : ""
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center text-muted-foreground py-4">
                    {table.total === 0 ? "No ideas in the pipeline." : "No rows match filters"}
                  </td>
                </tr>
              ) : (
                table.rows.map((i: any) => (
                  <tr key={i.id}>
                    <td className="font-medium">{i.idea_name}</td>
                    <td>{i.sponsor || "—"}</td>
                    <td>
                      <span
                        className="rounded px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          background: `${STAGE_COLORS[i.status || "Idea"]}22`,
                          color: STAGE_COLORS[i.status || "Idea"],
                        }}
                      >
                        {i.status || "Idea"}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">
                      {money(Number(i.estimated_cost || 0))}
                    </td>
                    <td className="text-right tabular-nums">
                      {money(Number(i.estimated_benefit || 0))}
                    </td>
                    <td className="text-right tabular-nums">
                      {Number(i.estimated_roi || 0).toFixed(1)}%
                    </td>
                    <td className="text-right tabular-nums">{i.strategic_alignment || "—"}/5</td>
                    <td className="text-right tabular-nums">{i.complexity || "—"}/5</td>
                    <td>
                      {i.submitted_date ? new Date(i.submitted_date).toLocaleDateString() : "—"}
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
