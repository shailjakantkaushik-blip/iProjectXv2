/**
 * Wipe + reseed iProjectX operational sample data.
 * Never accepts an organisation id from the client. Never touches another tenant.
 */
import { DEMAND_STAGES } from "@/lib/demand-pipeline";
import { PLATFORM_ORG_SLUG, assertPlatformOrgId, isPlatformOrgRow } from "@/lib/platform-org";
import { PLATFORM_SEED_PROJECTS, PLATFORM_WATERFALL_GATES } from "@/lib/platform-seed";
import { weekStartMonday } from "@/lib/timesheet";

export const PLATFORM_SAMPLE_PACKS = [4, 10, 16] as const;
export type PlatformSamplePack = (typeof PLATFORM_SAMPLE_PACKS)[number];

export const PLATFORM_SAMPLE_CONFIRM = PLATFORM_ORG_SLUG;

export const PLATFORM_SAMPLE_PACK_BLURBS: Record<PlatformSamplePack, string> = {
  4: "Thin walk — Hybrid, Agile, Waterfall, Hybrid (PRJ-001–004).",
  10: "Suite — adds Red RAG (PRJ-009) and more programs. Completed and not-started stay in the 16 pack.",
  16: "Full demo — includes completed PRJ-012 and not-started PRJ-014.",
};

/** Org-scoped operational tables wiped before reseed. Control plane is not in this list. */
export const SAMPLE_WIPE_TABLES = [
  "timesheet_approvals",
  "timesheet_entries",
  "timesheets",
  "work_item_assignees",
  "resource_allocations",
  "opex_other_costs",
  "project_forecast_phase_resources",
  "project_forecast_other_costs",
  "project_forecast_phases",
  "project_forecasts",
  "project_meeting_summaries",
  "governance_tasks",
  "governance_links",
  "stage_gate_checklist_responses",
  "scenario_projects",
  "portfolio_scenarios",
  "work_items",
  "change_requests",
  "sprints",
  "dependencies",
  "documents",
  "lessons_learned",
  "status_updates",
  "benefits",
  "financials_monthly",
  "fy_allocations",
  "demand_pipeline",
  "stakeholders",
  "risks",
  "issues",
  "actions",
  "decisions",
  "audit_events",
  "audit_log",
  "project_purge_notices",
  "governance_channels",
  "stage_gates",
  "milestones",
  "project_streams",
  "resources",
  "hierarchy_envelopes",
  "projects",
] as const;

export const SAMPLE_KEEP_SURFACES = [
  "organizations / profiles / user_roles",
  "business_units",
  "landing, billing plans, invoice template",
  "delivery method templates",
] as const;

export const SAMPLE_PREVIEW_TABLES = [
  "projects",
  "project_streams",
  "stage_gates",
  "risks",
  "issues",
  "actions",
  "decisions",
  "work_items",
  "timesheets",
  "demand_pipeline",
  "resources",
  "fy_allocations",
  "benefits",
  "governance_channels",
] as const;

const AGILE_GATES = [
  "Discovery",
  "MVP Definition",
  "Build / Iterate",
  "Release Readiness",
  "Launch",
  "Hypercare",
] as const;

const ALIGNMENT_FOR_PROGRAM: Record<string, string> = {
  "Digital Transformation": "Customer & Digital",
  "Customer Experience": "Customer & Digital",
  "Platform Modernisation": "Technology",
  "Data & Analytics": "Technology",
  Infrastructure: "Technology",
  "Risk & Compliance": "Risk & Compliance",
  "Finance Transformation": "Enterprise Services",
  "People Systems": "Enterprise Services",
  Procurement: "Enterprise Services",
  "Operations Excellence": "Operations",
};

const ALT_STREAM_FOR_PROGRAM: Record<string, string> = {
  "Digital Transformation": "Experience",
  "Platform Modernisation": "Integrations",
  "Data & Analytics": "Ingestion",
  "Risk & Compliance": "Controls",
  "Customer Experience": "Voice",
  "Finance Transformation": "Close",
  "People Systems": "Self-service",
  Procurement: "Supplier UX",
  Infrastructure: "Network",
  "Operations Excellence": "Straight-through",
};

const SAMPLE_META: Record<
  string,
  { phase: string; priority: string; sponsor: string }
