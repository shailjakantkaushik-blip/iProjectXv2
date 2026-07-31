import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RESOURCES_SELECT, RESOURCE_ALLOCATIONS_SELECT } from "@/lib/query-selects";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  LabelList,
} from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";
import { compareProjectsByCodeName } from "@/lib/project-options";
import { ResourceAnalyticsPanels } from "@/components/resource-analytics-panels";
import {
  entryHours,
  hoursFromAllocation,
  type TimesheetEffortRow,
} from "@/lib/resource-allocation-analytics";
import {
  buildResourceUtilisationExport,
  exportResourceReportsExcel,
  exportResourceUtilisationCsv,
} from "@/lib/resource-reports";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/resources")({
  component: ResourcesPage,
});

type Resource = {
  id: string;
  name: string;
  role?: string | null;
  skills?: string | null;
  capacity_hours_week?: number | null;
  cost_rate?: number | null;
  user_id?: string | null;
};
type Allocation = {
  id: string;
  resource_id: string;
  project_id: string;
  stream_id?: string | null;
  stage_gate_id?: string | null;
  period_month: string;
  allocation_percent: number | null;
  allocated_hours?: number | null;
  role_on_project?: string | null;
};
type Project = {
  id: string;
  name: string;
  project_code?: string | null;
  program?: string | null;
  portfolio?: string | null;
};

type ResTab = "utilisation" | "pva";

const STATUS_COLOR = {
  Over: "#dc2626",
  Optimal: "#16a34a",
  Under: "#f59e0b",
  Unplanned: "#7c3aed",
} as const;
type Status = keyof typeof STATUS_COLOR;

const PLAN_BAR = "#2563eb";
const ACTUAL_BAR = "#0d9488";

/** Convert timesheet hours in a month to % of monthly FTE capacity. */
function hoursToMonthPct(hours: number, capacityHoursWeek = 40): number {
  const monthCap = (Number(capacityHoursWeek) || 40) * 4.33;
  if (monthCap <= 0 || !Number.isFinite(hours)) return 0;
  return Math.round((hours / monthCap) * 100);
}

