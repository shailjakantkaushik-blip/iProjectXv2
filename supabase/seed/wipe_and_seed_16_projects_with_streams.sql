-- =========================================================================
-- iProjectX — Wipe operational data + seed 16 projects WITH streams
-- Paste into Supabase SQL Editor and run once (full application demo data).
--
-- KEEPS
--   organizations, profiles, user_roles, business_units,
--   organisation billing / landing / invoice template config,
--   billing_plans, stage_gate_definitions, governance_channels
--
-- DELETES (then reseeds)
--   timesheets / timesheet_entries / timesheet_approvals / work_item_assignees,
--   timesheet-related notifications,
--   projects (+ cascaded children incl. project_streams + stage_gates),
--   resources, resource_allocations, demand_pipeline,
--   portfolio_scenarios / scenario_projects,
--   financials_monthly, fy_allocations, benefits leftovers,
--   work_items, audit_log / audit_events, project_purge_notices
--
-- SEEDS (per organisation) — completely full demo
--   Demo assignments prefer these org profiles by lower(email):
--     Kamini Sharma <kaaminisharma1994@gmail.com>
--     Shailja Kant Kaushik <shailja.kant.kaushik@gmail.com>
--   Resources synced from existing org profiles (same person as login),
--   16 projects (always-on Core + second stream),
--   9 stage gates PER STREAM (with planned/actual dates + status),
--   milestones synced to gates (+ add-on stream milestones),
--   FY + monthly finance per stream (full schedule; planned=FY budget, forecast=FAC),
--   resource allocations,
--   benefits, risks, issues, actions, decisions (linked to stage gates),
--   stakeholders, status updates, documents, lessons, change requests,
--   sprints, work items with stage_gate_id + resource assignees,
--   dependencies, demand pipeline, portfolio scenario,
--   project.brief + baselines,
--   sample timesheets (draft / pending / approved / rejected) with
--   billable work-item rows + non-billable custom tasks
--
-- Expected counts per org:
--   16 projects, 32 streams, 288 stage gates (16×2×9),
--   work items with stage_gate_id set
--
-- Requires: always-on Core streams + timesheet / work-item stage_gate migrations.
-- =========================================================================

BEGIN;

-- ---------- A) Schema patches (idempotent) ----------
ALTER TABLE public.fy_allocations
  ADD COLUMN IF NOT EXISTS budget NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast NUMERIC(14,2) DEFAULT 0;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS forecast_at_completion NUMERIC(14,2) DEFAULT 0;

ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL;

ALTER TABLE public.timesheet_entries
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL;

ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_labor_actual NUMERIC(14,2) DEFAULT 0;

-- ---------- B) Wipe operational / project data ----------
-- Timesheets first (FKs to projects / work items / resources / users)
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

-- Explicit child clears (in case cascade / orphans)
DO $wipe_gates$
BEGIN
  DELETE FROM public.stage_gates;
  DELETE FROM public.milestones;
  DELETE FROM public.project_streams;
EXCEPTION WHEN undefined_table THEN NULL;
END
$wipe_gates$;

