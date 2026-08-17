import { useMemo, useState } from "react";
import {
  addDays,
  DAY_KEYS,
  DAY_LABELS,
  entryWeekTotal,
  workItemWeekdayPlan,
  type DayKey,
} from "@/lib/timesheet";
import {
  DEFAULT_HOURS_PER_DAY,
  hoursLoadStatus,
  hoursLoadTextClass,
  type HoursLoadStatus,
} from "@/lib/resource-capacity";

export type TimesheetCalendarRow = Record<DayKey, number> & {
  billable: boolean;
  work_item_id: string | null;
  project_id: string | null;
  custom_task: string;
};

type WorkItemLite = {
  id: string;
  title?: string | null;
  wbs_code?: string | null;
  status?: string | null;
  estimate_hours?: number | null;
  actual_hours?: number | null;
  planned_start?: string | null;
  planned_end?: string | null;
};

type ProjectLite = {
  id: string;
  name?: string | null;
  project_code?: string | null;
};

function formatDayHeading(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function isTodayIso(iso: string) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return iso === today;
}

function rowLabel(
  row: TimesheetCalendarRow,
  workById: Map<string, WorkItemLite>,
  projectById: Map<string, ProjectLite>,
) {
  if (!row.billable) return row.custom_task.trim() || "Non-billable task";
  const wi = row.work_item_id ? workById.get(row.work_item_id) : null;
  const proj = row.project_id ? projectById.get(row.project_id) : null;
  const code = proj?.project_code || proj?.name || "—";
  const title = wi?.title?.trim() || (wi?.wbs_code ? `WBS ${wi.wbs_code}` : "Work item");
  return `${code} · ${title}`;
}

type Props = {
  weekStart: string;
  editable: boolean;
  draftRows: Record<string, TimesheetCalendarRow>;
  workById: Map<string, WorkItemLite>;
  projectById: Map<string, ProjectLite>;
  hoursPerDay?: number | null;
  onChangeHours: (rowKey: string, dayKey: DayKey, hours: number) => void;
  onChangeCustomTask?: (rowKey: string, value: string) => void;
};

