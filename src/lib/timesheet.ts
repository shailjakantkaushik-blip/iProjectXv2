/** Timesheet status, week helpers, and approval labels. */

export const TIMESHEET_STATUSES = [
  "draft",
  "pending_pm",
  "pending_rm",
  "approved",
  "rejected",
] as const;

export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];

export const TIMESHEET_STATUS_LABEL: Record<TimesheetStatus, string> = {
  draft: "Draft",
  pending_pm: "Awaiting PM",
  pending_rm: "Awaiting Resource Manager",
  approved: "Approved",
  rejected: "Rejected",
};

export const TIMESHEET_STATUS_CLASS: Record<TimesheetStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_pm: "bg-sky-100 text-sky-800",
  pending_rm: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

export const DAY_KEYS = [
  "hours_mon",
  "hours_tue",
  "hours_wed",
  "hours_thu",
  "hours_fri",
  "hours_sat",
  "hours_sun",
] as const;

export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Monday (UTC-date string YYYY-MM-DD) for the week containing `d`. */
export function weekStartMonday(d: Date = new Date()): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d));
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
}

export function formatWeekRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

export function entryWeekTotal(e: Partial<Record<DayKey, number | null | undefined>>): number {
  return DAY_KEYS.reduce((sum, k) => sum + (Number(e[k]) || 0), 0);
}

function emptyDayHours(): Record<DayKey, number> {
  return {
    hours_mon: 0,
    hours_tue: 0,
    hours_wed: 0,
    hours_thu: 0,
    hours_fri: 0,
    hours_sat: 0,
    hours_sun: 0,
  };
}

/**
 * Spread work-item planned hours evenly across weekdays in the item’s date
 * window, then return this timesheet week’s total and per-day plan.
 *
 * - No planned_start/end → all planned hours sit on the current week (÷ 5 weekdays).
 * - With dates → hours ÷ count of Mon–Fri in [start, end]; weekends stay 0.
 */
export function workItemWeekdayPlan(opts: {
  estimateHours: number;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  weekStart: string;
}): { weekHours: number; perDay: Record<DayKey, number> } {
  const empty = { weekHours: 0, perDay: emptyDayHours() };
  const hours = Number(opts.estimateHours) || 0;
  if (!(hours > 0) || !opts.weekStart) return empty;

  const weekDates = DAY_KEYS.map((_, i) => addDays(opts.weekStart, i));
  let rangeStart = (opts.plannedStart || "").slice(0, 10);
  let rangeEnd = (opts.plannedEnd || "").slice(0, 10);

  if (!rangeStart && !rangeEnd) {
    const base = Math.floor((hours / 5) * 100) / 100;
    const perDay = emptyDayHours();
    let allocated = 0;
    for (let i = 0; i < 4; i++) {
      perDay[DAY_KEYS[i]] = base;
      allocated += base;
    }
    perDay.hours_fri = Math.round((hours - allocated) * 100) / 100;
    return { weekHours: Math.round(hours * 100) / 100, perDay };
  }

  if (!rangeStart) rangeStart = rangeEnd;
  if (!rangeEnd) rangeEnd = rangeStart;
  if (rangeStart > rangeEnd) [rangeStart, rangeEnd] = [rangeEnd, rangeStart];

  const weekdaysInRange: string[] = [];
  for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) {
    const [y, m, day] = d.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (dow >= 1 && dow <= 5) weekdaysInRange.push(d);
    if (weekdaysInRange.length > 520) break;
  }
  if (weekdaysInRange.length === 0) return empty;

  const per = hours / weekdaysInRange.length;
  const inRange = new Set(weekdaysInRange);
  const perDay = emptyDayHours();
  let weekHours = 0;
  weekDates.forEach((date, i) => {
    if (!inRange.has(date)) return;
    const h = Math.round(per * 100) / 100;
    perDay[DAY_KEYS[i]] = h;
    weekHours += h;
  });
  return { weekHours: Math.round(weekHours * 100) / 100, perDay };
}

export function normalizeTimesheetStatus(raw?: string | null): TimesheetStatus {
  const s = String(raw || "draft").toLowerCase();
  if ((TIMESHEET_STATUSES as readonly string[]).includes(s)) return s as TimesheetStatus;
  return "draft";
}

export function canEditTimesheet(status?: string | null) {
  const s = normalizeTimesheetStatus(status);
  return s === "draft" || s === "rejected";
}

export function canWithdrawTimesheet(status?: string | null) {
  const s = normalizeTimesheetStatus(status);
  return s === "pending_pm" || s === "pending_rm";
}

export function canReopenTimesheet(status?: string | null) {
  return normalizeTimesheetStatus(status) === "approved";
}

export const APPROVAL_DECISION_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
};
