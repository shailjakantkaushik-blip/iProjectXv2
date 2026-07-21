import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle, PageHeading, KpiCard } from "@/components/streamlit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LabelList,
  ReferenceLine,
} from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";
import {
  projectApprovedFunding,
  projectBenefitsTarget,
  projectRoiPercent,
} from "@/lib/project-finance";

export const Route = createFileRoute("/_authenticated/app/portfolio-segmentation")({
  component: Segmentation,
});

const RAG: Record<string, string> = { Green: "#22c55e", Amber: "#f59e0b", Red: "#ef4444" };
const PROG_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#22c55e",
  "#f59e0b",
  "#06b6d4",
  "#f43f5e",
  "#84cc16",
];

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

function Segmentation() {
  const { organization } = useAuth();
  const [dim, setDim] = useState<
    "program" | "priority" | "delivery_method" | "sponsor" | "current_phase"
  >("program");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => (await supabase.from("projects").select("*")).data ?? [],
    enabled: !!organization,
  });

  const scatterData = projects.map((p: any) => ({
    name: p.name,
    x: projectApprovedFunding(p),
    y: projectRoiPercent(p),
    z: projectBenefitsTarget(p) || projectApprovedFunding(p) || 100000,
    rag: p.rag || "Amber",
  }));

  const segCounts = useMemo(() => {
    const m = new Map<string, { name: string; count: number; budget: number }>();
    projects.forEach((p: any) => {
      const k = p[dim] || "Unassigned";
      const cur = m.get(k) || { name: k, count: 0, budget: 0 };
      cur.count += 1;
      cur.budget += projectApprovedFunding(p);
      m.set(k, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  }, [projects, dim]);

  // Quadrant counts (Budget vs ROI)
  const medBudget = median(scatterData.map((d) => d.x));
  const medRoi = median(scatterData.map((d) => d.y));
  const quads = { HH: 0, HL: 0, LH: 0, LL: 0 };
  scatterData.forEach((d) => {
    if (d.x >= medBudget && d.y >= medRoi) quads.HH++;
    else if (d.x >= medBudget && d.y < medRoi) quads.HL++;
    else if (d.x < medBudget && d.y >= medRoi) quads.LH++;
    else quads.LL++;
  });

  return (
    <div>
      <PageHeading
        icon="🎨"
        title="Portfolio Segmentation"
        subtitle="Cluster projects by dimension to spot patterns and outliers."
      />

      <SectionFrame>
        <SectionTitle>Quadrant KPIs — Budget × ROI</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Strategic (High $, High ROI)" value={quads.HH} accent="#22c55e" />
          <KpiCard label="Question (Low $, High ROI)" value={quads.LH} accent="#3b82f6" />
          <KpiCard label="Cash Cow (High $, Low ROI)" value={quads.HL} accent="#f59e0b" />
          <KpiCard label="Divest (Low $, Low ROI)" value={quads.LL} accent="#ef4444" />
        </div>
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart title="Budget × ROI Scatter (bubble = benefits target)" heightClass="h-80">
          <ScatterChart margin={{ top: 15, right: 20, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis
              type="number"
              dataKey="x"
              name="Budget"
              tickFormatter={money}
              tick={{ fontSize: 10 }}
              label={{ value: "Budget", position: "insideBottom", offset: -8, fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="ROI"
              unit="%"
              tick={{ fontSize: 10 }}
              label={{ value: "ROI %", angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <ZAxis type="number" dataKey="z" range={[60, 400]} />
            <ReferenceLine x={medBudget} stroke="#94a3b8" strokeDasharray="3 3" />
            <ReferenceLine y={medRoi} stroke="#94a3b8" strokeDasharray="3 3" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              formatter={(v: any, k: any) =>
                k === "Budget" ? money(v) : `${Number(v).toFixed(1)}%`
              }
              labelFormatter={() => ""}
              content={({ payload }: any) => {
                const p = payload?.[0]?.payload;
                if (!p) return null;
                return (
                  <div className="rounded border bg-background p-2 text-xs shadow">
                    <div className="font-semibold">{p.name}</div>
                    <div>Budget: {money(p.x)}</div>
                    <div>ROI: {p.y?.toFixed(1)}%</div>
                    <div>Benefits target: {money(p.z)}</div>
                  </div>
                );
              }}
            />
            {["Green", "Amber", "Red"].map((r) => (
              <Scatter
                key={r}
                name={r}
                data={scatterData.filter((d) => d.rag === r)}
                fill={RAG[r]}
              />
            ))}
          </ScatterChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Segment by Dimension</SectionTitle>
          <Select value={dim} onValueChange={(v: any) => setDim(v)}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="program">Program</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="delivery_method">Delivery method</SelectItem>
              <SelectItem value="sponsor">Sponsor</SelectItem>
              <SelectItem value="current_phase">Current Phase</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <ExpandableChart title="Distribution by Segment" heightClass="h-64">
              <PieChart>
                <Pie
                  data={segCounts}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={90}
                  paddingAngle={1}
                >
                  {segCounts.map((_, i) => (
                    <Cell key={i} fill={PROG_COLORS[i % PROG_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ExpandableChart>
            <div className="mt-2 max-h-24 overflow-y-auto overscroll-contain pr-0.5">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] sm:grid-cols-3">
                {segCounts.map((s, i) => (
                  <span
                    key={s.name}
                    className="flex min-w-0 items-center gap-1.5"
                    title={`${s.name} ${s.count}`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: PROG_COLORS[i % PROG_COLORS.length] }}
                    />
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="shrink-0 text-muted-foreground">{s.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <ExpandableChart title="Budget by Segment" heightClass="h-64">
            <BarChart
              data={segCounts}
              layout="vertical"
              margin={{ top: 5, right: 40, left: 80, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" tickFormatter={money} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Bar dataKey="budget" fill="#3b82f6">
                <LabelList
                  dataKey="budget"
                  position="right"
                  formatter={(v: number) => money(v)}
                  style={{ fontSize: 10, fill: "#334155" }}
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
        </div>
      </SectionFrame>
    </div>
  );
}

function median(arr: number[]) {
  const a = arr
    .filter((x) => Number.isFinite(x))
    .slice()
    .sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
