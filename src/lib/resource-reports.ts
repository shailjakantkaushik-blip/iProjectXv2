/**
 * Standard resource reports: plan vs actual, utilisation, project effort.
 * Exports Excel (multi-sheet) and CSV.
 */
import { writeObjectSheets } from "@/lib/excel-io";
import type { AllocationPvaRow } from "@/lib/resource-allocation-analytics";

export type ResourceUtilisationExportRow = {
  resource: string;
  role: string;
  capacity_hours_week: number;
  plan_percent: number;
  plan_hours: number;
  actual_hours: number;
  billable_hours: number;
  non_billable_hours: number;
  variance_hours: number;
  util_vs_plan_pct: number | null;
  status: string;
};

export type ResourceProjectEffortRow = {
  resource: string;
  project: string;
  plan_hours: number;
  actual_hours: number;
  billable_hours: number;
  non_billable_hours: number;
  variance_hours: number;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Record<string, string | number | null | undefined>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

export function buildResourceUtilisationExport(opts: {
  resources: Array<{
    id: string;
    name: string;
    role?: string | null;
    capacity_hours_week?: number | null;
  }>;
  /** Plan % / hours by resource for the selected period. */
  planByResource: Map<string, { percent: number; hours: number }>;
  /** Actuals by resource from approved timesheets. */
  actualByResource: Map<string, { hours: number; billable: number; non_billable: number }>;
}): ResourceUtilisationExportRow[] {
  return opts.resources
    .map((r) => {
      const plan = opts.planByResource.get(r.id) ?? { percent: 0, hours: 0 };
      const act = opts.actualByResource.get(r.id) ?? {
        hours: 0,
        billable: 0,
        non_billable: 0,
      };
      const util = plan.hours > 0 ? Math.round((act.hours / plan.hours) * 1000) / 10 : null;
      let status = "Under";
      if (plan.hours <= 0 && act.hours > 0) status = "Unplanned";
      else if ((util ?? plan.percent) > 110 || plan.percent > 100) status = "Over";
      else if ((util ?? plan.percent) >= 60) status = "Optimal";
      return {
        resource: r.name,
        role: r.role || "",
        capacity_hours_week: Number(r.capacity_hours_week) || 40,
        plan_percent: Math.round(plan.percent * 10) / 10,
        plan_hours: Math.round(plan.hours * 100) / 100,
        actual_hours: Math.round(act.hours * 100) / 100,
        billable_hours: Math.round(act.billable * 100) / 100,
        non_billable_hours: Math.round(act.non_billable * 100) / 100,
        variance_hours: Math.round((plan.hours - act.hours) * 100) / 100,
        util_vs_plan_pct: util,
        status,
      };
    })
    .sort((a, b) => a.resource.localeCompare(b.resource));
}

export function pvaRowsToExport(rows: AllocationPvaRow[]): Record<string, string | number>[] {
  return rows.map((r) => ({
    Dimension: r.label,
    "Alloc h": r.planned_hours,
    "Demand h": r.demand_hours,
    "Demand gap h": r.demand_gap_hours,
    "Actual h": r.actual_hours,
    "Billable h": r.billable_hours,
    "Non-billable h": r.non_billable_hours,
    "Variance h": r.variance_hours,
    "Util %": r.utilization_pct ?? "",
    Status: r.status,
    "Demand FTE $": r.planned_labor_cost,
    "Actual FTE $": r.labor_cost,
  }));
}

export async function exportResourceReportsExcel(opts: {
  utilisation: ResourceUtilisationExportRow[];
  pva: AllocationPvaRow[];
  filename?: string;
}) {
  const utilHeaders = [
    "Resource",
    "Role",
    "Capacity h/wk",
    "Alloc %",
    "Alloc h",
    "Actual h",
    "Billable h",
    "Non-billable / unallocated h",
    "Variance h",
    "Util vs alloc %",
    "Status",
  ];
  const utilSheet = opts.utilisation.map((r) => ({
    Resource: r.resource,
    Role: r.role,
    "Capacity h/wk": r.capacity_hours_week,
    "Alloc %": r.plan_percent,
    "Alloc h": r.plan_hours,
    "Actual h": r.actual_hours,
    "Billable h": r.billable_hours,
    "Non-billable / unallocated h": r.non_billable_hours,
    "Variance h": r.variance_hours,
    "Util vs alloc %": r.util_vs_plan_pct ?? "",
    Status: r.status,
  }));
  const pvaHeaders = [
    "Dimension",
    "Alloc h",
    "Demand h",
    "Demand gap h",
    "Actual h",
    "Billable h",
    "Non-billable h",
    "Variance h",
    "Util %",
    "Status",
    "Demand FTE $",
    "Actual FTE $",
  ];
  const pvaSheet = pvaRowsToExport(opts.pva);
  await writeObjectSheets(
    [
      { name: "Utilisation_Alloc_vs_Actual", headers: utilHeaders, rows: utilSheet },
      {
        name: "Detailed_PVA",
        headers: pvaHeaders,
        rows: pvaSheet.length ? pvaSheet : [{ Dimension: "No PVA rows" }],
      },
    ],
    opts.filename || `Resource_Reports_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

export function exportResourceUtilisationCsv(
  rows: ResourceUtilisationExportRow[],
  filename?: string,
) {
  const mapped = rows.map((r) => ({
    Resource: r.resource,
    Role: r.role,
    "Capacity h/wk": r.capacity_hours_week,
    "Alloc %": r.plan_percent,
    "Alloc h": r.plan_hours,
    "Actual h": r.actual_hours,
    "Billable h": r.billable_hours,
    "Non-billable / unallocated h": r.non_billable_hours,
    "Variance h": r.variance_hours,
    "Util vs alloc %": r.util_vs_plan_pct ?? "",
    Status: r.status,
  }));
  const blob = new Blob([toCsv(mapped)], { type: "text/csv;charset=utf-8" });
  downloadBlob(
    blob,
    filename || `Resource_Utilisation_${new Date().toISOString().slice(0, 10)}.csv`,
  );
}
