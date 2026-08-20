/**
 * Per-resource daily hour cap (timesheet Resource setup).
 * Weekly capacity stays hours_per_day × 5 so existing utilisation math keeps working.
 */

export const DEFAULT_HOURS_PER_DAY = 8;
export const DEFAULT_WORKDAYS_PER_WEEK = 5;
export const LOAD_UNDER_RATIO = 0.6;
export const MIN_HOURS_PER_DAY = 1;
export const MAX_HOURS_PER_DAY = 24;

export type HoursLoadStatus = "Over" | "Optimal" | "Under";

export type ResourceCapacityLike = {
  hours_per_day?: number | null;
  capacity_hours_week?: number | null;
};

function finitePositive(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function clampHoursPerDay(v: unknown, fallback = DEFAULT_HOURS_PER_DAY): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_HOURS_PER_DAY, Math.max(MIN_HOURS_PER_DAY, Math.round(n * 100) / 100));
}

/** Configured hours this person can work in a day (fallback 8, or week/5). */
export function resourceHoursPerDay(r?: ResourceCapacityLike | null): number {
  const day = finitePositive(r?.hours_per_day);
  if (day != null) return clampHoursPerDay(day);
  const week = finitePositive(r?.capacity_hours_week);
  if (week != null) return clampHoursPerDay(week / DEFAULT_WORKDAYS_PER_WEEK);
  return DEFAULT_HOURS_PER_DAY;
}

/** Standard Mon–Fri weekly cap derived from hours/day (or stored weekly capacity). */
export function resourceHoursPerWeek(r?: ResourceCapacityLike | null): number {
  const day = finitePositive(r?.hours_per_day);
  if (day != null) {
    return Math.round(clampHoursPerDay(day) * DEFAULT_WORKDAYS_PER_WEEK * 100) / 100;
  }
  const week = finitePositive(r?.capacity_hours_week);
  if (week != null) return Math.round(week * 100) / 100;
  return DEFAULT_HOURS_PER_DAY * DEFAULT_WORKDAYS_PER_WEEK;
}

export type EffortUnit = "hours" | "days" | "weeks";

export const EFFORT_UNITS: { id: EffortUnit; label: string; short: string }[] = [
  { id: "hours", label: "Hours", short: "h" },
  { id: "days", label: "Days", short: "d" },
  { id: "weeks", label: "Weeks", short: "w" },
];

/** Convert stored hours into hours / days / weeks (default day length 8). */
export function hoursToEffortUnit(
  hours: number,
  unit: EffortUnit,
  hoursPerDay = DEFAULT_HOURS_PER_DAY,
): number {
  const h = Number(hours) || 0;
  const day = hoursPerDay > 0 ? hoursPerDay : DEFAULT_HOURS_PER_DAY;
  if (unit === "days") return Math.round((h / day) * 100) / 100;
  if (unit === "weeks") return Math.round((h / (day * DEFAULT_WORKDAYS_PER_WEEK)) * 1000) / 1000;
  return Math.round(h * 10) / 10;
}

export function effortUnitSuffix(unit: EffortUnit) {
  return unit === "days" ? "d" : unit === "weeks" ? "w" : "h";
}

export function effortUnitNoun(unit: EffortUnit) {
  return EFFORT_UNITS.find((u) => u.id === unit)?.label ?? "Hours";
}

