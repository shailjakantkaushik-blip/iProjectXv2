import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { useTablePermission } from "@/lib/permissions";
import { ProjectForm, type ProjectFormValues } from "@/components/project-form";
import { ProjectDecisionsPanel } from "@/components/project-decisions-panel";
import { ProjectStageGateApproval } from "@/components/project-stage-gate-approval";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionFrame, SectionTitle, KpiCard, RagChip } from "@/components/streamlit";
import { toast } from "sonner";
import { List, Plus, Trash2 } from "lucide-react";
import {
  fetchProjectOptions,
  projectOptionsQueryKey,
  writeLastProjectId,
} from "@/lib/project-options";
import { cn } from "@/lib/utils";
import { PageLoading } from "@/components/page-loading";
import { ProjectStreamsPanel } from "@/components/project-streams-panel";
import { ProjectPhaseTimeline } from "@/components/project-phase-timeline";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";
import { explainRag } from "@/lib/explain-metric";
import { displayRag, isRagOverridden } from "@/lib/ops-enhancements";
import { ProjectMeetingSummary } from "@/components/project-meeting-summary";
import {
  applyForecastToProjectPlan,
  loadForecastPhases,
  parseForecastPhaseNotes,
} from "@/lib/project-forecast";
import { ProjectGovernanceForums } from "@/components/governance-hierarchy";

type ProjectTab =
  | "overview"
  | "summary"
  | "decisions"
  | "work"
  | "governance"
  | "finance"
  | "streams"
  | "phases";

export const Route = createFileRoute("/_authenticated/app/projects/$id")({
  validateSearch: (s: Record<string, unknown>): { tab?: ProjectTab } => {
    const raw = String(s.tab || "");
    if (
      ["overview", "summary", "decisions", "work", "governance", "finance", "streams", "phases"].includes(
        raw,
      )
    ) {
      return { tab: raw as ProjectTab };
    }
    return {};
  },
  component: ProjectDetail,
});

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "summary", label: "Project Summary" },
  { id: "streams", label: "Streams" },
  { id: "phases", label: "Phase timeline" },
  { id: "decisions", label: "Key Decisions" },
  { id: "work", label: "Work" },
  { id: "governance", label: "RAID" },
  { id: "finance", label: "Finance" },
] as const;

