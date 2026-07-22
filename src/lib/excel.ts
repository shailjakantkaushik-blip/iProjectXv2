import * as XLSX from "xlsx";
import { TABLES, type TableDef, type FieldDef } from "@/lib/data-tables";
import { supabase } from "@/integrations/supabase/client";
import { syncScheduleDates } from "@/lib/project-dates";
import { persistCurrentPhaseFromGates } from "@/lib/project-phase";

// ---------- Legacy exports (kept for compatibility) ----------
export interface ProjectRow {
  project_code?: string | null;
  name: string;
  program?: string | null;
  sponsor?: string | null;
  priority?: string | null;
  status?: string | null;
  rag?: string | null;
  current_phase?: string | null;
  delivery_method?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  target_go_live?: string | null;
  budget?: number;
  capex_approved?: number;
  capex_incurred?: number;
  opex_approved?: number;
  opex_incurred?: number;
  benefits_target?: number;
  benefits_realised?: number;
  forecast_at_completion?: number;
  roi_percent?: number;
  description?: string | null;
}

export const PROJECT_COLUMNS = TABLES.find((t) => t.key === "projects")!.fields.map((f) => f.key);

// ---------- Helpers ----------
type Dict = Record<string, unknown>;

function dateOnly(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

function exportHeaders(t: TableDef): string[] {
  const cols: string[] = [];
  for (const f of t.fields) {
    if (f.fk === "project") cols.push("project_code");
    else if (f.fk === "bu") cols.push("bu_code");
    else cols.push(f.key);
  }
  return cols;
}

// Build a plain row from DB row + lookups.
function toExportRow(
  row: Dict,
  t: TableDef,
  projectById: Map<string, string>,
  buById: Map<string, string>,
  resourceById?: Map<string, string>,
): Dict {
  const out: Dict = {};
  for (const f of t.fields) {
    const v = row[f.key];
    if (f.fk === "project") {
      // Predecessor FK must not overwrite the successor project_code column.
      if (f.key === "depends_on_project_id") {
        out["depends_on_project_code"] = v ? projectById.get(String(v)) ?? "" : "";
      } else {
        out["project_code"] = v ? projectById.get(String(v)) ?? "" : "";
      }
    } else if (f.fk === "bu") {
      out["bu_code"] = v ? buById.get(String(v)) ?? "" : "";
    } else if (f.key === "resource_id" && resourceById) {
      out["resource_name"] = v ? resourceById.get(String(v)) ?? "" : "";
    } else if (f.type === "date") {
      out[f.key] = dateOnly(v);
    } else if (v == null) {
      out[f.key] = "";
    } else {
      out[f.key] = v;
    }
  }
  // Ensure dependency predecessor column header exists
  if (t.key === "dependencies" && !("depends_on_project_code" in out)) {
    out["depends_on_project_code"] = "";
  }
  return out;
}

// ---------- Full org export ----------
export async function exportOrganizationWorkbook(orgId: string, orgName: string) {
  // Preload lookup maps for FK resolution.
  const [{ data: projects }, { data: bus }, { data: resources }] = await Promise.all([
    supabase.from("projects").select("id,project_code,name").eq("org_id", orgId),
    supabase.from("business_units").select("id,code,name").eq("org_id", orgId),
    supabase.from("resources").select("id,name").eq("org_id", orgId),
  ]);
  const projectById = new Map((projects ?? []).map((p) => [p.id, p.project_code || p.name]));
  const buById = new Map((bus ?? []).map((b) => [b.id, b.code || b.name]));
  const resourceById = new Map((resources ?? []).map((r) => [r.id, r.name]));

  const wb = XLSX.utils.book_new();

  // README — customer-facing import/export guidance
  const readme = [
    { A: "iProjectX — Organization Data Workbook", B: "" },
    { A: "Organization", B: orgName },
    { A: "Generated", B: new Date().toISOString() },
    { A: "", B: "" },
    { A: "How to update", B: "Edit values below (never rename headers). Add rows at the bottom. Upload via Data Editor → Upload. Admin role required." },
    { A: "Match keys", B: "Rows match on the keys listed per sheet. New codes insert; existing codes update." },
    { A: "Project dates", B: "Edit planned_* and actual_* dates. start_date/end_date (Schedule Start/End) auto-sync as Actual → else Planned." },
    { A: "Current phase", B: "Prefer Stage Gates sheet status. current_phase is refreshed from the in-flight gate after gate rows are saved." },
    { A: "FK columns", B: "Use project_code / bu_code / resource_name (not UUIDs). Dependencies also use depends_on_project_code." },
    { A: "", B: "" },
    { A: "Finance model (canonical)", B: "" },
    { A: "1. Projects", B: "budget = approved funding; capex/opex approved & incurred; forecast_at_completion (FAC); benefits_* are rollups." },
    { A: "2. Benefits sheet", B: "Benefit lines are the detail source. Keep project benefits_target / benefits_realised in sync with the sum of lines." },
    { A: "3. FY Allocations", B: "Forward PLAN: budget + forecast $ per FY. Saving in-app cascades into monthly planned/forecast." },
    { A: "4. Financials (Monthly)", B: "Execution: planned/forecast (from FY) + actual after kickoff. YYYY-MM-01. Sync incurred from actuals on Financials." },
    { A: "5. ROI %", B: "Target ROI = (benefits_target − budget) / budget × 100. Store on Projects; realised ROI is computed from incurred + realised benefits." },
    { A: "6. Stage gates", B: "gate_name must match Stage Gate Definitions. current_phase mirrors the in-flight gate. Each gate auto-creates/updates a linked milestone; use Milestones sheet only for add-on (non-gate) dates." },
    { A: "7. Resource allocations", B: "allocation_percent is % of FTE for that month. Multiple projects in the same month are summed in capacity views." },
  ];
  const readmeSheet = XLSX.utils.json_to_sheet(readme, { skipHeader: true });
  XLSX.utils.book_append_sheet(wb, readmeSheet, "README");

  for (const t of TABLES) {
    const { data, error } = await (supabase as any)
      .from(t.key)
      .select("*")
      .eq("org_id", orgId)
      .order(t.orderBy ?? "created_at", { ascending: true });
    if (error) throw error;
    const headers = [...exportHeaders(t)];
    if (t.key === "dependencies") {
      // Insert predecessor code column right after project_code
      const idx = headers.indexOf("project_code");
      headers.splice(idx + 1, 0, "depends_on_project_code");
    }
    if (t.key === "resource_allocations") {
      const idx = headers.indexOf("resource_id");
      if (idx >= 0) headers[idx] = "resource_name";
    }
    const rows = (data ?? []).map((r: Dict) => toExportRow(r, t, projectById, buById, resourceById));
    // Ensure at least the header row is present
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [Object.fromEntries(headers.map((h) => [h, ""]))], { header: headers });
    XLSX.utils.book_append_sheet(wb, ws, t.label.slice(0, 31));
  }

  const safe = orgName.replace(/[^a-z0-9]+/gi, "_");
  XLSX.writeFile(wb, `PMO_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ---------- Full org import (admin only) ----------
export interface ImportReport {
  table: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function importOrganizationWorkbook(orgId: string, file: File): Promise<ImportReport[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  // Refresh lookups after each phase (projects first so downstream tables can match).
  const results: ImportReport[] = [];

  // Import projects & business_units & stage_gate_definitions first
  const ordered: TableDef[] = [
    ...TABLES.filter((t) => ["business_units", "stage_gate_definitions", "projects", "resources"].includes(t.key)),
    ...TABLES.filter((t) => !["business_units", "stage_gate_definitions", "projects", "resources"].includes(t.key)),
  ];

  for (const t of ordered) {
    const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === t.label.toLowerCase() || n.toLowerCase() === t.key.toLowerCase());
    if (!sheetName) {
      results.push({ table: t.label, inserted: 0, updated: 0, skipped: 0, errors: ["Sheet missing"] });
      continue;
    }
    const rows = XLSX.utils.sheet_to_json<Dict>(wb.Sheets[sheetName], { defval: null });
    const report = await importTableRows(orgId, t, rows);
    results.push(report);
  }
  return results;
}

async function importTableRows(orgId: string, t: TableDef, rows: Dict[]): Promise<ImportReport> {
  const report: ImportReport = { table: t.label, inserted: 0, updated: 0, skipped: 0, errors: [] };

  // Lookup maps per import (rebuilt fresh — projects may have been added earlier).
  const [{ data: projects }, { data: bus }, { data: resources }] = await Promise.all([
    supabase.from("projects").select("id,project_code,name").eq("org_id", orgId),
    supabase.from("business_units").select("id,code,name").eq("org_id", orgId),
    supabase.from("resources").select("id,name").eq("org_id", orgId),
  ]);
  const projectByCode = new Map<string, string>();
  (projects ?? []).forEach((p) => {
    if (p.project_code) projectByCode.set(String(p.project_code).trim(), p.id);
    if (p.name) projectByCode.set(String(p.name).trim(), p.id);
  });
  const buByCode = new Map<string, string>();
  (bus ?? []).forEach((b) => {
    if (b.code) buByCode.set(String(b.code).trim(), b.id);
    if (b.name) buByCode.set(String(b.name).trim(), b.id);
  });
  const resByName = new Map<string, string>();
  (resources ?? []).forEach((r) => { if (r.name) resByName.set(String(r.name).trim(), r.id); });

  // Existing rows for match key
  let existingByKey = new Map<string, string>();
  if (t.matchOn && t.matchOn.length) {
    const { data: existing } = await (supabase as any).from(t.key).select("*").eq("org_id", orgId);
    (existing ?? []).forEach((row: any) => {
      const key = buildMatchKey(t, row, projectByCode, "id");
      if (key) existingByKey.set(key, row.id);
    });
  }

  for (const raw of rows) {
    // Skip fully empty rows
    if (!Object.values(raw).some((v) => v != null && String(v).trim() !== "")) { report.skipped++; continue; }

    const payload: Dict = { org_id: orgId };
    let hasRequired = true;

    for (const f of t.fields) {
      let v: unknown;
      if (f.fk === "project") {
        const code = raw["project_code"] ?? raw["project code"];
        v = code ? projectByCode.get(String(code).trim()) : null;
        if (f.key === "depends_on_project_id") {
          const dep = raw["depends_on_project_code"] ?? raw["depends_on"];
          v = dep ? projectByCode.get(String(dep).trim()) : null;
        }
      } else if (f.fk === "bu") {
        const code = raw["bu_code"] ?? raw["business_unit"] ?? raw["bu"];
        v = code ? buByCode.get(String(code).trim()) : null;
      } else if (f.key === "resource_id") {
        const nm = raw["resource_name"] ?? raw["resource"];
        v = nm ? resByName.get(String(nm).trim()) : null;
      } else {
        v = raw[f.key];
      }

      if (v == null || v === "") {
        if (f.required) { hasRequired = false; break; }
        continue;
      }
      if (f.type === "number") payload[f.key] = Number(v) || 0;
      else if (f.type === "date") payload[f.key] = dateOnly(v);
      else if (f.type === "select" && f.options?.includes("true")) payload[f.key] = String(v).toLowerCase() === "true";
      else payload[f.key] = String(v);
    }

    if (!hasRequired) { report.skipped++; continue; }

    // Keep legacy schedule window aligned for Projects sheet imports.
    if (t.key === "projects") {
      Object.assign(payload, syncScheduleDates(payload as any));
    }

    // Match against existing
    const key = t.matchOn && t.matchOn.length ? buildMatchKeyFromPayload(t, payload, raw) : null;
    const existingId = key ? existingByKey.get(key) : undefined;

    if (existingId) {
      const { error } = await (supabase as any).from(t.key).update(payload).eq("id", existingId);
      if (error) report.errors.push(`Update ${key}: ${error.message}`);
      else report.updated++;
    } else {
      const { error } = await (supabase as any).from(t.key).insert(payload);
      if (error) report.errors.push(`Insert ${key ?? "(row)"}: ${error.message}`);
      else report.inserted++;
    }
  }

  // After stage gates import, mirror current phase onto each touched project
  // (DB trigger also does this when migration is applied).
  if (t.key === "stage_gates" && (report.inserted > 0 || report.updated > 0)) {
    const touched = new Set<string>();
    for (const raw of rows) {
      const code = raw["project_code"] ?? raw["project code"];
      if (!code) continue;
      const pid = projectByCode.get(String(code).trim());
      if (pid) touched.add(pid);
    }
    for (const pid of touched) {
      try {
        await persistCurrentPhaseFromGates(supabase as any, pid);
      } catch (e: any) {
        report.errors.push(`Phase sync ${pid}: ${e?.message ?? "failed"}`);
      }
    }
  }

  return report;
}

function buildMatchKey(t: TableDef, row: any, projectByCode: Map<string, string>, mode: "id" | "code"): string | null {
  if (!t.matchOn) return null;
  const parts: string[] = [];
  for (const key of t.matchOn) {
    if (key === "project_code") {
      // Reverse-lookup project code from id
      const pid = row.project_id;
      let code = "";
      for (const [c, id] of projectByCode) if (id === pid) { code = c; break; }
      parts.push(code);
    } else if (key === "resource_name") {
      parts.push(String(row.resource_id ?? ""));
    } else {
      parts.push(String(row[key] ?? "").trim());
    }
    void mode;
  }
  return parts.join("||");
}

function buildMatchKeyFromPayload(t: TableDef, payload: any, raw: Dict): string {
  const parts: string[] = [];
  for (const key of t.matchOn ?? []) {
    if (key === "project_code") {
      // Reverse using the raw project_code that came from the sheet
      parts.push(String(raw["project_code"] ?? "").trim());
    } else if (key === "resource_name") {
      parts.push(String(raw["resource_name"] ?? "").trim());
    } else {
      parts.push(String(payload[key] ?? raw[key] ?? "").trim());
    }
  }
  return parts.join("||");
}

// ---------- Blank multi-sheet customer template ----------
export function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const readme = [
    { A: "iProjectX — Blank Data Template", B: "" },
    { A: "Purpose", B: "Start clean: fill sheets, then upload via Data Editor → Upload (admin)." },
    { A: "", B: "" },
    { A: "Import order", B: "Business Units → Stage Gate Definitions → Projects → Resources → all other sheets." },
    { A: "Project code", B: "Human key used on every child sheet (risks, financials, allocations, etc.)." },
    { A: "Dates", B: "Use YYYY-MM-DD. Prefer Planned/Actual dates; Schedule Start/End auto-sync in the app." },
    { A: "FY labels", B: "Use FY26, FY27 style labels matching your org financial year (default April start → FY ends in labelled year)." },
    { A: "FY Allocations", B: "Set budget and forecast $ per FY. CapEx/OpEx/Benefits are optional detail of the budget split." },
    { A: "Benefits", B: "Add benefit lines; keep Projects.benefits_target / benefits_realised equal to the sum of lines." },
    { A: "ROI %", B: "Target ROI on Projects. Leave blank to let the app compute from benefits_target and budget." },
    { A: "Capacity", B: "resource_allocations.allocation_percent = % of person-month. Same person on two projects in one month should total ≤100% unless intentionally over-allocated." },
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(readme, { skipHeader: true }),
    "README",
  );

  for (const t of TABLES) {
    const headers = [...exportHeaders(t)];
    if (t.key === "dependencies") {
      const idx = headers.indexOf("project_code");
      headers.splice(idx + 1, 0, "depends_on_project_code");
    }
    if (t.key === "resource_allocations") {
      const idx = headers.indexOf("resource_id");
      if (idx >= 0) headers[idx] = "resource_name";
    }
    const sample = sampleRowForTemplate(t, headers);
    const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
    XLSX.utils.book_append_sheet(wb, ws, t.label.slice(0, 31));
  }
  XLSX.writeFile(wb, "iProjectX_Data_Template.xlsx");
}

function sampleRowForTemplate(t: TableDef, headers: string[]): Dict {
  const row: Dict = Object.fromEntries(headers.map((h) => [h, ""]));
  if (t.key === "business_units") {
    row.code = "DIG";
    row.name = "Digital";
  } else if (t.key === "stage_gate_definitions") {
    row.gate_name = "Discovery";
    row.sort_order = 1;
    row.is_active = "true";
  } else if (t.key === "projects") {
    row.project_code = "PRJ-001";
    row.name = "Sample Customer Portal";
    row.program = "Digital Transformation";
    row.priority = "P2 - High";
    row.status = "In Progress";
    row.rag = "Green";
    row.current_phase = "Build";
    row.delivery_method = "Hybrid";
    row.bu_code = "DIG";
    row.planned_start_date = "2025-07-01";
    row.planned_end_date = "2026-06-30";
    row.actual_start_date = "2025-07-15";
    row.start_date = "2025-07-15";
    row.end_date = "2026-06-30";
    row.target_go_live = "2026-05-15";
    row.budget = 2500000;
    row.capex_approved = 2000000;
    row.capex_incurred = 800000;
    row.opex_approved = 500000;
    row.opex_incurred = 120000;
    row.forecast_at_completion = 2550000;
    row.benefits_target = 4000000;
    row.benefits_realised = 500000;
    row.roi_percent = 60;
  } else if (t.key === "fy_allocations") {
    row.project_code = "PRJ-001";
    row.fy = "FY26";
    row.budget = 1500000;
    row.forecast = 1550000;
    row.capex = 1200000;
    row.opex = 300000;
    row.benefits = 2000000;
  } else if (t.key === "benefits") {
    row.project_code = "PRJ-001";
    row.title = "Revenue uplift";
    row.benefit_type = "Financial";
    row.target_value = 2500000;
    row.realised_value = 300000;
    row.status = "In Progress";
  } else if (t.key === "financials_monthly") {
    row.project_code = "PRJ-001";
    row.period_month = "2026-01-01";
    row.capex_planned = 100000;
    row.capex_actual = 95000;
    row.capex_forecast = 100000;
    row.opex_planned = 20000;
    row.opex_actual = 18000;
    row.opex_forecast = 20000;
  } else if (t.key === "resources") {
    row.name = "Alex Morgan";
    row.role = "Senior BA";
    row.skills = "Analysis,Agile";
    row.bu_code = "DIG";
    row.capacity_hours_week = 40;
    row.status = "Active";
  } else if (t.key === "resource_allocations") {
    row.project_code = "PRJ-001";
    row.resource_name = "Alex Morgan";
    row.period_month = "2026-01-01";
    row.allocation_percent = 50;
    row.allocated_hours = 80;
  } else if (t.key === "stage_gates") {
    row.project_code = "PRJ-001";
    row.gate_name = "Build";
    row.status = "In Review";
    row.planned_date = "2026-02-01";
  } else if (headers.includes("project_code")) {
    row.project_code = "PRJ-001";
  }
  return row;
}

export async function parseWorkbook(file: File): Promise<ProjectRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "projects") || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Dict>(ws, { defval: null });
  const numericCols = [
    "budget","capex_approved","capex_incurred","opex_approved","opex_incurred",
    "forecast_at_completion","benefits_target","benefits_realised","roi_percent",
    "baseline_budget","baseline_capex","baseline_opex","baseline_benefits",
  ];
  const dateCols = [
    "start_date","end_date","target_go_live",
    "planned_start_date","planned_end_date","actual_start_date","actual_end_date",
    "baseline_date",
  ];
  const out: ProjectRow[] = [];
  for (const r of rows) {
    if (!r.name) continue;
    const row: Dict = { name: String(r.name) };
    for (const c of PROJECT_COLUMNS) {
      const v = r[c as string];
      if (v == null || v === "") continue;
      if (numericCols.includes(c)) row[c] = Number(v) || 0;
      else if (dateCols.includes(c)) row[c] = dateOnly(v);
      else row[c] = String(v);
    }
    out.push(row as unknown as ProjectRow);
  }
  return out;
}

export function exportProjects(projects: Record<string, unknown>[]) {
  const dateCols = new Set(
    (TABLES.find((t) => t.key === "projects")?.fields ?? [])
      .filter((f) => f.type === "date")
      .map((f) => f.key),
  );
  const rows = projects.map((p) => {
    const o: Dict = {};
    for (const c of PROJECT_COLUMNS) {
      const v = p[c];
      if (dateCols.has(c)) o[c] = dateOnly(v);
      else o[c] = v ?? "";
    }
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(rows, { header: PROJECT_COLUMNS as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Projects");
  XLSX.writeFile(wb, `PMO_Projects_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
