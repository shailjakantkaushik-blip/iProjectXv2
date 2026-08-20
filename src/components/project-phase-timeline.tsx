import { Link } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeTimelineBounds } from "@/components/portfolio-timeline";
import { ExpandablePanel } from "@/components/expandable-panel";
import { PageLoading } from "@/components/page-loading";
import { SectionFrame, SectionTitle } from "@/components/streamlit";
import { fyLabel } from "@/lib/fiscal-year";
import {
  isActiveGateStatus,
  isDoneGateStatus,
  isRejectedGateStatus,
  sortGatesByOrgOrder,
} from "@/lib/project-phase";
import {
  fetchProjectStreams,
  formatStreamCode,
  formatStreamLabel,
  gatesForTimelineLane,
} from "@/lib/project-streams";
import {
  loadForecastPhases,
  parseForecastPhaseNotes,
  type ForecastPhaseRow,
} from "@/lib/project-forecast";
import { STAGE_GATES_SELECT } from "@/lib/query-selects";

const PHASE_COLORS = [
  "#64748b",
  "#60a5fa",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#0ea5e9",
  "#a855f7",
  "#15803d",
];

function iso(v?: string | null) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type PhaseSeg = {
  name: string;
  start: string | null;
  end: string | null;
  status: string | null;
  current: boolean;
  done: boolean;
  rejected: boolean;
};

function statusFill(seg: PhaseSeg, index: number) {
  if (seg.rejected) return "#ef4444";
  if (seg.done) return "#22c55e";
  if (seg.current) return "#f59e0b";
  return PHASE_COLORS[index % PHASE_COLORS.length];
}