function ProjectDetail() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const tab: ProjectTab = search.tab || "overview";
  const { roles, organization } = useAuth();
  const admin = isAdmin(roles);
  const projectPerm = useTablePermission("projects");
  const streamPerm = useTablePermission("project_streams");
  const decisionPerm = useTablePermission("decisions");
  const canEdit = projectPerm.canEdit;
  const canOther = admin || projectPerm.canOther;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const orgId = organization?.id;

  const { data: projectOptions = [] } = useQuery({
    queryKey: projectOptionsQueryKey(orgId),
    queryFn: fetchProjectOptions,
    enabled: !!orgId,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (id && orgId) writeLastProjectId(orgId, id);
  }, [id, orgId]);

  const switchProject = (nextId: string) => {
    if (!nextId || nextId === id) return;
    writeLastProjectId(orgId, nextId);
    navigate({
      to: "/app/projects/$id",
      params: { id: nextId },
      search: tab === "overview" ? {} : { tab },
    });
  };

  const projectQ = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const project = projectQ.data;
  const isLoading = projectQ.isLoading && project === undefined;

  const { data: workItems = [] } = useQuery({
    queryKey: ["work_items", organization?.id, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_items" as any)
        .select("*")
        .eq("project_id", id)
        .order("sort_order");
      if (error) return [];
      return (data ?? []) as any[];
    },
    enabled: !!organization?.id && tab === "work",
  });

  const { data: risks = [] } = useQuery({
    queryKey: ["risks", organization?.id, id],
    queryFn: async () => {
      const wide = await supabase
        .from("risks")
        .select("id,raid_code,title,status,severity")
        .eq("project_id", id);
      if (wide.error && /raid_code/i.test(wide.error.message)) {
        return (
          (await supabase.from("risks").select("id,title,status,severity").eq("project_id", id))
            .data ?? []
        );
      }
      return wide.data ?? [];
    },
    enabled: !!organization?.id && tab === "governance",
  });

  const { data: issues = [] } = useQuery({
    queryKey: ["issues", organization?.id, id],
    queryFn: async () => {
      const wide = await supabase
        .from("issues")
        .select("id,raid_code,title,status,priority")
        .eq("project_id", id);
      if (wide.error && /raid_code/i.test(wide.error.message)) {
        return (
          (await supabase.from("issues").select("id,title,status,priority").eq("project_id", id))
            .data ?? []
        );
      }
      return wide.data ?? [];
    },
    enabled: !!organization?.id && tab === "governance",
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["actions", organization?.id, id, "raid-tab"],
    queryFn: async () => {
      const wide = await supabase
        .from("actions")
        .select("id,raid_code,title,status,priority,due_date")
        .eq("project_id", id);
      if (wide.error && /raid_code/i.test(wide.error.message)) {
        return (
          (
            await supabase
              .from("actions")
              .select("id,title,status,priority,due_date")
              .eq("project_id", id)
          ).data ?? []
        );
      }
      return wide.data ?? [];
    },
    enabled: !!organization?.id && tab === "governance",
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ["decisions", organization?.id, id, "raid-tab"],
    queryFn: async () => {
      const wide = await supabase
        .from("decisions")
        .select("id,raid_code,title,status,outcome")
        .eq("project_id", id);
      if (wide.error && /raid_code/i.test(wide.error.message)) {
        return (
          (await supabase.from("decisions").select("id,title,status,outcome").eq("project_id", id))
            .data ?? []
        );
      }
      return wide.data ?? [];
    },
    enabled: !!organization?.id && tab === "governance",
  });

  const submit = async (values: ProjectFormValues) => {
    if (!canEdit) {
      toast.error("You do not have edit rights for this project");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("projects")
      .update(values as never)
      .eq("id", id);
    if (error) {
      setBusy(false);
      return void toast.error(error.message);
    }
    const start = String(values.planned_start_date || "").slice(0, 10);
    if (start && organization?.id) {
      try {
        const { data: fc } = await supabase
          .from("project_forecasts" as any)
          .select("id,notes")
          .eq("project_id", id)
          .maybeSingle();
        if (fc?.id) {
          let phases = await loadForecastPhases(fc.id);
          if (!phases.length) phases = parseForecastPhaseNotes(fc.notes);
          if (phases.length) {
            const allStreams = await fetchOrgStreams(organization.id);
            await applyForecastToProjectPlan({
              orgId: organization.id,
              projectId: id,
              startDate: start,
              phases,
              streams: allStreams.filter((s) => s.project_id === id),
              onlyFillEmpty: true,
              forecastId: fc.id,
            });
          }
        }
      } catch {
        /* forecast tables may not be migrated yet */
      }
    }
    setBusy(false);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["project", id] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["stage_gates"] });
    qc.invalidateQueries({ queryKey: ["project_streams"] });
  };

  const remove = async () => {
    if (!canOther) {
      toast.error("You do not have permission to delete this project");
      return;
    }
    if (!confirm("Delete this project? This cannot be undone.")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["projects"] });
    const next = (projectOptions as { id: string }[]).find((p) => p.id !== id);
    if (next) {
      writeLastProjectId(orgId, next.id);
      navigate({ to: "/app/projects/$id", params: { id: next.id } });
    } else {
      navigate({ to: "/app/projects" });
    }
  };

  const setBaseline = useMutation({
    mutationFn: async () => {
      if (!canEdit) throw new Error("You do not have edit rights for this project");
      if (!project) return;
      const { error } = await supabase
        .from("projects")
        .update({
          baseline_budget: Number(project.budget || 0),
          baseline_capex: Number(project.capex_approved || 0),
          baseline_opex: Number(project.opex_approved || 0),
          baseline_benefits: Number(project.benefits_target || 0),
          baseline_date: new Date().toISOString().slice(0, 10),
          baseline_label: `Baseline ${new Date().toISOString().slice(0, 10)}`,
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      toast.success("Financial baseline captured");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const workColumns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "wbs_code", label: "WBS" },
      { key: "title", label: "Title" },
      { key: "status", label: "Status" },
      {
        key: "percent_complete",
        label: "%",
        getValue: (w) => w.percent_complete ?? 0,
      },
      { key: "owner", label: "Owner" },
      { key: "planned_end", label: "End" },
    ],
    [],
  );
  const workTable = useColumnarTable(workItems, workColumns);

  const options = projectOptions as {
    id: string;
    name?: string | null;
    project_code?: string | null;
  }[];
  const allProjectsLink = (
    <Button asChild size="sm" variant="outline">
      <Link to="/app/projects/">
        <List className="mr-2 h-4 w-4" />
        All projects
      </Link>
    </Button>
  );

  const projectPicker = (
    <Select value={id} onValueChange={switchProject}>
      <SelectTrigger className="w-72" aria-label="Switch project">
        <SelectValue placeholder="Select a project" />
      </SelectTrigger>
      <SelectContent>
        {options.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.project_code ? `${p.project_code} · ` : ""}
            {p.name}
          </SelectItem>
        ))}
        {!options.some((p) => p.id === id) ? (
          <SelectItem value={id}>
            {project
              ? `${project.project_code ? `${project.project_code} · ` : ""}${project.name}`
              : "Current project"}
          </SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );

  if (isLoading) return <PageLoading label="Loading project…" fullScreen={false} />;
  if (!project) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {allProjectsLink}
          {projectPicker}
        </div>
        <p className="text-sm text-muted-foreground">
          Project not found or you don't have access. Choose another project from the list.
        </p>
      </div>
    );
  }

  const money = (n: number) =>
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
      n || 0,
    );

  return (
    <div className={cn("mx-auto space-y-5", tab === "phases" ? "max-w-6xl" : "max-w-5xl")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-mono text-muted-foreground">
            {project.project_code || project.id.slice(0, 8)}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{project.status || "—"}</span>
            <span>·</span>
            <RagChip
              rag={displayRag(project)}
              manual={isRagOverridden(project)}
              explain={explainRag({
                rag: displayRag(project),
                source: "register",
                overridden: isRagOverridden(project),
              })}
            />
            {project.program ? (
              <>
                <span>·</span>
                <span>{project.program}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {allProjectsLink}
          {projectPicker}
          {(admin || canEdit) && (
            <Button asChild size="sm" variant="outline">
              <Link to="/app/projects/new">
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Link>
            </Button>
          )}
          {canOther && (
            <Button variant="destructive" size="sm" onClick={remove}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border pb-px">
        {TABS.map((t) => (
          <Link
            key={t.id}
            to="/app/projects/$id"
            params={{ id }}
            search={{ tab: t.id }}
            className={cn(
              "rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <SectionFrame>
            <SectionTitle>Project snapshot</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Budget" value={money(Number(project.budget || 0))} />
              <KpiCard label="CAPEX approved" value={money(Number(project.capex_approved || 0))} />
              <KpiCard
                label="Benefits target"
                value={money(Number(project.benefits_target || 0))}
              />
              <KpiCard label="ROI %" value={Number(project.roi_percent || 0)} />
            </div>
            <p className="mt-3 text-sm">
              <Link
                to="/app/projects/$id"
                params={{ id }}
                search={{ tab: "summary" }}
                className="font-medium text-primary hover:underline"
              >
                {canEdit ? "Edit Project Summary" : "View Project Summary"}
              </Link>
              <span className="text-muted-foreground">
                {" "}
                — meeting notes, next actions, and RAG override (shown on Executive Cockpit →
                Project summaries).
              </span>
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Schedule and funding on this project are rollups from{" "}
              <Link
                to="/app/projects/$id"
                params={{ id }}
                search={{ tab: "streams" }}
                className="font-medium text-primary hover:underline"
              >
                Streams
              </Link>{" "}
              (at least Core). Estimate phase effort on{" "}
              <Link to="/app/project-forecast" className="font-medium text-primary hover:underline">
                Project Estimation Planning
              </Link>
              ; setting Planned Start fills empty timeline dates from that estimate.
            </p>
          </SectionFrame>
          {organization?.id ? (
            <ProjectStageGateApproval
              orgId={organization.id}
              projectId={id}
              deliveryMethodId={project.delivery_method_id}
              deliveryMethodName={project.delivery_method}
              canEdit={canEdit}
            />
          ) : null}
          <ProjectForm
            defaultValues={project as unknown as Partial<ProjectFormValues>}
            onSubmit={submit}
            busy={busy}
            submitLabel="Save changes"
            readOnly={!canEdit}
          />
        </div>
      )}

      {tab === "summary" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {canEdit ? "Edit the steering-meeting summary here." : "Steering-meeting summary (view only)."} The{" "}
            <Link
              to="/app/executive-cockpit"
              search={{ section: "summaries" }}
              className="font-medium text-primary hover:underline"
            >
              Executive Cockpit → Project summaries
            </Link>{" "}
            section shows it read-only.{" "}
            <Link to="/app/project-forecast" className="font-medium text-primary hover:underline">
              Open estimation planning
            </Link>
          </p>
          <ProjectMeetingSummary projectId={id} project={project} readOnly={!canEdit} />
        </div>
      )}

      {tab === "streams" && organization?.id && (
        <ProjectStreamsPanel
          projectId={id}
          projectCode={project.project_code}
          orgId={organization.id}
          streamsEnabled={!!project.streams_enabled}
          canEdit={streamPerm.canEdit}
          canOther={streamPerm.canOther || admin}
          projectRollup={{
            budget: project.budget,
            planned_start_date: project.planned_start_date,
            planned_end_date: project.planned_end_date,
            actual_start_date: project.actual_start_date,
            actual_end_date: project.actual_end_date,
          }}
        />
      )}

      {tab === "phases" && organization?.id && (
        <ProjectPhaseTimeline
          projectId={id}
          project={project}
          orgId={organization.id}
          fyStartMonth={organization.fy_start_month || 4}
        />
      )}

      {tab === "decisions" && (
        <ProjectDecisionsPanel
          projectId={id}
          projectCode={project.project_code}
          projectName={project.name}
          program={project.program}
          sponsor={project.sponsor}
          deliveryMethodId={project.delivery_method_id}
          deliveryMethodName={project.delivery_method}
          canEdit={decisionPerm.canEdit}
        />
      )}

      {tab === "work" && (
        <SectionFrame>
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle>Work items</SectionTitle>
            <Link to="/app/work-items" className="text-xs font-medium text-primary hover:underline">
              Open work board
            </Link>
          </div>
          <ColumnarToolbar
            globalQ={workTable.globalQ}
            onGlobalQ={workTable.setGlobalQ}
            shown={workTable.rows.length}
            total={workTable.total}
            dirty={workTable.isDirty}
            onClear={workTable.clearAll}
            placeholder="Search work items…"
          />
          {workTable.total === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No work items for this project yet.
            </div>
          ) : workTable.rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No matching work items.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="st-table">
                <thead>
                  <tr>
                    {workColumns.map((col) => (
                      <ColumnarTh
                        key={col.key}
                        column={col}
                        filter={workTable.filters[col.key]}
                        onFilter={(v) => workTable.setColumnFilter(col.key, v)}
                        sortKey={workTable.sortKey}
                        sortDir={workTable.sortDir}
                        onToggleSort={workTable.toggleSort}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workTable.rows.map((w) => (
                    <tr key={w.id}>
                      <td className="font-mono text-xs">{w.wbs_code || "—"}</td>
                      <td>{w.title}</td>
                      <td>{w.status}</td>
                      <td>{w.percent_complete ?? 0}%</td>
                      <td className="text-xs">{w.owner || "—"}</td>
                      <td className="text-xs">{w.planned_end || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionFrame>
      )}

      {tab === "governance" && (
        <div className="space-y-4">
          {project && orgId && (
            <ProjectGovernanceForums
              orgId={orgId}
              project={{
                id: project.id,
                name: project.name,
                project_code: project.project_code,
                program: project.program,
                portfolio: project.portfolio,
                pm_user_id: project.pm_user_id,
              }}
            />
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionFrame>
              <div className="mb-2 flex items-center justify-between">
                <SectionTitle>Risks</SectionTitle>
                <Link to="/app/risks" className="text-xs font-medium text-primary hover:underline">
                  Register
                </Link>
              </div>
              {risks.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">No risks</div>
              ) : (
                <ul className="space-y-2">
                  {risks.slice(0, 8).map((r: any) => (
                    <li key={r.id} className="rounded-md border border-border/70 px-3 py-2 text-sm">
                      <div className="font-medium">
                        {r.raid_code ? `${r.raid_code} · ` : ""}
                        {r.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.status} · severity {r.severity ?? "—"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionFrame>
            <SectionFrame>
              <div className="mb-2 flex items-center justify-between">
                <SectionTitle>Issues</SectionTitle>
                <Link to="/app/issues" className="text-xs font-medium text-primary hover:underline">
                  Register
                </Link>
              </div>
              {issues.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">No issues</div>
              ) : (
                <ul className="space-y-2">
                  {issues.slice(0, 8).map((i: any) => (
                    <li key={i.id} className="rounded-md border border-border/70 px-3 py-2 text-sm">
                      <div className="font-medium">
                        {i.raid_code ? `${i.raid_code} · ` : ""}
                        {i.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {i.status} · {i.priority}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionFrame>
            <SectionFrame>
              <div className="mb-2 flex items-center justify-between">
                <SectionTitle>Actions</SectionTitle>
                <Link to="/app/actions" className="text-xs font-medium text-primary hover:underline">
                  Register
                </Link>
              </div>
              {actions.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">No actions</div>
              ) : (
                <ul className="space-y-2">
                  {actions.slice(0, 8).map((a: any) => (
                    <li key={a.id} className="rounded-md border border-border/70 px-3 py-2 text-sm">
                      <div className="font-medium">
                        {a.raid_code ? `${a.raid_code} · ` : ""}
                        {a.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {a.status}
                        {a.priority ? ` · ${a.priority}` : ""}
                        {a.due_date ? ` · due ${String(a.due_date).slice(0, 10)}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionFrame>
            <SectionFrame>
              <div className="mb-2 flex items-center justify-between">
                <SectionTitle>Decisions</SectionTitle>
                <Link
                  to="/app/decisions"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Register
                </Link>
              </div>
              {decisions.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">No decisions</div>
              ) : (
                <ul className="space-y-2">
                  {decisions.slice(0, 8).map((d: any) => (
                    <li key={d.id} className="rounded-md border border-border/70 px-3 py-2 text-sm">
                      <div className="font-medium">
                        {d.raid_code ? `${d.raid_code} · ` : ""}
                        {d.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {d.outcome || d.status || "—"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionFrame>
          </div>
        </div>
      )}

      {tab === "finance" && (
        <SectionFrame>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>Financial baseline</SectionTitle>
            {canEdit ? (
            <button
              type="button"
              className="st-btn-primary"
              disabled={setBaseline.isPending}
              onClick={() => setBaseline.mutate()}
            >
              {setBaseline.isPending ? "Saving…" : "Capture baseline from current figures"}
            </button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Current budget" value={money(Number(project.budget || 0))} />
            <KpiCard
              label="Baseline budget"
              value={project.baseline_budget != null ? money(Number(project.baseline_budget)) : "—"}
            />
            <KpiCard
              label="Baseline CAPEX"
              value={project.baseline_capex != null ? money(Number(project.baseline_capex)) : "—"}
            />
            <KpiCard label="Baseline date" value={project.baseline_date || "Not set"} />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Requires migration columns on <code>projects</code> (<code>baseline_*</code>). Variance
            reporting can use baseline vs current/incurred.
          </p>
        </SectionFrame>
      )}
    </div>
  );
}
