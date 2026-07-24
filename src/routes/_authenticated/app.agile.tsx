import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/agile")({ component: Page });

function Page() {
  const { organization } = useAuth();

  const { data: projects = [] } = useQuery({
    queryKey: ["agile-projects", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, project_code, name, delivery_method")
        .order("project_code");
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  const { data: sprints = [] } = useQuery({
    queryKey: ["sprints", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("sprints").select("*").order("sprint_number");
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  const agileProjects = useMemo(
    () => projects.filter((p: any) => ["Agile", "Hybrid"].includes(p.delivery_method)),
    [projects],
  );
  const projById = useMemo(
    () => Object.fromEntries(agileProjects.map((p: any) => [p.id, p])),
    [agileProjects],
  );

  // Portfolio KPIs
  const activeSprints = sprints.filter(
    (s: any) => (s.status || "").toLowerCase() === "active",
  ).length;
  const completedSprints = sprints.filter(
    (s: any) => (s.status || "").toLowerCase() === "complete",
  );
  const totalCommitted = sprints.reduce(
    (s: number, x: any) => s + Number(x.planned_points || 0),
    0,
  );
  const totalCompleted = sprints.reduce(
    (s: number, x: any) => s + Number(x.completed_points || 0),
    0,
  );
  const avgVelocity = completedSprints.length
    ? completedSprints.reduce((s: number, x: any) => s + Number(x.completed_points || 0), 0) /
      completedSprints.length
    : 0;
  const sayDo = totalCommitted > 0 ? (totalCompleted / totalCommitted) * 100 : 0;

  // Portfolio velocity trend – aggregate by sprint_number
  const trendMap: Record<number, { sprint: number; committed: number; completed: number }> = {};
  sprints.forEach((s: any) => {
    const n = Number(s.sprint_number || 0);
    trendMap[n] ||= { sprint: n, committed: 0, completed: 0 };
    trendMap[n].committed += Number(s.planned_points || 0);
    trendMap[n].completed += Number(s.completed_points || 0);
  });
  const trendData = Object.values(trendMap).sort((a, b) => a.sprint - b.sprint);

  // Project drilldown
  const [projectId, setProjectId] = useState<string>("");
  const [sprintId, setSprintId] = useState<string>("");
  const activeProject = projectId || agileProjects[0]?.id || "";
  const projectSprints = useMemo(
    () =>
      sprints
        .filter((s: any) => s.project_id === activeProject)
        .sort((a: any, b: any) => (a.sprint_number || 0) - (b.sprint_number || 0)),
    [sprints, activeProject],
  );

  const sprintColumns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "sprint_number", label: "Sprint #", getValue: (s) => Number(s.sprint_number || 0) },
      { key: "name", label: "Sprint Name" },
      {
        key: "project",
        label: "Project",
        getValue: (s) => projById[s.project_id]?.project_code || "",
      },
      { key: "start_date", label: "Start" },
      { key: "end_date", label: "End" },
      {
        key: "planned_points",
        label: "Points Committed",
        getValue: (s) => Number(s.planned_points || 0),
      },
      {
        key: "completed_points",
        label: "Points Completed",
        getValue: (s) => Number(s.completed_points || 0),
      },
      {
        key: "committed_stories",
        label: "Stories Committed",
        getValue: (s) => Number(s.committed_stories || 0),
      },
      {
        key: "completed_stories",
        label: "Stories Completed",
        getValue: (s) => Number(s.completed_stories || 0),
      },
      { key: "status", label: "Status" },
    ],
    [projById],
  );
  const sprintTable = useColumnarTable(projectSprints, sprintColumns);

  const projSprintsComplete = projectSprints.filter(
    (s: any) => (s.status || "").toLowerCase() === "complete",
  );
  const projAvgVel = projSprintsComplete.length
    ? projSprintsComplete.reduce((s: number, x: any) => s + Number(x.completed_points || 0), 0) /
      projSprintsComplete.length
    : 0;
  const projTotalCommitted = projectSprints.reduce(
    (s: number, x: any) => s + Number(x.planned_points || 0),
    0,
  );
  const projTotalCompleted = projectSprints.reduce(
    (s: number, x: any) => s + Number(x.completed_points || 0),
    0,
  );
  const projSayDo = projTotalCommitted > 0 ? (projTotalCompleted / projTotalCommitted) * 100 : 0;

  const drillData = projectSprints.map((s: any) => ({
    name: s.name || `Sprint ${s.sprint_number}`,
    committed: Number(s.planned_points || 0),
    completed: Number(s.completed_points || 0),
  }));

  // Burndown
  const activeSprint =
    projectSprints.find((s: any) => s.id === sprintId) ||
    projectSprints.filter((s: any) => (s.status || "").toLowerCase() === "complete").slice(-1)[0] ||
    projectSprints[0];

  const burndown = useMemo(() => {
    if (!activeSprint) return [];
    const start = activeSprint.start_date ? new Date(activeSprint.start_date) : new Date();
    const end = activeSprint.end_date ? new Date(activeSprint.end_date) : new Date();
    const totalPts = Number(activeSprint.planned_points || 0);
    const done = Number(activeSprint.completed_points || totalPts);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const rows: any[] = [];
    for (let i = 0; i <= days; i++) {
      const day = new Date(start.getTime() + i * 86400000);
      const ideal = totalPts - (totalPts * i) / days;
      // Actual burns slightly slower/faster than ideal
      const factor = totalPts > 0 ? done / totalPts : 1;
      const actualBurned = (totalPts - ideal) * (factor + (1 - factor) * (i / days) * 0.5);
      const actual = Math.max(0, totalPts - actualBurned);
      rows.push({
        day: day.toISOString().slice(0, 10),
        ideal: Number(ideal.toFixed(1)),
        actual: Number(actual.toFixed(1)),
      });
    }
    return rows;
  }, [activeSprint]);

  return (
    <div>
      <PageHeading
        icon="🏃"
        title="Agile — Sprint Velocity & Burndown"
        subtitle="Hybrid portfolio view. Waterfall projects use Stage Gates; agile / hybrid projects use sprints."
      />

      <div className="grid gap-3 md:grid-cols-6 mb-3">
        <KpiCard label="Agile Projects" value={agileProjects.length} accent="#1d4ed8" />
        <KpiCard label="Active Sprints" value={activeSprints} accent="#0ea5e9" />
        <KpiCard
          label="Avg Velocity (pts/sprint)"
          value={avgVelocity.toFixed(1)}
          accent="#8b5cf6"
        />
        <KpiCard label="Points Committed (all)" value={totalCommitted} accent="#f59e0b" />
        <KpiCard label="Points Completed (all)" value={totalCompleted} accent="#15803d" />
        <KpiCard label="Say/Do Ratio" value={`${sayDo.toFixed(1)}%`} accent="#dc2626" />
      </div>

      <SectionFrame>
        {trendData.length === 0 ? (
          <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
            No sprint data
          </div>
        ) : (
          <ExpandableChart title="Portfolio Velocity Trend" heightClass="h-80">
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="sprint"
                label={{ value: "Sprint #", position: "insideBottom", offset: -5 }}
              />
              <YAxis label={{ value: "Story Points", angle: -90, position: "insideLeft" }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="committed" fill="#94a3b8" name="Committed" />
              <Bar dataKey="completed" fill="#22c55e" name="Completed" />
            </BarChart>
          </ExpandableChart>
        )}
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>🔍 Project Drilldown</SectionTitle>
        <label className="text-xs text-muted-foreground">Select an agile / hybrid project</label>
        <select
          className="mt-1 mb-3 block w-full rounded-md border px-3 py-2 text-sm"
          value={activeProject}
          onChange={(e) => {
            setProjectId(e.target.value);
            setSprintId("");
          }}
        >
          {agileProjects.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.project_code} — {p.name}
            </option>
          ))}
        </select>

        <div className="grid gap-3 md:grid-cols-4 mb-3">
          <KpiCard label="Sprints Complete" value={projSprintsComplete.length} accent="#1d4ed8" />
          <KpiCard label="Avg Velocity" value={projAvgVel.toFixed(1)} accent="#8b5cf6" />
          <KpiCard label="Total Committed" value={projTotalCommitted} accent="#f59e0b" />
          <KpiCard label="Say/Do" value={`${projSayDo.toFixed(1)}%`} accent="#15803d" />
        </div>

        {drillData.length === 0 ? (
          <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
            No sprints for this project
          </div>
        ) : (
          <ExpandableChart title="Sprint Velocity — Committed vs Completed" heightClass="h-80">
            <BarChart data={drillData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                label={{ value: "Sprint", position: "insideBottom", offset: -5 }}
                tick={{ fontSize: 11 }}
              />
              <YAxis label={{ value: "Story Points", angle: -90, position: "insideLeft" }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="committed" fill="#94a3b8" name="Committed" />
              <Bar dataKey="completed" fill="#2563eb" name="Completed" />
              <ReferenceLine
                y={projAvgVel}
                stroke="#f59e0b"
                strokeDasharray="6 4"
                label={{
                  value: `Avg Velocity (${projAvgVel.toFixed(0)})`,
                  position: "insideTopRight",
                  fill: "#f59e0b",
                  fontSize: 11,
                }}
              />
            </BarChart>
          </ExpandableChart>
        )}
      </SectionFrame>

      <SectionFrame>
        <label className="text-xs text-muted-foreground">Sprint</label>
        <select
          className="mt-1 mb-3 block w-full rounded-md border px-3 py-2 text-sm"
          value={activeSprint?.id || ""}
          onChange={(e) => setSprintId(e.target.value)}
        >
          {projectSprints.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name || `Sprint ${s.sprint_number}`}
            </option>
          ))}
        </select>
        {burndown.length === 0 ? (
          <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
            No sprint selected
          </div>
        ) : (
          <ExpandableChart title="Sprint Burndown" heightClass="h-80">
            <LineChart data={burndown}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis label={{ value: "Points Remaining", angle: -90, position: "insideLeft" }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="ideal"
                stroke="#94a3b8"
                strokeDasharray="5 5"
                name="Ideal"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#2563eb"
                name="Actual"
                dot={{ r: 2 }}
              />
            </LineChart>
          </ExpandableChart>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Burndown is synthesised from Committed &amp; Completed points. For a true daily curve, add
          a <code>BurndownDaily</code> sheet (Sprint ID, Day, Points Remaining) in a future release.
        </p>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Sprint History</SectionTitle>
        <ColumnarToolbar
          globalQ={sprintTable.globalQ}
          onGlobalQ={sprintTable.setGlobalQ}
          shown={sprintTable.rows.length}
          total={sprintTable.total}
          dirty={sprintTable.isDirty}
            onClear={sprintTable.clearAll}
          placeholder="Search sprint history…"
        />
        <div className="overflow-auto">
          <table className="st-table">
            <thead>
              <tr>
                {sprintColumns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={sprintTable.filters[col.key]}
                    onFilter={(v) => sprintTable.setColumnFilter(col.key, v)}
                    sortKey={sprintTable.sortKey}
                    sortDir={sprintTable.sortDir}
                    onToggleSort={sprintTable.toggleSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sprintTable.total === 0 ? (
                <tr>
                  <td colSpan={sprintColumns.length} className="text-center text-muted-foreground py-6">
                    No sprints
                  </td>
                </tr>
              ) : sprintTable.rows.length === 0 ? (
                <tr>
                  <td colSpan={sprintColumns.length} className="text-center text-muted-foreground py-6">
                    No sprints match filters.
                  </td>
                </tr>
              ) : (
                sprintTable.rows.map((s: any) => (
                  <tr key={s.id}>
                    <td>{s.sprint_number}</td>
                    <td>{s.name}</td>
                    <td>{projById[s.project_id]?.project_code || "—"}</td>
                    <td>{s.start_date || "—"}</td>
                    <td>{s.end_date || "—"}</td>
                    <td>{s.planned_points ?? "—"}</td>
                    <td>{s.completed_points ?? "—"}</td>
                    <td>{s.committed_stories ?? "—"}</td>
                    <td>{s.completed_stories ?? "—"}</td>
                    <td>{s.status || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </div>
  );
}
