-- Seed: 2 sample projects with 2 streams each (plus stage gates).
-- Run AFTER the project_streams migration.
--
-- Optional: set v_org_slug below to target a specific organisation.
-- Leave it NULL to use the first organisation in the database.

DO $$
DECLARE
  v_org_slug text := NULL; -- e.g. 'acme'  — or leave NULL for first org
  v_org uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_s1a uuid;
  v_s1b uuid;
  v_s2a uuid;
  v_s2b uuid;
BEGIN
  IF v_org_slug IS NOT NULL AND btrim(v_org_slug) <> '' THEN
    SELECT id INTO v_org FROM public.organizations WHERE slug = btrim(v_org_slug) LIMIT 1;
  ELSE
    SELECT id INTO v_org FROM public.organizations ORDER BY created_at NULLS LAST, name LIMIT 1;
  END IF;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No organisation found. Create an org first, or set v_org_slug to a valid organizations.slug';
  END IF;

  RAISE NOTICE 'Seeding into organisation %', v_org;

  -- ========== Project 1 ==========
  SELECT id INTO v_p1 FROM public.projects WHERE org_id = v_org AND project_code = 'AR-TW-001';
  IF v_p1 IS NULL THEN
    INSERT INTO public.projects (
      org_id, project_code, name, program, sponsor, priority, status, rag,
      delivery_method, current_phase, streams_enabled,
      planned_start_date, planned_end_date, actual_start_date, target_go_live,
      start_date, end_date,
      budget, capex_approved, capex_incurred, opex_approved, opex_incurred,
      forecast_at_completion, benefits_target, description
    ) VALUES (
      v_org, 'AR-TW-001', 'AR Billing into TollWorks', 'Finance Transformation', 'Jane Sponsor',
      'High', 'In Progress', 'Green', 'Hybrid', 'Build', true,
      '2026-07-06', '2026-11-07', '2026-07-06', '2026-11-07',
      '2026-07-06', '2026-11-07',
      430340, 380000, 95000, 50340, 12000,
      430340, 900000, 'Integrate AR billing into TollWorks across TW and Oracle streams.'
    ) RETURNING id INTO v_p1;
  ELSE
    UPDATE public.projects SET streams_enabled = true, updated_at = now() WHERE id = v_p1;
  END IF;

  INSERT INTO public.project_streams (
    org_id, project_id, name, code, is_default, sort_order, status, rag, owner,
    planned_start_date, planned_end_date, actual_start_date,
    budget, capex_approved, opex_approved, forecast_at_completion
  ) VALUES
    (v_org, v_p1, 'TollWorks', 'TW', true, 0, 'In Progress', 'Green', 'TW Lead',
     '2026-07-06', '2026-11-07', '2026-07-06', 240000, 210000, 30000, 240000),
    (v_org, v_p1, 'Oracle', 'ORA', false, 1, 'In Progress', 'Amber', 'Oracle Lead',
     '2026-07-20', '2026-10-31', '2026-07-20', 190340, 170000, 20340, 190340)
  ON CONFLICT (project_id, name) DO UPDATE SET
    code = EXCLUDED.code,
    is_default = EXCLUDED.is_default,
    planned_start_date = EXCLUDED.planned_start_date,
    planned_end_date = EXCLUDED.planned_end_date,
    budget = EXCLUDED.budget,
    updated_at = now();

  SELECT id INTO v_s1a FROM public.project_streams WHERE project_id = v_p1 AND code = 'TW';
  SELECT id INTO v_s1b FROM public.project_streams WHERE project_id = v_p1 AND code = 'ORA';

  INSERT INTO public.stage_gates (org_id, project_id, stream_id, gate_name, planned_date, status)
  SELECT v_org, v_p1, v_s1a, g.gate_name, g.planned_date::date, 'Pending'
  FROM (VALUES
    ('Design', '2026-07-20'),
    ('Design Sign Off', '2026-08-03'),
    ('Build', '2026-09-14'),
    ('SIT', '2026-09-28'),
    ('UAT', '2026-10-19'),
    ('Go-Live', '2026-11-07')
  ) AS g(gate_name, planned_date)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stage_gates sg
    WHERE sg.project_id = v_p1 AND sg.stream_id = v_s1a AND sg.gate_name = g.gate_name
  );

  INSERT INTO public.stage_gates (org_id, project_id, stream_id, gate_name, planned_date, status)
  SELECT v_org, v_p1, v_s1b, g.gate_name, g.planned_date::date, 'Pending'
  FROM (VALUES
    ('Design', '2026-08-03'),
    ('Build', '2026-09-21'),
    ('SIT', '2026-10-05'),
    ('UAT', '2026-10-26'),
    ('Go-Live', '2026-10-31')
  ) AS g(gate_name, planned_date)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stage_gates sg
    WHERE sg.project_id = v_p1 AND sg.stream_id = v_s1b AND sg.gate_name = g.gate_name
  );

  -- ========== Project 2 ==========
  SELECT id INTO v_p2 FROM public.projects WHERE org_id = v_org AND project_code = 'CPR-002';
  IF v_p2 IS NULL THEN
    INSERT INTO public.projects (
      org_id, project_code, name, program, sponsor, priority, status, rag,
      delivery_method, current_phase, streams_enabled,
      planned_start_date, planned_end_date, actual_start_date, target_go_live,
      start_date, end_date,
      budget, capex_approved, capex_incurred, opex_approved, opex_incurred,
      forecast_at_completion, benefits_target, description
    ) VALUES (
      v_org, 'CPR-002', 'Customer Portal Relaunch', 'Digital Experience', 'Sam Sponsor',
      'Critical', 'In Progress', 'Amber', 'Agile', 'Design', true,
      '2026-08-01', '2027-01-31', '2026-08-01', '2027-01-15',
      '2026-08-01', '2027-01-31',
      1250000, 1000000, 180000, 250000, 40000,
      1280000, 2500000, 'Relaunch customer portal with Experience and Platform streams.'
    ) RETURNING id INTO v_p2;
  ELSE
    UPDATE public.projects SET streams_enabled = true, updated_at = now() WHERE id = v_p2;
  END IF;

  INSERT INTO public.project_streams (
    org_id, project_id, name, code, is_default, sort_order, status, rag, owner,
    planned_start_date, planned_end_date, actual_start_date,
    budget, capex_approved, opex_approved, forecast_at_completion
  ) VALUES
    (v_org, v_p2, 'Experience', 'XP', true, 0, 'In Progress', 'Amber', 'UX Lead',
     '2026-08-01', '2027-01-15', '2026-08-01', 700000, 550000, 150000, 720000),
    (v_org, v_p2, 'Platform', 'PLT', false, 1, 'In Progress', 'Green', 'Platform Lead',
     '2026-08-15', '2027-01-31', '2026-08-15', 550000, 450000, 100000, 560000)
  ON CONFLICT (project_id, name) DO UPDATE SET
    code = EXCLUDED.code,
    is_default = EXCLUDED.is_default,
    planned_start_date = EXCLUDED.planned_start_date,
    planned_end_date = EXCLUDED.planned_end_date,
    budget = EXCLUDED.budget,
    updated_at = now();

  SELECT id INTO v_s2a FROM public.project_streams WHERE project_id = v_p2 AND code = 'XP';
  SELECT id INTO v_s2b FROM public.project_streams WHERE project_id = v_p2 AND code = 'PLT';

  INSERT INTO public.stage_gates (org_id, project_id, stream_id, gate_name, planned_date, status)
  SELECT v_org, v_p2, v_s2a, g.gate_name, g.planned_date::date, 'Pending'
  FROM (VALUES
    ('Discovery', '2026-08-20'),
    ('Design', '2026-09-30'),
    ('Build', '2026-11-30'),
    ('UAT', '2026-12-20'),
    ('Go-Live', '2027-01-15')
  ) AS g(gate_name, planned_date)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stage_gates sg
    WHERE sg.project_id = v_p2 AND sg.stream_id = v_s2a AND sg.gate_name = g.gate_name
  );

  INSERT INTO public.stage_gates (org_id, project_id, stream_id, gate_name, planned_date, status)
  SELECT v_org, v_p2, v_s2b, g.gate_name, g.planned_date::date, 'Pending'
  FROM (VALUES
    ('Discovery', '2026-09-01'),
    ('Design', '2026-10-15'),
    ('Build', '2026-12-15'),
    ('UAT', '2027-01-10'),
    ('Go-Live', '2027-01-31')
  ) AS g(gate_name, planned_date)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stage_gates sg
    WHERE sg.project_id = v_p2 AND sg.stream_id = v_s2b AND sg.gate_name = g.gate_name
  );

  PERFORM public.rollup_project_from_streams(v_p1);
  PERFORM public.rollup_project_from_streams(v_p2);

  RAISE NOTICE 'Ready: AR-TW-001 (%) streams TW+ORA; CPR-002 (%) streams XP+PLT', v_p1, v_p2;
END $$;