export function ProjectPhaseTimeline({
  projectId,
  project,
  orgId,
  fyStartMonth = 4,
}: {
  projectId: string;
  project: {
    name?: string | null;
    project_code?: string | null;
    delivery_method_id?: string | null;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  };
  orgId: string;
  fyStartMonth?: number;
}) {
  const streamsQ = useQuery({
    queryKey: ["project_streams", orgId, projectId],
    queryFn: () => fetchProjectStreams(projectId),
    enabled: !!projectId,
  });

  const gatesQ = useQuery({
    queryKey: ["stage_gates", orgId, projectId, "phase-timeline"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gates")
        .select(STAGE_GATES_SELECT as "*")
        .eq("project_id", projectId)
        .order("planned_date");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });

  const defsQ = useQuery({
    queryKey: ["stage_gate_definitions", orgId, project.delivery_method_id],
    queryFn: async () => {
      let q = supabase
        .from("stage_gate_definitions")
        .select("gate_name,sort_order,delivery_method_id")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (project.delivery_method_id) q = q.eq("delivery_method_id", project.delivery_method_id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const forecastQ = useQuery({
    queryKey: ["project_forecasts", projectId, "phase-timeline"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_forecasts" as never)
        .select("id,notes")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error)
        return {
          id: null as string | null,
          notes: null as unknown,
          phases: [] as ForecastPhaseRow[],
        };
      const row = data as { id?: string | null; notes?: unknown } | null;
      if (!row?.id) return { id: null, notes: null, phases: [] as ForecastPhaseRow[] };
      let phases = await loadForecastPhases(row.id);
      if (!phases.length) phases = parseForecastPhaseNotes(row.notes);
      return { id: row.id, notes: row.notes, phases };
    },
    enabled: !!projectId,
  });

  const streams = streamsQ.data ?? [];
  const gates = (gatesQ.data ?? []) as Array<{
    project_id: string;
    stream_id?: string | null;
    gate_name?: string | null;
    planned_date?: string | null;
    actual_date?: string | null;
    status?: string | null;
  }>;
  const orgPhases = useMemo(
    () =>
      (defsQ.data ?? [])
        .map((d: { gate_name?: string | null }) => String(d.gate_name || "").trim())
        .filter(Boolean),
    [defsQ.data],
  );

  const lanes = useMemo(() => {
    const forecastByStream = new Map<string, ForecastPhaseRow[]>();
    for (const p of forecastQ.data?.phases ?? []) {
      const key = p.stream_id || "__default";
      const list = forecastByStream.get(key) ?? [];
      list.push(p);
      forecastByStream.set(key, list);
    }

    return streams.map((stream) => {
      const streamGates = sortGatesByOrgOrder(
        gatesForTimelineLane(
          {
            id: stream.id,
            project_id: projectId,
            stream_id: stream.id,
            is_stream_lane: true,
            is_default: Boolean(stream.is_default),
          },
          gates,
        ),
        orgPhases,
      );
      const forecast =
        forecastByStream.get(stream.id) ||
        (stream.is_default ? forecastByStream.get("__default") : undefined) ||
        [];
      const forecastByName = new Map(forecast.map((p) => [p.gate_name, p]));

      const names: string[] = [];
      const seen = new Set<string>();
      for (const n of orgPhases) {
        if (!seen.has(n)) {
          names.push(n);
          seen.add(n);
        }
      }
      for (const g of streamGates) {
        const n = String(g.gate_name || "").trim();
        if (n && !seen.has(n)) {
          names.push(n);
          seen.add(n);
        }
      }
      for (const p of forecast) {
        if (p.gate_name && !seen.has(p.gate_name)) {
          names.push(p.gate_name);
          seen.add(p.gate_name);
        }
      }

      const segs: PhaseSeg[] = names.map((name, i) => {
        const gate = streamGates.find((g) => String(g.gate_name || "").trim() === name);
        const plan = forecastByName.get(name);
        const nextName = names[i + 1];
        const nextGate = nextName
          ? streamGates.find((g) => String(g.gate_name || "").trim() === nextName)
          : undefined;
        const nextPlan = nextName ? forecastByName.get(nextName) : undefined;
        const start =
          iso(plan?.start_date) ||
          iso(gate?.planned_date) ||
          (i === 0 ? iso(stream.planned_start_date) : null);
        const end =
          iso(plan?.end_date) ||
          (iso(nextPlan?.start_date) ? addDays(iso(nextPlan?.start_date)!, -1) : null) ||
          (iso(nextGate?.planned_date) ? addDays(iso(nextGate?.planned_date)!, -1) : null) ||
          iso(stream.planned_end_date);
        const status = gate?.status || null;
        return {
          name,
          start,
          end: start && end && end < start ? start : end,
          status,
          current: isActiveGateStatus(status),
          done: isDoneGateStatus(status),
          rejected: isRejectedGateStatus(status),
        };
      });

      return {
        id: stream.id,
        label: formatStreamLabel(stream),
        code: formatStreamCode(stream),
        segs,
      };
    });
  }, [streams, gates, orgPhases, forecastQ.data, projectId]);

  const dated = lanes.flatMap((lane) =>
    lane.segs
      .filter((s) => s.start && s.end)
      .map((s) => ({ start_date: s.start, end_date: s.end })),
  );
  const bounds = computeTimelineBounds(dated, "All", fyStartMonth);
  const { start: rangeStart, totalMs, months, fyGroups } = bounds;
  const monthCount = months.length || 1;

  const pct = (value?: string | null) => {
    if (!value || !totalMs) return 0;
    const t = new Date(`${value}T00:00:00`).getTime();
    return Math.max(0, Math.min(100, ((t - rangeStart.getTime()) / totalMs) * 100));
  };

  if (streamsQ.isLoading || gatesQ.isLoading) {
    return <PageLoading label="Loading phase timeline…" fullScreen={false} />;
  }

  if (!streams.length) {
    return (
      <SectionFrame>
        <SectionTitle>Phase timeline</SectionTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          No streams on this project yet. Add Core (or more streams) on the Streams tab, then plan
          phases on{" "}
          <Link to="/app/project-forecast" className="font-medium text-primary hover:underline">
            Project Estimation Planning
          </Link>
          .
        </p>
      </SectionFrame>
    );
  }

  const hasDates = dated.length > 0;

  const legend: ReactNode = (
    <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-4 rounded-sm bg-emerald-500" /> Approved / done
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-4 rounded-sm bg-amber-500" /> In progress
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-4 rounded-sm bg-rose-500" /> Rejected
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-4 rounded-sm bg-sky-500" /> Planned
      </span>
    </div>
  );

  const toolbar: ReactNode = (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <Link to="/app/project-forecast" className="font-medium text-primary hover:underline">
        Edit phase plan
      </Link>
      <Link
        to="/app/projects/$id"
        params={{ id: projectId }}
        search={{ tab: "streams" }}
        className="font-medium text-primary hover:underline"
      >
        Streams
      </Link>
    </div>
  );

  return (
    <SectionFrame exportName="phase-timeline" exportTitle="Phase timeline">
      <ExpandablePanel
        title="Phase timeline by stream"
        toolbar={toolbar}
        compactMaxHeightClass="max-h-[min(72vh,820px)]"
      >
        <p className="text-sm text-muted-foreground">
          One row per phase, grouped by stream. Bars use plan dates from Estimation Planning when
          set, otherwise stage-gate planned dates. Colour follows gate status when live.
        </p>
        <div className="mt-3">{legend}</div>

        {!hasDates ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No phase dates yet. Set the project start and phase durations on{" "}
            <Link to="/app/project-forecast" className="font-medium text-primary hover:underline">
              Project Estimation Planning
            </Link>
            , or add planned dates on stage gates.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="flex text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <div className="w-48 shrink-0" />
                <div
                  className="grid flex-1"
                  style={{ gridTemplateColumns: `repeat(${monthCount}, minmax(0, 1fr))` }}
                >
                  {fyGroups.map((g) => (
                    <div
                      key={g.fy}
                      className="border-l border-border px-1 first:border-l-0"
                      style={{ gridColumn: `span ${g.span}` }}
                    >
                      {g.fy}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mb-2 flex text-[10px] text-muted-foreground">
                <div className="w-48 shrink-0 pr-2">Phase</div>
                <div
                  className="grid flex-1"
                  style={{ gridTemplateColumns: `repeat(${monthCount}, minmax(0, 1fr))` }}
                >
                  {months.map((m) => (
                    <div
                      key={m.key}
                      className="truncate border-l border-border/60 px-0.5 first:border-l-0"
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-6">
                {lanes.map((lane) => (
                  <div key={lane.id}>
                    <div className="mb-2 flex items-baseline gap-2 border-b border-border/70 pb-1">
                      <span className="text-xs font-semibold tracking-tight" title={lane.label}>
                        {lane.label}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {lane.code}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {lane.segs.length} phase{lane.segs.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {lane.segs.length ? (
                        lane.segs.map((seg, i) => {
                          const left = pct(seg.start);
                          const right = pct(seg.end);
                          const width = Math.max(1.6, right - left);
                          const datedSeg = Boolean(seg.start && seg.end);
                          return (
                            <div key={`${lane.id}-${seg.name}`} className="flex items-center gap-2">
                              <div className="w-48 shrink-0 pr-1">
                                <div className="truncate text-[11px] font-medium" title={seg.name}>
                                  {seg.name}
                                </div>
                                <div className="truncate text-[10px] text-muted-foreground">
                                  {seg.status || "Pending"}
                                  {datedSeg ? ` · ${seg.start} → ${seg.end}` : ""}
                                </div>
                              </div>
                              <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-muted/45">
                                <div
                                  className="pointer-events-none absolute inset-0 grid"
                                  style={{
                                    gridTemplateColumns: `repeat(${monthCount}, minmax(0, 1fr))`,
                                  }}
                                >
                                  {months.map((m) => (
                                    <div
                                      key={m.key}
                                      className="border-l border-border/40 first:border-l-0"
                                    />
                                  ))}
                                </div>
                                {datedSeg ? (
                                  <div
                                    className="absolute top-1.5 h-5 overflow-hidden rounded-sm text-[9px] font-semibold text-white"
                                    style={{
                                      left: `${left}%`,
                                      width: `${width}%`,
                                      background: statusFill(seg, i),
                                      boxShadow: seg.current
                                        ? "inset 0 0 0 2px rgba(15,23,42,0.55)"
                                        : undefined,
                                      opacity: seg.done || seg.current || seg.rejected ? 1 : 0.88,
                                    }}
                                    title={`${seg.name}: ${seg.start} → ${seg.end}${seg.status ? ` · ${seg.status}` : ""}`}
                                  >
                                    <span className="block truncate px-1 leading-5">
                                      {seg.name}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="absolute inset-y-0 left-2 flex items-center text-[10px] text-muted-foreground">
                                    No dates
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="pl-1 text-[11px] text-muted-foreground">
                          No phases on this stream.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Window {fyLabel(bounds.start, fyStartMonth)}–{fyLabel(bounds.end, fyStartMonth)} ·{" "}
                {months[0]?.label} {months[0]?.year} → {months[months.length - 1]?.label}{" "}
                {months[months.length - 1]?.year}
              </p>
            </div>
          </div>
        )}
      </ExpandablePanel>
    </SectionFrame>
  );
}
