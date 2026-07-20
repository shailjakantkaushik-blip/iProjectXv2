import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip, Legend, LabelList,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app/dependencies")({
  component: DependenciesPage,
});

type Project = {
  id: string; project_id?: string | null; name: string;
  program?: string | null; portfolio?: string | null;
  start_date?: string | null; end_date?: string | null;
  planned_start_date?: string | null; planned_end_date?: string | null;
};
type Dep = {
  id: string; project_id: string; depends_on_project_id: string;
  title?: string | null; dep_type?: string | null; status?: string | null;
  needed_by?: string | null; owner?: string | null;
};

import { DEP_STATUS_COLORS as STATUS_COLORS } from "@/lib/chart-theme";

function normalizeStatus(s?: string | null): "Healthy" | "At Risk" | "Blocked" {
  const v = (s || "").toLowerCase();
  if (v.includes("block")) return "Blocked";
  if (v.includes("risk") || v.includes("amber") || v.includes("warn")) return "At Risk";
  return "Healthy";
}

function DependenciesPage() {
  const { organization } = useAuth();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-dep", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*");
      if (error) throw error;
      return data as Project[];
    },
    enabled: !!organization,
  });

  const { data: deps = [] } = useQuery({
    queryKey: ["dependencies", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("dependencies").select("*");
      if (error) throw error;
      return data as Dep[];
    },
    enabled: !!organization,
  });

  const projById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const rows = useMemo(() => deps.map((d) => {
    const from = projById.get(d.project_id);
    const to = projById.get(d.depends_on_project_id);
    return {
      ...d,
      fromName: from?.name ?? "—",
      fromPortfolio: from?.portfolio || from?.program || "—",
      toName: to?.name ?? "—",
      toPortfolio: to?.portfolio || to?.program || "—",
      status: normalizeStatus(d.status),
      dep_type: d.dep_type || "Finish-Start",
      impact: (d as any).impact || "Medium",
      from, to,
    };
  }), [deps, projById]);

  const total = rows.length;
  const projectsInvolved = new Set(rows.flatMap((r) => [r.project_id, r.depends_on_project_id])).size;
  const healthy = rows.filter((r) => r.status === "Healthy").length;
  const atRisk = rows.filter((r) => r.status === "At Risk").length;
  const blocked = rows.filter((r) => r.status === "Blocked").length;

  // Cross-portfolio: group by fromPortfolio, stacked by status
  const byPortfolio = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const key = r.fromPortfolio;
      const bucket = m.get(key) || { Healthy: 0, "At Risk": 0, Blocked: 0 };
      bucket[r.status] = (bucket[r.status] || 0) + 1;
      m.set(key, bucket);
    }
    return Array.from(m.entries()).map(([portfolio, v]) => ({ portfolio, ...v }));
  }, [rows]);

  // By type & status
  const byType = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const key = r.dep_type;
      const bucket = m.get(key) || { Healthy: 0, "At Risk": 0, Blocked: 0 };
      bucket[r.status] = (bucket[r.status] || 0) + 1;
      m.set(key, bucket);
    }
    return Array.from(m.entries()).map(([type, v]) => ({ type, ...v }));
  }, [rows]);

  return (
    <PageExport name="Cross_Project_Dependencies" title="Cross-Project Dependencies">
      <PageHeading icon="🔗">Cross-Project Dependencies</PageHeading>


      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 mb-4">
        <KpiCard label="Total Links" value={total} />
        <KpiCard label="Projects Involved" value={projectsInvolved} />
        <KpiCard label="Healthy" value={healthy} />
        <KpiCard label="At Risk" value={atRisk} />
        <KpiCard label="Blocked" value={blocked} />
      </div>

      <SectionFrame>
        <SectionTitle>Dependency Timeline — horizontal Gantt with interdependency arrows</SectionTitle>
        <DependencyGantt rows={rows} />
      </SectionFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionFrame>
          <SectionTitle>Cross-Portfolio Dependencies (From → To)</SectionTitle>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={byPortfolio}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis dataKey="portfolio" fontSize={11} label={{ value: "From Portfolio", position: "insideBottom", offset: -4, fontSize: 11 }} />
                <YAxis allowDecimals={false} fontSize={11} label={{ value: "Count", angle: -90, position: "insideLeft", fontSize: 11 }} />
                <Tooltip />
                <Legend />
                {(["Healthy", "At Risk", "Blocked"] as const).map((s) => (
                  <Bar key={s} dataKey={s} stackId="s" fill={STATUS_COLORS[s]}>
                    <LabelList dataKey={s} position="center" fill="#fff" fontSize={11} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionFrame>

        <SectionFrame>
          <SectionTitle>Dependencies by Type & Status</SectionTitle>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={byType}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis dataKey="type" fontSize={11} label={{ value: "Dependency Type", position: "insideBottom", offset: -4, fontSize: 11 }} />
                <YAxis allowDecimals={false} fontSize={11} label={{ value: "Count", angle: -90, position: "insideLeft", fontSize: 11 }} />
                <Tooltip />
                <Legend />
                {(["Healthy", "At Risk", "Blocked"] as const).map((s) => (
                  <Bar key={s} dataKey={s} stackId="s" fill={STATUS_COLORS[s]}>
                    <LabelList dataKey={s} position="center" fill="#fff" fontSize={11} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionFrame>
      </div>

      <SectionFrame>
        <SectionTitle>Dependency Register ({rows.length})</SectionTitle>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No dependencies recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="st-table">
              <thead>
                <tr>
                  <th>From</th><th>From Portfolio</th><th>To</th><th>To Portfolio</th>
                  <th>Dependency Type</th><th>Status</th><th>Impact</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">
                      {r.from ? (
                        <Link to="/app/project-infographic" search={{ pid: r.from.id }} className="text-primary hover:underline">
                          {r.fromName}
                        </Link>
                      ) : r.fromName}
                    </td>
                    <td>{r.fromPortfolio}</td>
                    <td className="font-medium">
                      {r.to ? (
                        <Link to="/app/project-infographic" search={{ pid: r.to.id }} className="text-primary hover:underline">
                          {r.toName}
                        </Link>
                      ) : r.toName}
                    </td>
                    <td>{r.toPortfolio}</td>
                    <td>{r.dep_type}</td>
                    <td>
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ background: STATUS_COLORS[r.status] }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td>{r.impact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </PageExport>
  );
}


/* --------------------------- Dependency Gantt --------------------------- */

type GanttRow = ReturnType<typeof buildRows>[number];

function buildRows(rows: Array<{
  project_id: string; depends_on_project_id: string; status: "Healthy" | "At Risk" | "Blocked";
  from?: Project; to?: Project;
}>) {
  // Unique projects appearing in any dependency
  const seen = new Map<string, { p: Project; outCount: number; inCount: number }>();
  for (const r of rows) {
    if (r.from) {
      const cur = seen.get(r.from.id) || { p: r.from, outCount: 0, inCount: 0 };
      cur.outCount += 1;
      seen.set(r.from.id, cur);
    }
    if (r.to) {
      const cur = seen.get(r.to.id) || { p: r.to, outCount: 0, inCount: 0 };
      cur.inCount += 1;
      seen.set(r.to.id, cur);
    }
  }
  return Array.from(seen.values()).map(({ p, outCount, inCount }) => {
    const start = p.planned_start_date || p.start_date;
    const end = p.planned_end_date || p.end_date;
    return {
      id: p.id, name: p.name, portfolio: p.portfolio || p.program || "—",
      outCount, inCount,
      start: start ? new Date(start) : null,
      end: end ? new Date(end) : null,
    };
  }).filter((r) => r.start && r.end);
}

function DependencyGantt({ rows }: { rows: Array<{
  id: string; project_id: string; depends_on_project_id: string;
  status: "Healthy" | "At Risk" | "Blocked"; from?: Project; to?: Project;
}> }) {
  const laneRows = useMemo(() => buildRows(rows), [rows]);
  const idxById = useMemo(() => {
    const m = new Map<string, number>();
    laneRows.forEach((r, i) => m.set(r.id, i));
    return m;
  }, [laneRows]);

  const [min, max] = useMemo(() => {
    if (laneRows.length === 0) return [new Date(), new Date()];
    let mn = laneRows[0].start!.getTime();
    let mx = laneRows[0].end!.getTime();
    for (const r of laneRows) {
      mn = Math.min(mn, r.start!.getTime());
      mx = Math.max(mx, r.end!.getTime());
    }
    return [new Date(mn), new Date(mx)];
  }, [laneRows]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => setWidth(containerRef.current!.clientWidth));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (laneRows.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">No timeline data available for dependencies.</div>;
  }

  const LABEL_W = 260;
  const ROW_H = 56;
  const BAR_H = 28;
  const chartW = Math.max(300, width - LABEL_W - 24);
  const chartH = laneRows.length * ROW_H + 40;
  const span = Math.max(1, max.getTime() - min.getTime());
  const xFor = (d: Date) => ((d.getTime() - min.getTime()) / span) * chartW;

  // Build FY ticks (Apr-Mar) at quarter granularity
  const ticks: { x: number; label: string; sub: string }[] = [];
  const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
  while (cursor <= max) {
    const m = cursor.getMonth();
    const fyStart = m >= 3 ? cursor.getFullYear() : cursor.getFullYear() - 1;
    const fy = `FY${String((fyStart + 1) % 100).padStart(2, "0")}`;
    const q = m >= 3 && m <= 5 ? 1 : m >= 6 && m <= 8 ? 2 : m >= 9 && m <= 11 ? 3 : 4;
    if (q * 3 - 1 === (m + 12 - 3) % 12 || ticks.length === 0) {
      ticks.push({
        x: xFor(cursor),
        label: `Q${q} ${fy}`,
        sub: cursor.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
      });
    }
    cursor.setMonth(cursor.getMonth() + 3);
  }

  return (
    <div ref={containerRef}>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1"><span className="inline-block h-3 w-6 rounded-sm bg-sky-300" /> Portfolio bar</div>
        <div className="flex items-center gap-1"><span className="inline-block h-0.5 w-6" style={{ background: STATUS_COLORS.Healthy }} /> Dep: Healthy</div>
        <div className="flex items-center gap-1"><span className="inline-block h-0.5 w-6" style={{ background: STATUS_COLORS["At Risk"] }} /> Dep: At Risk</div>
        <div className="flex items-center gap-1"><span className="inline-block h-0.5 w-6" style={{ background: STATUS_COLORS.Blocked }} /> Dep: Blocked</div>
      </div>

      <div className="flex" style={{ minHeight: chartH }}>
        {/* Row labels */}
        <div style={{ width: LABEL_W }} className="pr-3">
          {laneRows.map((r) => (
            <div key={r.id} className="flex items-center text-xs text-slate-700" style={{ height: ROW_H }}>
              <Link
                to="/app/project-infographic"
                search={{ pid: r.id }}
                className="truncate hover:underline"
                title={r.name}
              >
                {r.name}{" "}
                <span className="text-slate-400">(→{r.outCount} · ←{r.inCount})</span>
              </Link>
            </div>
          ))}
        </div>

        {/* Chart */}
        <svg width={chartW} height={chartH} style={{ overflow: "visible" }}>
          <defs>
            {(["Healthy", "At Risk", "Blocked"] as const).map((s) => (
              <marker key={s} id={`arr-${s.replace(/\s/g, "")}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill={STATUS_COLORS[s]} />
              </marker>
            ))}
          </defs>

          {/* Grid + ticks */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={t.x} y1={0} x2={t.x} y2={laneRows.length * ROW_H} stroke="rgba(11,18,32,0.06)" />
            </g>
          ))}

          {/* Bars */}
          {laneRows.map((r, i) => {
            const x = xFor(r.start!);
            const w = Math.max(2, xFor(r.end!) - x);
            const y = i * ROW_H + (ROW_H - BAR_H) / 2;
            return (
              <g key={r.id}>
                <rect x={x} y={y} width={w} height={BAR_H} rx={4} fill="#7dd3fc" stroke="#0284c7" strokeOpacity={0.4} />
                <text x={x + 6} y={y + BAR_H / 2 + 4} fontSize={11} fill="#0c4a6e">{r.name}</text>
              </g>
            );
          })}

          {/* Dependency arrows */}
          {rows.map((r, i) => {
            const fi = r.from ? idxById.get(r.from.id) : undefined;
            const ti = r.to ? idxById.get(r.to.id) : undefined;
            if (fi === undefined || ti === undefined) return null;
            const fromRow = laneRows[fi];
            const toRow = laneRows[ti];
            const x1 = xFor(fromRow.end!);
            const y1 = fi * ROW_H + ROW_H / 2;
            const x2 = xFor(toRow.start!);
            const y2 = ti * ROW_H + ROW_H / 2;
            const color = STATUS_COLORS[r.status];
            const cx = (x1 + x2) / 2;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={color}
                strokeWidth={1.75}
                markerEnd={`url(#arr-${r.status.replace(/\s/g, "")})`}
                opacity={0.85}
              />
            );
          })}

          {/* Bottom axis labels */}
          <g transform={`translate(0,${laneRows.length * ROW_H + 8})`}>
            {ticks.map((t, i) => (
              <g key={i} transform={`translate(${t.x},0)`}>
                <text fontSize={11} fill="#334155" textAnchor="end" x={-4}>{t.label}</text>
                <text fontSize={10} fill="#64748b" textAnchor="end" x={-4} y={14}>{t.sub}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
