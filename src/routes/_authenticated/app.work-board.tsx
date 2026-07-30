import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { PageLoading } from "@/components/page-loading";
import {
  fetchProjectOptions,
  projectOptionsQueryKey,
  compareProjectsByCodeName,
} from "@/lib/project-options";
import { WORK_ITEMS_SELECT } from "@/lib/query-selects";
import { EntityComments } from "@/components/entity-comments";

export const Route = createFileRoute("/_authenticated/app/work-board")({
  component: WorkBoardPage,
});

const COLUMNS = ["To Do", "In Progress", "Blocked", "Done"] as const;

function WorkBoardPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [sprintId, setSprintId] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);

  const { data: projects = [] } = useQuery({
    queryKey: projectOptionsQueryKey(orgId),
    queryFn: fetchProjectOptions,
    enabled: !!orgId,
  });
  const projectsOrdered = useMemo(() => [...projects].sort(compareProjectsByCodeName), [projects]);

  const { data: sprints = [] } = useQuery({
    queryKey: ["sprints", orgId, "board"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sprints")
        .select("id,project_id,sprint_number,name,status")
        .order("sprint_number");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["work_items", orgId, "board", projectId, sprintId],
    queryFn: async () => {
      let q = supabase
        .from("work_items" as any)
        .select(WORK_ITEMS_SELECT as "*")
        .eq("org_id", orgId!);
      if (projectId) q = q.eq("project_id", projectId);
      const { data, error } = await q.order("sort_order");
      if (error) throw error;
      let rows = (data ?? []) as any[];
      if (sprintId === "__backlog__") rows = rows.filter((r) => !r.sprint_id);
      else if (sprintId) rows = rows.filter((r) => r.sprint_id === sprintId);
      return rows.filter((r) => String(r.status || "") !== "Cancelled");
    },
    enabled: !!orgId,
  });

  const projectById = useMemo(
    () => new Map(projects.map((p: any) => [p.id, p])),
    [projects],
  );

  const projectSprints = useMemo(
    () =>
      sprints.filter((s: any) => !projectId || s.project_id === projectId),
    [sprints, projectId],
  );

  const byStatus = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const c of COLUMNS) m[c] = [];
    for (const i of items) {
      const st = COLUMNS.includes(i.status) ? i.status : "To Do";
      m[st].push(i);
    }
    return m;
  }, [items]);

  const patch = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("work_items" as any)
        .update({
          status,
          percent_complete: status === "Done" ? 100 : undefined,
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work_items", orgId] });
      toast.success("Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onDrop = (status: string) => {
    if (!dragging) return;
    patch.mutate({ id: dragging, status });
    setDragging(null);
  };

  return (
    <PageExport name="Work_Board" title="Work Item Kanban">
      <PageHeading
        title="Work board"
        subtitle="Kanban by status — drag cards between columns. Filter by project and sprint / backlog."
      />

      <SectionFrame>
        <SectionTitle>Filters</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <select
            className="st-input max-w-xs"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setSprintId("");
            }}
          >
            <option value="">All projects</option>
            {projectsOrdered.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.project_code} · {p.name}
              </option>
            ))}
          </select>
          <select
            className="st-input max-w-xs"
            value={sprintId}
            onChange={(e) => setSprintId(e.target.value)}
          >
            <option value="">All sprints + backlog</option>
            <option value="__backlog__">Backlog (no sprint)</option>
            {projectSprints.map((s: any) => (
              <option key={s.id} value={s.id}>
                #{s.sprint_number}
                {s.name ? ` · ${s.name}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {COLUMNS.map((c) => (
            <KpiCard key={c} label={c} value={byStatus[c]?.length || 0} />
          ))}
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Board</SectionTitle>
        {isLoading ? (
          <PageLoading label="Loading board…" fullScreen={false} />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => (
              <div
                key={col}
                className="min-h-[20rem] rounded-xl border border-border bg-muted/20 p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(col)}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold uppercase tracking-wide">{col}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {byStatus[col]?.length || 0}
                  </span>
                </div>
                <div className="space-y-2">
                  {(byStatus[col] || []).map((i: any) => {
                    const proj = projectById.get(i.project_id) as any;
                    return (
                      <div
                        key={i.id}
                        draggable
                        onDragStart={() => setDragging(i.id)}
                        onDragEnd={() => setDragging(null)}
                        className={`cursor-grab rounded-lg border border-border bg-surface p-2.5 shadow-sm active:cursor-grabbing ${
                          dragging === i.id ? "opacity-60 ring-2 ring-sky-300" : ""
                        }`}
                      >
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {proj?.project_code || "—"}
                          {i.wbs_code ? ` · ${i.wbs_code}` : ""}
                        </div>
                        <div className="mt-0.5 text-sm font-medium leading-snug">{i.title}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                          {i.priority ? (
                            <span className="rounded bg-muted px-1.5 py-0.5">{i.priority}</span>
                          ) : null}
                          {i.percent_complete != null ? (
                            <span className="rounded bg-muted px-1.5 py-0.5">
                              {Number(i.percent_complete) || 0}%
                            </span>
                          ) : null}
                          {i.owner ? (
                            <span className="rounded bg-muted px-1.5 py-0.5">{i.owner}</span>
                          ) : null}
                        </div>
                        <select
                          className="st-input mt-2 !h-7 !py-0 !text-[11px] w-full"
                          value={COLUMNS.includes(i.status) ? i.status : "To Do"}
                          onChange={(e) => patch.mutate({ id: i.id, status: e.target.value })}
                        >
                          {COLUMNS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionFrame>

      {projectId ? (
        <SectionFrame>
          <SectionTitle>Board discussion</SectionTitle>
          <EntityComments entityType="work_board" entityId={projectId} />
        </SectionFrame>
      ) : null}
    </PageExport>
  );
}
