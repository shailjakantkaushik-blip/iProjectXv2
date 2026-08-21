import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { HEALTH_ENGINE_RISKS_SELECT, PROJECT_PORTFOLIO_SELECT } from "@/lib/query-selects";
import { PROJECT_OPS_EXTRAS } from "@/lib/project-selects";
import { sortProjectsByCodeName } from "@/lib/project-sort";
import { useAuth, canEditProjects } from "@/lib/auth-context";
import { PageHeading, SectionFrame, RagChip } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { projectApprovedFunding, projectForecast, projectIncurred } from "@/lib/project-finance";
import {
  computeProjectHealth,
  PORTFOLIO_CATEGORIES,
  scoreToRag,
  type RagTone,
} from "@/lib/project-health";
import { effectiveRag, isRagOverridden } from "@/lib/ops-enhancements";
import { explainRag } from "@/lib/explain-metric";
import { isDecisionAwaiting } from "@/lib/decision-approval";
import { StageGateStatusFilter } from "@/components/stage-gate-status-filter";
import {
  projectMatchesGateStatusFilter,
  type GateStatusFilter,
} from "@/lib/stage-gate-approval";
import { useHierarchyEnvelopes } from "@/hooks/use-hierarchy-envelopes";
import { HierarchyEnvelopeField } from "@/components/hierarchy-envelope-field";
import {
  childApprovedByLayer,
  lookupHierarchyEnvelope,
  overlayParentEnvelopeRag,
  parentEnvelopeStatus,
  parentWatchesForProject,
  programPotsAllocated,
  worseRag,
} from "@/lib/hierarchy-envelope";

export const Route = createFileRoute("/_authenticated/app/strategic-alignment")({
  head: () => ({
    meta: [
      { title: "Strategic Alignment — iProjectX" },
      {
        name: "description",
        content:
          "Hierarchy from Strategic Alignment through programs, projects, and streams, with finance, calculated health, and RAID counts.",
      },
    ],
  }),
  component: StrategicAlignmentPage,
});

type RaidKind = "risks" | "actions" | "issues" | "decisions";

type RaidCounts = Record<RaidKind, number>;

type NodeMetrics = {
  budget: number;
  forecast: number;
  actual: number;
  score: number;
  rag: RagTone | string;
  ragManual: boolean;
  raid: RaidCounts;
  projects: number;
  streams: number;
};

type StreamNode = {
  id: string;
  name: string;
  code: string | null;
  metrics: NodeMetrics;
};

type ProjectNode = {
  id: string;
  name: string;
  code: string | null;
  metrics: NodeMetrics;
  streams: StreamNode[];
};

type ProgramNode = {
  name: string;
  metrics: NodeMetrics;
  projects: ProjectNode[];
};

type AlignmentNode = {
  name: string;
  metrics: NodeMetrics;
  programs: ProgramNode[];
};

const EMPTY_RAID: RaidCounts = { risks: 0, actions: 0, issues: 0, decisions: 0 };

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

function isOpenRaid(kind: RaidKind, status: string | null | undefined) {
  const s = String(status || "").toLowerCase();
  if (kind === "risks") return !/closed|mitigated|accepted|resolved/.test(s);
  if (kind === "issues") return !/closed|resolved/.test(s);
  if (kind === "actions") return !/closed|completed|done/.test(s);
  return !/approved|rejected|closed|cancelled|implemented/.test(s);
}

function ragColor(rag: string | null | undefined) {
  const v = String(rag || "").toLowerCase();
  if (v === "green") return "#22c55e";
  if (v === "amber") return "#f59e0b";
  if (v === "red") return "#ef4444";
  return "#94a3b8";
}

function addRaid(a: RaidCounts, b: RaidCounts): RaidCounts {
  return {
    risks: a.risks + b.risks,
    actions: a.actions + b.actions,
    issues: a.issues + b.issues,
    decisions: a.decisions + b.decisions,
  };
}

