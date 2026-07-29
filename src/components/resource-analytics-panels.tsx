import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildAllocationPva,
  entryHours,
  normMonth,
  type AllocationPlanRow,
  type PvaGrain,
  type TimesheetEffortRow,
} from "@/lib/resource-allocation-analytics";
import {
  buildWorkItemDemandSlices,
  type WorkItemAssigneeLink,
  type WorkItemDemandSlice,
  type WorkItemPlanInput,
} from "@/lib/work-item-fte-plan";
import { useCapabilityPermission } from "@/lib/permissions";
import { formatStreamLabel } from "@/lib/project-streams";
import { compareProjectsByCodeName } from "@/lib/project-options";

const money = (n: number) =>
  "$" +
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

const STATUS_COLOR = {
  Over: "text-red-600",
  Optimal: "text-green-600",
  Under: "text-amber-600",
  Unplanned: "text-violet-600",
} as const;

/** YYYY-MM from period_month / week_start. */
function monthKey(v: string | null | undefined): string {
  const m = normMonth(v);
  return m ? m.slice(0, 7) : "";
}

function formatMonthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, mo] = ym.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function inMonthRange(period: string | null | undefined, from: string, to: string): boolean {
  const m = monthKey(period);
  if (!m) return from === "all" && to === "all";
  if (from !== "all" && m < from) return false;
  if (to !== "all" && m > to) return false;
  return true;
}

type Props = {
  mode: "pva" | "cost";
  projects: Array<{
    id: string;
    name?: string | null;
    project_code?: string | null;
    program?: string | null;
    portfolio?: string | null;
  }>;
  resources: Array<{
    id: string;
    name: string;
    capacity_hours_week?: number | null;
    cost_rate?: number | null;
    user_id?: string | null;
  }>;
  allocations: AllocationPlanRow[];
};

