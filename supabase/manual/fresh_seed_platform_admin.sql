-- =============================================================================
-- iProjectX — Fresh bootstrap seed (new empty Supabase project)
-- Prerequisites: full schema already applied
--   (supabase/manual/iprojectx_full_platform_schema.sql)
--
-- Creates:
--   • Platform admin auth user: admin@iprojectx.com
--   • Organisation: iProjectX (slug=iprojectx)
--   • Roles: platform_admin + org_admin + admin
--   • 4 business units, 9 stage-gate definitions
--   • Enterprise subscription (uses existing billing_plans if present)
--   • One sample project DEMO-001 (Core stream + gates/milestones via triggers)
--
-- Default password (change after first login):
--   ChangeMe@2026!
--   profiles.must_change_password = true
--
-- Run in Supabase SQL Editor (new project) as postgres / service role.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_bu_id uuid;
  v_plan_id uuid;
  v_project_id uuid;
  v_email text := 'admin@iprojectx.com';
  v_password text := 'ChangeMe@2026!';
  v_full_name text := 'Platform Admin';
BEGIN
  -- ---------- Auth user ----------
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_full_name),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );
  ELSE
    -- Reset password if user already exists (idempotent re-seed)
    UPDATE auth.users
    SET encrypted_password = crypt(v_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- ---------- Organisation ----------
  SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'iprojectx';
  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, plan, fy_start_month, brand_name)
    VALUES ('iProjectX', 'iprojectx', 'enterprise', 4, 'iProjectX')
    RETURNING id INTO v_org_id;
  END IF;

  -- Profile (handle_new_user may have created a stub without org)
  INSERT INTO public.profiles (id, email, full_name, org_id, must_change_password, is_active)
  VALUES (v_user_id, v_email, v_full_name, v_org_id, true, true)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      org_id = EXCLUDED.org_id,
      must_change_password = true,
      is_active = true;

  -- Roles (text role keys)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND org_id = v_org_id AND role = 'platform_admin' AND bu_id IS NULL
  ) THEN
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user_id, v_org_id, 'platform_admin');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND org_id = v_org_id AND role = 'org_admin' AND bu_id IS NULL
  ) THEN
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user_id, v_org_id, 'org_admin');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND org_id = v_org_id AND role = 'admin' AND bu_id IS NULL
  ) THEN
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user_id, v_org_id, 'admin');
  END IF;

  -- ---------- Business units ----------
  INSERT INTO public.business_units (org_id, name, code)
  SELECT v_org_id, bu.name, bu.code
  FROM (VALUES
    ('Technology', 'TECH'),
    ('Operations', 'OPS'),
    ('Finance', 'FIN'),
    ('Customer', 'CUST')
  ) AS bu(name, code)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.business_units x
    WHERE x.org_id = v_org_id AND x.code = bu.code
  );

  SELECT id INTO v_bu_id
  FROM public.business_units
  WHERE org_id = v_org_id AND code = 'TECH'
  LIMIT 1;

  -- ---------- Stage gate definitions (canonical 9) ----------
  INSERT INTO public.stage_gate_definitions (org_id, gate_name, sort_order, is_active)
  SELECT v_org_id, g.name, g.ord, true
  FROM (VALUES
    ('Initiate', 1),
    ('Discover', 2),
    ('Design', 3),
    ('Build', 4),
    ('Test', 5),
    ('Deploy', 6),
    ('Hypercare', 7),
    ('Close', 8),
    ('Benefit Realisation', 9)
  ) AS g(name, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stage_gate_definitions x
    WHERE x.org_id = v_org_id AND x.gate_name = g.name
  );

  -- ---------- Subscription (optional — needs billing_plans from schema) ----------
  SELECT id INTO v_plan_id FROM public.billing_plans WHERE code = 'business' LIMIT 1;
  IF v_plan_id IS NULL THEN
    SELECT id INTO v_plan_id FROM public.billing_plans ORDER BY sort_order DESC NULLS LAST LIMIT 1;
  END IF;

  IF v_plan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions s WHERE s.org_id = v_org_id
  ) THEN
    INSERT INTO public.subscriptions (
      org_id, plan_id, status, current_period_start, current_period_end
    ) VALUES (
      v_org_id, v_plan_id, 'active', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year'
    );
  END IF;

  -- ---------- Sample project ----------
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.org_id = v_org_id AND p.project_code = 'DEMO-001'
  ) THEN
    INSERT INTO public.projects (
      org_id, bu_id, project_code, name, program, sponsor, priority, status, rag,
      delivery_method, portfolio,
      planned_start_date, planned_end_date, start_date, end_date, target_go_live,
      budget, capex_approved, opex_approved, capex_incurred, opex_incurred,
      forecast_at_completion, benefits_target, benefits_realised, roi_percent,
      baseline_budget, baseline_capex, baseline_opex, baseline_benefits,
      description, current_phase
    ) VALUES (
      v_org_id, v_bu_id, 'DEMO-001', 'Sample Dual-Stream Delivery', 'Demo Program',
      'Platform Admin',       'High', 'In Progress', 'Green',
      'Hybrid', 'IT Strategic',
      DATE '2025-04-01', DATE '2026-03-31', DATE '2025-04-01', DATE '2026-03-31', DATE '2026-03-15',
      1000000, 700000, 300000, 250000, 80000,
      1050000, 2000000, 400000, 100,
      1000000, 700000, 300000, 2000000,
      'Fresh-seed demo project for Financials / Health / Executive smoke tests.',
      'Build'
    )
    RETURNING id INTO v_project_id;

    -- Ensure Core stream exists (always-on Core trigger may already create it)
    INSERT INTO public.project_streams (
      org_id, project_id, name, code, is_default, sort_order,
      budget, capex_approved, opex_approved, forecast_at_completion
    )
    SELECT v_org_id, v_project_id, 'Core', 'CORE', true, 0,
           600000, 420000, 180000, 630000
    WHERE NOT EXISTS (
      SELECT 1 FROM public.project_streams s
      WHERE s.project_id = v_project_id AND coalesce(s.is_default, false) = true
    );

    INSERT INTO public.project_streams (
      org_id, project_id, name, code, is_default, sort_order,
      budget, capex_approved, opex_approved, forecast_at_completion
    )
    SELECT v_org_id, v_project_id, 'Platform', 'PLT', false, 1,
           400000, 280000, 120000, 420000
    WHERE NOT EXISTS (
      SELECT 1 FROM public.project_streams s
      WHERE s.project_id = v_project_id AND s.code = 'PLT'
    );
  END IF;

  RAISE NOTICE 'Fresh seed OK — sign in as % with password ChangeMe@2026! (must change on first login). org=% user=%',
    v_email, v_org_id, v_user_id;
END $$;

-- Verification
SELECT
  u.email,
  p.full_name,
  p.must_change_password,
  o.name AS org_name,
  o.slug,
  array_agg(DISTINCT ur.role ORDER BY ur.role) AS roles,
  (SELECT count(*) FROM public.business_units bu WHERE bu.org_id = o.id) AS bus,
  (SELECT count(*) FROM public.projects pr WHERE pr.org_id = o.id) AS projects
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
JOIN public.organizations o ON o.id = p.org_id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id AND ur.org_id = o.id
WHERE lower(u.email) = 'admin@iprojectx.com'
GROUP BY u.email, p.full_name, p.must_change_password, o.name, o.slug, o.id;