-- Cascades remaining: risks, issues, actions, decisions, dependencies,
-- change_requests, sprints, stakeholders, etc.
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
  sponsor_titles text[] := ARRAY[
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
  months_total int;
  months_past int;
  months_fy_a int;
  months_fy_b int;
  fy_label text;
  fy_a_bud numeric;
  fy_a_fcst numeric;
  fy_b_bud numeric;
  fy_b_fcst numeric;
  sum_cap_p_a numeric;
  sum_opex_p_a numeric;
  sum_cap_f_a numeric;
  sum_opex_f_a numeric;
  sum_cap_p_b numeric;
  sum_opex_p_b numeric;
  sum_cap_f_b numeric;
  sum_opex_f_b numeric;
  sum_cap_act numeric;
  sum_opex_act numeric;
  sum_ben_p numeric;
  sum_ben_act numeric;
  i_a int;
  i_b int;
  i_past int;
  i_all int;
  cap_p numeric;
  opex_p numeric;
  cap_f numeric;
  opex_f numeric;
  cap_act numeric;
  opex_act numeric;
  ben_p numeric;
  ben_act numeric;
  brief_json jsonb;
  prev_p uuid;
  target_emails text[] := ARRAY[
    'kaaminisharma1994@gmail.com',
    'shailja.kant.kaushik@gmail.com'
  ];
  target_names text[] := ARRAY[
    'Kamini Sharma',
    'Shailja Kant Kaushik'
  ];
  seed_user_ids uuid[] := ARRAY[]::uuid[];
  seed_person_names text[] := ARRAY[]::text[];
  seed_person_emails text[] := ARRAY[]::text[];
  n_people int;
  primary_person_name text;
  secondary_person_name text;
  sponsor_name text;
  sponsor_email text;
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
    seed_user_ids := ARRAY[]::uuid[];
    seed_person_names := ARRAY[]::text[];
    seed_person_emails := ARRAY[]::text[];

    -- Resolve the two named demo members first, matched case-insensitively by email.
    SELECT
      COALESCE(array_agg(x.id ORDER BY x.sort_order), ARRAY[]::uuid[]),
      COALESCE(array_agg(x.person_name ORDER BY x.sort_order), ARRAY[]::text[]),
      COALESCE(array_agg(x.email ORDER BY x.sort_order), ARRAY[]::text[])
    INTO seed_user_ids, seed_person_names, seed_person_emails
    FROM (
      SELECT
        p.id,
        CASE lower(p.email)
          WHEN target_emails[1] THEN target_names[1]
          WHEN target_emails[2] THEN target_names[2]
          ELSE COALESCE(NULLIF(trim(p.full_name), ''), p.email)
        END AS person_name,
        lower(p.email) AS email,
        array_position(target_emails, lower(p.email)) AS sort_order
      FROM public.profiles p
      WHERE p.org_id = r_org.id
        AND lower(p.email) = ANY(target_emails)
    ) x;

    IF COALESCE(array_length(seed_user_ids, 1), 0) = 0 THEN
      RAISE NOTICE 'Org % has neither Kamini/Shailja target profile; falling back to up to two org profiles', r_org.id;

      SELECT
        COALESCE(array_agg(x.id ORDER BY x.sort_order), ARRAY[]::uuid[]),
        COALESCE(array_agg(x.person_name ORDER BY x.sort_order), ARRAY[]::text[]),
        COALESCE(array_agg(x.email ORDER BY x.sort_order), ARRAY[]::text[])
      INTO seed_user_ids, seed_person_names, seed_person_emails
      FROM (
        SELECT
          p.id,
          COALESCE(NULLIF(trim(p.full_name), ''), p.email) AS person_name,
          lower(p.email) AS email,
          row_number() OVER (ORDER BY COALESCE(p.full_name, p.email, p.id::text)) AS sort_order
        FROM public.profiles p
        WHERE p.org_id = r_org.id
        ORDER BY COALESCE(p.full_name, p.email, p.id::text)
        LIMIT 2
      ) x;
    END IF;

    n_people := COALESCE(array_length(seed_person_names, 1), 0);
    IF n_people = 0 THEN
      RAISE NOTICE 'Org % has no profiles; using canonical demo names for text fields and skipping resource-dependent rows', r_org.id;
      seed_person_names := target_names;
      seed_person_emails := target_emails;
      n_people := 2;
    END IF;

    -- Resources = selected org members (same person as login). No fictional sample people.
    BEGIN
      PERFORM public.sync_org_resources_from_profiles(r_org.id);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'sync_org_resources_from_profiles missing — continuing without auto-sync';
    END;

    UPDATE public.resources r
    SET
      name = seed_person_names[array_position(seed_user_ids, r.user_id)],
      email = seed_person_emails[array_position(seed_user_ids, r.user_id)],
      capacity_hours_week = 40,
      status = 'Active'
    WHERE r.org_id = r_org.id
      AND r.user_id = ANY(seed_user_ids);

    SELECT COALESCE(array_agg(r.id ORDER BY array_position(seed_user_ids, r.user_id)), ARRAY[]::uuid[])
    INTO res_ids
    FROM public.resources r
    WHERE r.org_id = r_org.id
      AND r.user_id = ANY(seed_user_ids);

    -- If org has no selected logins/resources yet, skip resource-dependent seed rows gracefully.
    IF COALESCE(array_length(res_ids, 1), 0) = 0 THEN
      RAISE NOTICE 'Org % has no selected profiles/resources — seeding projects without allocations/timesheets', r_org.id;
    END IF;

    FOR i IN 1..16 LOOP
      core_share := 0.58;
      alt_share := 0.42;
      primary_person_name := seed_person_names[1];
      secondary_person_name := seed_person_names[LEAST(2, n_people)];
      sponsor_name := seed_person_names[((i - 1) % n_people) + 1];
      sponsor_email := seed_person_emails[((i - 1) % n_people) + 1];

      brief_json := jsonb_build_object(
        'section1', jsonb_build_object(
          'portfolio_workstream', programs[i],
          'sponsor', sponsor_name,
          'sponsor_title', sponsor_titles[i],
          'business_owner', sponsor_name,
          'business_solution_manager', secondary_person_name,
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
        org_id, bu_id, project_code, name, portfolio, program, sponsor, priority, status, rag,
        current_phase, delivery_method, streams_enabled,
        planned_start_date, planned_end_date, actual_start_date, actual_end_date,
        start_date, end_date, target_go_live,
        budget, capex_approved, capex_incurred, opex_approved, opex_incurred,
        forecast_at_completion, benefits_target, benefits_realised, roi_percent,
        baseline_budget, baseline_capex, baseline_opex, baseline_benefits,
        baseline_date, baseline_label,
        description, brief
      ) VALUES (
        r_org.id, r_bu, codes[i], names[i],
        (ARRAY['Business Strategic','IT Strategic','CAPEX','Unfunded'])[((i - 1) % 4) + 1],
        programs[i], sponsor_name, priorities[i],
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
        owner = primary_person_name,
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
        secondary_person_name,
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
          -- Spread 9 gates evenly across the stream schedule window
          INSERT INTO public.stage_gates (
            org_id, project_id, stream_id, gate_name, planned_date, actual_date, status, approver, notes
          ) VALUES (
            r_org.id, p_id, sid, gate_names[j],
            (s_start + ((s_end - s_start) * (j - 1) / GREATEST(array_length(gate_names, 1) - 1, 1)))::date
              + CASE WHEN sid = alt_id THEN 7 ELSE 0 END,
            CASE WHEN g_status = 'Approved'
              THEN (s_start + ((s_end - s_start) * (j - 1) / GREATEST(array_length(gate_names, 1) - 1, 1)))::date
                + CASE WHEN sid = alt_id THEN 10 ELSE 3 END
              ELSE NULL END,
            g_status,
            CASE WHEN sid = core_id THEN primary_person_name ELSE secondary_person_name END,
            CASE WHEN sid = core_id THEN 'Core stream gate' ELSE alt_names[i] || ' stream gate' END
          );
        END LOOP;

        -- Auto-synced milestones from gates inherit stream_id (trigger may omit it)
        UPDATE public.milestones m
        SET stream_id = g.stream_id
        FROM public.stage_gates g
        WHERE m.stage_gate_id = g.id
          AND g.project_id = p_id
          AND g.stream_id = sid
          AND (m.stream_id IS DISTINCT FROM g.stream_id);

        INSERT INTO public.milestones (
          org_id, project_id, stream_id, name, planned_date, actual_date, status, owner, notes
        ) VALUES
          (r_org.id, p_id, sid, 'Kick-off complete', s_start + 14,
           CASE WHEN statuses[i] = 'Not Started' THEN NULL ELSE s_start + 16 END,
           CASE WHEN statuses[i] = 'Not Started' THEN 'Planned' ELSE 'Complete' END,
           CASE WHEN sid = core_id THEN primary_person_name ELSE secondary_person_name END, 'Stream kick-off'),
          (r_org.id, p_id, sid, 'Design baseline', s_start + 90,
           CASE WHEN g_idx > 3 THEN s_start + 95 ELSE NULL END,
           CASE WHEN g_idx > 3 THEN 'Complete' WHEN g_idx = 3 THEN 'In Progress' ELSE 'Planned' END,
           secondary_person_name, NULL),
          (r_org.id, p_id, sid, 'UAT exit', s_end - 45, NULL,
           CASE WHEN g_idx >= 6 THEN 'In Progress' ELSE 'Planned' END,
           primary_person_name, NULL),
          (r_org.id, p_id, sid, 'Go-live', lives[i] + CASE WHEN sid = alt_id THEN 7 ELSE 0 END, NULL,
           CASE WHEN statuses[i] = 'Completed' THEN 'Complete' ELSE 'Planned' END,
           CASE WHEN sid = core_id THEN primary_person_name ELSE secondary_person_name END, 'Target go-live for stream');

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
        -- Full-schedule monthly cashflow aligned to FY allocations (not first-8 /8).
        -- Planned ↔ FY budget, Forecast ↔ FAC, Actual ↔ stream incurred on past months.
        months_total := 0;
        months_past := 0;
        months_fy_a := 0;
        months_fy_b := 0;
        WHILE m <= date_trunc('month', s_end)::date LOOP
          months_total := months_total + 1;
          IF m <= date_trunc('month', CURRENT_DATE)::date THEN
            months_past := months_past + 1;
          END IF;
          fy_label := 'FY' || to_char(
            CASE WHEN EXTRACT(MONTH FROM m) >= fy_start
              THEN make_date(EXTRACT(YEAR FROM m)::int + 1, 1, 1)
              ELSE make_date(EXTRACT(YEAR FROM m)::int, 1, 1)
            END, 'YY');
          IF fy_label = fy_a THEN
            months_fy_a := months_fy_a + 1;
          ELSIF fy_label = fy_b THEN
            months_fy_b := months_fy_b + 1;
          END IF;
          m := (m + INTERVAL '1 month')::date;
        END LOOP;

        IF months_total < 1 THEN
          months_total := 1;
        END IF;
        IF months_fy_a < 1 AND split_a > 0 THEN
          months_fy_a := 1;
        END IF;
        IF months_fy_b < 1 AND split_b > 0 THEN
          months_fy_b := 1;
        END IF;

        fy_a_bud := round(s_budget * split_a, 2);
        fy_a_fcst := round(s_fac * split_a, 2);
        fy_b_bud := round(s_budget * split_b, 2);
        fy_b_fcst := round(s_fac * split_b, 2);

        sum_cap_p_a := 0; sum_opex_p_a := 0; sum_cap_f_a := 0; sum_opex_f_a := 0;
        sum_cap_p_b := 0; sum_opex_p_b := 0; sum_cap_f_b := 0; sum_opex_f_b := 0;
        sum_cap_act := 0; sum_opex_act := 0; sum_ben_p := 0; sum_ben_act := 0;
        i_a := 0; i_b := 0; i_past := 0; i_all := 0;

        m := date_trunc('month', s_start)::date;
        WHILE m <= date_trunc('month', s_end)::date LOOP
          i_all := i_all + 1;
          fy_label := 'FY' || to_char(
            CASE WHEN EXTRACT(MONTH FROM m) >= fy_start
              THEN make_date(EXTRACT(YEAR FROM m)::int + 1, 1, 1)
              ELSE make_date(EXTRACT(YEAR FROM m)::int, 1, 1)
            END, 'YY');

          IF fy_label = fy_a AND months_fy_a > 0 THEN
            i_a := i_a + 1;
            IF i_a = months_fy_a THEN
              cap_p := round(fy_a_bud * cap_split, 2) - sum_cap_p_a;
              opex_p := round(fy_a_bud * opex_split, 2) - sum_opex_p_a;
              cap_f := round(fy_a_fcst * cap_split, 2) - sum_cap_f_a;
              opex_f := round(fy_a_fcst * opex_split, 2) - sum_opex_f_a;
            ELSE
              cap_p := round(fy_a_bud * cap_split / months_fy_a, 2);
              opex_p := round(fy_a_bud * opex_split / months_fy_a, 2);
              cap_f := round(fy_a_fcst * cap_split / months_fy_a, 2);
              opex_f := round(fy_a_fcst * opex_split / months_fy_a, 2);
              sum_cap_p_a := sum_cap_p_a + cap_p;
              sum_opex_p_a := sum_opex_p_a + opex_p;
              sum_cap_f_a := sum_cap_f_a + cap_f;
              sum_opex_f_a := sum_opex_f_a + opex_f;
            END IF;
          ELSIF fy_label = fy_b AND months_fy_b > 0 THEN
            i_b := i_b + 1;
            IF i_b = months_fy_b THEN
              cap_p := round(fy_b_bud * cap_split, 2) - sum_cap_p_b;
              opex_p := round(fy_b_bud * opex_split, 2) - sum_opex_p_b;
              cap_f := round(fy_b_fcst * cap_split, 2) - sum_cap_f_b;
              opex_f := round(fy_b_fcst * opex_split, 2) - sum_opex_f_b;
            ELSE
              cap_p := round(fy_b_bud * cap_split / months_fy_b, 2);
              opex_p := round(fy_b_bud * opex_split / months_fy_b, 2);
              cap_f := round(fy_b_fcst * cap_split / months_fy_b, 2);
              opex_f := round(fy_b_fcst * opex_split / months_fy_b, 2);
              sum_cap_p_b := sum_cap_p_b + cap_p;
              sum_opex_p_b := sum_opex_p_b + opex_p;
              sum_cap_f_b := sum_cap_f_b + cap_f;
              sum_opex_f_b := sum_opex_f_b + opex_f;
            END IF;
          ELSE
            -- Month outside the two FY buckets — leave plan/forecast at 0
            cap_p := 0; opex_p := 0; cap_f := 0; opex_f := 0;
          END IF;

          IF m <= date_trunc('month', CURRENT_DATE)::date AND months_past > 0 THEN
            i_past := i_past + 1;
            IF i_past = months_past THEN
              cap_act := round(s_capex_i, 2) - sum_cap_act;
              opex_act := round(s_opex_i, 2) - sum_opex_act;
            ELSE
              cap_act := round(s_capex_i / months_past, 2);
              opex_act := round(s_opex_i / months_past, 2);
              sum_cap_act := sum_cap_act + cap_act;
              sum_opex_act := sum_opex_act + opex_act;
            END IF;
          ELSE
            cap_act := 0;
            opex_act := 0;
          END IF;

          IF i_all = months_total THEN
            ben_p := round(ben_t[i] * s_share, 2) - sum_ben_p;
          ELSE
            ben_p := round((ben_t[i] * s_share) / months_total, 2);
            sum_ben_p := sum_ben_p + ben_p;
          END IF;

          IF m <= date_trunc('month', CURRENT_DATE)::date AND months_past > 0 THEN
            IF i_past = months_past THEN
              ben_act := round(ben_r[i] * s_share, 2) - sum_ben_act;
            ELSE
              ben_act := round((ben_r[i] * s_share) / months_past, 2);
              sum_ben_act := sum_ben_act + ben_act;
            END IF;
          ELSE
            ben_act := 0;
          END IF;

          INSERT INTO public.financials_monthly (
            org_id, project_id, stream_id, period_month,
            capex_planned, capex_actual, capex_forecast,
            opex_planned, opex_actual, opex_forecast,
            benefits_planned, benefits_actual
          ) VALUES (
            r_org.id, p_id, sid, m,
            cap_p, cap_act, cap_f,
            opex_p, opex_act, opex_f,
            ben_p, ben_act
          );
          m := (m + INTERVAL '1 month')::date;
        END LOOP;

        IF coalesce(array_length(res_ids, 1), 0) > 0 THEN
          FOR j IN 1..3 LOOP
            m := (date_trunc('month', CURRENT_DATE)::date - ((j - 1) * INTERVAL '1 month'))::date;
            r1 := 1 + ((i + j - 1) % array_length(res_ids, 1));
            IF array_length(res_ids, 1) = 1 THEN
              INSERT INTO public.resource_allocations (
                org_id, project_id, stream_id, resource_id, period_month,
                allocation_percent, allocated_hours, role_on_project
              ) VALUES (
                r_org.id, p_id, sid, res_ids[r1], m,
                35 + ((i + j) % 3) * 10, 40,
                CASE WHEN sid = core_id THEN 'Core Delivery' ELSE alt_names[i] END
              )
              ON CONFLICT DO NOTHING;
            ELSE
              r2 := 1 + ((i + j + 2) % array_length(res_ids, 1));
              IF r1 = r2 THEN r2 := 1 + (r1 % array_length(res_ids, 1)); END IF;
              INSERT INTO public.resource_allocations (
                org_id, project_id, stream_id, resource_id, period_month,
                allocation_percent, allocated_hours, role_on_project
              ) VALUES
                (r_org.id, p_id, sid, res_ids[r1], m, 25 + ((i + j) % 3) * 10, 40, CASE WHEN sid = core_id THEN 'Core Delivery' ELSE alt_names[i] END),
                (r_org.id, p_id, sid, res_ids[r2], m, 20 + (i % 4) * 5, 32, CASE WHEN sid = core_id THEN 'Core Support' ELSE alt_names[i] || ' Support' END)
              ON CONFLICT DO NOTHING;
            END IF;
          END LOOP;
        END IF;
      END LOOP;

      -- Project-level attributes
      b1 := round(ben_t[i] * 0.6, 2);
      b2 := ben_t[i] - b1;
      INSERT INTO public.benefits (
        org_id, project_id, title, benefit_type, target_value, realised_value,
        realisation_date, owner, status, notes
      ) VALUES
        (r_org.id, p_id, 'Primary value realisation', 'Financial', b1, round(ben_r[i] * 0.6, 2), lives[i], sponsor_name,
         CASE WHEN ben_r[i] > 0 THEN 'In Progress' ELSE 'Planned' END, 'Tracked in benefits register'),
        (r_org.id, p_id, 'Secondary / efficiency benefit', 'Efficiency', b2, ben_r[i] - round(ben_r[i] * 0.6, 2), lives[i], sponsor_name,
         CASE WHEN ben_r[i] > 0 THEN 'In Progress' ELSE 'Planned' END, NULL);

      INSERT INTO public.risks (
        org_id, project_id, title, description, category, probability, impact, severity, status, owner, mitigation, due_date
      ) VALUES
        (r_org.id, p_id, 'Delivery capacity constraint', 'Key skills contention across portfolio', 'Resource', 3, 4, 12, 'Open', primary_person_name, 'Prioritise critical path; surge contractors', CURRENT_DATE + 30),
        (r_org.id, p_id, 'Dependency slippage', 'Upstream platform dependency may slip', 'Dependency', 4, 3, 12, 'Open', secondary_person_name, 'Weekly dependency forum; contingency design', CURRENT_DATE + 21),
        (r_org.id, p_id, 'Scope creep on ' || alt_names[i], 'Secondary stream requirements expanding', 'Scope', 2, 3, 6, 'Mitigating', sponsor_name, 'Change board; freeze after Design', CURRENT_DATE + 45);

      INSERT INTO public.issues (
        org_id, project_id, title, description, priority, status, owner, raised_date, target_date
      ) VALUES
        (r_org.id, p_id, 'Environment access delay', 'Non-prod access pending for ' || alt_names[i], 'Medium', 'Open', secondary_person_name, CURRENT_DATE - 7, CURRENT_DATE + 14),
        (r_org.id, p_id, 'Vendor response lag', 'Third-party awaiting security questionnaire', 'High', 'Open', primary_person_name, CURRENT_DATE - 3, CURRENT_DATE + 10);

      INSERT INTO public.actions (
        org_id, project_id, title, description, owner, due_date, status, priority
      ) VALUES
        (r_org.id, p_id, 'Confirm FY funding drawdown', 'Validate drawdown against FY allocations', sponsor_name, CURRENT_DATE + 14, 'Open', 'Medium'),
        (r_org.id, p_id, 'Complete stream RAID review', 'Joint Core + ' || alt_names[i] || ' RAID workshop', primary_person_name, CURRENT_DATE + 7, 'Open', 'High'),
        (r_org.id, p_id, 'Publish status pack', 'Monthly status for steering', secondary_person_name, CURRENT_DATE + 3, 'In Progress', 'Medium');

      INSERT INTO public.decisions (
        org_id, project_id, stage_gate_id, title, description, decision_date, decided_by, rationale, impact, status
      )
      SELECT
        r_org.id, p_id,
        (SELECT sg.id FROM public.stage_gates sg
         WHERE sg.project_id = p_id AND sg.stream_id = core_id AND sg.status = 'In Review'
         ORDER BY sg.planned_date LIMIT 1),
        'Adopt dual-stream delivery',
        'Core + ' || alt_names[i] || ' streams approved',
        starts[i] + 20, sponsor_name,
        'Clear ownership of dates, gates and finance per stream',
        'Enables rollup timelines and PvA by stream',
        'Approved'
      UNION ALL
      SELECT
        r_org.id, p_id,
        (SELECT sg.id FROM public.stage_gates sg
         WHERE sg.project_id = p_id AND sg.stream_id = core_id
           AND sg.gate_name = 'Business Case / Full Funding'
         ORDER BY sg.planned_date LIMIT 1),
        'Hybrid delivery method',
        'Confirm ' || methods[i]::text || ' approach',
        starts[i] + 30, primary_person_name,
        'Aligns cadence with dependencies',
        'Sprint + stage-gate hybrid where needed',
        'Approved';

      INSERT INTO public.stakeholders (
        org_id, project_id, name, role, email, influence, interest, engagement_strategy
      ) VALUES
        (r_org.id, p_id, sponsor_name, 'Executive Sponsor', sponsor_email, 'High', 'High', 'Monthly steering'),
        (r_org.id, p_id, primary_person_name, 'Delivery Manager', seed_person_emails[1], 'High', 'High', 'Weekly stand-up + RAID'),
        (r_org.id, p_id, secondary_person_name, 'Business Owner', seed_person_emails[LEAST(2, n_people)], 'Medium', 'High', 'Sprint reviews / demos');

      INSERT INTO public.status_updates (
        org_id, project_id, update_date, reporter, overall_rag, schedule_rag, cost_rag, scope_rag,
        progress_summary, achievements, next_steps, blockers
      ) VALUES
        (r_org.id, p_id, CURRENT_DATE - 7, primary_person_name, rags[i], rags[i],
         'Green'::public.project_rag, 'Green'::public.project_rag,
         names[i] || ' progressing across Core and ' || alt_names[i] || ' streams.',
         'Gates advanced; monthly actuals posted; allocations confirmed.',
         'Close open issues; prepare next stage gate pack.',
         CASE WHEN rags[i] = 'Red' THEN 'Network vendor delay impacting critical path.' WHEN rags[i] = 'Amber' THEN 'Capacity pressure on specialist roles.' ELSE NULL END),
        (r_org.id, p_id, CURRENT_DATE, secondary_person_name, rags[i],
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
        (r_org.id, p_id, 'Business Case', 'Business Case', 'https://example.com/docs/' || codes[i] || '/business-case', '1.0', sponsor_name, starts[i] + 10),
        (r_org.id, p_id, 'Project Charter', 'Charter', 'https://example.com/docs/' || codes[i] || '/charter', '1.1', primary_person_name, starts[i] + 20),
        (r_org.id, p_id, 'Latest Status Report', 'Status Report', 'https://example.com/docs/' || codes[i] || '/status', 'current', secondary_person_name, CURRENT_DATE);

      INSERT INTO public.lessons_learned (
        org_id, project_id, category, what_happened, root_cause, recommendation, captured_by, captured_date
      ) VALUES
        (r_org.id, p_id, 'Delivery', 'Stream ownership clarified mid-flight improved reporting',
         'Initial single-lane plan hid secondary stream risk',
         'Enable dual streams at project setup with Core always on',
         primary_person_name, CURRENT_DATE - 14);

      INSERT INTO public.change_requests (
        org_id, project_id, cr_number, title, description, change_type,
        impact_scope, impact_schedule_days, impact_cost, status, raised_by, raised_date, decision_date, approver
      ) VALUES
        (r_org.id, p_id, codes[i] || '-CR01', 'Add ' || alt_names[i] || ' integration scope',
         'Expand secondary stream integration envelope', 'Scope',
         'Secondary stream APIs + test packs', 14, round(budgets[i] * 0.03, 2),
         CASE WHEN i % 3 = 0 THEN 'Approved' ELSE 'Submitted' END,
         secondary_person_name, CURRENT_DATE - 20,
         CASE WHEN i % 3 = 0 THEN CURRENT_DATE - 10 ELSE NULL END,
         sponsor_name);

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
        org_id, project_id, stream_id, wbs_code, title, description, status, priority, owner,
        percent_complete, planned_start, planned_end, estimate_hours, actual_hours, milestone_id, sort_order
      ) VALUES
        (r_org.id, p_id, core_id, '1.0', 'Core discovery pack', 'Discovery artefacts for Core stream', 'Done', 'High', primary_person_name, 100, starts[i], starts[i] + 30, 80, 76, ms_id, 1),
        (r_org.id, p_id, alt_id, '2.0', alt_names[i] || ' build backlog', 'Backlog refinement for secondary stream', 'In Progress', 'High', secondary_person_name, 45, starts[i] + 21, ends[i] - 60, 200, 90, NULL, 2),
        (r_org.id, p_id, core_id, '3.0', 'UAT preparation', 'Cross-stream UAT scripts and data', 'To Do', 'Medium', sponsor_name, 10, ends[i] - 60, ends[i] - 30, 120, 8, NULL, 3);

      -- Link each work item to a stream stage gate (phase) for labor cost attribution
      UPDATE public.work_items wi
      SET stage_gate_id = (
        SELECT sg.id
        FROM public.stage_gates sg
        WHERE sg.project_id = wi.project_id
          AND sg.stream_id = wi.stream_id
        ORDER BY
          CASE sg.status
            WHEN 'In Review' THEN 0
            WHEN 'Pending' THEN 1
            ELSE 2
          END,
          sg.planned_date NULLS LAST
        LIMIT 1
      )
      WHERE wi.project_id = p_id;

      IF i > 1 THEN
        SELECT id INTO prev_p FROM public.projects
        WHERE org_id = r_org.id AND project_code = codes[i - 1] LIMIT 1;
        INSERT INTO public.dependencies (
          org_id, project_id, depends_on_project_id, title, description, dep_type, status, owner, needed_by
        ) VALUES (
          r_org.id, p_id, prev_p,
          'Depends on ' || codes[i - 1],
          'Needs platform outputs / learnings from predecessor project',
          'Internal', 'Open', secondary_person_name, starts[i] + 60
        );
      END IF;

      INSERT INTO public.dependencies (
        org_id, project_id, title, description, dep_type, status, owner, needed_by
      ) VALUES (
        r_org.id, p_id, 'External vendor security clearance',
        'Vendor must clear security review before production cutover',
        'External', 'Open', primary_person_name, lives[i] - 30
      );

      PERFORM public.rollup_project_from_streams(p_id);
    END LOOP;

    -- Demand pipeline
    INSERT INTO public.demand_pipeline (
      org_id, bu_id, idea_name, sponsor, description, status,
      estimated_cost, estimated_benefit, estimated_roi, strategic_alignment, complexity
    ) VALUES
      (r_org.id, r_bu, 'Loyalty wallet concept', seed_person_names[1], 'Early demand idea for wallet-led loyalty', 'Idea', 800000, 1200000, 45, 3, 2),
      (r_org.id, r_bu, 'Branch digital kiosk', seed_person_names[LEAST(2, n_people)], 'Under assessment for branch experience', 'Assessment', 1200000, 1600000, 30, 4, 3),
      (r_org.id, r_bu, 'Realtime fraud signals', seed_person_names[1], 'Streaming fraud features for payments', 'Business Case', 2100000, 3800000, 55, 5, 4);

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

-- ---------- E) Link resources to logins + seed timesheets / assignees ----------
DO $$
DECLARE
  r_org RECORD;
  member_ids uuid[];
  member_names text[];
  member_emails text[];
  mgr_uid uuid;
  pm_uid uuid;
  res RECORD;
  idx int;
  n_members int;
  week0 date;
  weeks date[];
  w date;
  wi_ids uuid[];
  wi uuid;
  p_id uuid;
  sheet_id uuid;
  st text;
  u_idx int;
  w_idx int;
  hours_base numeric;
  res_id_list uuid[];
  n_res int;
  rid1 uuid;
  rid2 uuid;
  owner_uid uuid;
  entry_stream_id uuid;
  entry_stage_gate_id uuid;
  target_emails text[] := ARRAY[
    'kaaminisharma1994@gmail.com',
    'shailja.kant.kaushik@gmail.com'
  ];
  target_names text[] := ARRAY[
    'Kamini Sharma',
    'Shailja Kant Kaushik'
  ];
BEGIN
  -- Monday of current week (ISO)
  week0 := CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::int) - 1);
  weeks := ARRAY[
    week0,
    week0 - 7,
    week0 - 14,
    week0 - 21
  ];

  FOR r_org IN SELECT id FROM public.organizations LOOP
    member_ids := ARRAY[]::uuid[];
    member_names := ARRAY[]::text[];
    member_emails := ARRAY[]::text[];

    -- Resolve the two named demo members first, matched case-insensitively by email.
    SELECT
      COALESCE(array_agg(x.id ORDER BY x.sort_order), ARRAY[]::uuid[]),
      COALESCE(array_agg(x.person_name ORDER BY x.sort_order), ARRAY[]::text[]),
      COALESCE(array_agg(x.email ORDER BY x.sort_order), ARRAY[]::text[])
    INTO member_ids, member_names, member_emails
    FROM (
      SELECT
        p.id,
        CASE lower(p.email)
          WHEN target_emails[1] THEN target_names[1]
          WHEN target_emails[2] THEN target_names[2]
          ELSE COALESCE(NULLIF(trim(p.full_name), ''), p.email)
        END AS person_name,
        lower(p.email) AS email,
        array_position(target_emails, lower(p.email)) AS sort_order
      FROM public.profiles p
      WHERE p.org_id = r_org.id
        AND lower(p.email) = ANY(target_emails)
    ) x;

    IF COALESCE(array_length(member_ids, 1), 0) = 0 THEN
      RAISE NOTICE 'Org % has neither Kamini/Shailja target profile; falling back to up to two org profiles for resources/timesheets', r_org.id;

      SELECT
        COALESCE(array_agg(x.id ORDER BY x.sort_order), ARRAY[]::uuid[]),
        COALESCE(array_agg(x.person_name ORDER BY x.sort_order), ARRAY[]::text[]),
        COALESCE(array_agg(x.email ORDER BY x.sort_order), ARRAY[]::text[])
      INTO member_ids, member_names, member_emails
      FROM (
        SELECT
          p.id,
          COALESCE(NULLIF(trim(p.full_name), ''), p.email) AS person_name,
          lower(p.email) AS email,
          row_number() OVER (ORDER BY COALESCE(p.full_name, p.email, p.id::text)) AS sort_order
        FROM public.profiles p
        WHERE p.org_id = r_org.id
        ORDER BY COALESCE(p.full_name, p.email, p.id::text)
        LIMIT 2
      ) x;
    END IF;

    n_members := COALESCE(array_length(member_ids, 1), 0);
    IF n_members = 0 THEN
      RAISE NOTICE 'Org % has no profiles — skipping timesheet link/seed', r_org.id;
      CONTINUE;
    END IF;

    mgr_uid := member_ids[LEAST(2, n_members)];
    pm_uid := member_ids[1];

    -- Ensure resources match org profiles (same person), then seed rates/managers
    BEGIN
      PERFORM public.sync_org_resources_from_profiles(r_org.id);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'sync_org_resources_from_profiles missing — continuing without auto-sync';
    END;

    UPDATE public.resources r
    SET
      name = member_names[array_position(member_ids, r.user_id)],
      email = member_emails[array_position(member_ids, r.user_id)],
      manager_user_id = CASE
        WHEN n_members = 1 THEN member_ids[1]
        WHEN r.user_id = member_ids[1] THEN member_ids[2]
        WHEN r.user_id = member_ids[2] THEN member_ids[1]
        ELSE member_ids[1]
      END,
      cost_rate = CASE
        WHEN array_position(member_ids, r.user_id) = 1 THEN 125
        ELSE 135
      END,
      capacity_hours_week = 40,
      status = 'Active'
    WHERE r.org_id = r_org.id
      AND r.user_id = ANY(member_ids);

    -- Nominate PMs on projects (rotate members)
    idx := 0;
    FOR p_id IN
      SELECT id FROM public.projects WHERE org_id = r_org.id ORDER BY project_code
    LOOP
      idx := idx + 1;
      UPDATE public.projects
      SET pm_user_id = member_ids[((idx - 1) % n_members) + 1]
      WHERE id = p_id;
    END LOOP;

    -- Assign work items to linked resources (same people as org logins)
    SELECT array_agg(r.id ORDER BY array_position(member_ids, r.user_id))
    INTO res_id_list
    FROM public.resources r
    WHERE r.org_id = r_org.id
      AND r.user_id = ANY(member_ids);
    n_res := COALESCE(array_length(res_id_list, 1), 0);

    idx := 0;
    IF n_res > 0 THEN
      FOR wi IN
        SELECT id FROM public.work_items
        WHERE org_id = r_org.id
        ORDER BY project_id, sort_order, wbs_code
      LOOP
        idx := idx + 1;
        rid1 := res_id_list[((idx - 1) % n_res) + 1];
        rid2 := res_id_list[(idx % n_res) + 1];

        SELECT user_id INTO owner_uid FROM public.resources WHERE id = rid1;

        UPDATE public.work_items
        SET
          owner_user_id = owner_uid,
          owner = (SELECT name FROM public.resources WHERE id = rid1)
        WHERE id = wi;

        INSERT INTO public.work_item_assignees (org_id, work_item_id, resource_id, user_id)
        VALUES (r_org.id, wi, rid1, owner_uid)
        ON CONFLICT (work_item_id, resource_id) DO UPDATE
          SET user_id = EXCLUDED.user_id;

        IF rid2 IS DISTINCT FROM rid1 THEN
          INSERT INTO public.work_item_assignees (org_id, work_item_id, resource_id, user_id)
          SELECT r_org.id, wi, rid2, r.user_id
          FROM public.resources r WHERE r.id = rid2
          ON CONFLICT (work_item_id, resource_id) DO UPDATE
            SET user_id = EXCLUDED.user_id;
        END IF;
      END LOOP;
    END IF;

    -- Timesheets for each linked resource/user across 4 weeks
    u_idx := 0;
    FOR res IN
      SELECT r.id AS resource_id, r.user_id, r.manager_user_id, r.cost_rate
      FROM public.resources r
      WHERE r.org_id = r_org.id
        AND r.user_id = ANY(member_ids)
      ORDER BY array_position(member_ids, r.user_id)
    LOOP
      u_idx := u_idx + 1;

      FOR w_idx IN 1..4 LOOP
        w := weeks[w_idx];

        -- Mix of draft / pending / approved / rejected for demo reporting.
        st := CASE
          WHEN n_res = 1 THEN
            CASE
              WHEN w_idx = 1 THEN 'draft'
              WHEN w_idx = 2 THEN 'pending_pm'
              WHEN w_idx = 3 THEN 'approved'
              ELSE 'rejected'
            END
          WHEN w_idx = 1 THEN CASE WHEN u_idx = 1 THEN 'draft' ELSE 'pending_pm' END
          WHEN w_idx = 2 THEN CASE WHEN u_idx = 1 THEN 'pending_rm' ELSE 'rejected' END
          ELSE 'approved'
        END;

        INSERT INTO public.timesheets (
          org_id, user_id, resource_id, week_start, status, manager_user_id,
          notes, submitted_at, rejected_at, rejected_by, rejection_reason
        ) VALUES (
          r_org.id,
          res.user_id,
          res.resource_id,
          w,
          st,
          COALESCE(res.manager_user_id, mgr_uid),
          'Sample seeded timesheet',
          CASE WHEN st = 'draft' THEN NULL ELSE (w + 5)::timestamptz END,
          CASE WHEN st = 'rejected' THEN (w + 6)::timestamptz ELSE NULL END,
          CASE WHEN st = 'rejected' THEN COALESCE(res.manager_user_id, mgr_uid) ELSE NULL END,
          CASE WHEN st = 'rejected' THEN 'Please correct Friday hours and resubmit' ELSE NULL END
        )
        ON CONFLICT (org_id, user_id, week_start) DO UPDATE
        SET status = EXCLUDED.status,
            resource_id = EXCLUDED.resource_id,
            manager_user_id = EXCLUDED.manager_user_id,
            notes = EXCLUDED.notes,
            submitted_at = EXCLUDED.submitted_at,
            rejected_at = EXCLUDED.rejected_at,
            rejected_by = EXCLUDED.rejected_by,
            rejection_reason = EXCLUDED.rejection_reason
        RETURNING id INTO sheet_id;

        DELETE FROM public.timesheet_approvals WHERE timesheet_id = sheet_id;
        DELETE FROM public.timesheet_entries WHERE timesheet_id = sheet_id;

        -- Up to 2 billable work items assigned to this resource
        SELECT array_agg(x.work_item_id)
        INTO wi_ids
        FROM (
          SELECT a.work_item_id
          FROM public.work_item_assignees a
          JOIN public.work_items wi2 ON wi2.id = a.work_item_id
          WHERE a.org_id = r_org.id AND a.resource_id = res.resource_id
          ORDER BY wi2.project_id, wi2.sort_order
          LIMIT 2
        ) x;

        IF wi_ids IS NULL OR array_length(wi_ids, 1) IS NULL THEN
          -- Fallback: any work items in org
          SELECT array_agg(x.id) INTO wi_ids
          FROM (
            SELECT wi2.id
            FROM public.work_items wi2
            WHERE wi2.org_id = r_org.id
            ORDER BY wi2.project_id
            LIMIT 2
          ) x;
        END IF;

        hours_base := 4 + ((u_idx + w_idx) % 4);

        IF wi_ids IS NOT NULL THEN
          FOREACH wi IN ARRAY wi_ids LOOP
            SELECT project_id, stream_id, stage_gate_id
            INTO p_id, entry_stream_id, entry_stage_gate_id
            FROM public.work_items
            WHERE id = wi;
            INSERT INTO public.timesheet_entries (
              org_id, timesheet_id, project_id, work_item_id, stream_id, stage_gate_id, billable, custom_task,
              hours_mon, hours_tue, hours_wed, hours_thu, hours_fri,
              hours_sat, hours_sun, notes, hourly_rate, labor_cost
            ) VALUES (
              r_org.id, sheet_id, p_id, wi, entry_stream_id, entry_stage_gate_id, true, NULL,
              hours_base, hours_base, hours_base - 1, hours_base, hours_base - 0.5,
              0, 0,
              'Billable delivery',
              res.cost_rate,
              CASE WHEN st = 'approved' THEN
                round((hours_base * 4 + (hours_base - 1) + (hours_base - 0.5)) * COALESCE(res.cost_rate, 0), 2)
              ELSE 0 END
            );
          END LOOP;
        END IF;

        -- Non-billable admin/training row
        INSERT INTO public.timesheet_entries (
          org_id, timesheet_id, project_id, work_item_id, stream_id, stage_gate_id, billable, custom_task,
          hours_mon, hours_tue, hours_wed, hours_thu, hours_fri,
          hours_sat, hours_sun, notes, hourly_rate, labor_cost
        ) VALUES (
          r_org.id, sheet_id, NULL, NULL, NULL, NULL, false, 'Training / admin',
          0, 0, 1, 0, 0.5,
          0, 0,
          'Non-billable',
          res.cost_rate,
          0
        );

        -- Approval rows matching status
        IF st IN ('pending_pm', 'pending_rm', 'approved', 'rejected') AND wi_ids IS NOT NULL THEN
          FOREACH wi IN ARRAY wi_ids LOOP
            SELECT project_id INTO p_id FROM public.work_items WHERE id = wi;
            INSERT INTO public.timesheet_approvals (
              org_id, timesheet_id, step, project_id, approver_user_id, status, comment, acted_at
            ) VALUES (
              r_org.id, sheet_id, 'pm', p_id,
              COALESCE((SELECT pm_user_id FROM public.projects WHERE id = p_id), pm_uid),
              CASE
                WHEN st = 'pending_pm' THEN 'pending'
                WHEN st = 'rejected' THEN 'rejected'
                ELSE 'approved'
              END,
              CASE WHEN st = 'rejected' THEN 'Hours look high vs plan' ELSE NULL END,
              CASE WHEN st = 'pending_pm' THEN NULL ELSE (w + 6)::timestamptz END
            )
            ON CONFLICT (timesheet_id, project_id) WHERE step = 'pm' DO NOTHING;
          END LOOP;
        END IF;

        IF st IN ('pending_rm', 'approved') THEN
          INSERT INTO public.timesheet_approvals (
            org_id, timesheet_id, step, project_id, approver_user_id, status, comment, acted_at
          ) VALUES (
            r_org.id, sheet_id, 'rm', NULL,
            COALESCE(res.manager_user_id, mgr_uid),
            CASE WHEN st = 'pending_rm' THEN 'pending' ELSE 'approved' END,
            NULL,
            CASE WHEN st = 'pending_rm' THEN NULL ELSE (w + 7)::timestamptz END
          )
          ON CONFLICT (timesheet_id) WHERE step = 'rm' DO NOTHING;
        END IF;

        -- Roll labor into financials for approved sheets
        IF st = 'approved' THEN
          BEGIN
            PERFORM public.apply_timesheet_labor_cost(sheet_id);
          EXCEPTION WHEN undefined_function THEN NULL;
          END;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

