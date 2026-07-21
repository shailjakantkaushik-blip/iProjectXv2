/**
 * Generates supabase/seed/wipe_and_seed_16_projects.sql
 * Run: node scripts/generate-seed-16.mjs
 */
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const GATES = [
  "Discovery",
  "Business Case / Seed Funding",
  "Design",
  "Business Case / Full Funding",
  "Build",
  "Testing",
  "Deployment",
  "Handover",
  "Benefit Realisation",
];

const PROJECTS = [
  { code: "PRJ-001", name: "Customer Portal Redesign", program: "Digital Transformation", phase: "Build", status: "In Progress", rag: "Green", priority: "P1 - Critical", method: "Hybrid", budget: 3200000, capexA: 2500000, capexI: 1100000, opexA: 700000, opexI: 280000, fac: 3300000, benT: 5200000, benR: 900000, roi: 62.5, start: "2025-04-01", end: "2026-09-30", live: "2026-08-15", sponsor: "CDO" },
  { code: "PRJ-002", name: "Core Banking API Platform", program: "Platform Modernisation", phase: "Testing", status: "In Progress", rag: "Amber", priority: "P1 - Critical", method: "Agile", budget: 5800000, capexA: 4800000, capexI: 3100000, opexA: 1000000, opexI: 620000, fac: 6100000, benT: 9500000, benR: 1200000, roi: 63.8, start: "2024-10-01", end: "2026-06-30", live: "2026-05-01", sponsor: "CTO" },
  { code: "PRJ-003", name: "Data Lakehouse Foundation", program: "Data & Analytics", phase: "Design", status: "In Progress", rag: "Green", priority: "P2 - High", method: "Waterfall", budget: 4100000, capexA: 3500000, capexI: 900000, opexA: 600000, opexI: 150000, fac: 4200000, benT: 7000000, benR: 200000, roi: 70.7, start: "2025-07-01", end: "2027-03-31", live: "2027-01-15", sponsor: "CDO" },
  { code: "PRJ-004", name: "Cyber Resilience Uplift", program: "Risk & Compliance", phase: "Business Case / Full Funding", status: "In Progress", rag: "Amber", priority: "P1 - Critical", method: "Hybrid", budget: 2700000, capexA: 2000000, capexI: 400000, opexA: 700000, opexI: 180000, fac: 2850000, benT: 3500000, benR: 0, roi: 29.6, start: "2025-11-01", end: "2026-12-31", live: "2026-11-30", sponsor: "CISO" },
  { code: "PRJ-005", name: "Contact Centre Omnichannel", program: "Customer Experience", phase: "Deployment", status: "In Progress", rag: "Green", priority: "P2 - High", method: "Agile", budget: 1900000, capexA: 1400000, capexI: 1250000, opexA: 500000, opexI: 410000, fac: 1950000, benT: 3100000, benR: 1800000, roi: 63.2, start: "2024-08-01", end: "2026-04-30", live: "2026-03-15", sponsor: "COO" },
  { code: "PRJ-006", name: "Finance Close Automation", program: "Finance Transformation", phase: "Handover", status: "In Progress", rag: "Green", priority: "P2 - High", method: "Waterfall", budget: 1500000, capexA: 1100000, capexI: 1050000, opexA: 400000, opexI: 360000, fac: 1520000, benT: 2400000, benR: 1600000, roi: 60.0, start: "2024-05-01", end: "2026-02-28", live: "2026-01-20", sponsor: "CFO" },
  { code: "PRJ-007", name: "HR Self-Service Suite", program: "People Systems", phase: "Build", status: "In Progress", rag: "Amber", priority: "P3 - Medium", method: "Hybrid", budget: 1200000, capexA: 900000, capexI: 450000, opexA: 300000, opexI: 120000, fac: 1280000, benT: 1800000, benR: 150000, roi: 50.0, start: "2025-06-01", end: "2026-08-31", live: "2026-07-15", sponsor: "CHRO" },
  { code: "PRJ-008", name: "Supplier Portal 2.0", program: "Procurement", phase: "Discovery", status: "In Progress", rag: "Green", priority: "P3 - Medium", method: "Agile", budget: 980000, capexA: 750000, capexI: 80000, opexA: 230000, opexI: 20000, fac: 1000000, benT: 1600000, benR: 0, roi: 63.3, start: "2026-01-15", end: "2026-12-15", live: "2026-11-01", sponsor: "CPO" },
  { code: "PRJ-009", name: "Branch Network WiFi Refresh", program: "Infrastructure", phase: "Testing", status: "In Progress", rag: "Red", priority: "P2 - High", method: "Waterfall", budget: 2200000, capexA: 2000000, capexI: 1600000, opexA: 200000, opexI: 150000, fac: 2550000, benT: 1800000, benR: 200000, roi: -18.2, start: "2025-02-01", end: "2026-05-31", live: "2026-04-30", sponsor: "CTO" },
  { code: "PRJ-010", name: "Regulatory Reporting Engine", program: "Risk & Compliance", phase: "Build", status: "In Progress", rag: "Amber", priority: "P1 - Critical", method: "Hybrid", budget: 3600000, capexA: 2900000, capexI: 1400000, opexA: 700000, opexI: 300000, fac: 3750000, benT: 4200000, benR: 400000, roi: 16.7, start: "2025-03-01", end: "2026-11-30", live: "2026-10-15", sponsor: "CRO" },
  { code: "PRJ-011", name: "Mobile App Payments", program: "Digital Transformation", phase: "Business Case / Seed Funding", status: "In Progress", rag: "Green", priority: "P2 - High", method: "Agile", budget: 2800000, capexA: 2200000, capexI: 250000, opexA: 600000, opexI: 80000, fac: 2900000, benT: 6000000, benR: 0, roi: 114.3, start: "2025-12-01", end: "2027-06-30", live: "2027-04-01", sponsor: "CDO" },
  { code: "PRJ-012", name: "Cloud Cost Optimisation", program: "Platform Modernisation", phase: "Benefit Realisation", status: "Completed", rag: "Green", priority: "P3 - Medium", method: "Agile", budget: 650000, capexA: 200000, capexI: 195000, opexA: 450000, opexI: 440000, fac: 640000, benT: 1500000, benR: 1450000, roi: 130.8, start: "2024-04-01", end: "2025-12-31", live: "2025-11-01", sponsor: "CTO" },
  { code: "PRJ-013", name: "Claims Straight-Through", program: "Operations Excellence", phase: "Design", status: "In Progress", rag: "Green", priority: "P2 - High", method: "Hybrid", budget: 3400000, capexA: 2700000, capexI: 700000, opexA: 700000, opexI: 160000, fac: 3500000, benT: 5500000, benR: 100000, roi: 61.8, start: "2025-08-01", end: "2027-02-28", live: "2026-12-15", sponsor: "COO" },
  { code: "PRJ-014", name: "ESG Data Platform", program: "Data & Analytics", phase: "Discovery", status: "Not Started", rag: "Green", priority: "P4 - Low", method: "Waterfall", budget: 1100000, capexA: 850000, capexI: 0, opexA: 250000, opexI: 0, fac: 1100000, benT: 900000, benR: 0, roi: -18.2, start: "2026-04-01", end: "2027-03-31", live: "2027-02-28", sponsor: "CSO" },
  { code: "PRJ-015", name: "Legacy Policy Admin Decommission", program: "Platform Modernisation", phase: "Deployment", status: "In Progress", rag: "Amber", priority: "P2 - High", method: "Waterfall", budget: 4500000, capexA: 3800000, capexI: 2900000, opexA: 700000, opexI: 500000, fac: 4800000, benT: 6200000, benR: 2100000, roi: 37.8, start: "2024-06-01", end: "2026-07-31", live: "2026-06-15", sponsor: "CTO" },
  { code: "PRJ-016", name: "AI Document Intake", program: "Operations Excellence", phase: "Build", status: "In Progress", rag: "Green", priority: "P2 - High", method: "Agile", budget: 1750000, capexA: 1300000, capexI: 600000, opexA: 450000, opexI: 180000, fac: 1800000, benT: 3200000, benR: 450000, roi: 82.9, start: "2025-09-01", end: "2026-10-31", live: "2026-09-15", sponsor: "COO" },
];

