import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RagChip, SectionFrame } from "@/components/streamlit";
import { isDoneGateStatus } from "@/lib/project-phase";

const PHASE_COLORS: { match: RegExp; color: string; label: string }[] = [
  { match: /design|discovery|idea/i, color: "#d97706", label: "Design" },
  { match: /build|develop|construct/i, color: "#4f46e5", label: "Build" },
  { match: /sit|integration/i, color: "#2563eb", label: "SIT" },
  { match: /test|uat|qa/i, color: "#0ea5e9", label: "Test" },
  { match: /deploy|go.?live|handover|release/i, color: "#334155", label: "Deploy" },
];

function phaseColor(name: string, i: number) {
  const hit = PHASE_COLORS.find((p) => p.match.test(name));
  if (hit) return hit.color;
  const fallback = ["#d97706", "#4f46e5", "#0ea5e9", "#2563eb", "#334155", "#0d9488"];
  return fallback[i % fallback.length];
}

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}
function moneyFull(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function weeksBetween(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(1, Math.round(ms / (7 * 86400000)));
}

type Gate = {
  id?: string;
  gate_name?: string | null;
  planned_date?: string | null;
  actual_date?: string | null;
  status?: string | null;
  stream_id?: string | null;
  phase_budget?: number | null;
  phase_forecast?: number | null;
  phase_actual?: number | null;
};

type Stream = {
  id: string;
  name: string;
  code?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  budget?: number | null;
  rag?: string | null;
  is_default?: boolean | null;
};

type ResourceRow = {
  key: string;
  name: string;
  role: string | null;
  streamName: string | null;
  months: Record<string, number>;
  total: number;
};

type MonthCol = { key: string; label: string };

export type ProjectSummaryProps = {
  project: any;
  streams: Stream[];
  gates: Gate[];
  resourceRows: ResourceRow[];
  allocationMonths: MonthCol[];
  monthly: any[];
  benefits: any[];
  phaseCards?: Array<{
    name: string;
    budget: number;
    forecast: number;
    actualSpend: number;
    status: string;
  }>;
};

function Sec({ n, title, hint, children }: { n: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="text-[11px] font-bold tracking-[0.12em] text-teal-700">{n}</span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint ? <span className="ml-auto text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function StreamTimeline({
  project,
  streams,
  gates,
}: {
  project: any;
  streams: Stream[];
  gates: Gate[];
}) {
  const lanes = useMemo(() => {
    if (streams.length > 0) return streams;
    return [
      {
        id: project.id,
        name: "Delivery",
        code: project.project_code,
        planned_start_date: project.planned_start_date || project.start_date,
        planned_end_date: project.planned_end_date || project.end_date,
        actual_start_date: project.actual_start_date,
        actual_end_date: project.actual_end_date,
        budget: project.budget,
        rag: project.rag,
        is_default: true,
      } as Stream,
    ];
  }, [streams, project]);

  const range = useMemo(() => {
    const dates = lanes
      .flatMap((s) => [s.planned_start_date, s.actual_start_date, s.planned_end_date, s.actual_end_date])
      .concat([
        project.planned_start_date,
        project.actual_start_date,
        project.planned_end_date,
        project.actual_end_date,
        project.target_go_live,
        project.start_date,
        project.end_date,
      ])
      .filter(Boolean)
      .map((d) => new Date(String(d)).getTime())
      .filter((n) => Number.isFinite(n));
    if (!dates.length) {
      const now = Date.now();
      return { start: now, end: now + 90 * 86400000 };
    }
    return { start: Math.min(...dates), end: Math.max(...dates) };
  }, [lanes, project]);

  const span = Math.max(1, range.end - range.start);
  const months = useMemo(() => {
    const out: { key: string; label: string; left: number; width: number }[] = [];
    const cur = new Date(range.start);
    cur.setDate(1);
    while (cur.getTime() <= range.end) {
      const y = cur.getFullYear();
      const m = cur.getMonth();
      const startMs = new Date(y, m, 1).getTime();
      const endMs = new Date(y, m + 1, 0, 23, 59, 59).getTime();
      const left = ((Math.max(startMs, range.start) - range.start) / span) * 100;
      const right = ((Math.min(endMs, range.end) - range.start) / span) * 100;
      out.push({
        key: `${y}-${m}`,
        label: cur.toLocaleString("en", { month: "short" }),
        left,
        width: Math.max(0.5, right - left),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }, [range, span]);

  const laneAccent = ["#0d9488", "#e11d48", "#2563eb", "#7c3aed", "#d97706"];

  const segmentsFor = (stream: Stream) => {
    const streamGates = gates
      .filter((g) => g.stream_id === stream.id || (!g.stream_id && stream.is_default))
      .filter((g) => g.planned_date || g.actual_date)
      .slice()
      .sort(
        (a, b) =>
          new Date(a.planned_date || a.actual_date || 0).getTime() -
          new Date(b.planned_date || b.actual_date || 0).getTime(),
      );
    const sStart = new Date(
      stream.planned_start_date || stream.actual_start_date || range.start,
    ).getTime();
    const sEnd = new Date(
      stream.planned_end_date || stream.actual_end_date || range.end,
    ).getTime();

    if (streamGates.length === 0) {
      const left = ((sStart - range.start) / span) * 100;
      const width = Math.max(1.5, ((sEnd - sStart) / span) * 100);
      return [{ name: "Delivery", left, width, color: "#4f46e5" }];
    }

    const segs: { name: string; left: number; width: number; color: string }[] = [];
    let cursor = sStart;
    streamGates.forEach((g, i) => {
      const gDate = new Date(g.planned_date || g.actual_date || cursor).getTime();
      const end = Math.max(cursor, gDate);
      const left = ((cursor - range.start) / span) * 100;
      const width = Math.max(1.2, ((end - cursor) / span) * 100);
      const name = g.gate_name || `Gate ${i + 1}`;
      segs.push({ name, left, width, color: phaseColor(name, i) });
      cursor = end;
    });
    if (cursor < sEnd) {
      const left = ((cursor - range.start) / span) * 100;
      const width = Math.max(1.2, ((sEnd - cursor) / span) * 100);
      segs.push({ name: "Close", left, width, color: "#334155" });
    }
    return segs;
  };

  const markersFor = (stream: Stream) =>
    gates
      .filter((g) => g.stream_id === stream.id || (!g.stream_id && stream.is_default))
      .filter((g) => g.planned_date || g.actual_date)
      .map((g) => {
        const t = new Date(g.actual_date || g.planned_date || 0).getTime();
        return {
          name: g.gate_name || "Gate",
          left: ((t - range.start) / span) * 100,
          done: isDoneGateStatus(g.status) || !!g.actual_date,
        };
      })
      .filter((m) => m.left >= -2 && m.left <= 102);

  const projectStart = project.planned_start_date || project.actual_start_date || project.start_date;
  const projectEnd =
    project.actual_end_date || project.planned_end_date || project.target_go_live || project.end_date;

  return (
    <div className="space-y-2">
      <div className="relative mb-1 h-5 border-b border-border/60">
        {months.map((m) => (
          <div
            key={m.key}
            className="absolute top-0 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            style={{ left: `${m.left}%`, width: `${m.width}%` }}
          >
            {m.label}
          </div>
        ))}
      </div>

      {/* Project rollup lane */}
      <div className="grid grid-cols-[140px_1fr] items-center gap-2 sm:grid-cols-[160px_1fr]">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#0f2744]" />
          Project
        </div>
        <div className="relative h-8 rounded-md border border-border bg-muted/40">
          {projectStart && projectEnd ? (
            <div
              className="absolute top-1.5 h-5 rounded bg-[#0f2744]/90 text-[9px] font-semibold text-white flex items-center justify-center px-1"
              style={{
                left: `${((new Date(projectStart).getTime() - range.start) / span) * 100}%`,
                width: `${Math.max(
                  2,
                  ((new Date(projectEnd).getTime() - new Date(projectStart).getTime()) / span) * 100,
                )}%`,
              }}
              title={`${fmtDate(projectStart)} → ${fmtDate(projectEnd)}`}
            >
              <span className="truncate">
                {fmtDate(projectStart)} → {fmtDate(projectEnd)}
              </span>
            </div>
          ) : (
            <div className="flex h-full items-center px-2 text-[10px] text-muted-foreground">No schedule</div>
          )}
        </div>
      </div>

      {lanes.map((s, i) => {
        const segs = segmentsFor(s);
        const marks = markersFor(s);
        const accent = laneAccent[i % laneAccent.length];
        return (
          <div
            key={s.id}
            className="grid grid-cols-[140px_1fr] items-center gap-2 sm:grid-cols-[160px_1fr]"
          >
            <div className="flex min-w-0 flex-col gap-0.5 text-xs font-semibold">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: accent }} />
                <span className="truncate" title={s.name}>
                  {s.name}
                </span>
              </div>
              {(s.code || s.is_default) && (
                <span className="pl-4 font-mono text-[10px] font-medium text-muted-foreground">
                  {(project.project_code || "PRJ").trim()} · {String(s.code || (s.is_default ? "CORE" : "")).toUpperCase()}
                </span>
              )}
            </div>
            <div className="relative h-9 rounded-md border border-border bg-muted/30">
              {segs.map((seg, si) => (
                <div
                  key={`${s.id}-${si}`}
                  className="absolute top-1.5 h-[22px] rounded text-[8px] font-bold text-white flex items-center justify-center px-0.5 overflow-hidden"
                  style={{
                    left: `${Math.max(0, seg.left)}%`,
                    width: `${Math.min(100 - Math.max(0, seg.left), seg.width)}%`,
                    background: seg.color,
                  }}
                  title={seg.name}
                >
                  {seg.width > 8 ? <span className="truncate">{seg.name}</span> : null}
                </div>
              ))}
              {marks.map((m, mi) => (
                <div
                  key={`${s.id}-m-${mi}`}
                  className="absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white shadow"
                  style={{
                    left: `${Math.max(0.5, Math.min(99.5, m.left))}%`,
                    background: m.done ? "#15803d" : accent,
                  }}
                  title={m.name}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectSummary({
  project,
  streams,
  gates,
  resourceRows,
  allocationMonths,
  monthly,
  benefits,
  phaseCards = [],
}: ProjectSummaryProps) {
  const start = project.planned_start_date || project.actual_start_date || project.start_date;
  const end =
    project.target_go_live ||
    project.actual_end_date ||
    project.planned_end_date ||
    project.end_date;
  const weeks = weeksBetween(start, end);
  const budget = Number(project.budget || 0);
  const approved =
    Number(project.approved_funding || 0) ||
    Number(project.capex_approved || 0) + Number(project.opex_approved || 0) ||
    budget;
  const incurred = Number(project.capex_incurred || 0) + Number(project.opex_incurred || 0);
  const fac = Number(project.forecast_at_completion || project.forecast || approved || budget);
  const roleCount = new Set(resourceRows.map((r) => r.role || r.name)).size;
  const confidence =
    project.rag === "Green" ? "HIGH" : project.rag === "Amber" ? "MEDIUM" : project.rag === "Red" ? "LOW" : "—";

  const brief = (project.brief || {}) as any;
  const s1 = brief.section1 || {};
  const mission =
    s1.objective_smart ||
    s1.opportunity_problem ||
    project.description ||
    "Delivery summary across streams, capacity, cost and brief.";

  const budgetRows = useMemo(() => {
    const fromPhases = phaseCards
      .filter((p) => p.budget > 0 || p.actualSpend > 0)
      .map((p) => ({ name: p.name, value: p.budget || p.actualSpend || p.forecast }));
    if (fromPhases.length > 0) return fromPhases;
    if (streams.length > 0) {
      return streams.map((s) => ({ name: s.name, value: Number(s.budget || 0) }));
    }
    return [
      { name: "Approved", value: approved },
      { name: "Incurred", value: incurred },
      { name: "Remaining", value: Math.max(0, approved - incurred) },
    ];
  }, [phaseCards, streams, approved, incurred]);

  const budgetTotal = budgetRows.reduce((s, r) => s + r.value, 0) || approved || budget;
  const pieData = budgetRows
    .filter((r) => r.value > 0)
    .map((r, i) => ({
      name: r.name,
      value: r.value,
      fill: phaseColor(r.name, i),
    }));

  const monthlyRows = useMemo(() => {
    const byMonth = new Map<string, { label: string; planned: number; actual: number; forecast: number }>();
    for (const m of monthly as any[]) {
      const d = new Date(m.period_month);
      if (Number.isNaN(d.getTime())) continue;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const key = String(m.period_month).slice(0, 7);
      const cur = byMonth.get(key) || { label, planned: 0, actual: 0, forecast: 0 };
      cur.planned += Number(m.capex_planned || 0) + Number(m.opex_planned || 0);
      cur.actual += Number(m.capex_actual || 0) + Number(m.opex_actual || 0);
      cur.forecast += Number(m.capex_forecast || 0) + Number(m.opex_forecast || 0);
      byMonth.set(key, cur);
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [monthly]);

  const monthlyChart = monthlyRows.map((m, i) => ({
    ...m,
    spend: m.actual || m.forecast || m.planned,
    fill: phaseColor(m.label, i),
  }));
  const monthlyTotal = monthlyRows.reduce((s, m) => s + (m.actual || m.forecast || m.planned), 0);

  const heatMonths = allocationMonths.length
    ? allocationMonths
    : monthlyRows.slice(0, 6).map((m, i) => ({ key: `m${i}`, label: m.label }));

  const heatRows = useMemo(() => {
    // Prefer role rollup for a cleaner heatmap like the reference
    const byRole = new Map<string, ResourceRow>();
    for (const r of resourceRows) {
      const role = r.role || r.name;
      if (!byRole.has(role)) {
        byRole.set(role, {
          key: role,
          name: role,
          role,
          streamName: null,
          months: {},
          total: 0,
        });
      }
      const row = byRole.get(role)!;
      for (const [k, v] of Object.entries(r.months)) {
        row.months[k] = (row.months[k] || 0) + v;
        row.total += v;
      }
    }
    const roles = Array.from(byRole.values()).sort((a, b) => b.total - a.total).slice(0, 10);
    return roles.length ? roles : resourceRows.slice(0, 10);
  }, [resourceRows]);

  const heatClass = (pct: number) => {
    if (pct <= 0) return "bg-slate-100 text-slate-400";
    if (pct < 30) return "bg-teal-100 text-teal-900";
    if (pct < 70) return "bg-teal-300 text-teal-950";
    return "bg-teal-600 text-white font-semibold";
  };

  const benefitCards = benefits.length
    ? benefits.slice(0, 4).map((b: any) => ({
        title: b.title || "Benefit",
        body: b.description || `Target ${money(Number(b.target_value || 0))} · Realised ${money(Number(b.realised_value || 0))}`,
      }))
    : [
        {
          title: "Outcomes",
          body: s1.key_metrics_success || project.benefits_target
            ? `Benefits target ${money(Number(project.benefits_target || 0))}`
            : "Capture benefits in the register to populate this section.",
        },
        {
          title: "Controls",
          body: "Stage gates and stream ownership keep delivery assurance visible.",
        },
        {
          title: "Visibility",
          body: "Schedule, cost and capacity roll up from streams to the project.",
        },
        {
          title: "Go-live focus",
          body: project.target_go_live
            ? `Target go-live ${fmtDate(project.target_go_live)}`
            : "Set target go-live on the project for the summary header.",
        },
      ];

  return (
    <div className="space-y-4">
      {/* Hero */}
      <SectionFrame className="!p-0 overflow-hidden border-0">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#0f2744] via-[#1e3a5f] to-[#164e63] px-5 py-5 text-white shadow-lg">
          <div className="pointer-events-none absolute -right-16 -bottom-20 h-64 w-64 rounded-full bg-teal-500/20 blur-2xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 max-w-2xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                Project Summary · {project.project_code || "—"}
                {project.program ? ` · ${project.program}` : ""}
              </div>
              <h2 className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
                {project.name}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300 line-clamp-3">{mission}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <RagChip rag={project.rag} />
                <span>Sponsor: {project.sponsor || "—"}</span>
                <span>·</span>
                <span>{project.status || "—"}</span>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-[420px] lg:grid-cols-5">
              {[
                { l: "Duration", v: weeks ? `${weeks} wks` : "—" },
                { l: "Go-Live", v: fmtDate(project.target_go_live || end) },
                { l: "Total cost", v: money(approved || budget || fac) },
                { l: "Key roles", v: roleCount ? `${roleCount}+` : "—" },
                { l: "Confidence", v: confidence, ok: confidence === "HIGH" },
              ].map((k) => (
                <div
                  key={k.l}
                  className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-2 backdrop-blur-sm"
                >
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-300">{k.l}</div>
                  <div className={`mt-0.5 text-sm font-bold ${k.ok ? "text-emerald-300" : "text-white"}`}>
                    {k.v}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionFrame>

      <Sec n="01" title="Delivery timeline" hint="Streams · phase bars · gate milestones">
        <StreamTimeline project={project} streams={streams} gates={gates} />
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          {PHASE_COLORS.map((p) => (
            <span key={p.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: p.color }} />
              {p.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rotate-45 bg-emerald-700" />
            Milestone
          </span>
        </div>
      </Sec>

      <Sec n="02" title="Resource plan" hint="Allocation % by role · month">
        {heatRows.length === 0 || heatMonths.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No resource allocations yet. Add them in Data Editor or Capacity.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left font-semibold text-muted-foreground">Role</th>
                  {heatMonths.map((m) => (
                    <th key={m.key} className="px-1 py-1 text-center font-semibold text-muted-foreground">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatRows.map((r) => (
                  <tr key={r.key}>
                    <td className="whitespace-nowrap px-2 py-1 font-medium">{r.name}</td>
                    {heatMonths.map((m) => {
                      const pct = Math.round(r.months[m.key] || 0);
                      return (
                        <td key={m.key} className="p-0.5 text-center">
                          <div
                            className={`mx-auto flex h-7 min-w-[48px] items-center justify-center rounded ${heatClass(pct)}`}
                          >
                            {pct > 0 ? `${pct}%` : "·"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sec>

      <div className="grid gap-4 lg:grid-cols-2">
        <Sec n="03" title="Budget summary" hint="Phase / stream cost mix">
          <table className="st-table text-xs">
            <thead>
              <tr>
                <th>Component</th>
                <th className="text-right">Amount</th>
                <th className="text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {budgetRows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="text-right tabular-nums">{moneyFull(r.value)}</td>
                  <td className="text-right tabular-nums text-muted-foreground">
                    {budgetTotal ? `${((r.value / budgetTotal) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total</td>
                <td className="text-right tabular-nums">{moneyFull(budgetTotal)}</td>
                <td className="text-right">100%</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-4">
            <div className="h-28 w-28 shrink-0">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={28} outerRadius={48} paddingAngle={2}>
                      {pieData.map((d) => (
                        <Cell key={d.name} fill={d.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => moneyFull(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : null}
            </div>
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <div>Approved {moneyFull(approved)}</div>
              <div>Incurred {moneyFull(incurred)}</div>
              <div>FAC {moneyFull(fac)}</div>
            </div>
          </div>
        </Sec>

        <Sec n="04" title="Monthly cost forecast" hint="Plan / actual / forecast cashflow">
          {monthlyRows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              No monthly financials yet.
            </div>
          ) : (
            <>
              <table className="st-table text-xs">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-right">Plan</th>
                    <th className="text-right">Actual</th>
                    <th className="text-right">Forecast</th>
                    <th className="text-right">% total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.map((m) => {
                    const spend = m.actual || m.forecast || m.planned;
                    return (
                      <tr key={m.label}>
                        <td>{m.label}</td>
                        <td className="text-right tabular-nums">{money(m.planned)}</td>
                        <td className="text-right tabular-nums">{money(m.actual)}</td>
                        <td className="text-right tabular-nums">{money(m.forecast)}</td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {monthlyTotal ? `${((spend / monthlyTotal) * 100).toFixed(0)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-3 h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={40} />
                    <Tooltip formatter={(v: number) => moneyFull(v)} />
                    <Bar dataKey="spend" radius={[4, 4, 0, 0]}>
                      {monthlyChart.map((d) => (
                        <Cell key={d.label} fill={d.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Sec>
      </div>

      <Sec n="05" title="Key benefits">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {benefitCards.map((b, i) => (
            <div
              key={`${b.title}-${i}`}
              className="rounded-lg border border-border bg-gradient-to-b from-white to-slate-50 p-3"
            >
              <div className="mb-2 grid h-7 w-7 place-items-center rounded-md bg-teal-50 text-xs font-bold text-teal-700">
                {i + 1}
              </div>
              <div className="text-sm font-semibold">{b.title}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{b.body}</p>
            </div>
          ))}
        </div>
      </Sec>

      <Sec n="06" title="Delivery approach">
        <div className="grid gap-2 md:grid-cols-3">
          {[
            {
              t: "Stream-based delivery",
              d: streams.length
                ? `${streams.length} stream${streams.length > 1 ? "s" : ""} own dates, gates and spend; project is the rollup.`
                : "Core stream owns delivery; add lanes when work runs in parallel.",
            },
            {
              t: "Iterative & test-driven",
              d: "Design → build → test → integrate → UAT with quality gates at each milestone.",
            },
            {
              t: "Milestone discipline",
              d: "Gate diamonds on the timeline track sign-off, SIT/UAT complete and go-live per stream.",
            },
          ].map((x) => (
            <div key={x.t} className="rounded-r-lg border border-l-4 border-border border-l-teal-600 bg-slate-50/80 px-3 py-2">
              <div className="text-sm font-semibold">{x.t}</div>
              <p className="mt-1 text-[11px] text-muted-foreground">{x.d}</p>
            </div>
          ))}
        </div>
      </Sec>

      <Sec n="07" title="Project Brief" hint="From the Brief form on this page">
        <div className="grid gap-2 md:grid-cols-2">
          {[
            { h: "Background", v: s1.background_context },
            { h: "Opportunity / problem", v: s1.opportunity_problem },
            { h: "Objectives", v: s1.objective_smart },
            {
              h: "Scope",
              v: [s1.scope_in && `In: ${s1.scope_in}`, s1.scope_out && `Out: ${s1.scope_out}`]
                .filter(Boolean)
                .join("\n\n"),
            },
            { h: "Assumptions & constraints", v: s1.assumptions_constraints },
            { h: "Success measures", v: s1.key_metrics_success },
          ].map((p) => (
            <div key={p.h} className="rounded-lg border border-dashed border-slate-300 bg-[#fbfdff] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{p.h}</div>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                {p.v?.trim() ? p.v : "— Add in Project Brief below —"}
              </p>
            </div>
          ))}
        </div>
      </Sec>
    </div>
  );
}
