import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canEditProjects } from "@/lib/auth-context";
import { useTablePermission } from "@/lib/permissions";
import { EditableCell } from "@/components/editable-cell";
import {
  DEMAND_STAGES,
  DEMAND_STAGE_COLORS,
  demandPaybackMonths,
  demandStageOptions,
  impliedDemandRoi,
} from "@/lib/demand-pipeline";
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

const STAGES = DEMAND_STAGES as unknown as string[];
const STAGE_COLORS = DEMAND_STAGE_COLORS;

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

function DemandPipeline() {
  const { organization, roles } = useAuth();
  const orgId = organization?.id;
  const canConvert = canEditProjects(roles);
  const { canEdit } = useTablePermission("demand_pipeline");
  // PM / BU lead / admin can always update pipeline rows (same set as convert-to-project).
  const canEditDemand = canEdit || canConvert;
  const qc = useQueryClient();
  const [statusF, setStatusF] = useState("All");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({
    idea_name: "",
    sponsor: "",
    status: "Idea",
    estimated_cost: "",
    estimated_benefit: "",
    strategic_alignment: "3",
    complexity: "3",
    description: "",
  });

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
      const { data, error } = await supabase.rpc(
        "convert_demand_idea_to_project" as never,
        {
          _idea_id: idea.id,
        } as never,
      );
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const proj = row as { id?: string; project_code?: string } | null;
      if (!proj?.id) throw new Error("Project was not created");
      return { id: proj.id, project_code: proj.project_code || "project" };
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

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organisation");
      const name = form.idea_name.trim();
      if (!name) throw new Error("Idea name is required");
      const cost = form.estimated_cost === "" ? null : Number(form.estimated_cost);
      const benefit = form.estimated_benefit === "" ? null : Number(form.estimated_benefit);
      const roi =
        cost != null && benefit != null && Number.isFinite(cost) && Number.isFinite(benefit)
          ? impliedDemandRoi(cost, benefit)
          : null;
      const { error } = await supabase.from("demand_pipeline").insert({
        org_id: orgId,
        idea_name: name,
        sponsor: form.sponsor.trim() || null,
        status: form.status,
        estimated_cost: Number.isFinite(Number(cost)) ? cost : null,
        estimated_benefit: Number.isFinite(Number(benefit)) ? benefit : null,
        estimated_roi: roi,
        strategic_alignment: Number(form.strategic_alignment) || null,
        complexity: Number(form.complexity) || null,
        description: form.description.trim() || null,
        submitted_date: new Date().toISOString().slice(0, 10),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demand_pipeline", orgId] });
      toast.success("Demand idea saved");
      setForm({
        idea_name: "",
        sponsor: "",
        status: "Idea",
        estimated_cost: "",
        estimated_benefit: "",
        strategic_alignment: "3",
        complexity: "3",
        description: "",
      });
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
  const stageOptions = useMemo(() => demandStageOptions(ideas), [ideas]);

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
            {canEditDemand ? (
              <button
                type="button"
                className="st-btn-primary st-btn-inline"
                onClick={() =>
                  document.getElementById("log-demand")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                + Add idea
              </button>
            ) : null}
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

      {canEditDemand ? (
        <SectionFrame id="log-demand">
          <SectionTitle>Log demand idea</SectionTitle>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <input
              className="st-input md:col-span-2"
              placeholder="Idea name"
              value={form.idea_name}
              onChange={(e) => setForm((f) => ({ ...f, idea_name: e.target.value }))}
            />
            <input
              className="st-input"
              placeholder="Sponsor"
              value={form.sponsor}
              onChange={(e) => setForm((f) => ({ ...f, sponsor: e.target.value }))}
            />
            <select
              className="st-input"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              className="st-input"
              type="number"
              placeholder="Est. cost"
              value={form.estimated_cost}
              onChange={(e) => setForm((f) => ({ ...f, estimated_cost: e.target.value }))}
            />
            <input
              className="st-input"
              type="number"
              placeholder="Est. benefit"
              value={form.estimated_benefit}
              onChange={(e) => setForm((f) => ({ ...f, estimated_benefit: e.target.value }))}
            />
            <input
              className="st-input"
              type="number"
              min={1}
              max={5}
              placeholder="Align 1–5"
              value={form.strategic_alignment}
              onChange={(e) => setForm((f) => ({ ...f, strategic_alignment: e.target.value }))}
            />
            <input
              className="st-input"
              type="number"
              min={1}
              max={5}
              placeholder="Complexity 1–5"
              value={form.complexity}
              onChange={(e) => setForm((f) => ({ ...f, complexity: e.target.value }))}
            />
            <input
              className="st-input md:col-span-3"
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <button
              type="button"
              className="st-btn-primary"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Saving…" : "Save idea"}
            </button>
          </div>
        </SectionFrame>
      ) : null}

      <SectionFrame>
        <SectionTitle>Pipeline Register</SectionTitle>
        <p className="mb-2 text-xs text-muted-foreground">
          {canEditDemand
            ? "Click a cell to update status, cost, benefit, and other fields. Creating a project from an idea still marks it Approved."
            : "View only — ask an admin, PM, or BU lead to change demand status."}
        </p>
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
                      <td className="font-medium">
                        <EditableCell
                          table="demand_pipeline"
                          rowId={i.id}
                          field="idea_name"
                          value={i.idea_name}
                          invalidateKeys={["demand_pipeline"]}
                          forceEditable={canEditDemand}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="demand_pipeline"
                          rowId={i.id}
                          field="sponsor"
                          value={i.sponsor}
                          invalidateKeys={["demand_pipeline"]}
                          forceEditable={canEditDemand}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="demand_pipeline"
                          rowId={i.id}
                          field="status"
                          value={i.status || "Idea"}
                          type="select"
                          options={stageOptions.map((s) => ({ label: s, value: s }))}
                          invalidateKeys={["demand_pipeline"]}
                          forceEditable={canEditDemand}
                          display={(v) => {
                            const status = String(v || "Idea");
                            const color = STAGE_COLORS[status] || "#64748b";
                            return (
                              <span
                                className="rounded px-2 py-0.5 text-[11px] font-semibold"
                                style={{ background: `${color}22`, color }}
                              >
                                {status}
                              </span>
                            );
                          }}
                        />
                      </td>
                      <td className="text-right tabular-nums">
                        <EditableCell
                          table="demand_pipeline"
                          rowId={i.id}
                          field="estimated_cost"
                          value={i.estimated_cost}
                          type="number"
                          invalidateKeys={["demand_pipeline"]}
                          forceEditable={canEditDemand}
                          display={(v) => money(Number(v || 0))}
                        />
                      </td>
                      <td className="text-right tabular-nums">
                        <EditableCell
                          table="demand_pipeline"
                          rowId={i.id}
                          field="estimated_benefit"
                          value={i.estimated_benefit}
                          type="number"
                          invalidateKeys={["demand_pipeline"]}
                          forceEditable={canEditDemand}
                          display={(v) => money(Number(v || 0))}
                        />
                      </td>
                      <td className="text-right tabular-nums">
                        <EditableCell
                          table="demand_pipeline"
                          rowId={i.id}
                          field="estimated_roi"
                          value={i.estimated_roi}
                          type="number"
                          invalidateKeys={["demand_pipeline"]}
                          forceEditable={canEditDemand}
                          display={(v) => `${Number(v || 0).toFixed(1)}%`}
                        />
                      </td>
                      <td className="text-right tabular-nums">
                        {payback == null ? "—" : `${payback} mo`}
                      </td>
                      <td className="text-right tabular-nums">
                        <EditableCell
                          table="demand_pipeline"
                          rowId={i.id}
                          field="strategic_alignment"
                          value={i.strategic_alignment}
                          type="number"
                          invalidateKeys={["demand_pipeline"]}
                          forceEditable={canEditDemand}
                          display={(v) => (v == null || v === "" ? "—" : `${v}/5`)}
                        />
                      </td>
                      <td className="text-right tabular-nums">
                        <EditableCell
                          table="demand_pipeline"
                          rowId={i.id}
                          field="complexity"
                          value={i.complexity}
                          type="number"
                          invalidateKeys={["demand_pipeline"]}
                          forceEditable={canEditDemand}
                          display={(v) => (v == null || v === "" ? "—" : `${v}/5`)}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="demand_pipeline"
                          rowId={i.id}
                          field="submitted_date"
                          value={i.submitted_date ? String(i.submitted_date).slice(0, 10) : ""}
                          type="date"
                          invalidateKeys={["demand_pipeline"]}
                          forceEditable={canEditDemand}
                          display={(v) => (v ? new Date(String(v)).toLocaleDateString() : "—")}
                        />
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
