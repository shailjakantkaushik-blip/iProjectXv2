/** Timesheet org reporting helpers: aggregates + CSV/Excel/PDF exports. */

import { writeObjectSheets } from "@/lib/excel-io";
import {
  DAY_KEYS,
  entryWeekTotal,
  formatWeekRange,
  normalizeTimesheetStatus,
  TIMESHEET_STATUS_LABEL,
  type DayKey,
  type TimesheetStatus,
} from "@/lib/timesheet";

export const DEFAULT_CAPACITY_HOURS = 40;

export type ReportTimesheet = {
  id: string;
  user_id: string;
  week_start: string;
  status: string;
};

export type ReportEntry = {
  id: string;
  timesheet_id: string;
  project_id: string | null;
  work_item_id: string | null;
  billable: boolean;
  custom_task: string | null;
  hours_mon: number;
  hours_tue: number;
  hours_wed: number;
  hours_thu: number;
  hours_fri: number;
  hours_sat: number;
  hours_sun: number;
  labor_cost?: number | null;
};

export type ReportResource = {
  id: string;
  name: string;
  user_id: string | null;
  capacity_hours_week: number | null;
  status: string | null;
};

export type UtilisationRow = {
  user_id: string;
  name: string;
  capacity: number;
  total_hours: number;
  billable_hours: number;
  non_billable_hours: number;
  utilisation_pct: number;
  billable_pct: number;
  weeks: number;
  status_summary: string;
};

export type ProjectEffortRow = {
  project_id: string;
  project_name: string;
  billable_hours: number;
  non_billable_hours: number;
  total_hours: number;
  labor_cost: number;
  people: number;
};

export type DetailExportRow = Record<string, string | number>;

function hoursOf(e: Partial<Record<DayKey, number>>): number {
  return entryWeekTotal(e);
}

