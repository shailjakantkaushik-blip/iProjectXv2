import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { PageLoading } from "@/components/page-loading";
import { fetchProjectOptions, projectOptionsQueryKey, compareProjectsByCodeName } from "@/lib/project-options";
import { WORK_ITEMS_SELECT } from "@/lib/query-selects";
import { computeCriticalPath, type CpmLink } from "@/lib/cpm";
import { EntityComments } from "@/components/entity-comments";

export const Route = createFileRoute("/_authenticated/app/schedule-cpm")({
  component: ScheduleCpmPage,
});

const LINK_TYPES = ["FS", "SS", "FF", "SF"] as const;

function ScheduleCpmPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [form, setForm] = useState({
    predecessor_id: "",
    successor_id: "",
    link_type: "FS" as string,
    lag_days: "0",
  });

  const { data: projects = [] } = useQuery({
    queryKey: projectOptionsQueryKey(orgId),
    queryFn: fetchProjectOptions,
    enabled: !!orgId,
  });
  const projectsOrdered = useMemo(() => [...projects].sort(compareProjectsByCodeName), [projects]);

  const { data: workItems = [], isLoading: wiLoading } = useQuery({
    queryKey: ["work_items", orgId, "cpm", projectId],
    queryFn: async () => {
      let q = supabase
        .from("work_items" as any)
        .select(`${WORK_ITEMS_SELECT},actual_start` as "*")
        .eq("org_id", orgId!);
      if (projectId) q = q.eq("project_id", projectId);
      const { data, error } = await q.order("sort_order");
      if (error) {
        const fallback = await supabase
          .from("work_items" as any)
          .select("*")
          .eq("org_id", orgId!);
        if (fallback.error) throw fallback.error;
        let rows = (fallback.data ?? []) as any[];
        if (projectId) rows = rows.filter((r) => r.project_id === projectId);
        return rows;
      }
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });

  const linksQ = useQuery({
    queryKey: ["work_item_links", orgId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_item_links" as any)
        .select("id,predecessor_id,successor_id,link_type,lag_days")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as unknown as (CpmLink & { id: string })[];
    },
    enabled: !!orgId,
  });

  const wiIds = useMemo(() => new Set(workItems.map((w: any) => w.id)), [workItems]);
  const scopedLinks = useMemo(
    () => (linksQ.data ?? []).filter((l) => wiIds.has(l.predecessor_id) && wiIds.has(l.successor_id)),
    [linksQ.data, wiIds],
  );

  const cpm = useMemo(
    () =>
      computeCriticalPath(
        workItems.map((w: any) => ({
          id: w.id,
          title: w.title || "Task",
          project_id: w.project_id,
          planned_start: w.planned_start,
          planned_end: w.planned_end,
          estimate_hours: w.estimate_hours,
          status: w.status,
          wbs_code: w.wbs_code,
        })),
        scopedLinks,
      ),
    [workItems, scopedLinks],
  );

  const projectById = useMemo(
    () => new Map(projects.map((p: any) => [p.id, p])),
    [projects],
  );

  const addLink = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No org");
      if (!form.predecessor_id || !form.successor_id) throw new Error("Pick predecessor and successor");
      if (form.predecessor_id === form.successor_id) throw new Error("Cannot link a task to itself");
      const { error } = await supabase.from("work_item_links" as any).insert({
        org_id: orgId,
        predecessor_id: form.predecessor_id,
        successor_id: form.successor_id,
        link_type: form.link_type,
        lag_days: Number(form.lag_days) || 0,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work_item_links", orgId] });
      toast.success("Link added");
      setForm((f) => ({ ...f, predecessor_id: "", successor_id: "", lag_days: "0" }));
    },
    onError: (e: Error) => {
      if (/work_item_links|schema cache|does not exist/i.test(e.message)) {
        toast.error("Run ppm_platform_depth.sql in Supabase, then Reload schema");
      } else toast.error(e.message);
    },
  });

  const delLink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("work_item_links" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work_item_links", orgId] });
      toast.success("Link removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const maxEnd = Math.max(1, cpm.projectEnd);
  const formItems = workItems;

  return (
    <PageExport name="Schedule_CPM" title="Schedule CPM">
      <PageHeading
        title="Schedule — Critical Path"
        subtitle="CPM forward/backward pass on work items with FS / SS / FF / SF links and lag"
      />

      <SectionFrame>
        <SectionTitle>Scope</SectionTitle>
        <select
          className="st-input max-w-md"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">All projects</option>
          {projectsOrdered.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.project_code} · {p.name}
            </option>
          ))}
        </select>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Network KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Work items" value={workItems.length} />
          <KpiCard label="Links" value={scopedLinks.length} />
          <KpiCard label="Network days" value={cpm.projectEnd} />
          <KpiCard label="Critical tasks" value={cpm.criticalIds.length} />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Add dependency link</SectionTitle>
        {linksQ.isError ? (
          <p className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Apply <code>ppm_platform_depth.sql</code> then Reload schema to enable work-item links.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <select
            className="st-input"
            value={form.predecessor_id}
            onChange={(e) => setForm((f) => ({ ...f, predecessor_id: e.target.value }))}
          >
            <option value="">— Predecessor —</option>
            {formItems.map((w: any) => (
              <option key={w.id} value={w.id}>
                {(projectById.get(w.project_id) as any)?.project_code || "?"} · {w.wbs_code ? `${w.wbs_code} · ` : ""}
                {w.title}
              </option>
            ))}
          </select>
          <select
            className="st-input"
            value={form.link_type}
            onChange={(e) => setForm((f) => ({ ...f, link_type: e.target.value }))}
          >
            {LINK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className="st-input"
            value={form.successor_id}
            onChange={(e) => setForm((f) => ({ ...f, successor_id: e.target.value }))}
          >
            <option value="">— Successor —</option>
            {formItems.map((w: any) => (
              <option key={w.id} value={w.id}>
                {(projectById.get(w.project_id) as any)?.project_code || "?"} · {w.wbs_code ? `${w.wbs_code} · ` : ""}
                {w.title}
              </option>
            ))}
          </select>
          <input
            className="st-input"
            type="number"
            placeholder="Lag days"
            value={form.lag_days}
            onChange={(e) => setForm((f) => ({ ...f, lag_days: e.target.value }))}
          />
          <button
            type="button"
            className="st-btn-primary"
            disabled={addLink.isPending}
            onClick={() => addLink.mutate()}
          >
            Add link
          </button>
        </div>
        {scopedLinks.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs">
            {scopedLinks.map((l) => {
              const pred = workItems.find((w: any) => w.id === l.predecessor_id);
              const succ = workItems.find((w: any) => w.id === l.successor_id);
              return (
                <li key={(l as any).id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {pred?.title || "?"} —{l.link_type || "FS"}
                    {(l.lag_days || 0) !== 0 ? `(${l.lag_days}d)` : ""}→ {succ?.title || "?"}
                  </span>
                  <button
                    type="button"
                    className="text-rose-600 hover:underline"
                    onClick={() => delLink.mutate((l as any).id)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Critical path chart</SectionTitle>
        {wiLoading ? (
          <PageLoading label="Loading…" fullScreen={false} />
        ) : cpm.nodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No work items in scope.</p>
        ) : (
          <div className="space-y-1.5">
            {cpm.nodes.map((n) => {
              const left = (n.es / maxEnd) * 100;
              const width = Math.max(1.5, ((n.ef - n.es) / maxEnd) * 100);
              return (
                <div key={n.id} className="grid grid-cols-[minmax(10rem,14rem)_1fr_auto] items-center gap-2 text-xs">
                  <div className="truncate" title={n.title}>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {(projectById.get(n.project_id) as any)?.project_code || ""}
                    </span>{" "}
                    {n.title}
                  </div>
                  <div className="relative h-7 rounded bg-muted/40">
                    <div
                      className={`absolute top-1 h-5 rounded ${
                        n.critical ? "bg-rose-500" : "bg-sky-500/80"
                      }`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`ES ${n.es} → EF ${n.ef} · float ${n.float}d`}
                    />
                  </div>
                  <div className="w-24 text-right tabular-nums text-muted-foreground">
                    {n.critical ? (
                      <span className="font-semibold text-rose-700">Critical</span>
                    ) : (
                      `float ${n.float}d`
                    )}
                  </div>
                </div>
              );
            })}
            <p className="pt-2 text-[11px] text-muted-foreground">
              Red bars = critical path (total float ≈ 0). Day 0 is the network start from link
              logic (not calendar dates). Duration uses planned dates when set, else estimate÷8h.
            </p>
          </div>
        )}
      </SectionFrame>

      {projectId ? (
        <SectionFrame>
          <SectionTitle>Discussion</SectionTitle>
          <EntityComments entityType="schedule_cpm" entityId={projectId} />
        </SectionFrame>
      ) : null}
    </PageExport>
  );
}