export function ResourceAnalyticsPanels({ mode, projects, resources, allocations }: Props) {
  const { organization } = useAuth();
  const { canEdit: canViewCost } = useCapabilityPermission("timesheet_cost_view");
  const [grain, setGrain] = useState<PvaGrain>(mode === "cost" ? "resource" : "stage_gate");
  const [projectFilter, setProjectFilter] = useState("all");
  const [streamFilter, setStreamFilter] = useState("all");
  const [gateFilter, setGateFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [monthFrom, setMonthFrom] = useState("all");
  const [monthTo, setMonthTo] = useState("all");
  const [periodReady, setPeriodReady] = useState(false);

  const showCost = mode === "cost" || canViewCost;
  const visibleProjectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);

  const { data: streams = [] } = useQuery({
    queryKey: ["project_streams", organization?.id, "res-analytics"],
    queryFn: async () =>
      (
        await supabase
          .from("project_streams")
          .select("id,project_id,name,code,is_default,sort_order")
          .order("sort_order")
      ).data ?? [],
    enabled: !!organization,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", organization?.id, "res-analytics"],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gates")
          .select("id,project_id,stream_id,gate_name,planned_date")
          .order("planned_date")
      ).data ?? [],
    enabled: !!organization,
  });

  const { data: workItems = [] } = useQuery({
    queryKey: ["work_items", organization?.id, "res-analytics"],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_items" as any)
        .select(
          "id,project_id,stream_id,stage_gate_id,estimate_hours,planned_start,planned_end,status,owner_user_id",
        );
      return (data ?? []) as unknown as WorkItemPlanInput[];
    },
    enabled: !!organization,
  });

  const { data: workItemAssignees = [] } = useQuery({
    queryKey: ["work_item_assignees", organization?.id, "res-analytics"],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_item_assignees" as any)
        .select("work_item_id,resource_id");
      return (data ?? []) as unknown as WorkItemAssigneeLink[];
    },
    enabled: !!organization,
  });

  const { data: actualRows = [] } = useQuery({
    queryKey: ["timesheet_effort", organization?.id, "res-analytics"],
    queryFn: async () => {
      const { data: sheets, error } = await (supabase as any)
        .from("timesheets")
        .select("id,resource_id,week_start,status")
        .eq("status", "approved");
      if (error) throw error;
      const ids = ((sheets ?? []) as any[]).map((s) => s.id);
      if (!ids.length) return [] as TimesheetEffortRow[];
      const sheetById = new Map<string, any>(((sheets ?? []) as any[]).map((s) => [s.id, s]));
      const { data: entries, error: e2 } = await (supabase as any)
        .from("timesheet_entries")
        .select(
          "timesheet_id,project_id,stream_id,stage_gate_id,billable,labor_cost,hours_mon,hours_tue,hours_wed,hours_thu,hours_fri,hours_sat,hours_sun",
        )
        .in("timesheet_id", ids);
      if (e2) throw e2;
      return ((entries ?? []) as any[]).map((e) => {
        const ts = sheetById.get(e.timesheet_id) as any;
        const weekStart = ts?.week_start ? String(ts.week_start).slice(0, 10) : null;
        return {
          resource_id: ts?.resource_id ?? null,
          project_id: e.project_id,
          stream_id: e.stream_id,
          stage_gate_id: e.stage_gate_id,
          period_month: normMonth(weekStart),
          week_start: weekStart,
          hours: entryHours(e),
          labor_cost: Number(e.labor_cost) || 0,
          billable: e.billable !== false,
        } as TimesheetEffortRow;
      });
    },
    enabled: !!organization,
  });

  const demandSlices = useMemo(
    () =>
      buildWorkItemDemandSlices({
        workItems,
        assignees: workItemAssignees,
        resources,
      }),
    [workItems, workItemAssignees, resources],
  );

  const monthOptions = useMemo(() => {
    const s = new Set<string>();
    for (const a of allocations) {
      const m = monthKey(a.period_month);
      if (m) s.add(m);
    }
    for (const a of actualRows) {
      const m = monthKey(a.period_month || a.week_start);
      if (m) s.add(m);
    }
    for (const d of demandSlices) {
      const m = monthKey(d.period_month);
      if (m) s.add(m);
    }
    return Array.from(s).sort();
  }, [allocations, actualRows, demandSlices]);

  // Default period: last 6 months with data (or all if fewer)
  useEffect(() => {
    if (periodReady || monthOptions.length === 0) return;
    const from = monthOptions[Math.max(0, monthOptions.length - 6)];
    const to = monthOptions[monthOptions.length - 1];
    setMonthFrom(from);
    setMonthTo(to);
    setPeriodReady(true);
  }, [monthOptions, periodReady]);

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const projectsOrdered = useMemo(() => [...projects].sort(compareProjectsByCodeName), [projects]);
  const resourcesOrdered = useMemo(
    () => [...resources].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [resources],
  );
  const resourceNames = useMemo(
    () => new Map(resources.map((r) => [r.id, r.name])),
    [resources],
  );
  const capacityByResource = useMemo(
    () => new Map(resources.map((r) => [r.id, Number(r.capacity_hours_week) || 40])),
    [resources],
  );
  const streamLabels = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of streams as any[]) m.set(s.id, formatStreamLabel(s));
    return m;
  }, [streams]);
  const gateLabels = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of gates as any[]) m.set(g.id, g.gate_name || "Gate");
    return m;
  }, [gates]);

  /** gate_name → all stage_gate ids with that name in the current project/stream scope */
  const gateIdsByName = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const g of gates as any[]) {
      if (!visibleProjectIds.has(g.project_id)) continue;
      if (projectFilter !== "all" && g.project_id !== projectFilter) continue;
      if (streamFilter !== "all" && (g.stream_id || null) !== streamFilter) continue;
      const name = String(g.gate_name || "Gate").trim() || "Gate";
      const list = m.get(name) || [];
      list.push(g.id);
      m.set(name, list);
    }
    return m;
  }, [gates, visibleProjectIds, projectFilter, streamFilter]);

  const streamsForFilter = useMemo(() => {
    const list = (streams as any[]).filter(
      (s) =>
        visibleProjectIds.has(s.project_id) &&
        (projectFilter === "all" || s.project_id === projectFilter),
    );
    return list.sort((a, b) =>
      formatStreamLabel(a).localeCompare(formatStreamLabel(b), undefined, { sensitivity: "base" }),
    );
  }, [streams, visibleProjectIds, projectFilter]);

  /** Unique stage gate names for the filter (dual-stream projects otherwise repeat Build, etc.). */
  const gatesForFilter = useMemo(() => {
    return [...gateIdsByName.keys()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [gateIdsByName]);

  /** Ids that match the selected unique gate name (all streams / projects with that phase). */
  const selectedGateIds = useMemo(() => {
    if (gateFilter === "all") return null as Set<string> | null;
    return new Set(gateIdsByName.get(gateFilter) || []);
  }, [gateFilter, gateIdsByName]);

  const matchesGateFilter = (stageGateId: string | null | undefined) => {
    if (!selectedGateIds) return true;
    if (!stageGateId) return false;
    if (selectedGateIds.has(stageGateId)) return true;
    // Safety: also match by label if id set was empty/stale
    return gateLabels.get(stageGateId) === gateFilter;
  };

  /** Scope to projects the caller can see (RLS / project visibility). */
  const scopedPlans = useMemo(
    () =>
      allocations.filter(
        (a: AllocationPlanRow) => !a.project_id || visibleProjectIds.has(a.project_id),
      ),
    [allocations, visibleProjectIds],
  );

  const scopedActuals = useMemo(
    () =>
      actualRows.filter((a: TimesheetEffortRow) => {
        if (a.billable === false) return false;
        if (!a.project_id) return grain === "resource" || grain === "month";
        return visibleProjectIds.has(a.project_id);
      }),
    [actualRows, visibleProjectIds, grain],
  );

  const scopedDemand = useMemo(
    () =>
      demandSlices.filter((d: WorkItemDemandSlice) => {
        if (!d.project_id) return grain === "resource" || grain === "month";
        return visibleProjectIds.has(d.project_id);
      }),
    [demandSlices, visibleProjectIds, grain],
  );

  const filteredPlans = useMemo(() => {
    return scopedPlans.filter((a: AllocationPlanRow) => {
      if (projectFilter !== "all" && a.project_id !== projectFilter) return false;
      if (streamFilter !== "all" && (a.stream_id || null) !== streamFilter) return false;
      if (!matchesGateFilter(a.stage_gate_id)) return false;
      if (resourceFilter !== "all" && a.resource_id !== resourceFilter) return false;
      if (!inMonthRange(a.period_month, monthFrom, monthTo)) return false;
      return true;
    });
  }, [scopedPlans, projectFilter, streamFilter, resourceFilter, monthFrom, monthTo, selectedGateIds, gateFilter, gateLabels]);

  const filteredActuals = useMemo(() => {
    return scopedActuals.filter((a: TimesheetEffortRow) => {
      if (projectFilter !== "all" && a.project_id !== projectFilter) return false;
      if (streamFilter !== "all" && (a.stream_id || null) !== streamFilter) return false;
      if (!matchesGateFilter(a.stage_gate_id)) return false;
      if (resourceFilter !== "all" && a.resource_id !== resourceFilter) return false;
      if (!inMonthRange(a.period_month || a.week_start, monthFrom, monthTo)) return false;
      return true;
    });
  }, [scopedActuals, projectFilter, streamFilter, resourceFilter, monthFrom, monthTo, selectedGateIds, gateFilter, gateLabels]);

  const filteredDemand = useMemo(() => {
    return scopedDemand.filter((d: WorkItemDemandSlice) => {
      if (projectFilter !== "all" && d.project_id !== projectFilter) return false;
      if (streamFilter !== "all" && (d.stream_id || null) !== streamFilter) return false;
      if (!matchesGateFilter(d.stage_gate_id)) return false;
      if (resourceFilter !== "all" && d.resource_id !== resourceFilter) return false;
      if (!inMonthRange(d.period_month, monthFrom, monthTo)) return false;
      return true;
    });
  }, [scopedDemand, projectFilter, streamFilter, resourceFilter, monthFrom, monthTo, selectedGateIds, gateFilter, gateLabels]);

  const rows = useMemo(
    () =>
      buildAllocationPva({
        grain,
        plans: filteredPlans,
        actuals: filteredActuals,
        demand: filteredDemand,
        projectsById,
        resourceNames,
        streamLabels,
        gateLabels,
        capacityByResource,
      }),
    [
      grain,
      filteredPlans,
      filteredActuals,
      filteredDemand,
      projectsById,
      resourceNames,
      streamLabels,
      gateLabels,
      capacityByResource,
    ],
  );

  const totAlloc = rows.reduce((s, r) => s + r.planned_hours, 0);
  const totDemand = rows.reduce((s, r) => s + r.demand_hours, 0);
  const totAct = rows.reduce((s, r) => s + r.actual_hours, 0);
  const totPlanFte = rows.reduce((s, r) => s + r.planned_labor_cost, 0);
  const totActualFte = rows.reduce((s, r) => s + r.labor_cost, 0);

  const periodLabel =
    monthFrom === "all" && monthTo === "all"
      ? "All months"
      : `${monthFrom === "all" ? "…" : formatMonthLabel(monthFrom)} → ${
          monthTo === "all" ? "…" : formatMonthLabel(monthTo)
        }`;

  const onProjectChange = (v: string) => {
    setProjectFilter(v);
    setStreamFilter("all");
    setGateFilter("all");
  };

  const onStreamChange = (v: string) => {
    setStreamFilter(v);
    setGateFilter("all");
  };

  if (mode === "cost" && !canViewCost) {
    return (
      <SectionFrame>
        <SectionTitle>Resource cost (FTE actual)</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Cost visibility is limited to roles enabled by your organisation admin (Permissions →
          capability “Timesheet / resource cost view”). Default roles: Org Admin and Project Manager.
        </p>
      </SectionFrame>
    );
  }

  const emptyColSpan = showCost ? 10 : 8;

  return (
    <SectionFrame>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionTitle>
            {mode === "cost"
              ? "FTE cost: allocation, work-item demand & timesheets"
              : "Allocation vs work-item demand vs actual"}
          </SectionTitle>
          <p className="text-xs text-muted-foreground">
            Alloc hours from resource allocations. Demand hours and Plan FTE $ from work-item planned
            hours × resource cost rates. Actual hours and Actual FTE $ from approved timesheets
            (feeds incurred labor). Filter by period, project, stream, stage gate, and resource;
            group by resource, project, stream, stage gate, program, portfolio, or month.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground">From month</span>
            <Select
              value={monthFrom}
              onValueChange={(v) => {
                setMonthFrom(v);
                if (v !== "all" && monthTo !== "all" && v > monthTo) setMonthTo(v);
              }}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="From" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatMonthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground">To month</span>
            <Select
              value={monthTo}
              onValueChange={(v) => {
                setMonthTo(v);
                if (v !== "all" && monthFrom !== "all" && v < monthFrom) setMonthFrom(v);
              }}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="To" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatMonthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground">Project</span>
            <Select value={projectFilter} onValueChange={onProjectChange}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projectsOrdered.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.project_code ? `${p.project_code} — ${p.name}` : p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground">Stream</span>
            <Select value={streamFilter} onValueChange={onStreamChange}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="Stream" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All streams</SelectItem>
                {streamsForFilter.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {formatStreamLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground">Stage gate</span>
            <Select value={gateFilter} onValueChange={setGateFilter}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="Stage gate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All gates</SelectItem>
                {gatesForFilter.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground">Resource</span>
            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="Resource" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All resources</SelectItem>
                {resourcesOrdered.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground">Group by</span>
            <Select value={grain} onValueChange={(v) => setGrain(v as PvaGrain)}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="resource">By resource</SelectItem>
                <SelectItem value="project">By project</SelectItem>
                <SelectItem value="stream">By stream</SelectItem>
                <SelectItem value="stage_gate">By stage gate</SelectItem>
                <SelectItem value="program">By program</SelectItem>
                <SelectItem value="portfolio">By portfolio</SelectItem>
                <SelectItem value="month">By month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div
        className={`mb-3 grid grid-cols-2 gap-3 ${
          canViewCost ? "sm:grid-cols-3 lg:grid-cols-6" : "sm:grid-cols-4"
        }`}
      >
        <KpiCard label="Period" value={periodLabel} accent="#8b5cf6" />
        <KpiCard label="Alloc plan h" value={totAlloc.toFixed(1)} accent="#3b82f6" />
        <KpiCard label="WI demand h" value={totDemand.toFixed(1)} accent="#6366f1" />
        <KpiCard label="Actual h" value={totAct.toFixed(1)} accent="#0ea5e9" />
        {canViewCost ? (
          <>
            <KpiCard label="Plan FTE $" value={money(totPlanFte)} accent="#f59e0b" />
            <KpiCard label="Actual FTE $" value={money(totActualFte)} accent="#ea580c" />
          </>
        ) : null}
      </div>

      <div className="max-h-[480px] overflow-auto">
        <table className="st-table w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[9%]" />
            {showCost && <col className="w-[11%]" />}
            {showCost && <col className="w-[11%]" />}
          </colgroup>
          <thead className="sticky top-0 z-[1] bg-[#f1f3f6]">
            <tr>
              <th>Dimension</th>
              <th className="st-num">Alloc h</th>
              <th className="st-num">Demand h</th>
              <th className="st-num">Gap h</th>
              <th className="st-num">Actual h</th>
              <th className="st-num">Var h</th>
              <th className="st-num">Util%</th>
              <th>Status</th>
              {showCost && <th className="st-num">Plan FTE $</th>}
              {showCost && <th className="st-num">Actual FTE $</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={emptyColSpan} className="py-6 text-center text-muted-foreground">
                  No allocation, work-item demand, or timesheet data for this period.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key}>
                  <td className="font-medium">{r.label}</td>
                  <td className="st-num">{r.planned_hours.toFixed(1)}</td>
                  <td className="st-num">{r.demand_hours.toFixed(1)}</td>
                  <td className="st-num">{r.demand_gap_hours.toFixed(1)}</td>
                  <td className="st-num">{r.actual_hours.toFixed(1)}</td>
                  <td className="st-num">{r.variance_hours.toFixed(1)}</td>
                  <td className="st-num">
                    {r.utilization_pct == null ? "—" : `${r.utilization_pct}%`}
                  </td>
                  <td className={STATUS_COLOR[r.status]}>{r.status}</td>
                  {showCost && <td className="st-num">{money(r.planned_labor_cost)}</td>}
                  {showCost && <td className="st-num">{money(r.labor_cost)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionFrame>
  );
}
