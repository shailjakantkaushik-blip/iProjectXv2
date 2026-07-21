-- =========================================================================
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
--
-- Finance model in seed:
--   FY allocations = forward PLAN (budget + forecast)
--   financials_monthly = planned + actual + forecast by month
--   project capex/opex incurred aligned with monthly actuals story
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
    ('Discovery', 1),
    ('Business Case / Seed Funding', 2),
    ('Design', 3),
    ('Business Case / Full Funding', 4),
    ('Build', 5),
    ('Testing', 6),
    ('Deployment', 7),
    ('Handover', 8),
    ('Benefit Realisation', 9)
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
  codes text[] := ARRAY['PRJ-001', 'PRJ-002', 'PRJ-003', 'PRJ-004', 'PRJ-005', 'PRJ-006', 'PRJ-007', 'PRJ-008', 'PRJ-009', 'PRJ-010', 'PRJ-011', 'PRJ-012', 'PRJ-013', 'PRJ-014', 'PRJ-015', 'PRJ-016'];
  names text[] := ARRAY['Customer Portal Redesign', 'Core Banking API Platform', 'Data Lakehouse Foundation', 'Cyber Resilience Uplift', 'Contact Centre Omnichannel', 'Finance Close Automation', 'HR Self-Service Suite', 'Supplier Portal 2.0', 'Branch Network WiFi Refresh', 'Regulatory Reporting Engine', 'Mobile App Payments', 'Cloud Cost Optimisation', 'Claims Straight-Through', 'ESG Data Platform', 'Legacy Policy Admin Decommission', 'AI Document Intake'];
  programs text[] := ARRAY['Digital Transformation', 'Platform Modernisation', 'Data & Analytics', 'Risk & Compliance', 'Customer Experience', 'Finance Transformation', 'People Systems', 'Procurement', 'Infrastructure', 'Risk & Compliance', 'Digital Transformation', 'Platform Modernisation', 'Operations Excellence', 'Data & Analytics', 'Platform Modernisation', 'Operations Excellence'];
  phases text[] := ARRAY['Build', 'Testing', 'Design', 'Business Case / Full Funding', 'Deployment', 'Handover', 'Build', 'Discovery', 'Testing', 'Build', 'Business Case / Seed Funding', 'Benefit Realisation', 'Design', 'Discovery', 'Deployment', 'Build'];
  statuses public.project_status[] := ARRAY['In Progress'::public.project_status, 'In Progress'::public.project_status, 'In Progress'::public.project_status, 'In Progress'::public.project_status, 'In Progress'::public.project_status, 'In Progress'::public.project_status, 'In Progress'::public.project_status, 'In Progress'::public.project_status, 'In Progress'::public.project_status, 'In Progress'::public.project_status, 'In Progress'::public.project_status, 'Completed'::public.project_status, 'In Progress'::public.project_status, 'Not Started'::public.project_status, 'In Progress'::public.project_status, 'In Progress'::public.project_status];
  rags public.project_rag[] := ARRAY['Green'::public.project_rag, 'Amber'::public.project_rag, 'Green'::public.project_rag, 'Amber'::public.project_rag, 'Green'::public.project_rag, 'Green'::public.project_rag, 'Amber'::public.project_rag, 'Green'::public.project_rag, 'Red'::public.project_rag, 'Amber'::public.project_rag, 'Green'::public.project_rag, 'Green'::public.project_rag, 'Green'::public.project_rag, 'Green'::public.project_rag, 'Amber'::public.project_rag, 'Green'::public.project_rag];
  priorities text[] := ARRAY['P1 - Critical', 'P1 - Critical', 'P2 - High', 'P1 - Critical', 'P2 - High', 'P2 - High', 'P3 - Medium', 'P3 - Medium', 'P2 - High', 'P1 - Critical', 'P2 - High', 'P3 - Medium', 'P2 - High', 'P4 - Low', 'P2 - High', 'P2 - High'];
  methods public.delivery_method[] := ARRAY['Hybrid'::public.delivery_method, 'Agile'::public.delivery_method, 'Waterfall'::public.delivery_method, 'Hybrid'::public.delivery_method, 'Agile'::public.delivery_method, 'Waterfall'::public.delivery_method, 'Hybrid'::public.delivery_method, 'Agile'::public.delivery_method, 'Waterfall'::public.delivery_method, 'Hybrid'::public.delivery_method, 'Agile'::public.delivery_method, 'Agile'::public.delivery_method, 'Hybrid'::public.delivery_method, 'Waterfall'::public.delivery_method, 'Waterfall'::public.delivery_method, 'Agile'::public.delivery_method];
  budgets numeric[] := ARRAY[3200000, 5800000, 4100000, 2700000, 1900000, 1500000, 1200000, 980000, 2200000, 3600000, 2800000, 650000, 3400000, 1100000, 4500000, 1750000];
  capex_a numeric[] := ARRAY[2500000, 4800000, 3500000, 2000000, 1400000, 1100000, 900000, 750000, 2000000, 2900000, 2200000, 200000, 2700000, 850000, 3800000, 1300000];
  capex_i numeric[] := ARRAY[1100000, 3100000, 900000, 400000, 1250000, 1050000, 450000, 80000, 1600000, 1400000, 250000, 195000, 700000, 0, 2900000, 600000];
  opex_a numeric[] := ARRAY[700000, 1000000, 600000, 700000, 500000, 400000, 300000, 230000, 200000, 700000, 600000, 450000, 700000, 250000, 700000, 450000];
  opex_i numeric[] := ARRAY[280000, 620000, 150000, 180000, 410000, 360000, 120000, 20000, 150000, 300000, 80000, 440000, 160000, 0, 500000, 180000];
  facs numeric[] := ARRAY[3300000, 6100000, 4200000, 2850000, 1950000, 1520000, 1280000, 1000000, 2550000, 3750000, 2900000, 640000, 3500000, 1100000, 4800000, 1800000];
  ben_t numeric[] := ARRAY[5200000, 9500000, 7000000, 3500000, 3100000, 2400000, 1800000, 1600000, 1800000, 4200000, 6000000, 1500000, 5500000, 900000, 6200000, 3200000];
  ben_r numeric[] := ARRAY[900000, 1200000, 200000, 0, 1800000, 1600000, 150000, 0, 200000, 400000, 0, 1450000, 100000, 0, 2100000, 450000];
  rois numeric[] := ARRAY[62.5, 63.8, 70.7, 29.6, 63.2, 60, 50, 63.3, -18.2, 16.7, 114.3, 130.8, 61.8, -18.2, 37.8, 82.9];
  starts date[] := ARRAY['2025-04-01'::date, '2024-10-01'::date, '2025-07-01'::date, '2025-11-01'::date, '2024-08-01'::date, '2024-05-01'::date, '2025-06-01'::date, '2026-01-15'::date, '2025-02-01'::date, '2025-03-01'::date, '2025-12-01'::date, '2024-04-01'::date, '2025-08-01'::date, '2026-04-01'::date, '2024-06-01'::date, '2025-09-01'::date];
  ends date[] := ARRAY['2026-09-30'::date, '2026-06-30'::date, '2027-03-31'::date, '2026-12-31'::date, '2026-04-30'::date, '2026-02-28'::date, '2026-08-31'::date, '2026-12-15'::date, '2026-05-31'::date, '2026-11-30'::date, '2027-06-30'::date, '2025-12-31'::date, '2027-02-28'::date, '2027-03-31'::date, '2026-07-31'::date, '2026-10-31'::date];
  lives date[] := ARRAY['2026-08-15'::date, '2026-05-01'::date, '2027-01-15'::date, '2026-11-30'::date, '2026-03-15'::date, '2026-01-20'::date, '2026-07-15'::date, '2026-11-01'::date, '2026-04-30'::date, '2026-10-15'::date, '2027-04-01'::date, '2025-11-01'::date, '2026-12-15'::date, '2027-02-28'::date, '2026-06-15'::date, '2026-09-15'::date];
  sponsors text[] := ARRAY['CDO', 'CTO', 'CDO', 'CISO', 'COO', 'CFO', 'CHRO', 'CPO', 'CTO', 'CRO', 'CDO', 'CTO', 'COO', 'CSO', 'CTO', 'COO'];
  gate_names text[] := ARRAY['Discovery', 'Business Case / Seed Funding', 'Design', 'Business Case / Full Funding', 'Build', 'Testing', 'Deployment', 'Handover', 'Benefit Realisation'];
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
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Alex Morgan', 'alex.morgan@example.com', 'Senior BA', 'Analysis,Agile,Jira', 40, 95, 'Hybrid', 'Active')
    RETURNING id INTO rid;
    res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Jordan Lee', 'jordan.lee@example.com', 'Tech Lead', 'Architecture,Cloud,API', 40, 140, 'Hybrid', 'Active')
    RETURNING id INTO rid;
    res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Sam Rivera', 'sam.rivera@example.com', 'Delivery Manager', 'PMO,RAID,Stakeholder', 40, 120, 'Hybrid', 'Active')
    RETURNING id INTO rid;
    res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Taylor Kim', 'taylor.kim@example.com', 'Data Engineer', 'SQL,ETL,Python', 40, 125, 'Hybrid', 'Active')
    RETURNING id INTO rid;
    res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Casey Brooks', 'casey.brooks@example.com', 'QA Lead', 'Testing,Automation', 40, 100, 'Hybrid', 'Active')
    RETURNING id INTO rid;
    res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Riley Chen', 'riley.chen@example.com', 'UX Designer', 'Design,Research', 40, 105, 'Hybrid', 'Active')
    RETURNING id INTO rid;
    res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Morgan Patel', 'morgan.patel@example.com', 'Security Analyst', 'Security,Risk', 40, 115, 'Hybrid', 'Active')
    RETURNING id INTO rid;
    res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Avery Nguyen', 'avery.nguyen@example.com', 'Finance Analyst', 'Finance,Benefits', 40, 90, 'Hybrid', 'Active')
    RETURNING id INTO rid;
    res_ids := array_append(res_ids, rid);

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
