-- =============================================================================
-- iProjectX — WIPE ALL operational data + seed ONE sample project (DEMO-001)
-- Paste into Supabase SQL Editor → Run → Reload schema (optional)
--
-- PURPOSE
--   Empty every Data Editor–relevant table (and timesheets), then seed a single
--   dual-stream project with round numbers so you can verify calculations.
--
-- KEEPS
--   organizations, profiles, user_roles, business_units (reuses first BU),
--   billing / landing / invoice config, billing_plans, governance_channels,
--   stage_gate_definitions (re-upserted to canonical 9)
--
-- DELETES then RESEEDS (per organisation)
--   All projects + children, resources, allocations, finance, work items,
--   timesheets, demand pipeline, portfolio scenarios, etc.
--
-- SAMPLE PROJECT (easy mental math)
--   Code: DEMO-001 · Sample Dual-Stream Delivery
--   Schedule: 2025-04-01 → 2026-03-31  (exactly 12 months)
--   Budget $1,000,000 = Capex $700,000 + Opex $300,000
--   FAC $1,050,000 · Benefits target $2,000,000 · realised $400,000
--   Streams: Core 60% ($600k) · Platform 40% ($400k)
--   Current phase: Build (gates 1–4 Approved, Build In Review, rest Pending)
--   Monthly Core planned = 600000/12 = $50,000
--   Monthly Platform planned = 400000/12 ≈ $33,333.33 (last month absorbs remainder)
--   Resources: Alex Builder $100/h · Sam Tester $150/h (or synced from profiles)
--   Work-item planned hours: Core Build 160h · Platform Build 80h · Core Test 40h
--   Allocations (Build gate, last 3 months): Core 80h/mo Alex · Platform 40h/mo Sam
--
-- AFTER RUN
--   Financials → Sync planned FTE from work items
--   Financials → Sync incurred from actuals (if you want register = monthly actuals)
-- =============================================================================

BEGIN;

-- ---------- A) Idempotent schema patches ----------
ALTER TABLE public.fy_allocations
  ADD COLUMN IF NOT EXISTS budget NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast NUMERIC(14,2) DEFAULT 0;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS forecast_at_completion NUMERIC(14,2) DEFAULT 0;

ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estimate_hours NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(12,2) DEFAULT 0;

ALTER TABLE public.timesheet_entries
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stream_id uuid,
  ADD COLUMN IF NOT EXISTS labor_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(12,2);

ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_labor_planned NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opex_labor_actual NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opex_other_actual NUMERIC(14,2) DEFAULT 0;

ALTER TABLE public.resource_allocations
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL;

-- ---------- B) Wipe operational / project data ----------
DO $wipe_ts$
BEGIN
  DELETE FROM public.timesheet_approvals;
  DELETE FROM public.timesheet_entries;
  DELETE FROM public.timesheets;
  DELETE FROM public.work_item_assignees;
EXCEPTION WHEN undefined_table THEN NULL;
END
$wipe_ts$;

DELETE FROM public.notifications
WHERE kind ILIKE 'timesheet%' OR kind IN ('timesheet_missing', 'timesheet_approval_reminder');

DELETE FROM public.resource_allocations;
DELETE FROM public.resources;
DELETE FROM public.demand_pipeline;
DELETE FROM public.financials_monthly;
DELETE FROM public.fy_allocations;
DELETE FROM public.benefits;
DELETE FROM public.status_updates;
DELETE FROM public.documents;
DELETE FROM public.lessons_learned;

DO $wipe_scen$
BEGIN
  DELETE FROM public.scenario_projects;
  DELETE FROM public.portfolio_scenarios;
EXCEPTION WHEN undefined_table THEN NULL;
END
$wipe_scen$;

DELETE FROM public.work_items;

DO $wipe_audit$
BEGIN
  DELETE FROM public.audit_events;
  DELETE FROM public.audit_log;
  DELETE FROM public.project_purge_notices;
EXCEPTION WHEN undefined_table THEN NULL;
END
$wipe_audit$;

