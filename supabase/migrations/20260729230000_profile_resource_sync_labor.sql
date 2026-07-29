-- 1) Org member ↔ resource 1:1 sync (same person)
-- 2) Track timesheet labor as a distinct OpEx component (opex_labor_actual)
-- Paste into Supabase SQL Editor, then Reload schema.

-- ========== A) Labor component on monthly financials ==========
ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_labor_actual numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.financials_monthly.opex_labor_actual IS
  'Timesheet labor (FTE) actuals for the month. Included in opex_actual alongside other OpEx.';

-- Re-apply labor rollup: also increments opex_labor_actual
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

  -- Stamp entry costs; billable rows inherit stream from work item when missing
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
    RETURN;
  END IF;

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
      AND e.work_item_id IS NOT NULL
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

    IF sid IS NOT NULL THEN
      UPDATE public.financials_monthly
      SET opex_actual = COALESCE(opex_actual, 0) + rec.cost,
          opex_labor_actual = COALESCE(opex_labor_actual, 0) + rec.cost
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id = sid;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month, opex_actual, opex_labor_actual
        ) VALUES (t.org_id, rec.project_id, sid, period, rec.cost, rec.cost);
      END IF;
    ELSE
      UPDATE public.financials_monthly
      SET opex_actual = COALESCE(opex_actual, 0) + rec.cost,
          opex_labor_actual = COALESCE(opex_labor_actual, 0) + rec.cost
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id IS NULL;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month, opex_actual, opex_labor_actual
        ) VALUES (t.org_id, rec.project_id, NULL, period, rec.cost, rec.cost);
      END IF;
    END IF;
  END LOOP;

  -- Recompute project incurred from monthly actuals for touched projects
  UPDATE public.projects p
  SET
    opex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.opex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0),
    capex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.capex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0),
    updated_at = now()
  WHERE p.id IN (
    SELECT DISTINCT project_id FROM public.timesheet_entries
    WHERE timesheet_id = t.id AND billable = true AND project_id IS NOT NULL
  );

  -- Stream/project rollup when helper exists
  BEGIN
    FOR rec IN
      SELECT DISTINCT project_id AS pid
      FROM public.timesheet_entries
      WHERE timesheet_id = t.id AND billable = true AND project_id IS NOT NULL
    LOOP
      PERFORM public.rollup_project_from_streams(rec.pid);
    END LOOP;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_timesheet_labor_cost(uuid) TO authenticated;

-- ========== B) Sync org profiles → resources (1:1) ==========
CREATE OR REPLACE FUNCTION public.sync_org_resources_from_profiles(_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oid uuid;
  mgr uuid;
  p record;
  created int := 0;
  updated int := 0;
  rid uuid;
  orgs uuid[];
  o uuid;
BEGIN
  IF _org_id IS NOT NULL THEN
    orgs := ARRAY[_org_id];
  ELSE
    IF auth.uid() IS NOT NULL AND NOT public.has_any_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only organisation admins can sync all resources';
    END IF;
    SELECT array_agg(id) INTO orgs FROM public.organizations;
  END IF;

  IF orgs IS NULL THEN
    RETURN jsonb_build_object('created', 0, 'updated', 0);
  END IF;

  FOREACH o IN ARRAY orgs LOOP
    oid := o;

    SELECT ur.user_id INTO mgr
    FROM public.user_roles ur
    WHERE ur.org_id = oid AND ur.role IN ('admin', 'org_admin')
    ORDER BY ur.role
    LIMIT 1;

    FOR p IN
      SELECT pr.id, pr.full_name, pr.email
      FROM public.profiles pr
      WHERE pr.org_id = oid
    LOOP
      SELECT r.id INTO rid
      FROM public.resources r
      WHERE r.org_id = oid AND r.user_id = p.id
      LIMIT 1;

      IF rid IS NULL THEN
        INSERT INTO public.resources (
          org_id, name, email, user_id, manager_user_id,
          capacity_hours_week, cost_rate, status, role
        ) VALUES (
          oid,
          COALESCE(NULLIF(trim(p.full_name), ''), NULLIF(trim(p.email), ''), 'Member'),
          p.email,
          p.id,
          mgr,
          40,
          0,
          'Active',
          'Team member'
        )
        RETURNING id INTO rid;
        created := created + 1;
      ELSE
        UPDATE public.resources
        SET
          name = COALESCE(NULLIF(trim(p.full_name), ''), NULLIF(trim(p.email), ''), name),
          email = COALESCE(p.email, email),
          manager_user_id = COALESCE(manager_user_id, mgr),
          status = COALESCE(NULLIF(status, ''), 'Active')
        WHERE id = rid;
        updated := updated + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('created', created, 'updated', updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_org_resources_from_profiles(uuid) TO authenticated;

-- Auto-sync when a profile is created/updated into an org
CREATE OR REPLACE FUNCTION public.tg_profile_sync_resource()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mgr uuid;
  rid uuid;
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ur.user_id INTO mgr
  FROM public.user_roles ur
  WHERE ur.org_id = NEW.org_id AND ur.role IN ('admin', 'org_admin')
  ORDER BY ur.role
  LIMIT 1;

  SELECT r.id INTO rid
  FROM public.resources r
  WHERE r.org_id = NEW.org_id AND r.user_id = NEW.id
  LIMIT 1;

  IF rid IS NULL THEN
    INSERT INTO public.resources (
      org_id, name, email, user_id, manager_user_id,
      capacity_hours_week, cost_rate, status, role
    ) VALUES (
      NEW.org_id,
      COALESCE(NULLIF(trim(NEW.full_name), ''), NULLIF(trim(NEW.email), ''), 'Member'),
      NEW.email,
      NEW.id,
      mgr,
      40,
      0,
      'Active',
      'Team member'
    );
  ELSE
    UPDATE public.resources
    SET
      name = COALESCE(NULLIF(trim(NEW.full_name), ''), NULLIF(trim(NEW.email), ''), name),
      email = COALESCE(NEW.email, email),
      manager_user_id = COALESCE(manager_user_id, mgr)
    WHERE id = rid;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_sync_resource ON public.profiles;
CREATE TRIGGER trg_profile_sync_resource
  AFTER INSERT OR UPDATE OF org_id, full_name, email
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profile_sync_resource();

-- One-shot backfill for existing orgs
SELECT public.sync_org_resources_from_profiles(NULL);

COMMENT ON FUNCTION public.sync_org_resources_from_profiles(uuid) IS
  'Ensure every org profile has a linked resource (same person). Optional org filter.';