/** Normalize DB dates to YYYY-MM-01 so filters/headers/cells share one key. */
function normMonth(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v).slice(0, 10);
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[1]}-${m[2]}-01`;
}

/** Label without UTC timezone shift (avoid "2026-01-01" → Dec in local TZ). */
function monthLabel(m: string): string {
  const key = normMonth(m).slice(0, 7);
  const [ys, ms] = key.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!y || !mo) return key;
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

function statusFor(pct: number): Status {
  if (pct > 100) return "Over";
  if (pct >= 60) return "Optimal";
  return "Under";
}

function heatColor(pct: number): string {
  // Green (low) -> Yellow (~60) -> Red (>=100)
  const p = Math.max(0, Math.min(120, pct));
  if (p <= 60) {
    const t = p / 60; // 0..1
    // green -> yellow
    const r = Math.round(22 + t * (234 - 22));
    const g = Math.round(163 - t * (163 - 179));
    const b = Math.round(74 - t * (74 - 8));
    return `rgb(${r},${g},${b})`;
  }
  const t = Math.min(1, (p - 60) / 60);
  // yellow -> red
  const r = Math.round(234 + t * (220 - 234));
  const g = Math.round(179 - t * (179 - 38));
  const b = Math.round(8 + t * (38 - 8));
  return `rgb(${r},${g},${b})`;
}

function ResourcesPage() {
  const { organization } = useAuth();
  const [tab, setTab] = useState<ResTab>("pva");

  const { data: resourcesAll = [] } = useQuery({
    queryKey: ["resources", organization?.id],
    queryFn: async () => ((await supabase.from("resources").select(RESOURCES_SELECT as "*")).data as Resource[]) ?? [],
    enabled: !!organization,
  });
  const { data: allocationsAll = [] } = useQuery({
    queryKey: ["resource_allocations", organization?.id],
    queryFn: async () =>
      ((await supabase.from("resource_allocations").select(RESOURCE_ALLOCATIONS_SELECT as "*")).data as Allocation[]) ?? [],
    enabled: !!organization,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id, "resources"],
    queryFn: async () =>
      ((await supabase
        .from("projects")
        .select("id,name,project_code,program,portfolio")
        .order("project_code")
        .order("name")).data as Project[]) ?? [],
    enabled: !!organization,
  });

  const { data: timesheetActuals = [] } = useQuery({
    queryKey: ["timesheet_effort", organization?.id, "resources-util"],
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
          "timesheet_id,project_id,work_item_id,billable,hours_mon,hours_tue,hours_wed,hours_thu,hours_fri,hours_sat,hours_sun",
        )
        .in("timesheet_id", ids);
      if (e2) throw e2;
      return ((entries ?? []) as any[]).map((e) => {
        const ts = sheetById.get(e.timesheet_id) as any;
        const weekStart = ts?.week_start ? String(ts.week_start).slice(0, 10) : null;
        return {
          resource_id: ts?.resource_id ?? null,
          project_id: e.project_id,
          period_month: normMonth(weekStart),
          week_start: weekStart,
          hours: entryHours(e),
          labor_cost: 0,
          billable: e.billable !== false && Boolean(e.project_id || e.work_item_id),
        } as TimesheetEffortRow;
      });
    },
    enabled: !!organization,
  });

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [skillFilter, setSkillFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthFrom, setMonthFrom] = useState<string>("all");
  const [monthTo, setMonthTo] = useState<string>("all");

  const projectsOrdered = useMemo(() => [...projects].sort(compareProjectsByCodeName), [projects]);
  const resByIdAll = useMemo(() => new Map(resourcesAll.map((r) => [r.id, r])), [resourcesAll]);

  const roleOptions = useMemo(
    () =>
      Array.from(new Set(resourcesAll.map((r) => (r.role || "").trim()).filter(Boolean))).sort(),
    [resourcesAll],
  );
  const skillOptions = useMemo(() => {
    const s = new Set<string>();
    resourcesAll.forEach((r) =>
      (r.skills || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((x) => s.add(x)),
    );
    return Array.from(s).sort();
  }, [resourcesAll]);
  const monthOptionsAll = useMemo(() => {
    const s = new Set<string>();
    allocationsAll.forEach((a) => {
      const m = normMonth(a.period_month);
      if (m) s.add(m);
    });
    timesheetActuals.forEach((a) => {
      const m = normMonth(a.period_month || a.week_start);
      if (m) s.add(m);
    });
    return Array.from(s).sort();
  }, [allocationsAll, timesheetActuals]);

  // Utilisation across the currently visible months, used for the status filter
  const monthsInRange = useMemo(() => {
    const from = monthFrom === "all" ? null : normMonth(monthFrom);
    const to = monthTo === "all" ? null : normMonth(monthTo);
    return monthOptionsAll.filter((m) => (!from || m >= from) && (!to || m <= to));
  }, [monthOptionsAll, monthFrom, monthTo]);

  const resources = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resourcesAll.filter((r) => {
      if (q && !`${r.name} ${r.role ?? ""} ${r.skills ?? ""}`.toLowerCase().includes(q))
        return false;
      if (roleFilter !== "all" && (r.role || "") !== roleFilter) return false;
      if (skillFilter !== "all") {
        const list = (r.skills || "").split(",").map((s) => s.trim());
        if (!list.includes(skillFilter)) return false;
      }
      if (projectFilter !== "all") {
        const hasProj = allocationsAll.some(
          (a) => a.resource_id === r.id && a.project_id === projectFilter,
        );
        if (!hasProj) return false;
      }
      if (statusFilter !== "all") {
        const rows = allocationsAll.filter(
          (a) => a.resource_id === r.id && monthsInRange.includes(normMonth(a.period_month)),
        );
        const total = rows.reduce((s, a) => s + Number(a.allocation_percent || 0), 0);
        const avg = monthsInRange.length ? total / monthsInRange.length : 0;
        const cap = Number(r.capacity_hours_week) || 40;
        const planHours = rows.reduce((s, a) => s + hoursFromAllocation(a, cap), 0);
        const actualHours = timesheetActuals
          .filter((a) => {
            if (a.resource_id !== r.id) return false;
            const m = normMonth(a.period_month || a.week_start);
            return monthsInRange.length === 0 || monthsInRange.includes(m);
          })
          .reduce((s, a) => s + (Number(a.hours) || 0), 0);
        let st: Status = statusFor(avg);
        if (planHours <= 0 && actualHours > 0) st = "Unplanned";
        else if (planHours > 0 && (actualHours / planHours) * 100 > 110) st = "Over";
        if (st !== (statusFilter as Status)) return false;
      }
      return true;
    });
  }, [
    resourcesAll,
    allocationsAll,
    timesheetActuals,
    search,
    roleFilter,
    skillFilter,
    projectFilter,
    statusFilter,
    monthsInRange,
  ]);

  const resIdSet = useMemo(() => new Set(resources.map((r) => r.id)), [resources]);
  const allocations = useMemo(() => {
    const from = monthFrom === "all" ? null : normMonth(monthFrom);
    const to = monthTo === "all" ? null : normMonth(monthTo);
    return allocationsAll
      .filter((a) => {
        if (!resIdSet.has(a.resource_id)) return false;
        if (projectFilter !== "all" && a.project_id !== projectFilter) return false;
        const m = normMonth(a.period_month);
        if (from && m < from) return false;
        if (to && m > to) return false;
        return true;
      })
      .map((a) => ({ ...a, period_month: normMonth(a.period_month) }));
  }, [allocationsAll, resIdSet, projectFilter, monthFrom, monthTo]);

  const resById = resByIdAll;

  const resetFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setSkillFilter("all");
    setProjectFilter("all");
    setStatusFilter("all");
    setMonthFrom("all");
    setMonthTo("all");
  };

  const filteredActuals = useMemo(() => {
    const from = monthFrom === "all" ? null : normMonth(monthFrom);
    const to = monthTo === "all" ? null : normMonth(monthTo);
    return timesheetActuals.filter((a) => {
      if (!a.resource_id || !resIdSet.has(a.resource_id)) return false;
      if (projectFilter !== "all") {
        const nonBillable = !a.project_id || a.billable === false;
        if (nonBillable) return false;
        if (a.project_id !== projectFilter) return false;
      }
      const m = normMonth(a.period_month || a.week_start);
      if (from && m < from) return false;
      if (to && m > to) return false;
      return true;
    });
  }, [timesheetActuals, resIdSet, projectFilter, monthFrom, monthTo]);

  // Distinct months (sorted, normalized) — plan + actuals
  const months = useMemo(() => {
    const s = new Set<string>();
    allocations.forEach((a) => {
      const m = normMonth(a.period_month);
      if (m) s.add(m);
    });
    filteredActuals.forEach((a) => {
      const m = normMonth(a.period_month || a.week_start);
      if (m) s.add(m);
    });
    return Array.from(s).sort();
  }, [allocations, filteredActuals]);

  const projectColumns = useMemo(() => {
    // Always show every visible project (not only those with allocations).
    const list =
      projectFilter === "all"
        ? [...projects]
        : projects.filter((p) => p.id === projectFilter);
    return list.sort((a, b) =>
      String(a.project_code || a.name).localeCompare(String(b.project_code || b.name)),
    );
  }, [projects, projectFilter]);

  // Avg allocation per resource + timesheet actuals
  const utilisation = useMemo(() => {
    return resources
      .map((r) => {
        const rows = allocations.filter((a) => a.resource_id === r.id);
        const total = rows.reduce((s, a) => s + Number(a.allocation_percent || 0), 0);
        const avg = months.length ? total / months.length : 0;
        const cap = Number(r.capacity_hours_week) || 40;
        const planHours = rows.reduce((s, a) => s + hoursFromAllocation(a, cap), 0);
        let actualHours = 0;
        let billableHours = 0;
        let nonBillableHours = 0;
        for (const a of filteredActuals) {
          if (a.resource_id !== r.id) continue;
          const hrs = Number(a.hours) || 0;
          actualHours += hrs;
          if (a.billable === false || !a.project_id) nonBillableHours += hrs;
          else billableHours += hrs;
        }
        // Average monthly actual % (same basis as plan avg %)
        let actualPctSum = 0;
        if (months.length) {
          for (const m of months) {
            const hrs = filteredActuals
              .filter(
                (a) =>
                  a.resource_id === r.id && normMonth(a.period_month || a.week_start) === m,
              )
              .reduce((s, a) => s + (Number(a.hours) || 0), 0);
            actualPctSum += hoursToMonthPct(hrs, cap);
          }
        }
        const actualPctAvg = months.length ? Math.round(actualPctSum / months.length) : 0;
        const utilVsPlan =
          planHours > 0 ? Math.round((actualHours / planHours) * 1000) / 10 : null;
        let status: Status = statusFor(avg);
        if (planHours <= 0 && actualHours > 0) status = "Unplanned";
        else if (utilVsPlan != null && utilVsPlan > 110) status = "Over";
        return {
          resource: r.name,
          resourceId: r.id,
          pct: Math.round(avg),
          actualPct: actualPctAvg,
          planHours: Math.round(planHours * 10) / 10,
          actualHours: Math.round(actualHours * 10) / 10,
          billableHours: Math.round(billableHours * 10) / 10,
          nonBillableHours: Math.round(nonBillableHours * 10) / 10,
          utilVsPlan,
          status,
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [resources, allocations, months, filteredActuals]);

  const utilisationExportRows = useMemo(() => {
    const planByResource = new Map<string, { percent: number; hours: number }>();
    for (const a of allocations) {
      const r = resById.get(a.resource_id);
      const cap = Number(r?.capacity_hours_week) || 40;
      const cur = planByResource.get(a.resource_id) ?? { percent: 0, hours: 0 };
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
  }, [allocations, filteredActuals, resources, resById]);

  const kpi = {
    total: resources.length,
    over: utilisation.filter((u) => u.status === "Over").length,
    optimal: utilisation.filter((u) => u.status === "Optimal").length,
    under: utilisation.filter((u) => u.status === "Under" || u.status === "Unplanned").length,
  };

  // Resource × Month heatmap — plan % and actual % (from timesheets)
  const heatGrid = useMemo(() => {
    return resources.map((r) => {
      const cap = Number(r.capacity_hours_week) || 40;
      const row: {
        name: string;
        cells: { month: string; planPct: number; actualPct: number }[];
      } = { name: r.name, cells: [] };
      months.forEach((m) => {
        const planPct = Math.round(
          allocations
            .filter((a) => a.resource_id === r.id && a.period_month === m)
            .reduce((s, a) => s + Number(a.allocation_percent || 0), 0),
        );
        const actualHrs = filteredActuals
          .filter((a) => a.resource_id === r.id && normMonth(a.period_month || a.week_start) === m)
          .reduce((s, a) => s + (Number(a.hours) || 0), 0);
        row.cells.push({
          month: m,
          planPct,
          actualPct: hoursToMonthPct(actualHrs, cap),
        });
      });
      return row;
    });
  }, [resources, allocations, months, filteredActuals]);

  // Monthly plan vs actual hours (portfolio totals)
  const monthlyPlanActual = useMemo(() => {
    return months.map((m) => {
      let planHours = 0;
      let actualHours = 0;
      for (const a of allocations) {
        if (a.period_month !== m) continue;
        const r = resById.get(a.resource_id);
        planHours += hoursFromAllocation(a, Number(r?.capacity_hours_week) || 40);
      }
      for (const a of filteredActuals) {
        if (normMonth(a.period_month || a.week_start) !== m) continue;
        actualHours += Number(a.hours) || 0;
      }
      return {
        month: monthLabel(m),
        planHours: Math.round(planHours * 10) / 10,
        actualHours: Math.round(actualHours * 10) / 10,
      };
    });
  }, [months, allocations, filteredActuals, resById]);

  // Demand by skill — plan % share vs actual hours→% share
  const bySkill = useMemo(() => {
    const planMap = new Map<string, number>();
    const actualMap = new Map<string, number>();
    allocations.forEach((a) => {
      const r = resById.get(a.resource_id);
      const skills = (r?.skills || r?.role || "Unknown")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const share = Number(a.allocation_percent || 0) / (skills.length || 1);
      skills.forEach((s) => planMap.set(s, (planMap.get(s) || 0) + share));
    });
    filteredActuals.forEach((a) => {
      if (!a.resource_id) return;
      const r = resById.get(a.resource_id);
      const skills = (r?.skills || r?.role || "Unknown")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const pct = hoursToMonthPct(Number(a.hours) || 0, Number(r?.capacity_hours_week) || 40);
      const share = pct / (skills.length || 1);
      skills.forEach((s) => actualMap.set(s, (actualMap.get(s) || 0) + share));
    });
    const skills = new Set([...planMap.keys(), ...actualMap.keys()]);
    return Array.from(skills)
      .map((skill) => ({
        skill,
        planPct: Math.round(planMap.get(skill) || 0),
        actualPct: Math.round(actualMap.get(skill) || 0),
      }))
      .sort((a, b) => Math.max(b.planPct, b.actualPct) - Math.max(a.planPct, a.actualPct))
      .slice(0, 12);
  }, [allocations, filteredActuals, resById]);

  // Resource × Project heatmap — plan % and actual % (hours→% of FTE month)
  const rpGrid = useMemo(() => {
    const planBy = new Map<string, Map<string, number>>();
    const actualBy = new Map<string, Map<string, number>>();
    allocations.forEach((a) => {
      const row = planBy.get(a.resource_id) || new Map();
      row.set(a.project_id, (row.get(a.project_id) || 0) + Number(a.allocation_percent || 0));
      planBy.set(a.resource_id, row);
    });
    filteredActuals.forEach((a) => {
      if (!a.resource_id || !a.project_id || a.billable === false) return;
      const r = resById.get(a.resource_id);
      const pct = hoursToMonthPct(Number(a.hours) || 0, Number(r?.capacity_hours_week) || 40);
      const row = actualBy.get(a.resource_id) || new Map();
      row.set(a.project_id, (row.get(a.project_id) || 0) + pct);
      actualBy.set(a.resource_id, row);
    });
    const cols = projectColumns.map((p) => ({
      id: p.id,
      label: p.project_code ? `${p.project_code}` : p.name,
      title: p.project_code ? `${p.name} (${p.project_code})` : p.name,
    }));
    // Include a Non-billable column when there is any non-billable actual
    const hasNonBillable = filteredActuals.some(
      (a) => a.resource_id && (!a.project_id || a.billable === false),
    );
    if (hasNonBillable) {
      cols.push({
        id: "__non_billable__",
        label: "Non-bill",
        title: "Non-billable / unallocated timesheet hours",
      });
      filteredActuals.forEach((a) => {
        if (!a.resource_id || (a.project_id && a.billable !== false)) return;
        const r = resById.get(a.resource_id);
        const pct = hoursToMonthPct(Number(a.hours) || 0, Number(r?.capacity_hours_week) || 40);
        const row = actualBy.get(a.resource_id) || new Map();
        row.set("__non_billable__", (row.get("__non_billable__") || 0) + pct);
        actualBy.set(a.resource_id, row);
      });
    }
    const rows = resources.map((r) => ({
      name: r.name,
      cells: cols.map((c) => ({
        projectId: c.id,
        project: c.title,
        planPct: Math.round(planBy.get(r.id)?.get(c.id) || 0),
        actualPct: Math.round(actualBy.get(r.id)?.get(c.id) || 0),
      })),
    }));
    return { rows, cols };
  }, [allocations, filteredActuals, resources, projectColumns, resById]);

  return (
    <PageExport name="Resource_Capacity" title="Resource Capacity & Skill Intelligence">
      <PageHeading icon="👥">Resource Capacity & Skill Intelligence</PageHeading>
      <p className="mb-3 max-w-3xl text-sm text-muted-foreground">
        Compare <strong>planned allocations</strong> with <strong>approved timesheet actuals</strong>{" "}
        (project / work-item billable hours and non-billable / unallocated). Graphs and heatmaps on
        Utilisation show plan and actual side by side; export standard reports from either tab.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["pva", "Plan vs actual (timesheets)"],
            ["utilisation", "Utilisation (plan + actual)"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium",
              tab === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pva" ? (
        <ResourceAnalyticsPanels
          mode="pva"
          projects={projects}
          resources={resourcesAll}
          allocations={allocationsAll}
        />
      ) : null}

      {tab === "utilisation" ? (
        <>
      <SectionFrame>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 items-end">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Search</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, role, skill…"
              className="h-9"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Role</label>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roleOptions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Skill</label>
            <Select value={skillFilter} onValueChange={setSkillFilter}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All skills</SelectItem>
                {skillOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Project</label>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-9">
                <SelectValue />
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
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Over">Over</SelectItem>
                <SelectItem value="Optimal">Optimal</SelectItem>
                <SelectItem value="Under">Under</SelectItem>
                <SelectItem value="Unplanned">Unplanned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Month from</label>
            <Select value={monthFrom} onValueChange={setMonthFrom}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Earliest</SelectItem>
                {monthOptionsAll.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-[11px] font-medium text-muted-foreground">Month to</label>
              <Select value={monthTo} onValueChange={setMonthTo}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Latest</SelectItem>
                  {monthOptionsAll.map((m) => (
                    <SelectItem key={m} value={m}>
                      {monthLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={resetFilters} className="h-9">
              Reset
            </Button>
          </div>
        </div>
      </SectionFrame>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4 mt-4">
        <KpiCard label="Resources" value={kpi.total} />
        <KpiCard label="Over" value={kpi.over} />
        <KpiCard label="Optimal" value={kpi.optimal} />
        <KpiCard label="Under" value={kpi.under} />
      </div>

      <SectionFrame>
        <ExpandableChart
          title="Resource utilisation — plan % vs actual %"
          heightClass="h-80"
          legend={
            <div className="mt-1 flex flex-wrap justify-end gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: PLAN_BAR }} />
                Plan (allocation)
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ background: ACTUAL_BAR }}
                />
                Actual (timesheets → % of FTE month)
              </span>
            </div>
          }
        >
          <BarChart
            data={utilisation.map((u) => ({
              resource: u.resource,
              planPct: u.pct,
              actualPct: u.actualPct,
            }))}
            margin={{ top: 20, right: 60, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
            <XAxis
              dataKey="resource"
              fontSize={11}
              angle={-25}
              textAnchor="end"
              interval={0}
              height={60}
              label={{ value: "Resource", position: "insideBottom", offset: -50, fontSize: 11 }}
            />
            <YAxis
              fontSize={11}
              domain={[0, 120]}
              label={{ value: "% of capacity", angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine
              y={100}
              stroke="#dc2626"
              strokeDasharray="6 4"
              label={{ value: "100% capacity", position: "right", fill: "#dc2626", fontSize: 11 }}
            />
            <Bar dataKey="planPct" name="Plan %" fill={PLAN_BAR} radius={[3, 3, 0, 0]}>
              <LabelList
                dataKey="planPct"
                position="top"
                formatter={(v: number) => `${v}%`}
                fontSize={9}
              />
            </Bar>
            <Bar dataKey="actualPct" name="Actual %" fill={ACTUAL_BAR} radius={[3, 3, 0, 0]}>
              <LabelList
                dataKey="actualPct"
                position="top"
                formatter={(v: number) => `${v}%`}
                fontSize={9}
              />
            </Bar>
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Month-wise heatmap (Resource × Month) — plan / actual</SectionTitle>
        <p className="mb-2 text-[12px] text-muted-foreground">
          Each cell shows <span style={{ color: PLAN_BAR }}>plan%</span> /{" "}
          <span style={{ color: ACTUAL_BAR }}>actual%</span>. Colour uses the higher of the two.
        </p>
        <div className="overflow-auto max-h-[420px]">
          <table className="border-collapse text-xs w-max">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-background px-1.5 py-1 text-left whitespace-nowrap">
                  Resource
                </th>
                {months.map((m) => (
                  <th
                    key={m}
                    className="p-0.5 text-center font-normal text-muted-foreground w-16"
                  >
                    {monthLabel(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatGrid.map((row) => (
                <tr key={row.name}>
                  <td className="sticky left-0 z-10 bg-background px-1.5 py-0.5 font-medium whitespace-nowrap">
                    {row.name}
                  </td>
                  {row.cells.map((c) => {
                    const peak = Math.max(c.planPct, c.actualPct);
                    return (
                      <td key={c.month} className="p-0.5">
                        <div
                          className="flex h-8 w-16 flex-col items-center justify-center rounded text-[9px] font-semibold leading-tight"
                          style={{
                            background:
                              peak === 0 ? "rgba(148,163,184,0.25)" : heatColor(peak),
                            color: peak === 0 ? "#64748b" : "#fff",
                          }}
                          title={`${row.name} · ${monthLabel(c.month)}: plan ${c.planPct}% · actual ${c.actualPct}%`}
                        >
                          <span>{c.planPct}%</span>
                          <span className="opacity-90">{c.actualPct}%</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PLAN_BAR }} />
            Top = plan
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: ACTUAL_BAR }}
            />
            Bottom = actual
          </span>
          <div className="flex max-w-xs flex-1 items-center gap-2">
            <span>0%</span>
            <div
              className="h-2 flex-1 rounded"
              style={{
                background:
                  "linear-gradient(to right, rgb(22,163,74), rgb(234,179,8), rgb(220,38,38))",
              }}
            />
            <span>120%</span>
          </div>
        </div>
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart title="Monthly plan vs actual hours" heightClass="h-80">
          <BarChart data={monthlyPlanActual} margin={{ top: 10, right: 20, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis
              fontSize={11}
              label={{ value: "Hours", angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="planHours" name="Plan hours" fill={PLAN_BAR} radius={[3, 3, 0, 0]} />
            <Bar dataKey="actualHours" name="Actual hours" fill={ACTUAL_BAR} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart title="Demand by skill — plan vs actual" heightClass="h-72">
          <BarChart data={bySkill} margin={{ top: 28, right: 12, left: 8, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
            <XAxis
              dataKey="skill"
              fontSize={10}
              angle={-25}
              textAnchor="end"
              interval={0}
              height={56}
            />
            <YAxis
              fontSize={11}
              domain={[0, (dataMax: number) => Math.ceil((dataMax || 0) * 1.18) || 10]}
              label={{ value: "% (FTE)", angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="planPct" name="Plan %" fill={PLAN_BAR} radius={[3, 3, 0, 0]} />
            <Bar dataKey="actualPct" name="Actual %" fill={ACTUAL_BAR} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Resource × Project — plan / actual</SectionTitle>
        <p className="mb-2 text-[12px] text-muted-foreground">
          Cells show plan% / actual% (actual from approved timesheets as % of FTE month). Non-billable
          column appears when unallocated timesheet hours exist. Hover a project code for the full
          name.
        </p>
        <div className="overflow-auto max-h-[480px]">
          <table className="border-collapse text-xs w-max">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-background px-1.5 py-1 text-left whitespace-nowrap">
                  Resource
                </th>
                {rpGrid.cols.map((c) => (
                  <th
                    key={c.id}
                    className="p-0.5 text-center font-normal text-muted-foreground w-16 cursor-default"
                    title={c.title}
                    aria-label={c.title}
                  >
                    <span className="block truncate px-0.5" title={c.title}>
                      {c.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rpGrid.rows.map((row) => (
                <tr key={row.name}>
                  <td className="sticky left-0 z-10 bg-background px-1.5 py-0.5 font-medium whitespace-nowrap">
                    {row.name}
                  </td>
                  {row.cells.map((c) => {
                    const peak = Math.max(c.planPct, c.actualPct);
                    return (
                      <td key={c.projectId} className="p-0.5">
                        <div
                          className="flex h-8 w-16 flex-col items-center justify-center rounded text-[9px] font-semibold leading-tight"
                          style={{
                            background:
                              peak === 0
                                ? "rgba(148,163,184,0.2)"
                                : heatColor(Math.min(120, peak > 100 ? peak : peak / 2 + 30)),
                            color: peak === 0 ? "#64748b" : "#fff",
                          }}
                          title={`${row.name} → ${c.project}: plan ${c.planPct}% · actual ${c.actualPct}%`}
                        >
                          <span>{c.planPct}%</span>
                          <span className="opacity-90">{c.actualPct}%</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      <SectionFrame>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <SectionTitle>Utilisation — plan vs timesheet actuals</SectionTitle>
            <p className="text-[12px] text-muted-foreground">
              Plan % from resource allocations. Actual / billable / non-billable hours from approved
              timesheets (project &amp; work-item bookings plus unallocated non-billable).
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                exportResourceUtilisationCsv(utilisationExportRows);
                toast.success("Utilisation CSV downloaded");
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void exportResourceReportsExcel({
                  utilisation: utilisationExportRows,
                  pva: [],
                })
                  .then(() => toast.success("Resource reports exported"))
                  .catch((e: Error) => toast.error(e.message || "Export failed"));
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Excel
            </Button>
          </div>
        </div>
        <div className="overflow-auto max-h-[420px]">
          <table className="w-max min-w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b bg-[#f1f3f6]">
                <th className="px-2.5 py-2 text-left font-semibold">Resource</th>
                <th className="w-20 px-2.5 py-2 text-right font-semibold tabular-nums">Plan %</th>
                <th className="w-20 px-2.5 py-2 text-right font-semibold tabular-nums">Actual %</th>
                <th className="w-20 px-2.5 py-2 text-right font-semibold tabular-nums">Plan h</th>
                <th className="w-20 px-2.5 py-2 text-right font-semibold tabular-nums">Actual h</th>
                <th className="w-20 px-2.5 py-2 text-right font-semibold tabular-nums">Billable</th>
                <th className="w-24 px-2.5 py-2 text-right font-semibold tabular-nums">
                  Non-billable
                </th>
                <th className="w-24 px-2.5 py-2 text-right font-semibold tabular-nums">
                  Util vs plan
                </th>
                <th className="w-28 px-2.5 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {utilisation.map((u) => (
                <tr key={u.resource} className="border-b border-[#eef0f3]">
                  <td className="px-2.5 py-1.5 font-medium">{u.resource}</td>
                  <td className="w-20 px-2.5 py-1.5 text-right tabular-nums">{u.pct}</td>
                  <td className="w-20 px-2.5 py-1.5 text-right tabular-nums">{u.actualPct}</td>
                  <td className="w-20 px-2.5 py-1.5 text-right tabular-nums">{u.planHours}</td>
                  <td className="w-20 px-2.5 py-1.5 text-right tabular-nums">{u.actualHours}</td>
                  <td className="w-20 px-2.5 py-1.5 text-right tabular-nums">{u.billableHours}</td>
                  <td className="w-24 px-2.5 py-1.5 text-right tabular-nums">
                    {u.nonBillableHours}
                  </td>
                  <td className="w-24 px-2.5 py-1.5 text-right tabular-nums">
                    {u.utilVsPlan == null ? "—" : `${u.utilVsPlan}%`}
                  </td>
                  <td className="w-28 px-2.5 py-1.5">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ background: STATUS_COLOR[u.status] }}
                    >
                      {u.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Monthly plan / actual matrix</SectionTitle>
        <p className="mb-2 text-[12px] text-muted-foreground">
          Same as the heatmap — each cell is plan% / actual%.
        </p>
        <div className="overflow-auto max-h-[420px]">
          <table className="border-collapse text-[12.5px] w-max">
            <thead>
              <tr className="border-b bg-[#f1f3f6]">
                <th className="sticky left-0 z-10 bg-[#f1f3f6] px-2 py-2 text-left font-semibold whitespace-nowrap">
                  Resource
                </th>
                {months.map((m) => (
                  <th
                    key={m}
                    className="w-16 px-1 py-2 text-center font-semibold tabular-nums whitespace-nowrap"
                  >
                    {monthLabel(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatGrid.map((row) => (
                <tr key={row.name} className="border-b border-[#eef0f3]">
                  <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-medium whitespace-nowrap">
                    {row.name}
                  </td>
                  {row.cells.map((c) => (
                    <td key={c.month} className="w-16 px-1 py-1.5 text-center tabular-nums text-[11px]">
                      {c.planPct}/{c.actualPct}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionFrame>
        </>
      ) : null}
    </PageExport>
  );
}
