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

export const Route = createFileRoute("/_authenticated/app/lessons")({
  component: LessonsPage,
});

const CATEGORIES = [
  "Delivery",
  "Governance",
  "Financial",
  "People",
  "Technology",
  "Vendor",
  "Other",
];

function LessonsPage() {
  const { organization, profile } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () =>
      (await supabase.from("projects").select("id,name,project_code").order("name")).data ?? [],
    enabled: !!orgId,
  });
  const { data: lessons = [] } = useQuery({
    queryKey: ["lessons_learned", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("lessons_learned")
          .select("*")
          .order("captured_date", { ascending: false })
      ).data ?? [],
    enabled: !!orgId,
  });

  const projectById = useMemo(() => new Map(projects.map((p: any) => [p.id, p])), [projects]);
  const [form, setForm] = useState({
    project_id: "",
    category: "Delivery",
    what_happened: "",
    root_cause: "",
    recommendation: "",
    captured_by: profile?.full_name || "",
  });

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      {
        key: "project",
        label: "Project",
        getValue: (l) => (projectById.get(l.project_id) as any)?.project_code || "",
      },
      { key: "category", label: "Category" },
      { key: "what_happened", label: "What happened" },
      { key: "recommendation", label: "Recommendation" },
      { key: "captured_by", label: "By" },
      { key: "captured_date", label: "Date" },
    ],
    [projectById],
  );

  const table = useColumnarTable(lessons, columns);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.project_id || !form.what_happened) {
        throw new Error("Project and what happened are required");
      }
      const { error } = await supabase.from("lessons_learned").insert({
        org_id: orgId,
        project_id: form.project_id,
        category: form.category,
        what_happened: form.what_happened,
        root_cause: form.root_cause || null,
        recommendation: form.recommendation || null,
        captured_by: form.captured_by || null,
        captured_date: new Date().toISOString().slice(0, 10),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lessons_learned", orgId] });
      toast.success("Lesson captured");
      setForm((f) => ({ ...f, what_happened: "", root_cause: "", recommendation: "" }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lessons_learned").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lessons_learned", orgId] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageExport name="Lessons_Learned" title="Lessons Learned">
      <PageHeading
        title="Lessons Learned"
        subtitle="Capture what worked, what failed, and how to improve"
        actions={
          <button
            className="st-btn-primary"
            onClick={() =>
              document.getElementById("log-form")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            + Capture lesson
          </button>
        }
      />

      <SectionFrame>
        <SectionTitle>Portfolio learning</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard label="Lessons" value={lessons.length} />
          <KpiCard
            label="Categories"
            value={new Set(lessons.map((l: any) => l.category).filter(Boolean)).size}
          />
          <KpiCard
            label="Projects covered"
            value={new Set(lessons.map((l: any) => l.project_id)).size}
          />
        </div>
      </SectionFrame>

      <SectionFrame id="log-form">
        <SectionTitle>Capture a Lesson</SectionTitle>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
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
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            className="st-input"
            placeholder="Captured by"
            value={form.captured_by}
            onChange={(e) => setForm((f) => ({ ...f, captured_by: e.target.value }))}
          />
          <textarea
            className="st-input md:col-span-3"
            rows={2}
            placeholder="What happened"
            value={form.what_happened}
            onChange={(e) => setForm((f) => ({ ...f, what_happened: e.target.value }))}
          />
          <textarea
            className="st-input md:col-span-3"
            rows={2}
            placeholder="Root cause"
            value={form.root_cause}
            onChange={(e) => setForm((f) => ({ ...f, root_cause: e.target.value }))}
          />
          <textarea
            className="st-input md:col-span-2"
            rows={2}
            placeholder="Recommendation"
            value={form.recommendation}
            onChange={(e) => setForm((f) => ({ ...f, recommendation: e.target.value }))}
          />
          <button className="st-btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : "Save lesson"}
          </button>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Lessons Register</SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          dirty={table.isDirty}
            onClear={table.clearAll}
          placeholder="Search lessons…"
        />
        {table.total === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No lessons captured yet.</div>
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
                      No lessons match filters.
                    </td>
                  </tr>
                ) : (
                  table.rows.map((l: any) => (
                    <tr key={l.id}>
                      <td className="font-medium">
                        {(projectById.get(l.project_id) as any)?.project_code || "—"}
                      </td>
                      <td>
                        <EditableCell
                          table="lessons_learned"
                          rowId={l.id}
                          field="category"
                          value={l.category}
                          invalidateKeys={["lessons_learned"]}
                        />
                      </td>
                      <td className="max-w-[260px]">
                        <EditableCell
                          table="lessons_learned"
                          rowId={l.id}
                          field="what_happened"
                          value={l.what_happened}
                          invalidateKeys={["lessons_learned"]}
                        />
                      </td>
                      <td className="max-w-[260px]">
                        <EditableCell
                          table="lessons_learned"
                          rowId={l.id}
                          field="recommendation"
                          value={l.recommendation}
                          invalidateKeys={["lessons_learned"]}
                        />
                      </td>
                      <td className="text-xs">{l.captured_by || "—"}</td>
                      <td className="text-xs whitespace-nowrap">{l.captured_date || "—"}</td>
                      <td>
                        <button
                          className="text-xs text-rose-600 hover:underline"
                          onClick={() => confirm("Delete lesson?") && del.mutate(l.id)}
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
