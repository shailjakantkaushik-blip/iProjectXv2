import { useMemo, useState } from "react";
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

type Props = {
  mode: "pva" | "cost";
  projects: Array<{
    id: string;
    name?: string | null;
    project_code?: string | null;
    program?: string | null;
    portfolio?: string | null;
  }>;
  resources: Array<{ id: string; name: string; capacity_hours_week?: number | null }>;
  allocations: AllocationPlanRow[];
};

export function ResourceAnalyticsPanels({ mode, projects, resources, allocations }: Props) {
  const { organization } = useAuth();
  const { canEdit: canViewCost } = useCapabilityPermission("timesheet_cost_view");
  const [grain, setGrain] = useState<PvaGrain>(mode === "cost" ? "resource" : "stage_gate");
  const [projectFilter, setProjectFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");

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
        return {
          resource_id: ts?.resource_id ?? null,
          project_id: e.project_id,
          stream_id: e.stream_id,
          stage_gate_id: e.stage_gate_id,
          period_month: normMonth(ts?.week_start),
          hours: entryHours(e),
          labor_cost: Number(e.labor_cost) || 0,
          billable: e.billable !== false,
        } as TimesheetEffortRow;
      });
    },
    enabled: !!organization,
  });

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

  const filteredPlans = useMemo(() => {
    return scopedPlans.filter((a: AllocationPlanRow) => {
      if (projectFilter !== "all" && a.project_id !== projectFilter) return false;
      if (resourceFilter !== "all" && a.resource_id !== resourceFilter) return false;
      return true;
    });
  }, [scopedPlans, projectFilter, resourceFilter]);

  const filteredActuals = useMemo(() => {
    return scopedActuals.filter((a: TimesheetEffortRow) => {
      if (projectFilter !== "all" && a.project_id !== projectFilter) return false;
      if (resourceFilter !== "all" && a.resource_id !== resourceFilter) return false;
      return true;
    });
  }, [scopedActuals, projectFilter, resourceFilter]);

  const rows = useMemo(
    () =>
      buildAllocationPva({
        grain,
        plans: filteredPlans,
        actuals: filteredActuals,
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
      projectsById,
      resourceNames,
      streamLabels,
      gateLabels,
      capacityByResource,
    ],
  );

  const totPlan = rows.reduce((s, r) => s + r.planned_hours, 0);
  const totAct = rows.reduce((s, r) => s + r.actual_hours, 0);
  const totCost = rows.reduce((s, r) => s + r.labor_cost, 0);

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

  return (
    <SectionFrame>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionTitle>
            {mode === "cost" ? "FTE actual cost (from timesheets)" : "Planned vs actual allocation"}
          </SectionTitle>
          <p className="text-xs text-muted-foreground">
            {mode === "cost"
              ? "Labor cost from approved timesheets. Group by resource, project, stream, stage gate, program, portfolio, or month. Scoped to projects you can view."
              : "Planned FTE from resource allocations vs actual hours on approved timesheets (work items stamp stream + stage gate)."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
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

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Planned hours" value={totPlan.toFixed(1)} accent="#3b82f6" />
        <KpiCard label="Actual hours" value={totAct.toFixed(1)} accent="#0ea5e9" />
        <KpiCard
          label="Variance (plan − act)"
          value={(totPlan - totAct).toFixed(1)}
          accent={totPlan - totAct < 0 ? "#ef4444" : "#22c55e"}
        />
        {mode === "cost" || canViewCost ? (
          <KpiCard label="FTE labor cost" value={money(totCost)} accent="#f59e0b" />
        ) : (
          <KpiCard label="Rows" value={String(rows.length)} accent="#8b5cf6" />
        )}
      </div>

      <div className="max-h-[480px] overflow-auto">
        <table className="st-table w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            {(mode === "cost" || canViewCost) && <col className="w-[10%]" />}
          </colgroup>
          <thead className="sticky top-0 z-[1] bg-[#f1f3f6]">
            <tr>
              <th>Dimension</th>
              <th className="st-num">Plan h</th>
              <th className="st-num">Plan %</th>
              <th className="st-num">Actual h</th>
              <th className="st-num">Var h</th>
              <th className="st-num">Util %</th>
              <th>Status</th>
              {(mode === "cost" || canViewCost) && <th className="st-num">Labor $</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={mode === "cost" || canViewCost ? 8 : 7}
                  className="py-6 text-center text-muted-foreground"
                >
                  No allocation or timesheet data for this view.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key}>
                  <td className="font-medium">{r.label}</td>
                  <td className="st-num">{r.planned_hours.toFixed(1)}</td>
                  <td className="st-num">{r.planned_percent.toFixed(0)}%</td>
                  <td className="st-num">{r.actual_hours.toFixed(1)}</td>
                  <td className="st-num">{r.variance_hours.toFixed(1)}</td>
                  <td className="st-num">
                    {r.utilization_pct == null ? "—" : `${r.utilization_pct}%`}
                  </td>
                  <td className={STATUS_COLOR[r.status]}>{r.status}</td>
                  {(mode === "cost" || canViewCost) && (
                    <td className="st-num">{money(r.labor_cost)}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionFrame>
  );
}
