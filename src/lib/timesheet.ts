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

export function normalizeTimesheetStatus(raw?: string | null): TimesheetStatus {
  const s = String(raw || "draft").toLowerCase();
  if ((TIMESHEET_STATUSES as readonly string[]).includes(s)) return s as TimesheetStatus;
  return "draft";
}

export function canEditTimesheet(status?: string | null) {
  const s = normalizeTimesheetStatus(status);
  return s === "draft" || s === "rejected";
}
