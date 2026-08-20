import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderKanban, Plus } from "lucide-react";
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
import {
  normalizeGateStatus,
  projectLevelGates,
  projectMatchesGateStatusFilter,
  type GateStatusFilter,
} from "@/lib/stage-gate-approval";
import { StageGateStatusFilter } from "@/components/stage-gate-status-filter";
import { GATE_STATUS_COLORS } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/projects/")({
  component: ProjectsIndex,
});

type ProjectRow = Record<string, any>;
type ProjectsView = "cards" | "list";

const PROJECTS_VIEW_KEY = "ipx.projects.view";

function readProjectsView(): ProjectsView {
  try {
    return localStorage.getItem(PROJECTS_VIEW_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

function ragTone(projects: ProjectRow[]) {
  const rags = projects.map((p) => displayRag(p));
  if (rags.some((r) => r === "Red")) return "Red";
  if (rags.some((r) => r === "Amber")) return "Amber";
  if (rags.some((r) => r === "Green")) return "Green";
  return "Green";
}

function ragColor(rag: string | null | undefined) {
  const v = String(rag || "").toLowerCase();
  if (v === "green") return "#22c55e";
  if (v === "amber") return "#f59e0b";
  if (v === "red") return "#ef4444";
  return "#94a3b8";
}

function ProjectsIndex() {
  const { organization, roles, loading: authLoading } = useAuth();
  const canEdit = canEditProjects(roles);
  const orgId = organization?.id;
  const [q, setQ] = useState("");
  const [gateStatusByName, setGateStatusByName] = useState<GateStatusFilter>({});
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [openedOnce, setOpenedOnce] = useState(false);
  const [view, setView] = useState<ProjectsView>(() => readProjectsView());

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
    () =>
      (gateDefs as { gate_name?: string | null }[])
        .map((d) => String(d.gate_name || "").trim())
        .filter(Boolean),
    [gateDefs],
  );
  const gatesByProject = useMemo(() => groupGatesByProject(gates as any[]), [gates]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (projects as ProjectRow[]).filter((p) => {
      if (needle) {
        const hay =
          `${p.project_code || ""} ${p.name || ""} ${p.portfolio || ""} ${p.program || ""} ${p.sponsor || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return projectMatchesGateStatusFilter(gates as never, p.id, gateStatusByName, p);
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
      rag: ragTone([...(bySa.get(sa)?.values() ?? [])].flat()),
      programCount: bySa.get(sa)?.size ?? 0,
      projectCount: [...(bySa.get(sa)?.values() ?? [])].reduce((n, list) => n + list.length, 0),
      programs: [...(bySa.get(sa)?.keys() ?? [])]
        .sort((a, b) => a.localeCompare(b))
        .map((program) => {
          const plist = bySa.get(sa)!.get(program)!;
          return {
            name: program,
            rag: ragTone(plist),
            projects: plist,
          };
        }),
    }));
  }, [filtered]);

  const defaultOpen = useMemo(() => {
    const keys = new Set<string>();
    for (const sa of groups) {
      keys.add(`sa:${sa.name}`);
      for (const prog of sa.programs) keys.add(`prog:${sa.name}:${prog.name}`);
    }
    return keys;
  }, [groups]);

  const openKeys = openedOnce ? open : defaultOpen;

  const toggle = (key: string) => {
    setOpenedOnce(true);
    setOpen((prev) => {
      const base = prev.size ? new Set(prev) : new Set(defaultOpen);
      if (base.has(key)) base.delete(key);
      else base.add(key);
      return base;
    });
  };

  const expandAll = () => {
    const keys = new Set<string>();
    for (const sa of groups) {
      keys.add(`sa:${sa.name}`);
      for (const prog of sa.programs) keys.add(`prog:${sa.name}:${prog.name}`);
    }
    setOpenedOnce(true);
    setOpen(keys);
  };

  const collapseAll = () => {
    setOpenedOnce(true);
    setOpen(new Set());
  };

  const setListView = (list: boolean) => {
    const next: ProjectsView = list ? "list" : "cards";
    setView(next);
    try {
      localStorage.setItem(PROJECTS_VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const projectGate = (p: ProjectRow) => {
    const gs = gatesByProject.get(p.id) || [];
    const top = projectLevelGates(gs, p.id, orgPhases);
    const current = resolveCurrentStage(p, gs, orgPhases) || p.current_phase || "—";
    const currentRow = top.find(
      (g) => String(g.gate_name || "").trim() === String(current).trim(),
    );
    return { current, currentRow, gateStatus: normalizeGateStatus(currentRow?.status) };
  };

  const listColumns: ColumnarColumn<ProjectRow>[] = useMemo(
    () => [
      {
        key: "project_code",
        label: "Code",
        getValue: (p) => p.project_code || "",
      },
      { key: "name", label: "Project" },
      {
        key: "portfolio",
        label: "Strategic Alignment",
        getValue: (p) => p.portfolio || "",
      },
      { key: "program", label: "Program", getValue: (p) => p.program || "" },
      { key: "sponsor", label: "Sponsor", getValue: (p) => p.sponsor || "" },
      { key: "priority", label: "Priority", getValue: (p) => p.priority || "" },
      { key: "status", label: "Status", getValue: (p) => p.status || "" },
      {
        key: "rag",
        label: "RAG",
        getValue: (p) => displayRag(p) || "",
      },
      {
        key: "delivery_method",
        label: "Method",
        getValue: (p) => p.delivery_method || "",
      },
      {
        key: "stage_gate",
        label: "Stage gate",
        getValue: (p) => projectGate(p).current,
      },
      {
        key: "gate_status",
        label: "Gate status",
        getValue: (p) => {
          const { currentRow, gateStatus } = projectGate(p);
          return currentRow ? gateStatus : "";
        },
      },
    ],
    [gatesByProject, orgPhases],
  );

  const listTable = useColumnarTable(filtered, listColumns);

  if (authLoading || (isLoading && !projects.length)) {
    return <PageLoading label="Loading projects…" fullScreen={false} />;
  }

  return (
    <PageExport name="Projects" title="Projects">
      <PageHeading
        icon="📁"
        title="Projects"
        subtitle="Fold Strategic Alignment into programs, then into projects. Switch to a data list for a register view."
        actions={
          <div className="flex flex-wrap gap-2">
            {view === "cards" ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={expandAll}>
                  Expand all
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={collapseAll}>
                  Collapse all
                </Button>
              </>
            ) : null}
            {canEdit ? (
              <Button asChild size="sm">
                <Link to="/app/projects/new">
                  <Plus className="mr-2 h-4 w-4" />
                  New Project
                </Link>
              </Button>
            ) : null}
          </div>
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
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
        <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-primary"
            checked={view === "list"}
            onChange={(e) => setListView(e.target.checked)}
          />
          Data list
        </label>
      </div>

      {!filtered.length && !isError ? (
        <SectionFrame>
          <p className="text-sm text-muted-foreground">
            {projects.length
              ? "No projects match the search or stage gate filter."
              : "No projects in this organisation yet."}
          </p>
        </SectionFrame>
      ) : null}

      {view === "list" && filtered.length ? (
        <SectionFrame>
          <ColumnarToolbar
            globalQ={listTable.globalQ}
            onGlobalQ={listTable.setGlobalQ}
            shown={listTable.rows.length}
            total={listTable.total}
            dirty={listTable.isDirty}
            onClear={listTable.clearAll}
            placeholder="Filter list…"
          />
          <div className="overflow-x-auto">
            <table className="st-table">
              <thead>
                <tr>
                  {listColumns.map((col) => (
                    <ColumnarTh
                      key={col.key}
                      column={col}
                      filter={listTable.filters[col.key]}
                      onFilter={(v) => listTable.setColumnFilter(col.key, v)}
                      sortKey={listTable.sortKey}
                      sortDir={listTable.sortDir}
                      onToggleSort={listTable.toggleSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {listTable.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={listColumns.length}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      No projects match list filters.
                    </td>
                  </tr>
                ) : (
                  listTable.rows.map((p) => {
                    const { current, currentRow, gateStatus } = projectGate(p);
                    const rag = displayRag(p);
                    return (
                      <tr key={p.id}>
                        <td className="font-mono text-xs whitespace-nowrap">
                          {p.project_code || "—"}
                        </td>
                        <td>
                          <Link
                            to="/app/projects/$id"
                            params={{ id: p.id }}
                            className="font-medium text-primary hover:underline"
                          >
                            {p.name}
                          </Link>
                        </td>
                        <td>{p.portfolio || "—"}</td>
                        <td>{p.program || "—"}</td>
                        <td>{p.sponsor || "—"}</td>
                        <td>{p.priority || "—"}</td>
                        <td>{p.status || "—"}</td>
                        <td>
                          <RagChip
                            rag={rag}
                            manual={isRagOverridden(p)}
                            explain={explainRagMetric({
                              rag,
                              source: "register",
                              overridden: isRagOverridden(p),
                            })}
                          />
                        </td>
                        <td>{p.delivery_method || "—"}</td>
                        <td className="font-medium">{current}</td>
                        <td>
                          {currentRow ? (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{
                                background: GATE_STATUS_COLORS[gateStatus],
                                color: "#0f172a",
                              }}
                            >
                              {gateStatus}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </SectionFrame>
      ) : null}

      {view === "cards" ? (
      <div className="space-y-5">
        {groups.map((sa) => {
          const saKey = `sa:${sa.name}`;
          const saOpen = openKeys.has(saKey);
          return (
            <section
              key={saKey}
              className="overflow-hidden rounded-2xl border bg-card shadow-sm"
            >
              <div className="h-1.5 w-full" style={{ background: ragColor(sa.rag) }} />
              <button
                type="button"
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 sm:px-5"
                onClick={() => toggle(saKey)}
                aria-expanded={saOpen}
              >
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background">
                  {saOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Strategic Alignment
                    </span>
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: ragColor(sa.rag) }}
                    />
                  </div>
                  <h2 className="mt-0.5 text-lg font-semibold tracking-tight">{sa.name}</h2>
                  <p className="text-[12px] text-muted-foreground">
                    {sa.programCount} program{sa.programCount === 1 ? "" : "s"} · {sa.projectCount}{" "}
                    project{sa.projectCount === 1 ? "" : "s"}
                  </p>
                </div>
              </button>

              {saOpen ? (
                <div className="border-t px-3 pb-4 pt-3 sm:px-5">
                  <div className="space-y-3">
                    {sa.programs.map((prog) => {
                      const progKey = `prog:${sa.name}:${prog.name}`;
                      const progOpen = openKeys.has(progKey);
                      return (
                        <div
                          key={progKey}
                          className="relative overflow-hidden rounded-xl border bg-background/80"
                        >
                          <div
                            className="absolute inset-y-0 left-0 w-1"
                            style={{ background: ragColor(prog.rag) }}
                          />
                          <button
                            type="button"
                            className="flex w-full items-start gap-3 py-3 pl-4 pr-3 text-left hover:bg-muted/30"
                            onClick={() => toggle(progKey)}
                            aria-expanded={progOpen}
                          >
                            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-background">
                              {progOpen ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                  Program
                                </span>
                                <span className="text-[12px] text-muted-foreground">
                                  {prog.projects.length} project
                                  {prog.projects.length === 1 ? "" : "s"}
                                </span>
                              </div>
                              <h3 className="mt-0.5 text-sm font-semibold tracking-tight">{prog.name}</h3>
                            </div>
                          </button>
                          {progOpen ? (
                            <div className="grid gap-3 border-t px-3 py-3 sm:grid-cols-2 xl:grid-cols-3">
                              {prog.projects.map((p) => {
                                const gs = gatesByProject.get(p.id) || [];
                                const top = projectLevelGates(gs, p.id, orgPhases);
                                const current =
                                  resolveCurrentStage(p, gs, orgPhases) || p.current_phase || "—";
                                const currentRow = top.find(
                                  (g) => String(g.gate_name || "").trim() === String(current).trim(),
                                );
                                const gateStatus = normalizeGateStatus(currentRow?.status);
                                const rag = displayRag(p);
                                return (
                                  <Link
                                    key={p.id}
                                    to="/app/projects/$id"
                                    params={{ id: p.id }}
                                    className={cn(
                                      "group relative block overflow-hidden rounded-xl border bg-card p-3 shadow-sm transition",
                                      "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
                                    )}
                                  >
                                    <div
                                      className="absolute inset-x-0 top-0 h-1"
                                      style={{ background: ragColor(rag) }}
                                    />
                                    <div className="flex items-start justify-between gap-2 pt-1">
                                      <div className="min-w-0">
                                        <div className="font-mono text-[10px] text-muted-foreground">
                                          {p.project_code || "—"}
                                        </div>
                                        <div className="mt-0.5 truncate text-sm font-semibold tracking-tight group-hover:text-primary">
                                          {p.name}
                                        </div>
                                      </div>
                                      <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                      <span className="rounded-md bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium">
                                        {p.status || "—"}
                                      </span>
                                      <RagChip
                                        rag={rag}
                                        manual={isRagOverridden(p)}
                                        explain={explainRagMetric({
                                          rag,
                                          source: "register",
                                          overridden: isRagOverridden(p),
                                        })}
                                      />
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                                      <span className="text-muted-foreground">Stage gate</span>
                                      <span className="font-medium">{current}</span>
                                      {currentRow ? (
                                        <span
                                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                                          style={{
                                            background: GATE_STATUS_COLORS[gateStatus],
                                            color: "#0f172a",
                                          }}
                                        >
                                          {gateStatus}
                                        </span>
                                      ) : null}
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      ) : null}
    </PageExport>
  );
}
