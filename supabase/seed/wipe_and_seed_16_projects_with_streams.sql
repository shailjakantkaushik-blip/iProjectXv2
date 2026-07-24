-- =========================================================================
-- iProjectX — Wipe operational data + seed 16 projects WITH streams
-- Paste into Supabase SQL Editor and run once.
--
-- KEEPS
--   organizations, profiles, user_roles, business_units,
--   organisation billing / landing / invoice template config,
--   billing_plans, stage_gate_definitions, governance_channels
--
-- DELETES (then reseeds)
--   projects (+ cascaded children incl. project_streams),
--   resources, resource_allocations, demand_pipeline,
--   portfolio_scenarios / scenario_projects,
--   financials_monthly, fy_allocations, benefits leftovers,
--   work_items, audit_log / audit_events, project_purge_notices
--
-- SEEDS (per organisation)
--   8 resources, 16 projects (always-on Core + second stream),
--   stage gates + milestones per stream, FY + monthly finance per stream,
--   resource allocations, benefits, risks, issues, actions, decisions,
--   stakeholders, status updates, documents, lessons, change requests,
--   sprints, work items, dependencies, demand pipeline, portfolio scenario,
--   project.brief (Section 1 + 2) + baselines
--
-- Requires: always-on Core streams migration (ensure_project_core_stream,
--           rollup_project_from_streams).
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

DO $wipe3$
BEGIN
  DELETE FROM public.audit_events;
EXCEPTION WHEN undefined_table THEN NULL;
END
$wipe3$;

DO $wipe4$
BEGIN
  DELETE FROM public.audit_log;
EXCEPTION WHEN undefined_table THEN NULL;
END
$wipe4$;

DO $wipe5$
BEGIN
  DELETE FROM public.project_purge_notices;
EXCEPTION WHEN undefined_table THEN NULL;
END
$wipe5$;

-- Cascades: project_streams, stage_gates, milestones, risks, issues,
-- actions, decisions, dependencies, change_requests, sprints, stakeholders, etc.
DELETE FROM public.projects;

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

