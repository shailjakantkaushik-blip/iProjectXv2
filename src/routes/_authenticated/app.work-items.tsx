import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjectOptions, projectOptionsQueryKey, compareProjectsByCodeName, projectUsesStageGates, projectUsesSprints } from "@/lib/project-options";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { PageLoading } from "@/components/page-loading";
import { fetchOrgStreams, formatProjectStreamRef, formatStreamLabel } from "@/lib/project-streams";
import { fetchStageGates } from "@/lib/stage-gates";
import { sortGatesByOrgOrder } from "@/lib/project-phase";
import { WORK_ITEMS_SELECT, RESOURCE_ALLOCATIONS_SELECT } from "@/lib/query-selects";
import {
  sumLaneAllocatedHours,
  type AllocationPlanRow,
} from "@/lib/resource-allocation-analytics";
import {
  buildWorkItemDemandSlices,
  sumLaneDemandHours,
  sumLanePlannedFteCost,
} from "@/lib/work-item-fte-plan";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";
import { ColumnGlossary } from "@/components/column-glossary";
import { ResourceMultiSelect } from "@/components/resource-multi-select";

export const Route = createFileRoute("/_authenticated/app/work-items")({
  component: WorkItemsPage,
});

const STATUSES = ["To Do", "In Progress", "Blocked", "Done", "Cancelled"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

type SprintRow = {
  id: string;
  project_id: string;
  sprint_number: number | null;
  name: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
};

const formatSprintLabel = (s: Pick<SprintRow, "sprint_number" | "name">) => {
  const num = s.sprint_number != null ? `#${s.sprint_number}` : "Sprint";
  const name = String(s.name || "").trim();
  return name ? `${num} · ${name}` : num;
};

const numH = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const money = (n: number) =>
  "$" +
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

type ResourceRow = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  user_id: string | null;
  status: string | null;
  cost_rate?: number | null;
};

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

  const { data: stageGates = [], error: gatesError, isError: gatesIsError } = useQuery({
    queryKey: ["stage_gates", orgId],
    queryFn: fetchStageGates,
    enabled: !!orgId,
  });

  const { data: sprints = [], error: sprintsError, isError: sprintsIsError } = useQuery({
    queryKey: ["sprints", orgId, "work-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sprints")
        .select("id,project_id,sprint_number,name,status,start_date,end_date")
        .eq("org_id", orgId!)
        .order("sprint_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SprintRow[];
    },
    enabled: !!orgId,
  });

  const { data: gateDefs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gate_definitions")
        .select("gate_name,sort_order")
        .eq("org_id", orgId!)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const orgPhases = useMemo(
    () => (gateDefs as { gate_name?: string }[]).map((d) => d.gate_name).filter(Boolean) as string[],
    [gateDefs],
  );

  const gatesForWorkItem = useCallback(
    (projectId: string | null | undefined, streamId: string | null | undefined) => {
      if (!projectId) return [] as typeof stageGates;
      const forProject = stageGates.filter((g) => g.project_id === projectId);
      const scoped = (() => {
        if (!streamId) return forProject;
        const forStream = forProject.filter((g) => !g.stream_id || g.stream_id === streamId);
        return forStream.length ? forStream : forProject;
      })();
      return sortGatesByOrgOrder(scoped, orgPhases) as typeof stageGates;
    },
    [stageGates, orgPhases],
  );

  const sprintsForWorkItem = useCallback(
    (projectId: string | null | undefined) => {
      if (!projectId) return [] as SprintRow[];
      return sprints
        .filter((s) => s.project_id === projectId)
        .slice()
        .sort((a, b) => (a.sprint_number ?? 0) - (b.sprint_number ?? 0));
    },
    [sprints],
  );

  const projectsOrdered = useMemo(() => [...projects].sort(compareProjectsByCodeName), [projects]);

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", orgId, "work-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select("id,name,email,role,user_id,status,cost_rate")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ResourceRow[];
    },
    enabled: !!orgId,
  });

  const myResource = useMemo(
    () => resources.find((r) => r.user_id === userId) || null,
    [resources, userId],
  );

  const activeResources = useMemo(
    () => resources.filter((r) => !r.status || /active/i.test(r.status)),
    [resources],
  );

  // Distinct key from Data Editor (`["work_items", orgId]`) so column shapes don't collide.
  const itemsQ = useQuery({
    queryKey: ["work_items", orgId, "register"],
    queryFn: async () => {
      if (!orgId) return [];
      const primary = await supabase
        .from("work_items" as any)
        .select(WORK_ITEMS_SELECT as "*")
        .eq("org_id", orgId)
        .order("sort_order")
        .order("planned_end");
      if (!primary.error) return (primary.data ?? []) as any[];

      // Fallback: broader select if schema cache lags behind WORK_ITEMS_SELECT
      const fallback = await supabase
        .from("work_items" as any)
        .select("*")
        .eq("org_id", orgId)
        .order("sort_order");
      if (fallback.error) throw fallback.error;
      return (fallback.data ?? []) as any[];
    },
    enabled: !!orgId,
  });
  const items = itemsQ.data ?? [];
  const isLoading = itemsQ.isLoading && !itemsQ.data;

  const assigneesQ = useQuery({
    queryKey: ["work_item_assignees", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_item_assignees" as any)
        .select("id,work_item_id,resource_id,user_id");
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        work_item_id: string;
        resource_id: string;
        user_id: string | null;
      }[];
    },
    enabled: !!orgId,
  });
  const assignees = assigneesQ.data ?? [];

  const { data: allocations = [] } = useQuery({
    queryKey: ["resource_allocations", orgId, "work-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_allocations")
        .select(RESOURCE_ALLOCATIONS_SELECT as "*");
      if (error) throw error;
      return (data ?? []) as unknown as AllocationPlanRow[];
    },
    enabled: !!orgId,
  });

  const assigneesByWorkItem = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of assignees) {
      if (!a.resource_id) continue;
      const list = m.get(a.work_item_id) || [];
      list.push(a.resource_id);
      m.set(a.work_item_id, list);
    }
    return m;
  }, [assignees]);

  const resourceById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);

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

  const gateById = useMemo(() => new Map(stageGates.map((g) => [g.id, g])), [stageGates]);
  const sprintById = useMemo(() => new Map(sprints.map((s) => [s.id, s])), [sprints]);

  const [form, setForm] = useState({
    project_id: "",
    stream_id: "",
    stage_gate_id: "",
    sprint_id: "",
    title: "",
    status: "To Do",
    priority: "Medium",
    owner: profile?.full_name || "",
    assign_to_me: true,
    assignee_ids: [] as string[],
    planned_start: "",
    planned_end: "",
    percent_complete: "0",
    wbs_code: "",
    estimate_hours: "",
  });

  const formStreams = streamsByProject.get(form.project_id) || [];
  const formProject = form.project_id ? (projectById.get(form.project_id) as any) : null;
  const formShowGates = projectUsesStageGates(formProject?.delivery_method);
  const formShowSprints = projectUsesSprints(formProject?.delivery_method);

  const formGates = useMemo(
    () => gatesForWorkItem(form.project_id, form.stream_id || null),
    [gatesForWorkItem, form.project_id, form.stream_id],
  );

  const formSprints = useMemo(
    () => sprintsForWorkItem(form.project_id),
    [sprintsForWorkItem, form.project_id],
  );

  const demandSlices = useMemo(
    () =>
      buildWorkItemDemandSlices({
        workItems: items,
        assignees,
        resources,
      }),
    [items, assignees, resources],
  );

  /** Lane totals for create form — resource allocation vs work-item planned + FTE $. */
  const formLanePlan = useMemo(() => {
    if (!form.project_id || !form.stream_id) return null;
    const streamId = form.stream_id;
    const laneOpts = {
      projectId: form.project_id,
      streamId,
      stageGateId: form.stage_gate_id || null,
    };
    const allocated = sumLaneAllocatedHours(allocations, laneOpts);
    const workPlanned = sumLaneDemandHours(demandSlices, laneOpts);
    const plannedFteCost = sumLanePlannedFteCost(demandSlices, laneOpts);
    return {
      allocated,
      workPlanned,
      pending: allocated - workPlanned,
      plannedFteCost,
    };
  }, [
    form.project_id,
    form.stream_id,
    form.stage_gate_id,
    allocations,
    demandSlices,
  ]);

  const visibleBase = useMemo(() => {
    if (!mineOnly) return items;
    if (!myResource?.id && !userId) return [];
    return items.filter((i) => {
      const team = assigneesByWorkItem.get(i.id) || [];
      if (myResource?.id && team.includes(myResource.id)) return true;
      // Legacy: owner_user_id still set
      if (userId && i.owner_user_id === userId) return true;
      return false;
    });
  }, [items, mineOnly, userId, myResource, assigneesByWorkItem]);

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
      {
        key: "stage_gate",
        label: "Stage gate",
        getValue: (i) => (i.stage_gate_id ? gateById.get(i.stage_gate_id)?.gate_name || "" : ""),
      },
      {
        key: "sprint",
        label: "Sprint",
        getValue: (i) => {
          const s = i.sprint_id ? sprintById.get(i.sprint_id) : null;
          return s ? formatSprintLabel(s) : "";
        },
      },
      {
        key: "lane_allocated",
        label: "Lane allocated",
        getValue: (i) =>
          String(
            sumLaneAllocatedHours(allocations, {
              projectId: i.project_id,
              streamId: i.stream_id,
              stageGateId: i.stage_gate_id,
            }),
          ),
      },
      {
        key: "estimate_hours",
        label: "Planned h",
        getValue: (i) => String(numH(i.estimate_hours) || ""),
      },
      {
        key: "actual_hours",
        label: "Actual h",
        getValue: (i) => String(numH(i.actual_hours) || ""),
      },
      {
        key: "pending_hours",
        label: "Pending h",
        getValue: (i) => String(Math.max(0, numH(i.estimate_hours) - numH(i.actual_hours))),
      },
      { key: "status", label: "Status" },
      { key: "percent_complete", label: "%" },
      { key: "owner", label: "Owner" },
      {
        key: "team",
        label: "Resources",
        getValue: (i) =>
          (assigneesByWorkItem.get(i.id) || [])
            .map((rid) => resourceById.get(rid)?.name || "Unknown")
            .join(", "),
      },
      { key: "planned_end", label: "End" },
    ],
    [projectById, streamById, assigneesByWorkItem, resourceById, gateById, sprintById, allocations],
  );

  const numericColKeys = useMemo(
    () => new Set(["lane_allocated", "estimate_hours", "actual_hours", "pending_hours", "percent_complete"]),
    [],
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
      const team = new Set(form.assignee_ids);
      if (form.assign_to_me) {
        if (!myResource?.id) {
          throw new Error(
            "Your login is not linked to a resource. Ask an admin to set this under Timesheets → Resource setup.",
          );
        }
        team.add(myResource.id);
      }
      const primaryResourceId = [...team][0] || null;
      const primary = primaryResourceId ? resourceById.get(primaryResourceId) : null;
      const ownerUserId = primary?.user_id || (form.assign_to_me ? userId : null) || null;

      const { data, error } = await supabase
        .from("work_items" as any)
        .insert({
          org_id: orgId,
          project_id: form.project_id,
          stream_id: streamId,
          title: form.title,
          status: form.status,
          priority: form.priority,
          owner: primary?.name || form.owner || null,
          owner_user_id: ownerUserId,
          planned_start: form.planned_start || null,
          planned_end: form.planned_end || null,
          percent_complete: Number(form.percent_complete) || 0,
          wbs_code: form.wbs_code || null,
          stage_gate_id: form.stage_gate_id || null,
          sprint_id: form.sprint_id || null,
          estimate_hours: form.estimate_hours === "" ? null : Number(form.estimate_hours) || 0,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      const wiId = (data as any).id as string;
      if (team.size) {
        const rows = [...team].map((rid) => ({
          org_id: orgId,
          work_item_id: wiId,
          resource_id: rid,
          user_id: resourceById.get(rid)?.user_id || null,
        }));
        const { error: aErr } = await supabase
          .from("work_item_assignees" as any)
          .insert(rows as never);
        if (aErr) throw aErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work_items", orgId] });
      qc.invalidateQueries({ queryKey: ["work_item_assignees", orgId] });
      toast.success("Work item created");
      setForm((f) => ({
        ...f,
        title: "",
        wbs_code: "",
        planned_start: "",
        planned_end: "",
        assignee_ids: [],
        stage_gate_id: "",
        sprint_id: "",
        estimate_hours: "",
      }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setAssignees = useMutation({
    mutationFn: async ({
      workItemId,
      resourceIds,
    }: {
      workItemId: string;
      resourceIds: string[];
    }) => {
      if (!orgId) throw new Error("No org");
      const { error: delErr } = await supabase
        .from("work_item_assignees" as any)
        .delete()
        .eq("work_item_id", workItemId);
      if (delErr) throw delErr;
      if (resourceIds.length) {
        const { error } = await supabase.from("work_item_assignees" as any).insert(
          resourceIds.map((rid) => ({
            org_id: orgId,
            work_item_id: workItemId,
            resource_id: rid,
            user_id: resourceById.get(rid)?.user_id || null,
          })) as never,
        );
        if (error) throw error;
      }
      const primary = resourceIds[0] ? resourceById.get(resourceIds[0]) : null;
      const { error: oErr } = await supabase
        .from("work_items" as any)
        .update({
          owner_user_id: primary?.user_id || null,
          owner: primary?.name || null,
        } as never)
        .eq("id", workItemId);
      if (oErr) throw oErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work_items", orgId] });
      qc.invalidateQueries({ queryKey: ["work_item_assignees", orgId] });
      toast.success("Resources updated");
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
        subtitle="WBS / tasks across projects — stage gates for Waterfall phases, sprints for Agile iterations"
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
                return {
                  ...f,
                  project_id: pid,
                  stream_id: def?.id || "",
                  stage_gate_id: "",
                  sprint_id: "",
                };
              })
            }
          >
            <option value="">— Project —</option>
            {projectsOrdered.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.project_code} · {p.name}
              </option>
            ))}
          </select>
          <select
            className="st-input"
            value={form.stream_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, stream_id: e.target.value, stage_gate_id: "" }))
            }
            disabled={!form.project_id}
          >
            <option value="">— Stream (auto Core) —</option>
            {formStreams.map((s: any) => (
              <option key={s.id} value={s.id}>
                {formatStreamLabel(s)}
              </option>
            ))}
          </select>
          {formShowGates || !form.project_id ? (
            <select
              className="st-input"
              value={form.stage_gate_id}
              onChange={(e) => setForm((f) => ({ ...f, stage_gate_id: e.target.value }))}
              disabled={!form.project_id}
            >
              <option value="">— Stage gate / phase —</option>
              {formGates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.gate_name || "Gate"}
                </option>
              ))}
            </select>
          ) : null}
          {formShowSprints || !form.project_id ? (
            <select
              className="st-input"
              value={form.sprint_id}
              onChange={(e) => setForm((f) => ({ ...f, sprint_id: e.target.value }))}
              disabled={!form.project_id}
            >
              <option value="">— Sprint —</option>
              {formSprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatSprintLabel(s)}
                  {s.status ? ` (${s.status})` : ""}
                </option>
              ))}
            </select>
          ) : null}
          <input
            className="st-input"
            placeholder="WBS code"
            value={form.wbs_code}
            onChange={(e) => setForm((f) => ({ ...f, wbs_code: e.target.value }))}
          />
          <input
            className="st-input"
            type="number"
            min={0}
            step={0.5}
            placeholder="Planned hours"
            value={form.estimate_hours}
            onChange={(e) => setForm((f) => ({ ...f, estimate_hours: e.target.value }))}
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
          <div className="md:col-span-2">
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">Assigned resources</div>
            <ResourceMultiSelect
              resources={activeResources}
              value={form.assignee_ids}
              onChange={(ids) => setForm((f) => ({ ...f, assignee_ids: ids }))}
              placeholder="Search and select resources…"
            />
          </div>
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
        {formLanePlan ? (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground">Lane allocated (resource plan)</div>
              <div className="font-semibold tabular-nums">{formLanePlan.allocated.toFixed(1)} h</div>
            </div>
            <div>
              <div className="text-muted-foreground">Work items planned</div>
              <div className="font-semibold tabular-nums">{formLanePlan.workPlanned.toFixed(1)} h</div>
            </div>
            <div>
              <div className="text-muted-foreground">Pending to assign</div>
              <div
                className={`font-semibold tabular-nums ${
                  formLanePlan.pending < 0 ? "text-amber-700" : ""
                }`}
              >
                {formLanePlan.pending.toFixed(1)} h
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Planned FTE $ (lane)</div>
              <div className="font-semibold tabular-nums">{money(formLanePlan.plannedFteCost)}</div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Select project and stream (and optionally stage gate) to see lane allocated hours from
            Resource Allocations vs work-item planned demand — use allocated as the ceiling when
            setting planned hours.
          </p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Reverse planning flow: set work-item planned hours as demand against the lane&apos;s
          resource allocation (pending = allocated − work planned). Planned FTE $ is hours ×
          assignee cost rates. Actual hours come from approved timesheets. Assign resources so
          timesheet placeholders appear for their linked logins; stream defaults to Core. Use{" "}
          <span className="font-medium text-foreground">Stage gate</span> for Waterfall/Hybrid
          phase attribution, and <span className="font-medium text-foreground">Sprint</span> for
          Agile/Hybrid iteration capture (create sprints under Agile / Sprints first).
        </p>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>{mineOnly ? "My work items" : "Work register"}</SectionTitle>
        {itemsQ.isError ? (
          <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Failed to load work items: {(itemsQ.error as Error)?.message || "Unknown error"}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => void itemsQ.refetch()}
            >
              Retry
            </button>
          </div>
        ) : null}
        {gatesIsError ? (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            Stage gates failed to load: {(gatesError as Error)?.message || "Unknown error"}. Dropdowns
            will be empty until this succeeds (often fixed by Reload schema in Supabase).
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => void qc.invalidateQueries({ queryKey: ["stage_gates", orgId] })}
            >
              Retry
            </button>
          </div>
        ) : null}
        {sprintsIsError ? (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            Sprints failed to load: {(sprintsError as Error)?.message || "Unknown error"}. Sprint
            dropdowns will be empty until this succeeds.
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => void qc.invalidateQueries({ queryKey: ["sprints", orgId] })}
            >
              Retry
            </button>
          </div>
        ) : null}
        {!gatesIsError && stageGates.length === 0 ? (
          <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            No stage gates found for this organisation. Re-run the wipe-and-seed SQL (or create gates on
            each stream) so Work Items and timelines can show phases.
          </div>
        ) : null}
        {!sprintsIsError && sprints.length === 0 ? (
          <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            No sprints found. Create sprints under Agile / Sprints for Agile or Hybrid projects, then
            link work items here.
          </div>
        ) : null}
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
          <div className="st-table-wrap overflow-x-auto">
            <table className="st-table !w-max min-w-full text-xs">
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
                      align={numericColKeys.has(col.key) ? "right" : "left"}
                      className={
                        numericColKeys.has(col.key)
                          ? "st-num whitespace-nowrap"
                          : col.key === "title" || col.key === "team"
                            ? "min-w-[10rem]"
                            : "whitespace-nowrap"
                      }
                    />
                  ))}
                  <th className="align-top whitespace-nowrap w-16">
                    <span className="font-semibold">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((i) => {
                  const proj = projectById.get(i.project_id) as any;
                  const stream = i.stream_id ? streamById.get(i.stream_id) : null;
                  const itemStreams = streamsByProject.get(i.project_id) || [];
                  return (
                    <tr key={i.id}>
                      {columns.map((col) => {
                        switch (col.key) {
                          case "project":
                            return (
                              <td key={col.key} className="font-medium font-mono whitespace-nowrap">
                                {proj?.project_code || "—"}
                              </td>
                            );
                          case "stream":
                            return (
                              <td key={col.key} className="min-w-[7.5rem]">
                                <select
                                  className="st-input !min-w-[6.5rem] !max-w-[9rem] !py-0.5 !text-xs font-mono"
                                  value={i.stream_id || ""}
                                  onChange={(e) => {
                                    const stream_id = e.target.value || null;
                                    const updates: Record<string, unknown> = { stream_id };
                                    const gate = i.stage_gate_id ? gateById.get(i.stage_gate_id) : null;
                                    if (
                                      !stream_id ||
                                      (gate?.stream_id && gate.stream_id !== stream_id)
                                    ) {
                                      updates.stage_gate_id = null;
                                    }
                                    patch.mutate({ id: i.id, updates });
                                  }}
                                >
                                  <option value="">—</option>
                                  {itemStreams.map((s: any) => (
                                    <option key={s.id} value={s.id}>
                                      {formatStreamLabel(s)}
                                    </option>
                                  ))}
                                </select>
                                {stream && proj ? (
                                  <div className="mt-0.5 max-w-[9rem] truncate text-[10px] text-muted-foreground font-mono">
                                    {formatProjectStreamRef(proj, stream)}
                                  </div>
                                ) : null}
                              </td>
                            );
                          case "wbs_code":
                            return (
                              <td key={col.key} className="font-mono whitespace-nowrap">
                                {i.wbs_code || "—"}
                              </td>
                            );
                          case "title":
                            return (
                              <td key={col.key} className="min-w-[11rem] max-w-[16rem]">
                                <span className="line-clamp-2" title={i.title || ""}>
                                  {i.title || "—"}
                                </span>
                              </td>
                            );
                          case "stage_gate":
                            return (
                              <td key={col.key} className="min-w-[8rem]">
                                <select
                                  className="st-input !min-w-[7rem] !max-w-[11rem] !py-0.5 !text-xs"
                                  value={i.stage_gate_id || ""}
                                  onChange={(e) =>
                                    patch.mutate({
                                      id: i.id,
                                      updates: { stage_gate_id: e.target.value || null },
                                    })
                                  }
                                >
                                  <option value="">— None —</option>
                                  {gatesForWorkItem(i.project_id, i.stream_id).map((g) => (
                                    <option key={g.id} value={g.id}>
                                      {g.gate_name || "Gate"}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          case "sprint":
                            return (
                              <td key={col.key} className="min-w-[8rem]">
                                <select
                                  className="st-input !min-w-[7rem] !max-w-[11rem] !py-0.5 !text-xs"
                                  value={i.sprint_id || ""}
                                  onChange={(e) =>
                                    patch.mutate({
                                      id: i.id,
                                      updates: { sprint_id: e.target.value || null },
                                    })
                                  }
                                >
                                  <option value="">— None —</option>
                                  {sprintsForWorkItem(i.project_id).map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {formatSprintLabel(s)}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          case "lane_allocated":
                            return (
                              <td
                                key={col.key}
                                className="st-num text-right tabular-nums whitespace-nowrap text-muted-foreground"
                              >
                                {sumLaneAllocatedHours(allocations, {
                                  projectId: i.project_id,
                                  streamId: i.stream_id,
                                  stageGateId: i.stage_gate_id,
                                }).toFixed(1)}
                              </td>
                            );
                          case "estimate_hours":
                            return (
                              <td key={col.key} className="st-num text-right whitespace-nowrap">
                                <input
                                  className="st-input !w-[4.5rem] !py-0.5 !text-xs text-right"
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  defaultValue={numH(i.estimate_hours) || ""}
                                  key={`est-${i.id}-${i.estimate_hours}`}
                                  onBlur={(e) =>
                                    patch.mutate({
                                      id: i.id,
                                      updates: {
                                        estimate_hours:
                                          e.target.value === "" ? null : Number(e.target.value) || 0,
                                      },
                                    })
                                  }
                                />
                              </td>
                            );
                          case "actual_hours":
                            return (
                              <td key={col.key} className="st-num text-right tabular-nums whitespace-nowrap">
                                {numH(i.actual_hours).toFixed(1)}
                              </td>
                            );
                          case "pending_hours":
                            return (
                              <td
                                key={col.key}
                                className="st-num text-right tabular-nums font-medium whitespace-nowrap"
                              >
                                {Math.max(0, numH(i.estimate_hours) - numH(i.actual_hours)).toFixed(1)}
                              </td>
                            );
                          case "status":
                            return (
                              <td key={col.key} className="whitespace-nowrap">
                                <select
                                  className="st-input !min-w-[6.5rem] !py-0.5 !text-xs"
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
                            );
                          case "percent_complete":
                            return (
                              <td key={col.key} className="st-num text-right whitespace-nowrap">
                                <input
                                  className="st-input !w-14 !py-0.5 !text-xs text-right"
                                  type="number"
                                  min={0}
                                  max={100}
                                  key={`pct-${i.id}-${i.percent_complete}`}
                                  defaultValue={Number(i.percent_complete || 0)}
                                  onBlur={(e) =>
                                    patch.mutate({
                                      id: i.id,
                                      updates: { percent_complete: Number(e.target.value) || 0 },
                                    })
                                  }
                                />
                              </td>
                            );
                          case "owner":
                            return (
                              <td key={col.key} className="max-w-[8rem] truncate whitespace-nowrap">
                                {i.owner || "—"}
                              </td>
                            );
                          case "team":
                            return (
                              <td key={col.key} className="min-w-[12rem] max-w-[16rem]">
                                <ResourceMultiSelect
                                  resources={activeResources}
                                  value={assigneesByWorkItem.get(i.id) || []}
                                  onChange={(ids) =>
                                    setAssignees.mutate({ workItemId: i.id, resourceIds: ids })
                                  }
                                  placeholder="Assign resources…"
                                />
                              </td>
                            );
                          case "planned_end":
                            return (
                              <td key={col.key} className="whitespace-nowrap">
                                {i.planned_end || "—"}
                              </td>
                            );
                          default:
                            return <td key={col.key}>—</td>;
                        }
                      })}
                      <td className="whitespace-nowrap">
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

      <ColumnGlossary
        title="Work register — column reference"
        items={[
          {
            name: "Project",
            description: "Project code for the work item’s parent project.",
          },
          {
            name: "Stream",
            description:
              "Delivery lane (Core / other). Changing stream clears a stage gate that belongs to another stream.",
          },
          {
            name: "WBS",
            description: "Work breakdown structure code for ordering and reporting.",
          },
          {
            name: "Title",
            description: "Task / work item name shown on timesheets and planning views.",
          },
          {
            name: "Stage gate",
            description:
              "Waterfall / Hybrid phase for this work item. Used to attribute planned FTE $ and timesheet labor to that gate.",
          },
          {
            name: "Sprint",
            description:
              "Agile / Hybrid iteration for this work item. Pick from the project’s sprints (Agile / Sprints page).",
          },
          {
            name: "Lane allocated",
            description:
              "Hours already booked in Resource Allocation for this project + stream + stage gate (planning ceiling).",
          },
          {
            name: "Planned h",
            description:
              "Work-item estimate hours (demand). Feeds Resources demand and Planned FTE $ when synced.",
          },
          {
            name: "Actual h",
            description: "Approved timesheet hours rolled up to this work item.",
          },
          {
            name: "Pending h",
            description: "Planned h − Actual h (remaining planned effort).",
          },
          {
            name: "Status",
            description: "Delivery status (To Do, In Progress, Blocked, Done, Cancelled).",
          },
          {
            name: "%",
            description: "Percent complete (0–100).",
          },
          {
            name: "Owner",
            description: "Named owner text on the work item (display / reporting).",
          },
          {
            name: "Resources",
            description:
              "Assigned people. Linked logins get this work item as a billable timesheet placeholder.",
          },
          {
            name: "End",
            description: "Planned end date for the work item.",
          },
          {
            name: "Actions",
            description: "Delete removes the work item (and its assignee links).",
          },
        ]}
      />
    </PageExport>
  );
}
