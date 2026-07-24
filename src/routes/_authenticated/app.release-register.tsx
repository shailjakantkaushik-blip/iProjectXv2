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

export const Route = createFileRoute("/_authenticated/app/release-register")({
  component: ReleaseRegisterPage,
});

const STATUSES = ["Submitted", "In Review", "Approved", "Rejected", "Deferred"];
const TYPES = ["Scope", "Schedule", "Budget", "Resource", "Technical", "Governance"];
const IMPACT = ["Low", "Medium", "High", "Critical"];
import { RELEASE_STATUS_COLORS as STATUS_COLORS } from "@/lib/chart-theme";

function ReleaseRegisterPage() {
  const { organization } = useAuth();
  const qc = useQueryClient();
  const orgId = organization?.id;

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () =>
      (await supabase.from("projects").select("id,name,project_code").order("name")).data ?? [],
    enabled: !!orgId,
  });
  const { data: crs = [] } = useQuery({
    queryKey: ["change_requests", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("change_requests")
          .select("*")
          .order("raised_date", { ascending: false })
      ).data ?? [],
    enabled: !!orgId,
  });
  const projectById = useMemo(
    () => new Map(projects.map((p: any) => [p.id, p])),
    [projects],
  );

  const [form, setForm] = useState({
    project_id: "",
    cr_number: "",
    title: "",
    change_type: "Scope",
    impact_scope: "Medium",
    impact_schedule_days: 0,
    impact_cost: 0,
    status: "Submitted",
    owner: "",
    raised_by: "",
    approver: "",
    notes: "",
    description: "",
  });

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "cr_number", label: "CR #" },
      {
        key: "project",
        label: "Project",
        getValue: (c) => (projectById.get(c.project_id) as any)?.project_code || "",
      },
      { key: "title", label: "Title" },
      { key: "change_type", label: "Type" },
      { key: "owner", label: "Owner" },
      { key: "raised_by", label: "Raised By" },
      { key: "approver", label: "Approver" },
      { key: "impact_scope", label: "Impact" },
      { key: "impact_schedule_days", label: "Days" },
      { key: "impact_cost", label: "Cost" },
      { key: "status", label: "Status" },
      { key: "raised_date", label: "Raised" },
      { key: "notes", label: "Notes" },
    ],
    [projectById],
  );

  const table = useColumnarTable(crs, columns);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.project_id || !form.title) throw new Error("Project and title required");
      const { error } = await supabase.from("change_requests").insert({
        org_id: orgId,
        project_id: form.project_id,
        cr_number: form.cr_number || null,
        title: form.title,
        description: form.description || null,
        change_type: form.change_type,
        impact_scope: form.impact_scope,
        impact_schedule_days: form.impact_schedule_days,
        impact_cost: form.impact_cost,
        status: form.status,
        owner: form.owner || null,
        raised_by: form.raised_by || form.owner || null,
        approver: form.approver || null,
        notes: form.notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change_requests", orgId] });
      toast.success("Release / change request added");
      setForm((f) => ({
        ...f,
        cr_number: "",
        title: "",
        owner: "",
        raised_by: "",
        approver: "",
        notes: "",
        description: "",
      }));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("change_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change_requests", orgId] });
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const total = crs.length;
  const approved = crs.filter((c: any) => c.status === "Approved").length;
  const pending = crs.filter(
    (c: any) => c.status === "Submitted" || c.status === "In Review",
  ).length;
  const totalCost = crs.reduce((s: number, c: any) => s + Number(c.impact_cost || 0), 0);
  const totalDays = crs.reduce((s: number, c: any) => s + Number(c.impact_schedule_days || 0), 0);

  const byStatus = STATUSES.map((s) => ({
    name: s,
    value: crs.filter((c: any) => c.status === s).length,
  })).filter((d) => d.value > 0);
  const byType = TYPES.map((t) => ({
    type: t,
    count: crs.filter((c: any) => c.change_type === t).length,
  })).filter((d) => d.count > 0);

  return (
    <PageExport name="Release_Register" title="Release & Change Register">
      <PageHeading
        icon="🚀"
        actions={
          <button
            className="st-btn-primary"
            onClick={() =>
              document
                .getElementById("log-form")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            + Log new release
          </button>
        }
      >
        Release &amp; Change Register
      </PageHeading>

      <SectionFrame>
        <SectionTitle>Release KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiCard label="Total" value={total} />
          <KpiCard label="Approved" value={approved} />
          <KpiCard label="Pending" value={pending} />
          <KpiCard label="Cost Impact" value={`$${totalCost.toLocaleString()}`} />
          <KpiCard label="Schedule Impact" value={`${totalDays} d`} />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Release Analytics</SectionTitle>
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
          <ExpandableChart title="By Change Type" heightClass="h-56">
            <BarChart data={byType}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="type" fontSize={10} />
              <YAxis allowDecimals={false} fontSize={10} />
              <Tooltip />
              <Bar dataKey="count" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ExpandableChart>
        </div>
      </SectionFrame>

      <SectionFrame id="log-form">
        <SectionTitle>Add Release / Change Request</SectionTitle>
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
            className="st-input"
            placeholder="CR # (auto if blank)"
            value={form.cr_number}
            onChange={(e) => setForm((f) => ({ ...f, cr_number: e.target.value }))}
          />
          <input
            className="st-input md:col-span-2"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <input
            className="st-input"
            placeholder="Owner"
            value={form.owner}
            onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
          />
          <input
            className="st-input"
            placeholder="Raised by"
            value={form.raised_by}
            onChange={(e) => setForm((f) => ({ ...f, raised_by: e.target.value }))}
          />
          <input
            className="st-input"
            placeholder="Approver"
            value={form.approver}
            onChange={(e) => setForm((f) => ({ ...f, approver: e.target.value }))}
          />
          <select
            className="st-input"
            value={form.change_type}
            onChange={(e) => setForm((f) => ({ ...f, change_type: e.target.value }))}
          >
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            className="st-input"
            value={form.impact_scope}
            onChange={(e) => setForm((f) => ({ ...f, impact_scope: e.target.value }))}
          >
            {IMPACT.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
          <input
            className="st-input"
            type="number"
            placeholder="Schedule Δ (days)"
            value={form.impact_schedule_days}
            onChange={(e) =>
              setForm((f) => ({ ...f, impact_schedule_days: Number(e.target.value) }))
            }
          />
          <input
            className="st-input"
            type="number"
            placeholder="Cost Δ ($)"
            value={form.impact_cost}
            onChange={(e) => setForm((f) => ({ ...f, impact_cost: Number(e.target.value) }))}
          />
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
            className="st-input md:col-span-2"
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
            className="st-btn-primary"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Saving…" : "Add"}
          </button>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Release Register</SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          onClear={table.clearAll}
          placeholder="Search release register…"
        />
        {table.total === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No releases / change requests logged.
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
                {table.rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="py-6 text-center text-muted-foreground">
                      No rows match filters
                    </td>
                  </tr>
                ) : (
                  table.rows.map((c: any) => {
                    const p = projectById.get(c.project_id) as any;
                    return (
                      <tr key={c.id}>
                        <td>
                          <EditableCell
                            table="change_requests"
                            rowId={c.id}
                            field="cr_number"
                            value={c.cr_number}
                            invalidateKeys={["change_requests"]}
                          />
                        </td>
                        <td className="font-medium">{p?.project_code || "—"}</td>
                        <td>
                          <EditableCell
                            table="change_requests"
                            rowId={c.id}
                            field="title"
                            value={c.title}
                            invalidateKeys={["change_requests"]}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="change_requests"
                            rowId={c.id}
                            field="change_type"
                            value={c.change_type}
                            type="select"
                            options={TYPES.map((t) => ({ label: t, value: t }))}
                            invalidateKeys={["change_requests"]}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="change_requests"
                            rowId={c.id}
                            field="owner"
                            value={c.owner}
                            invalidateKeys={["change_requests"]}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="change_requests"
                            rowId={c.id}
                            field="raised_by"
                            value={c.raised_by}
                            invalidateKeys={["change_requests"]}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="change_requests"
                            rowId={c.id}
                            field="approver"
                            value={c.approver}
                            invalidateKeys={["change_requests"]}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="change_requests"
                            rowId={c.id}
                            field="impact_scope"
                            value={c.impact_scope}
                            type="select"
                            options={IMPACT.map((i) => ({ label: i, value: i }))}
                            invalidateKeys={["change_requests"]}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="change_requests"
                            rowId={c.id}
                            field="impact_schedule_days"
                            value={c.impact_schedule_days}
                            type="number"
                            invalidateKeys={["change_requests"]}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="change_requests"
                            rowId={c.id}
                            field="impact_cost"
                            value={c.impact_cost}
                            type="number"
                            invalidateKeys={["change_requests"]}
                            display={(v) => `$${Number(v || 0).toLocaleString()}`}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="change_requests"
                            rowId={c.id}
                            field="status"
                            value={c.status}
                            type="select"
                            options={STATUSES.map((s) => ({ label: s, value: s }))}
                            invalidateKeys={["change_requests"]}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="change_requests"
                            rowId={c.id}
                            field="raised_date"
                            value={c.raised_date}
                            type="date"
                            invalidateKeys={["change_requests"]}
                          />
                        </td>
                        <td className="max-w-[220px]">
                          <EditableCell
                            table="change_requests"
                            rowId={c.id}
                            field="notes"
                            value={c.notes}
                            invalidateKeys={["change_requests"]}
                          />
                        </td>
                        <td>
                          <button
                            className="text-xs text-rose-600 hover:underline"
                            onClick={() => confirm("Delete this entry?") && del.mutate(c.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </PageExport>
  );
}
