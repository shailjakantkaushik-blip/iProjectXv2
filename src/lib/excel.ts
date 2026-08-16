import { TABLES, type TableDef, type FieldDef } from "@/lib/data-tables";
import { supabase } from "@/integrations/supabase/client";
import { syncScheduleDates } from "@/lib/project-dates";
import { persistCurrentPhaseFromGates } from "@/lib/project-phase";
import {
  listSheetNames,
  sheetToObjects,
  writeObjectSheets,
  writeReadmeAndSheets,
} from "@/lib/excel-io";

// ---------- Legacy exports (kept for compatibility) ----------
export interface ProjectRow {
  project_code?: string | null;
  name: string;
  portfolio?: string | null;
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
    if (f.fk === "project") cols.push(f.key === "depends_on_project_id" ? "depends_on_project_code" : "project_code");
    else if (f.fk === "bu") cols.push("bu_code");
    else if (f.fk === "stream") cols.push("stream_code");
    else if (f.fk === "stage_gate") cols.push("stage_gate_name");
    else if (f.fk === "sprint") cols.push("sprint_name");
    else if (f.fk === "user") {
      if (f.key === "user_id") cols.push("linked_login");
      else if (f.key === "manager_user_id") cols.push("manager_login");
      else if (f.key === "approver_user_id") cols.push("approver_login");
      else cols.push(f.key.replace(/_user_id$/, "_login").replace(/_id$/, "_login"));
    }
    else if (f.key === "resource_id") cols.push("resource_name");
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
  streamById?: Map<string, string>,
  gateById?: Map<string, string>,
  userById?: Map<string, string>,
  sprintById?: Map<string, string>,
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
    } else if (f.fk === "stream") {
      out["stream_code"] = v && streamById ? streamById.get(String(v)) ?? "" : "";
    } else if (f.fk === "stage_gate") {
      out["stage_gate_name"] = v && gateById ? gateById.get(String(v)) ?? "" : "";
    } else if (f.fk === "sprint") {
      out["sprint_name"] = v && sprintById ? sprintById.get(String(v)) ?? "" : "";
    } else if (f.fk === "user") {
      const label = v && userById ? userById.get(String(v)) ?? "" : "";
      if (f.key === "user_id") out["linked_login"] = label;
      else if (f.key === "manager_user_id") out["manager_login"] = label;
      else if (f.key === "approver_user_id") out["approver_login"] = label;
      else out[f.key.replace(/_user_id$/, "_login").replace(/_id$/, "_login")] = label;
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
  const [{ data: projects }, { data: bus }, { data: resources }, { data: streams }, { data: gates }, { data: sprints }, { data: profiles }] =
    await Promise.all([
      supabase.from("projects").select("id,project_code,name").eq("org_id", orgId),
      supabase.from("business_units").select("id,code,name").eq("org_id", orgId),
      supabase.from("resources").select("id,name").eq("org_id", orgId),
      supabase.from("project_streams").select("id,code,name,project_id").eq("org_id", orgId),
      supabase.from("stage_gates").select("id,gate_name").eq("org_id", orgId),
      supabase.from("sprints").select("id,sprint_number,name").eq("org_id", orgId),
      supabase.from("profiles").select("id,full_name,email").eq("org_id", orgId),
    ]);
  const projectById = new Map((projects ?? []).map((p) => [p.id, p.project_code || p.name]));
  const buById = new Map((bus ?? []).map((b) => [b.id, b.code || b.name]));
  const resourceById = new Map((resources ?? []).map((r) => [r.id, r.name]));
  const streamById = new Map(
    (streams ?? []).map((s: any) => [s.id, s.code || s.name || s.id] as [string, string]),
  );
  const gateById = new Map((gates ?? []).map((g: any) => [g.id, g.gate_name || "Gate"]));
  const sprintById = new Map(
    (sprints ?? []).map((s: any) => {
      const num = s.sprint_number != null ? `#${s.sprint_number}` : "Sprint";
      const name = String(s.name || "").trim();
      return [s.id, name ? `${num} · ${name}` : num] as [string, string];
    }),
  );
  const userById = new Map(
    (profiles ?? []).map((p: any) => [
      p.id,
      String(p.full_name || "").trim() || String(p.email || "").trim() || "Unknown user",
    ]),
  );

  const readme: Array<[string, string]> = [
    ["iProjectX — Organization Data Workbook", ""],
    ["Organization", orgName],
    ["Generated", new Date().toISOString()],
    ["", ""],
    ["How to update", "Edit values below (never rename headers). Add rows at the bottom. Upload via Data Editor → Upload. Admin role required."],
    ["Match keys", "Rows match on the keys listed per sheet. New codes insert; existing codes update."],
    ["Project dates", "Edit planned_* and actual_* dates. start_date/end_date (Schedule Start/End) auto-sync as Actual → else Planned."],
    ["Current phase", "Prefer Stage Gates sheet status. current_phase is refreshed from the in-flight gate after gate rows are saved."],
    ["FK columns", "Use project_code / bu_code / resource_name / stream_code / stage_gate_name / sprint_name / linked_login / manager_login (not UUIDs). Dependencies also use depends_on_project_code."],
    ["Streams", "Every project has a Core stream. Add Project Streams rows for more lanes. Child sheets (gates, milestones, finance, allocations) use stream_code."],
    ["Work items", "stage_gate_name = Waterfall/Hybrid phase. sprint_name = Agile/Hybrid sprint (#N · name, or just #N / name)."],
    ["", ""],
    ["Finance model (canonical)", ""],
    ["1. Projects", "budget = approved envelope (rollup from Project Streams when streams are on); capex/opex approved & incurred; forecast_at_completion (FAC) = FY Allocation forecast $; benefits_* are rollups. portfolio = Business Strategic | IT Strategic | CAPEX | Unfunded (used by Executive Cockpit health & segmentation)."],
    ["2. Project Streams", "Delivery lanes under a project. Each stream owns planned/actual dates, gates, finance, and allocations."],
    ["3. Benefits sheet", "Benefit lines are the detail source. Keep project benefits_target / benefits_realised in sync with the sum of lines."],
    ["4. FY Allocations", "Forward PLAN: budget + forecast $ per FY. Optional stream_code when streams are enabled."],
    ["5. Financials (Monthly)", "Execution: planned/forecast + actual. YYYY-MM-01. Optional stream_code."],
    ["6. ROI %", "Target ROI = (benefits_target − budget) / budget × 100. Store on Projects; realised ROI is computed from incurred + realised benefits."],
    ["7. Stage gates", "gate_name must match Stage Gate Definitions. Include stream_code when the project uses streams."],
    ["7b. Milestones", "Standalone milestones. Include stream_code when the project uses streams so they land on the right lane."],
    ["8. Resource allocations", "allocation_percent is % of FTE for that month. Optional stream_code scopes allocation to a stream."],
  ];

  const sheets: Array<{ name: string; headers: string[]; rows: Dict[] }> = [];
  for (const t of TABLES) {
    const { data, error } = await (supabase as any)
      .from(t.key)
      .select("*")
      .eq("org_id", orgId)
      .order(t.orderBy ?? "created_at", { ascending: true });
    if (error) throw error;
    const headers = [...exportHeaders(t)];
    if (t.key === "dependencies") {
      // depends_on_project_code already emitted by exportHeaders for depends_on_project_id
    }
    const rows = (data ?? []).map((r: Dict) =>
      toExportRow(r, t, projectById, buById, resourceById, streamById, gateById, userById, sprintById),
    );
    sheets.push({
      name: t.label.slice(0, 31),
      headers,
      rows: rows.length ? rows : [Object.fromEntries(headers.map((h) => [h, ""]))],
    });
  }

  const safe = orgName.replace(/[^a-z0-9]+/gi, "_");
  await writeReadmeAndSheets(readme, sheets, `PMO_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
  const names = await listSheetNames(file);
  const results: ImportReport[] = [];

  // Import lookup tables + projects + streams (+ sprints) before child sheets that reference them.
  const firstKeys = [
    "business_units",
    "stage_gate_definitions",
    "projects",
    "project_streams",
    "resources",
    "sprints",
  ];
  const ordered: TableDef[] = [
    ...TABLES.filter((t) => firstKeys.includes(t.key)),
    ...TABLES.filter((t) => !firstKeys.includes(t.key)),
  ];

  for (const t of ordered) {
    const sheetName = names.find((n) => {
      const lower = n.toLowerCase();
      if (lower === t.label.toLowerCase() || lower === t.key.toLowerCase()) return true;
      // Renamed Change Requests → Release Register; keep old workbook sheets working.
      if (t.key === "change_requests" && (lower === "change requests" || lower === "release & change register")) {
        return true;
      }
      return false;
    });
    if (!sheetName) {
      results.push({ table: t.label, inserted: 0, updated: 0, skipped: 0, errors: ["Sheet missing"] });
      continue;
    }
    const rows = await sheetToObjects(file, sheetName);
    const report = await importTableRows(orgId, t, rows);
    results.push(report);
  }
  return results;
}

async function importTableRows(orgId: string, t: TableDef, rows: Dict[]): Promise<ImportReport> {
  const report: ImportReport = { table: t.label, inserted: 0, updated: 0, skipped: 0, errors: [] };

  // Lookup maps per import (rebuilt fresh — projects/streams may have been added earlier).
  const [{ data: projects }, { data: bus }, { data: resources }, { data: streams }, { data: gates }, { data: sprints }, { data: profiles }] =
    await Promise.all([
      supabase.from("projects").select("id,project_code,name").eq("org_id", orgId),
      supabase.from("business_units").select("id,code,name").eq("org_id", orgId),
      supabase.from("resources").select("id,name").eq("org_id", orgId),
      supabase.from("project_streams").select("id,code,name,project_id").eq("org_id", orgId),
      supabase.from("stage_gates").select("id,project_id,stream_id,gate_name").eq("org_id", orgId),
      supabase.from("sprints").select("id,project_id,sprint_number,name").eq("org_id", orgId),
      supabase.from("profiles").select("id,full_name,email").eq("org_id", orgId),
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
  // stream lookup: "CODE", "NAME", and "PROJECTCODE||CODE" for disambiguation
  const streamByCode = new Map<string, string>();
  (streams ?? []).forEach((s: any) => {
    const pid = String(s.project_id);
    const code = s.code ? String(s.code).trim() : "";
    const name = s.name ? String(s.name).trim() : "";
    if (code) {
      streamByCode.set(code, s.id);
      streamByCode.set(`${pid}||${code}`, s.id);
    }
    if (name) {
      streamByCode.set(name, s.id);
      streamByCode.set(`${pid}||${name}`, s.id);
    }
  });
  const streamCodeById = new Map<string, string>();
  (streams ?? []).forEach((s: any) => {
    streamCodeById.set(s.id, s.code || s.name || s.id);
  });
  const gateByName = new Map<string, string>();
  (gates ?? []).forEach((g: any) => {
    const name = String(g.gate_name || "").trim();
    if (!name) return;
    gateByName.set(name, g.id);
    if (g.project_id) gateByName.set(`${g.project_id}||${name}`, g.id);
    if (g.project_id && g.stream_id) gateByName.set(`${g.project_id}||${g.stream_id}||${name}`, g.id);
  });
  const sprintByLabel = new Map<string, string>();
  (sprints ?? []).forEach((s: any) => {
    const num = s.sprint_number != null ? `#${s.sprint_number}` : "Sprint";
    const name = String(s.name || "").trim();
    const label = name ? `${num} · ${name}` : num;
    const keys = [label, num, name, s.sprint_number != null ? String(s.sprint_number) : ""].filter(Boolean);
    for (const k of keys) {
      sprintByLabel.set(k, s.id);
      if (s.project_id) sprintByLabel.set(`${s.project_id}||${k}`, s.id);
    }
  });
  const userByLabel = new Map<string, string>();
  (profiles ?? []).forEach((p: any) => {
    if (p.email) userByLabel.set(String(p.email).trim().toLowerCase(), p.id);
    if (p.full_name) userByLabel.set(String(p.full_name).trim().toLowerCase(), p.id);
  });

  // Existing rows for match key
  let existingByKey = new Map<string, string>();
  if (t.matchOn && t.matchOn.length) {
    const { data: existing } = await (supabase as any).from(t.key).select("*").eq("org_id", orgId);
    (existing ?? []).forEach((row: any) => {
      const key = buildMatchKey(t, row, projectByCode, streamCodeById);
      if (key) existingByKey.set(key, row.id);
    });
  }

  for (const raw of rows) {
    // Skip fully empty rows
    if (!Object.values(raw).some((v) => v != null && String(v).trim() !== "")) { report.skipped++; continue; }

    const payload: Dict = { org_id: orgId };
    let hasRequired = true;
    let resolvedProjectId: string | null = null;

    for (const f of t.fields) {
      let v: unknown;
      if (f.fk === "project") {
        const code = raw["project_code"] ?? raw["project code"];
        v = code ? projectByCode.get(String(code).trim()) : null;
        if (f.key === "depends_on_project_id") {
          const dep = raw["depends_on_project_code"] ?? raw["depends_on"];
          v = dep ? projectByCode.get(String(dep).trim()) : null;
        } else if (v) {
          resolvedProjectId = String(v);
        }
      } else if (f.fk === "bu") {
        const code = raw["bu_code"] ?? raw["business_unit"] ?? raw["bu"];
        v = code ? buByCode.get(String(code).trim()) : null;
      } else if (f.fk === "stream") {
        const code = raw["stream_code"] ?? raw["stream"] ?? raw["stream_name"];
        if (code) {
          const c = String(code).trim();
          v =
            (resolvedProjectId && streamByCode.get(`${resolvedProjectId}||${c}`)) ||
            streamByCode.get(c) ||
            null;
        } else {
          v = null;
        }
      } else if (f.fk === "stage_gate") {
        const name = raw["stage_gate_name"] ?? raw["stage_gate"] ?? raw["gate_name"] ?? raw[f.key];
        if (name) {
          const n = String(name).trim();
          const streamRaw = raw["stream_code"] ?? raw["stream"];
          const streamId = streamRaw
            ? (resolvedProjectId && streamByCode.get(`${resolvedProjectId}||${String(streamRaw).trim()}`)) ||
              streamByCode.get(String(streamRaw).trim())
            : null;
          v =
            (resolvedProjectId && streamId && gateByName.get(`${resolvedProjectId}||${streamId}||${n}`)) ||
            (resolvedProjectId && gateByName.get(`${resolvedProjectId}||${n}`)) ||
            gateByName.get(n) ||
            null;
        } else {
          v = null;
        }
      } else if (f.fk === "sprint") {
        const name = raw["sprint_name"] ?? raw["sprint"] ?? raw[f.key];
        if (name) {
          const n = String(name).trim();
          v =
            (resolvedProjectId && sprintByLabel.get(`${resolvedProjectId}||${n}`)) ||
            sprintByLabel.get(n) ||
            null;
        } else {
          v = null;
        }
      } else if (f.fk === "user") {
        const label =
          (f.key === "user_id" ? raw["linked_login"] : null) ??
          (f.key === "manager_user_id" ? raw["manager_login"] : null) ??
          (f.key === "approver_user_id" ? raw["approver_login"] : null) ??
          raw[f.key];
        v = label ? userByLabel.get(String(label).trim().toLowerCase()) || null : null;
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

function buildMatchKey(
  t: TableDef,
  row: any,
  projectByCode: Map<string, string>,
  streamCodeById: Map<string, string>,
): string | null {
  if (!t.matchOn) return null;
  const parts: string[] = [];
  for (const key of t.matchOn) {
    if (key === "project_code") {
      // Reverse-lookup project code from id
      const pid = row.project_id;
      let code = "";
      for (const [c, id] of projectByCode) if (id === pid) { code = c; break; }
      parts.push(code);
    } else if (key === "stream_code") {
      parts.push(row.stream_id ? String(streamCodeById.get(String(row.stream_id)) ?? "") : "");
    } else if (key === "resource_name") {
      parts.push(String(row.resource_id ?? ""));
    } else {
      parts.push(String(row[key] ?? "").trim());
    }
  }
  return parts.join("||");
}

function buildMatchKeyFromPayload(t: TableDef, payload: any, raw: Dict): string {
  const parts: string[] = [];
  for (const key of t.matchOn ?? []) {
    if (key === "project_code") {
      // Reverse using the raw project_code that came from the sheet
      parts.push(String(raw["project_code"] ?? "").trim());
    } else if (key === "stream_code") {
      parts.push(String(raw["stream_code"] ?? raw["stream"] ?? "").trim());
    } else if (key === "resource_name") {
      parts.push(String(raw["resource_name"] ?? "").trim());
    } else {
      parts.push(String(payload[key] ?? raw[key] ?? "").trim());
    }
  }
  return parts.join("||");
}

// ---------- Blank multi-sheet customer template ----------
export async function downloadTemplate() {
  const readme: Array<[string, string]> = [
    ["iProjectX — Blank Data Template", ""],
    ["Purpose", "Start clean: fill sheets, then upload via Data Editor → Upload (admin)."],
    ["", ""],
    ["Import order", "Business Units → Stage Gate Definitions → Projects → Project Streams → Resources → all other sheets."],
    ["Project code", "Human key used on every child sheet (risks, financials, allocations, etc.)."],
    ["Stream code", "Optional. On Project Streams sheet set `code`. Child sheets reference it via stream_code when projects.streams_enabled=true."],
    ["Dates", "Use YYYY-MM-DD. Prefer Planned/Actual dates; Schedule Start/End auto-sync in the app."],
    ["FY labels", "Use FY26, FY27 style labels matching your org financial year (default April start → FY ends in labelled year)."],
    ["FY Allocations", "Set budget and forecast $ per FY. CapEx/OpEx/Benefits are optional detail of the budget split. Optional stream_code."],
    ["Benefits", "Add benefit lines; keep Projects.benefits_target / benefits_realised equal to the sum of lines."],
    ["ROI %", "Target ROI on Projects. Leave blank to let the app compute from benefits_target and budget."],
    ["Capacity", "resource_allocations.allocation_percent = % of person-month. Optional stream_code scopes the allocation to a stream."],
  ];

  const sheets: Array<{ name: string; headers: string[]; rows: Dict[] }> = [];
  for (const t of TABLES) {
    const headers = [...exportHeaders(t)];
    sheets.push({
      name: t.label.slice(0, 31),
      headers,
      rows: [sampleRowForTemplate(t, headers)],
    });
  }
  await writeReadmeAndSheets(readme, sheets, "iProjectX_Data_Template.xlsx");
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
    row.portfolio = "Business Strategic";
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
    row.streams_enabled = "true";
  } else if (t.key === "project_streams") {
    row.project_code = "PRJ-001";
    row.name = "Core";
    row.code = "CORE";
    row.is_default = "true";
    row.sort_order = 0;
    row.status = "In Progress";
    row.rag = "Green";
    row.planned_start_date = "2025-07-01";
    row.planned_end_date = "2026-06-30";
    row.budget = 1500000;
    row.capex_approved = 1200000;
    row.opex_approved = 300000;
  } else if (t.key === "fy_allocations") {
    row.project_code = "PRJ-001";
    row.stream_code = "CORE";
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
    row.stream_code = "CORE";
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
    row.stream_code = "CORE";
    row.resource_name = "Alex Morgan";
    row.period_month = "2026-01-01";
    row.allocation_percent = 50;
    row.allocated_hours = 80;
  } else if (t.key === "stage_gates") {
    row.project_code = "PRJ-001";
    row.stream_code = "CORE";
    row.gate_name = "Build";
    row.status = "In Review";
    row.planned_date = "2026-02-01";
  } else if (t.key === "milestones") {
    row.project_code = "PRJ-001";
    row.stream_code = "CORE";
    row.name = "UAT Complete";
    row.planned_date = "2026-04-01";
    row.status = "Not Started";
  } else if (headers.includes("project_code")) {
    row.project_code = "PRJ-001";
  }
  return row;
}

export async function parseWorkbook(file: File): Promise<ProjectRow[]> {
  const names = await listSheetNames(file);
  const sheetName = names.find((n) => n.toLowerCase() === "projects") || names[0];
  if (!sheetName) return [];
  const rows = await sheetToObjects(file, sheetName);
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

export async function exportProjects(projects: Record<string, unknown>[]) {
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
  await writeObjectSheets(
    [{ name: "Projects", headers: PROJECT_COLUMNS as string[], rows }],
    `PMO_Projects_Export_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
