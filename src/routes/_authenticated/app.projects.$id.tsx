import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { ProjectForm, type ProjectFormValues } from "@/components/project-form";
import { ProjectDecisionsPanel } from "@/components/project-decisions-panel";
import { Button } from "@/components/ui/button";
import { SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageLoading } from "@/components/page-loading";
import { ProjectStreamsPanel } from "@/components/project-streams-panel";

type ProjectTab = "overview" | "decisions" | "work" | "governance" | "finance" | "streams";

export const Route = createFileRoute("/_authenticated/app/projects/$id")({
  validateSearch: (s: Record<string, unknown>): { tab?: ProjectTab } => {
    const raw = String(s.tab || "");
    if (["overview", "decisions", "work", "governance", "finance", "streams"].includes(raw)) {
      return { tab: raw as ProjectTab };
    }
    return {};
  },
  component: ProjectDetail,
});

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "streams", label: "Streams" },
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
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

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
    queryFn: async () =>
      (await supabase.from("risks").select("id,title,status,severity").eq("project_id", id)).data ??
      [],
    enabled: !!organization?.id && tab === "governance",
  });

  const { data: issues = [] } = useQuery({
    queryKey: ["issues", organization?.id, id],
    queryFn: async () =>
      (await supabase.from("issues").select("id,title,status,priority").eq("project_id", id)).data ??
      [],
    enabled: !!organization?.id && tab === "governance",
  });

  const submit = async (values: ProjectFormValues) => {
    setBusy(true);
    const { error } = await supabase.from("projects").update(values as never).eq("id", id);
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["project", id] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  const remove = async () => {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    navigate({ to: "/app/projects" });
  };

  const setBaseline = useMutation({
    mutationFn: async () => {
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

  if (isLoading) return <PageLoading label="Loading project…" fullScreen={false} />;
  if (!project) {
    return (
      <div className="text-sm text-muted-foreground">
        Project not found or you don't have access.
      </div>
    );
  }

  const money = (n: number) =>
    "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-mono text-muted-foreground">
            {project.project_code || project.id.slice(0, 8)}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{project.status || "—"}</span>
            <span>·</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-semibold",
                project.rag === "Red" && "bg-rose-100 text-rose-800",
                project.rag === "Amber" && "bg-amber-100 text-amber-800",
                project.rag === "Green" && "bg-emerald-100 text-emerald-800",
              )}
            >
              {project.rag || "No RAG"}
            </span>
            {project.program ? (
              <>
                <span>·</span>
                <span>{project.program}</span>
              </>
            ) : null}
          </div>
        </div>
        {admin && (
          <Button variant="destructive" size="sm" onClick={remove}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        )}
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
              <KpiCard label="Benefits target" value={money(Number(project.benefits_target || 0))} />
              <KpiCard label="ROI %" value={Number(project.roi_percent || 0)} />
            </div>
            {project.streams_enabled ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Streams are enabled — schedule and funding figures on this project are rollups from the{" "}
                <Link
                  to="/app/projects/$id"
                  params={{ id }}
                  search={{ tab: "streams" }}
                  className="font-medium text-primary hover:underline"
                >
                  Streams
                </Link>{" "}
                tab. Prefer editing dates, gates, and budgets there.
              </p>
            ) : null}
          </SectionFrame>
          <ProjectForm
            defaultValues={project as unknown as Partial<ProjectFormValues>}
            onSubmit={submit}
            busy={busy}
            submitLabel="Save changes"
          />
        </div>
      )}

      {tab === "streams" && organization?.id && (
        <ProjectStreamsPanel
          projectId={id}
          orgId={organization.id}
          streamsEnabled={!!project.streams_enabled}
          projectRollup={{
            budget: project.budget,
            planned_start_date: project.planned_start_date,
            planned_end_date: project.planned_end_date,
            actual_start_date: project.actual_start_date,
            actual_end_date: project.actual_end_date,
          }}
        />
      )}

      {tab === "decisions" && (
        <ProjectDecisionsPanel
          projectId={id}
          projectCode={project.project_code}
          projectName={project.name}
          program={project.program}
          sponsor={project.sponsor}
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
          {workItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No work items for this project yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="st-table">
                <thead>
                  <tr>
                    <th>WBS</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>%</th>
                    <th>Owner</th>
                    <th>End</th>
                  </tr>
                </thead>
                <tbody>
                  {workItems.map((w) => (
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
                    <div className="font-medium">{r.title}</div>
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
                    <div className="font-medium">{i.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {i.status} · {i.priority}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionFrame>
        </div>
      )}

      {tab === "finance" && (
        <SectionFrame>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>Financial baseline</SectionTitle>
            <button
              type="button"
              className="st-btn-primary"
              disabled={setBaseline.isPending}
              onClick={() => setBaseline.mutate()}
            >
              {setBaseline.isPending ? "Saving…" : "Capture baseline from current figures"}
            </button>
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
            <KpiCard
              label="Baseline date"
              value={project.baseline_date || "Not set"}
            />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Requires migration columns on <code>projects</code> (
            <code>baseline_*</code>). Variance reporting can use baseline vs current/incurred.
          </p>
        </SectionFrame>
      )}
    </div>
  );
}