/** Interactive Mon–Sun calendar cards for filling timesheet hours. */
export function TimesheetWeekCalendar({
  weekStart,
  editable,
  draftRows,
  workById,
  projectById,
  hoursPerDay,
  onChangeHours,
  onChangeCustomTask,
}: Props) {
  const entries = useMemo(() => Object.entries(draftRows), [draftRows]);
  const [focusDay, setFocusDay] = useState<number | null>(null);
  const dayCap = Number(hoursPerDay) > 0 ? Number(hoursPerDay) : DEFAULT_HOURS_PER_DAY;

  const dayMeta = useMemo(() => {
    return DAY_KEYS.map((dk, idx) => {
      const date = addDays(weekStart, idx);
      const total = entries.reduce((sum, [, row]) => sum + (Number(row[dk]) || 0), 0);
      const plan = entries.reduce((sum, [, row]) => {
        if (!row.billable || !row.work_item_id) return sum;
        const wi = workById.get(row.work_item_id);
        if (!wi) return sum;
        const { perDay } = workItemWeekdayPlan({
          estimateHours: Number(wi.estimate_hours) || 0,
          actualHours: Number(wi.actual_hours) || 0,
          plannedStart: wi.planned_start,
          plannedEnd: wi.planned_end,
          weekStart,
        });
        return sum + (perDay[dk] || 0);
      }, 0);
      return {
        dk,
        idx,
        date,
        label: DAY_LABELS[idx],
        heading: formatDayHeading(date),
        total,
        plan,
        today: isTodayIso(date),
        weekend: idx >= 5,
      };
    });
  }, [weekStart, entries, workById]);

  return (
    <div className="space-y-3">
      {/* Week strip — day totals at a glance */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {dayMeta.map((d) => {
          const load: HoursLoadStatus | "Empty" =
            d.total > 0 ? hoursLoadStatus(d.total, dayCap) : "Empty";
          const over = load === "Over";
          const under = load === "Under";
          const active = focusDay === d.idx;
          return (
            <button
              key={d.dk}
              type="button"
              onClick={() => setFocusDay(active ? null : d.idx)}
              className={`rounded-lg border px-1.5 py-2 text-center transition-colors ${
                active
                  ? "border-sky-400 bg-sky-50 ring-1 ring-sky-300"
                  : d.today
                    ? "border-sky-300 bg-sky-50/60"
                    : d.weekend
                      ? "border-border bg-muted/40"
                      : "border-border bg-surface hover:bg-muted/30"
              }`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {d.label}
              </div>
              <div className="text-[11px] tabular-nums text-muted-foreground">
                {d.date.slice(8)}
              </div>
              <div
                className={`mt-1 text-sm font-semibold tabular-nums ${
                  over || under ? hoursLoadTextClass(load) : "text-foreground"
                }`}
              >
                {d.total > 0 ? d.total.toFixed(1) : "—"}
              </div>
              {d.plan > 0 ? (
                <div className="text-[9px] tabular-nums text-muted-foreground">
                  plan {d.plan.toFixed(1)}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Day cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {dayMeta
          .filter((d) => focusDay == null || d.idx === focusDay)
          .map((d) => {
            const load: HoursLoadStatus | "Empty" =
              d.total > 0 ? hoursLoadStatus(d.total, dayCap) : "Empty";
            const over = load === "Over";
            const under = load === "Under";
            return (
              <div
                key={d.dk}
                className={`rounded-xl border p-3 ${
                  d.today
                    ? "border-sky-300 bg-gradient-to-b from-sky-50/80 to-surface"
                    : d.weekend
                      ? "border-border bg-muted/20"
                      : "border-border bg-surface"
                }`}
              >
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{d.heading}</div>
                    {d.today ? (
                      <div className="text-[10px] font-medium text-sky-700">Today</div>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-lg font-semibold tabular-nums ${
                        over || under ? hoursLoadTextClass(load) : "text-foreground"
                      }`}
                    >
                      {d.total.toFixed(1)}h
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {load !== "Empty"
                        ? `${load} vs ${dayCap}h`
                        : d.plan > 0
                          ? `Plan ${d.plan.toFixed(1)}h`
                          : "Day total"}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {entries.map(([rowKey, row]) => {
                    const wi = row.work_item_id ? workById.get(row.work_item_id) : null;
                    const dayPlan =
                      row.billable && wi
                        ? workItemWeekdayPlan({
                            estimateHours: Number(wi.estimate_hours) || 0,
                            actualHours: Number(wi.actual_hours) || 0,
                            plannedStart: wi.planned_start,
                            plannedEnd: wi.planned_end,
                            weekStart,
                          }).perDay[d.dk] || 0
                        : 0;
                    const hoursVal = Number(row[d.dk]) || 0;
                    return (
                      <div
                        key={rowKey}
                        className="rounded-lg border border-border/80 bg-background/80 px-2.5 py-2"
                      >
                        <div className="mb-1.5 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${
                                  row.billable
                                    ? "bg-sky-100 text-sky-800"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {row.billable ? "Billable" : "NB"}
                              </span>
                              <span className="truncate text-xs font-medium" title={rowLabel(row, workById, projectById)}>
                                {rowLabel(row, workById, projectById)}
                              </span>
                            </div>
                            {!row.billable && editable && onChangeCustomTask ? (
                              <input
                                className="st-input mt-1 !h-7 !py-0.5 !text-[11px] w-full"
                                value={row.custom_task}
                                disabled={!editable}
                                onChange={(e) => onChangeCustomTask(rowKey, e.target.value)}
                                placeholder="Task name"
                              />
                            ) : null}
                          </div>
                          {dayPlan > 0 ? (
                            <button
                              type="button"
                              disabled={!editable}
                              className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted disabled:opacity-50"
                              title={`Fill plan ${dayPlan}h`}
                              onClick={() => onChangeHours(rowKey, d.dk, dayPlan)}
                            >
                              plan {dayPlan}
                            </button>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={24}
                            step={0.25}
                            inputMode="decimal"
                            disabled={!editable}
                            className="st-input st-input-hours !w-full !max-w-none !min-w-0"
                            value={hoursVal > 0 ? hoursVal : ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === "") {
                                onChangeHours(rowKey, d.dk, 0);
                                return;
                              }
                              const v = Number(raw);
                              if (!Number.isFinite(v)) return;
                              onChangeHours(rowKey, d.dk, Math.min(24, Math.max(0, v)));
                            }}
                            aria-label={`Hours for ${DAY_LABELS[d.idx]}`}
                          />
                          <span className="text-[11px] text-muted-foreground">hours</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {entries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tasks this week.</p>
                ) : null}
              </div>
            );
          })}
      </div>

      {focusDay != null ? (
        <button
          type="button"
          className="text-xs text-sky-700 hover:underline"
          onClick={() => setFocusDay(null)}
        >
          Show all days
        </button>
      ) : null}

      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        Week total{" "}
        <span className="font-semibold tabular-nums text-foreground">
          {entries.reduce((s, [, r]) => s + entryWeekTotal(r), 0).toFixed(1)}h
        </span>
        {" · "}
        Tap a day in the strip to focus it. Use <span className="font-medium text-foreground">plan</span>{" "}
        chips to fill suggested hours for that day.
      </div>
    </div>
  );
}
