import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PROJECT_PORTFOLIO_SELECT } from "@/lib/query-selects";
import { sortProjectsByCodeName } from "@/lib/project-sort";
import { useAuth, canEditProjects } from "@/lib/auth-context";
import { PageHeading, RagChip, SectionFrame } from "@/components/streamlit";
import { PageLoading } from "@/components/page-loading";
import { PageExport } from "@/components/page-export";
import { Button } from "@/components/ui/button";
import { PORTFOLIO_CATEGORIES } from "@/lib/project-health";
import { displayRag, isRagOverridden } from "@/lib/ops-enhancements";
import { explainRag as explainRagMetric } from "@/lib/explain-metric";
import { resolveCurrentStage, groupGatesByProject } from "@/lib/project-phase";
import { normalizeGateStatus, projectLevelGates, projectMatchesGateStatusFilter, type GateStatusFilter } from "@/lib/stage-gate-approval";
import { StageGateStatusFilter } from "@/components/stage-gate-status-filter";
import { GATE_STATUS_COLORS } from "@/lib/chart-theme";

export const Route = createFileRoute("/_authenticated/app/projects/")({
  component: ProjectsIndex,
});

type ProjectRow = Record<string, any>;

function ProjectsIndex() {
  const { organization, roles, loading: authLoading } = useAuth();
  const canEdit = canEditProjects(roles);
  const orgId = organization?.id;
  const [q, setQ] = useState("");
  const [gateStatusByName, setGateStatusByName] = useState<GateStatusFilter>({});

  const {
    data: projects = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from("projects")
        .select(PROJECT_PORTFOLIO_SELECT as "*");
      if (qErr) throw qErr;
      return sortProjectsByCodeName(data ?? []);
    },
    enabled: !!orgId,
    staleTime: 15_000,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gates")
          .select("id,project_id,stream_id,gate_name,status")
      ).data ?? [],
    enabled: !!orgId,
  });

  const { data: gateDefs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gate_definitions")
          .select("gate_name")
          .eq("org_id", orgId!)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
      ).data ?? [],
    enabled: !!orgId,
  });

  const orgPhases = useMemo(
    () => (gateDefs as { gate_name?: string | null }[]).map((d) => String(d.gate_name || "").trim()).filter(Boolean),
    [gateDefs],
  );
  const gatesByProject = useMemo(() => groupGatesByProject(gates as any[]), [gates]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (projects as ProjectRow[]).filter((p) => {
      if (needle) {
        const hay = `${p.project_code || ""} ${p.name || ""} ${p.portfolio || ""} ${p.program || ""} ${p.sponsor || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return projectMatchesGateStatusFilter(gates as never, p.id, gateStatusByName);
    });
  }, [projects, q, gates, gateStatusByName]);

  const groups = useMemo(() => {
    const bySa = new Map<string, Map<string, ProjectRow[]>>();
    for (const p of filtered) {
      const sa = String(p.portfolio || "").trim() || "Unassigned";
      const program = String(p.program || "").trim() || "Unassigned";
      if (!bySa.has(sa)) bySa.set(sa, new Map());
      const programs = bySa.get(sa)!;
      const list = programs.get(program) ?? [];
      list.push(p);
      programs.set(program, list);
    }
    const preferred = [...PORTFOLIO_CATEGORIES];
    const extra = [...bySa.keys()]
      .filter((k) => !preferred.includes(k as (typeof PORTFOLIO_CATEGORIES)[number]))
      .sort((a, b) => a.localeCompare(b));
    const order = [...preferred.filter((k) => bySa.has(k)), ...extra];
    if (bySa.has("Unassigned") && !order.includes("Unassigned")) order.push("Unassigned");
    return order.map((sa) => ({
      name: sa,
      programs: [...(bySa.get(sa)?.keys() ?? [])]
        .sort((a, b) => a.localeCompare(b))
        .map((program) => ({
          name: program,
          projects: bySa.get(sa)!.get(program)!,
        })),
    }));
  }, [filtered]);

  if (authLoading || (isLoading && !projects.length)) {
    return <PageLoading label="Loading projects…" fullScreen={false} />;
  }

  return (
    <PageExport name="Projects" title="Projects">
      <PageHeading
        icon="📁"
        title="Projects"
        subtitle="All projects grouped by Strategic Alignment and program. Open a row for the project workspace."
        actions={
          canEdit ? (
            <Button asChild size="sm">
              <Link to="/app/projects/new">
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Link>
            </Button>
          ) : null
        }
      />

      {isError ? (
        <SectionFrame>
          <p className="text-sm text-destructive">
            {(error as Error)?.message || "Could not load projects."}
          </p>
          <Button type="button" className="mt-3" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </SectionFrame>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          className="st-input max-w-md"
          placeholder="Search code, name, alignment, program…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <StageGateStatusFilter
          gateNames={orgPhases}
          value={gateStatusByName}
          onChange={setGateStatusByName}
        />
      </div>

      {!filtered.length && !isError ? (
        <SectionFrame>
          <p className="text-sm text-muted-foreground">
            {projects.length ? "No projects match the search or stage gate filter." : "No projects in this organisation yet."}
          </p>
        </SectionFrame>
      ) : null}

      <div className="space-y-4">
        {groups.map((sa) => (
          <SectionFrame key={sa.name} exportName={`sa-${sa.name}`} exportTitle={sa.name}>
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Strategic Alignment
            </h2>
            <h3 className="mt-0.5 text-lg font-semibold tracking-tight">{sa.name}</h3>
            <div className="mt-3 space-y-4">
              {sa.programs.map((prog) => (
                <div key={`${sa.name}:${prog.name}`}>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Program · {prog.name}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="st-table">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Project</th>
                          <th>Status</th>
                          <th>Health</th>
                          <th>Stage gate approval</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prog.projects.map((p) => {
                          const gs = gatesByProject.get(p.id) || [];
                          const top = projectLevelGates(gs, p.id, orgPhases);
                          const current =
                            resolveCurrentStage(p, gs, orgPhases) || p.current_phase || "—";
                          const currentRow = top.find(
                            (g) => String(g.gate_name || "").trim() === String(current).trim(),
                          );
                          const gateStatus = normalizeGateStatus(currentRow?.status);
                          return (
                            <tr key={p.id}>
                              <td className="font-mono text-xs">{p.project_code || "—"}</td>
                              <td>
                                <Link
                                  to="/app/projects/$id"
                                  params={{ id: p.id }}
                                  className="font-medium text-primary hover:underline"
                                >
                                  {p.name}
                                </Link>
                              </td>
                              <td className="text-xs">{p.status || "—"}</td>
                              <td>
                                <RagChip
                                  rag={displayRag(p)}
                                  manual={isRagOverridden(p)}
                                  explain={explainRagMetric({
                                    rag: displayRag(p),
                                    source: "register",
                                    overridden: isRagOverridden(p),
                                  })}
                                />
                              </td>
                              <td>
                                <span className="text-xs font-medium">{current}</span>
                                {currentRow ? (
                                  <span
                                    className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                                    style={{
                                      background: GATE_STATUS_COLORS[gateStatus],
                                      color: "#0f172a",
                                    }}
                                  >
                                    {gateStatus}
                                  </span>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </SectionFrame>
        ))}
      </div>
    </PageExport>
  );
}