const RESOURCES = [
  { name: "Alex Morgan", role: "Senior BA", skills: "Analysis,Agile,Jira", hours: 40, rate: 95 },
  { name: "Jordan Lee", role: "Tech Lead", skills: "Architecture,Cloud,API", hours: 40, rate: 140 },
  { name: "Sam Rivera", role: "Delivery Manager", skills: "PMO,RAID,Stakeholder", hours: 40, rate: 120 },
  { name: "Taylor Kim", role: "Data Engineer", skills: "SQL,ETL,Python", hours: 40, rate: 125 },
  { name: "Casey Brooks", role: "QA Lead", skills: "Testing,Automation", hours: 40, rate: 100 },
  { name: "Riley Chen", role: "UX Designer", skills: "Design,Research", hours: 40, rate: 105 },
  { name: "Morgan Patel", role: "Security Analyst", skills: "Security,Risk", hours: 40, rate: 115 },
  { name: "Avery Nguyen", role: "Finance Analyst", skills: "Finance,Benefits", hours: 40, rate: 90 },
];

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const arrText = (xs) => `ARRAY[${xs.map(q).join(", ")}]`;
const arrNum = (xs) => `ARRAY[${xs.join(", ")}]`;
const arrDate = (xs) => `ARRAY[${xs.map((d) => `${q(d)}::date`).join(", ")}]`;
const arrStatus = (xs) => `ARRAY[${xs.map((s) => `${q(s)}::public.project_status`).join(", ")}]`;
const arrRag = (xs) => `ARRAY[${xs.map((s) => `${q(s)}::public.project_rag`).join(", ")}]`;
const arrMethod = (xs) => `ARRAY[${xs.map((s) => `${q(s)}::public.delivery_method`).join(", ")}]`;

