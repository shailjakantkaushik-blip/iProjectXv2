import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { HEALTH_ENGINE_RISKS_SELECT, PROJECT_PORTFOLIO_SELECT } from "@/lib/query-selects";
import { PROJECT_OPS_EXTRAS } from "@/lib/project-selects";
import { sortProjectsByCodeName } from "@/lib/project-sort";
import { useAuth } from "@/lib/auth-context";
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

function raidTotal(r: RaidCounts) {
  return r.risks + r.actions + r.issues + r.decisions;
}

function StrategicAlignmentPage() {
  const { organization, loading: authLoading } = useAuth();
  const orgId = organization?.id;
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [openedOnce, setOpenedOnce] = useState(false);

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

    const alignmentMap = new Map<string, Map<string, ProjectNode[]>>();
    for (const p of projects as Array<Record<string, unknown>>) {
      const alignment = String(p.portfolio || "").trim() || "Unassigned";
      const program = String(p.program || "").trim() || "Unassigned";
      const id = String(p.id);
      const health = computeProjectHealth(p as never, (gatesByProject.get(id) ?? []) as never, {
        risks: (risksByProject.get(id) ?? []) as never,
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
          return {
            name: programName,
            projects: projectNodes,
            metrics: rollMetrics(projectNodes),
          };
        });
      return {
        name,
        programs,
        metrics: rollMetrics(programs),
      };
    });
    return alignments;
  }, [projects, streams, raidByProject, gatesByProject, risksByProject]);

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
        subtitle="Family tree from Strategic Alignment to programs, projects, and streams. Markers on each card are Health Engine RAG, money, and open RAID."
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
          <p className="text-sm text-muted-foreground">No projects in this organisation yet.</p>
        </SectionFrame>
      ) : null}

      {tree.length ? (
        <SectionFrame exportName="alignment-tree" exportTitle="Strategic Alignment tree">
          <TreeLegend />
          <div className="sa-org mt-4 overflow-x-auto pb-8">
            <ul>
              {tree.map((sa) => {
                const saKey = `sa:${sa.name}`;
                const saOpen = openKeys.has(saKey);
                return (
                  <li key={saKey}>
                    <HierarchyCard
                      level="Strategic Alignment"
                      title={sa.name}
                      metrics={sa.metrics}
                      expanded={saOpen}
                      onToggle={() => toggle(saKey)}
                      childLabel={`${sa.programs.length} program${sa.programs.length === 1 ? "" : "s"}`}
                    />
                    {saOpen && sa.programs.length ? (
                      <ul>
                        {sa.programs.map((prog) => {
                          const progKey = `prog:${sa.name}:${prog.name}`;
                          const progOpen = openKeys.has(progKey);
                          return (
                            <li key={progKey}>
                              <HierarchyCard
                                level="Program"
                                title={prog.name}
                                metrics={prog.metrics}
                                expanded={progOpen}
                                onToggle={() => toggle(progKey)}
                                childLabel={`${prog.projects.length} project${prog.projects.length === 1 ? "" : "s"}`}
                                to="/app/programs"
                              />
                              {progOpen && prog.projects.length ? (
                                <ul>
                                  {prog.projects.map((proj) => {
                                    const projKey = `proj:${proj.id}`;
                                    const projOpen = openKeys.has(projKey);
                                    return (
                                      <li key={proj.id}>
                                        <HierarchyCard
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
                                        />
                                        {projOpen && proj.streams.length ? (
                                          <ul>
                                            {proj.streams.map((stream) => (
                                              <li key={stream.id}>
                                                <HierarchyCard
                                                  level="Stream"
                                                  title={stream.name}
                                                  code={stream.code}
                                                  metrics={stream.metrics}
                                                  to="/app/projects/$id"
                                                  params={{ id: proj.id }}
                                                  search={{ tab: "streams" as const }}
                                                  showToggle={false}
                                                  raidUnavailable
                                                />
                                              </li>
                                            ))}
                                          </ul>
                                        ) : null}
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
          <OrgTreeStyles />
        </SectionFrame>
      ) : null}
    </PageExport>
  );
}

function TreeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
      <span className="font-semibold uppercase tracking-wide text-foreground">Markers</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
        Health Engine RAG
      </span>
      <span>Score /100</span>
      <span>B budget · F forecast · A actual</span>
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

function HierarchyCard({
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
  raidUnavailable = false,
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
  raidUnavailable?: boolean;
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

  const titleClass = "block max-w-[200px] truncate text-sm font-semibold tracking-tight hover:underline";
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
      <h2 className="max-w-[200px] truncate text-sm font-semibold tracking-tight" title={title}>
        {title}
      </h2>
    );

  return (
    <div
      className="relative z-[1] w-[232px] rounded-xl border bg-card p-2.5 text-left shadow-sm"
      style={{ borderTopWidth: 4, borderTopColor: ragColor(String(rag)) }}
    >
      <div className="flex items-start gap-1.5">
        {showToggle && onToggle ? (
          <button
            type="button"
            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-background"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{level}</span>
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: ragColor(String(rag)) }}
              title={`Health ${String(rag)}`}
            />
            <RagChip rag={String(rag)} explain={explanation} manual={metrics.ragManual} />
            <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{metrics.score}</span>
          </div>
          <div className="mt-0.5">{titleNode}</div>
          {code ? <div className="font-mono text-[10px] text-muted-foreground">{code}</div> : null}
          {childLabel ? <div className="text-[10px] text-muted-foreground">{childLabel}</div> : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums" title="Budget">
          B {money(metrics.budget)}
        </span>
        <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums" title="Forecast">
          F {money(metrics.forecast)}
        </span>
        <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums" title="Actual">
          A {money(metrics.actual)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {raidUnavailable ? (
          <span className="text-[10px] text-muted-foreground">RAID on the project</span>
        ) : (
          <>
            <MarkerPill kind="R" n={metrics.raid.risks} />
            <MarkerPill kind="A" n={metrics.raid.actions} />
            <MarkerPill kind="I" n={metrics.raid.issues} />
            <MarkerPill kind="D" n={metrics.raid.decisions} />
            <span className="text-[10px] text-muted-foreground">{raidTotal(metrics.raid)} open</span>
          </>
        )}
      </div>
    </div>
  );
}

function OrgTreeStyles() {
  return (
    <style>{`
      .sa-org ul {
        display: flex;
        justify-content: center;
        padding-top: 28px;
        position: relative;
        margin: 0;
      }
      .sa-org li {
        display: flex;
        flex-direction: column;
        align-items: center;
        position: relative;
        padding: 28px 12px 0;
        list-style: none;
      }
      .sa-org li::before,
      .sa-org li::after {
        content: "";
        position: absolute;
        top: 0;
      }
      .sa-org li::before {
        left: 50%;
        height: 28px;
        border-left: 2px solid hsl(var(--border));
      }
      .sa-org li::after {
        left: 0;
        width: 100%;
        border-top: 2px solid hsl(var(--border));
      }
      .sa-org li:first-child::after {
        left: 50%;
        width: 50%;
      }
      .sa-org li:last-child::after {
        width: 50%;
      }
      .sa-org li:only-child::after {
        display: none;
      }
      .sa-org > ul {
        padding-top: 0;
      }
      .sa-org > ul > li::before,
      .sa-org > ul > li::after {
        display: none;
      }
    `}</style>
  );
}
