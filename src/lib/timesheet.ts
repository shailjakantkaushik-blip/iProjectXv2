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

/** Mondays (YYYY-MM-DD) whose week overlaps the calendar month. */
export function mondaysOverlappingMonth(year: number, monthIndex: number): string[] {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  const start = weekStartMonday(first);
  const endMonday = weekStartMonday(last);
  const out: string[] = [];
  for (let d = start; d <= endMonday; d = addDays(d, 7)) {
    out.push(d);
    if (out.length > 8) break;
  }
  return out;
}

/** Planned hours for a work item across every weekday in a calendar month. */
export function workItemMonthPlan(opts: {
  estimateHours: number;
  actualHours?: number | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  year: number;
  monthIndex: number;
}): { monthHours: number; byWeek: Record<string, number> } {
  const weeks = mondaysOverlappingMonth(opts.year, opts.monthIndex);
  const byWeek: Record<string, number> = {};
  let monthHours = 0;
  for (const weekStart of weeks) {
    const { weekHours } = workItemWeekdayPlan({
      estimateHours: opts.estimateHours,
      actualHours: opts.actualHours,
      plannedStart: opts.plannedStart,
      plannedEnd: opts.plannedEnd,
      weekStart,
    });
    byWeek[weekStart] = weekHours;
    monthHours += weekHours;
  }
  return { monthHours: Math.round(monthHours * 100) / 100, byWeek };
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

/** Evenly split hours across Mon–Fri (weekends 0). */
export function spreadHoursAcrossWeekdays(hours: number): Record<DayKey, number> {
  return distributeAcrossWeekdays(hours).perDay;
}

function distributeAcrossWeekdays(hours: number): {
  weekHours: number;
  perDay: Record<DayKey, number>;
} {
  const perDay = emptyDayHours();
  if (!(hours > 0)) return { weekHours: 0, perDay };
  const base = Math.floor((hours / 5) * 100) / 100;
  let allocated = 0;
  for (let i = 0; i < 4; i++) {
    perDay[DAY_KEYS[i]] = base;
    allocated += base;
  }
  perDay.hours_fri = Math.round((hours - allocated) * 100) / 100;
  return { weekHours: Math.round(hours * 100) / 100, perDay };
}

/**
 * Spread work-item planned hours evenly across weekdays in the item’s date
 * window, then return this timesheet week’s total and per-day plan.
 *
 * - No planned_start/end → remaining planned hours on the current week (÷ 5).
 * - With dates intersecting this week → share of total across that window.
 * - With dates that miss this week → fall back to remaining hours ÷ 5 so the
 *   Week plan column is never blank while work remains.
 */
export function workItemWeekdayPlan(opts: {
  estimateHours: number;
  actualHours?: number | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  weekStart: string;
}): { weekHours: number; perDay: Record<DayKey, number> } {
  const empty = { weekHours: 0, perDay: emptyDayHours() };
  const hours = Number(opts.estimateHours) || 0;
  if (!(hours > 0) || !opts.weekStart) return empty;

  const actual = Math.max(0, Number(opts.actualHours) || 0);
  const remaining = Math.max(0, hours - actual);
  const weekDates = DAY_KEYS.map((_, i) => addDays(opts.weekStart, i));
  let rangeStart = (opts.plannedStart || "").slice(0, 10);
  let rangeEnd = (opts.plannedEnd || "").slice(0, 10);

  if (!rangeStart && !rangeEnd) {
    return distributeAcrossWeekdays(remaining > 0 ? remaining : hours);
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
  /** When the calendar window misses this week, pace remaining work across a normal 5×8 week. */
  const outsideWindowFallback = () => {
    const left = remaining > 0 ? remaining : hours;
    return distributeAcrossWeekdays(Math.min(left, 40));
  };

  if (weekdaysInRange.length === 0) {
    return outsideWindowFallback();
  }

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

  // Date window does not touch this timesheet week — still show a pace guide.
  if (weekHours <= 0) {
    return outsideWindowFallback();
  }
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