-- ---------- D) Seed 16 projects + streams + full attribute data ----------
DO $$
DECLARE
  r_org RECORD;
  r_bu uuid;
  p_id uuid;
  core_id uuid;
  alt_id uuid;
  scen_id uuid;
  sprint_id uuid;
  ms_id uuid;
  res_ids uuid[] := ARRAY[]::uuid[];
  rid uuid;
  i int;
  j int;
  codes text[] := ARRAY[
    'PRJ-001','PRJ-002','PRJ-003','PRJ-004','PRJ-005','PRJ-006','PRJ-007','PRJ-008',
    'PRJ-009','PRJ-010','PRJ-011','PRJ-012','PRJ-013','PRJ-014','PRJ-015','PRJ-016'
  ];
  names text[] := ARRAY[
    'Customer Portal Redesign','Core Banking API Platform','Data Lakehouse Foundation',
    'Cyber Resilience Uplift','Contact Centre Omnichannel','Finance Close Automation',
    'HR Self-Service Suite','Supplier Portal 2.0','Branch Network WiFi Refresh',
    'Regulatory Reporting Engine','Mobile App Payments','Cloud Cost Optimisation',
    'Claims Straight-Through','ESG Data Platform','Legacy Policy Admin Decommission',
    'AI Document Intake'
  ];
  programs text[] := ARRAY[
    'Digital Transformation','Platform Modernisation','Data & Analytics','Risk & Compliance',
    'Customer Experience','Finance Transformation','People Systems','Procurement',
    'Infrastructure','Risk & Compliance','Digital Transformation','Platform Modernisation',
    'Operations Excellence','Data & Analytics','Platform Modernisation','Operations Excellence'
  ];
  phases text[] := ARRAY[
    'Build','Testing','Design','Business Case / Full Funding','Deployment','Handover',
    'Build','Discovery','Testing','Build','Business Case / Seed Funding','Benefit Realisation',
    'Design','Discovery','Deployment','Build'
  ];
  statuses public.project_status[] := ARRAY[
    'In Progress','In Progress','In Progress','In Progress','In Progress','In Progress',
    'In Progress','In Progress','In Progress','In Progress','In Progress','Completed',
    'In Progress','Not Started','In Progress','In Progress'
  ]::public.project_status[];
  rags public.project_rag[] := ARRAY[
    'Green','Amber','Green','Amber','Green','Green','Amber','Green',
    'Red','Amber','Green','Green','Green','Green','Amber','Green'
  ]::public.project_rag[];
  priorities text[] := ARRAY[
    'P1 - Critical','P1 - Critical','P2 - High','P1 - Critical','P2 - High','P2 - High',
    'P3 - Medium','P3 - Medium','P2 - High','P1 - Critical','P2 - High','P3 - Medium',
    'P2 - High','P4 - Low','P2 - High','P2 - High'
  ];
  methods public.delivery_method[] := ARRAY[
    'Hybrid','Agile','Waterfall','Hybrid','Agile','Waterfall','Hybrid','Agile',
    'Waterfall','Hybrid','Agile','Agile','Hybrid','Waterfall','Waterfall','Agile'
  ]::public.delivery_method[];
  budgets numeric[] := ARRAY[3200000,5800000,4100000,2700000,1900000,1500000,1200000,980000,2200000,3600000,2800000,650000,3400000,1100000,4500000,1750000];
  capex_a numeric[] := ARRAY[2500000,4800000,3500000,2000000,1400000,1100000,900000,750000,2000000,2900000,2200000,200000,2700000,850000,3800000,1300000];
  capex_i numeric[] := ARRAY[1100000,3100000,900000,400000,1250000,1050000,450000,80000,1600000,1400000,250000,195000,700000,0,2900000,600000];
  opex_a numeric[] := ARRAY[700000,1000000,600000,700000,500000,400000,300000,230000,200000,700000,600000,450000,700000,250000,700000,450000];
  opex_i numeric[] := ARRAY[280000,620000,150000,180000,410000,360000,120000,20000,150000,300000,80000,440000,160000,0,500000,180000];
  facs numeric[] := ARRAY[3300000,6100000,4200000,2850000,1950000,1520000,1280000,1000000,2550000,3750000,2900000,640000,3500000,1100000,4800000,1800000];
  ben_t numeric[] := ARRAY[5200000,9500000,7000000,3500000,3100000,2400000,1800000,1600000,1800000,4200000,6000000,1500000,5500000,900000,6200000,3200000];
  ben_r numeric[] := ARRAY[900000,1200000,200000,0,1800000,1600000,150000,0,200000,400000,0,1450000,100000,0,2100000,450000];
  rois numeric[] := ARRAY[62.5,63.8,70.7,29.6,63.2,60,50,63.3,-18.2,16.7,114.3,130.8,61.8,-18.2,37.8,82.9];
  starts date[] := ARRAY[
    '2025-04-01','2024-10-01','2025-07-01','2025-11-01','2024-08-01','2024-05-01',
    '2025-06-01','2026-01-15','2025-02-01','2025-03-01','2025-12-01','2024-04-01',
    '2025-08-01','2026-04-01','2024-06-01','2025-09-01'
  ]::date[];
  ends date[] := ARRAY[
    '2026-09-30','2026-06-30','2027-03-31','2026-12-31','2026-04-30','2026-02-28',
    '2026-08-31','2026-12-15','2026-05-31','2026-11-30','2027-06-30','2025-12-31',
    '2027-02-28','2027-03-31','2026-07-31','2026-10-31'
  ]::date[];
  lives date[] := ARRAY[
    '2026-08-15','2026-05-01','2027-01-15','2026-11-30','2026-03-15','2026-01-20',
    '2026-07-15','2026-11-01','2026-04-30','2026-10-15','2027-04-01','2025-11-01',
    '2026-12-15','2027-02-28','2026-06-15','2026-09-15'
  ]::date[];
  sponsors text[] := ARRAY[
    'CDO','CTO','CDO','CISO','COO','CFO','CHRO','CPO','CTO','CRO','CDO','CTO','COO','CSO','CTO','COO'
  ];
  alt_names text[] := ARRAY[
    'Experience','Platform','Data','Security','Omnichannel','Automation',
    'Self-Service','Procurement','Network','Reporting','Payments','Cloud FinOps',
    'Claims Engine','ESG Metrics','Decommission','AI Intake'
  ];
  alt_codes text[] := ARRAY[
    'XP','PLT','DATA','SEC','OMNI','AUTO','SS','PROC','NET','REP','PAY','CF','CLM','ESG','DEC','AI'
  ];
  align text[] := ARRAY[
    'Customer Experience','Digital Transformation','Growth','Risk Reduction',
    'Customer Experience','Efficiency','Efficiency','Digital Transformation',
    'Cost Optimisation','Compliance','Growth','Cost Optimisation',
    'Efficiency','Compliance','Cost Optimisation','Innovation'
  ];
  gate_names text[] := ARRAY[
    'Discovery','Business Case / Seed Funding','Design','Business Case / Full Funding',
    'Build','Testing','Deployment','Handover','Benefit Realisation'
  ];
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
  core_share numeric;
  alt_share numeric;
  stream_ids uuid[];
  sid uuid;
  s_share numeric;
  s_start date;
  s_end date;
  s_budget numeric;
  s_capex_a numeric;
  s_capex_i numeric;
  s_opex_a numeric;
  s_opex_i numeric;
  s_fac numeric;
  brief_json jsonb;
  prev_p uuid;