const resourceInserts = RESOURCES.map((r) => {
  const email = r.name.toLowerCase().replace(/\s+/g, ".") + "@example.com";
  return `    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, ${q(r.name)}, ${q(email)}, ${q(r.role)}, ${q(r.skills)}, ${r.hours}, ${r.rate}, 'Hybrid', 'Active')
    RETURNING id INTO rid;
    res_ids := array_append(res_ids, rid);`;
}).join("\n");

const gateValues = GATES.map((g, i) => `    (${q(g)}, ${i + 1})`).join(",\n");

const sql = `-- =========================================================================
-- iProjectX — Wipe project data + seed 16 clean sample projects (per org)
-- Paste into Supabase SQL Editor and run once.
--
-- Keeps: organizations, profiles, user_roles, business_units, billing,
--        landing/branding config
-- Ensures: canonical stage_gate_definitions (9 gates)
-- Deletes: projects (+ cascaded children), resources, allocations,
--          demand pipeline, scenarios, monthly/FY/benefits leftovers
--
-- Also applies finance schema patches:
--   fy_allocations.budget / forecast
--   projects.forecast_at_completion
-- =========================================================================

BEGIN;

-- ---------- A) Schema patches (idempotent) ----------
ALTER TABLE public.fy_allocations
  ADD COLUMN IF NOT EXISTS budget NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast NUMERIC(14,2) DEFAULT 0;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS forecast_at_completion NUMERIC(14,2) DEFAULT 0;

-- ---------- B) Wipe operational / project data ----------
DELETE FROM public.resource_allocations;
DELETE FROM public.resources;
DELETE FROM public.demand_pipeline;
DELETE FROM public.financials_monthly;
DELETE FROM public.fy_allocations;
DELETE FROM public.benefits;
DELETE FROM public.status_updates;
DELETE FROM public.documents;
DELETE FROM public.lessons_learned;
DO $wipe$
BEGIN
  DELETE FROM public.scenario_projects;
  DELETE FROM public.portfolio_scenarios;
EXCEPTION WHEN undefined_table THEN NULL;
END
$wipe$;
DO $wipe2$
BEGIN
  DELETE FROM public.work_items;
EXCEPTION WHEN undefined_table THEN NULL;
END
$wipe2$;
DELETE FROM public.projects; -- cascades stage_gates, risks, issues, actions, decisions, etc.

-- ---------- C) Ensure stage gate definitions (canonical 9) ----------
INSERT INTO public.stage_gate_definitions (org_id, gate_name, sort_order, is_active)
SELECT o.id, g.gate_name, g.sort_order, true
FROM public.organizations o
CROSS JOIN (
  VALUES
${gateValues}
) AS g(gate_name, sort_order)
ON CONFLICT (org_id, gate_name) DO UPDATE
SET sort_order = EXCLUDED.sort_order, is_active = true;

-- ---------- D) Seed 16 projects + related data for EVERY organization ----------
DO $$
DECLARE
  r_org RECORD;
  r_bu uuid;
  p_id uuid;
  res_ids uuid[] := ARRAY[]::uuid[];
  rid uuid;
  i int;
  j int;
  codes text[] := ${arrText(PROJECTS.map((p) => p.code))};
  names text[] := ${arrText(PROJECTS.map((p) => p.name))};
  programs text[] := ${arrText(PROJECTS.map((p) => p.program))};
  phases text[] := ${arrText(PROJECTS.map((p) => p.phase))};
  statuses public.project_status[] := ${arrStatus(PROJECTS.map((p) => p.status))};
  rags public.project_rag[] := ${arrRag(PROJECTS.map((p) => p.rag))};
  priorities text[] := ${arrText(PROJECTS.map((p) => p.priority))};
  methods public.delivery_method[] := ${arrMethod(PROJECTS.map((p) => p.method))};
  budgets numeric[] := ${arrNum(PROJECTS.map((p) => p.budget))};
  capex_a numeric[] := ${arrNum(PROJECTS.map((p) => p.capexA))};
  capex_i numeric[] := ${arrNum(PROJECTS.map((p) => p.capexI))};
  opex_a numeric[] := ${arrNum(PROJECTS.map((p) => p.opexA))};
  opex_i numeric[] := ${arrNum(PROJECTS.map((p) => p.opexI))};
  facs numeric[] := ${arrNum(PROJECTS.map((p) => p.fac))};
  ben_t numeric[] := ${arrNum(PROJECTS.map((p) => p.benT))};
  ben_r numeric[] := ${arrNum(PROJECTS.map((p) => p.benR))};
  rois numeric[] := ${arrNum(PROJECTS.map((p) => p.roi))};
  starts date[] := ${arrDate(PROJECTS.map((p) => p.start))};
  ends date[] := ${arrDate(PROJECTS.map((p) => p.end))};
  lives date[] := ${arrDate(PROJECTS.map((p) => p.live))};
  sponsors text[] := ${arrText(PROJECTS.map((p) => p.sponsor))};
  gate_names text[] := ${arrText(GATES)};
  g_status text;
  g_idx int;
  m date;
  b1 numeric;
  b2 numeric;
  fy_a text;
  fy_b text;
  fy_start int;
  split_a numeric;
  split_b numeric;
  cap_split numeric;
  opex_split numeric;
  r1 int;
  r2 int;
BEGIN
  FOR r_org IN SELECT id, COALESCE(fy_start_month, 4) AS fy_start_month FROM public.organizations LOOP
    fy_start := r_org.fy_start_month;
    SELECT id INTO r_bu FROM public.business_units WHERE org_id = r_org.id ORDER BY name LIMIT 1;

    res_ids := ARRAY[]::uuid[];
${resourceInserts}

    FOR i IN 1..16 LOOP
      INSERT INTO public.projects (
        org_id, bu_id, project_code, name, program, sponsor, priority, status, rag,
        current_phase, delivery_method,
        planned_start_date, planned_end_date, actual_start_date, actual_end_date,
        start_date, end_date, target_go_live,
        budget, capex_approved, capex_incurred, opex_approved, opex_incurred,
        forecast_at_completion, benefits_target, benefits_realised, roi_percent,
        description
      ) VALUES (
        r_org.id, r_bu, codes[i], names[i], programs[i], sponsors[i], priorities[i],
        statuses[i], rags[i], phases[i], methods[i],
        starts[i], ends[i],
        CASE WHEN statuses[i] = 'Not Started' THEN NULL ELSE starts[i] + 14 END,
        CASE WHEN statuses[i] = 'Completed' THEN ends[i] ELSE NULL END,
        starts[i], ends[i], lives[i],
        budgets[i], capex_a[i], capex_i[i], opex_a[i], opex_i[i],
        facs[i], ben_t[i], ben_r[i], rois[i],
        'Sample portfolio project for demo and training.'
      ) RETURNING id INTO p_id;

      g_idx := array_position(gate_names, phases[i]);
      IF g_idx IS NULL THEN g_idx := 1; END IF;
      FOR j IN 1..array_length(gate_names, 1) LOOP
        IF j < g_idx THEN g_status := 'Approved';
        ELSIF j = g_idx THEN g_status := 'In Review';
        ELSE g_status := 'Pending';
        END IF;
        INSERT INTO public.stage_gates (
          org_id, project_id, gate_name, planned_date, actual_date, status, approver
        ) VALUES (
          r_org.id, p_id, gate_names[j],
          starts[i] + ((j - 1) * 45),
          CASE WHEN g_status = 'Approved' THEN starts[i] + ((j - 1) * 45) + 3 ELSE NULL END,
          g_status,
          sponsors[i]
        );
      END LOOP;

      b1 := round(ben_t[i] * 0.6, 2);
      b2 := ben_t[i] - b1;
      INSERT INTO public.benefits (org_id, project_id, title, benefit_type, target_value, realised_value, realisation_date, owner, status)
      VALUES
        (r_org.id, p_id, 'Primary value realisation', 'Financial', b1, round(ben_r[i] * 0.6, 2), lives[i], sponsors[i],
         CASE WHEN ben_r[i] > 0 THEN 'In Progress' ELSE 'Planned' END),
        (r_org.id, p_id, 'Secondary / efficiency benefit', 'Efficiency', b2, ben_r[i] - round(ben_r[i] * 0.6, 2), lives[i], sponsors[i],
         CASE WHEN ben_r[i] > 0 THEN 'In Progress' ELSE 'Planned' END);

      fy_a := 'FY' || to_char(
        CASE WHEN EXTRACT(MONTH FROM starts[i]) >= fy_start
          THEN make_date(EXTRACT(YEAR FROM starts[i])::int + 1, 1, 1)
          ELSE make_date(EXTRACT(YEAR FROM starts[i])::int, 1, 1)
        END, 'YY');
      fy_b := 'FY' || to_char(
        CASE WHEN EXTRACT(MONTH FROM ends[i]) >= fy_start
          THEN make_date(EXTRACT(YEAR FROM ends[i])::int + 1, 1, 1)
          ELSE make_date(EXTRACT(YEAR FROM ends[i])::int, 1, 1)
        END, 'YY');
      IF fy_a = fy_b THEN
        split_a := 1; split_b := 0;
      ELSE
        split_a := 0.55; split_b := 0.45;
      END IF;
      cap_split := CASE WHEN (capex_a[i] + opex_a[i]) > 0 THEN capex_a[i] / (capex_a[i] + opex_a[i]) ELSE 1 END;
      opex_split := 1 - cap_split;

      INSERT INTO public.fy_allocations (org_id, project_id, fy, budget, forecast, capex, opex, benefits)
      VALUES (
        r_org.id, p_id, fy_a,
        round(budgets[i] * split_a, 2),
        round(facs[i] * split_a, 2),
        round(budgets[i] * split_a * cap_split, 2),
        round(budgets[i] * split_a * opex_split, 2),
        round(ben_t[i] * split_a, 2)
      );
      IF split_b > 0 THEN
        INSERT INTO public.fy_allocations (org_id, project_id, fy, budget, forecast, capex, opex, benefits)
        VALUES (
          r_org.id, p_id, fy_b,
          round(budgets[i] * split_b, 2),
          round(facs[i] * split_b, 2),
          round(budgets[i] * split_b * cap_split, 2),
          round(budgets[i] * split_b * opex_split, 2),
          round(ben_t[i] * split_b, 2)
        );
      END IF;

      j := 0;
      m := date_trunc('month', starts[i])::date;
      WHILE m <= ends[i] AND j < 8 LOOP
        INSERT INTO public.financials_monthly (
          org_id, project_id, period_month,
          capex_planned, capex_actual, capex_forecast,
          opex_planned, opex_actual, opex_forecast,
          benefits_planned, benefits_actual
        ) VALUES (
          r_org.id, p_id, m,
          round(capex_a[i] / 8.0, 2),
          round((capex_i[i] / 8.0) * CASE WHEN m <= CURRENT_DATE THEN 1 ELSE 0 END, 2),
          round(capex_a[i] / 8.0, 2),
          round(opex_a[i] / 8.0, 2),
          round((opex_i[i] / 8.0) * CASE WHEN m <= CURRENT_DATE THEN 1 ELSE 0 END, 2),
          round(opex_a[i] / 8.0, 2),
          round(ben_t[i] / 12.0, 2),
          round((ben_r[i] / 12.0) * CASE WHEN m <= CURRENT_DATE THEN 1 ELSE 0 END, 2)
        );
        m := (m + INTERVAL '1 month')::date;
        j := j + 1;
      END LOOP;

      -- severity = probability × impact (canonical)
      INSERT INTO public.risks (org_id, project_id, title, description, probability, impact, severity, status, owner, mitigation)
      VALUES
        (r_org.id, p_id, 'Delivery capacity constraint', 'Key skills contention across portfolio', 3, 4, 12, 'Open', 'Sam Rivera', 'Prioritise critical path; surge contractors'),
        (r_org.id, p_id, 'Dependency slippage', 'Upstream platform dependency may slip', 4, 3, 12, 'Open', 'Jordan Lee', 'Weekly dependency forum; contingency design');

      INSERT INTO public.issues (org_id, project_id, title, description, priority, status, owner)
      VALUES (r_org.id, p_id, 'Environment access delay', 'Non-prod access pending', 'Medium', 'Open', 'Jordan Lee');
      INSERT INTO public.actions (org_id, project_id, title, owner, due_date, status, priority)
      VALUES (r_org.id, p_id, 'Confirm FY funding drawdown', sponsors[i], CURRENT_DATE + 14, 'Open', 'Medium');

      FOR j IN 1..3 LOOP
        m := (date_trunc('month', CURRENT_DATE)::date - ((j - 1) * INTERVAL '1 month'))::date;
        r1 := 1 + ((i + j - 1) % array_length(res_ids, 1));
        r2 := 1 + ((i + j + 2) % array_length(res_ids, 1));
        IF r1 = r2 THEN r2 := 1 + (r1 % array_length(res_ids, 1)); END IF;
        INSERT INTO public.resource_allocations (
          org_id, project_id, resource_id, period_month, allocation_percent, allocated_hours, role_on_project
        ) VALUES
          (r_org.id, p_id, res_ids[r1], m, 40 + ((i + j) % 3) * 10, 64, 'Delivery'),
          (r_org.id, p_id, res_ids[r2], m, 30 + (i % 4) * 10, 48, 'Support')
        ON CONFLICT (project_id, resource_id, period_month) DO NOTHING;
      END LOOP;
    END LOOP;

    INSERT INTO public.demand_pipeline (org_id, bu_id, idea_name, description, status, estimated_cost, estimated_benefit, estimated_roi, strategic_alignment, complexity)
    VALUES
      (r_org.id, r_bu, 'Loyalty wallet concept', 'Early demand idea', 'Idea', 800000, 1200000, 45, 3, 2),
      (r_org.id, r_bu, 'Branch digital kiosk', 'Under assessment', 'Assessment', 1200000, 1600000, 30, 4, 3);
  END LOOP;
END $$;

COMMIT;

-- Optional verification:
-- SELECT o.name, count(p.*) FROM organizations o LEFT JOIN projects p ON p.org_id = o.id GROUP BY 1;
-- SELECT probability, impact, severity FROM risks LIMIT 10;
-- SELECT fy, round(sum(budget)) budget, round(sum(forecast)) forecast FROM fy_allocations GROUP BY 1 ORDER BY 1;
`;

const outPath = join(__dirname, "../supabase/seed/wipe_and_seed_16_projects.sql");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, sql);
console.log("Wrote", outPath, "(", sql.length, "chars )");