DO $wipe_gates$
BEGIN
  DELETE FROM public.stage_gates;
  DELETE FROM public.milestones;
  DELETE FROM public.project_streams;
EXCEPTION WHEN undefined_table THEN NULL;
END
$wipe_gates$;

-- Cascades: risks, issues, actions, decisions, dependencies, CRs, sprints, stakeholders, …
DELETE FROM public.projects;

-- ---------- C) Canonical stage gate definitions ----------
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

-- ---------- D) Seed ONE project per organisation ----------
DO $$
DECLARE
  r_org RECORD;
  r_bu uuid;
  p_id uuid;
  core_id uuid;
  alt_id uuid;
  sid uuid;
  g_id uuid;
  build_core uuid;
  build_alt uuid;
  test_core uuid;
  rid_alex uuid;
  rid_sam uuid;
  uid_alex uuid;
  uid_sam uuid;
  wi1 uuid;
  wi2 uuid;
  wi3 uuid;
  sheet_id uuid;
  week0 date;
  m date;
  i int;
  gate_names text[] := ARRAY[
    'Discovery','Business Case / Seed Funding','Design','Business Case / Full Funding',
    'Build','Testing','Deployment','Handover','Benefit Realisation'
  ];
  g_status text;
  g_idx int := 5; -- Build
  p_start date := DATE '2025-04-01';
  p_end date := DATE '2026-03-31';
  n_months int := 12;
  -- Project totals (round)
  budget numeric := 1000000;
  capex_a numeric := 700000;
  opex_a numeric := 300000;
  fac numeric := 1050000;
  ben_t numeric := 2000000;
  ben_r numeric := 400000;
  -- Stream shares
  core_share numeric := 0.60;
  alt_share numeric := 0.40;
  s_budget numeric;
  s_capex_a numeric;
  s_opex_a numeric;
  s_fac numeric;
  s_ben_t numeric;
  s_ben_r numeric;
  s_capex_i numeric;
  s_opex_i numeric;
  plan_mo numeric;
  fcst_mo numeric;
  act_cap_mo numeric;
  act_opex_mo numeric;
  ben_plan_mo numeric;
  ben_act_mo numeric;
  months_past int;
  fy_label text;
  alex_name text := 'Alex Builder';
  sam_name text := 'Sam Tester';