BEGIN
  FOR r_org IN SELECT id, COALESCE(fy_start_month, 4) AS fy_start_month FROM public.organizations LOOP
    fy_start := r_org.fy_start_month;
    SELECT id INTO r_bu FROM public.business_units WHERE org_id = r_org.id ORDER BY name LIMIT 1;

    -- Ensure at least one BU
    IF r_bu IS NULL THEN
      INSERT INTO public.business_units (org_id, name, code)
      VALUES (r_org.id, 'Enterprise Delivery', 'ENT')
      RETURNING id INTO r_bu;
    END IF;

    res_ids := ARRAY[]::uuid[];
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Alex Morgan', 'alex.morgan@example.com', 'Senior BA', 'Analysis,Agile,Jira', 40, 95, 'Hybrid', 'Active')
    RETURNING id INTO rid; res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Jordan Lee', 'jordan.lee@example.com', 'Tech Lead', 'Architecture,Cloud,API', 40, 140, 'Hybrid', 'Active')
    RETURNING id INTO rid; res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Sam Rivera', 'sam.rivera@example.com', 'Delivery Manager', 'PMO,RAID,Stakeholder', 40, 120, 'Hybrid', 'Active')
    RETURNING id INTO rid; res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Taylor Kim', 'taylor.kim@example.com', 'Data Engineer', 'SQL,ETL,Python', 40, 125, 'Hybrid', 'Active')
    RETURNING id INTO rid; res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Casey Brooks', 'casey.brooks@example.com', 'QA Lead', 'Testing,Automation', 40, 100, 'Hybrid', 'Active')
    RETURNING id INTO rid; res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Riley Chen', 'riley.chen@example.com', 'UX Designer', 'Design,Research', 40, 105, 'Hybrid', 'Active')
    RETURNING id INTO rid; res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Morgan Patel', 'morgan.patel@example.com', 'Security Analyst', 'Security,Risk', 40, 115, 'Hybrid', 'Active')
    RETURNING id INTO rid; res_ids := array_append(res_ids, rid);
    INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
    VALUES (r_org.id, r_bu, 'Avery Nguyen', 'avery.nguyen@example.com', 'Finance Analyst', 'Finance,Benefits', 40, 90, 'Hybrid', 'Active')
    RETURNING id INTO rid; res_ids := array_append(res_ids, rid);

    FOR i IN 1..16 LOOP
      core_share := 0.58;
      alt_share := 0.42;

      brief_json := jsonb_build_object(
        'section1', jsonb_build_object(
          'portfolio_workstream', programs[i],
          'sponsor', sponsors[i],
          'business_owner', sponsors[i] || ' Business Owner',
          'business_solution_manager', 'Sam Rivera',
          'strategic_alignment', align[i],
          'background_context', 'Strategic initiative to deliver ' || names[i] || ' within the ' || programs[i] || ' program.',
          'opportunity_problem', 'Current capability gaps create cost, risk, and customer friction that this project addresses.',
          'objective_smart', 'Deliver ' || names[i] || ' by ' || lives[i]::text || ' within approved funding and realise target benefits.',
          'scope_in', 'Core delivery stream plus ' || alt_names[i] || ' stream; integrations, testing, cutover, and hypercare.',
          'scope_out', 'Unrelated BAU changes, third-party product roadmap items outside contracted scope.',
          'assumptions_constraints', 'Funding remains available across FY boundaries; key SMEs allocated at planned %.',
          'key_metrics_success', 'On-time go-live, FAC within +5%, benefits trajectory on plan, no critical open risks at handover.'
        ),
        'section2', jsonb_build_object(
          'approval_type', 'Full Business Case',
          'funding_ask', budgets[i]::text,
          'funding_source', 'Capex / Opex split per FY allocation',
          'resource_ask', 'Cross-functional squad + specialist surge for UAT/cutover',
          'estimate_commentary', 'Estimate based on analogous projects with contingency in FAC.',
          'pl_benefits_commentary', 'Benefits tracked in benefits register; realised vs target monitored monthly.',
          'delivery_milestones_variance', 'Stream lanes own milestone dates; project rollup shows envelope.',
          'project_risks', 'Capacity contention and upstream dependency slip are primary risks.',
          'dependencies', 'Platform / data / security dependencies managed via dependency register.'
        )
      );

      INSERT INTO public.projects (
        org_id, bu_id, project_code, name, program, sponsor, priority, status, rag,
        current_phase, delivery_method, streams_enabled,
        planned_start_date, planned_end_date, actual_start_date, actual_end_date,
        start_date, end_date, target_go_live,
        budget, capex_approved, capex_incurred, opex_approved, opex_incurred,
        forecast_at_completion, benefits_target, benefits_realised, roi_percent,
        baseline_budget, baseline_capex, baseline_opex, baseline_benefits,
        baseline_date, baseline_label,
        description, brief
      ) VALUES (
        r_org.id, r_bu, codes[i], names[i], programs[i], sponsors[i], priorities[i],
        statuses[i], rags[i], phases[i], methods[i], true,
        starts[i], ends[i],
        CASE WHEN statuses[i] = 'Not Started' THEN NULL ELSE starts[i] + 14 END,
        CASE WHEN statuses[i] = 'Completed' THEN ends[i] ELSE NULL END,
        starts[i], ends[i], lives[i],
        budgets[i], capex_a[i], capex_i[i], opex_a[i], opex_i[i],
        facs[i], ben_t[i], ben_r[i], rois[i],
        budgets[i], capex_a[i], opex_a[i], ben_t[i],
        starts[i] + 30, 'Baseline v1',
        'Sample portfolio project with Core + ' || alt_names[i] || ' streams for demo and training.',
        brief_json
      ) RETURNING id INTO p_id;

      -- Core created by AFTER INSERT trigger
      SELECT id INTO core_id
      FROM public.project_streams
      WHERE project_id = p_id AND is_default
      LIMIT 1;

      IF core_id IS NULL THEN
        core_id := public.ensure_project_core_stream(p_id);
      END IF;

      -- Update Core with share of finance / dates
      UPDATE public.project_streams SET
        name = 'Core',
        code = 'CORE',
        description = 'Primary delivery stream for ' || names[i],
        owner = 'Sam Rivera',
        status = statuses[i]::text,
        rag = rags[i]::text,
        planned_start_date = starts[i],
        planned_end_date = ends[i],
        actual_start_date = CASE WHEN statuses[i] = 'Not Started' THEN NULL ELSE starts[i] + 14 END,
        actual_end_date = CASE WHEN statuses[i] = 'Completed' THEN ends[i] ELSE NULL END,
        budget = round(budgets[i] * core_share, 2),
        capex_approved = round(capex_a[i] * core_share, 2),
        capex_incurred = round(capex_i[i] * core_share, 2),
        opex_approved = round(opex_a[i] * core_share, 2),
        opex_incurred = round(opex_i[i] * core_share, 2),
        forecast_at_completion = round(facs[i] * core_share, 2),
        notes = 'Always-on Core stream',
        updated_at = now()
      WHERE id = core_id;

      -- Second stream
      INSERT INTO public.project_streams (
        org_id, project_id, name, code, description, is_default, sort_order,
        status, rag, owner,
        planned_start_date, planned_end_date, actual_start_date, actual_end_date,
        budget, capex_approved, capex_incurred, opex_approved, opex_incurred,
        forecast_at_completion, notes
      ) VALUES (
        r_org.id, p_id, alt_names[i], alt_codes[i],
        alt_names[i] || ' workstream for ' || names[i],
        false, 1,
        statuses[i]::text,
        CASE WHEN rags[i] = 'Green' THEN 'Amber' WHEN rags[i] = 'Amber' THEN 'Green' ELSE 'Amber' END,
        'Jordan Lee',
        starts[i] + 21,
        ends[i] + CASE WHEN i % 2 = 0 THEN 14 ELSE 0 END,
        CASE WHEN statuses[i] = 'Not Started' THEN NULL ELSE starts[i] + 28 END,
        CASE WHEN statuses[i] = 'Completed' THEN ends[i] ELSE NULL END,
        round(budgets[i] * alt_share, 2),
        round(capex_a[i] * alt_share, 2),
        round(capex_i[i] * alt_share, 2),
        round(opex_a[i] * alt_share, 2),
        round(opex_i[i] * alt_share, 2),
        round(facs[i] * alt_share, 2),
        'Secondary delivery stream'
      )
      ON CONFLICT (project_id, name) DO UPDATE SET
        code = EXCLUDED.code,
        budget = EXCLUDED.budget,
        capex_approved = EXCLUDED.capex_approved,
        capex_incurred = EXCLUDED.capex_incurred,
        opex_approved = EXCLUDED.opex_approved,
        opex_incurred = EXCLUDED.opex_incurred,
        forecast_at_completion = EXCLUDED.forecast_at_completion,
        planned_start_date = EXCLUDED.planned_start_date,
        planned_end_date = EXCLUDED.planned_end_date,
        updated_at = now()
      RETURNING id INTO alt_id;

      stream_ids := ARRAY[core_id, alt_id];

      g_idx := array_position(gate_names, phases[i]);
      IF g_idx IS NULL THEN g_idx := 1; END IF;

      -- Per-stream gates, milestones, FY, monthly finance, allocations
      FOREACH sid IN ARRAY stream_ids LOOP
        IF sid = core_id THEN
          s_share := core_share;
          s_start := starts[i];
          s_end := ends[i];
        ELSE
          s_share := alt_share;
          s_start := starts[i] + 21;
          s_end := ends[i] + CASE WHEN i % 2 = 0 THEN 14 ELSE 0 END;
        END IF;

        s_budget := round(budgets[i] * s_share, 2);
        s_capex_a := round(capex_a[i] * s_share, 2);
        s_capex_i := round(capex_i[i] * s_share, 2);
        s_opex_a := round(opex_a[i] * s_share, 2);
        s_opex_i := round(opex_i[i] * s_share, 2);
        s_fac := round(facs[i] * s_share, 2);

        FOR j IN 1..array_length(gate_names, 1) LOOP
          IF j < g_idx THEN g_status := 'Approved';
          ELSIF j = g_idx THEN g_status := 'In Review';
          ELSE g_status := 'Pending';
          END IF;
          -- Alt stream slightly lags Core
          INSERT INTO public.stage_gates (
            org_id, project_id, stream_id, gate_name, planned_date, actual_date, status, approver, notes
          ) VALUES (
            r_org.id, p_id, sid, gate_names[j],
            s_start + ((j - 1) * 45) + CASE WHEN sid = alt_id THEN 7 ELSE 0 END,
            CASE WHEN g_status = 'Approved'
              THEN s_start + ((j - 1) * 45) + CASE WHEN sid = alt_id THEN 10 ELSE 3 END
              ELSE NULL END,
            g_status,
            sponsors[i],
            CASE WHEN sid = core_id THEN 'Core stream gate' ELSE alt_names[i] || ' stream gate' END
          );
        END LOOP;

        INSERT INTO public.milestones (
          org_id, project_id, stream_id, name, planned_date, actual_date, status, owner, notes
        ) VALUES
          (r_org.id, p_id, sid, 'Kick-off complete', s_start + 14,
           CASE WHEN statuses[i] = 'Not Started' THEN NULL ELSE s_start + 16 END,
           CASE WHEN statuses[i] = 'Not Started' THEN 'Planned' ELSE 'Complete' END,
           'Sam Rivera', 'Stream kick-off'),
          (r_org.id, p_id, sid, 'Design baseline', s_start + 90,
           CASE WHEN g_idx > 3 THEN s_start + 95 ELSE NULL END,
           CASE WHEN g_idx > 3 THEN 'Complete' WHEN g_idx = 3 THEN 'In Progress' ELSE 'Planned' END,
           'Riley Chen', NULL),
          (r_org.id, p_id, sid, 'UAT exit', s_end - 45, NULL,
           CASE WHEN g_idx >= 6 THEN 'In Progress' ELSE 'Planned' END,
           'Casey Brooks', NULL),
          (r_org.id, p_id, sid, 'Go-live', lives[i] + CASE WHEN sid = alt_id THEN 7 ELSE 0 END, NULL,
           CASE WHEN statuses[i] = 'Completed' THEN 'Complete' ELSE 'Planned' END,
           'Jordan Lee', 'Target go-live for stream');

        fy_a := 'FY' || to_char(
          CASE WHEN EXTRACT(MONTH FROM s_start) >= fy_start
            THEN make_date(EXTRACT(YEAR FROM s_start)::int + 1, 1, 1)
            ELSE make_date(EXTRACT(YEAR FROM s_start)::int, 1, 1)
          END, 'YY');
        fy_b := 'FY' || to_char(
          CASE WHEN EXTRACT(MONTH FROM s_end) >= fy_start
            THEN make_date(EXTRACT(YEAR FROM s_end)::int + 1, 1, 1)
            ELSE make_date(EXTRACT(YEAR FROM s_end)::int, 1, 1)
          END, 'YY');
        IF fy_a = fy_b THEN
          split_a := 1; split_b := 0;
        ELSE
          split_a := 0.55; split_b := 0.45;
        END IF;
        cap_split := CASE WHEN (s_capex_a + s_opex_a) > 0 THEN s_capex_a / (s_capex_a + s_opex_a) ELSE 1 END;
        opex_split := 1 - cap_split;

        INSERT INTO public.fy_allocations (
          org_id, project_id, stream_id, fy, budget, forecast, capex, opex, benefits
        ) VALUES (
          r_org.id, p_id, sid, fy_a,
          round(s_budget * split_a, 2),
          round(s_fac * split_a, 2),
          round(s_budget * split_a * cap_split, 2),
          round(s_budget * split_a * opex_split, 2),
          round(ben_t[i] * s_share * split_a, 2)
        );
        IF split_b > 0 THEN
          INSERT INTO public.fy_allocations (
            org_id, project_id, stream_id, fy, budget, forecast, capex, opex, benefits
          ) VALUES (
            r_org.id, p_id, sid, fy_b,
            round(s_budget * split_b, 2),
            round(s_fac * split_b, 2),
            round(s_budget * split_b * cap_split, 2),
            round(s_budget * split_b * opex_split, 2),
            round(ben_t[i] * s_share * split_b, 2)
          );
        END IF;

        j := 0;
        m := date_trunc('month', s_start)::date;
        WHILE m <= s_end AND j < 8 LOOP
          INSERT INTO public.financials_monthly (
            org_id, project_id, stream_id, period_month,
            capex_planned, capex_actual, capex_forecast,
            opex_planned, opex_actual, opex_forecast,
            benefits_planned, benefits_actual
          ) VALUES (
            r_org.id, p_id, sid, m,
            round(s_capex_a / 8.0, 2),
            round((s_capex_i / 8.0) * CASE WHEN m <= CURRENT_DATE THEN 1 ELSE 0 END, 2),
            round(s_capex_a / 8.0, 2),
            round(s_opex_a / 8.0, 2),
            round((s_opex_i / 8.0) * CASE WHEN m <= CURRENT_DATE THEN 1 ELSE 0 END, 2),
            round(s_opex_a / 8.0, 2),
            round((ben_t[i] * s_share) / 12.0, 2),
            round(((ben_r[i] * s_share) / 12.0) * CASE WHEN m <= CURRENT_DATE THEN 1 ELSE 0 END, 2)
          );
          m := (m + INTERVAL '1 month')::date;
          j := j + 1;
        END LOOP;

        FOR j IN 1..3 LOOP
          m := (date_trunc('month', CURRENT_DATE)::date - ((j - 1) * INTERVAL '1 month'))::date;
          r1 := 1 + ((i + j - 1) % array_length(res_ids, 1));
          r2 := 1 + ((i + j + 2) % array_length(res_ids, 1));
          IF r1 = r2 THEN r2 := 1 + (r1 % array_length(res_ids, 1)); END IF;
          INSERT INTO public.resource_allocations (
            org_id, project_id, stream_id, resource_id, period_month,
            allocation_percent, allocated_hours, role_on_project
          ) VALUES
            (r_org.id, p_id, sid, res_ids[r1], m, 25 + ((i + j) % 3) * 10, 40, CASE WHEN sid = core_id THEN 'Core Delivery' ELSE alt_names[i] END),
            (r_org.id, p_id, sid, res_ids[r2], m, 20 + (i % 4) * 5, 32, CASE WHEN sid = core_id THEN 'Core Support' ELSE alt_names[i] || ' Support' END)
          ON CONFLICT DO NOTHING;
        END LOOP;
      END LOOP;

      -- Project-level attributes
      b1 := round(ben_t[i] * 0.6, 2);
      b2 := ben_t[i] - b1;
      INSERT INTO public.benefits (
        org_id, project_id, title, benefit_type, target_value, realised_value,
        realisation_date, owner, status, notes
      ) VALUES
        (r_org.id, p_id, 'Primary value realisation', 'Financial', b1, round(ben_r[i] * 0.6, 2), lives[i], sponsors[i],
         CASE WHEN ben_r[i] > 0 THEN 'In Progress' ELSE 'Planned' END, 'Tracked in benefits register'),
        (r_org.id, p_id, 'Secondary / efficiency benefit', 'Efficiency', b2, ben_r[i] - round(ben_r[i] * 0.6, 2), lives[i], sponsors[i],
         CASE WHEN ben_r[i] > 0 THEN 'In Progress' ELSE 'Planned' END, NULL);

      INSERT INTO public.risks (
        org_id, project_id, title, description, category, probability, impact, severity, status, owner, mitigation, due_date
      ) VALUES
        (r_org.id, p_id, 'Delivery capacity constraint', 'Key skills contention across portfolio', 'Resource', 3, 4, 12, 'Open', 'Sam Rivera', 'Prioritise critical path; surge contractors', CURRENT_DATE + 30),
        (r_org.id, p_id, 'Dependency slippage', 'Upstream platform dependency may slip', 'Dependency', 4, 3, 12, 'Open', 'Jordan Lee', 'Weekly dependency forum; contingency design', CURRENT_DATE + 21),
        (r_org.id, p_id, 'Scope creep on ' || alt_names[i], 'Secondary stream requirements expanding', 'Scope', 2, 3, 6, 'Mitigating', 'Riley Chen', 'Change board; freeze after Design', CURRENT_DATE + 45);

      INSERT INTO public.issues (
        org_id, project_id, title, description, priority, status, owner, raised_date, target_date
      ) VALUES
        (r_org.id, p_id, 'Environment access delay', 'Non-prod access pending for ' || alt_names[i], 'Medium', 'Open', 'Jordan Lee', CURRENT_DATE - 7, CURRENT_DATE + 14),
        (r_org.id, p_id, 'Vendor response lag', 'Third-party awaiting security questionnaire', 'High', 'Open', 'Morgan Patel', CURRENT_DATE - 3, CURRENT_DATE + 10);

      INSERT INTO public.actions (
        org_id, project_id, title, description, owner, due_date, status, priority
      ) VALUES
        (r_org.id, p_id, 'Confirm FY funding drawdown', 'Validate drawdown against FY allocations', sponsors[i], CURRENT_DATE + 14, 'Open', 'Medium'),
        (r_org.id, p_id, 'Complete stream RAID review', 'Joint Core + ' || alt_names[i] || ' RAID workshop', 'Sam Rivera', CURRENT_DATE + 7, 'Open', 'High'),
        (r_org.id, p_id, 'Publish status pack', 'Monthly status for steering', 'Sam Rivera', CURRENT_DATE + 3, 'In Progress', 'Medium');

      INSERT INTO public.decisions (
        org_id, project_id, title, description, decision_date, decided_by, rationale, impact, status
      ) VALUES
        (r_org.id, p_id, 'Adopt dual-stream delivery', 'Core + ' || alt_names[i] || ' streams approved', starts[i] + 20, sponsors[i],
         'Clear ownership of dates, gates and finance per stream', 'Enables rollup timelines and PvA by stream', 'Approved'),
        (r_org.id, p_id, 'Hybrid delivery method', 'Confirm ' || methods[i]::text || ' approach', starts[i] + 30, 'Sam Rivera',
         'Aligns cadence with dependencies', 'Sprint + stage-gate hybrid where needed', 'Approved');

      INSERT INTO public.stakeholders (
        org_id, project_id, name, role, email, influence, interest, engagement_strategy
      ) VALUES
        (r_org.id, p_id, sponsors[i], 'Executive Sponsor', lower(sponsors[i]) || '@example.com', 'High', 'High', 'Monthly steering'),
        (r_org.id, p_id, 'Sam Rivera', 'Delivery Manager', 'sam.rivera@example.com', 'High', 'High', 'Weekly stand-up + RAID'),
        (r_org.id, p_id, 'Business Owner', 'Business Owner', 'owner@example.com', 'Medium', 'High', 'Sprint reviews / demos');

      INSERT INTO public.status_updates (
        org_id, project_id, update_date, reporter, overall_rag, schedule_rag, cost_rag, scope_rag,
        progress_summary, achievements, next_steps, blockers
      ) VALUES
        (r_org.id, p_id, CURRENT_DATE - 7, 'Sam Rivera', rags[i], rags[i],
         'Green'::public.project_rag, 'Green'::public.project_rag,
         names[i] || ' progressing across Core and ' || alt_names[i] || ' streams.',
         'Gates advanced; monthly actuals posted; allocations confirmed.',
         'Close open issues; prepare next stage gate pack.',
         CASE WHEN rags[i] = 'Red' THEN 'Network vendor delay impacting critical path.' WHEN rags[i] = 'Amber' THEN 'Capacity pressure on specialist roles.' ELSE NULL END),
        (r_org.id, p_id, CURRENT_DATE, 'Sam Rivera', rags[i],
         rags[i],
         CASE WHEN facs[i] > budgets[i] THEN 'Amber'::public.project_rag ELSE 'Green'::public.project_rag END,
         'Green'::public.project_rag,
         'Current period status for steering pack.',
         'UAT planning started where applicable; benefits tracking updated.',
         'Stream milestone review; dependency forum.',
         NULL);

      INSERT INTO public.documents (
        org_id, project_id, name, doc_type, url, version, owner, uploaded_date
      ) VALUES
        (r_org.id, p_id, 'Business Case', 'Business Case', 'https://example.com/docs/' || codes[i] || '/business-case', '1.0', sponsors[i], starts[i] + 10),
        (r_org.id, p_id, 'Project Charter', 'Charter', 'https://example.com/docs/' || codes[i] || '/charter', '1.1', 'Sam Rivera', starts[i] + 20),
        (r_org.id, p_id, 'Latest Status Report', 'Status Report', 'https://example.com/docs/' || codes[i] || '/status', 'current', 'Sam Rivera', CURRENT_DATE);

      INSERT INTO public.lessons_learned (
        org_id, project_id, category, what_happened, root_cause, recommendation, captured_by, captured_date
      ) VALUES
        (r_org.id, p_id, 'Delivery', 'Stream ownership clarified mid-flight improved reporting',
         'Initial single-lane plan hid secondary stream risk',
         'Enable dual streams at project setup with Core always on',
         'Sam Rivera', CURRENT_DATE - 14);

      INSERT INTO public.change_requests (
        org_id, project_id, cr_number, title, description, change_type,
        impact_scope, impact_schedule_days, impact_cost, status, raised_by, raised_date, decision_date, approver
      ) VALUES
        (r_org.id, p_id, codes[i] || '-CR01', 'Add ' || alt_names[i] || ' integration scope',
         'Expand secondary stream integration envelope', 'Scope',
         'Secondary stream APIs + test packs', 14, round(budgets[i] * 0.03, 2),
         CASE WHEN i % 3 = 0 THEN 'Approved' ELSE 'Submitted' END,
         'Jordan Lee', CURRENT_DATE - 20,
         CASE WHEN i % 3 = 0 THEN CURRENT_DATE - 10 ELSE NULL END,
         sponsors[i]);

      -- Sprints (Agile / Hybrid)
      IF methods[i] IN ('Agile', 'Hybrid') THEN
        FOR j IN 1..3 LOOP
          INSERT INTO public.sprints (
            org_id, project_id, sprint_number, name, start_date, end_date,
            planned_points, completed_points, committed_stories, completed_stories, status, notes
          ) VALUES (
            r_org.id, p_id, j, 'Sprint ' || j,
            CURRENT_DATE - ((4 - j) * 14), CURRENT_DATE - ((4 - j) * 14) + 13,
            40 + j * 5, CASE WHEN j < 3 THEN 35 + j * 5 ELSE 10 END,
            12, CASE WHEN j < 3 THEN 10 ELSE 3 END,
            CASE WHEN j < 3 THEN 'Closed' ELSE 'Active' END,
            'Stream-aware delivery cadence'
          ) RETURNING id INTO sprint_id;
        END LOOP;
      END IF;

      SELECT id INTO ms_id FROM public.milestones WHERE project_id = p_id AND stream_id = core_id ORDER BY planned_date LIMIT 1;

      INSERT INTO public.work_items (
        org_id, project_id, wbs_code, title, description, status, priority, owner,
        percent_complete, planned_start, planned_end, estimate_hours, actual_hours, milestone_id, sort_order
      ) VALUES
        (r_org.id, p_id, '1.0', 'Core discovery pack', 'Discovery artefacts for Core stream', 'Done', 'High', 'Alex Morgan', 100, starts[i], starts[i] + 30, 80, 76, ms_id, 1),
        (r_org.id, p_id, '2.0', alt_names[i] || ' build backlog', 'Backlog refinement for secondary stream', 'In Progress', 'High', 'Jordan Lee', 45, starts[i] + 21, ends[i] - 60, 200, 90, NULL, 2),
        (r_org.id, p_id, '3.0', 'UAT preparation', 'Cross-stream UAT scripts and data', 'To Do', 'Medium', 'Casey Brooks', 10, ends[i] - 60, ends[i] - 30, 120, 8, NULL, 3);

      IF i > 1 THEN
        SELECT id INTO prev_p FROM public.projects
        WHERE org_id = r_org.id AND project_code = codes[i - 1] LIMIT 1;
        INSERT INTO public.dependencies (
          org_id, project_id, depends_on_project_id, title, description, dep_type, status, owner, needed_by
        ) VALUES (
          r_org.id, p_id, prev_p,
          'Depends on ' || codes[i - 1],
          'Needs platform outputs / learnings from predecessor project',
          'Internal', 'Open', 'Jordan Lee', starts[i] + 60
        );
      END IF;

      INSERT INTO public.dependencies (
        org_id, project_id, title, description, dep_type, status, owner, needed_by
      ) VALUES (
        r_org.id, p_id, 'External vendor security clearance',
        'Vendor must clear security review before production cutover',
        'External', 'Open', 'Morgan Patel', lives[i] - 30
      );

      PERFORM public.rollup_project_from_streams(p_id);
    END LOOP;

    -- Demand pipeline
    INSERT INTO public.demand_pipeline (
      org_id, bu_id, idea_name, sponsor, description, status,
      estimated_cost, estimated_benefit, estimated_roi, strategic_alignment, complexity
    ) VALUES
      (r_org.id, r_bu, 'Loyalty wallet concept', 'CDO', 'Early demand idea for wallet-led loyalty', 'Idea', 800000, 1200000, 45, 3, 2),
      (r_org.id, r_bu, 'Branch digital kiosk', 'COO', 'Under assessment for branch experience', 'Assessment', 1200000, 1600000, 30, 4, 3),
      (r_org.id, r_bu, 'Realtime fraud signals', 'CISO', 'Streaming fraud features for payments', 'Business Case', 2100000, 3800000, 55, 5, 4);

    -- Portfolio scenario
    INSERT INTO public.portfolio_scenarios (org_id, name, description, budget_cap, config)
    VALUES (
      r_org.id, 'FY balanced portfolio', 'What-if: keep P1/P2 and defer low priority',
      35000000, '{"theme":"balanced","include_amber":true}'::jsonb
    ) RETURNING id INTO scen_id;

    INSERT INTO public.scenario_projects (
      org_id, scenario_id, project_id, included, adjusted_budget, adjusted_start, adjusted_end, priority_score
    )
    SELECT
      r_org.id, scen_id, p.id, (p.priority LIKE 'P1%' OR p.priority LIKE 'P2%'),
      p.budget, p.planned_start_date, p.planned_end_date,
      CASE
        WHEN p.priority LIKE 'P1%' THEN 95
        WHEN p.priority LIKE 'P2%' THEN 80
        WHEN p.priority LIKE 'P3%' THEN 60
        ELSE 40
      END
    FROM public.projects p
    WHERE p.org_id = r_org.id;
  END LOOP;
END $$;

COMMIT;

-- Optional verification:
-- SELECT o.name, count(p.*) projects FROM organizations o LEFT JOIN projects p ON p.org_id = o.id GROUP BY 1;
-- SELECT p.project_code, s.name, s.code, s.is_default, s.budget
--   FROM projects p JOIN project_streams s ON s.project_id = p.id ORDER BY 1, s.sort_order;
-- SELECT count(*) gates FROM stage_gates;
-- SELECT count(*) milestones FROM milestones;
-- SELECT count(*) fy FROM fy_allocations;
-- SELECT count(*) monthly FROM financials_monthly;
-- SELECT count(*) alloc FROM resource_allocations;
