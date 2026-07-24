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

export const Route = createFileRoute("/_authenticated/app/stakeholders")({
  component: StakeholdersPage,
});

const LEVELS = ["High", "Medium", "Low"];

function StakeholdersPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () =>
      (await supabase.from("projects").select("id,name,project_code").order("name")).data ?? [],
    enabled: !!orgId,
  });
  const { data: stakeholders = [] } = useQuery({
    queryKey: ["stakeholders", orgId],
    queryFn: async () =>
      (await supabase.from("stakeholders").select("*").order("name")).data ?? [],
    enabled: !!orgId,
  });

  const projectById = useMemo(() => new Map(projects.map((p: any) => [p.id, p])), [projects]);
  const [form, setForm] = useState({
    project_id: "",
    name: "",
    role: "",
    email: "",
    influence: "Medium",
    interest: "Medium",
    engagement_strategy: "",
  });

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      {
        key: "project",
        label: "Project",
        getValue: (s) => (projectById.get(s.project_id) as any)?.project_code || "",
      },
      { key: "name", label: "Name" },
      { key: "role", label: "Role" },
      { key: "influence", label: "Influence" },
      { key: "interest", label: "Interest" },
      { key: "engagement_strategy", label: "Strategy" },
    ],
    [projectById],
  );

  const table = useColumnarTable(stakeholders, columns);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.project_id || !form.name) throw new Error("Project and name required");
      const { error } = await supabase.from("stakeholders").insert({
        org_id: orgId,
        project_id: form.project_id,
        name: form.name,
        role: form.role || null,
        email: form.email || null,
        influence: form.influence,
        interest: form.interest,
        engagement_strategy: form.engagement_strategy || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stakeholders", orgId] });
      toast.success("Stakeholder added");
      setForm((f) => ({ ...f, name: "", role: "", email: "", engagement_strategy: "" }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stakeholders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stakeholders", orgId] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const highInfluence = stakeholders.filter((s: any) => s.influence === "High").length;

  return (
    <PageExport name="Stakeholders" title="Stakeholders">
      <PageHeading
        title="Stakeholders"
        subtitle="Map influence, interest, and engagement strategy"
        actions={
          <button
            type="button"
            className="st-btn-primary st-btn-inline"
            onClick={() =>
              document.getElementById("log-form")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            + Add stakeholder
          </button>
        }
      />

      <SectionFrame>
        <SectionTitle>Engagement snapshot</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard label="Stakeholders" value={stakeholders.length} />
          <KpiCard label="High influence" value={highInfluence} />
          <KpiCard
            label="Projects covered"
            value={new Set(stakeholders.map((s: any) => s.project_id)).size}
          />
        </div>
      </SectionFrame>

      <SectionFrame id="log-form">
        <SectionTitle>Add Stakeholder</SectionTitle>
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
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="st-input"
            placeholder="Role"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          />
          <input
            className="st-input"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <select
            className="st-input"
            value={form.influence}
            onChange={(e) => setForm((f) => ({ ...f, influence: e.target.value }))}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                Influence: {l}
              </option>
            ))}
          </select>
          <select
            className="st-input"
            value={form.interest}
            onChange={(e) => setForm((f) => ({ ...f, interest: e.target.value }))}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                Interest: {l}
              </option>
            ))}
          </select>
          <input
            className="st-input md:col-span-2"
            placeholder="Engagement strategy"
            value={form.engagement_strategy}
            onChange={(e) => setForm((f) => ({ ...f, engagement_strategy: e.target.value }))}
          />
          <button
            type="button"
            className="st-btn-primary md:col-span-4"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Saving…" : "Save stakeholder"}
          </button>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Stakeholder Register</SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          dirty={table.isDirty}
          onClear={table.clearAll}
          placeholder="Search stakeholders…"
        />
        {table.total === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No stakeholders yet.</div>
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
                    <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      No stakeholders match filters.
                    </td>
                  </tr>
                ) : (
                  table.rows.map((s: any) => (
                    <tr key={s.id}>
                      <td className="font-medium">
                        {(projectById.get(s.project_id) as any)?.project_code || "—"}
                      </td>
                      <td>
                        <EditableCell
                          table="stakeholders"
                          rowId={s.id}
                          field="name"
                          value={s.name}
                          invalidateKeys={["stakeholders"]}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="stakeholders"
                          rowId={s.id}
                          field="role"
                          value={s.role}
                          invalidateKeys={["stakeholders"]}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="stakeholders"
                          rowId={s.id}
                          field="influence"
                          value={s.influence}
                          invalidateKeys={["stakeholders"]}
                        />
                      </td>
                      <td>
                        <EditableCell
                          table="stakeholders"
                          rowId={s.id}
                          field="interest"
                          value={s.interest}
                          invalidateKeys={["stakeholders"]}
                        />
                      </td>
                      <td className="max-w-[220px]">
                        <EditableCell
                          table="stakeholders"
                          rowId={s.id}
                          field="engagement_strategy"
                          value={s.engagement_strategy}
                          invalidateKeys={["stakeholders"]}
                        />
                      </td>
                      <td>
                        <button
                          className="text-xs text-rose-600 hover:underline"
                          onClick={() => confirm("Delete stakeholder?") && del.mutate(s.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </PageExport>
  );
}