export function buildUtilisationRows(opts: {
  sheets: ReportTimesheet[];
  entries: ReportEntry[];
  resources: ReportResource[];
  memberName: (userId: string) => string;
  weekStarts: string[];
}): UtilisationRow[] {
  const { sheets, entries, resources, memberName, weekStarts } = opts;
  const sheetById = new Map(sheets.map((s) => [s.id, s]));
  const byUser = new Map<
    string,
    {
      total: number;
      billable: number;
      nonBillable: number;
      weeks: Set<string>;
      statuses: Set<string>;
    }
  >();

  const ensure = (uid: string) => {
    if (!byUser.has(uid)) {
      byUser.set(uid, {
        total: 0,
        billable: 0,
        nonBillable: 0,
        weeks: new Set(),
        statuses: new Set(),
      });
    }
    return byUser.get(uid)!;
  };

  // Seed linked active resources so missing weeks still show
  for (const r of resources) {
    if (!r.user_id) continue;
    if (r.status && !/active/i.test(r.status)) continue;
    ensure(r.user_id);
  }

  for (const e of entries) {
    const s = sheetById.get(e.timesheet_id);
    if (!s) continue;
    if (weekStarts.length && !weekStarts.includes(s.week_start)) continue;
    const h = hoursOf(e);
    const u = ensure(s.user_id);
    u.total += h;
    if (e.billable !== false) u.billable += h;
    else u.nonBillable += h;
    u.weeks.add(s.week_start);
    u.statuses.add(normalizeTimesheetStatus(s.status));
  }

  // Count weeks in range for capacity denominator
  const weekCount = Math.max(1, weekStarts.length);

  return [...byUser.entries()]
    .map(([user_id, u]) => {
      const res = resources.find((r) => r.user_id === user_id);
      const capacityPerWeek = Number(res?.capacity_hours_week) || DEFAULT_CAPACITY_HOURS;
      const capacity = capacityPerWeek * weekCount;
      const utilisation_pct = capacity > 0 ? (u.total / capacity) * 100 : 0;
      const billable_pct = capacity > 0 ? (u.billable / capacity) * 100 : 0;
      const status_summary = [...u.statuses]
        .map((st) => TIMESHEET_STATUS_LABEL[st as TimesheetStatus] || st)
        .join(", ");
      return {
        user_id,
        name: res?.name || memberName(user_id),
        capacity,
        total_hours: round1(u.total),
        billable_hours: round1(u.billable),
        non_billable_hours: round1(u.nonBillable),
        utilisation_pct: round1(utilisation_pct),
        billable_pct: round1(billable_pct),
        weeks: u.weeks.size,
        status_summary: status_summary || "No timesheet",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildProjectEffortRows(opts: {
  sheets: ReportTimesheet[];
  entries: ReportEntry[];
  projectName: (id: string | null) => string;
  weekStarts: string[];
}): ProjectEffortRow[] {
  const { sheets, entries, projectName, weekStarts } = opts;
  const sheetById = new Map(sheets.map((s) => [s.id, s]));
  const byProject = new Map<
    string,
    { billable: number; nonBillable: number; cost: number; people: Set<string> }
  >();

  for (const e of entries) {
    const s = sheetById.get(e.timesheet_id);
    if (!s) continue;
    if (weekStarts.length && !weekStarts.includes(s.week_start)) continue;
    const key = e.project_id || "__none__";
    if (!byProject.has(key)) {
      byProject.set(key, { billable: 0, nonBillable: 0, cost: 0, people: new Set() });
    }
    const row = byProject.get(key)!;
    const h = hoursOf(e);
    if (e.billable !== false) row.billable += h;
    else row.nonBillable += h;
    row.cost += Number(e.labor_cost) || 0;
    row.people.add(s.user_id);
  }

  return [...byProject.entries()]
    .map(([project_id, r]) => ({
      project_id,
      project_name:
        project_id === "__none__" ? "(Non-project / custom)" : projectName(project_id),
      billable_hours: round1(r.billable),
      non_billable_hours: round1(r.nonBillable),
      total_hours: round1(r.billable + r.nonBillable),
      labor_cost: round2(r.cost),
      people: r.people.size,
    }))
    .sort((a, b) => b.total_hours - a.total_hours);
}

export function buildDetailRows(opts: {
  sheets: ReportTimesheet[];
  entries: ReportEntry[];
  memberName: (userId: string) => string;
  projectName: (id: string | null) => string;
  workItemTitle: (id: string | null) => string;
  weekStarts: string[];
}): DetailExportRow[] {
  const { sheets, entries, memberName, projectName, workItemTitle, weekStarts } = opts;
  const sheetById = new Map(sheets.map((s) => [s.id, s]));
  const rows: DetailExportRow[] = [];

  for (const e of entries) {
    const s = sheetById.get(e.timesheet_id);
    if (!s) continue;
    if (weekStarts.length && !weekStarts.includes(s.week_start)) continue;
    rows.push({
      week_start: s.week_start,
      week_range: formatWeekRange(s.week_start),
      person: memberName(s.user_id),
      user_id: s.user_id,
      status: TIMESHEET_STATUS_LABEL[normalizeTimesheetStatus(s.status)],
      billable: e.billable !== false ? "Yes" : "No",
      project: projectName(e.project_id),
      work_item: e.work_item_id ? workItemTitle(e.work_item_id) : e.custom_task || "",
      hours_mon: Number(e.hours_mon) || 0,
      hours_tue: Number(e.hours_tue) || 0,
      hours_wed: Number(e.hours_wed) || 0,
      hours_thu: Number(e.hours_thu) || 0,
      hours_fri: Number(e.hours_fri) || 0,
      hours_sat: Number(e.hours_sat) || 0,
      hours_sun: Number(e.hours_sun) || 0,
      total_hours: round1(hoursOf(e)),
      labor_cost: round2(Number(e.labor_cost) || 0),
    });
  }

  return rows.sort((a, b) =>
    String(a.week_start).localeCompare(String(b.week_start)) ||
    String(a.person).localeCompare(String(b.person)),
  );
}

export function billableSummary(util: UtilisationRow[]) {
  const billable = util.reduce((s, r) => s + r.billable_hours, 0);
  const nonBillable = util.reduce((s, r) => s + r.non_billable_hours, 0);
  const total = billable + nonBillable;
  return {
    billable: round1(billable),
    nonBillable: round1(nonBillable),
    total: round1(total),
    billableShare: total > 0 ? round1((billable / total) * 100) : 0,
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function escCsv(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(
  fileName: string,
  headers: string[],
  rows: Array<Record<string, unknown>>,
) {
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escCsv(r[h])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportTimesheetReportsExcel(opts: {
  orgName?: string | null;
  weekLabel: string;
  utilisation: UtilisationRow[];
  projects: ProjectEffortRow[];
  details: DetailExportRow[];
}) {
  const { orgName, weekLabel, utilisation, projects, details } = opts;
  await writeObjectSheets(
    [
      {
        name: "Utilisation",
        headers: [
          "name",
          "capacity",
          "total_hours",
          "billable_hours",
          "non_billable_hours",
          "utilisation_pct",
          "billable_pct",
          "weeks",
          "status_summary",
        ],
        rows: utilisation as unknown as Record<string, unknown>[],
      },
      {
        name: "Project effort",
        headers: [
          "project_name",
          "billable_hours",
          "non_billable_hours",
          "total_hours",
          "labor_cost",
          "people",
        ],
        rows: projects as unknown as Record<string, unknown>[],
      },
      {
        name: "Detail",
        headers: [
          "week_start",
          "week_range",
          "person",
          "status",
          "billable",
          "project",
          "work_item",
          "hours_mon",
          "hours_tue",
          "hours_wed",
          "hours_thu",
          "hours_fri",
          "hours_sat",
          "hours_sun",
          "total_hours",
          "labor_cost",
        ],
        rows: details,
      },
      {
        name: "Meta",
        headers: ["field", "value"],
        rows: [
          { field: "organisation", value: orgName || "" },
          { field: "period", value: weekLabel },
          { field: "exported_at", value: new Date().toISOString() },
          { field: "purpose", value: "Payroll / invoicing / project reporting" },
        ],
      },
    ],
    `iProjectX_Timesheets_${stamp()}.xlsx`,
  );
}

export async function exportTimesheetReportsPdf(opts: {
  title?: string;
  weekLabel: string;
  utilisation: UtilisationRow[];
  projects: ProjectEffortRow[];
  billable: ReturnType<typeof billableSummary>;
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 36;
  let y = margin;

  const line = (text: string, size = 11, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(text, margin, y);
    y += size + 6;
  };

  line(opts.title || "Organisation timesheet report", 16, true);
  line(`Period: ${opts.weekLabel}`, 11);
  line(
    `Billable ${opts.billable.billable}h · Non-billable ${opts.billable.nonBillable}h · Total ${opts.billable.total}h (${opts.billable.billableShare}% billable)`,
    10,
  );
  y += 8;

  line("Team utilisation", 13, true);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const r of opts.utilisation.slice(0, 24)) {
    if (y > 540) {
      doc.addPage();
      y = margin;
    }
    doc.text(
      `${r.name}: ${r.total_hours}h / ${r.capacity}h (${r.utilisation_pct}%) · billable ${r.billable_hours}h · non-billable ${r.non_billable_hours}h`,
      margin,
      y,
    );
    y += 12;
  }

  y += 10;
  if (y > 500) {
    doc.addPage();
    y = margin;
  }
  line("Project effort", 13, true);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const r of opts.projects.slice(0, 30)) {
    if (y > 540) {
      doc.addPage();
      y = margin;
    }
    doc.text(
      `${r.project_name}: ${r.total_hours}h (billable ${r.billable_hours}h / non-billable ${r.non_billable_hours}h) · ${r.people} people · cost ${r.labor_cost}`,
      margin,
      y,
    );
    y += 12;
  }

  doc.save(`iProjectX_Timesheets_${stamp()}.pdf`);
}

/** Inclusive list of Monday week_start dates from fromWeek..toWeek. */
export function weeksInRange(fromWeek: string, toWeek: string): string[] {
  const out: string[] = [];
  let cur = fromWeek <= toWeek ? fromWeek : toWeek;
  const end = fromWeek <= toWeek ? toWeek : fromWeek;
  // safety cap ~2 years
  for (let i = 0; i < 110 && cur <= end; i++) {
    out.push(cur);
    const [y, m, d] = cur.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 7);
    cur = dt.toISOString().slice(0, 10);
  }
  return out;
}

export { DAY_KEYS };
