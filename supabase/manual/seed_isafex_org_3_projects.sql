-- =============================================================================
-- iSafeX — Create organisation + 3 projects + org admin
-- Paste into Supabase SQL Editor → Run
--
-- Creates / ensures:
--   • Organisation: iSafeX (slug=isafex)
--   • Org admin:    shailja.kant.kaushik@gmail.com  (role org_admin + admin)
--   • 4 business units, 9 stage-gate definitions
--   • 3 sample projects: SAFE-001 … SAFE-003 (Core stream via trigger)
--
-- Notes:
--   • If the auth user does not exist, creates them with password ChangeMe@2026!
--     and profiles.must_change_password = true.
--   • If the user already exists, does NOT reset their password.
--   • Sets profiles.org_id = iSafeX so login lands in this organisation.
--   • Idempotent: safe to re-run (skips existing projects by project_code).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_bu_id uuid;
  v_plan_id uuid;
  v_project_id uuid;
  v_created_user boolean := false;
  v_email text := 'shailja.kant.kaushik@gmail.com';
  v_password text := 'ChangeMe@2026!';
  v_full_name text := 'Shailja Kant Kaushik';
  r record;
BEGIN
  -- ---------- Auth user (reuse if present; create only if missing) ----------
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    v_created_user := true;
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
  END IF;

  -- ---------- Organisation ----------
  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE lower(slug) = 'isafex'
  LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, plan, fy_start_month, brand_name)
    VALUES ('iSafeX', 'isafex', 'enterprise', 4, 'iSafeX')
    RETURNING id INTO v_org_id;
  ELSE
    UPDATE public.organizations
    SET name = 'iSafeX',
        brand_name = coalesce(nullif(brand_name, ''), 'iSafeX'),
        updated_at = now()
    WHERE id = v_org_id;
  END IF;

  -- Home org for this admin (required for org-scoped roles in the app)
  INSERT INTO public.profiles (id, email, full_name, org_id, must_change_password, is_active)
  VALUES (
    v_user_id,
    v_email,
    v_full_name,
    v_org_id,
    CASE WHEN v_created_user THEN true ELSE coalesce(
      (SELECT must_change_password FROM public.profiles WHERE id = v_user_id),
      false
    ) END,
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = coalesce(nullif(public.profiles.full_name, ''), EXCLUDED.full_name),
      org_id = EXCLUDED.org_id,
      is_active = true,
      updated_at = now();

  -- Roles on iSafeX
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND org_id = v_org_id AND role::text = 'org_admin' AND bu_id IS NULL
  ) THEN
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user_id, v_org_id, 'org_admin');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND org_id = v_org_id AND role::text = 'admin' AND bu_id IS NULL
  ) THEN
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user_id, v_org_id, 'admin');
  END IF;

  -- ---------- Business units ----------
  INSERT INTO public.business_units (org_id, name, code)
  SELECT v_org_id, bu.name, bu.code
  FROM (VALUES
    ('Safety Operations', 'SAFE'),
    ('Technology', 'TECH'),
    ('Compliance', 'COMP'),
    ('Field Services', 'FIELD')
  ) AS bu(name, code)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.business_units x
    WHERE x.org_id = v_org_id AND x.code = bu.code
  );

  SELECT id INTO v_bu_id
  FROM public.business_units
  WHERE org_id = v_org_id AND code = 'SAFE'
  LIMIT 1;

  -- ---------- Stage gate definitions ----------
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

  -- ---------- Subscription (optional) ----------
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

  -- ---------- 3 projects ----------
  FOR r IN
    SELECT *
    FROM (VALUES
      (
        'SAFE-001',
        'Permit-to-Work Digitization',
        'Safety Systems',
        'High'::text,
        'In Progress'::text,
        'Green'::text,
        'Hybrid'::text,
        'Build'::text,
        DATE '2025-07-01',
        DATE '2026-06-30',
        DATE '2026-06-15',
        850000::numeric,
        600000::numeric,
        250000::numeric,
        220000::numeric,
        90000::numeric,
        880000::numeric,
        1600000::numeric,
        320000::numeric
      ),
      (
        'SAFE-002',
        'Contractor Induction Portal',
        'Field Enablement',
        'Medium'::text,
        'In Progress'::text,
        'Amber'::text,
        'Agile'::text,
        'Design'::text,
        DATE '2025-10-01',
        DATE '2026-09-30',
        DATE '2026-09-15',
        420000::numeric,
        280000::numeric,
        140000::numeric,
        95000::numeric,
        40000::numeric,
        450000::numeric,
        900000::numeric,
        120000::numeric
      ),
      (
        'SAFE-003',
        'Incident Reporting & Analytics',
        'Compliance Analytics',
        'High'::text,
        'Not Started'::text,
        'Green'::text,
        'Waterfall'::text,
        'Initiate'::text,
        DATE '2026-01-01',
        DATE '2026-12-31',
        DATE '2026-12-15',
        650000::numeric,
        450000::numeric,
        200000::numeric,
        0::numeric,
        0::numeric,
        650000::numeric,
        1200000::numeric,
        0::numeric
      )
    ) AS t(
      project_code, name, program, priority, status, rag, delivery_method, current_phase,
      planned_start, planned_end, go_live,
      budget, capex_a, opex_a, capex_i, opex_i, fac, ben_t, ben_r
    )
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.org_id = v_org_id AND p.project_code = r.project_code
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.projects (
      org_id, bu_id, project_code, name, program, sponsor, priority, status, rag,
      delivery_method, portfolio, pm_user_id,
      planned_start_date, planned_end_date, start_date, end_date, target_go_live,
      budget, capex_approved, opex_approved, capex_incurred, opex_incurred,
      forecast_at_completion, benefits_target, benefits_realised, roi_percent,
      baseline_budget, baseline_capex, baseline_opex, baseline_benefits,
      description, current_phase
    ) VALUES (
      v_org_id, v_bu_id, r.project_code, r.name, r.program,
      v_full_name, r.priority,
      r.status::public.project_status,
      r.rag::public.project_rag,
      r.delivery_method::public.delivery_method,
      'Safety Strategic', v_user_id,
      r.planned_start, r.planned_end, r.planned_start, r.planned_end, r.go_live,
      r.budget, r.capex_a, r.opex_a, r.capex_i, r.opex_i,
      r.fac, r.ben_t, r.ben_r,
      CASE WHEN r.budget > 0 THEN round((r.ben_t - r.budget) / r.budget * 100, 2) ELSE 0 END,
      r.budget, r.capex_a, r.opex_a, r.ben_t,
      'iSafeX sample project for portfolio / financials smoke tests.',
      r.current_phase
    )
    RETURNING id INTO v_project_id;

    -- Ensure Core stream (trigger may already create it)
    INSERT INTO public.project_streams (
      org_id, project_id, name, code, is_default, sort_order,
      budget, capex_approved, opex_approved, forecast_at_completion
    )
    SELECT v_org_id, v_project_id, 'Core', 'CORE', true, 0,
           round(r.budget * 0.60, 2),
           round(r.capex_a * 0.60, 2),
           round(r.opex_a * 0.60, 2),
           round(r.fac * 0.60, 2)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.project_streams s
      WHERE s.project_id = v_project_id AND coalesce(s.is_default, false) = true
    );
  END LOOP;

  IF v_created_user THEN
    RAISE NOTICE 'iSafeX seed OK — NEW user % / password % (must change on first login). org=% user=%',
      v_email, v_password, v_org_id, v_user_id;
  ELSE
    RAISE NOTICE 'iSafeX seed OK — linked existing user %. Home org set to iSafeX. org=% user=%',
      v_email, v_org_id, v_user_id;
  END IF;
END $$;

-- Verification
SELECT
  o.name AS org_name,
  o.slug,
  u.email AS org_admin_email,
  array_agg(DISTINCT ur.role::text ORDER BY ur.role::text) AS roles,
  (SELECT count(*) FROM public.business_units bu WHERE bu.org_id = o.id) AS bus,
  (SELECT count(*) FROM public.projects pr WHERE pr.org_id = o.id) AS projects,
  (SELECT string_agg(pr.project_code, ', ' ORDER BY pr.project_code)
     FROM public.projects pr WHERE pr.org_id = o.id) AS project_codes
FROM public.organizations o
JOIN public.profiles p ON p.org_id = o.id
JOIN auth.users u ON u.id = p.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id AND ur.org_id = o.id
WHERE lower(o.slug) = 'isafex'
  AND lower(u.email) = 'shailja.kant.kaushik@gmail.com'
GROUP BY o.id, o.name, o.slug, u.email;
