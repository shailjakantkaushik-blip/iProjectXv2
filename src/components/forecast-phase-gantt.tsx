import { computeTimelineBounds } from "@/components/portfolio-timeline";
import { fyLabel } from "@/lib/fiscal-year";
import { forecastPhaseKey } from "@/lib/project-forecast";

const PHASE_COLORS = [
  "#94a3b8",
  "#60a5fa",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#15803d",
  "#0ea5e9",
  "#a855f7",
];

export type ForecastGanttPhase = {
  stream_id?: string | null;
  stream_name?: string | null;
  gate_name: string;
  start_date?: string | null;
  end_date?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  cost?: number;
};

export function ForecastPhaseGantt({
  phases,
  fyStartMonth = 4,
  showActuals = false,
}: {
  phases: ForecastGanttPhase[];
  fyStartMonth?: number;
  showActuals?: boolean;
}) {
  const dated = phases.filter((p) => p.start_date && p.end_date);
  const bounds = computeTimelineBounds(
    dated.flatMap((p) => [
      { start_date: p.start_date, end_date: p.end_date },
      ...(p.actual_start || p.actual_end
        ? [{ start_date: p.actual_start || p.start_date, end_date: p.actual_end || p.end_date }]
        : []),
    ]),
    "All",
    fyStartMonth,
  );
  const { start: rangeStart, totalMs, months, fyGroups } = bounds;
  const monthCount = months.length || 1;

  const pct = (iso?: string | null) => {
    if (!iso || !totalMs) return 0;
    const t = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
    return Math.max(0, Math.min(100, ((t - rangeStart.getTime()) / totalMs) * 100));
  };

  if (dated.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Set the project start date and phase durations to see the month / FY timeline.
      </p>
    );
  }

  const groups: { name: string; rows: ForecastGanttPhase[] }[] = [];
  for (const p of phases) {
    const name = p.stream_name || "Project";
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.rows.push(p);
    else groups.push({ name, rows: [p] });
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div
          className="mb-1 grid text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          style={{ gridTemplateColumns: `repeat(${monthCount}, minmax(0, 1fr))` }}
        >
          {fyGroups.map((g) => (
            <div
              key={g.fy}
              className="border-l border-border px-1 first:border-l-0"
              style={{ gridColumn: `span ${g.span}` }}
            >
              {g.fy}
            </div>
          ))}
        </div>
        <div
          className="mb-2 grid text-[10px] text-muted-foreground"
          style={{ gridTemplateColumns: `repeat(${monthCount}, minmax(0, 1fr))` }}
        >
          {months.map((m) => (
            <div key={m.key} className="truncate border-l border-border/60 px-0.5 first:border-l-0">
              {m.label}
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.name}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.name}
              </div>
              <div className="space-y-1.5">
                {group.rows.map((p, i) => {
                  const left = pct(p.start_date);
                  const right = pct(p.end_date);
                  const width = p.start_date && p.end_date ? Math.max(2, right - left) : 0;
                  const aLeft = pct(p.actual_start);
                  const aRight = pct(p.actual_end);
                  const aWidth =
                    showActuals && p.actual_start && p.actual_end
                      ? Math.max(2, aRight - aLeft)
                      : 0;
                  return (
                    <div key={forecastPhaseKey(p)} className="flex items-center gap-2">
                      <div className="w-40 shrink-0 truncate text-xs font-medium" title={p.gate_name}>
                        {p.gate_name}
                      </div>
                      <div
                        className={`relative flex-1 rounded bg-slate-100 ${showActuals ? "h-8" : "h-6"}`}
                      >
                        {width > 0 && (
                          <div
                            className="absolute rounded bg-sky-500/75"
                            style={{
                              top: showActuals ? 2 : 2,
                              height: showActuals ? 10 : 20,
                              left: `${left}%`,
                              width: `${width}%`,
                              background: PHASE_COLORS[i % PHASE_COLORS.length],
                              opacity: 0.85,
                            }}
                            title={`Plan · ${p.gate_name}: ${p.start_date} → ${p.end_date}`}
                          />
                        )}
                        {aWidth > 0 && (
                          <div
                            className="absolute rounded bg-emerald-600/80"
                            style={{
                              top: 16,
                              height: 10,
                              left: `${aLeft}%`,
                              width: `${aWidth}%`,
                            }}
                            title={`Actual · ${p.gate_name}: ${p.actual_start} → ${p.actual_end}`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {showActuals ? "Blue / colour = plan · Green = actual. " : ""}
          Window {fyLabel(bounds.start, fyStartMonth)}–{fyLabel(bounds.end, fyStartMonth)} ·{" "}
          {months[0]?.label} {months[0]?.year} → {months[months.length - 1]?.label}{" "}
          {months[months.length - 1]?.year}
        </p>
      </div>
    </div>
  );
}
