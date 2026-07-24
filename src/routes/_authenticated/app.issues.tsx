import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { EditableCell } from "@/components/editable-cell";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/issues")({
  component: IssuesPage,
});

const STATUSES = ["Open", "In Progress", "Blocked", "Resolved", "Closed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

function IssuesPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () =>
      (await supabase.from("projects").select("id,name,project_code").order("name")).data ?? [],
    enabled: !!orgId,
  });
  const { data: issues = [] } = useQuery({
    queryKey: ["issues", orgId],
    queryFn: async () =>
      (await supabase.from("issues").select("*").order("raised_date", { ascending: false })).data ??
      [],
    enabled: !!orgId,
  });

  const projectById = useMemo(
    () => new Map(projects.map((p: any) => [p.id, p])),
    [projects],
  );

  const [form, setForm] = useState({
    project_id: "",
    title: "",
    priority: "Medium",
    status: "Open",
    owner: "",
    description: "",
    target_date: "",
  });

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      {
        key: "project",
        label: "Project",
        getValue: (i) => (projectById.get(i.project_id) as any)?.project_code || "",
      },
      { key: "title", label: "Title" },
      { key: "priority", label: "Priority" },
      { key: "status", label: "Status" },
      { key: "owner", label: "Owner" },
      { key: "raised_date", label: "Raised" },
      { key: "target_date", label: "Target" },
    ],
    [projectById],
  );

  const table = useColumnarTable(issues, columns);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.project_id || !form.title) throw new Error("Project and title required");
      const { error } = await supabase.from("issues").insert({
        org_id: orgId,
        project_id: form.project_id,
        title: form.title,
        priority: form.priority,
        status: form.status,
        owner: form.owner || null,
        description: form.description || null,
        target_date: form.target_date || null,
        raised_date: new Date().toISOString().slice(0, 10),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issues", orgId] });
      toast.success("Issue logged");
      setForm((f) => ({ ...f, title: "", owner: "", description: "", target_date: "" }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("issues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issues", orgId] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = issues.filter((i: any) => i.status === "Open" || i.status === "In Progress").length;
  const critical = issues.filter((i: any) => i.priority === "Critical").length;
  const blocked = issues.filter((i: any) => i.status === "Blocked").length;

  return (
    <PageExport name="Issues_Register" title="Issues Register">
      <PageHeading
        title="Issues Register"
        subtitle="Track delivery blockers and defects across the portfolio"
        actions={
          <button
            className="st-btn-primary"
            onClick={() =>
              document.getElementById("log-form")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            + Log issue
          </button>
        }
      />

      <SectionFrame>
        <SectionTitle>Issue KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Total" value={issues.length} />
          <KpiCard label="Open / Active" value={open} />
          <KpiCard label="Blocked" value={blocked} />
          <KpiCard label="Critical" value={critical} />
        </div>
      </SectionFrame>

      <SectionFrame id="log-form">
        <SectionTitle>Log an Issue</SectionTitle>
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
            placeholder="Owner"
            value={form.owner}
            onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
          />
          <input
            className="st-input md:col-span-3"
            placeholder="Issue title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <input
            className="st-input"
            type="date"
            value={form.target_date}
            onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
          />
          <textarea
            className="st-input md:col-span-3"
            rows={2}
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <button className="st-btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : "Save issue"}
          </button>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Issues Register</SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          onClear={table.clearAll}
        />
        {table.rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {table.total === 0 ? "No issues logged yet." : "No matching issues."}
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
                {table.rows.map((i: any) => (
                  <tr key={i.id}>
                    <td className="font-medium">
                      {(projectById.get(i.project_id) as any)?.project_code || "—"}
                    </td>
                    <td>
                      <EditableCell
                        table="issues"
                        rowId={i.id}
                        field="title"
                        value={i.title}
                        invalidateKeys={["issues"]}
                      />
                    </td>
                    <td>
                      <EditableCell
                        table="issues"
                        rowId={i.id}
                        field="priority"
                        value={i.priority}
                        invalidateKeys={["issues"]}
                      />
                    </td>
                    <td>
                      <EditableCell
                        table="issues"
                        rowId={i.id}
                        field="status"
                        value={i.status}
                        invalidateKeys={["issues"]}
                      />
                    </td>
                    <td>
                      <EditableCell
                        table="issues"
                        rowId={i.id}
                        field="owner"
                        value={i.owner}
                        invalidateKeys={["issues"]}
                      />
                    </td>
                    <td className="text-xs whitespace-nowrap">{i.raised_date || "—"}</td>
                    <td>
                      <EditableCell
                        table="issues"
                        rowId={i.id}
                        field="target_date"
                        value={i.target_date}
                        type="date"
                        invalidateKeys={["issues"]}
                      />
                    </td>
                    <td>
                      <button
                        className="text-xs text-rose-600 hover:underline"
                        onClick={() => confirm("Delete issue?") && del.mutate(i.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </PageExport>
  );
}