> = {
  "PRJ-001": { phase: "Build", priority: "P1 - Critical", sponsor: "CDO" },
  "PRJ-002": { phase: "Testing", priority: "P1 - Critical", sponsor: "CTO" },
  "PRJ-003": { phase: "Design", priority: "P2 - High", sponsor: "CDO" },
  "PRJ-004": { phase: "Business Case / Full Funding", priority: "P1 - Critical", sponsor: "CISO" },
  "PRJ-005": { phase: "Deployment", priority: "P2 - High", sponsor: "COO" },
  "PRJ-006": { phase: "Handover", priority: "P2 - High", sponsor: "CFO" },
  "PRJ-007": { phase: "Build", priority: "P3 - Medium", sponsor: "CHRO" },
  "PRJ-008": { phase: "Discovery", priority: "P3 - Medium", sponsor: "CPO" },
  "PRJ-009": { phase: "Testing", priority: "P2 - High", sponsor: "CTO" },
  "PRJ-010": { phase: "Build", priority: "P1 - Critical", sponsor: "CRO" },
  "PRJ-011": { phase: "Business Case / Seed Funding", priority: "P2 - High", sponsor: "CDO" },
  "PRJ-012": { phase: "Benefit Realisation", priority: "P3 - Medium", sponsor: "CTO" },
  "PRJ-013": { phase: "Design", priority: "P2 - High", sponsor: "COO" },
  "PRJ-014": { phase: "Discovery", priority: "P4 - Low", sponsor: "CSO" },
  "PRJ-015": { phase: "Deployment", priority: "P2 - High", sponsor: "CTO" },
  "PRJ-016": { phase: "Build", priority: "P2 - High", sponsor: "COO" },
};

const SAMPLE_RESOURCES = [
  { name: "Alex Morgan", role: "Senior BA", skills: "Analysis,Agile,Jira", rate: 95 },
  { name: "Jordan Lee", role: "Tech Lead", skills: "Architecture,Cloud,API", rate: 140 },
  { name: "Sam Rivera", role: "Delivery Manager", skills: "PMO,RAID,Stakeholder", rate: 120 },
  { name: "Taylor Kim", role: "Data Engineer", skills: "SQL,ETL,Python", rate: 125 },
  { name: "Casey Brooks", role: "QA Lead", skills: "Testing,Automation", rate: 100 },
  { name: "Riley Chen", role: "UX Designer", skills: "Design,Research", rate: 105 },
  { name: "Morgan Patel", role: "Security Analyst", skills: "Security,Risk", rate: 115 },
  { name: "Avery Nguyen", role: "Finance Analyst", skills: "Finance,Benefits", rate: 90 },
] as const;

export type PlatformOrgRef = { id: string; name: string; slug: string };

export type SampleResetDb = {
  resolvePlatformOrg: () => Promise<PlatformOrgRef | null>;
  countEqOrgId: (table: string, orgId: string) => Promise<number>;
  deleteEqOrgId: (table: string, orgId: string) => Promise<void>;
  deleteScenarioProjectsForOrg: (orgId: string) => Promise<void>;
  clearGovernanceParents: (orgId: string) => Promise<void>;
  ensureDeliveryMethods: (orgId: string) => Promise<void>;
  findDeliveryMethods: (orgId: string) => Promise<Array<{ id: string; name: string }>>;
  findPlatformUser: (orgId: string) => Promise<{ id: string } | null>;
  selectEqOrgId: (table: string, columns: string, orgId: string) => Promise<Array<Record<string, unknown>>>;
  updateByIdOrg: (table: string, id: string, orgId: string, patch: Record<string, unknown>) => Promise<void>;
  insert: (table: string, rows: Array<Record<string, unknown>>) => Promise<Array<{ id: string }>>;
};

export type SamplePreview = {
  org: PlatformOrgRef;
  counts: Record<string, number>;
};

export type SampleResetReport = {
  pack: PlatformSamplePack;
  org: PlatformOrgRef;
  wiped: string[];
  skipped: string[];
  created: Record<string, number>;
};

export function parseSamplePack(value: unknown): PlatformSamplePack {
  const n = Number(value);
  if (n === 4 || n === 10 || n === 16) return n;
  throw new Error("Choose 4, 10, or 16 projects — not a free count");
}

export function assertSampleResetConfirm(value: string) {
  if (String(value || "").trim().toLowerCase() !== PLATFORM_SAMPLE_CONFIRM) {
    throw new Error("Type iprojectx to confirm. Customer organisations cannot be reset here.");
  }
}

export function projectsForPack(pack: PlatformSamplePack) {
  return PLATFORM_SEED_PROJECTS.slice(0, pack);
}

export function fyLabelForDate(iso: string): string {
  const [year, month] = iso.slice(0, 10).split("-").map(Number);
  const endYear = (month ?? 1) >= 7 ? (year ?? 2026) + 1 : (year ?? 2026);
  return `FY${String(endYear).slice(2)}`;
}

