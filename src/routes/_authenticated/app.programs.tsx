import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle, PageHeading, KpiCard, RagChip } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
  Cell,
  Legend,
} from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";
import {
  projectApprovedFunding,
  projectForecast,
  projectIncurred,
} from "@/lib/project-finance";
import { projectScheduleEnd, projectScheduleStart, fyOf } from "@/lib/project-dates";

export const Route = createFileRoute("/_authenticated/app/programs")({
  component: ProgramsPage,
});

const COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#22c55e",
  "#f59e0b",
  "#06b6d4",
  "#f43f5e",
  "#84cc16",
];
const REM_SCALE = ["#dc2626", "#f97316", "#facc15", "#a3e635", "#22c55e", "#059669"];

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n || 0)
  );
}
function moneyM(n: number) {
  return "$" + ((n || 0) / 1_000_000).toFixed(2) + "M";
}
function fmtDate(d: any) {
  if (!d) return "—";
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}
function ProgramsPage() {
  const { organization } = useAuth();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => (await supabase.from("projects").select("*")).data ?? [],
    enabled: !!organization,
  });

  const programs = useMemo(() => {
    const m = new Map<string, any>();
    projects.forEach((p: any) => {
      const k = p.program || "Unassigned";
      const cur = m.get(k) || {
        name: k,
        count: 0,
        owner: "NA",
        sponsor: p.sponsor || "—",
        status: "Active",
        budget: 0,
        forecast: 0,
        approved: 0,
        actual: 0,
        fac: 0,
        benefits: 0,
        green: 0,
        amber: 0,
        red: 0,
        active: 0,
        completed: 0,
        startDates: [] as number[],
        endDates: [] as number[],
      };
      cur.count += 1;
      const bud = Number(p.budget || 0);
      const fc = projectForecast(p);
      const inc = projectIncurred(p);
      cur.budget += bud;
      cur.forecast += fc;
      cur.approved += projectApprovedFunding(p);
      cur.actual += inc;
      cur.fac += fc;
      cur.benefits += Number(p.benefits_realised || 0);
      if (p.rag === "Green") cur.green++;
      else if (p.rag === "Amber") cur.amber++;
      else if (p.rag === "Red") cur.red++;
      if (p.status === "In Progress") cur.active++;
      if (p.status === "Completed") cur.completed++;
      const s = projectScheduleStart(p);
      const e = projectScheduleEnd(p);
      if (s) cur.startDates.push(new Date(s).getTime());
      if (e) cur.endDates.push(new Date(e).getTime());
      if (!cur.sponsor || cur.sponsor === "—") cur.sponsor = p.sponsor || "CFO";
      m.set(k, cur);
    });
    const fyStartMonth = organization?.fy_start_month || 4;
    return Array.from(m.values())
      .map((p) => ({
        ...p,
        startFY: p.startDates.length
          ? fyOf(new Date(Math.min(...p.startDates)).toISOString(), fyStartMonth) || "—"
          : "—",
        endFY: p.endDates.length
          ? fyOf(new Date(Math.max(...p.endDates)).toISOString(), fyStartMonth) || "—"
          : "—",
        committedVsBudget: p.forecast - p.budget,
        remaining: Math.max(0, p.approved - p.actual),
        variance: p.approved - p.fac,
        utilisation: p.approved ? p.actual / p.approved : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, organization?.fy_start_month]);

  const totBudget = programs.reduce((s, p) => s + p.budget, 0);
  const totForecast = programs.reduce((s, p) => s + p.forecast, 0);
  const totActual = programs.reduce((s, p) => s + p.actual, 0);
  const totBenefits = programs.reduce((s, p) => s + p.benefits, 0);
  const totRemaining = Math.max(0, totBudget - totActual);

  const [selectedProgram, setSelectedProgram] = useState<string>("");
  const currentProgram = programs.find((p) => p.name === selectedProgram) || programs[0];
  const programProjects = useMemo(
    () => projects.filter((p: any) => (p.program || "Unassigned") === currentProgram?.name),
    [projects, currentProgram],
  );

  const remainingSorted = [...programs].sort((a, b) => b.remaining - a.remaining);
  const remMax = Math.max(1, ...remainingSorted.map((p) => p.remaining));
  const remColor = (v: number) => {
    const idx = Math.min(REM_SCALE.length - 1, Math.floor((v / remMax) * REM_SCALE.length));
    return REM_SCALE[idx];
  };

  const waterfall = [
    { name: "Program Budget", value: totBudget, fill: "#3b82f6" },
    { name: "Committed (Forecast)", value: totForecast, fill: "#22c55e" },
    { name: "Actual Spend", value: totActual, fill: "#f59e0b" },
    { name: "Remaining", value: totRemaining, fill: "#94a3b8" },
  ];

  return (
    <PageExport name="Programs" title="Programs">
      <PageHeading
        icon="🎯"
        title="Programs"
        subtitle="Program-level rollups across the portfolio."
      />

      <SectionFrame>
        <SectionTitle>Portfolio KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Programs" value={programs.length} accent="#3b82f6" />
          <KpiCard label="Projects" value={projects.length} accent="#06b6d4" />
          <KpiCard label="Total Budget" value={money(totBudget)} accent="#8b5cf6" />
          <KpiCard
            label="Incurred"
            value={money(totActual)}
            sub={`${totBudget ? Math.round((totActual / totBudget) * 100) : 0}% util`}
            accent="#f59e0b"
          />
          <KpiCard label="Benefits Realised" value={money(totBenefits)} accent="#22c55e" />
        </div>
      </SectionFrame>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionFrame>
          <ExpandableChart title="Program Budget vs Committed vs Actual" heightClass="h-80">
            <BarChart data={programs} margin={{ top: 10, right: 10, left: 0, bottom: 70 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                angle={-30}
                textAnchor="end"
                interval={0}
                height={70}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={money} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
              />
              <Bar dataKey="budget" name="Budget" fill="#1d4ed8" />
              <Bar dataKey="approved" name="Approved Funding (Projects)" fill="#93c5fd" />
              <Bar dataKey="actual" name="Actual Spend (Projects)" fill="#ef4444" />
            </BarChart>
          </ExpandableChart>
        </SectionFrame>

        <SectionFrame>
          <ExpandableChart title="Remaining Program Budget" heightClass="h-72">
            <BarChart
              data={remainingSorted}
              layout="vertical"
              margin={{ top: 5, right: 60, left: 120, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" tickFormatter={money} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Bar dataKey="remaining" radius={[0, 4, 4, 0]}>
                {remainingSorted.map((p, i) => (
                  <Cell key={i} fill={remColor(p.remaining)} />
                ))}
                <LabelList
                  dataKey="remaining"
                  position="right"
                  formatter={(v: number) => money(v)}
                  style={{ fontSize: 10, fill: "#334155" }}
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
        </SectionFrame>
      </div>

      <SectionFrame>
        <ExpandableChart
          title="Portfolio waterfall — Budget → Committed → Actual → Remaining"
          heightClass="h-72"
        >
          <BarChart data={waterfall} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={money} />
            <Tooltip formatter={(v: number) => money(v)} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {waterfall.map((w, i) => (
                <Cell key={i} fill={w.fill} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                formatter={(v: number) => moneyM(v)}
                style={{ fontSize: 11, fill: "#0f172a", fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>📊 Program Rollup</SectionTitle>
        <div className="overflow-x-auto">
          <table className="st-table text-xs">
            <thead>
              <tr>
                <th>Program</th>
                <th>Owner</th>
                <th>Sponsor</th>
                <th>Status</th>
                <th>Start FY</th>
                <th>End FY</th>
                <th className="text-right">Budget</th>
                <th className="text-right">Forecast</th>
                <th className="text-right">Approved Funding (Projects)</th>
                <th className="text-right">Actual Spend (Projects)</th>
                <th className="text-right">Forecast at Completion (Projects)</th>
                <th className="text-right">Committed vs Program Budget</th>
                <th className="text-right">Remaining Budget</th>
                <th className="text-right">Forecast Variance</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.name}>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.owner}</td>
                  <td>{p.sponsor}</td>
                  <td>{p.status}</td>
                  <td>{p.startFY}</td>
                  <td>{p.endFY}</td>
                  <td className="text-right tabular-nums">
                    {Math.round(p.budget).toLocaleString()}
                  </td>
                  <td className="text-right tabular-nums">
                    {Math.round(p.forecast).toLocaleString()}
                  </td>
                  <td className="text-right tabular-nums">
                    {Math.round(p.approved).toLocaleString()}
                  </td>
                  <td className="text-right tabular-nums">
                    {Math.round(p.actual).toLocaleString()}
                  </td>
                  <td className="text-right tabular-nums">{Math.round(p.fac).toLocaleString()}</td>
                  <td className="text-right tabular-nums">
                    {Math.round(p.committedVsBudget).toLocaleString()}
                  </td>
                  <td className="text-right tabular-nums">
                    {Math.round(p.remaining).toLocaleString()}
                  </td>
                  <td
                    className={`text-right tabular-nums ${p.variance < 0 ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {Math.round(p.variance).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Showing {programs.length} of {programs.length} row(s). Click a column header to sort.
        </p>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>🔍 Program Detail</SectionTitle>
        <label className="text-xs text-slate-600">Select program</label>
        <select
          value={currentProgram?.name ?? ""}
          onChange={(e) => setSelectedProgram(e.target.value)}
          className="mt-1 mb-4 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {programs.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>

        {currentProgram && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Program Budget"
                value={moneyM(currentProgram.budget)}
                accent="#3b82f6"
              />
              <KpiCard label="Committed" value={moneyM(currentProgram.forecast)} accent="#22c55e" />
              <KpiCard
                label="Actual Spend"
                value={moneyM(currentProgram.actual)}
                accent="#f59e0b"
              />
              <KpiCard
                label="Remaining"
                value={moneyM(currentProgram.remaining)}
                sub={`↑ ${(currentProgram.utilisation * 100).toFixed(1)}% used`}
                accent="#8b5cf6"
              />
            </div>

            <div className="mt-4">
              <p className="text-xs text-slate-600 mb-2">
                Projects mapped to <span className="font-semibold">{currentProgram.name}</span>
              </p>
              <div className="overflow-x-auto">
                <table className="st-table text-xs">
                  <thead>
                    <tr>
                      <th>Project ID</th>
                      <th>Project Name</th>
                      <th>Sponsor</th>
                      <th>Status</th>
                      <th>RAG</th>
                      <th className="text-right">Approved Funding</th>
                      <th className="text-right">Actual Spend</th>
                      <th className="text-right">Forecast At Completion</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programProjects.map((p: any) => (
                      <tr key={p.id}>
                        <td className="font-mono text-blue-600">
                          {p.project_id || p.id?.slice(0, 8)}
                        </td>
                        <td>{p.name}</td>
                        <td>{p.sponsor || "—"}</td>
                        <td>{p.status || "—"}</td>
                        <td>{p.rag ? <RagChip rag={p.rag} /> : "—"}</td>
                        <td className="text-right tabular-nums">
                          {Math.round(projectApprovedFunding(p)).toLocaleString()}
                        </td>
                        <td className="text-right tabular-nums">
                          {Math.round(projectIncurred(p)).toLocaleString()}
                        </td>
                        <td className="text-right tabular-nums">
                          {Math.round(projectForecast(p)).toLocaleString()}
                        </td>
                        <td>{fmtDate(projectScheduleStart(p))}</td>
                        <td>{fmtDate(projectScheduleEnd(p))}</td>
                      </tr>
                    ))}
                    {programProjects.length === 0 && (
                      <tr>
                        <td colSpan={10} className="text-center text-slate-500 py-4">
                          No projects mapped.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Showing {programProjects.length} of {programProjects.length} row(s).
              </p>
            </div>
          </>
        )}
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart title="Program Health Distribution" heightClass="h-64">
          <BarChart data={programs} margin={{ top: 15, right: 10, left: 0, bottom: 50 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10 }}
              angle={-25}
              textAnchor="end"
              interval={0}
            />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="green" name="Green" stackId="a" fill="#22c55e" />
            <Bar dataKey="amber" name="Amber" stackId="a" fill="#f59e0b" />
            <Bar dataKey="red" name="Red" stackId="a" fill="#ef4444">
              <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: "#334155" }} />
            </Bar>
          </BarChart>
        </ExpandableChart>
      </SectionFrame>
    </PageExport>
  );
}
