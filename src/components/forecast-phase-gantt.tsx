import { computeTimelineBounds } from "@/components/portfolio-timeline";
import { fyLabel } from "@/lib/fiscal-year";

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
  gate_name: string;
  start_date?: string | null;
  end_date?: string | null;
  cost?: number;
};

export function ForecastPhaseGantt({
  phases,
  fyStartMonth = 4,
}: {
  phases: ForecastGanttPhase[];
  fyStartMonth?: number;
}) {
  const dated = phases.filter((p) => p.start_date && p.end_date);
  const bounds = computeTimelineBounds(
    dated.map((p) => ({ start_date: p.start_date, end_date: p.end_date })),
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
        <div className="space-y-1.5">
          {phases.map((p, i) => {
            const left = pct(p.start_date);
            const right = pct(p.end_date);
            const width = p.start_date && p.end_date ? Math.max(2, right - left) : 0;
            return (
              <div key={p.gate_name} className="flex items-center gap-2">
                <div className="w-40 shrink-0 truncate text-xs font-medium" title={p.gate_name}>
                  {p.gate_name}
                </div>
                <div className="relative h-6 flex-1 rounded bg-slate-100">
                  {width > 0 && (
                    <div
                      className="absolute top-0.5 h-5 rounded"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: PHASE_COLORS[i % PHASE_COLORS.length],
                      }}
                      title={`${p.gate_name}: ${p.start_date} → ${p.end_date}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Window {fyLabel(bounds.start, fyStartMonth)}–{fyLabel(bounds.end, fyStartMonth)} ·{" "}
          {months[0]?.label} {months[0]?.year} → {months[months.length - 1]?.label}{" "}
          {months[months.length - 1]?.year}
        </p>
      </div>
    </div>
  );
}
