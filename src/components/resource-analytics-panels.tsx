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
  hoursFromAllocation,
  normMonth,
  type AllocationPlanRow,
  type AllocationPvaRow,
  type PvaGrain,
  type TimesheetEffortRow,
} from "@/lib/resource-allocation-analytics";
import {
  exportResourceReportsExcel,
  exportResourceUtilisationCsv,
  buildResourceUtilisationExport,
} from "@/lib/resource-reports";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
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
    role?: string | null;
    capacity_hours_week?: number | null;
    cost_rate?: number | null;
    user_id?: string | null;
  }>;
  allocations: AllocationPlanRow[];
  /** Optional: expose latest PVA rows to parent for page-level exports. */
  onPvaRows?: (rows: AllocationPvaRow[]) => void;
};

export function ResourceAnalyticsPanels({
  mode,
  projects,
  resources,
  allocations,
  onPvaRows,
}: Props) {
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
          "timesheet_id,project_id,work_item_id,stream_id,stage_gate_id,billable,labor_cost,hours_mon,hours_tue,hours_wed,hours_thu,hours_fri,hours_sat,hours_sun",
        )
        .in("timesheet_id", ids);
      if (e2) throw e2;
      const wiIds = Array.from(
        new Set(((entries ?? []) as any[]).map((e) => e.work_item_id).filter(Boolean)),
      ) as string[];
      const wiById = new Map<
        string,
        { stream_id?: string | null; stage_gate_id?: string | null }
      >();
      if (wiIds.length) {
        const { data: wis } = await supabase
          .from("work_items" as any)
          .select("id,stream_id,stage_gate_id")
          .in("id", wiIds);
        for (const w of (wis ?? []) as any[]) wiById.set(w.id, w);
      }
      return ((entries ?? []) as any[]).map((e) => {
        const ts = sheetById.get(e.timesheet_id) as any;
        const weekStart = ts?.week_start ? String(ts.week_start).slice(0, 10) : null;
        const wi = e.work_item_id ? wiById.get(e.work_item_id) : undefined;
        return {
          resource_id: ts?.resource_id ?? null,
          project_id: e.project_id,
          stream_id: e.stream_id || wi?.stream_id || null,
          stage_gate_id: e.stage_gate_id || wi?.stage_gate_id || null,
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
    () =>
      [...resources].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [resources],
  );
  const resourceNames = useMemo(() => new Map(resources.map((r) => [r.id, r.name])), [resources]);
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
        // Non-billable / unallocated (no project) — keep for resource/month and PVA buckets.
        if (!a.project_id || a.billable === false) {
          return grain === "resource" || grain === "month" || grain === "project";
        }
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
  }, [
    scopedPlans,
    projectFilter,
    streamFilter,
    resourceFilter,
    monthFrom,
    monthTo,
    selectedGateIds,
    gateFilter,
    gateLabels,
  ]);

  const filteredActuals = useMemo(() => {
    return scopedActuals.filter((a: TimesheetEffortRow) => {
      const nonBillable = !a.project_id || a.billable === false;
      if (projectFilter !== "all") {
        if (nonBillable) return false; // project filter hides unallocated bucket
        if (a.project_id !== projectFilter) return false;
      }
      if (!nonBillable) {
        if (streamFilter !== "all" && (a.stream_id || null) !== streamFilter) return false;
        if (!matchesGateFilter(a.stage_gate_id)) return false;
      } else if (streamFilter !== "all" || gateFilter !== "all") {
        return false;
      }
      if (resourceFilter !== "all" && a.resource_id !== resourceFilter) return false;
      if (!inMonthRange(a.period_month || a.week_start, monthFrom, monthTo)) return false;
      return true;
    });
  }, [
    scopedActuals,
    projectFilter,
    streamFilter,
    resourceFilter,
    monthFrom,
    monthTo,
    selectedGateIds,
    gateFilter,
    gateLabels,
  ]);

  const filteredDemand = useMemo(() => {
    return scopedDemand.filter((d: WorkItemDemandSlice) => {
      if (projectFilter !== "all" && d.project_id !== projectFilter) return false;
      if (streamFilter !== "all" && (d.stream_id || null) !== streamFilter) return false;
      if (!matchesGateFilter(d.stage_gate_id)) return false;
      if (resourceFilter !== "all" && d.resource_id !== resourceFilter) return false;
      if (!inMonthRange(d.period_month, monthFrom, monthTo)) return false;
      return true;
    });
  }, [
    scopedDemand,
    projectFilter,
    streamFilter,
    resourceFilter,
    monthFrom,
    monthTo,
    selectedGateIds,
    gateFilter,
    gateLabels,
  ]);

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

  useEffect(() => {
    onPvaRows?.(rows);
  }, [rows, onPvaRows]);

  const totAlloc = rows.reduce((s, r) => s + r.planned_hours, 0);
  const totDemand = rows.reduce((s, r) => s + r.demand_hours, 0);
  const totAct = rows.reduce((s, r) => s + r.actual_hours, 0);
  const totBillable = rows.reduce((s, r) => s + r.billable_hours, 0);
  const totNonBillable = rows.reduce((s, r) => s + r.non_billable_hours, 0);
  const totPlanFte = rows.reduce((s, r) => s + r.planned_labor_cost, 0);
  const totActualFte = rows.reduce((s, r) => s + r.labor_cost, 0);

  const exportUtilRows = useMemo(() => {
    const planByResource = new Map<string, { percent: number; hours: number }>();
    for (const a of filteredPlans) {
      const cur = planByResource.get(a.resource_id) ?? { percent: 0, hours: 0 };
      const cap = capacityByResource.get(a.resource_id) ?? 40;
      cur.percent += Number(a.allocation_percent) || 0;
      cur.hours += hoursFromAllocation(a, cap);
      planByResource.set(a.resource_id, cur);
    }
    const actualByResource = new Map<
      string,
      { hours: number; billable: number; non_billable: number }
    >();
    for (const a of filteredActuals) {
      if (!a.resource_id) continue;
      const cur = actualByResource.get(a.resource_id) ?? {
        hours: 0,
        billable: 0,
        non_billable: 0,
      };
      const hrs = Number(a.hours) || 0;
      cur.hours += hrs;
      if (a.billable === false || !a.project_id) cur.non_billable += hrs;
      else cur.billable += hrs;
      actualByResource.set(a.resource_id, cur);
    }
    return buildResourceUtilisationExport({
      resources,
      planByResource,
      actualByResource,
    });
  }, [filteredPlans, filteredActuals, resources, capacityByResource]);

  const onExportExcel = async () => {
    try {
      await exportResourceReportsExcel({ utilisation: exportUtilRows, pva: rows });
      toast.success("Resource reports exported");
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    }
  };

  const onExportCsv = () => {
    exportResourceUtilisationCsv(exportUtilRows);
    toast.success("Utilisation CSV downloaded");
  };

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
          capability “Timesheet / resource cost view”). Default roles: Org Admin and Project
          Manager.
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
              : "Estimation plan vs timesheet actuals"}
          </SectionTitle>
          <p className="text-xs text-muted-foreground">
            <strong>Plan h</strong> are hours of work from Project Estimation Planning, applied per
            stream and phase into resource allocations. <strong>Actual h</strong> are approved
            timesheets. Demand h / Demand FTE $ are work-item estimates (Demand layer — not Plan).
            Filter by period, project, stream, stage gate, and resource; group by resource, project,
            stream, stage gate, program, portfolio, or month.
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

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className={`grid flex-1 grid-cols-2 gap-3 ${
            canViewCost ? "sm:grid-cols-3 lg:grid-cols-6" : "sm:grid-cols-3 lg:grid-cols-5"
          }`}
        >
          <KpiCard label="Period" value={periodLabel} accent="#8b5cf6" />
          <KpiCard label="Plan h" value={totAlloc.toFixed(1)} accent="#3b82f6" />
          <KpiCard label="WI demand h" value={totDemand.toFixed(1)} accent="#6366f1" />
          <KpiCard label="Actual h" value={totAct.toFixed(1)} accent="#0ea5e9" />
          <KpiCard label="Billable h" value={totBillable.toFixed(1)} accent="#059669" />
          <KpiCard label="Non-billable h" value={totNonBillable.toFixed(1)} accent="#a855f7" />
          {canViewCost ? (
            <>
              <KpiCard label="Demand FTE $" value={money(totPlanFte)} accent="#f59e0b" />
              <KpiCard label="Actual FTE $" value={money(totActualFte)} accent="#ea580c" />
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onExportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void onExportExcel()}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Excel reports
          </Button>
        </div>
      </div>

      <div className="st-table-wrap max-h-[480px] overflow-auto">
        <table className="st-table !w-max min-w-full text-sm">
          <thead className="sticky top-0 z-[1] bg-[#f1f3f6]">
            <tr>
              <th className="min-w-[12rem]">Dimension</th>
              <th className="st-num whitespace-nowrap">Plan h</th>
              <th className="st-num whitespace-nowrap">Demand h</th>
              <th className="st-num whitespace-nowrap">Gap h</th>
              <th className="st-num whitespace-nowrap">Actual h</th>
              <th className="st-num whitespace-nowrap">Billable</th>
              <th className="st-num whitespace-nowrap">Non-billable</th>
              <th className="st-num whitespace-nowrap">Var h</th>
              <th className="st-num whitespace-nowrap">Util%</th>
              <th className="whitespace-nowrap">Status</th>
              {showCost && <th className="st-num whitespace-nowrap">Demand FTE $</th>}
              {showCost && <th className="st-num whitespace-nowrap">Actual FTE $</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={emptyColSpan + 2} className="py-6 text-center text-muted-foreground">
                  No allocation, work-item demand, or timesheet data for this period.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key}>
                  <td className="font-medium whitespace-nowrap">{r.label}</td>
                  <td className="st-num whitespace-nowrap">{r.planned_hours.toFixed(1)}</td>
                  <td className="st-num whitespace-nowrap">{r.demand_hours.toFixed(1)}</td>
                  <td className="st-num whitespace-nowrap">{r.demand_gap_hours.toFixed(1)}</td>
                  <td className="st-num whitespace-nowrap">{r.actual_hours.toFixed(1)}</td>
                  <td className="st-num whitespace-nowrap">{r.billable_hours.toFixed(1)}</td>
                  <td className="st-num whitespace-nowrap">{r.non_billable_hours.toFixed(1)}</td>
                  <td className="st-num whitespace-nowrap">{r.variance_hours.toFixed(1)}</td>
                  <td className="st-num whitespace-nowrap">
                    {r.utilization_pct == null ? "—" : `${r.utilization_pct}%`}
                  </td>
                  <td className={`${STATUS_COLOR[r.status]} whitespace-nowrap`}>{r.status}</td>
                  {showCost && (
                    <td className="st-num whitespace-nowrap">{money(r.planned_labor_cost)}</td>
                  )}
                  {showCost && <td className="st-num whitespace-nowrap">{money(r.labor_cost)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionFrame>
  );
}
