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

  // README
  const readme = [
    { A: "PMO Enterprise — Organization Export", B: "" },
    { A: "Organization", B: orgName },
    { A: "Generated", B: new Date().toISOString() },
    { A: "", B: "" },
    { A: "How to update", B: "Edit values in the sheets below (never rename headers). Add new rows at the bottom. Save the file and upload it from the Data Editor → Upload button. Admin role required." },
    { A: "Match keys", B: "Rows are matched by the columns listed under each sheet name below. New codes create new rows; existing codes update in place." },
    { A: "Project dates", B: "Edit planned_* and actual_* dates. start_date/end_date (Schedule Start/End) auto-sync as Actual → else Planned." },
    { A: "Current phase", B: "Prefer Stage Gates sheet status. current_phase is refreshed from the in-flight gate after gate rows are saved." },
    { A: "FK columns", B: "Use project_code / bu_code / resource_name (not UUIDs). Dependencies also use depends_on_project_code." },
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

// ---------- Legacy single-sheet template & parser (still used by New Project flow) ----------
export function downloadTemplate() {
  // Produce a minimal template for the projects sheet only — the full,
  // multi-sheet template comes from the "Download data" button (org export).
  const t = TABLES.find((x) => x.key === "projects")!;
  const headers = exportHeaders(t);
  const sample: Dict = { project_code: "PRJ-001", name: "Sample Project" };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Projects");
  XLSX.writeFile(wb, "PMO_Projects_Template.xlsx");
}

export async function parseWorkbook(file: File): Promise<ProjectRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "projects") || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Dict>(ws, { defval: null });
  const numericCols = [
    "budget","capex_approved","capex_incurred","opex_approved","opex_incurred",
    "benefits_target","benefits_realised","roi_percent",
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