COMMIT;

-- Verification (run after commit — expect ~16 projects/org, 32 streams, 288 gates):
SELECT o.name AS org,
       (SELECT count(*) FROM public.projects p WHERE p.org_id = o.id) AS projects,
       (SELECT count(*) FROM public.project_streams s
         JOIN public.projects p ON p.id = s.project_id WHERE p.org_id = o.id) AS streams,
       (SELECT count(*) FROM public.stage_gates g WHERE g.org_id = o.id) AS stage_gates,
       (SELECT count(*) FROM public.stage_gates g WHERE g.org_id = o.id AND g.stream_id IS NOT NULL) AS gates_on_streams,
       (SELECT count(*) FROM public.work_items w WHERE w.org_id = o.id) AS work_items,
       (SELECT count(*) FROM public.work_items w WHERE w.org_id = o.id AND w.stage_gate_id IS NOT NULL) AS work_items_with_gate,
       (SELECT count(*) FROM public.resources r WHERE r.org_id = o.id) AS resources,
       (SELECT count(*) FROM public.timesheets t WHERE t.org_id = o.id) AS timesheets
FROM public.organizations o
ORDER BY 1;

-- Sample gate check (should list Core + alt for each project):
-- SELECT p.project_code, s.name AS stream, g.gate_name, g.status, g.planned_date
-- FROM public.stage_gates g
-- JOIN public.projects p ON p.id = g.project_id
-- LEFT JOIN public.project_streams s ON s.id = g.stream_id
-- ORDER BY p.project_code, s.sort_order, g.planned_date
-- LIMIT 40;
