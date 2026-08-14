-- Custom org roles, timesheet billable/non-billable, labor cost rollup from hourly rates.

-- ========== 1) ORG ROLES CATALOG ==========
CREATE TABLE IF NOT EXISTS public.org_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  label text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, role_key),
  CONSTRAINT org_roles_key_format CHECK (role_key ~ '^[a-z][a-z0-9_]{1,62}$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_roles TO authenticated;
GRANT ALL ON public.org_roles TO service_role;
ALTER TABLE public.org_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read org_roles" ON public.org_roles;
CREATE POLICY "org read org_roles" ON public.org_roles
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "admins write org_roles" ON public.org_roles;
CREATE POLICY "admins write org_roles" ON public.org_roles
  FOR ALL TO authenticated
  USING (
    (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
    OR public.is_platform_admin(auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_org_roles_org ON public.org_roles(org_id, sort_order);

-- Seed system roles for every organisation
INSERT INTO public.org_roles (org_id, role_key, label, description, is_system, sort_order)
SELECT o.id, v.role_key, v.label, v.description, true, v.sort_order
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('admin', 'Admin', 'Full organisation administrator', 10),
    ('org_admin', 'Org Admin', 'Organisation administrator', 20),
    ('bu_lead', 'BU Lead', 'Business unit lead', 30),
    ('pm', 'Project Manager', 'Project delivery manager', 40),
    ('executive', 'Executive', 'Executive / portfolio viewer', 50)
) AS v(role_key, label, description, sort_order)
ON CONFLICT (org_id, role_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tg_seed_org_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.org_roles (org_id, role_key, label, description, is_system, sort_order)
  VALUES
    (NEW.id, 'admin', 'Admin', 'Full organisation administrator', true, 10),
    (NEW.id, 'org_admin', 'Org Admin', 'Organisation administrator', true, 20),
    (NEW.id, 'bu_lead', 'BU Lead', 'Business unit lead', true, 30),
    (NEW.id, 'pm', 'Project Manager', 'Project delivery manager', true, 40),
    (NEW.id, 'executive', 'Executive', 'Executive / portfolio viewer', true, 50)
  ON CONFLICT (org_id, role_key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_org_roles ON public.organizations;
CREATE TRIGGER trg_seed_org_roles
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_org_roles();

-- Convert role columns from enum → text so custom roles can be stored.
-- Postgres forbids ALTER TYPE on a column while RLS policies reference it
-- (e.g. cert_org_admin_select on org_license_certificates). Drop dependents,
-- alter, then recreate.
DROP POLICY IF EXISTS "cert_org_admin_select" ON public.org_license_certificates;

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE text USING role::text;

ALTER TABLE public.role_table_permissions
  ALTER COLUMN role TYPE text USING role::text;

-- Recreate policy that referenced user_roles.role (now text).
CREATE POLICY "cert_org_admin_select"
  ON public.org_license_certificates FOR SELECT
  TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id  = public.get_user_org(auth.uid())
        AND ur.role IN ('admin','org_admin')
    )
  );

-- has_role / has_any_admin accept text
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (
        _role = 'platform_admin'
        OR ur.org_id IS NULL
        OR ur.org_id = public.get_user_org(_user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin', 'org_admin')
      AND ur.org_id = public.get_user_org(_user_id)
  );
$$;

-- ========== 2) TIMESHEET BILLABLE / NON-BILLABLE + LABOR COST ==========
ALTER TABLE public.timesheet_entries
  ALTER COLUMN project_id DROP NOT NULL,
  ALTER COLUMN work_item_id DROP NOT NULL;

ALTER TABLE public.timesheet_entries
  ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS custom_task text,
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS labor_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE SET NULL;

-- Replace unique (timesheet_id, work_item_id) with partial uniques
ALTER TABLE public.timesheet_entries
  DROP CONSTRAINT IF EXISTS timesheet_entries_timesheet_id_work_item_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_timesheet_entries_billable_wi
  ON public.timesheet_entries (timesheet_id, work_item_id)
  WHERE billable = true AND work_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_timesheet_entries_nonbillable_task
  ON public.timesheet_entries (timesheet_id, lower(custom_task))
  WHERE billable = false AND custom_task IS NOT NULL;

ALTER TABLE public.timesheet_entries
  DROP CONSTRAINT IF EXISTS timesheet_entries_billable_shape;

ALTER TABLE public.timesheet_entries
  ADD CONSTRAINT timesheet_entries_billable_shape CHECK (
    (
      billable = true
      AND project_id IS NOT NULL
      AND work_item_id IS NOT NULL
      AND (custom_task IS NULL OR length(trim(custom_task)) = 0)
    )
    OR (
      billable = false
      AND custom_task IS NOT NULL
      AND length(trim(custom_task)) > 0
      AND work_item_id IS NULL
    )
  );

COMMENT ON COLUMN public.resources.cost_rate IS
  'Hourly cost rate (org currency). Used to compute timesheet labor cost → stream/project/portfolio.';

-- Apply approved timesheet labor into financials_monthly.opex_actual and project incurred
CREATE OR REPLACE FUNCTION public.apply_timesheet_labor_cost(_timesheet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.timesheets;
  rate numeric(12,2);
  rec record;
  period date;
  hours numeric;
  cost numeric;
  sid uuid;
BEGIN
  SELECT * INTO t FROM public.timesheets WHERE id = _timesheet_id;
  IF NOT FOUND OR t.status <> 'approved' THEN
    RETURN;
  END IF;

  SELECT COALESCE(r.cost_rate, 0) INTO rate
  FROM public.resources r
  WHERE r.id = t.resource_id OR (r.org_id = t.org_id AND r.user_id = t.user_id)
  ORDER BY CASE WHEN r.id = t.resource_id THEN 0 ELSE 1 END
  LIMIT 1;
  rate := COALESCE(rate, 0);

  -- Stamp entry costs (billable only contributes to project financials)
  UPDATE public.timesheet_entries e
  SET hourly_rate = rate,
      labor_cost = ROUND(
        rate * (e.hours_mon + e.hours_tue + e.hours_wed + e.hours_thu
                + e.hours_fri + e.hours_sat + e.hours_sun),
        2
      ),
      stream_id = COALESCE(
        e.stream_id,
        (SELECT wi.stream_id FROM public.work_items wi WHERE wi.id = e.work_item_id)
      )
  WHERE e.timesheet_id = t.id;

  IF rate <= 0 THEN
    RETURN; -- no rate configured — hours still logged, no $ rollup
  END IF;

  -- Distribute billable cost into the week_start month (OpEx actual) per project/stream
  period := date_trunc('month', t.week_start)::date;

  FOR rec IN
    SELECT e.project_id,
           COALESCE(e.stream_id, wi.stream_id) AS stream_id,
           SUM(e.labor_cost) AS cost
    FROM public.timesheet_entries e
    LEFT JOIN public.work_items wi ON wi.id = e.work_item_id
    WHERE e.timesheet_id = t.id
      AND e.billable = true
      AND e.project_id IS NOT NULL
    GROUP BY e.project_id, COALESCE(e.stream_id, wi.stream_id)
  LOOP
    sid := rec.stream_id;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id AND COALESCE(is_default, false) = true
      LIMIT 1;
    END IF;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id
      ORDER BY sort_order NULLS LAST
      LIMIT 1;
    END IF;

    -- Upsert into stream-aware unique indexes
    IF sid IS NOT NULL THEN
      UPDATE public.financials_monthly
      SET opex_actual = COALESCE(opex_actual, 0) + rec.cost
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id = sid;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month, opex_actual
        ) VALUES (t.org_id, rec.project_id, sid, period, rec.cost);
      END IF;
    ELSE
      UPDATE public.financials_monthly
      SET opex_actual = COALESCE(opex_actual, 0) + rec.cost
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id IS NULL;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month, opex_actual
        ) VALUES (t.org_id, rec.project_id, NULL, period, rec.cost);
      END IF;
    END IF;
  END LOOP;

  -- Recompute project incurred from monthly actuals for touched projects
  FOR rec IN
    SELECT DISTINCT project_id FROM public.timesheet_entries
    WHERE timesheet_id = t.id AND billable = true AND project_id IS NOT NULL
  LOOP
    UPDATE public.projects p
    SET
      opex_incurred = COALESCE((
        SELECT SUM(COALESCE(fm.opex_actual, 0)) FROM public.financials_monthly fm
        WHERE fm.project_id = rec.project_id
      ), 0),
      capex_incurred = COALESCE((
        SELECT SUM(COALESCE(fm.capex_actual, 0)) FROM public.financials_monthly fm
        WHERE fm.project_id = rec.project_id
      ), 0)
    WHERE p.id = rec.project_id;
  END LOOP;
END;
$$;

-- Patch act_on_timesheet_approval to call labor cost apply on final RM approve
CREATE OR REPLACE FUNCTION public.act_on_timesheet_approval(
  _approval_id uuid,
  _decision text,
  _comment text DEFAULT NULL
)
RETURNS public.timesheets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.timesheet_approvals;
  t public.timesheets;
  pending_pm int;
BEGIN
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;

  SELECT * INTO a FROM public.timesheet_approvals WHERE id = _approval_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval not found'; END IF;
  IF a.approver_user_id <> auth.uid() AND NOT public.has_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'You are not the nominated approver';
  END IF;
  IF a.status <> 'pending' THEN
    RAISE EXCEPTION 'This approval step is already %', a.status;
  END IF;

  SELECT * INTO t FROM public.timesheets WHERE id = a.timesheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timesheet not found'; END IF;

  IF a.step = 'pm' AND t.status <> 'pending_pm' THEN
    RAISE EXCEPTION 'PM approval is not active (status %)', t.status;
  END IF;
  IF a.step = 'rm' AND t.status <> 'pending_rm' THEN
    RAISE EXCEPTION 'Resource Manager approval is not active (status %)', t.status;
  END IF;

  UPDATE public.timesheet_approvals
  SET status = _decision, comment = _comment, acted_at = now()
  WHERE id = a.id;

  IF _decision = 'rejected' THEN
    UPDATE public.timesheets
    SET status = 'rejected', rejected_at = now(), rejected_by = auth.uid(),
        rejection_reason = COALESCE(_comment, 'Rejected')
    WHERE id = t.id
    RETURNING * INTO t;

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      t.user_id, t.org_id, 'timesheet_rejected', 'Timesheet rejected',
      'Your timesheet for week starting ' || t.week_start::text || ' was rejected.',
      '/app/timesheets'
    );
    RETURN t;
  END IF;

  IF a.step = 'pm' THEN
    SELECT COUNT(*) INTO pending_pm
    FROM public.timesheet_approvals
    WHERE timesheet_id = t.id AND step = 'pm' AND status = 'pending';

    IF pending_pm = 0 THEN
      INSERT INTO public.timesheet_approvals (org_id, timesheet_id, step, project_id, approver_user_id, status)
      VALUES (t.org_id, t.id, 'rm', NULL, t.manager_user_id, 'pending')
      ON CONFLICT (timesheet_id) WHERE step = 'rm'
      DO UPDATE SET
        status = 'pending', acted_at = NULL, comment = NULL,
        approver_user_id = EXCLUDED.approver_user_id;

      UPDATE public.timesheets SET status = 'pending_rm' WHERE id = t.id RETURNING * INTO t;

      INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
      VALUES (
        t.manager_user_id, t.org_id, 'timesheet_approval',
        'Timesheet awaiting Resource Manager approval',
        'A timesheet for week starting ' || t.week_start::text || ' needs your approval as Resource Manager.',
        '/app/timesheets?tab=approvals'
      );
    END IF;
  ELSIF a.step = 'rm' THEN
    UPDATE public.timesheets SET status = 'approved' WHERE id = t.id RETURNING * INTO t;

    -- Recompute actual hours on work items from approved sheets
    UPDATE public.work_items wi
    SET actual_hours = COALESCE(agg.total, 0)
    FROM (
      SELECT e.work_item_id,
             SUM(
               e.hours_mon + e.hours_tue + e.hours_wed + e.hours_thu
               + e.hours_fri + e.hours_sat + e.hours_sun
             ) AS total
      FROM public.timesheet_entries e
      JOIN public.timesheets ts ON ts.id = e.timesheet_id
      WHERE ts.status = 'approved'
        AND e.billable = true
        AND e.work_item_id IS NOT NULL
        AND e.work_item_id IN (
          SELECT e2.work_item_id FROM public.timesheet_entries e2
          WHERE e2.timesheet_id = t.id AND e2.work_item_id IS NOT NULL
        )
      GROUP BY e.work_item_id
    ) agg
    WHERE wi.id = agg.work_item_id;

    PERFORM public.apply_timesheet_labor_cost(t.id);

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      t.user_id, t.org_id, 'timesheet_approved', 'Timesheet approved',
      'Your timesheet for week starting ' || t.week_start::text || ' was fully approved.',
      '/app/timesheets'
    );
  END IF;

  SELECT * INTO t FROM public.timesheets WHERE id = COALESCE(t.id, a.timesheet_id);
  RETURN t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.act_on_timesheet_approval(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_timesheet_labor_cost(uuid) TO authenticated;

-- Submit: billable → PM then RM; non-billable-only → RM directly
CREATE OR REPLACE FUNCTION public.submit_timesheet(_timesheet_id uuid)
RETURNS public.timesheets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.timesheets;
  mgr uuid;
  rid uuid;
  proj record;
  pm uuid;
  missing_pm text;
  has_billable boolean;
BEGIN
  SELECT * INTO t FROM public.timesheets WHERE id = _timesheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timesheet not found'; END IF;
  IF t.user_id <> auth.uid() AND NOT public.has_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the timesheet owner can submit';
  END IF;
  IF t.status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Timesheet is not editable (status %)', t.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.timesheet_entries e WHERE e.timesheet_id = t.id) THEN
    RAISE EXCEPTION 'Add at least one row before submitting';
  END IF;

  SELECT r.id, r.manager_user_id INTO rid, mgr
  FROM public.resources r
  WHERE r.org_id = t.org_id AND r.user_id = t.user_id
  LIMIT 1;

  IF mgr IS NULL THEN
    RAISE EXCEPTION 'Resource Manager is not configured for your resource profile. Ask an admin to set your manager.';
  END IF;

  DELETE FROM public.timesheet_approvals WHERE timesheet_id = t.id;

  SELECT EXISTS (
    SELECT 1 FROM public.timesheet_entries e
    WHERE e.timesheet_id = t.id AND e.billable = true
  ) INTO has_billable;

  IF has_billable THEN
    missing_pm := NULL;
    FOR proj IN
      SELECT DISTINCT e.project_id, p.name AS project_name, p.pm_user_id
      FROM public.timesheet_entries e
      JOIN public.projects p ON p.id = e.project_id
      WHERE e.timesheet_id = t.id AND e.billable = true
    LOOP
      pm := proj.pm_user_id;
      IF pm IS NULL THEN
        missing_pm := COALESCE(missing_pm || ', ', '') || COALESCE(proj.project_name, proj.project_id::text);
        CONTINUE;
      END IF;
      INSERT INTO public.timesheet_approvals (org_id, timesheet_id, step, project_id, approver_user_id, status)
      VALUES (t.org_id, t.id, 'pm', proj.project_id, pm, 'pending');

      INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
      VALUES (
        pm, t.org_id, 'timesheet_approval', 'Timesheet awaiting PM approval',
        'A timesheet for week starting ' || t.week_start::text || ' needs your approval as Project Manager.',
        '/app/timesheets?tab=approvals'
      );
    END LOOP;

    IF missing_pm IS NOT NULL THEN
      RAISE EXCEPTION 'Project Manager is not set on: %', missing_pm;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.timesheet_approvals WHERE timesheet_id = t.id AND step = 'pm') THEN
      RAISE EXCEPTION 'No project PM approvals could be created';
    END IF;

    UPDATE public.timesheets
    SET status = 'pending_pm', manager_user_id = mgr, resource_id = rid,
        submitted_at = now(), rejected_at = NULL, rejected_by = NULL, rejection_reason = NULL
    WHERE id = t.id
    RETURNING * INTO t;
  ELSE
    -- Non-billable only → Resource Manager
    INSERT INTO public.timesheet_approvals (org_id, timesheet_id, step, project_id, approver_user_id, status)
    VALUES (t.org_id, t.id, 'rm', NULL, mgr, 'pending');

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      mgr, t.org_id, 'timesheet_approval',
      'Timesheet awaiting Resource Manager approval',
      'A non-billable timesheet for week starting ' || t.week_start::text || ' needs your approval.',
      '/app/timesheets?tab=approvals'
    );

    UPDATE public.timesheets
    SET status = 'pending_rm', manager_user_id = mgr, resource_id = rid,
        submitted_at = now(), rejected_at = NULL, rejected_by = NULL, rejection_reason = NULL
    WHERE id = t.id
    RETURNING * INTO t;
  END IF;

  RETURN t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_timesheet(uuid) TO authenticated;
