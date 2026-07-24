import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjectOptions, projectOptionsQueryKey } from "@/lib/project-options";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { PageLoading } from "@/components/page-loading";
import { fetchOrgStreams, formatProjectStreamRef, formatStreamLabel } from "@/lib/project-streams";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/work-items")({
  component: WorkItemsPage,
});

const STATUSES = ["To Do", "In Progress", "Blocked", "Done", "Cancelled"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

function WorkItemsPage() {
  const { organization, session, profile } = useAuth();
  const orgId = organization?.id;
  const userId = session?.user?.id;
  const qc = useQueryClient();
  const [mineOnly, setMineOnly] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: projectOptionsQueryKey(orgId),
    queryFn: fetchProjectOptions,
    enabled: !!orgId,
  });

  const { data: streams = [] } = useQuery({
    queryKey: ["project_streams", orgId],
    queryFn: async () => (orgId ? fetchOrgStreams(orgId) : []),
    enabled: !!orgId,
  });

  const itemsQ = useQuery({
    queryKey: ["work_items", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_items" as any)
        .select("*")
        .order("sort_order")
        .order("planned_end");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });
  const items = itemsQ.data ?? [];
  const isLoading = itemsQ.isLoading && !itemsQ.data;

  const projectById = useMemo(
    () => new Map(projects.map((p: any) => [p.id, p])),
    [projects],
  );

  const streamsByProject = useMemo(() => {
    const m = new Map<string, any[]>();
    (streams as any[]).forEach((s) => {
      const list = m.get(s.project_id) || [];
      list.push(s);
      m.set(s.project_id, list);
    });
    for (const list of m.values()) {
      list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    return m;
  }, [streams]);

  const streamById = useMemo(
    () => new Map((streams as any[]).map((s) => [s.id, s])),
    [streams],
  );

  const [form, setForm] = useState({
    project_id: "",
    stream_id: "",
    title: "",
    status: "To Do",
    priority: "Medium",
    owner: profile?.full_name || "",
    assign_to_me: true,
    planned_start: "",
    planned_end: "",
    percent_complete: "0",
    wbs_code: "",
  });

  const formStreams = streamsByProject.get(form.project_id) || [];

  const visibleBase = useMemo(() => {
    if (!mineOnly || !userId) return items;
    return items.filter((i) => i.owner_user_id === userId);
  }, [items, mineOnly, userId]);

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      {
        key: "project",
        label: "Project",
        getValue: (i) => (projectById.get(i.project_id) as any)?.project_code || "",
      },
      {
        key: "stream",
        label: "Stream",
        getValue: (i) => {
          const s = i.stream_id ? streamById.get(i.stream_id) : null;
          const p = projectById.get(i.project_id);
          return s && p ? formatProjectStreamRef(p as any, s) : s ? formatStreamLabel(s) : "";
        },
      },
      { key: "wbs_code", label: "WBS" },
      { key: "title", label: "Title" },
      { key: "status", label: "Status" },
      { key: "percent_complete", label: "%" },
      { key: "owner", label: "Owner" },
      { key: "planned_end", label: "End" },
    ],
    [projectById, streamById],
  );

  const table = useColumnarTable(visibleBase, columns);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.project_id || !form.title) throw new Error("Project and title required");
      let streamId = form.stream_id || null;
      if (!streamId) {
        const def = formStreams.find((s) => s.is_default) || formStreams[0];
        streamId = def?.id || null;
      }
      const { error } = await supabase.from("work_items" as any).insert({
        org_id: orgId,
        project_id: form.project_id,
        stream_id: streamId,
        title: form.title,
        status: form.status,
        priority: form.priority,
        owner: form.owner || null,
        owner_user_id: form.assign_to_me ? userId : null,
        planned_start: form.planned_start || null,
        planned_end: form.planned_end || null,
        percent_complete: Number(form.percent_complete) || 0,
        wbs_code: form.wbs_code || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work_items", orgId] });
      toast.success("Work item created");
      setForm((f) => ({ ...f, title: "", wbs_code: "", planned_start: "", planned_end: "" }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase.from("work_items" as any).update(updates as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work_items", orgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("work_items" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work_items", orgId] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const done = items.filter((i) => i.status === "Done").length;
  const blocked = items.filter((i) => i.status === "Blocked").length;
  const inProgress = items.filter((i) => i.status === "In Progress").length;

  return (
    <PageExport name="Work_Items" title="Work Items">
      <PageHeading
        title="Work Items"
        subtitle="WBS / tasks across projects and streams — owners, dates, and progress"
        actions={
          <button
            type="button"
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
              mineOnly
                ? "border-sky-300 bg-sky-50 text-sky-800"
                : "border-border bg-surface text-foreground"
            }`}
            onClick={() => setMineOnly((v) => !v)}
          >
            Assigned to me
          </button>
        }
      />

      <SectionFrame>
        <SectionTitle>Delivery load</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Total" value={items.length} />
          <KpiCard label="In progress" value={inProgress} />
          <KpiCard label="Blocked" value={blocked} />
          <KpiCard label="Done" value={done} />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>New work item</SectionTitle>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <select
            className="st-input"
            value={form.project_id}
            onChange={(e) =>
              setForm((f) => {
                const pid = e.target.value;
                const nextStreams = streamsByProject.get(pid) || [];
                const def = nextStreams.find((s) => s.is_default) || nextStreams[0];
                return { ...f, project_id: pid, stream_id: def?.id || "" };
              })
            }
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
            value={form.stream_id}
            onChange={(e) => setForm((f) => ({ ...f, stream_id: e.target.value }))}
            disabled={!form.project_id}
          >
            <option value="">— Stream (auto Core) —</option>
            {formStreams.map((s: any) => (
              <option key={s.id} value={s.id}>
                {formatStreamLabel(s)}
              </option>
            ))}
          </select>
          <input
            className="st-input"
            placeholder="WBS code"
            value={form.wbs_code}
            onChange={(e) => setForm((f) => ({ ...f, wbs_code: e.target.value }))}
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
            className="st-input md:col-span-2"
            placeholder="Task title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={form.assign_to_me}
              onChange={(e) => setForm((f) => ({ ...f, assign_to_me: e.target.checked }))}
            />
            Assign to me
          </label>
          <input
            className="st-input"
            type="date"
            value={form.planned_start}
            onChange={(e) => setForm((f) => ({ ...f, planned_start: e.target.value }))}
          />
          <input
            className="st-input"
            type="date"
            value={form.planned_end}
            onChange={(e) => setForm((f) => ({ ...f, planned_end: e.target.value }))}
          />
          <button
            type="button"
            className="st-btn-primary md:col-span-2"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Saving…" : "Create work item"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Stream defaults to the project&apos;s Core stream from Project Info. Requires migration{" "}
          <code>20260724190000_work_items_stream_id.sql</code> on Supabase.
        </p>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>{mineOnly ? "My work items" : "Work register"}</SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          dirty={table.isDirty}
          onClear={table.clearAll}
          placeholder="Search work register…"
        />
        {isLoading ? (
          <PageLoading label="Loading work items…" fullScreen={false} />
        ) : table.rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {table.total === 0 ? "No work items yet." : "No matching work items."}
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
                {table.rows.map((i) => {
                  const proj = projectById.get(i.project_id) as any;
                  const stream = i.stream_id ? streamById.get(i.stream_id) : null;
                  const itemStreams = streamsByProject.get(i.project_id) || [];
                  return (
                    <tr key={i.id}>
                      <td className="font-medium">{proj?.project_code || "—"}</td>
                      <td>
                        <select
                          className="st-input !py-0.5 !text-xs font-mono"
                          value={i.stream_id || ""}
                          onChange={(e) =>
                            patch.mutate({
                              id: i.id,
                              updates: { stream_id: e.target.value || null },
                            })
                          }
                        >
                          <option value="">—</option>
                          {itemStreams.map((s: any) => (
                            <option key={s.id} value={s.id}>
                              {formatStreamLabel(s)}
                            </option>
                          ))}
                        </select>
                        {stream && proj ? (
                          <div className="mt-0.5 text-[10px] text-muted-foreground font-mono">
                            {formatProjectStreamRef(proj, stream)}
                          </div>
                        ) : null}
                      </td>
                      <td className="text-xs font-mono">{i.wbs_code || "—"}</td>
                      <td className="min-w-[12rem]">{i.title}</td>
                      <td>
                        <select
                          className="st-input !py-0.5 !text-xs"
                          value={i.status || "To Do"}
                          onChange={(e) =>
                            patch.mutate({ id: i.id, updates: { status: e.target.value } })
                          }
                        >
                          {STATUSES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="st-input !w-16 !py-0.5 !text-xs"
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={Number(i.percent_complete || 0)}
                          onBlur={(e) =>
                            patch.mutate({
                              id: i.id,
                              updates: { percent_complete: Number(e.target.value) || 0 },
                            })
                          }
                        />
                      </td>
                      <td className="text-xs">{i.owner || "—"}</td>
                      <td className="text-xs whitespace-nowrap">{i.planned_end || "—"}</td>
                      <td>
                        <button
                          className="text-xs text-rose-600 hover:underline"
                          onClick={() => confirm("Delete work item?") && del.mutate(i.id)}
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
