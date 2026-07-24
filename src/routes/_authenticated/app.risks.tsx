import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { EditableCell } from "@/components/editable-cell";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { RISK_STATUS_COLORS as STATUS_COLORS } from "@/lib/chart-theme";
import { ChartLegendList, legendItemsFromCounts } from "@/components/chart-legend-list";
import { ExpandableChart } from "@/components/expandable-chart";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/risks")({ component: RisksPage });

const STATUSES = ["Open", "Mitigating", "Closed", "Accepted"];
const CATEGORIES = [
  "Delivery",
  "Financial",
  "Resource",
  "Supplier",
  "Data",
  "Technical",
  "Regulatory",
  "Reputation",
];

function RisksPage() {
  const { organization } = useAuth();
  const qc = useQueryClient();
  const orgId = organization?.id;

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () =>
      (await supabase.from("projects").select("id,name,project_code").order("name")).data ?? [],
    enabled: !!orgId,
  });
  const { data: risks = [] } = useQuery({
    queryKey: ["risks", orgId],
    queryFn: async () =>
      (await supabase.from("risks").select("*").order("severity", { ascending: false })).data ?? [],
    enabled: !!orgId,
  });

  const projectById = useMemo(
    () => new Map(projects.map((p: any) => [p.id, p])),
    [projects],
  );

  const [form, setForm] = useState({
    project_id: "",
    title: "",
    category: "Delivery",
    probability: 3,
    impact: 3,
    status: "Open",
    owner: "",
    mitigation: "",
    notes: "",
    due_date: "",
  });

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      {
        key: "project",
        label: "Project",
        getValue: (r) => (projectById.get(r.project_id) as any)?.project_code || "",
      },
      { key: "title", label: "Title" },
      { key: "category", label: "Category" },
      { key: "owner", label: "Owner" },
      { key: "probability", label: "P" },
      { key: "impact", label: "I" },
      {
        key: "severity",
        label: "Sev",
        getValue: (r) =>
          r.severity ?? (r.probability && r.impact ? r.probability * r.impact : null),
      },
      { key: "status", label: "Status" },
      { key: "due_date", label: "Due" },
      { key: "mitigation", label: "Mitigation" },
      { key: "notes", label: "Notes" },
    ],
    [projectById],
  );

  const table = useColumnarTable(risks, columns);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.project_id || !form.title) throw new Error("Project and title required");
      const { error } = await supabase.from("risks").insert({
        org_id: orgId,
        project_id: form.project_id,
        title: form.title,
        category: form.category,
        probability: form.probability,
        impact: form.impact,
        severity: form.probability * form.impact,
        status: form.status,
        owner: form.owner || null,
        mitigation: form.mitigation || null,
        notes: form.notes || null,
        due_date: form.due_date || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["risks", orgId] });
      toast.success("Risk added");
      setForm((f) => ({ ...f, title: "", owner: "", mitigation: "", notes: "", due_date: "" }));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("risks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["risks", orgId] });
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const total = risks.length;
  const open = risks.filter((r: any) => r.status === "Open").length;
  const mitigating = risks.filter((r: any) => r.status === "Mitigating").length;
  const critical = risks.filter((r: any) => (r.severity ?? 0) >= 15).length;
  const overdue = risks.filter(
    (r: any) => r.due_date && new Date(r.due_date) < new Date() && r.status !== "Closed",
  ).length;

  const byStatus = STATUSES.map((s) => ({
    name: s,
    value: risks.filter((r: any) => r.status === s).length,
  })).filter((d) => d.value > 0);
  const byCat = CATEGORIES.map((c) => ({
    category: c,
    count: risks.filter((r: any) => r.category === c).length,
  })).filter((d) => d.count > 0);

  return (
    <PageExport name="Risks_Register" title="Risks Register">
      <PageHeading
        icon="⚠️"
        actions={
          <button
            className="st-btn-primary"
            onClick={() =>
              document
                .getElementById("log-form")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            + Log new risk
          </button>
        }
      >
        Risks Register
      </PageHeading>

      <SectionFrame>
        <SectionTitle>Risk KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiCard label="Total" value={total} />
          <KpiCard label="Open" value={open} />
          <KpiCard label="Mitigating" value={mitigating} />
          <KpiCard label="Critical (≥15)" value={critical} />
          <KpiCard label="Overdue" value={overdue} />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Risk Analytics</SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ExpandableChart
            title="By Status"
            heightClass="h-56"
            legend={
              <ChartLegendList items={legendItemsFromCounts(byStatus, STATUS_COLORS)} columns={2} />
            }
          >
            <PieChart>
              <Pie
                data={byStatus}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={70}
              >
                {byStatus.map((e) => (
                  <Cell key={e.name} fill={STATUS_COLORS[e.name] || "#64748b"} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ExpandableChart>
          <ExpandableChart title="By Category" heightClass="h-56">
            <BarChart data={byCat}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="category" fontSize={10} />
              <YAxis allowDecimals={false} fontSize={10} />
              <Tooltip />
              <Bar dataKey="count" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ExpandableChart>
        </div>
      </SectionFrame>

      <SectionFrame id="log-form">
        <SectionTitle>Add Risk</SectionTitle>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <select
            className="st-input"
            value={form.project_id}
            onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
          >
            <option value="">— Project —</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.project_code} · {p.name}
              </option>
            ))}
          </select>
          <input
            className="st-input md:col-span-2"
            placeholder="Risk title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <input
            className="st-input"
            placeholder="Owner"
            value={form.owner}
            onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
          />
          <select
            className="st-input"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            className="st-input"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs">
            P
            <input
              className="st-input"
              type="number"
              min={1}
              max={5}
              value={form.probability}
              onChange={(e) => setForm((f) => ({ ...f, probability: Number(e.target.value) }))}
            />
          </label>
          <label className="flex items-center gap-1 text-xs">
            I
            <input
              className="st-input"
              type="number"
              min={1}
              max={5}
              value={form.impact}
              onChange={(e) => setForm((f) => ({ ...f, impact: Number(e.target.value) }))}
            />
          </label>
          <input
            className="st-input"
            type="date"
            value={form.due_date}
            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
          />
          <input
            className="st-input md:col-span-2"
            placeholder="Mitigation"
            value={form.mitigation}
            onChange={(e) => setForm((f) => ({ ...f, mitigation: e.target.value }))}
          />
          <input
            className="st-input md:col-span-3"
            placeholder="Notes / info"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <button
            className="st-btn-primary"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Saving…" : "Add risk"}
          </button>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Risk Register ({risks.length})</SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          onClear={table.clearAll}
        />
        {table.rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {table.total === 0 ? "No risks recorded." : "No matching risks."}
          </div>
        ) : (
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
                    />
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r: any) => {
                  const p = projectById.get(r.project_id) as any;
                  return (
                    <tr key={r.id}>
                      <td className="font-medium">{p?.project_code || "—"}</td>
                      <td>
                        <EditableCell
                          table="risks"
                          rowId={r.id}
                          field="title"
                          value={r.title}
                          invalidateKeys={["risks"]}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="risks"
                          rowId={r.id}
                          field="category"
                          value={r.category}
                          type="select"
                          options={CATEGORIES.map((c) => ({ label: c, value: c }))}
                          invalidateKeys={["risks"]}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="risks"
                          rowId={r.id}
                          field="owner"
                          value={r.owner}
                          invalidateKeys={["risks"]}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="risks"
                          rowId={r.id}
                          field="probability"
                          value={r.probability}
                          type="number"
                          invalidateKeys={["risks"]}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="risks"
                          rowId={r.id}
                          field="impact"
                          value={r.impact}
                          type="number"
                          invalidateKeys={["risks"]}
                        />
                      </td>
                      <td className="tabular-nums">
                        {r.severity ?? (r.probability && r.impact ? r.probability * r.impact : "—")}
                      </td>
                      <td>
                        <EditableCell
                          table="risks"
                          rowId={r.id}
                          field="status"
                          value={r.status}
                          type="select"
                          options={STATUSES.map((s) => ({ label: s, value: s }))}
                          invalidateKeys={["risks"]}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="risks"
                          rowId={r.id}
                          field="due_date"
                          value={r.due_date}
                          type="date"
                          invalidateKeys={["risks"]}
                        />
                      </td>
                      <td className="max-w-[220px]">
                        <EditableCell
                          table="risks"
                          rowId={r.id}
                          field="mitigation"
                          value={r.mitigation}
                          invalidateKeys={["risks"]}
                        />
                      </td>
                      <td className="max-w-[220px]">
                        <EditableCell
                          table="risks"
                          rowId={r.id}
                          field="notes"
                          value={r.notes}
                          invalidateKeys={["risks"]}
                        />
                      </td>
                      <td>
                        <button
                          className="text-xs text-rose-600 hover:underline"
                          onClick={() => confirm("Delete this risk?") && del.mutate(r.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </PageExport>
  );
}
