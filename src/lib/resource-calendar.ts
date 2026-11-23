/**
 * Geography public holidays + resource leave → unavailable ISO dates.
 * Working-day counts drive estimation load, planned FTE apply, demand pacing,
 * timesheet week-plan, and monthly utilisation.
 */

export const HOLIDAY_ORG_WIDE = "*";
export const LEAVE_TYPES = ["Annual", "Sick", "General"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export type OrgPublicHoliday = {
  id?: string;
  location: string;
  holiday_date: string;
  name?: string | null;
};

export type ResourceLeave = {
  id?: string;
  resource_id: string;
  start_date: string;
  end_date: string;
  leave_type?: string | null;
  notes?: string | null;
};

export type CalendarResourceLike = {
  id: string;
  location?: string | null;
  hours_per_day?: number | null;
  capacity_hours_week?: number | null;
};

export function isoDateOnly(v?: string | null): string {
  return String(v || "").slice(0, 10);
}

export function normalizeLocation(v?: string | null): string {
  const s = String(v || "").trim();
  if (!s) return "";
  if (s === "*" || /^all(?:\s+locations?)?$/i.test(s)) return HOLIDAY_ORG_WIDE;
  return s;
}

export function holidayAppliesToLocation(
  holidayLocation?: string | null,
  resourceLocation?: string | null,
): boolean {
  const hol = normalizeLocation(holidayLocation);
  if (!hol) return false;
  if (hol === HOLIDAY_ORG_WIDE) return true;
  const loc = normalizeLocation(resourceLocation);
  if (!loc || loc === HOLIDAY_ORG_WIDE) return false;
  return hol.toLowerCase() === loc.toLowerCase();
}

export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = isoDateOnly(iso).split("-").map(Number);
  if (!y || !m || !d) return "";
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function isWeekdayIso(iso: string): boolean {
  const [y, m, d] = isoDateOnly(iso).split("-").map(Number);
  if (!y || !m || !d) return false;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow >= 1 && dow <= 5;
}

export function eachIsoDateInclusive(start?: string | null, end?: string | null): string[] {
  let from = isoDateOnly(start);
  let to = isoDateOnly(end);
  if (!from && !to) return [];
  if (!from) from = to;
  if (!to) to = from;
  if (from > to) [from, to] = [to, from];
  const out: string[] = [];
  for (let d = from; d <= to; d = addIsoDays(d, 1)) {
    out.push(d);
    if (out.length > 800) break;
  }
  return out;
}

export function monthStartEnd(month?: string | null): { start: string; end: string } | null {
  const key = isoDateOnly(month).slice(0, 7);
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const start = `${m[1]}-${m[2]}-01`;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const end = `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

function inRange(iso: string, from?: string | null, to?: string | null): boolean {
  if (from && iso < isoDateOnly(from)) return false;
  if (to && iso > isoDateOnly(to)) return false;
  return true;
}

export function expandLeaveDates(
  start?: string | null,
  end?: string | null,
  from?: string | null,
  to?: string | null,
): string[] {
  let a = isoDateOnly(start);
  let b = isoDateOnly(end);
  if (!a && !b) return [];
  if (!a) a = b;
  if (!b) b = a;
  if (a > b) [a, b] = [b, a];
  const lo = isoDateOnly(from);
  const hi = isoDateOnly(to);
  if (lo && a < lo) a = lo;
  if (hi && b > hi) b = hi;
  if (a > b) return [];
  return eachIsoDateInclusive(a, b);
}

export function unavailableIsoDatesForResource(opts: {
  resourceId: string;
  location?: string | null;
  holidays?: OrgPublicHoliday[] | null;
  leaves?: ResourceLeave[] | null;
  from?: string | null;
  to?: string | null;
}): Set<string> {
  const out = new Set<string>();
  for (const h of opts.holidays || []) {
    if (!holidayAppliesToLocation(h.location, opts.location)) continue;
    const d = isoDateOnly(h.holiday_date);
    if (d && inRange(d, opts.from, opts.to)) out.add(d);
  }
  for (const leave of opts.leaves || []) {
    if (leave.resource_id !== opts.resourceId) continue;
    for (const d of expandLeaveDates(leave.start_date, leave.end_date, opts.from, opts.to)) {
      out.add(d);
    }
  }
  return out;
}

export type ResourceCalendarIndex = {
  holidays: OrgPublicHoliday[];
  leaves: ResourceLeave[];
  unavailableFor(
    resourceId: string,
    location?: string | null,
    from?: string | null,
    to?: string | null,
  ): Set<string>;
};

export function buildResourceCalendarIndex(
  holidays?: OrgPublicHoliday[] | null,
  leaves?: ResourceLeave[] | null,
): ResourceCalendarIndex {
  const hols = holidays || [];
  const offs = leaves || [];
  return {
    holidays: hols,
    leaves: offs,
    unavailableFor(resourceId, location, from, to) {
      return unavailableIsoDatesForResource({
        resourceId,
        location,
        holidays: hols,
        leaves: offs,
        from,
        to,
      });
    },
  };
}

export function countWorkingDaysInclusive(
  start?: string | null,
  end?: string | null,
  unavailable?: Iterable<string> | null,
): number {
  const skip = unavailable instanceof Set ? unavailable : new Set(unavailable || []);
  let n = 0;
  for (const d of eachIsoDateInclusive(start, end)) {
    if (!isWeekdayIso(d)) continue;
    if (skip.has(d)) continue;
    n += 1;
  }
  return n;
}

/** Weekdays in a calendar month minus holidays/leave. Missing month → 0. */
export function workingDaysInMonth(
  month?: string | null,
  unavailable?: Iterable<string> | null,
): number {
  const span = monthStartEnd(month);
  if (!span) return 0;
  return countWorkingDaysInclusive(span.start, span.end, unavailable);
}

/** True when the dated window exists but every weekday is a holiday or leave day. */
export function isFullyUnavailableWindow(
  start?: string | null,
  end?: string | null,
  unavailable?: Iterable<string> | null,
): boolean {
  const hasWindow = Boolean(isoDateOnly(start) || isoDateOnly(end));
  if (!hasWindow) return false;
  return countWorkingDaysInclusive(start, end, unavailable) === 0;
}

export function countUnavailableWeekdays(
  start?: string | null,
  end?: string | null,
  unavailable?: Iterable<string> | null,
): number {
  const skip = unavailable instanceof Set ? unavailable : new Set(unavailable || []);
  let n = 0;
  for (const d of eachIsoDateInclusive(start, end)) {
    if (isWeekdayIso(d) && skip.has(d)) n += 1;
  }
  return n;
}

export function windowCapacityHours(
  start?: string | null,
  end?: string | null,
  hoursPerDay?: number,
  unavailable?: Iterable<string> | null,
): number {
  const day = Number(hoursPerDay) || 0;
  if (!(day > 0)) return 0;
  const days = countWorkingDaysInclusive(start, end, unavailable);
  return Math.round(days * day * 100) / 100;
}

export function overAllocationMessage(opts: {
  name: string;
  assignedHours: number;
  availableHours: number;
  workingDays: number;
  offWeekdays: number;
  dailyHours: number;
  dayCap: number;
}): string | null {
  const assigned = Number(opts.assignedHours) || 0;
  const available = Number(opts.availableHours) || 0;
  const workingDays = Number(opts.workingDays) || 0;
  const off = Number(opts.offWeekdays) || 0;
  const daily = Number(opts.dailyHours) || 0;
  const cap = Number(opts.dayCap) || 0;
  const fullyOff = workingDays <= 0 && assigned > 0;
  const overDaily = workingDays > 0 && cap > 0 && daily > cap + 0.01;
  const overWindow = assigned > available + 0.01;
  if (!fullyOff && !overDaily && !overWindow) return null;
  const who = opts.name || "This resource";
  const offBit = off > 0 ? ` after ${off} weekday${off === 1 ? "" : "s"} off (leave/holidays)` : "";
  if (fullyOff) {
    return `${who} has no working days in this window${off ? offBit : " (leave/holidays)"}. ${assigned}h cannot be paced without exceeding available hours.`;
  }
  return `${who} would be Over: ${assigned}h vs ${Math.max(0, Math.round(available * 10) / 10)}h available (${workingDays} working days${offBit}). Daily load ${daily.toFixed(1)}h vs ${cap}h/day cap.`;
}

export function monthCapacityHours(
  month: string | null | undefined,
  hoursPerDay: number,
  unavailable?: Iterable<string> | null,
): number {
  const day = Number(hoursPerDay) || 0;
  if (!(day > 0)) return 0;
  const days = workingDaysInMonth(month, unavailable);
  return Math.round(days * day * 100) / 100;
}

/** Sum of per-month working-day capacity across YYYY-MM-01 keys. */
export function rangeCapacityHours(
  months: string[],
  hoursPerDay: number,
  unavailableForMonth: (month: string) => Iterable<string> | null | undefined,
): number {
  return months.reduce((s, m) => s + monthCapacityHours(m, hoursPerDay, unavailableForMonth(m)), 0);
}

/**
 * Split a total hour budget across months in [start, end] by each month's
 * working days (weekdays minus unavailable). Even split if every month is 0.
 */
export function splitHoursByWorkingDays(opts: {
  hours: number;
  start?: string | null;
  end?: string | null;
  months: string[];
  unavailable?: Iterable<string> | null;
}): Map<string, number> {
  const hours = Number(opts.hours) || 0;
  const skip = opts.unavailable instanceof Set ? opts.unavailable : new Set(opts.unavailable || []);
  const weights = opts.months.map((month) => {
    const span = monthStartEnd(month);
    if (!span) return { month, days: 0 };
    const from =
      isoDateOnly(opts.start) && isoDateOnly(opts.start) > span.start
        ? isoDateOnly(opts.start)
        : span.start;
    const to =
      isoDateOnly(opts.end) && isoDateOnly(opts.end) < span.end ? isoDateOnly(opts.end) : span.end;
    return { month, days: countWorkingDaysInclusive(from, to, skip) };
  });
  const totalDays = weights.reduce((s, w) => s + w.days, 0);
  const out = new Map<string, number>();
  if (!(hours > 0) || !opts.months.length) return out;
  if (totalDays <= 0) {
    const each = hours / opts.months.length;
    for (const m of opts.months) out.set(m, Math.round(each * 10) / 10);
    return out;
  }
  for (const w of weights) {
    out.set(w.month, Math.round(((hours * w.days) / totalDays) * 10) / 10);
  }
  return out;
}
