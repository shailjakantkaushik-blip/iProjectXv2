import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
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

function demandPaybackMonths(idea: { estimated_cost?: number | null; estimated_benefit?: number | null }) {
  const cost = Number(idea.estimated_cost || 0);
  const benefit = Number(idea.estimated_benefit || 0);
  if (!(cost > 0) || !(benefit > 0)) return null;
  return Math.round((cost / benefit) * 12 * 10) / 10;
}

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

function DemandPipeline() {
  const { organization, session, roles } = useAuth();
  const orgId = organization?.id;
  const userId = session?.user?.id;
  const canConvert = isAdmin(roles);
  const qc = useQueryClient();
  const [statusF, setStatusF] = useState("All");
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const convert = useMutation({
    mutationFn: async (idea: any) => {
      if (!orgId) throw new Error("No organisation");
      if (idea.project_id) throw new Error("Already converted to a project");
      const baseCode = String(idea.idea_name || "IDEA")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "")
        .slice(0, 8);
      const code = `DM-${baseCode || "NEW"}-${String(idea.id).slice(0, 4).toUpperCase()}`;
      const cost = Number(idea.estimated_cost) || 0;
      const benefit = Number(idea.estimated_benefit) || 0;
      const { data: proj, error } = await supabase
        .from("projects")
        .insert({
          org_id: orgId,
          project_code: code,
          name: idea.idea_name || "Converted demand",
          sponsor: idea.sponsor || null,
          status: "Not Started",
          rag: "Green",
          priority: "Medium",
          delivery_method: "Hybrid",
          budget: cost || null,
          capex_approved: cost ? Math.round(cost * 0.6) : null,
          opex_approved: cost ? Math.round(cost * 0.4) : null,
          benefits_target: benefit || null,
          roi_percent: Number(idea.estimated_roi) || null,
          portfolio: "Business Strategic",
        } as never)
        .select("id,project_code")
        .single();
      if (error) throw error;
      const projectId = (proj as any).id as string;
      const { error: uErr } = await supabase
        .from("demand_pipeline")
        .update({
          project_id: projectId,
          status: "Approved",
          converted_at: new Date().toISOString(),
          converted_by: userId || null,
        } as never)
        .eq("id", idea.id);
      if (uErr) {
        // Column may not exist yet — still leave project created; surface SQL hint
        if (/converted_at|project_id|schema cache|does not exist/i.test(uErr.message)) {
          throw new Error(
            `Project ${ (proj as any).project_code } created, but demand link failed — run ppm_platform_depth.sql then retry link. (${uErr.message})`,
          );
        }
        throw uErr;
      }
      return proj as { id: string; project_code: string };
    },
    onMutate: (idea) => setBusyId(idea.id),
    onSettled: () => setBusyId(null),
    onSuccess: (proj) => {
      qc.invalidateQueries({ queryKey: ["demand_pipeline", orgId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Created project ${proj.project_code}`);
    },
    onError: (e: Error) => toast.error(e.message),
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
      {
        key: "_payback",
        label: "Payback",
        getValue: (i) => demandPaybackMonths(i),
      },
      { key: "strategic_alignment", label: "Align" },
      { key: "complexity", label: "Complex" },
      { key: "submitted_date", label: "Submitted" },
      {
        key: "project",
        label: "Create Project Link",
        getValue: (i) => (i.project_id ? "linked" : ""),
      },
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
        subtitle="Ideas & business cases — promote approved demand into a project register entry."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/app/work-board" className="text-xs text-sky-700 hover:underline">
              Work board
            </Link>
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
          </div>
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
        <div className="st-table-wrap overflow-x-auto">
          <table className="st-table min-w-[960px]">
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
                        "_payback",
                        "strategic_alignment",
                        "complexity",
                      ].includes(col.key)
                        ? "right"
                        : "left"
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-4 text-center text-muted-foreground">
                    {table.total === 0 ? "No ideas in the pipeline." : "No rows match filters"}
                  </td>
                </tr>
              ) : (
                table.rows.map((i: any) => {
                  const payback = demandPaybackMonths(i);
                  return (
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
                      <td className="text-right tabular-nums">
                        {payback == null ? "—" : `${payback} mo`}
                      </td>
                      <td className="text-right tabular-nums">{i.strategic_alignment || "—"}/5</td>
                      <td className="text-right tabular-nums">{i.complexity || "—"}/5</td>
                      <td>
                        {i.submitted_date ? new Date(i.submitted_date).toLocaleDateString() : "—"}
                      </td>
                      <td className="whitespace-nowrap">
                        {i.project_id ? (
                          <Link
                            to="/app/projects/$id"
                            params={{ id: i.project_id }}
                            className="text-xs font-semibold text-sky-700 hover:underline"
                          >
                            Open project
                          </Link>
                        ) : canConvert ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50"
                            disabled={busyId === i.id || convert.isPending}
                            onClick={() => {
                              if (
                                !confirm(
                                  `Create a project from “${i.idea_name}” and mark this idea Approved?`,
                                )
                              ) {
                                return;
                              }
                              convert.mutate(i);
                            }}
                          >
                            {busyId === i.id ? "Converting…" : "Create Project Link"}
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Ask admin</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
    </div>
  );
}