function rollMetrics(nodes: { metrics: NodeMetrics }[]): NodeMetrics {
  if (!nodes.length) {
    return {
      budget: 0,
      forecast: 0,
      actual: 0,
      score: 100,
      rag: "Green",
      ragManual: false,
      raid: { ...EMPTY_RAID },
      projects: 0,
      streams: 0,
    };
  }
  const budget = nodes.reduce((s, n) => s + n.metrics.budget, 0);
  const forecast = nodes.reduce((s, n) => s + n.metrics.forecast, 0);
  const actual = nodes.reduce((s, n) => s + n.metrics.actual, 0);
  const raid = nodes.reduce((s, n) => addRaid(s, n.metrics.raid), { ...EMPTY_RAID });
  const score =
    nodes.reduce((s, n) => s + n.metrics.score, 0) / Math.max(1, nodes.length);
  return {
    budget,
    forecast,
    actual,
    score: Math.round(score),
    rag: scoreToRag(score),
    ragManual: false,
    raid,
    projects: nodes.reduce((s, n) => s + n.metrics.projects, 0),
    streams: nodes.reduce((s, n) => s + n.metrics.streams, 0),
  };
}

function StrategicAlignmentPage() {
  const { organization, loading: authLoading, roles } = useAuth();
  const orgId = organization?.id;
  const canEdit = canEditProjects(roles);
  const envelopes = useHierarchyEnvelopes(orgId);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [openedOnce, setOpenedOnce] = useState(false);
  const [gateStatusByName, setGateStatusByName] = useState<GateStatusFilter>({});

  const {
    data: projects = [],
    isLoading: projectsLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () => {
      const wide = await supabase
        .from("projects")
        .select(`${PROJECT_PORTFOLIO_SELECT},${PROJECT_OPS_EXTRAS}` as "*");
      if (!wide.error) return sortProjectsByCodeName(wide.data ?? []);
      const { data, error: qErr } = await supabase
        .from("projects")
        .select(PROJECT_PORTFOLIO_SELECT as "*");
      if (qErr) throw qErr;
      return sortProjectsByCodeName(data ?? []);
    },
    enabled: !!orgId,
    staleTime: 15_000,
  });

  const { data: streams = [] } = useQuery({
    queryKey: ["project_streams", orgId, "alignment-tree"],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from("project_streams")
        .select(
          "id,project_id,name,code,budget,capex_approved,opex_approved,capex_incurred,opex_incurred,forecast_at_completion,rag,status,sort_order",
        )
        .eq("org_id", orgId!);
      if (qErr) throw qErr;
      return data ?? [];
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
          .select("id,project_id,stream_id,gate_name,planned_date,actual_date,status")
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 15_000,
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
    staleTime: 15_000,
  });

  const orgPhases = useMemo(
    () =>
      (gateDefs as { gate_name?: string | null }[])
        .map((d) => String(d.gate_name || "").trim())
        .filter(Boolean),
    [gateDefs],
  );

  const { data: raidRows = { risks: [], actions: [], issues: [], decisions: [] } } = useQuery({
    queryKey: ["alignment-raid", orgId],
    queryFn: async () => {
      const [risks, actions, issues, decisions] = await Promise.all([
        supabase.from("risks").select(HEALTH_ENGINE_RISKS_SELECT).eq("org_id", orgId!),
        supabase.from("actions").select("project_id,status").eq("org_id", orgId!),
        supabase.from("issues").select("project_id,status").eq("org_id", orgId!),
        (async () => {
          const full = await supabase
            .from("decisions")
            .select("project_id,status,outcome")
            .eq("org_id", orgId!);
          if (!full.error) return full;
          return supabase.from("decisions").select("project_id,status").eq("org_id", orgId!);
        })(),
      ]);
      return {
        risks: risks.data ?? [],
        actions: actions.data ?? [],
        issues: issues.data ?? [],
        decisions: decisions.data ?? [],
      };
    },
    enabled: !!orgId,
    staleTime: 15_000,
  });

  const raidByProject = useMemo(() => {
    const map = new Map<string, RaidCounts>();
    const bump = (projectId: string | null | undefined, kind: RaidKind, status: string | null) => {
      if (!projectId || !isOpenRaid(kind, status)) return;
      const cur = map.get(projectId) ?? { ...EMPTY_RAID };
      cur[kind] += 1;
      map.set(projectId, cur);
    };
    for (const r of raidRows.risks as Array<{ project_id?: string; status?: string }>) {
      bump(r.project_id, "risks", r.status ?? null);
    }
    for (const r of raidRows.actions as Array<{ project_id?: string; status?: string }>) {
      bump(r.project_id, "actions", r.status ?? null);
    }
    for (const r of raidRows.issues as Array<{ project_id?: string; status?: string }>) {
      bump(r.project_id, "issues", r.status ?? null);
    }
    for (const r of raidRows.decisions as Array<{ project_id?: string; status?: string; outcome?: string }>) {
      if (!r.project_id) continue;
      if (!isDecisionAwaiting(r) && !isOpenRaid("decisions", r.outcome || r.status || null)) continue;
      const cur = map.get(r.project_id) ?? { ...EMPTY_RAID };
      cur.decisions += 1;
      map.set(r.project_id, cur);
    }
    return map;
  }, [raidRows]);

  const gatesByProject = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const g of gates as Array<{ project_id?: string }>) {
      const pid = String(g.project_id || "");
      if (!pid) continue;
      const list = map.get(pid) ?? [];
      list.push(g as Record<string, unknown>);
      map.set(pid, list);
    }
    return map;
  }, [gates]);

  const risksByProject = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const r of raidRows.risks as Array<{ project_id?: string }>) {
      const pid = String(r.project_id || "");
      if (!pid) continue;
      const list = map.get(pid) ?? [];
      list.push(r as Record<string, unknown>);
      map.set(pid, list);
    }
    return map;
  }, [raidRows.risks]);

  const tree = useMemo(() => {
    const streamsByProject = new Map<string, StreamNode[]>();
    for (const s of streams as Array<Record<string, unknown>>) {
      const pid = String(s.project_id || "");
      if (!pid) continue;
      const rag = String(s.rag || "") || "Green";
      const node: StreamNode = {
        id: String(s.id),
        name: String(s.name || "Stream"),
        code: s.code ? String(s.code) : null,
        metrics: {
          budget: projectApprovedFunding(s as never),
          forecast: projectForecast(s as never),
          actual: projectIncurred(s as never),
          score: rag === "Green" ? 88 : rag === "Amber" ? 72 : rag === "Red" ? 50 : 80,
          rag: rag === "Green" || rag === "Amber" || rag === "Red" ? rag : "Green",
          ragManual: false,
          raid: { ...EMPTY_RAID },
          projects: 0,
          streams: 1,
        },
      };
      const list = streamsByProject.get(pid) ?? [];
      list.push(node);
      streamsByProject.set(pid, list);
    }
    for (const list of streamsByProject.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    const financeProjects = projects as Array<
      Record<string, unknown> & { portfolio?: string | null; program?: string | null }
    >;
    const alignmentApproved = childApprovedByLayer(financeProjects as never, "alignment");
    const programApproved = childApprovedByLayer(financeProjects as never, "program");

    const alignmentMap = new Map<string, Map<string, ProjectNode[]>>();
    for (const p of financeProjects) {
      const id = String(p.id);
      if (!projectMatchesGateStatusFilter(gates as never, id, gateStatusByName, p as never)) continue;
      const alignment = String(p.portfolio || "").trim() || "Unassigned";
      const program = String(p.program || "").trim() || "Unassigned";
      const health = computeProjectHealth(p as never, (gatesByProject.get(id) ?? []) as never, {
        risks: (risksByProject.get(id) ?? []) as never,
        parentEnvelopes: parentWatchesForProject(
          p,
          envelopes.index,
          alignmentApproved,
          programApproved,
        ),
      });
      const rag = effectiveRag(p as never, health.overall_rag) || health.overall_rag;
      const childStreams = streamsByProject.get(id) ?? [];
      const node: ProjectNode = {
        id,
        name: String(p.name || "Project"),
        code: p.project_code ? String(p.project_code) : null,
        streams: childStreams,
        metrics: {
          budget: projectApprovedFunding(p as never),
          forecast: projectForecast(p as never),
          actual: projectIncurred(p as never),
          score: health.health_score,
          rag,
          ragManual: isRagOverridden(p as never),
          raid: raidByProject.get(id) ?? { ...EMPTY_RAID },
          projects: 1,
          streams: childStreams.length,
        },
      };
      if (!alignmentMap.has(alignment)) alignmentMap.set(alignment, new Map());
      const programs = alignmentMap.get(alignment)!;
      const list = programs.get(program) ?? [];
      list.push(node);
      programs.set(program, list);
    }

    const preferred = [...PORTFOLIO_CATEGORIES];
    const extraAlignments = [...alignmentMap.keys()]
      .filter((k) => !preferred.includes(k as (typeof PORTFOLIO_CATEGORIES)[number]))
      .sort((a, b) => a.localeCompare(b));
    const order = [...preferred.filter((k) => alignmentMap.has(k)), ...extraAlignments];
    if (alignmentMap.has("Unassigned") && !order.includes("Unassigned")) order.push("Unassigned");

    const alignments: AlignmentNode[] = order.map((name) => {
      const programMap = alignmentMap.get(name)!;
      const programs: ProgramNode[] = [...programMap.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map((programName) => {
          const projectNodes = programMap.get(programName)!;
          const metrics = rollMetrics(projectNodes);
          const envStatus = parentEnvelopeStatus(
            lookupHierarchyEnvelope(envelopes.index, "program", programName),
            metrics.budget,
          );
          return {
            name: programName,
            projects: projectNodes,
            metrics: {
              ...metrics,
              rag: overlayParentEnvelopeRag(String(metrics.rag), envStatus),
            },
          };
        });
      const alignmentMetrics = rollMetrics(programs);
      const saEnv = lookupHierarchyEnvelope(envelopes.index, "alignment", name);
      const saVsProjects = parentEnvelopeStatus(saEnv, alignmentMetrics.budget);
      const pots = programPotsAllocated(
        programs.map((p) => p.name),
        envelopes.index,
      );
      const saVsPots = pots > 0 ? parentEnvelopeStatus(saEnv, pots) : null;
      let saRag = overlayParentEnvelopeRag(String(alignmentMetrics.rag), saVsProjects);
      if (saVsPots) saRag = worseRag(saRag, overlayParentEnvelopeRag(saRag, saVsPots));
      return {
        name,
        programs,
        metrics: {
          ...alignmentMetrics,
          rag: saRag,
        },
      };
    });
    return alignments;
  }, [
    projects,
    streams,
    raidByProject,
    gatesByProject,
    risksByProject,
    gates,
    gateStatusByName,
    envelopes.index,
  ]);

  const defaultOpen = useMemo(() => {
    const keys = new Set<string>();
    for (const sa of tree) {
      keys.add(`sa:${sa.name}`);
      for (const prog of sa.programs) {
        keys.add(`prog:${sa.name}:${prog.name}`);
        for (const proj of prog.projects) keys.add(`proj:${proj.id}`);
      }
    }
    return keys;
  }, [tree]);

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
    for (const sa of tree) {
      keys.add(`sa:${sa.name}`);
      for (const prog of sa.programs) {
        keys.add(`prog:${sa.name}:${prog.name}`);
        for (const proj of prog.projects) keys.add(`proj:${proj.id}`);
      }
    }
    setOpenedOnce(true);
    setOpen(keys);
  };

  const collapseAll = () => {
    setOpenedOnce(true);
    setOpen(new Set());
  };

  if (authLoading || (projectsLoading && !projects.length)) {
    return <PageLoading label="Loading Strategic Alignment…" fullScreen={false} />;
  }

  return (
    <PageExport name="Strategic_Alignment" title="Strategic Alignment">
      <PageHeading
        icon="🧭"
        title="Strategic Alignment"
        subtitle="Strategic Alignment → program → project → stream. Health Engine RAG, money, and open RAID on every node."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={expandAll}>
              Expand all
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={collapseAll}>
              Collapse all
            </Button>
          </div>
        }
      />

      <div className="mb-3">
        <StageGateStatusFilter
          gateNames={orgPhases}
          value={gateStatusByName}
          onChange={setGateStatusByName}
        />
      </div>

      {isError ? (
        <SectionFrame>
          <p className="text-sm text-destructive">{(error as Error)?.message || "Could not load projects."}</p>
          <Button type="button" className="mt-3" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </SectionFrame>
      ) : null}

      {!tree.length && !isError ? (
        <SectionFrame>
          <p className="text-sm text-muted-foreground">
            {projects.length
              ? "No projects match the stage gate filter."
              : "No projects in this organisation yet."}
          </p>
        </SectionFrame>
      ) : null}

      {tree.length ? (
        <SectionFrame exportName="alignment-tree" exportTitle="Strategic Alignment tree">
          <TreeLegend />
          <div className="mt-5 space-y-6">
            {tree.map((sa) => {
              const saKey = `sa:${sa.name}`;
              const saOpen = openKeys.has(saKey);
              return (
                <section
                  key={saKey}
                  className="overflow-hidden rounded-2xl border bg-card shadow-sm"
                  style={{ borderColor: "hsl(var(--border))" }}
                >
                  <div
                    className="h-1.5 w-full"
                    style={{ background: ragColor(String(sa.metrics.rag)) }}
                  />
                  <div className="px-4 py-3 sm:px-5">
                    <NodeHeader
                      level="Strategic Alignment"
                      title={sa.name}
                      metrics={sa.metrics}
                      expanded={saOpen}
                      onToggle={() => toggle(saKey)}
                      childLabel={`${sa.programs.length} program${sa.programs.length === 1 ? "" : "s"}`}
                      emphasize
                    />
                    <HierarchyEnvelopeField
                      layer="alignment"
                      name={sa.name}
                      envelope={lookupHierarchyEnvelope(envelopes.index, "alignment", sa.name)}
                      childApproved={sa.metrics.budget}
                      canEdit={canEdit}
                      onSave={(value) => envelopes.saveEnvelope("alignment", sa.name, value)}
                      peerLabel="Program pots"
                      peerAllocated={programPotsAllocated(
                        sa.programs.map((p) => p.name),
                        envelopes.index,
                      )}
                    />
                  </div>
                  {saOpen && sa.programs.length ? (
                    <div className="border-t px-3 pb-4 pt-2 sm:px-5">
                      <div className="mx-auto mb-3 h-5 w-px bg-border" />
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {sa.programs.map((prog) => {
                          const progKey = `prog:${sa.name}:${prog.name}`;
                          const progOpen = openKeys.has(progKey);
                          return (
                            <div
                              key={progKey}
                              className="relative rounded-xl border bg-background/80"
                            >
                              <div
                                className="absolute inset-y-0 left-0 w-1 rounded-l-xl"
                                style={{ background: ragColor(String(prog.metrics.rag)) }}
                              />
                              <div className="pl-3 pr-3 py-3">
                                <NodeHeader
                                  level="Program"
                                  title={prog.name}
                                  metrics={prog.metrics}
                                  expanded={progOpen}
                                  onToggle={() => toggle(progKey)}
                                  childLabel={`${prog.projects.length} project${prog.projects.length === 1 ? "" : "s"}`}
                                  to="/app/programs"
                                />
                                <HierarchyEnvelopeField
                                  layer="program"
                                  name={prog.name}
                                  envelope={lookupHierarchyEnvelope(
                                    envelopes.index,
                                    "program",
                                    prog.name,
                                  )}
                                  childApproved={prog.metrics.budget}
                                  canEdit={canEdit}
                                  onSave={(value) =>
                                    envelopes.saveEnvelope("program", prog.name, value)
                                  }
                                />
                                {progOpen && prog.projects.length ? (
                                  <div className="relative mt-3 ml-3 border-l border-border pl-4">
                                    {prog.projects.map((proj) => {
                                      const projKey = `proj:${proj.id}`;
                                      const projOpen = openKeys.has(projKey);
                                      return (
                                        <div key={proj.id} className="relative pb-3 last:pb-0">
                                          <span className="absolute -left-4 top-3 h-px w-4 bg-border" />
                                          <div className="rounded-lg border bg-card p-2.5">
                                            <NodeHeader
                                              level="Project"
                                              title={proj.name}
                                              code={proj.code}
                                              metrics={proj.metrics}
                                              expanded={projOpen}
                                              onToggle={() => toggle(projKey)}
                                              childLabel={
                                                proj.streams.length
                                                  ? `${proj.streams.length} stream${proj.streams.length === 1 ? "" : "s"}`
                                                  : "No streams"
                                              }
                                              to="/app/projects/$id"
                                              params={{ id: proj.id }}
                                              showToggle={proj.streams.length > 0}
                                              compact
                                            />
                                            {projOpen && proj.streams.length ? (
                                              <div className="mt-2 flex flex-wrap gap-1.5">
                                                {proj.streams.map((stream) => (
                                                  <Link
                                                    key={stream.id}
                                                    to="/app/projects/$id"
                                                    params={{ id: proj.id }}
                                                    search={{ tab: "streams" as const }}
                                                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/50 px-2 py-1 text-[11px] hover:bg-muted"
                                                    title={stream.name}
                                                  >
                                                    <span
                                                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                                                      style={{
                                                        background: ragColor(
                                                          String(stream.metrics.rag),
                                                        ),
                                                      }}
                                                    />
                                                    <span className="truncate font-medium">
                                                      {stream.code
                                                        ? `${stream.code} · ${stream.name}`
                                                        : stream.name}
                                                    </span>
                                                  </Link>
                                                ))}
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </div>
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
        </SectionFrame>
      ) : null}
    </PageExport>
  );
}

function TreeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
      <span className="font-semibold uppercase tracking-wide text-foreground">Read</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
        Health Engine RAG
      </span>
      <span>Score /100</span>
      <span>B budget · F forecast · A actual</span>
      <span>Optional SA / Program envelope vs child project approved funding</span>
      <span className="inline-flex items-center gap-1">
        <MarkerPill kind="R" n={0} />
        <MarkerPill kind="A" n={0} />
        <MarkerPill kind="I" n={0} />
        <MarkerPill kind="D" n={0} />
        Open RAID
      </span>
    </div>
  );
}

function MarkerPill({ kind, n }: { kind: "R" | "A" | "I" | "D"; n: number }) {
  const tone =
    kind === "R"
      ? "bg-rose-100 text-rose-800"
      : kind === "A"
        ? "bg-sky-100 text-sky-800"
        : kind === "I"
          ? "bg-amber-100 text-amber-900"
          : "bg-violet-100 text-violet-800";
  const label =
    kind === "R" ? "Open risks" : kind === "A" ? "Open actions" : kind === "I" ? "Open issues" : "Open decisions";
  return (
    <span
      title={label}
      className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${tone}`}
    >
      {kind}
      {n}
    </span>
  );
}

function NodeHeader({
  level,
  title,
  code,
  metrics,
  expanded,
  onToggle,
  childLabel,
  to,
  params,
  search,
  showToggle = true,
  compact = false,
  emphasize = false,
}: {
  level: string;
  title: string;
  code?: string | null;
  metrics: NodeMetrics;
  expanded?: boolean;
  onToggle?: () => void;
  childLabel?: string;
  to?: "/app/programs" | "/app/projects/$id";
  params?: { id: string };
  search?: { tab: "streams" };
  showToggle?: boolean;
  compact?: boolean;
  emphasize?: boolean;
}) {
  const rag = metrics.rag;
  const explanation = explainRag({
    rag: String(rag),
    score: metrics.score,
    overridden: metrics.ragManual,
    extraBullets: metrics.ragManual
      ? ["Sponsor override is shown. Health Engine score is still calculated underneath."]
      : [`Rolled or calculated score ${metrics.score}/100.`],
  });

  const titleClass = emphasize
    ? "text-base font-semibold tracking-tight hover:underline sm:text-lg"
    : "truncate text-sm font-semibold tracking-tight hover:underline";
  const titleNode =
    to === "/app/projects/$id" && params ? (
      <Link to="/app/projects/$id" params={params} search={search} className={titleClass} title={title}>
        {title}
      </Link>
    ) : to === "/app/programs" ? (
      <Link to="/app/programs" className={titleClass} title={title}>
        {title}
      </Link>
    ) : (
      <h2 className={emphasize ? "text-base font-semibold tracking-tight sm:text-lg" : "truncate text-sm font-semibold tracking-tight"} title={title}>
        {title}
      </h2>
    );

  return (
    <div className="min-w-0">
      <div className="flex items-start gap-2">
        {showToggle && onToggle ? (
          <button
            type="button"
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background hover:bg-muted"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {level}
            </span>
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: ragColor(String(rag)) }}
              title={`Health ${String(rag)}`}
            />
            <RagChip rag={String(rag)} explain={explanation} manual={metrics.ragManual} />
            <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
              {metrics.score}/100
            </span>
            {childLabel ? (
              <span className="text-[11px] text-muted-foreground">· {childLabel}</span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
            {titleNode}
            {code ? <span className="font-mono text-[10px] text-muted-foreground">{code}</span> : null}
          </div>
        </div>
      </div>

      <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "mt-1.5" : "mt-2"} ${showToggle && onToggle ? "pl-9" : ""}`}>
        <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums" title="Budget">
          B {money(metrics.budget)}
        </span>
        <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums" title="Forecast">
          F {money(metrics.forecast)}
        </span>
        <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums" title="Actual">
          A {money(metrics.actual)}
        </span>
        <MarkerPill kind="R" n={metrics.raid.risks} />
        <MarkerPill kind="A" n={metrics.raid.actions} />
        <MarkerPill kind="I" n={metrics.raid.issues} />
        <MarkerPill kind="D" n={metrics.raid.decisions} />
      </div>
    </div>
  );
}
