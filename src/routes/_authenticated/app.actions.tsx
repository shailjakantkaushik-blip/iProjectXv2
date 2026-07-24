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
import { ChartLegendList, legendItemsFromCounts } from "@/components/chart-legend-list";
import { ExpandableChart } from "@/components/expandable-chart";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/actions")({ component: ActionsPage });

const STATUSES = ["Open", "In Progress", "Blocked", "Closed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const PRIO_COLORS: Record<string, string> = {
  Critical: "#7f1d1d",
  High: "#dc2626",
  Medium: "#f59e0b",
  Low: "#15803d",
};

function ActionsPage() {
  const { organization } = useAuth();
  const qc = useQueryClient();
  const orgId = organization?.id;

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () =>
      (await supabase.from("projects").select("id,name,project_code").order("name")).data ?? [],
    enabled: !!orgId,
  });
  const { data: actions = [] } = useQuery({
    queryKey: ["actions", orgId],
    queryFn: async () => (await supabase.from("actions").select("*").order("due_date")).data ?? [],
    enabled: !!orgId,
  });
  const projectById = useMemo(
    () => new Map(projects.map((p: any) => [p.id, p])),
    [projects],
  );

  const [form, setForm] = useState({
    project_id: "",
    title: "",
    owner: "",
    priority: "Medium",
    status: "Open",
    due_date: "",
    description: "",
    notes: "",
  });

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      {
        key: "project",
        label: "Project",
        getValue: (a) => (projectById.get(a.project_id) as any)?.project_code || "",
      },
      { key: "title", label: "Title" },
      { key: "owner", label: "Owner" },
      { key: "priority", label: "Priority" },
      { key: "status", label: "Status" },
      { key: "due_date", label: "Due" },
      { key: "description", label: "Description" },
      { key: "notes", label: "Notes" },
    ],
    [projectById],
  );

  const table = useColumnarTable(actions, columns);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.project_id || !form.title) throw new Error("Project and title required");
      const { error } = await supabase.from("actions").insert({
        org_id: orgId,
        project_id: form.project_id,
        title: form.title,
        owner: form.owner || null,
        priority: form.priority,
        status: form.status,
        due_date: form.due_date || null,
        description: form.description || null,
        notes: form.notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["actions", orgId] });
      toast.success("Action added");
      setForm((f) => ({ ...f, title: "", owner: "", description: "", notes: "", due_date: "" }));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("actions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["actions", orgId] });
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const today = new Date();
  const total = actions.length;
  const open = actions.filter((a: any) => a.status !== "Closed").length;
  const overdue = actions.filter(
    (a: any) => a.due_date && new Date(a.due_date) < today && a.status !== "Closed",
  ).length;
  const high = actions.filter(
    (a: any) => a.priority === "High" || a.priority === "Critical",
  ).length;
  const closed = actions.filter((a: any) => a.status === "Closed").length;

  const byPriority = PRIORITIES.map((p) => ({
    name: p,
    value: actions.filter((a: any) => a.priority === p).length,
  })).filter((d) => d.value > 0);
  const byOwner = Array.from(
    actions
      .reduce(
        (m: Map<string, number>, a: any) =>
          m.set(a.owner || "Unassigned", (m.get(a.owner || "Unassigned") || 0) + 1),
        new Map(),
      )
      .entries(),
  )
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => (b.count as number) - (a.count as number))
    .slice(0, 8);

  return (
    <PageExport name="Actions_Register" title="Actions Register">
      <PageHeading
        icon="✅"
        actions={
          <button
            type="button"
            className="st-btn-primary st-btn-inline"
            onClick={() =>
              document
                .getElementById("log-form")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            + Log new action
          </button>
        }
      >
        Actions Register
      </PageHeading>

      <SectionFrame>
        <SectionTitle>Action KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiCard label="Total" value={total} />
          <KpiCard label="Open" value={open} />
          <KpiCard label="Overdue" value={overdue} />
          <KpiCard label="High / Critical" value={high} />
          <KpiCard label="Closed" value={closed} />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Action Analytics</SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ExpandableChart
            title="By Priority"
            heightClass="h-56"
            legend={
              <ChartLegendList items={legendItemsFromCounts(byPriority, PRIO_COLORS)} columns={2} />
            }
          >
            <PieChart>
              <Pie
                data={byPriority}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={70}
              >
                {byPriority.map((e) => (
                  <Cell key={e.name} fill={PRIO_COLORS[e.name] || "#64748b"} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ExpandableChart>
          <ExpandableChart title="Load by Owner (Top 8)" heightClass="h-56">
            <BarChart data={byOwner as any[]} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis type="number" allowDecimals={false} fontSize={10} />
              <YAxis type="category" dataKey="owner" fontSize={10} width={110} />
              <Tooltip />
              <Bar dataKey="count" fill="#1d4ed8" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ExpandableChart>
        </div>
      </SectionFrame>

      <SectionFrame id="log-form">
        <SectionTitle>Add Action</SectionTitle>
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
            placeholder="Action title"
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
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
          >
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
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
          <input
            className="st-input"
            type="date"
            value={form.due_date}
            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
          />
          <input
            className="st-input"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <input
            className="st-input md:col-span-3"
            placeholder="Notes / info"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <button
            type="button"
            className="st-btn-primary"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Saving…" : "Add action"}
          </button>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Actions Register ({actions.length})</SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          dirty={table.isDirty}
          onClear={table.clearAll}
        />
        {table.rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {table.total === 0 ? "No actions recorded." : "No matching actions."}
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
                {table.rows.map((a: any) => {
                  const p = projectById.get(a.project_id) as any;
                  return (
                    <tr key={a.id}>
                      <td className="font-medium">{p?.project_code || "—"}</td>
                      <td>
                        <EditableCell
                          table="actions"
                          rowId={a.id}
                          field="title"
                          value={a.title}
                          invalidateKeys={["actions"]}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="actions"
                          rowId={a.id}
                          field="owner"
                          value={a.owner}
                          invalidateKeys={["actions"]}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="actions"
                          rowId={a.id}
                          field="priority"
                          value={a.priority}
                          type="select"
                          options={PRIORITIES.map((p) => ({ label: p, value: p }))}
                          invalidateKeys={["actions"]}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="actions"
                          rowId={a.id}
                          field="status"
                          value={a.status}
                          type="select"
                          options={STATUSES.map((s) => ({ label: s, value: s }))}
                          invalidateKeys={["actions"]}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="actions"
                          rowId={a.id}
                          field="due_date"
                          value={a.due_date}
                          type="date"
                          invalidateKeys={["actions"]}
                        />
                      </td>
                      <td className="max-w-[220px]">
                        <EditableCell
                          table="actions"
                          rowId={a.id}
                          field="description"
                          value={a.description}
                          invalidateKeys={["actions"]}
                        />
                      </td>
                      <td className="max-w-[220px]">
                        <EditableCell
                          table="actions"
                          rowId={a.id}
                          field="notes"
                          value={a.notes}
                          invalidateKeys={["actions"]}
                        />
                      </td>
                      <td>
                        <button
                          className="text-xs text-rose-600 hover:underline"
                          onClick={() => confirm("Delete this action?") && del.mutate(a.id)}
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
