-- =============================================================================
-- iProjectX — Wipe project portfolio data + seed 16 sample projects
-- Run in: Supabase SQL Editor (as postgres / service role)
--
-- KEEPS (org / identity / platform):
--   organizations, profiles, user_roles, auth.users,
--   billing_*, subscriptions, invoices*, landing_config, invoice_template_config,
--   stage_gate_definitions, business_units, resources, governance_channels,
--   role_table_permissions, branding / org UI config (if present)
--
-- DELETES (portfolio / project delivery data):
--   projects (+ cascaded children), portfolio scenarios, demand pipeline,
--   work items, project purge notices, project-scoped audit events
--
-- Seeds 16 realistic projects PER organisation with stage gates, FY allocations,
-- monthly financials, risks, issues, actions, benefits, milestones, status updates.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Wipe project-related data (safe if some tables are absent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.scenario_projects') IS NOT NULL THEN
    DELETE FROM public.scenario_projects;
  END IF;
  IF to_regclass('public.portfolio_scenarios') IS NOT NULL THEN
    DELETE FROM public.portfolio_scenarios;
  END IF;
  IF to_regclass('public.demand_pipeline') IS NOT NULL THEN
    DELETE FROM public.demand_pipeline;
  END IF;
  IF to_regclass('public.work_items') IS NOT NULL THEN
    DELETE FROM public.work_items;
  END IF;
  IF to_regclass('public.project_purge_notices') IS NOT NULL THEN
    DELETE FROM public.project_purge_notices;
  END IF;
  IF to_regclass('public.audit_events') IS NOT NULL THEN
    DELETE FROM public.audit_events
    WHERE entity_type ILIKE '%project%'
       OR entity_type ILIKE '%gate%'
       OR entity_type ILIKE '%risk%'
       OR entity_type ILIKE '%milestone%'
       OR entity_type ILIKE '%financial%'
       OR entity_type ILIKE '%work_item%';
  END IF;
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    DELETE FROM public.audit_log;
  END IF;
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications
    WHERE title ILIKE '%project%'
       OR body ILIKE '%project%'
       OR coalesce(link, '') ILIKE '%/app/%';
  END IF;

  -- Cascades: stage_gates, milestones, risks, issues, actions, decisions,
  -- dependencies, benefits, financials_monthly, fy_allocations, sprints,
  -- change_requests, status_updates, stakeholders, documents, lessons_learned,
  -- resource_allocations, work_items (already cleared), etc.
  DELETE FROM public.projects;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Ensure each org has BUs + default stage-gate definitions
-- ---------------------------------------------------------------------------
INSERT INTO public.business_units (org_id, name, code)
SELECT o.id, v.name, v.code
FROM public.organizations o
CROSS JOIN (VALUES
  ('Retail Banking', 'RB'),
  ('Technology', 'TECH'),
  ('Operations', 'OPS'),
  ('Risk & Compliance', 'RC')
) AS v(name, code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_units bu
  WHERE bu.org_id = o.id AND bu.code = v.code
);

INSERT INTO public.stage_gate_definitions (org_id, gate_name, sort_order)
SELECT o.id, g.name, g.ord
FROM public.organizations o
CROSS JOIN (VALUES
  ('Discovery', 1),
  ('Business Case / Seed Funding', 2),
  ('Design', 3),
  ('Business Case / Full Funding', 4),
  ('Build', 5),
  ('Testing', 6),
  ('Deployment', 7),
  ('Handover', 8),
  ('Benefit Realisation', 9)
) AS g(name, ord)
ON CONFLICT (org_id, gate_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Seed 16 projects per organisation + related delivery data
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  org RECORD;
  bu_ids uuid[];
  bu uuid;
  i int;
  pid uuid;
  p_code text;
  p_name text;
  p_program text;
  p_sponsor text;
  p_priority text;
  p_status public.project_status;
  p_rag public.project_rag;
  p_method public.delivery_method;
  p_phase text;
  p_start date;
  p_end date;
  p_actual_start date;
  p_actual_end date;
  p_budget numeric;
  p_capex numeric;
  p_opex numeric;
  p_ben_t numeric;
  p_ben_r numeric;
  p_capex_inc numeric;
  p_opex_inc numeric;
  gates_approved int;
  gate RECORD;
  g_idx int;
  g_status text;
  g_planned date;
  m int;
  month_start date;
  months_total int;
  fy_label text;
  n_fys int;
  fy_start int;
  fy_end int;
  y int;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP
    SELECT array_agg(id ORDER BY name) INTO bu_ids
    FROM public.business_units WHERE org_id = org.id;

    IF bu_ids IS NULL OR array_length(bu_ids, 1) IS NULL THEN
      INSERT INTO public.business_units (org_id, name, code)
      VALUES (org.id, 'Enterprise', 'ENT')
      RETURNING id INTO bu;
      bu_ids := ARRAY[bu];
    END IF;

    FOR i IN 1..16 LOOP
      bu := bu_ids[1 + ((i - 1) % array_length(bu_ids, 1))];

      -- Portfolio sample set (stable identities)
      CASE i
        WHEN 1 THEN
          p_code := 'DX-101'; p_name := 'Core Banking Modernisation';
          p_program := 'Digital Transformation'; p_sponsor := 'Elena Rossi';
          p_priority := 'Critical'; p_status := 'In Progress'; p_rag := 'Amber';
          p_method := 'Hybrid'; p_phase := 'Build';
          p_start := DATE '2025-04-01'; p_end := DATE '2027-03-31';
          p_actual_start := DATE '2025-04-15'; p_actual_end := NULL;
          p_budget := 4200000; p_capex := 3100000; p_opex := 1100000;
          p_ben_t := 6800000; p_ben_r := 850000; gates_approved := 4;
        WHEN 2 THEN
          p_code := 'CX-204'; p_name := 'Omnichannel Customer Portal';
          p_program := 'Customer Experience'; p_sponsor := 'Priya Nair';
          p_priority := 'High'; p_status := 'In Progress'; p_rag := 'Green';
          p_method := 'Agile'; p_phase := 'Testing';
          p_start := DATE '2025-07-01'; p_end := DATE '2026-09-30';
          p_actual_start := DATE '2025-07-08'; p_actual_end := NULL;
          p_budget := 1850000; p_capex := 1200000; p_opex := 650000;
          p_ben_t := 3200000; p_ben_r := 620000; gates_approved := 5;
        WHEN 3 THEN
          p_code := 'DT-310'; p_name := 'Enterprise Data Platform';
          p_program := 'Data & Analytics'; p_sponsor := 'Marcus Chen';
          p_priority := 'High'; p_status := 'In Progress'; p_rag := 'Amber';
          p_method := 'Hybrid'; p_phase := 'Design';
          p_start := DATE '2025-10-01'; p_end := DATE '2027-06-30';
          p_actual_start := DATE '2025-10-20'; p_actual_end := NULL;
          p_budget := 2750000; p_capex := 2100000; p_opex := 650000;
          p_ben_t := 5100000; p_ben_r := 180000; gates_approved := 2;
        WHEN 4 THEN
          p_code := 'RC-118'; p_name := 'Regulatory Reporting Uplift';
          p_program := 'Risk & Compliance'; p_sponsor := 'Sofia Alvarez';
          p_priority := 'Critical'; p_status := 'In Progress'; p_rag := 'Red';
          p_method := 'Waterfall'; p_phase := 'Build';
          p_start := DATE '2025-05-01'; p_end := DATE '2026-06-30';
          p_actual_start := DATE '2025-05-12'; p_actual_end := NULL;
          p_budget := 980000; p_capex := 520000; p_opex := 460000;
          p_ben_t := 1400000; p_ben_r := 90000; gates_approved := 4;
        WHEN 5 THEN
          p_code := 'IN-402'; p_name := 'Cloud Landing Zone Expansion';
          p_program := 'Infrastructure'; p_sponsor := 'James Whitfield';
          p_priority := 'Medium'; p_status := 'In Progress'; p_rag := 'Green';
          p_method := 'Agile'; p_phase := 'Deployment';
          p_start := DATE '2025-02-01'; p_end := DATE '2026-04-30';
          p_actual_start := DATE '2025-02-10'; p_actual_end := NULL;
          p_budget := 1450000; p_capex := 1050000; p_opex := 400000;
          p_ben_t := 2100000; p_ben_r := 780000; gates_approved := 6;
        WHEN 6 THEN
          p_code := 'CX-221'; p_name := 'Contact Centre AI Assist';
          p_program := 'Customer Experience'; p_sponsor := 'Priya Nair';
          p_priority := 'High'; p_status := 'In Progress'; p_rag := 'Green';
          p_method := 'Agile'; p_phase := 'Build';
          p_start := DATE '2025-11-01'; p_end := DATE '2026-12-15';
          p_actual_start := DATE '2025-11-18'; p_actual_end := NULL;
          p_budget := 1120000; p_capex := 700000; p_opex := 420000;
          p_ben_t := 2600000; p_ben_r := 210000; gates_approved := 3;
        WHEN 7 THEN
          p_code := 'OPS-055'; p_name := 'Payments Reconciliation Automation';
          p_program := 'Operations Excellence'; p_sponsor := 'Helen Park';
          p_priority := 'Medium'; p_status := 'On Hold'; p_rag := 'Amber';
          p_method := 'Waterfall'; p_phase := 'Business Case / Full Funding';
          p_start := DATE '2025-08-01'; p_end := DATE '2026-08-31';
          p_actual_start := DATE '2025-08-15'; p_actual_end := NULL;
          p_budget := 640000; p_capex := 380000; p_opex := 260000;
          p_ben_t := 1100000; p_ben_r := 0; gates_approved := 3;
        WHEN 8 THEN
          p_code := 'DX-088'; p_name := 'Mobile App Redesign';
          p_program := 'Digital Transformation'; p_sponsor := 'Elena Rossi';
          p_priority := 'High'; p_status := 'Completed'; p_rag := 'Green';
          p_method := 'Agile'; p_phase := 'Benefit Realisation';
          p_start := DATE '2024-06-01'; p_end := DATE '2025-12-15';
          p_actual_start := DATE '2024-06-10'; p_actual_end := DATE '2025-12-08';
          p_budget := 920000; p_capex := 610000; p_opex := 310000;
          p_ben_t := 1800000; p_ben_r := 1450000; gates_approved := 9;
        WHEN 9 THEN
          p_code := 'DT-275'; p_name := 'Customer 360 Analytics';
          p_program := 'Data & Analytics'; p_sponsor := 'Marcus Chen';
          p_priority := 'Medium'; p_status := 'In Progress'; p_rag := 'Green';
          p_method := 'Hybrid'; p_phase := 'Testing';
          p_start := DATE '2025-03-01'; p_end := DATE '2026-05-31';
          p_actual_start := DATE '2025-03-17'; p_actual_end := NULL;
          p_budget := 780000; p_capex := 500000; p_opex := 280000;
          p_ben_t := 1950000; p_ben_r := 420000; gates_approved := 5;
        WHEN 10 THEN
          p_code := 'RC-142'; p_name := 'Identity & Access Governance';
          p_program := 'Risk & Compliance'; p_sponsor := 'Sofia Alvarez';
          p_priority := 'High'; p_status := 'In Progress'; p_rag := 'Amber';
          p_method := 'Waterfall'; p_phase := 'Testing';
          p_start := DATE '2025-06-01'; p_end := DATE '2026-07-31';
          p_actual_start := DATE '2025-06-09'; p_actual_end := NULL;
          p_budget := 1320000; p_capex := 860000; p_opex := 460000;
          p_ben_t := 1700000; p_ben_r := 260000; gates_approved := 5;
        WHEN 11 THEN
          p_code := 'IN-419'; p_name := 'Branch Network Wi-Fi Refresh';
          p_program := 'Infrastructure'; p_sponsor := 'James Whitfield';
          p_priority := 'Low'; p_status := 'Not Started'; p_rag := 'Green';
          p_method := 'Waterfall'; p_phase := 'Discovery';
          p_start := DATE '2026-04-01'; p_end := DATE '2027-01-31';
          p_actual_start := NULL; p_actual_end := NULL;
          p_budget := 540000; p_capex := 480000; p_opex := 60000;
          p_ben_t := 700000; p_ben_r := 0; gates_approved := 0;
        WHEN 12 THEN
          p_code := 'OPS-071'; p_name := 'Vendor Invoice e-Workflow';
          p_program := 'Operations Excellence'; p_sponsor := 'Helen Park';
          p_priority := 'Medium'; p_status := 'In Progress'; p_rag := 'Green';
          p_method := 'Hybrid'; p_phase := 'Build';
          p_start := DATE '2025-09-01'; p_end := DATE '2026-10-31';
          p_actual_start := DATE '2025-09-15'; p_actual_end := NULL;
          p_budget := 490000; p_capex := 270000; p_opex := 220000;
          p_ben_t := 980000; p_ben_r := 120000; gates_approved := 4;
        WHEN 13 THEN
          p_code := 'CX-260'; p_name := 'Loyalty Programme Relaunch';
          p_program := 'Customer Experience'; p_sponsor := 'Priya Nair';
          p_priority := 'High'; p_status := 'In Progress'; p_rag := 'Amber';
          p_method := 'Agile'; p_phase := 'Design';
          p_start := DATE '2026-01-06'; p_end := DATE '2026-11-30';
          p_actual_start := DATE '2026-01-20'; p_actual_end := NULL;
          p_budget := 1680000; p_capex := 950000; p_opex := 730000;
          p_ben_t := 4100000; p_ben_r := 50000; gates_approved := 2;
        WHEN 14 THEN
          p_code := 'DX-130'; p_name := 'Open Banking API Gateway';
          p_program := 'Digital Transformation'; p_sponsor := 'Elena Rossi';
          p_priority := 'Critical'; p_status := 'In Progress'; p_rag := 'Red';
          p_method := 'Hybrid'; p_phase := 'Build';
          p_start := DATE '2025-04-15'; p_end := DATE '2026-08-31';
          p_actual_start := DATE '2025-05-01'; p_actual_end := NULL;
          p_budget := 2100000; p_capex := 1600000; p_opex := 500000;
          p_ben_t := 3600000; p_ben_r := 300000; gates_approved := 4;
        WHEN 15 THEN
          p_code := 'DT-290'; p_name := 'Fraud Detection Model Refresh';
          p_program := 'Data & Analytics'; p_sponsor := 'Marcus Chen';
          p_priority := 'Critical'; p_status := 'Completed'; p_rag := 'Green';
          p_method := 'Agile'; p_phase := 'Handover';
          p_start := DATE '2024-09-01'; p_end := DATE '2025-11-30';
          p_actual_start := DATE '2024-09-05'; p_actual_end := DATE '2025-11-22';
          p_budget := 860000; p_capex := 520000; p_opex := 340000;
          p_ben_t := 2400000; p_ben_r := 1980000; gates_approved := 8;
        ELSE
          p_code := 'RC-155'; p_name := 'Third-Party Risk Portal';
          p_program := 'Risk & Compliance'; p_sponsor := 'Sofia Alvarez';
          p_priority := 'Medium'; p_status := 'Not Started'; p_rag := 'Green';
          p_method := 'Waterfall'; p_phase := 'Business Case / Seed Funding';
          p_start := DATE '2026-05-01'; p_end := DATE '2027-04-30';
          p_actual_start := NULL; p_actual_end := NULL;
          p_budget := 720000; p_capex := 450000; p_opex := 270000;
          p_ben_t := 1250000; p_ben_r := 0; gates_approved := 1;
      END CASE;

      -- Incurred spend: higher for later-stage / completed work
      p_capex_inc := round(p_capex * LEAST(0.95, greatest(0.05, gates_approved::numeric / 9.0)) , 2);
      p_opex_inc  := round(p_opex  * LEAST(0.90, greatest(0.04, gates_approved::numeric / 10.0)), 2);

      INSERT INTO public.projects (
        org_id, bu_id, project_code, name, program, sponsor, priority,
        status, rag, current_phase, delivery_method,
        start_date, end_date, planned_start_date, planned_end_date,
        actual_start_date, actual_end_date, target_go_live,
        budget, capex_approved, capex_incurred, opex_approved, opex_incurred,
        benefits_target, benefits_realised, roi_percent, description, brief,
        baseline_budget, baseline_capex, baseline_opex, baseline_benefits,
        baseline_date, baseline_label
      ) VALUES (
        org.id, bu, p_code, p_name, p_program, p_sponsor, p_priority,
        p_status, p_rag, p_phase, p_method,
        COALESCE(p_actual_start, p_start), COALESCE(p_actual_end, p_end),
        p_start, p_end,
        p_actual_start, p_actual_end,
        p_end - 14,
        p_budget, p_capex, p_capex_inc, p_opex, p_opex_inc,
        p_ben_t, p_ben_r,
        CASE WHEN p_budget > 0 THEN round(((p_ben_t - p_budget) / p_budget) * 100, 1) ELSE 0 END,
        p_name || ' — sample portfolio initiative for executive and delivery views.',
        jsonb_build_object(
          'objective', 'Deliver measurable outcomes for ' || p_program,
          'success_criteria', 'On-time stage gates, controlled RAG, benefit tracking'
        ),
        p_budget, p_capex, p_opex, p_ben_t,
        p_start, 'Board baseline'
      )
      RETURNING id INTO pid;

      -- Stage gates from org definitions
      g_idx := 0;
      FOR gate IN
        SELECT gate_name, sort_order
        FROM public.stage_gate_definitions
        WHERE org_id = org.id AND is_active = true
        ORDER BY sort_order
      LOOP
        g_idx := g_idx + 1;
        g_planned := p_start + ((p_end - p_start) * (gate.sort_order - 1) / 8);
        IF g_idx <= gates_approved THEN
          g_status := 'Approved';
        ELSIF g_idx = gates_approved + 1 AND p_status = 'In Progress' THEN
          g_status := 'In Progress';
        ELSIF p_status = 'On Hold' AND g_idx = gates_approved + 1 THEN
          g_status := 'On Hold';
        ELSE
          g_status := 'Pending';
        END IF;

        INSERT INTO public.stage_gates (
          org_id, project_id, gate_name, planned_date, actual_date, status, approver, notes
        ) VALUES (
          org.id, pid, gate.gate_name, g_planned,
          CASE WHEN g_status = 'Approved' THEN g_planned + ((g_idx % 5) - 2) ELSE NULL END,
          g_status,
          CASE WHEN g_status = 'Approved' THEN p_sponsor ELSE NULL END,
          CASE
            WHEN g_status = 'In Progress' THEN 'Evidence pack in review'
            WHEN g_status = 'On Hold' THEN 'Awaiting funding decision'
            ELSE NULL
          END
        );
      END LOOP;

      -- FY allocations (Apr–Mar)
      fy_start := CASE WHEN EXTRACT(MONTH FROM p_start) >= 4
        THEN EXTRACT(YEAR FROM p_start)::int ELSE EXTRACT(YEAR FROM p_start)::int - 1 END;
      fy_end := CASE WHEN EXTRACT(MONTH FROM p_end) >= 4
        THEN EXTRACT(YEAR FROM p_end)::int ELSE EXTRACT(YEAR FROM p_end)::int - 1 END;
      n_fys := greatest(1, fy_end - fy_start + 1);
      FOR y IN fy_start..fy_end LOOP
        fy_label := 'FY' || right((y + 1)::text, 2);
        INSERT INTO public.fy_allocations (org_id, project_id, fy, capex, opex, benefits)
        VALUES (
          org.id, pid, fy_label,
          round(p_capex / n_fys, 2),
          round(p_opex / n_fys, 2),
          round(p_ben_t / n_fys, 2)
        )
        ON CONFLICT DO NOTHING;
      END LOOP;

      -- Monthly financials across schedule window (cap ~18 months for volume)
      months_total := least(18, greatest(3, ((p_end - p_start) / 30)));
      FOR m IN 0..(months_total - 1) LOOP
        month_start := (date_trunc('month', p_start) + (m || ' months')::interval)::date;
        EXIT WHEN month_start > p_end;
        INSERT INTO public.financials_monthly (
          org_id, project_id, period_month,
          capex_planned, capex_actual, capex_forecast,
          opex_planned, opex_actual, opex_forecast,
          benefits_planned, benefits_actual
        ) VALUES (
          org.id, pid, month_start,
          round(p_capex / months_total, 2),
          CASE WHEN month_start < CURRENT_DATE THEN round((p_capex_inc) / greatest(1, months_total * 0.7), 2) ELSE 0 END,
          round(p_capex / months_total, 2),
          round(p_opex / months_total, 2),
          CASE WHEN month_start < CURRENT_DATE THEN round((p_opex_inc) / greatest(1, months_total * 0.7), 2) ELSE 0 END,
          round(p_opex / months_total, 2),
          round(p_ben_t / months_total, 2),
          CASE WHEN month_start < CURRENT_DATE THEN round((p_ben_r) / greatest(1, months_total * 0.5), 2) ELSE 0 END
        )
        ON CONFLICT DO NOTHING;
      END LOOP;

      -- Milestones
      INSERT INTO public.milestones (org_id, project_id, name, planned_date, actual_date, status, owner, notes) VALUES
        (org.id, pid, 'Kick-off complete', p_start + 14,
          CASE WHEN p_actual_start IS NOT NULL THEN p_actual_start + 10 ELSE NULL END,
          CASE WHEN p_actual_start IS NOT NULL THEN 'Complete' ELSE 'Planned' END,
          p_sponsor, NULL),
        (org.id, pid, 'MVP / Pilot ready', p_start + ((p_end - p_start) / 2),
          NULL,
          CASE WHEN gates_approved >= 5 THEN 'In Progress' ELSE 'Planned' END,
          'Delivery Lead', NULL),
        (org.id, pid, 'Go-live', p_end - 14,
          p_actual_end,
          CASE WHEN p_status = 'Completed' THEN 'Complete' ELSE 'Planned' END,
          p_sponsor, NULL);

      -- Risks / issues / actions / benefits / status
      INSERT INTO public.risks (
        org_id, project_id, title, description, category, probability, impact, severity,
        status, owner, mitigation, notes, due_date
      ) VALUES
        (org.id, pid, 'Schedule pressure on ' || p_name,
         'Critical path activities showing compression against baseline.',
         'Schedule', 3 + (i % 2), 3 + (i % 3), (3 + (i % 2)) * (3 + (i % 3)),
         CASE WHEN p_rag = 'Red' THEN 'Open' WHEN p_rag = 'Amber' THEN 'Mitigating' ELSE 'Open' END,
         'Alex Chen', 'Re-baseline sprint plan; add contingency buffer.',
         'Reviewed in weekly RAID.', CURRENT_DATE + (14 + i)),
        (org.id, pid, 'Vendor dependency for ' || p_code,
         'External supplier lead times may affect integration window.',
         'Vendor', 2 + (i % 3), 4, (2 + (i % 3)) * 4,
         'Mitigating', 'Priya Nair', 'Secondary supplier shortlist + weekly vendor board.',
         NULL, CURRENT_DATE + (21 + i));

      INSERT INTO public.issues (
        org_id, project_id, title, description, priority, status, owner, raised_date, target_date, resolution
      ) VALUES
        (org.id, pid, 'Environment access delay',
         'Non-prod access tickets pending for two squads.',
         CASE WHEN p_rag = 'Red' THEN 'High' ELSE 'Medium' END,
         CASE WHEN i % 3 = 0 THEN 'Closed' ELSE 'Open' END,
         'Jordan Blake', CURRENT_DATE - 10, CURRENT_DATE + 7,
         CASE WHEN i % 3 = 0 THEN 'Access granted via ITSM.' ELSE NULL END);

      INSERT INTO public.actions (
        org_id, project_id, title, description, owner, priority, status, due_date, notes
      ) VALUES
        (org.id, pid, 'Publish stage-gate pack for ' || p_phase,
         'Compile evidence and circulate to approvers.',
         'Ravi Kumar', 'High',
         CASE WHEN gates_approved >= 6 THEN 'Closed' ELSE 'Open' END,
         CURRENT_DATE + 5, 'Template from Data Editor.'),
        (org.id, pid, 'Update financial forecast',
         'Refresh CAPEX/OPEX forecast after latest actuals.',
         'Anna Weber', 'Medium', 'In Progress', CURRENT_DATE + 12, NULL);

      INSERT INTO public.benefits (
        org_id, project_id, title, benefit_type, target_value, realised_value,
        status, owner, realisation_date, notes
      ) VALUES
        (org.id, pid, 'Cost avoidance — ' || p_program, 'Financial',
         round(p_ben_t * 0.55, 2), round(p_ben_r * 0.55, 2),
         CASE WHEN p_ben_r > 0 THEN 'In Progress' ELSE 'Planned' END,
         p_sponsor, p_end, NULL),
        (org.id, pid, 'Customer / process uplift', 'Non-Financial',
         round(p_ben_t * 0.45, 2), round(p_ben_r * 0.45, 2),
         CASE WHEN p_status = 'Completed' THEN 'Realised' ELSE 'Planned' END,
         'Helen Park', p_end + 60, NULL);

      INSERT INTO public.status_updates (
        org_id, project_id, update_date, reporter,
        overall_rag, schedule_rag, cost_rag, scope_rag,
        progress_summary, achievements, next_steps, blockers
      ) VALUES (
        org.id, pid, CURRENT_DATE - (i % 7),
        'PMO Office',
        p_rag, p_rag,
        CASE WHEN p_rag = 'Red' THEN 'Amber'::public.project_rag ELSE p_rag END,
        'Green'::public.project_rag,
        'Delivery progressing against ' || p_phase || ' for ' || p_name || '.',
        'Stage evidence updated; RAID reviewed with sponsor.',
        'Clear open actions and confirm next gate date.',
        CASE WHEN p_rag = 'Red' THEN 'Critical dependency needs executive escalation.' ELSE NULL END
      );

      INSERT INTO public.stakeholders (
        org_id, project_id, name, role, influence, interest, email, engagement_strategy
      ) VALUES
        (org.id, pid, p_sponsor, 'Executive Sponsor', 'High', 'High',
         lower(replace(p_sponsor, ' ', '.')) || '@example.com', 'Monthly steering'),
        (org.id, pid, 'Delivery Lead', 'Project Manager', 'Medium', 'High',
         'delivery.lead' || i || '@example.com', 'Weekly stand-up + RAID');

    END LOOP;

    -- A few demand-pipeline ideas (portfolio funnel, not projects)
    IF to_regclass('public.demand_pipeline') IS NOT NULL THEN
      INSERT INTO public.demand_pipeline (
        org_id, bu_id, idea_name, description, sponsor, status,
        estimated_cost, estimated_benefit, estimated_roi,
        strategic_alignment, complexity, submitted_date
      ) VALUES
        (org.id, bu_ids[1], 'Branch staff scheduling optimiser',
         'Workforce optimisation concept for retail branches.',
         'Helen Park', 'Under Review', 420000, 900000, 114,
         4, 3, CURRENT_DATE - 20),
        (org.id, bu_ids[1], 'ESG disclosure automation',
         'Automate sustainability data collection and filings.',
         'Sofia Alvarez', 'Shortlisted', 680000, 1100000, 62,
         5, 4, CURRENT_DATE - 12);
    END IF;

  END LOOP;
END $$;

COMMIT;

-- Quick verification
SELECT
  (SELECT count(*) FROM public.projects) AS projects,
  (SELECT count(*) FROM public.stage_gates) AS stage_gates,
  (SELECT count(*) FROM public.fy_allocations) AS fy_allocations,
  (SELECT count(*) FROM public.financials_monthly) AS financials_monthly,
  (SELECT count(*) FROM public.risks) AS risks,
  (SELECT count(*) FROM public.benefits) AS benefits;
