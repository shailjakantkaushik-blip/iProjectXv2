import React, { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { fyStartFor as fyStartForOrg, fyEndFor as fyEndForOrg, fyLabel as fyLabelOrg } from "@/lib/fiscal-year";
import { RAG_COLORS } from "@/lib/chart-theme";
import { ExpandablePanel } from "@/components/expandable-panel";
import { summarizeTimelineLaneFinancials } from "@/lib/project-streams";

function money(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
}

export type TimelineBounds = {
  start: Date; end: Date; totalMs: number;
  months: { key: string; label: string; year: number; monthIndex: number; fy: string }[];
  fyGroups: { fy: string; span: number }[];
};

export function computeTimelineBounds(projects: any[], fy: string = "All", fyStartMonth: number = 4): TimelineBounds {
  const fyStartFor = (d: Date) => fyStartForOrg(d, fyStartMonth);
  const fyEndFor = (d: Date) => fyEndForOrg(d, fyStartMonth);
  const fyLabel = (d: Date) => fyLabelOrg(d, fyStartMonth);
  const startIdx = Math.max(1, Math.min(12, fyStartMonth)) - 1;

  let minD: Date | null = null;
  let maxD: Date | null = null;

  if (fy !== "All") {
    const yy = parseInt(fy.replace(/[^0-9]/g, ""), 10);
    const endYear = 2000 + yy;
    minD = new Date(endYear - 1, startIdx, 1);
    maxD = new Date(endYear, startIdx, 0, 23, 59, 59);
  } else {
    projects.forEach((p: any) => {
      if (p.start_date) { const d = new Date(p.start_date); if (!minD || d < minD) minD = d; }
      if (p.end_date)   { const d = new Date(p.end_date);   if (!maxD || d > maxD) maxD = d; }
    });
    if (!minD || !maxD) {
      const now = new Date();
      minD = fyStartFor(now); maxD = fyEndFor(now);
    } else {
      minD = fyStartFor(minD); maxD = fyEndFor(maxD);
    }
  }

  const months: TimelineBounds["months"] = [];
  const cur = new Date(minD.getFullYear(), minD.getMonth(), 1);
  while (cur <= maxD) {
    months.push({
      key: `${cur.getFullYear()}-${cur.getMonth()}`,
      label: cur.toLocaleString("en", { month: "short" }),
      year: cur.getFullYear(),
      monthIndex: cur.getMonth(),
      fy: fyLabel(cur),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  const fyGroups: { fy: string; span: number }[] = [];
  months.forEach((m) => {
    const last = fyGroups[fyGroups.length - 1];
    if (last && last.fy === m.fy) last.span += 1;
    else fyGroups.push({ fy: m.fy, span: 1 });
  });

  return { start: minD, end: maxD, totalMs: maxD.getTime() - minD.getTime(), months, fyGroups };
}

export function GanttGroup({
  title, items, bounds, gatesByProject, collapsed, onToggle, showPlannedVsActual = false, showGates,
  showProjectTimeline, onShowProjectTimelineChange,
}: {
  title: string; items: any[]; bounds: TimelineBounds;
  gatesByProject: Map<string, any[]>; collapsed: boolean; onToggle: () => void;
  showPlannedVsActual?: boolean;
  showGates?: boolean;
  /** Controlled: show project rollup lane checkbox (parent expands lanes). */
  showProjectTimeline?: boolean;
  onShowProjectTimelineChange?: (v: boolean) => void;
}) {
  const [internalShowGates, setInternalShowGates] = useState(true);
  const isControlled = showGates !== undefined;
  const effectiveShowGates = isControlled ? !!showGates : internalShowGates;
  const showProjectToggle = typeof onShowProjectTimelineChange === "function";
  const { start: rangeStart, totalMs, months, fyGroups } = bounds;
  const monthShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  const monthCount = months.length || 1;
  // Align to the equal-width month grid used by the header. Because months
  // have different day counts, a plain time-proportion (ms/totalMs) drifts
  // from the visual columns. Convert any date into "month index + day fraction"
  // so bars, gate diamonds and the TODAY line all sit on the same grid.
  const dateToPct = (d: Date) => {
    const y = d.getFullYear();
    const m = d.getMonth();
    let idx = months.findIndex((mm) => mm.year === y && mm.monthIndex === m);
    let frac = 0;
    if (idx === -1) {
      // Out of visible range — clamp to before-start / after-end.
      const first = months[0];
      const last = months[monthCount - 1];
      const firstMs = new Date(first.year, first.monthIndex, 1).getTime();
      const lastMs = new Date(last.year, last.monthIndex + 1, 0, 23, 59, 59).getTime();
      if (d.getTime() < firstMs) return -1;
      if (d.getTime() > lastMs) return 101;
      return 0;
    }
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    frac = (d.getDate() - 1 + d.getHours() / 24) / daysInMonth;
    return ((idx + frac) / monthCount) * 100;
  };
  const todayPct = dateToPct(now);
  const fmtShort = (d: Date) => `${d.getDate()} ${monthShort[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;


  const COL_PROJECT = 240;
  const COL_SPONSOR = 130;
  const COL_FIN = 200;
  const LEFT = COL_PROJECT + COL_SPONSOR + COL_FIN;

  const fin = summarizeTimelineLaneFinancials(items);
  const groupIncurred = fin.incurred;
  const groupApproved = fin.approved;
  const groupFAC = fin.fac;
  const groupBenefits = fin.benefits;
  const groupUtil = fin.utilPct;
  const rGreen = fin.green;
  const rAmber = fin.amber;
  const rRed = fin.red;

  const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex flex-col items-start leading-tight">
      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-[12px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );

  const rangeLabel = fyGroups.length === 1
    ? fyGroups[0].fy
    : `${fyGroups[0].fy} – ${fyGroups[fyGroups.length - 1].fy}`;

  return (
    <div className="relative rounded-md border border-border bg-surface shadow-sm">
      {(!isControlled || showProjectToggle) && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-2 z-30 flex flex-wrap items-center justify-end gap-1.5"
        >
          {showProjectToggle && (
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background/95 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm hover:bg-muted"
              title="Show project rollup lane (start→end + financials from streams)"
            >
              <input
                type="checkbox"
                checked={!!showProjectTimeline}
                onChange={(e) => onShowProjectTimelineChange?.(e.target.checked)}
                className="h-3 w-3"
              />
              Project timeline
            </label>
          )}
          {!isControlled && (
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background/95 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm hover:bg-muted"
              title="Show or hide stage-gate markers"
            >
              <input
                type="checkbox"
                checked={effectiveShowGates}
                onChange={(e) => setInternalShowGates(e.target.checked)}
                className="h-3 w-3"
              />
              Stage gates
            </label>
          )}
        </div>
      )}
      <button
        onClick={onToggle}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-3 py-2 pr-32 text-left hover:bg-muted/50"
        aria-expanded={!collapsed}
      >
        <div className="flex min-w-0 items-center gap-2">
          {collapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{rangeLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Stat label="Projects" value={fin.projectCount} />
          <Stat label="Approved" value={money(groupApproved)} />
          <Stat label="Actual" value={money(groupIncurred)} />
          <Stat label="FAC" value={money(groupFAC)} />
          <Stat label="Utilisation" value={`${groupUtil}%`} />
          <Stat label="Benefits" value={money(groupBenefits)} />
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">RAG</span>
            <span className="flex items-center gap-1.5 text-[12px] font-semibold tabular-nums text-foreground">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: RAG_COLORS.Green }} />{rGreen}
              <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: RAG_COLORS.Amber }} />{rAmber}
              <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: RAG_COLORS.Red }} />{rRed}
            </span>
          </div>
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-border p-3 overflow-x-auto">
          <div style={{ minWidth: LEFT + Math.max(560, monthCount * 34) }}>
          <div className="flex items-stretch text-[10px] font-semibold uppercase tracking-wide">
            <div style={{ width: LEFT }} className="shrink-0" />
            <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${monthCount}, minmax(34px, 1fr))` }}>
              {fyGroups.map((g, i) => (
                <div key={`${g.fy}-${i}`}
                  className="border-l border-border/60 bg-muted/40 py-1 text-center text-primary"
                  style={{ gridColumn: `span ${g.span}` }}>{g.fy}</div>
              ))}
            </div>
          </div>
          <div className="flex items-center border-b border-border pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <div style={{ width: COL_PROJECT }} className="shrink-0 pl-1">Project</div>
            <div style={{ width: COL_SPONSOR }} className="shrink-0">Sponsor · Phase</div>
            <div style={{ width: COL_FIN }} className="shrink-0">Budget · Incurred · %</div>
            <div className="relative grid flex-1" style={{ gridTemplateColumns: `repeat(${monthCount}, minmax(34px, 1fr))` }}>
              {months.map((m) => (
                <div key={m.key} className="border-l border-border/60 pl-1 text-center">{m.label}</div>
              ))}
            </div>
          </div>

          <div className="relative">
            {items.map((p: any) => {
              const primaryS = new Date(p.start_date).getTime();
              const primaryE = new Date(p.end_date).getTime();
              // Planned / actual sources (fall back to primary if missing)
              const pS = p.planned_start_date ? new Date(p.planned_start_date).getTime() : primaryS;
              const pE = p.planned_end_date   ? new Date(p.planned_end_date).getTime()   : primaryE;
              const aS = p.actual_start_date  ? new Date(p.actual_start_date).getTime()  : primaryS;
              const aE = p.actual_end_date    ? new Date(p.actual_end_date).getTime()    : primaryE;
              const toPct = (ms: number) => Math.max(0, Math.min(100, dateToPct(new Date(ms))));
              const startPct = toPct(primaryS);
              const endPct = toPct(primaryE);
              const widthPct = Math.max(0.6, endPct - startPct);
              const pStartPct = toPct(pS), pEndPct = toPct(pE);
              const aStartPct = toPct(aS), aEndPct = toPct(aE);
              const pWidthPct = Math.max(0.6, pEndPct - pStartPct);
              const aWidthPct = Math.max(0.6, aEndPct - aStartPct);
              const clippedLeft = dateToPct(new Date(primaryS)) < 0;
              const clippedRight = dateToPct(new Date(primaryE)) > 100;
              const color = RAG_COLORS[p.rag as string] || "#64748b";
              const budget = Number(p.budget || 0);
              const incurred = Number(p.capex_incurred || 0) + Number(p.opex_incurred || 0);
              const pct = budget > 0 ? Math.min(100, Math.round((incurred / budget) * 100)) : 0;
              const overBudget = incurred > budget && budget > 0;
              const slipDays = Math.round((aE - pE) / 86400000);
              // Lane key: stream id for stream lanes; project id for rollup / fallback.
              // Project rollup intentionally omits stream-scoped gates (those sit on stream lanes).
              const laneKey = p.is_project_rollup ? (p.project_id || p.id) : (p.stream_id || p.id);
              const rawGates = p.is_project_rollup
                ? []
                : (gatesByProject.get(laneKey) || []).filter((g: any) => g.planned_date || g.actual_date);
              const projGates = rawGates
                .slice()
                .sort((a: any, b: any) =>
                  new Date(a.actual_date || a.planned_date).getTime() -
                  new Date(b.actual_date || b.planned_date).getTime()
                );
              const rowKey = p.is_project_rollup ? `rollup:${p.project_id || p.id}` : p.id;

              return (
                <div
                  key={rowKey}
                  className={`flex items-center border-b border-border/40 py-2 hover:bg-muted/30 ${
                    p.is_project_rollup ? "bg-muted/20" : ""
                  }`}
                >
                  <div style={{ width: COL_PROJECT }} className="shrink-0 pl-1 pr-2">
                    <Link
                      to="/app/project-infographic"
                      search={{ pid: p.project_id || p.id }}
                      className="block truncate text-[12px] font-medium text-foreground hover:text-primary hover:underline"
                      title={p.name}
                    >
                      {p.is_project_rollup ? (
                        <>
                          <span>{p.name}</span>
                          <span className="ml-1.5 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                            Project
                          </span>
                        </>
                      ) : p.is_stream_lane && p.stream_name ? (
                        <>
                          <span className="text-muted-foreground">{p.project_name || "Project"}</span>
                          <span className="text-muted-foreground"> · </span>
                          <span>{p.stream_name}</span>
                        </>
                      ) : (
                        p.name
                      )}
                    </Link>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {p.project_code ? (
                        <Link
                          to="/app/project-infographic"
                          search={{ pid: p.project_id || p.id }}
                          className="text-primary hover:underline"
                        >
                          {p.project_code}
                        </Link>
                      ) : "—"}{" "}
                      · {p.is_project_rollup ? "Rollup" : p.is_stream_lane ? "Stream" : p.program || "Unassigned"}
                      {(p.is_stream_lane || p.is_project_rollup) && p.program ? ` · ${p.program}` : ""}
                    </div>
                  </div>
                  <div style={{ width: COL_SPONSOR }} className="shrink-0 pr-2">
                    <div className="truncate text-[11px] text-foreground">{p.sponsor || "—"}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{p.current_phase || "—"}</div>
                  </div>
                  <div style={{ width: COL_FIN }} className="shrink-0 pr-2">
                    <div className="text-[11px] font-medium tabular-nums text-foreground">
                      {money(budget)} <span className="text-muted-foreground">·</span> {money(incurred)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: overBudget ? "#dc2626" : color }} />
                      </div>
                      <span className={`text-[10px] tabular-nums ${overBudget ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>{pct}%</span>
                    </div>
                  </div>
                  <div className={`relative ${showPlannedVsActual ? "h-14" : "h-10"} flex-1 rounded bg-muted/30`}>
                    <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${monthCount}, minmax(34px, 1fr))` }}>
                      {months.map((m, i) => {
                        const prev = months[i - 1];
                        const fyBreak = prev && prev.fy !== m.fy;
                        return <div key={m.key} className={fyBreak ? "border-l-2 border-primary/40" : "border-l border-border/40"} />;
                      })}
                    </div>

                    {showPlannedVsActual ? (
                      <>
                        {/* Planned bar (top) */}
                        <div
                          className="absolute top-1 h-4 rounded shadow-sm"
                          style={{ left: `${pStartPct}%`, width: `${pWidthPct}%`, background: "#0ea5e9", opacity: 0.9 }}
                          title={`Planned · ${p.planned_start_date || "—"} → ${p.planned_end_date || "—"}`}
                        >
                          {pWidthPct > 12 && (
                            <div className="flex h-full items-center justify-between px-1.5 text-[9px] font-semibold text-white">
                              <span className="truncate">PLAN · {fmtShort(new Date(pS))}</span>
                              <span className="truncate">{fmtShort(new Date(pE))}</span>
                            </div>
                          )}
                        </div>
                        {/* Actual bar (bottom) */}
                        <div
                          className="absolute bottom-1 h-4 rounded shadow-sm"
                          style={{ left: `${aStartPct}%`, width: `${aWidthPct}%`, background: color, opacity: 0.95 }}
                          title={`Actual · ${p.actual_start_date || "—"} → ${p.actual_end_date || "—"} · slip ${slipDays >= 0 ? "+" : ""}${slipDays}d`}
                        >
                          <div className="h-full" style={{ width: `${pct}%`, background: "rgba(255,255,255,0.28)" }} />
                          {aWidthPct > 12 && (
                            <div className="absolute inset-0 flex items-center justify-between px-1.5 text-[9px] font-semibold text-white">
                              <span className="truncate">ACT · {fmtShort(new Date(aS))}</span>
                              <span className="truncate">{fmtShort(new Date(aE))}</span>
                            </div>
                          )}
                        </div>
                        {/* Slip badge at end of actual bar */}
                        {slipDays !== 0 && aEndPct > 2 && aEndPct < 100 && (
                          <div className="absolute -translate-x-1/2 rounded px-1 text-[9px] font-bold text-white shadow"
                            style={{
                              left: `${aEndPct}%`, bottom: 20,
                              background: slipDays > 0 ? "#dc2626" : "#15803d",
                            }}
                            title={`${slipDays > 0 ? "Slipped" : "Ahead"} by ${Math.abs(slipDays)} days`}>
                            {slipDays > 0 ? "+" : ""}{slipDays}d
                          </div>
                        )}
                      </>
                    ) : (
                      <div
                        className="absolute top-2 h-6 shadow-sm"
                        style={{
                          left: `${startPct}%`, width: `${widthPct}%`, background: color, opacity: 0.9,
                          borderTopLeftRadius: clippedLeft ? 0 : 6,
                          borderBottomLeftRadius: clippedLeft ? 0 : 6,
                          borderTopRightRadius: clippedRight ? 0 : 6,
                          borderBottomRightRadius: clippedRight ? 0 : 6,
                        }}
                        title={`${p.start_date} → ${p.end_date} · ${money(budget)} budget · ${money(incurred)} incurred (${pct}%)`}
                      >
                        <div className="h-full" style={{ width: `${pct}%`, background: "rgba(255,255,255,0.28)", borderTopLeftRadius: clippedLeft ? 0 : 6, borderBottomLeftRadius: clippedLeft ? 0 : 6 }} />
                        {widthPct > 10 && (
                          <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-medium text-white">
                            <span className="truncate">{fmtShort(new Date(primaryS))} → {fmtShort(new Date(primaryE))}</span>
                            <span className="tabular-nums">{money(incurred)}/{money(budget)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {effectiveShowGates && (showPlannedVsActual ? (
                      <>
                        {/* Planned-date gates aligned with the planned (top) bar */}
                        {projGates.filter((g: any) => g.planned_date).map((g: any) => {
                          const gd = new Date(g.planned_date).getTime();
                          let pctX = dateToPct(new Date(gd));
                          const outside = pctX < 0 || pctX > 100;
                          pctX = Math.max(0.5, Math.min(99.5, pctX));
                          const label = String(g.gate_name || "Gate");
                          return (
                            <div key={`p-${g.id}`} className="absolute z-20 -translate-x-1/2" style={{ left: `${pctX}%`, top: -6, opacity: outside ? 0.5 : 1 }}
                              title={`PLAN · ${label} · ${g.planned_date}${outside ? " (outside visible range)" : ""}`}>
                              <div className="flex flex-col items-center">
                                <div className="h-2.5 w-2.5 rotate-45 border border-white shadow" style={{ background: "#0ea5e9" }} />
                                <div className="mt-0.5 max-w-[70px] truncate rounded bg-sky-50 px-1 text-[8px] font-medium text-sky-900 shadow-sm">{label.slice(0, 12)}</div>
                              </div>
                            </div>
                          );
                        })}
                        {/* Actual-date gates aligned with the actual (bottom) bar */}
                        {projGates.filter((g: any) => g.actual_date).map((g: any) => {
                          const gd = new Date(g.actual_date).getTime();
                          let pctX = dateToPct(new Date(gd));
                          const outside = pctX < 0 || pctX > 100;
                          pctX = Math.max(0.5, Math.min(99.5, pctX));
                          const st = String(g.status || "Pending").toLowerCase();
                          const gcolor = st.includes("reject") || st.includes("fail") ? "#dc2626" : "#15803d";
                          const label = String(g.gate_name || "Gate");
                          return (
                            <div key={`a-${g.id}`} className="absolute z-20 -translate-x-1/2" style={{ left: `${pctX}%`, bottom: -6, opacity: outside ? 0.5 : 1 }}
                              title={`ACTUAL · ${label} · ${g.actual_date} · ${g.status || "Complete"}${outside ? " (outside visible range)" : ""}`}>
                              <div className="flex flex-col items-center">
                                <div className="mb-0.5 max-w-[70px] truncate rounded bg-emerald-50 px-1 text-[8px] font-medium text-emerald-900 shadow-sm">{label.slice(0, 12)}</div>
                                <div className="relative h-2.5 w-2.5 rotate-45 border border-white shadow" style={{ background: gcolor }}>
                                  <span className="absolute inset-0 -rotate-45 flex items-center justify-center text-[7px] font-bold leading-none text-white">✓</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    ) : projGates.map((g: any, idx: number) => {
                      const gd = new Date(g.actual_date || g.planned_date).getTime();
                      let pctX = dateToPct(new Date(gd));
                      const outside = pctX < 0 || pctX > 100;
                      pctX = Math.max(0.5, Math.min(99.5, pctX));
                      const st = String(g.status || "Pending").toLowerCase();
                      const isDone = st.includes("approv") || st.includes("complete") || st.includes("pass") || !!g.actual_date;
                      const gcolor = isDone ? "#15803d"
                        : st.includes("reject") || st.includes("fail") ? "#dc2626"
                        : st.includes("progress") || st.includes("review") ? "#f59e0b" : "#3b82f6";
                      const label = String(g.gate_name || "Gate");
                      const stagger = idx % 2 === 0 ? "top-0" : "bottom-0";
                      return (
                        <div key={g.id} className={`absolute z-20 -translate-x-1/2 ${stagger}`}
                          style={{ left: `${pctX}%`, opacity: outside ? 0.5 : 1 }}
                          title={`${label} · planned ${g.planned_date || "—"}${g.actual_date ? ` · actual ${g.actual_date}` : ""} · ${g.status || "Pending"}${outside ? " (outside visible range)" : ""}`}>
                          <div className="flex flex-col items-center">
                            <div className="relative h-3 w-3 rotate-45 border border-white shadow" style={{ background: gcolor }}>
                              {isDone && (
                                <span className="absolute inset-0 -rotate-45 flex items-center justify-center text-[8px] font-bold leading-none text-white">✓</span>
                              )}
                            </div>
                            <div className="mt-0.5 max-w-[80px] truncate rounded bg-white/95 px-1 text-[8px] font-medium text-foreground shadow-sm">
                              {label.slice(0, 14)}
                            </div>
                          </div>
                        </div>
                      );
                    }))}

                  </div>
                </div>
              );
            })}
            {todayPct >= 0 && todayPct <= 100 && (
              <div className="pointer-events-none absolute inset-0 z-10 flex">
                <div style={{ width: LEFT }} className="shrink-0" />
                <div className="relative flex-1">
                  <div className="absolute top-0 bottom-0" style={{ left: `${todayPct}%`, borderLeft: "2px dashed #dc2626" }}>
                    <div className="-ml-6 mt-1 whitespace-nowrap rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      {now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Convenience wrapper: renders a single collapsible FY-aware timeline for the given projects. */
export function PortfolioTimeline({
  projects,
  gates,
  fy = "All",
  title,
  showPlannedVsActual = false,
  showGates,
  showProjectTimeline,
  onShowProjectTimelineChange,
  expandable = true,
  expandToolbar,
  captureId,
  compactMaxHeightClass = "max-h-[min(70vh,800px)]",
}: {
  projects: any[];
  gates: any[];
  fy?: string;
  title?: string;
  showPlannedVsActual?: boolean;
  showGates?: boolean;
  /** Controlled: parent expands lanes with includeProjectRollup when true. */
  showProjectTimeline?: boolean;
  onShowProjectTimelineChange?: (v: boolean) => void;
  /** When true (default), timeline gets an Expand control app-wide. */
  expandable?: boolean;
  expandToolbar?: ReactNode;
  /** Optional id on the gantt body (e.g. for PPT capture). */
  captureId?: string;
  compactMaxHeightClass?: string;
}) {
  const { organization } = useAuth();
  const fyStartMonth = organization?.fy_start_month || 4;
  const bounds = useMemo(() => computeTimelineBounds(projects, fy, fyStartMonth), [projects, fy, fyStartMonth]);
  // Key gates by stream when present so stream lanes get their own markers;
  // also keep project_id buckets for non-stream projects / fallback.
  const gatesByProject = useMemo(() => {
    const m = new Map<string, any[]>();
    gates.forEach((g: any) => {
      const laneKey = g.stream_id || g.project_id;
      if (!m.has(laneKey)) m.set(laneKey, []);
      m.get(laneKey)!.push(g);
      if (g.stream_id && g.project_id) {
        // Do not double-add to project bucket — stream lanes own their gates.
      } else if (!g.stream_id) {
        // already keyed by project_id
      }
    });
    return m;
  }, [gates]);
  const [collapsed, setCollapsed] = useState(false);
  const items = projects.filter((p: any) => p.start_date && p.end_date);
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-6 text-center text-xs text-muted-foreground">
        No projects with start/end dates
      </div>
    );
  }
  const groupTitle = title || (items.length === 1 ? items[0].name || "Project" : "Timeline");
  const body = (
    <div id={captureId}>
      <GanttGroup
        title={groupTitle}
        items={items}
        bounds={bounds}
        gatesByProject={gatesByProject}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        showPlannedVsActual={showPlannedVsActual}
        showGates={showGates}
        showProjectTimeline={showProjectTimeline}
        onShowProjectTimelineChange={onShowProjectTimelineChange}
      />
    </div>
  );
  if (!expandable) return body;
  return (
    <ExpandablePanel
      title={groupTitle}
      toolbar={expandToolbar}
      compactMaxHeightClass={compactMaxHeightClass}
    >
      {body}
    </ExpandablePanel>
  );
}
