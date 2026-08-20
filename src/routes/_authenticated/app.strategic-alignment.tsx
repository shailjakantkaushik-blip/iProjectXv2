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
      for (const prog of sa.programs) keys.add(`prog:${sa.name}:${prog.name}`);
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
        subtitle="Hierarchy from Strategic Alignment to programs, projects, and streams. Each card shows calculated health, money, and open RAID counts."
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

      <div className="space-y-3">
        {tree.map((sa) => {
          const saKey = `sa:${sa.name}`;
          const saOpen = openKeys.has(saKey);
          return (
            <SectionFrame key={saKey} exportName={`sa-${sa.name}`} exportTitle={sa.name}>
              <HierarchyCard
                level="Strategic Alignment"
                title={sa.name}
                metrics={sa.metrics}
                expanded={saOpen}
                onToggle={() => toggle(saKey)}
                childLabel={`${sa.programs.length} program${sa.programs.length === 1 ? "" : "s"}`}
              />
              {saOpen ? (
                <div className="mt-3 space-y-2 border-l-2 border-border/70 pl-3 sm:pl-4">
                  {sa.programs.map((prog) => {
                    const progKey = `prog:${sa.name}:${prog.name}`;
                    const progOpen = openKeys.has(progKey);
                    return (
                      <div key={progKey}>
                        <HierarchyCard
                          level="Program"
                          title={prog.name}
                          metrics={prog.metrics}
                          expanded={progOpen}
                          onToggle={() => toggle(progKey)}
                          childLabel={`${prog.projects.length} project${prog.projects.length === 1 ? "" : "s"}`}
                          to="/app/programs"
                        />
                        {progOpen ? (
                          <div className="mt-2 space-y-2 border-l-2 border-border/50 pl-3 sm:pl-4">
                            {prog.projects.map((proj) => {
                              const projKey = `proj:${proj.id}`;
                              const projOpen = openKeys.has(projKey);
                              return (
                                <div key={proj.id}>
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
                                    <div className="mt-2 space-y-2 border-l-2 border-border/40 pl-3 sm:pl-4">
                                      {proj.streams.map((stream) => (
                                        <HierarchyCard
                                          key={stream.id}
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
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </SectionFrame>
          );
        })}
      </div>
    </PageExport>
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

  const titleClass = "text-base font-semibold tracking-tight hover:underline";
  const titleNode =
    to === "/app/projects/$id" && params ? (
      <Link to="/app/projects/$id" params={params} search={search} className={titleClass}>
        {title}
      </Link>
    ) : to === "/app/programs" ? (
      <Link to="/app/programs" className={titleClass}>
        {title}
      </Link>
    ) : (
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
    );

  return (
    <div
      className="rounded-xl border bg-card/80 p-3 shadow-sm sm:p-3.5"
      style={{ borderLeftWidth: 4, borderLeftColor: ragColor(String(rag)) }}
    >
      <div className="flex flex-wrap items-start gap-2 sm:gap-3">
        {showToggle && onToggle ? (
          <button
            type="button"
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {level}
            </span>
            <RagChip rag={String(rag)} explain={explanation} manual={metrics.ragManual} />
            <span className="text-xs tabular-nums text-muted-foreground">{metrics.score}/100</span>
            {childLabel ? <span className="text-xs text-muted-foreground">{childLabel}</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {titleNode}
            {code ? <span className="font-mono text-xs text-muted-foreground">{code}</span> : null}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Budget" value={money(metrics.budget)} />
        <Metric label="Forecast" value={money(metrics.forecast)} />
        <Metric label="Actual" value={money(metrics.actual)} />
        <div className="rounded-lg border bg-background/70 px-2.5 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">RAID</div>
          {raidUnavailable ? (
            <div className="mt-1 text-sm text-muted-foreground">On the project</div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-semibold tabular-nums">
              <span title="Open risks">R {metrics.raid.risks}</span>
              <span title="Open actions">A {metrics.raid.actions}</span>
              <span title="Open issues">I {metrics.raid.issues}</span>
              <span title="Open decisions">D {metrics.raid.decisions}</span>
              <span className="text-muted-foreground">· {raidTotal(metrics.raid)} open</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/70 px-2.5 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