export function sampleMonths(start: string, end: string): string[] {
  const from = Date.parse(`${start.slice(0, 7)}-01T00:00:00Z`);
  const to = Date.parse(`${end.slice(0, 7)}-01T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    return [`${start.slice(0, 7)}-01`];
  }
  const keys: string[] = [];
  const cursor = new Date(from);
  while (cursor.getTime() <= to && keys.length < 24) {
    keys.push(cursor.toISOString().slice(0, 7) + "-01");
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  if (keys.length <= 4) return keys;
  const picks = [0, Math.floor((keys.length - 1) / 3), Math.floor(((keys.length - 1) * 2) / 3), keys.length - 1];
  return [...new Set(picks.map((i) => keys[i]))];
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function gatesForMethod(method: string): readonly string[] {
  if (method === "Agile") return AGILE_GATES;
  return PLATFORM_WATERFALL_GATES;
}

function gateStatus(gates: readonly string[], phase: string, projectStatus: string, index: number): string {
  if (projectStatus === "Completed") return "Approved";
  if (projectStatus === "Not Started") return "Pending";
  const at = Math.max(0, gates.indexOf(phase));
  if (index < at) return "Approved";
  if (index === at) return "In Review";
  return "Pending";
}

function alignmentFor(program: string): string {
  return ALIGNMENT_FOR_PROGRAM[program] ?? "Enterprise Services";
}

function altStreamName(program: string): string {
  return ALT_STREAM_FOR_PROGRAM[program] ?? "Integrations";
}

function missingRelation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /could not find the table|relation .* does not exist|PGRST205|42P01/i.test(msg);
}

async function requirePlatformOrg(db: SampleResetDb): Promise<PlatformOrgRef> {
  const org = await db.resolvePlatformOrg();
  if (!org || !isPlatformOrgRow(org)) {
    throw new Error(`organisation slug=${PLATFORM_ORG_SLUG} not found`);
  }
  if (!org.id) throw new Error("refused operation without platform org id");
  return org;
}

export async function previewPlatformSample(db: SampleResetDb): Promise<SamplePreview> {
  const org = await requirePlatformOrg(db);
  const counts: Record<string, number> = {};
  for (const table of SAMPLE_PREVIEW_TABLES) {
    try {
      counts[table] = await db.countEqOrgId(table, org.id);
    } catch (error) {
      if (missingRelation(error)) counts[table] = 0;
      else throw error;
    }
  }
  return { org, counts };
}

export async function resetPlatformSample(
  db: SampleResetDb,
  input: { pack: unknown; confirm: string },
): Promise<SampleResetReport> {
  assertSampleResetConfirm(input.confirm);
  const pack = parseSamplePack(input.pack);
  const org = await requirePlatformOrg(db);
  const catalog = projectsForPack(pack);
  const wiped: string[] = [];
  const skipped: string[] = [];

  await db.deleteScenarioProjectsForOrg(org.id);
  await db.clearGovernanceParents(org.id);

  for (const table of SAMPLE_WIPE_TABLES) {
    if (table === "scenario_projects") {
      wiped.push(table);
      continue;
    }
    try {
      await db.deleteEqOrgId(table, org.id);
      wiped.push(table);
    } catch (error) {
      if (missingRelation(error)) skipped.push(table);
      else throw error;
    }
  }

  try {
    await db.ensureDeliveryMethods(org.id);
  } catch {
    skipped.push("ensure_org_delivery_methods");
  }
  const methods = await db.findDeliveryMethods(org.id).catch(() => []);
  const methodId = (name: string) => methods.find((m) => m.name === name)?.id ?? null;
  const user = await db.findPlatformUser(org.id).catch(() => null);

  const created: Record<string, number> = {};
  const track = (table: string, n: number) => {
    created[table] = (created[table] ?? 0) + n;
  };

  const insert = async (table: string, rows: Array<Record<string, unknown>>) => {
    if (!rows.length) return [] as Array<{ id: string }>;
    for (const row of rows) {
      if (!row.org_id) throw new Error(`${table}: refused insert without org_id`);
      assertPlatformOrgId(String(row.org_id), org.id, table);
    }
    try {
      const inserted = await db.insert(table, rows);
      track(table, inserted.length || rows.length);
      return inserted;
    } catch (error) {
      if (missingRelation(error)) {
        skipped.push(table);
        return [];
      }
      throw error;
    }
  };

  const projectRows = catalog.map((p) => {
    const meta = SAMPLE_META[p.code];
    const roi = p.budget > 0 ? Math.round(((p.benT - p.budget) / p.budget) * 1000) / 10 : 0;
    return {
      org_id: org.id,
      project_code: p.code,
      name: p.name,
      program: p.program,
      portfolio: alignmentFor(p.program),
      status: p.status,
      rag: p.rag,
      priority: meta?.priority ?? "P2 - High",
      delivery_method: p.method,
      delivery_method_id: methodId(p.method),
      current_phase: meta?.phase ?? null,
      sponsor: meta?.sponsor ?? "CDO",
      budget: p.budget,
      capex_approved: p.capexA,
      capex_incurred: p.capexI,
      opex_approved: p.opexA,
      opex_incurred: p.opexI,
      forecast_at_completion: p.fac,
      benefits_target: p.benT,
      benefits_realised: p.benR,
      baseline_budget: p.budget,
      baseline_capex: p.capexA,
      baseline_opex: p.opexA,
      baseline_benefits: p.benT,
      roi_percent: roi,
      start_date: p.start,
      end_date: p.end,
      planned_start_date: p.start,
      planned_end_date: p.end,
      target_go_live: p.end,
      streams_enabled: true,
      description: `${p.name} — platform sample covering ${p.method} delivery.`,
    };
  });
  const projects = await insert("projects", projectRows);

  const existingStreams = await db.selectEqOrgId("project_streams", "id,org_id,project_id,name,is_default", org.id);
  const streamsByProject = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of existingStreams) {
    if (row.org_id) assertPlatformOrgId(String(row.org_id), org.id, "project_streams");
    const projectId = String(row.project_id || "");
    const id = String(row.id || "");
    if (!projectId || !id) continue;
    const list = streamsByProject.get(projectId) ?? [];
    list.push({ id, name: String(row.name || "Core") });
    streamsByProject.set(projectId, list);
  }

  const altRows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < catalog.length; i += 1) {
    const p = catalog[i];
    const projectId = projects[i]?.id;
    if (!projectId) continue;
    const coreShare = 0.7;
    const existing = streamsByProject.get(projectId) ?? [];
    const core = existing.find((s) => s.name === "Core") ?? existing[0];
    if (core) {
      await db.updateByIdOrg("project_streams", core.id, org.id, {
        budget: Math.round(p.budget * coreShare),
        capex_approved: Math.round(p.capexA * coreShare),
        capex_incurred: Math.round(p.capexI * coreShare),
        opex_approved: Math.round(p.opexA * coreShare),
        opex_incurred: Math.round(p.opexI * coreShare),
        forecast_at_completion: Math.round(p.fac * coreShare),
        planned_start_date: p.start,
        planned_end_date: p.end,
        status: p.status,
        rag: p.rag,
        owner: SAMPLE_META[p.code]?.sponsor ?? "CDO",
      });
    } else {
      altRows.push({
        org_id: org.id,
        project_id: projectId,
        name: "Core",
        code: `${p.code}-CORE`,
        is_default: true,
        sort_order: 1,
        status: p.status,
        rag: p.rag,
        budget: Math.round(p.budget * coreShare),
        capex_approved: Math.round(p.capexA * coreShare),
        capex_incurred: Math.round(p.capexI * coreShare),
        opex_approved: Math.round(p.opexA * coreShare),
        opex_incurred: Math.round(p.opexI * coreShare),
        forecast_at_completion: Math.round(p.fac * coreShare),
        planned_start_date: p.start,
        planned_end_date: p.end,
        owner: SAMPLE_META[p.code]?.sponsor ?? "CDO",
      });
    }
    if (!existing.some((s) => s.name === altStreamName(p.program))) {
      altRows.push({
        org_id: org.id,
        project_id: projectId,
        name: altStreamName(p.program),
        code: `${p.code}-ALT`,
        is_default: false,
        sort_order: 2,
        status: p.status === "Completed" ? "Completed" : "In Progress",
        rag: p.rag === "Red" ? "Amber" : p.rag,
        budget: p.budget - Math.round(p.budget * coreShare),
        capex_approved: p.capexA - Math.round(p.capexA * coreShare),
        capex_incurred: p.capexI - Math.round(p.capexI * coreShare),
        opex_approved: p.opexA - Math.round(p.opexA * coreShare),
        opex_incurred: p.opexI - Math.round(p.opexI * coreShare),
        forecast_at_completion: p.fac - Math.round(p.fac * coreShare),
        planned_start_date: addDays(p.start, 14),
        planned_end_date: p.end,
        owner: SAMPLE_RESOURCES[1].name,
      });
    }
  }
  const addedStreams = await insert("project_streams", altRows);
  altRows.forEach((row, i) => {
    const id = addedStreams[i]?.id;
    if (!id) return;
    const list = streamsByProject.get(String(row.project_id)) ?? [];
    list.push({ id, name: String(row.name) });
    streamsByProject.set(String(row.project_id), list);
  });

  const gateRows: Array<Record<string, unknown>> = [];
  catalog.forEach((p, i) => {
    const projectId = projects[i]?.id;
    if (!projectId) return;
    const gates = gatesForMethod(p.method);
    const phase = SAMPLE_META[p.code]?.phase ?? gates[0];
    const projectStreams = streamsByProject.get(projectId) ?? [];
    for (const stream of projectStreams) {
      gates.forEach((gate, gi) => {
        const planned = addDays(p.start, Math.round((gi / Math.max(1, gates.length - 1)) * 360));
        const status = gateStatus(gates, phase, p.status, gi);
        gateRows.push({
          org_id: org.id,
          project_id: projectId,
          stream_id: stream.id,
          gate_name: gate,
          planned_date: planned,
          actual_date: status === "Approved" ? addDays(planned, 2) : null,
          status,
          approver: SAMPLE_META[p.code]?.sponsor ?? "CDO",
        });
      });
    }
  });
  await insert("stage_gates", gateRows);

  const milestoneRows: Array<Record<string, unknown>> = [];
  catalog.forEach((p, i) => {
    const projectId = projects[i]?.id;
    if (!projectId) return;
    const core = (streamsByProject.get(projectId) ?? []).find((s) => s.name === "Core");
    milestoneRows.push({
      org_id: org.id,
      project_id: projectId,
      stream_id: core?.id ?? null,
      name: `${p.code} go-live`,
      planned_date: p.end,
      status: p.status === "Completed" ? "Complete" : "Planned",
      owner: SAMPLE_META[p.code]?.sponsor ?? "CDO",
    });
  });
  await insert("milestones", milestoneRows);

  const fyRows: Array<Record<string, unknown>> = [];
  const monthRows: Array<Record<string, unknown>> = [];
  catalog.forEach((p, i) => {
    const projectId = projects[i]?.id;
    if (!projectId) return;
    const fys = [...new Set([fyLabelForDate(p.start), fyLabelForDate(p.end)])];
    const projectStreams = streamsByProject.get(projectId) ?? [];
    for (const stream of projectStreams) {
      const share = stream.name === "Core" ? 0.7 : 0.3;
      fys.forEach((fy) => {
        const slice = 1 / fys.length;
        const budget = Math.round(p.budget * share * slice);
        fyRows.push({
          org_id: org.id,
          project_id: projectId,
          stream_id: stream.id,
          fy,
          budget,
          capex: Math.round(p.capexA * share * slice),
          opex: Math.round(p.opexA * share * slice),
          forecast: Math.round(p.fac * share * slice),
          benefits: Math.round(p.benT * share * slice),
        });
      });
      const months = sampleMonths(p.start, p.end);
      months.forEach((period, mi) => {
        const past = period < "2026-08-01";
        const slice = 1 / months.length;
        monthRows.push({
          org_id: org.id,
          project_id: projectId,
          stream_id: stream.id,
          period_month: period,
          capex_planned: Math.round(p.capexA * share * slice),
          opex_planned: Math.round(p.opexA * share * slice),
          capex_forecast: Math.round(p.capexA * share * slice * 1.05),
          opex_forecast: Math.round(p.opexA * share * slice * 1.05),
          capex_actual: past ? Math.round(p.capexI * share * slice) : 0,
          opex_actual: past ? Math.round(p.opexI * share * slice) : 0,
          benefits_planned: Math.round(p.benT * share * slice),
          benefits_actual: past ? Math.round(p.benR * share * slice) : 0,
        });
      });
    }
  });
  await insert("fy_allocations", fyRows);
  await insert("financials_monthly", monthRows);

  const benefitRows = catalog.map((p, i) => ({
    org_id: org.id,
    project_id: projects[i]?.id,
    title: `${p.name} benefit`,
    benefit_type: "Financial",
    target_value: p.benT,
    realised_value: p.benR,
    status: p.benR > 0 ? "In progress" : "Planned",
    owner: SAMPLE_RESOURCES[7].name,
    realisation_date: p.end,
  })).filter((row) => row.project_id);
  await insert("benefits", benefitRows);

  const raid = catalog.flatMap((p, i) => {
    const projectId = projects[i]?.id;
    if (!projectId) return [];
    const core = (streamsByProject.get(projectId) ?? [])[0];
    return [
      {
        table: "risks",
        row: {
          org_id: org.id,
          project_id: projectId,
          stream_id: core?.id ?? null,
          title: `${p.code} delivery risk`,
          description: "Sample risk so RAID and health have a live row.",
          status: p.rag === "Red" ? "Open" : "Mitigating",
          owner: SAMPLE_RESOURCES[6].name,
          probability: p.rag === "Red" ? 4 : 3,
          impact: p.rag === "Amber" || p.rag === "Red" ? 4 : 3,
          severity: p.rag === "Red" ? 16 : 9,
          category: "Delivery",
          mitigation: "Steering watch and weekly RAID review",
          raid_code: "RSK-001",
        },
      },
      {
        table: "issues",
        row: {
          org_id: org.id,
          project_id: projectId,
          stream_id: core?.id ?? null,
          title: `${p.code} open issue`,
          description: "Sample issue for the register.",
          status: p.status === "Completed" ? "Closed" : "Open",
          owner: SAMPLE_RESOURCES[2].name,
          priority: "High",
          raid_code: "ISS-001",
        },
      },
      {
        table: "actions",
        row: {
          org_id: org.id,
          project_id: projectId,
          stream_id: core?.id ?? null,
          title: `${p.code} follow-up action`,
          description: "Sample action for the register.",
          status: p.status === "Completed" ? "Done" : "Open",
          owner: SAMPLE_RESOURCES[0].name,
          priority: "Medium",
          due_date: addDays(p.end, -30),
          raid_code: "ACT-001",
        },
      },
      {
        table: "decisions",
        row: {
          org_id: org.id,
          project_id: projectId,
          stream_id: core?.id ?? null,
          title: `${p.code} funding decision`,
          description: "Sample IC / steering decision.",
          status: "Closed",
          outcome: "Approved",
          forum: i % 2 === 0 ? "Investment Committee" : "Steering Committee",
          owner: SAMPLE_META[p.code]?.sponsor ?? "CDO",
          sponsor: SAMPLE_META[p.code]?.sponsor ?? "CDO",
          program: p.program,
          raid_code: "DEC-001",
        },
      },
    ];
  });
  for (const table of ["risks", "issues", "actions", "decisions"] as const) {
    await insert(table, raid.filter((r) => r.table === table).map((r) => r.row));
  }

  const stakeholderRows = catalog.map((p, i) => ({
    org_id: org.id,
    project_id: projects[i]?.id,
    name: SAMPLE_META[p.code]?.sponsor ?? "CDO",
    role: "Sponsor",
    is_sponsor: true,
    influence: "High",
    interest: "High",
  })).filter((row) => row.project_id);
  await insert("stakeholders", stakeholderRows);

  const statusRows = catalog.map((p, i) => ({
    org_id: org.id,
    project_id: projects[i]?.id,
    update_date: "2026-08-01",
    overall_rag: p.rag,
    cost_rag: p.fac > p.budget ? "Amber" : "Green",
    schedule_rag: p.rag,
    scope_rag: "Green",
    reporter: SAMPLE_RESOURCES[2].name,
    progress_summary: `Sample status for ${p.code}.`,
    achievements: "Seeded so Executive Cockpit and steering have a latest update.",
    next_steps: "Run commercial E2E after reset.",
  })).filter((row) => row.project_id);
  await insert("status_updates", statusRows);

  const documentRows = catalog.flatMap((p, i) => {
    const projectId = projects[i]?.id;
    if (!projectId) return [];
    return [
      {
        org_id: org.id,
        project_id: projectId,
        name: "Business Case",
        doc_type: "Business Case",
        url: `https://example.com/docs/${p.code}/business-case`,
        version: "1.0",
        owner: SAMPLE_META[p.code]?.sponsor ?? "CDO",
        uploaded_date: addDays(p.start, 10),
      },
    ];
  });
  await insert("documents", documentRows);

  const lessonRows = catalog.map((p, i) => ({
    org_id: org.id,
    project_id: projects[i]?.id,
    category: "Delivery",
    what_happened: "Dual streams made RAID and forecast attribution visible.",
    root_cause: "Single-lane plans hid secondary-stream risk",
    recommendation: "Keep Core plus one extra stream on every sample project",
    captured_by: SAMPLE_RESOURCES[2].name,
    captured_date: "2026-08-01",
  })).filter((row) => row.project_id);
  await insert("lessons_learned", lessonRows);

  const crRows = catalog.map((p, i) => ({
    org_id: org.id,
    project_id: projects[i]?.id,
    cr_number: `${p.code}-CR01`,
    title: `Add ${altStreamName(p.program)} scope`,
    description: "Sample change request so the CR register is not empty.",
    change_type: "Scope",
    impact_scope: "Secondary stream",
    impact_schedule_days: 14,
    impact_cost: Math.round(p.budget * 0.03),
    status: i % 3 === 0 ? "Approved" : "Submitted",
    raised_by: SAMPLE_RESOURCES[1].name,
    raised_date: "2026-07-20",
    approver: SAMPLE_META[p.code]?.sponsor ?? "CDO",
  })).filter((row) => row.project_id);
  await insert("change_requests", crRows);

  const sprintRows = catalog.flatMap((p, i) => {
    if (p.method !== "Agile" && p.method !== "Hybrid") return [];
    const projectId = projects[i]?.id;
    if (!projectId) return [];
    return [1, 2].map((n) => ({
      org_id: org.id,
      project_id: projectId,
      sprint_number: n,
      name: `Sprint ${n}`,
      start_date: addDays("2026-08-03", (n - 2) * 14),
      end_date: addDays("2026-08-03", (n - 2) * 14 + 13),
      planned_points: 40 + n * 5,
      completed_points: n === 1 ? 38 : 12,
      committed_stories: 12,
      completed_stories: n === 1 ? 10 : 3,
      status: n === 1 ? "Closed" : "Active",
    }));
  });
  await insert("sprints", sprintRows);

  if (projects.length > 1) {
    await insert("dependencies", [
      {
        org_id: org.id,
        project_id: projects[0].id,
        depends_on_project_id: projects[1].id,
        title: "API contract from PRJ-002",
        dep_type: "Finish-to-Start",
        status: "Open",
        owner: SAMPLE_RESOURCES[1].name,
        needed_by: catalog[0]?.end ?? "2026-09-30",
      },
    ]);
  }

  const workRows = catalog.flatMap((p, i) => {
    const projectId = projects[i]?.id;
    if (!projectId) return [];
    const core = (streamsByProject.get(projectId) ?? []).find((s) => s.name === "Core");
    const alt = (streamsByProject.get(projectId) ?? []).find((s) => s.name !== "Core");
    return [
      {
        org_id: org.id,
        project_id: projectId,
        stream_id: core?.id ?? null,
        wbs_code: "1.0",
        title: "Core discovery pack",
        status: "Done",
        priority: "High",
        owner: SAMPLE_RESOURCES[0].name,
        percent_complete: 100,
        planned_start: p.start,
        planned_end: addDays(p.start, 30),
        estimate_hours: 80,
        actual_hours: 76,
        sort_order: 1,
      },
      {
        org_id: org.id,
        project_id: projectId,
        stream_id: alt?.id ?? core?.id ?? null,
        wbs_code: "2.0",
        title: `${altStreamName(p.program)} build backlog`,
        status: p.status === "Completed" ? "Done" : "In Progress",
        priority: "High",
        owner: SAMPLE_RESOURCES[1].name,
        percent_complete: p.status === "Completed" ? 100 : 45,
        planned_start: addDays(p.start, 21),
        planned_end: addDays(p.end, -60),
        estimate_hours: 200,
        actual_hours: 90,
        sort_order: 2,
      },
    ];
  });
  const workItems = await insert("work_items", workRows);

  const resourceRows = SAMPLE_RESOURCES.map((r, i) => ({
    org_id: org.id,
    name: r.name,
    email: `${r.name.toLowerCase().replace(/\s+/g, ".")}@iprojectx.com`,
    role: r.role,
    skills: r.skills,
    capacity_hours_week: 40,
    hours_per_day: 8,
    cost_rate: r.rate,
    location: "Hybrid",
    status: "Active",
    user_id: i === 0 ? user?.id ?? null : null,
  }));
  const resources = await insert("resources", resourceRows);

  if (resources[0]?.id && workItems[0]?.id) {
    await insert("work_item_assignees", [
      { org_id: org.id, work_item_id: workItems[0].id, resource_id: resources[0].id, user_id: user?.id ?? null },
    ]);
  }

  const allocRows: Array<Record<string, unknown>> = [];
  const allocProjects = projects.slice(0, Math.min(4, projects.length));
  allocProjects.forEach((proj, pi) => {
    const p = catalog[pi];
    const months = sampleMonths(p.start, p.end).slice(0, 2);
    resources.slice(0, 2).forEach((res, ri) => {
      months.forEach((period) => {
        allocRows.push({
          org_id: org.id,
          project_id: proj.id,
          resource_id: res.id,
          period_month: period,
          allocated_hours: 40 - ri * 8,
          allocation_percent: 50 - ri * 10,
          role_on_project: SAMPLE_RESOURCES[ri].role,
        });
      });
    });
  });
  await insert("resource_allocations", allocRows);

  const demandRows = [
    { stage: DEMAND_STAGES[0], name: "Branch callback bot", cost: 180000, benefit: 420000 },
    { stage: DEMAND_STAGES[2], name: "Claims evidence vault", cost: 620000, benefit: 1100000 },
    { stage: DEMAND_STAGES[3], name: "Vendor risk cockpit", cost: 240000, benefit: 400000 },
    { stage: DEMAND_STAGES[4], name: "Retail AR kiosk", cost: 900000, benefit: 200000 },
  ].map((d) => ({
    org_id: org.id,
    idea_name: d.name,
    status: d.stage,
    estimated_cost: d.cost,
    estimated_benefit: d.benefit,
    estimated_roi: Math.round(((d.benefit - d.cost) / d.cost) * 1000) / 10,
    sponsor: "CDO",
    strategic_alignment: 4,
    complexity: 3,
    submitted_date: "2026-06-01",
    description: "Platform sample demand so the funnel and convert path have rows.",
  }));
  await insert("demand_pipeline", demandRows);

  const alignments = [...new Set(catalog.map((p) => alignmentFor(p.program)))];
  const envelopeRows: Array<Record<string, unknown>> = alignments.map((name) => ({
    org_id: org.id,
    layer: "alignment",
    parent_name: "",
    name,
    envelope: catalog.filter((p) => alignmentFor(p.program) === name).reduce((s, p) => s + p.budget, 0) * 1.15,
    notes: "Sample Strategic Alignment pot",
  }));
  const programs = [...new Set(catalog.map((p) => `${alignmentFor(p.program)}::${p.program}`))];
  for (const key of programs) {
    const [parent, name] = key.split("::");
    envelopeRows.push({
      org_id: org.id,
      layer: "program",
      parent_name: parent,
      name,
      envelope: catalog.filter((p) => p.program === name && alignmentFor(p.program) === parent).reduce((s, p) => s + p.budget, 0) * 1.08,
      notes: "Sample program pot",
    });
  }
  await insert("hierarchy_envelopes", envelopeRows);

  await insert("portfolio_scenarios", [
    {
      org_id: org.id,
      name: "FY27 constrained",
      description: "Sample scenario so What-if is not empty.",
      budget_cap: catalog.reduce((s, p) => s + p.budget, 0) * 0.85,
    },
  ]);

  const ic = await insert("governance_channels", [
    {
      org_id: org.id,
      name: "Investment Committee",
      cadence: "Monthly",
      audience: "Executives",
      purpose: "Fund and stop sample investments",
      chair: "CFO",
      scope_level: "strategic_alignment",
      status: "Active",
      last_meeting: "2026-08-03",
      next_meeting: "2026-09-07",
    },
  ]);
  if (projects[0]?.id) {
    await insert("governance_channels", [
      {
        org_id: org.id,
        name: "PRJ-001 Steering",
        cadence: "Fortnightly",
        audience: "Project",
        purpose: "Steer the first sample project",
        chair: SAMPLE_META["PRJ-001"]?.sponsor ?? "CDO",
        scope_level: "project",
        project_id: projects[0].id,
        parent_channel_id: ic[0]?.id ?? null,
        status: "Active",
        last_meeting: "2026-08-10",
        next_meeting: "2026-08-24",
      },
    ]);
  }

  if (user && resources[0]?.id && projects[0]?.id && workItems[0]?.id) {
    const weeks = [0, 7, 14, 21].map((d) => weekStartMonday(new Date(Date.UTC(2026, 7, 3 + d))));
    const statuses = ["draft", "pending_pm", "approved", "rejected"] as const;
    for (let i = 0; i < weeks.length; i += 1) {
      const sheets = await insert("timesheets", [
        {
          org_id: org.id,
          user_id: user.id,
          resource_id: resources[0].id,
          week_start: weeks[i],
          status: statuses[i],
          notes: "Platform sample timesheet",
        },
      ]);
      if (sheets[0]?.id) {
        await insert("timesheet_entries", [
          {
            org_id: org.id,
            timesheet_id: sheets[0].id,
            project_id: projects[0].id,
            work_item_id: workItems[0].id,
            billable: true,
            hours_mon: 6,
            hours_tue: 6,
            hours_wed: 5,
            hours_thu: 6,
            hours_fri: 5,
            hours_sat: 0,
            hours_sun: 0,
            hourly_rate: SAMPLE_RESOURCES[0].rate,
          },
        ]);
      }
    }
  }

  return { pack, org, wiped, skipped, created };
}
