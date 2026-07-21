import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  Cell,
} from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";

export const Route = createFileRoute("/_authenticated/app/resources")({
  component: ResourcesPage,
});

type Resource = {
  id: string;
  name: string;
  role?: string | null;
  skills?: string | null;
  capacity_hours_week?: number | null;
};
type Allocation = {
  id: string;
  resource_id: string;
  project_id: string;
  period_month: string;
  allocation_percent: number | null;
};
type Project = { id: string; name: string; project_code?: string | null };

const STATUS_COLOR = { Over: "#dc2626", Optimal: "#16a34a", Under: "#f59e0b" } as const;
type Status = keyof typeof STATUS_COLOR;

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

  const { data: resourcesAll = [] } = useQuery({
    queryKey: ["resources", organization?.id],
    queryFn: async () => ((await supabase.from("resources").select("*")).data as Resource[]) ?? [],
    enabled: !!organization,
  });
  const { data: allocationsAll = [] } = useQuery({
    queryKey: ["resource_allocations", organization?.id],
    queryFn: async () =>
      ((await supabase.from("resource_allocations").select("*")).data as Allocation[]) ?? [],
    enabled: !!organization,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects-r", organization?.id],
    queryFn: async () =>
      ((await supabase.from("projects").select("id,name,project_code").order("project_code")).data as Project[]) ??
      [],
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

  const projByIdAll = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
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
    return Array.from(s).sort();
  }, [allocationsAll]);

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
        if (statusFor(avg) !== (statusFilter as Status)) return false;
      }
      return true;
    });
  }, [
    resourcesAll,
    allocationsAll,
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
  const projById = projByIdAll;

  const resetFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setSkillFilter("all");
    setProjectFilter("all");
    setStatusFilter("all");
    setMonthFrom("all");
    setMonthTo("all");
  };

  // Distinct months (sorted, normalized)
  const months = useMemo(() => {
    const s = new Set<string>();
    allocations.forEach((a) => {
      const m = normMonth(a.period_month);
      if (m) s.add(m);
    });
    return Array.from(s).sort();
  }, [allocations]);

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

  // Avg allocation per resource
  const utilisation = useMemo(() => {
    return resources
      .map((r) => {
        const rows = allocations.filter((a) => a.resource_id === r.id);
        const total = rows.reduce((s, a) => s + Number(a.allocation_percent || 0), 0);
        const avg = months.length ? total / months.length : 0;
        return { resource: r.name, pct: Math.round(avg), status: statusFor(avg) };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [resources, allocations, months.length]);

  const kpi = {
    total: resources.length,
    over: utilisation.filter((u) => u.status === "Over").length,
    optimal: utilisation.filter((u) => u.status === "Optimal").length,
    under: utilisation.filter((u) => u.status === "Under").length,
  };

  // Resource × Month heatmap grid — sum ALL allocations for resource+month
  const heatGrid = useMemo(() => {
    return resources.map((r) => {
      const row: { name: string; cells: { month: string; pct: number }[] } = {
        name: r.name,
        cells: [],
      };
      months.forEach((m) => {
        const total = allocations
          .filter((a) => a.resource_id === r.id && a.period_month === m)
          .reduce((s, a) => s + Number(a.allocation_percent || 0), 0);
        row.cells.push({ month: m, pct: Math.round(total) });
      });
      return row;
    });
  }, [resources, allocations, months]);

  // Monthly demand by project (stacked area = simple bar per month)
  const monthlyByProject = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    const projKeys = new Set<string>();
    allocations.forEach((a) => {
      const p = projById.get(a.project_id);
      const pname = p?.name || "—";
      projKeys.add(pname);
      const mk = normMonth(a.period_month);
      const row = map.get(mk) || {};
      row[pname] = (row[pname] || 0) + Number(a.allocation_percent || 0);
      map.set(mk, row);
    });
    const projList = Array.from(projKeys).sort();
    const data = months.map((m) => ({ month: monthLabel(m), ...(map.get(m) || {}) }));
    return { data, projList };
  }, [allocations, months, projById]);

  // Demand by skill (sum of allocation %)
  const bySkill = useMemo(() => {
    const m = new Map<string, number>();
    allocations.forEach((a) => {
      const r = resById.get(a.resource_id);
      const skills = (r?.skills || r?.role || "Unknown")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const share = Number(a.allocation_percent || 0) / (skills.length || 1);
      skills.forEach((s) => m.set(s, (m.get(s) || 0) + share));
    });
    return Array.from(m.entries())
      .map(([skill, pct]) => ({ skill, pct: Math.round(pct) }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 12);
  }, [allocations, resById]);

  // Resource × Project heatmap — one column per project (zeros when no allocation)
  const rpGrid = useMemo(() => {
    const byResProj = new Map<string, Map<string, number>>();
    allocations.forEach((a) => {
      const row = byResProj.get(a.resource_id) || new Map();
      row.set(a.project_id, (row.get(a.project_id) || 0) + Number(a.allocation_percent || 0));
      byResProj.set(a.resource_id, row);
    });
    const cols = projectColumns.map((p) => ({
      id: p.id,
      label: p.project_code ? `${p.project_code}` : p.name,
      title: p.project_code ? `${p.project_code} · ${p.name}` : p.name,
    }));
    const rows = resources.map((r) => ({
      name: r.name,
      cells: cols.map((c) => ({
        projectId: c.id,
        project: c.title,
        pct: Math.round(byResProj.get(r.id)?.get(c.id) || 0),
      })),
    }));
    return { rows, cols };
  }, [allocations, resources, projectColumns]);

  return (
    <PageExport name="Resource_Capacity" title="Resource Capacity & Skill Intelligence">
      <PageHeading icon="👥">Resource Capacity & Skill Intelligence</PageHeading>

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
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
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
          title="Resource Utilisation (avg monthly allocation)"
          heightClass="h-80"
          legend={
            <div className="mt-1 flex justify-end gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ background: STATUS_COLOR.Over }}
                />{" "}
                Over
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ background: STATUS_COLOR.Optimal }}
                />{" "}
                Optimal
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ background: STATUS_COLOR.Under }}
                />{" "}
                Under
              </span>
            </div>
          }
        >
          <BarChart data={utilisation} margin={{ top: 20, right: 60, left: 20, bottom: 60 }}>
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
              label={{ value: "Allocation %", angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine
              y={100}
              stroke="#dc2626"
              strokeDasharray="6 4"
              label={{ value: "100% capacity", position: "right", fill: "#dc2626", fontSize: 11 }}
            />
            <ReferenceLine
              y={60}
              stroke="#f59e0b"
              strokeDasharray="2 4"
              label={{ value: "60% floor", position: "right", fill: "#b45309", fontSize: 11 }}
            />
            <Bar dataKey="pct" name="Allocation">
              <LabelList
                dataKey="pct"
                position="top"
                formatter={(v: number) => `${v}%`}
                fontSize={10}
              />
              {utilisation.map((u, i) => (
                <Cell key={i} fill={STATUS_COLOR[u.status]} />
              ))}
            </Bar>
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Month-wise Allocation Heatmap (Resource × Month)</SectionTitle>
        <div className="overflow-auto max-h-[420px]">
          {/* w-max only (not min-w-full) — avoids stretching months into huge gaps */}
          <table className="border-collapse text-xs w-max">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-background px-1.5 py-1 text-left whitespace-nowrap">
                  Resource
                </th>
                {months.map((m) => (
                  <th
                    key={m}
                    className="p-0.5 text-center font-normal text-muted-foreground w-14"
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
                  {row.cells.map((c) => (
                    <td key={c.month} className="p-0.5">
                      <div
                        className="flex h-7 w-14 items-center justify-center rounded text-[10px] font-semibold"
                        style={{
                          background: c.pct === 0 ? "rgba(148,163,184,0.25)" : heatColor(c.pct),
                          color: c.pct === 0 ? "#64748b" : "#fff",
                        }}
                        title={`${row.name} · ${monthLabel(c.month)}: ${c.pct}%`}
                      >
                        {c.pct}%
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground max-w-xs">
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
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart title="Total Monthly Demand by Project" heightClass="h-80">
          <BarChart
            data={monthlyByProject.data}
            margin={{ top: 10, right: 20, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis
              fontSize={11}
              label={{ value: "Allocation %", angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {monthlyByProject.projList.map((p, i) => (
              <Bar
                key={p}
                dataKey={p}
                stackId="d"
                fill={
                  ["#1d4ed8", "#0ea5e9", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#6366f1"][
                    i % 7
                  ]
                }
              />
            ))}
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart title="Demand by Skill" heightClass="h-72">
          <BarChart data={bySkill} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
            <XAxis
              dataKey="skill"
              fontSize={10}
              angle={-25}
              textAnchor="end"
              interval={0}
              height={50}
            />
            <YAxis
              fontSize={11}
              label={{ value: "Allocation %", angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Bar dataKey="pct" fill="#0d9488" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="pct"
                position="top"
                fontSize={10}
                formatter={(v: number) => `${v}%`}
              />
            </Bar>
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Resource × Project Heatmap (total across months)</SectionTitle>
        <p className="mb-2 text-[12px] text-muted-foreground">
          All {rpGrid.cols.length} projects shown as columns (0% = no allocation in the selected
          months). Hover a project code to see the full name. Values are summed % across months.
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
                    className="p-0.5 text-center font-normal text-muted-foreground w-14 cursor-default"
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
                  {row.cells.map((c) => (
                    <td key={c.projectId} className="p-0.5">
                      <div
                        className="flex h-7 w-14 items-center justify-center rounded text-[10px] font-semibold"
                        style={{
                          background:
                            c.pct === 0
                              ? "rgba(148,163,184,0.2)"
                              : heatColor(Math.min(100, c.pct / 3)),
                          color: c.pct === 0 ? "#64748b" : "#fff",
                        }}
                        title={`${row.name} → ${c.project}: ${c.pct}%`}
                      >
                        {c.pct}%
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Utilisation</SectionTitle>
        <div className="overflow-auto max-h-[420px]">
          {/* Explicit grid columns so header + value share the same alignment */}
          <table className="w-full max-w-xl border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b bg-[#f1f3f6]">
                <th className="px-2.5 py-2 text-left font-semibold">Resource</th>
                <th className="w-28 px-2.5 py-2 text-right font-semibold tabular-nums">
                  Allocation %
                </th>
                <th className="w-28 px-2.5 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {utilisation.map((u) => (
                <tr key={u.resource} className="border-b border-[#eef0f3]">
                  <td className="px-2.5 py-1.5 font-medium">{u.resource}</td>
                  <td className="w-28 px-2.5 py-1.5 text-right tabular-nums">{u.pct}</td>
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
        <SectionTitle>Monthly Allocation Matrix</SectionTitle>
        <p className="mb-2 text-[12px] text-muted-foreground">
          Same data as the month heatmap — compact columns so each value sits under its month.
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
                    className="w-14 px-1 py-2 text-center font-semibold tabular-nums whitespace-nowrap"
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
                    <td key={c.month} className="w-14 px-1 py-1.5 text-center tabular-nums">
                      {c.pct}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </PageExport>
  );
}