BEGIN
  FOR r_org IN
    SELECT id, COALESCE(fy_start_month, 4) AS fy_start_month
    FROM public.organizations
  LOOP
    -- Business unit
    SELECT id INTO r_bu FROM public.business_units WHERE org_id = r_org.id ORDER BY name LIMIT 1;
    IF r_bu IS NULL THEN
      INSERT INTO public.business_units (org_id, code, name)
      VALUES (r_org.id, 'ENT', 'Enterprise Delivery')
      RETURNING id INTO r_bu;
    END IF;

    -- Prefer linked profile logins when present
    SELECT p.id INTO uid_alex
    FROM public.profiles p
    WHERE p.org_id = r_org.id
    ORDER BY
      CASE WHEN lower(p.email) IN ('kaaminisharma1994@gmail.com','shailja.kant.kaushik@gmail.com') THEN 0 ELSE 1 END,
      p.full_name NULLS LAST
    LIMIT 1;
    SELECT p.id INTO uid_sam
    FROM public.profiles p
    WHERE p.org_id = r_org.id AND p.id IS DISTINCT FROM uid_alex
    ORDER BY p.full_name NULLS LAST
    LIMIT 1;

    BEGIN
      PERFORM public.sync_org_resources_from_profiles(r_org.id);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;

    -- Resources (create demo people if org has none)
    SELECT id INTO rid_alex FROM public.resources WHERE org_id = r_org.id AND user_id = uid_alex LIMIT 1;
    SELECT id INTO rid_sam FROM public.resources WHERE org_id = r_org.id AND user_id = uid_sam LIMIT 1;

    IF rid_alex IS NULL THEN
      INSERT INTO public.resources (
        org_id, name, email, role, skills, bu_id, capacity_hours_week, cost_rate, location, status, user_id
      ) VALUES (
        r_org.id, alex_name, 'alex.builder@example.com', 'Developer', 'React,SQL',
        r_bu, 40, 100, 'Sydney', 'Active', uid_alex
      ) RETURNING id INTO rid_alex;
    ELSE
      UPDATE public.resources
      SET cost_rate = 100, capacity_hours_week = 40, status = 'Active', bu_id = COALESCE(bu_id, r_bu)
      WHERE id = rid_alex
      RETURNING name INTO alex_name;
    END IF;

    IF rid_sam IS NULL THEN
      INSERT INTO public.resources (
        org_id, name, email, role, skills, bu_id, capacity_hours_week, cost_rate, location, status, user_id, manager_user_id
      ) VALUES (
        r_org.id, sam_name, 'sam.tester@example.com', 'QA Lead', 'UAT,Test',
        r_bu, 40, 150, 'Melbourne', 'Active', uid_sam, uid_alex
      ) RETURNING id INTO rid_sam;
    ELSE
      UPDATE public.resources
      SET cost_rate = 150, capacity_hours_week = 40, status = 'Active',
          bu_id = COALESCE(bu_id, r_bu), manager_user_id = COALESCE(manager_user_id, uid_alex)
      WHERE id = rid_sam
      RETURNING name INTO sam_name;
    END IF;

    -- Link managers both ways when possible
    UPDATE public.resources SET manager_user_id = uid_sam WHERE id = rid_alex AND uid_sam IS NOT NULL;
    UPDATE public.resources SET manager_user_id = uid_alex WHERE id = rid_sam AND uid_alex IS NOT NULL;

    -- Project
    INSERT INTO public.projects (
      org_id, project_code, name, portfolio, program, sponsor, bu_id,
      priority, status, rag, current_phase, delivery_method,
      planned_start_date, planned_end_date, actual_start_date,
      start_date, end_date, target_go_live,
      budget, capex_approved, capex_incurred, opex_approved, opex_incurred,
      forecast_at_completion, benefits_target, benefits_realised, roi_percent,
      baseline_budget, baseline_capex, baseline_opex, baseline_benefits, baseline_date, baseline_label,
      description, streams_enabled, pm_user_id
    ) VALUES (
      r_org.id, 'DEMO-001', 'Sample Dual-Stream Delivery',
      'IT Strategic', 'Platform Modernisation', 'CTO', r_bu,
      'High', 'In Progress', 'Green', 'Build', 'Hybrid',
      p_start, p_end, p_start,
      p_start, p_end, DATE '2026-02-15',
      budget, capex_a, 0, opex_a, 0,
      fac, ben_t, ben_r, 100,
      budget, capex_a, opex_a, ben_t, p_start, 'Baseline v1',
      'Single-project verification seed. Budget $1.0M = Capex $0.7M + Opex $0.3M. Core 60% / Platform 40%.',
      true, uid_alex
    ) RETURNING id INTO p_id;

    -- Core stream (trigger may create it)
    BEGIN
      core_id := public.ensure_project_core_stream(p_id);
    EXCEPTION WHEN undefined_function THEN
      SELECT id INTO core_id FROM public.project_streams WHERE project_id = p_id AND is_default LIMIT 1;
    END;
    IF core_id IS NULL THEN
      INSERT INTO public.project_streams (
        org_id, project_id, name, code, is_default, sort_order, owner, status, rag,
        planned_start_date, planned_end_date, actual_start_date,
        budget, capex_approved, opex_approved, forecast_at_completion
      ) VALUES (
        r_org.id, p_id, 'Core', 'CORE', true, 0, alex_name, 'In Progress', 'Green',
        p_start, p_end, p_start,
        budget * core_share, capex_a * core_share, opex_a * core_share, fac * core_share
      ) RETURNING id INTO core_id;
    ELSE
      UPDATE public.project_streams SET
        name = 'Core', code = 'CORE', is_default = true, sort_order = 0,
        owner = alex_name, status = 'In Progress', rag = 'Green',
        planned_start_date = p_start, planned_end_date = p_end, actual_start_date = p_start,
        budget = budget * core_share,
        capex_approved = capex_a * core_share,
        opex_approved = opex_a * core_share,
        forecast_at_completion = fac * core_share,
        description = 'Core delivery lane (60% of project)'
      WHERE id = core_id;
    END IF;

    INSERT INTO public.project_streams (
      org_id, project_id, name, code, is_default, sort_order, owner, status, rag,
      planned_start_date, planned_end_date, actual_start_date,
      budget, capex_approved, opex_approved, forecast_at_completion, description
    ) VALUES (
      r_org.id, p_id, 'Platform', 'PLT', false, 1, sam_name, 'In Progress', 'Amber',
      p_start + 14, p_end, p_start + 14,
      budget * alt_share, capex_a * alt_share, opex_a * alt_share, fac * alt_share,
      'Platform lane (40% of project)'
    )
    ON CONFLICT (project_id, name) DO UPDATE SET
      code = EXCLUDED.code,
      budget = EXCLUDED.budget,
      capex_approved = EXCLUDED.capex_approved,
      opex_approved = EXCLUDED.opex_approved,
      forecast_at_completion = EXCLUDED.forecast_at_completion
    RETURNING id INTO alt_id;

    -- Stage gates per stream (9 each)
    FOREACH sid IN ARRAY ARRAY[core_id, alt_id]
    LOOP
      FOR i IN 1..9 LOOP
        IF i < g_idx THEN g_status := 'Approved';
        ELSIF i = g_idx THEN g_status := 'In Review';
        ELSE g_status := 'Pending';
        END IF;
        INSERT INTO public.stage_gates (
          org_id, project_id, stream_id, gate_name, planned_date, actual_date, status, approver, notes
        ) VALUES (
          r_org.id, p_id, sid, gate_names[i],
          (p_start + ((i - 1) * 40)),
          CASE WHEN i < g_idx THEN (p_start + ((i - 1) * 40) + 5) ELSE NULL END,
          g_status,
          CASE WHEN sid = core_id THEN alex_name ELSE sam_name END,
          'Seed gate ' || gate_names[i]
        );
      END LOOP;
    END LOOP;

    SELECT id INTO build_core FROM public.stage_gates
    WHERE project_id = p_id AND stream_id = core_id AND gate_name = 'Build' LIMIT 1;
    SELECT id INTO build_alt FROM public.stage_gates
    WHERE project_id = p_id AND stream_id = alt_id AND gate_name = 'Build' LIMIT 1;
    SELECT id INTO test_core FROM public.stage_gates
    WHERE project_id = p_id AND stream_id = core_id AND gate_name = 'Testing' LIMIT 1;

    -- Ensure milestones have stream_id where possible
    UPDATE public.milestones m
    SET stream_id = sg.stream_id
    FROM public.stage_gates sg
    WHERE m.project_id = p_id AND m.stream_id IS NULL
      AND m.name = sg.gate_name AND sg.project_id = p_id;

    INSERT INTO public.milestones (org_id, project_id, stream_id, name, planned_date, status, owner, notes)
    VALUES
      (r_org.id, p_id, core_id, 'Core MVP ready', DATE '2025-12-15', 'In Progress', alex_name, 'Add-on milestone'),
      (r_org.id, p_id, alt_id, 'Platform API freeze', DATE '2026-01-15', 'Not Started', sam_name, 'Add-on milestone');

    -- FY allocation (single FY26 for Apr25–Mar26 when fy_start=4)
    fy_label := 'FY' || to_char(p_end, 'YY');
    FOREACH sid IN ARRAY ARRAY[core_id, alt_id]
    LOOP
      s_budget := budget * CASE WHEN sid = core_id THEN core_share ELSE alt_share END;
      s_capex_a := capex_a * CASE WHEN sid = core_id THEN core_share ELSE alt_share END;
      s_opex_a := opex_a * CASE WHEN sid = core_id THEN core_share ELSE alt_share END;
      s_fac := fac * CASE WHEN sid = core_id THEN core_share ELSE alt_share END;
      s_ben_t := ben_t * CASE WHEN sid = core_id THEN core_share ELSE alt_share END;

      INSERT INTO public.fy_allocations (
        org_id, project_id, stream_id, fy, budget, forecast, capex, opex, benefits
      ) VALUES (
        r_org.id, p_id, sid, fy_label, s_budget, s_fac, s_capex_a, s_opex_a, s_ben_t
      );
    END LOOP;

    -- Monthly cashflow (12 months). Actuals for first 6 months only.
    -- Planned: exact stream budget split 70% capex / 30% opex across 12 months.
    months_past := 6;
    FOREACH sid IN ARRAY ARRAY[core_id, alt_id]
    LOOP
      s_budget := budget * CASE WHEN sid = core_id THEN core_share ELSE alt_share END;
      s_capex_a := capex_a * CASE WHEN sid = core_id THEN core_share ELSE alt_share END;
      s_opex_a := opex_a * CASE WHEN sid = core_id THEN core_share ELSE alt_share END;
      s_fac := fac * CASE WHEN sid = core_id THEN core_share ELSE alt_share END;
      s_ben_t := ben_t * CASE WHEN sid = core_id THEN core_share ELSE alt_share END;
      s_ben_r := ben_r * CASE WHEN sid = core_id THEN core_share ELSE alt_share END;
      s_capex_i := round(s_capex_a * 0.40, 2);
      s_opex_i := round(s_opex_a * 0.40, 2);

      act_cap_mo := round(s_capex_i / months_past, 2);
      act_opex_mo := round(s_opex_i / months_past, 2);
      ben_plan_mo := round(s_ben_t / n_months, 2);
      ben_act_mo := round(s_ben_r / months_past, 2);

      m := p_start;
      FOR i IN 1..n_months LOOP
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month,
          capex_planned, opex_planned,
          capex_forecast, opex_forecast,
          capex_actual, opex_actual, opex_other_actual, opex_labor_actual, opex_labor_planned,
          benefits_planned, benefits_actual
        ) VALUES (
          r_org.id, p_id, sid, m,
          CASE WHEN i < n_months THEN round(s_capex_a / n_months, 2)
               ELSE s_capex_a - round(s_capex_a / n_months, 2) * (n_months - 1) END,
          CASE WHEN i < n_months THEN round(s_opex_a / n_months, 2)
               ELSE s_opex_a - round(s_opex_a / n_months, 2) * (n_months - 1) END,
          CASE WHEN i < n_months THEN round((s_fac * s_capex_a / NULLIF(s_budget,0)) / n_months, 2)
               ELSE round(s_fac * s_capex_a / NULLIF(s_budget,0), 2)
                    - round((s_fac * s_capex_a / NULLIF(s_budget,0)) / n_months, 2) * (n_months - 1) END,
          CASE WHEN i < n_months THEN round((s_fac * s_opex_a / NULLIF(s_budget,0)) / n_months, 2)
               ELSE round(s_fac * s_opex_a / NULLIF(s_budget,0), 2)
                    - round((s_fac * s_opex_a / NULLIF(s_budget,0)) / n_months, 2) * (n_months - 1) END,
          CASE WHEN i <= months_past THEN act_cap_mo ELSE 0 END,
          CASE WHEN i <= months_past THEN act_opex_mo ELSE 0 END,
          CASE WHEN i <= months_past THEN act_opex_mo ELSE 0 END,
          0,
          0,
          CASE WHEN i < n_months THEN ben_plan_mo
               ELSE s_ben_t - ben_plan_mo * (n_months - 1) END,
          CASE WHEN i <= months_past THEN ben_act_mo ELSE 0 END
        );
        m := (m + INTERVAL '1 month')::date;
      END LOOP;

      UPDATE public.project_streams SET
        capex_incurred = s_capex_i,
        opex_incurred = s_opex_i
      WHERE id = sid;
    END LOOP;

    -- Resource allocations (Build gate, last 3 months of past window: Jan–Mar 2026 relative… use Oct–Dec 2025)
    -- Oct/Nov/Dec 2025 = months 7–9 of schedule — use months that are "past": Apr–Sep.
    -- Allocate Jul/Aug/Sep 2025 (months 4–6) for clear verification.
    FOREACH m IN ARRAY ARRAY[DATE '2025-07-01', DATE '2025-08-01', DATE '2025-09-01']
    LOOP
      INSERT INTO public.resource_allocations (
        org_id, project_id, stream_id, stage_gate_id, resource_id, period_month,
        allocation_percent, allocated_hours, role_on_project
      ) VALUES
        (r_org.id, p_id, core_id, build_core, rid_alex, m, 50, 80, 'Developer'),
        (r_org.id, p_id, alt_id, build_alt, rid_sam, m, 25, 40, 'QA Lead');
    END LOOP;

    -- Work items (planned hours feed demand + planned FTE $)
    -- Alex $100 × 160h = $16,000 · Sam $150 × 80h = $12,000 · Alex $100 × 40h = $4,000
    -- Total planned FTE $ = $32,000 (when synced; dates fall in Jul–Dec 2025)
    INSERT INTO public.work_items (
      org_id, project_id, stream_id, stage_gate_id, wbs_code, title, description,
      status, priority, owner, owner_user_id, percent_complete,
      planned_start, planned_end, estimate_hours, actual_hours, sort_order
    ) VALUES
      (r_org.id, p_id, core_id, build_core, '1.1', 'Core Build — API',
       'Core stream Build work. Planned 160h @ $100 = $16,000 FTE.',
       'In Progress', 'High', alex_name, uid_alex, 40,
       DATE '2025-07-01', DATE '2025-09-30', 160, 0, 1)
    RETURNING id INTO wi1;

    INSERT INTO public.work_items (
      org_id, project_id, stream_id, stage_gate_id, wbs_code, title, description,
      status, priority, owner, owner_user_id, percent_complete,
      planned_start, planned_end, estimate_hours, actual_hours, sort_order
    ) VALUES
      (r_org.id, p_id, alt_id, build_alt, '2.1', 'Platform Build — services',
       'Platform stream Build work. Planned 80h @ $150 = $12,000 FTE.',
       'In Progress', 'High', sam_name, uid_sam, 25,
       DATE '2025-07-01', DATE '2025-09-30', 80, 0, 2)
    RETURNING id INTO wi2;

    INSERT INTO public.work_items (
      org_id, project_id, stream_id, stage_gate_id, wbs_code, title, description,
      status, priority, owner, owner_user_id, percent_complete,
      planned_start, planned_end, estimate_hours, actual_hours, sort_order
    ) VALUES
      (r_org.id, p_id, core_id, test_core, '1.2', 'Core Testing prep',
       'Testing gate. Planned 40h @ $100 = $4,000 FTE.',
       'To Do', 'Medium', alex_name, uid_alex, 0,
       DATE '2025-10-01', DATE '2025-10-31', 40, 0, 3)
    RETURNING id INTO wi3;

    INSERT INTO public.work_item_assignees (org_id, work_item_id, resource_id, user_id)
    VALUES
      (r_org.id, wi1, rid_alex, uid_alex),
      (r_org.id, wi2, rid_sam, uid_sam),
      (r_org.id, wi3, rid_alex, uid_alex)
    ON CONFLICT DO NOTHING;

    -- RAID / governance / other Data Editor tables
    INSERT INTO public.risks (
      org_id, project_id, title, description, category, probability, impact, severity, status, owner, mitigation, due_date
    ) VALUES (
      r_org.id, p_id, 'Integration delay', 'Vendor API slip may push Build', 'Schedule',
      3, 4, 12, 'Mitigating', alex_name, 'Weekly vendor checkpoint', DATE '2025-10-01'
    );

    INSERT INTO public.issues (
      org_id, project_id, title, description, priority, status, owner, raised_date, target_date
    ) VALUES (
      r_org.id, p_id, 'Env capacity short', 'UAT env undersized', 'High', 'Open', sam_name,
      DATE '2025-08-01', DATE '2025-09-15'
    );

    INSERT INTO public.actions (
      org_id, project_id, title, description, owner, priority, status, due_date
    ) VALUES (
      r_org.id, p_id, 'Confirm UAT sizing', 'Raise infra ticket', sam_name, 'High', 'Open', DATE '2025-09-01'
    );

    INSERT INTO public.decisions (
      org_id, project_id, stage_gate_id, title, description, program, forum, sponsor,
      decided_by, outcome, status, decision_date, rationale
    ) VALUES (
      r_org.id, p_id, build_core, 'Proceed with Build', 'Gate review approved to continue Build',
      'Platform Modernisation', 'PMO Board', 'CTO', 'CTO', 'Approved', 'Approved',
      DATE '2025-06-20', 'Benefits case intact; risks acceptable'
    );

    INSERT INTO public.dependencies (
      org_id, project_id, title, description, dep_type, status, owner, needed_by
    ) VALUES (
      r_org.id, p_id, 'External IdP ready', 'SSO dependency for go-live',
      'Finish-to-Start', 'On Track', alex_name, DATE '2026-01-15'
    );

    INSERT INTO public.benefits (
      org_id, project_id, title, benefit_type, target_value, realised_value, realisation_date, owner, status, notes
    ) VALUES
      (r_org.id, p_id, 'OpEx efficiency', 'Cash', 1200000, 250000, DATE '2026-06-30', alex_name, 'In Progress', 'Core share heavy'),
      (r_org.id, p_id, 'Revenue uplift', 'Revenue', 800000, 150000, DATE '2026-09-30', sam_name, 'Planned', 'Platform features');

    INSERT INTO public.sprints (
      org_id, project_id, sprint_number, name, start_date, end_date,
      planned_points, completed_points, committed_stories, completed_stories, status
    ) VALUES
      (r_org.id, p_id, 1, 'Sprint 1 — Foundations', DATE '2025-07-01', DATE '2025-07-14', 40, 38, 8, 7, 'Closed'),
      (r_org.id, p_id, 2, 'Sprint 2 — Build', DATE '2025-07-15', DATE '2025-07-28', 45, 20, 9, 4, 'Active');

    INSERT INTO public.change_requests (
      org_id, project_id, cr_number, title, description, change_type,
      impact_scope, impact_schedule_days, impact_cost, status, raised_by, raised_date
    ) VALUES (
      r_org.id, p_id, 'CR-001', 'Add audit export', 'Extra reporting for compliance',
      'Scope', 'Reporting module', 10, 25000, 'Submitted', alex_name, DATE '2025-08-10'
    );

    INSERT INTO public.status_updates (
      org_id, project_id, update_date, reporter, overall_rag, schedule_rag, cost_rag, scope_rag,
      progress_summary, achievements, next_steps, blockers
    ) VALUES (
      r_org.id, p_id, DATE '2025-09-01', alex_name, 'Green', 'Green', 'Amber', 'Green',
      'Build in progress on both streams.', 'API skeleton complete.', 'Continue Platform services.', 'UAT capacity'
    );

    INSERT INTO public.stakeholders (
      org_id, project_id, name, role, email, influence, interest, engagement_strategy
    ) VALUES
      (r_org.id, p_id, 'Casey Sponsor', 'Executive Sponsor', 'casey.sponsor@example.com', 'High', 'High', 'Monthly steering'),
      (r_org.id, p_id, 'Riley Ops', 'Ops Lead', 'riley.ops@example.com', 'Medium', 'High', 'Bi-weekly demo');

    INSERT INTO public.documents (
      org_id, project_id, name, doc_type, url, version, owner, uploaded_date
    ) VALUES (
      r_org.id, p_id, 'Business Case', 'Business Case', 'https://example.com/demo-bc', '1.0', alex_name, DATE '2025-05-01'
    );

    INSERT INTO public.lessons_learned (
      org_id, project_id, category, what_happened, root_cause, recommendation, captured_by, captured_date
    ) VALUES (
      r_org.id, p_id, 'Delivery', 'Env sizing underestimated', 'Late non-func requirements',
      'Include NFR checklist at Design gate', sam_name, DATE '2025-08-20'
    );

    INSERT INTO public.demand_pipeline (
      org_id, bu_id, idea_name, sponsor, description, estimated_cost, estimated_benefit,
      estimated_roi, strategic_alignment, complexity, status, submitted_date
    ) VALUES (
      r_org.id, r_bu, 'Follow-on analytics pack', 'CDO',
      'Pipeline idea linked to DEMO-001 outcomes', 500000, 900000, 80, 'High', 'Medium',
      'Under Review', DATE '2025-09-01'
    );

    -- Sample approved timesheet (actual FTE) — only if Alex has a login
    IF uid_alex IS NOT NULL THEN
      week0 := DATE '2025-09-01'; -- Monday-ish; normalize in app as needed
      -- snap to Monday
      week0 := week0 - ((EXTRACT(ISODOW FROM week0)::int - 1));
      INSERT INTO public.timesheets (
        org_id, user_id, resource_id, week_start, status, manager_user_id
      ) VALUES (
        r_org.id, uid_alex, rid_alex, week0, 'approved', uid_sam
      )
      RETURNING id INTO sheet_id;

      IF sheet_id IS NULL THEN
        SELECT id INTO sheet_id FROM public.timesheets
        WHERE org_id = r_org.id AND user_id = uid_alex AND week_start = week0;
        UPDATE public.timesheets SET status = 'approved', resource_id = rid_alex WHERE id = sheet_id;
      END IF;

      DELETE FROM public.timesheet_entries WHERE timesheet_id = sheet_id;
      INSERT INTO public.timesheet_entries (
        timesheet_id, project_id, work_item_id, stream_id, stage_gate_id, billable,
        hours_mon, hours_tue, hours_wed, hours_thu, hours_fri, hours_sat, hours_sun, notes
      ) VALUES (
        sheet_id, p_id, wi1, core_id, build_core, true,
        8, 8, 8, 8, 8, 0, 0, 'Build week — 40h @ $100 = $4,000 labor'
      );

      BEGIN
        PERFORM public.apply_timesheet_labor_cost(sheet_id);
      EXCEPTION WHEN undefined_function THEN
        UPDATE public.timesheet_entries SET hourly_rate = 100, labor_cost = 4000 WHERE timesheet_id = sheet_id;
      END;
    END IF;

    BEGIN
      PERFORM public.rollup_project_from_streams(p_id);
    EXCEPTION WHEN undefined_function THEN
      UPDATE public.projects SET
        capex_incurred = (SELECT COALESCE(SUM(capex_incurred),0) FROM public.project_streams WHERE project_id = p_id),
        opex_incurred = (SELECT COALESCE(SUM(opex_incurred),0) FROM public.project_streams WHERE project_id = p_id)
      WHERE id = p_id;
    END;

    RAISE NOTICE 'Seeded DEMO-001 for org % (project %)', r_org.id, p_id;
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- VERIFY (run after paste — expect these ballparks)
-- =============================================================================
-- SELECT project_code, budget, capex_approved, opex_approved, forecast_at_completion
-- FROM projects WHERE project_code = 'DEMO-001';
-- -- budget=1000000, capex=700000, opex=300000, FAC=1050000
--
-- SELECT code, budget, capex_approved, opex_approved FROM project_streams
-- WHERE project_id = (SELECT id FROM projects WHERE project_code='DEMO-001');
-- -- CORE 600000 / 420000 / 180000 · PLT 400000 / 280000 / 120000
--
-- SELECT stream_id IS NOT NULL AS has_stream, COUNT(*), SUM(capex_planned+opex_planned) AS planned
-- FROM financials_monthly
-- WHERE project_id = (SELECT id FROM projects WHERE project_code='DEMO-001')
-- GROUP BY 1;
-- -- planned ≈ 1000000
--
-- SELECT wbs_code, estimate_hours, title FROM work_items
-- WHERE project_id = (SELECT id FROM projects WHERE project_code='DEMO-001') ORDER BY sort_order;
-- -- 160 + 80 + 40 = 280 planned hours
--
-- SELECT SUM(allocated_hours) FROM resource_allocations
-- WHERE project_id = (SELECT id FROM projects WHERE project_code='DEMO-001');
-- -- 3 months × (80+40) = 360 allocated hours
-- =============================================================================