export function formatEffortNumber(
  hours: number,
  unit: EffortUnit,
  hoursPerDay = DEFAULT_HOURS_PER_DAY,
) {
  const v = hoursToEffortUnit(hours, unit, hoursPerDay);
  if (unit === "weeks") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function formatEffort(hours: number, unit: EffortUnit, hoursPerDay = DEFAULT_HOURS_PER_DAY) {
  return `${formatEffortNumber(hours, unit, hoursPerDay)} ${effortUnitSuffix(unit)}`;
}

export function hoursLoadStatus(hours: number, cap: number): HoursLoadStatus {
  const h = Number(hours) || 0;
  const c = Number(cap) || 0;
  if (!(c > 0)) return h > 0.01 ? "Over" : "Under";
  if (h > c + 0.01) return "Over";
  if (h + 0.01 >= c * LOAD_UNDER_RATIO) return "Optimal";
  return "Under";
}

export function hoursLoadChipClass(status: HoursLoadStatus): string {
  if (status === "Over") return "bg-red-100 text-red-800";
  if (status === "Under") return "bg-amber-100 text-amber-900";
  return "bg-emerald-100 text-emerald-800";
}

export function hoursLoadTextClass(status: HoursLoadStatus): string {
  if (status === "Over") return "text-red-600";
  if (status === "Under") return "text-amber-700";
  return "text-emerald-700";
}

export function worstHoursLoadStatus(
  statuses: Array<HoursLoadStatus | null | undefined>,
): HoursLoadStatus | null {
  let under = false;
  let optimal = false;
  for (const s of statuses) {
    if (s === "Over") return "Over";
    if (s === "Under") under = true;
    if (s === "Optimal") optimal = true;
  }
  if (under) return "Under";
  if (optimal) return "Optimal";
  return null;
}

/** Inclusive Mon–Fri count between two ISO dates. Missing dates → 0 (caller supplies fallback). */
export function countWeekdaysInclusive(start?: string | null, end?: string | null): number {
  let from = (start || "").slice(0, 10);
  let to = (end || "").slice(0, 10);
  if (!from && !to) return 0;
  if (!from) from = to;
  if (!to) to = from;
  if (from > to) [from, to] = [to, from];
  let n = 0;
  for (let d = from; d <= to;) {
    const [y, m, day] = d.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (dow >= 1 && dow <= 5) n += 1;
    if (n > 520) break;
    const next = new Date(Date.UTC(y, m - 1, day + 1));
    d = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  }
  return n;
}

/** Demand hours for one assignee on one work item, paced across weekdays in the date window. */
export function workItemDailyHoursPerAssignee(opts: {
  estimateHours: number;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  assigneeCount: number;
}): number {
  const hours = Number(opts.estimateHours) || 0;
  if (!(hours > 0)) return 0;
  const people = Math.max(1, Number(opts.assigneeCount) || 1);
  const days =
    countWeekdaysInclusive(opts.plannedStart, opts.plannedEnd) || DEFAULT_WORKDAYS_PER_WEEK;
  return Math.round((hours / people / days) * 100) / 100;
}

export function accumulateDailyDemandByResource<
  T extends {
    id: string;
    estimate_hours?: number | null;
    planned_start?: string | null;
    planned_end?: string | null;
    status?: string | null;
  },
>(items: T[], assigneesByWorkItem: Map<string, string[]>): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) {
    const status = String(item.status || "");
    if (status === "Cancelled" || status === "Done") continue;
    const ids = (assigneesByWorkItem.get(item.id) || []).filter(Boolean);
    if (!ids.length) continue;
    const per = workItemDailyHoursPerAssignee({
      estimateHours: Number(item.estimate_hours) || 0,
      plannedStart: item.planned_start,
      plannedEnd: item.planned_end,
      assigneeCount: ids.length,
    });
    if (!(per > 0)) continue;
    for (const id of ids) {
      out.set(id, Math.round(((out.get(id) || 0) + per) * 100) / 100);
    }
  }
  return out;
}

export type DayHoursKey =
  "hours_mon" | "hours_tue" | "hours_wed" | "hours_thu" | "hours_fri" | "hours_sat" | "hours_sun";

export const DAY_HOUR_KEYS: DayHoursKey[] = [
  "hours_mon",
  "hours_tue",
  "hours_wed",
  "hours_thu",
  "hours_fri",
  "hours_sat",
  "hours_sun",
];

export const DAY_HOUR_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type DayLoadLine = {
  key: DayHoursKey;
  label: string;
  hours: number;
  cap: number;
  status: HoursLoadStatus | "Empty";
};

export function sumHoursByDay<T extends Partial<Record<DayHoursKey, number>>>(
  rows: T[],
): Record<DayHoursKey, number> {
  const out = {
    hours_mon: 0,
    hours_tue: 0,
    hours_wed: 0,
    hours_thu: 0,
    hours_fri: 0,
    hours_sat: 0,
    hours_sun: 0,
  } as Record<DayHoursKey, number>;
  for (const row of rows) {
    for (const key of DAY_HOUR_KEYS) {
      out[key] += Number(row[key]) || 0;
    }
  }
  return out;
}

export function dayLoadLines(
  hoursByDay: Partial<Record<DayHoursKey, number>>,
  cap: number,
): DayLoadLine[] {
  const dayCap = clampHoursPerDay(cap);
  return DAY_HOUR_KEYS.map((key, i) => {
    const hours = Math.round((Number(hoursByDay[key]) || 0) * 100) / 100;
    return {
      key,
      label: DAY_HOUR_LABELS[i],
      hours,
      cap: dayCap,
      status: hours > 0 ? hoursLoadStatus(hours, dayCap) : "Empty",
    };
  });
}

export function weekLoadStatus(weekHours: number, hoursPerDay: number): HoursLoadStatus {
  return hoursLoadStatus(weekHours, resourceHoursPerWeek({ hours_per_day: hoursPerDay }));
}

export function formatDayLoadNote(lines: DayLoadLine[]): string {
  const logged = lines.filter((l) => l.status !== "Empty");
  const cap = lines[0]?.cap ?? DEFAULT_HOURS_PER_DAY;
  if (!logged.length) return `No hours logged against the ${cap}h daily cap.`;
  const over = logged.filter((l) => l.status === "Over").length;
  const under = logged.filter((l) => l.status === "Under").length;
  const headline =
    over > 0
      ? `${over} day(s) over the ${cap}h/day cap.`
      : under === logged.length
        ? `Hours under the ${cap}h/day cap.`
        : `Hours within the ${cap}h/day cap.`;
  const bits = logged
    .map((l) => `${l.label} ${l.status} (${l.hours.toFixed(1)}/${cap}h)`)
    .join("; ");
  return `${headline} ${bits}`;
}
