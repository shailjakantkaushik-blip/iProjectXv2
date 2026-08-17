-- Per-resource daily hour cap (configured on Timesheets → Resource setup).
-- Weekly capacity stays in sync as hours_per_day × 5 so utilisation math still works.

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS hours_per_day NUMERIC(4,2) NOT NULL DEFAULT 8;

UPDATE public.resources
SET hours_per_day = LEAST(24, GREATEST(1, ROUND((capacity_hours_week / 5.0)::numeric, 2)))
WHERE capacity_hours_week IS NOT NULL AND capacity_hours_week > 0;

DO $$
BEGIN
  ALTER TABLE public.resources
    ADD CONSTRAINT resources_hours_per_day_range
    CHECK (hours_per_day >= 1 AND hours_per_day <= 24);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.resources.hours_per_day IS
  'Max hours this resource can work in a day. Used to flag Over / Optimal / Under on timesheets, work-item demand, and estimation planning.';

CREATE OR REPLACE FUNCTION public.timesheet_daily_load_note(_timesheet_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap numeric;
  bits text := '';
  over_n int := 0;
  under_n int := 0;
  logged_n int := 0;
  rec record;
  headline text;
  fmt_h text;
  fmt_c text;
BEGIN
  SELECT COALESCE(NULLIF(r.hours_per_day, 0), 8)
  INTO cap
  FROM public.timesheets t
  LEFT JOIN public.resources r
    ON r.org_id = t.org_id
   AND (r.id = t.resource_id OR r.user_id = t.user_id)
  WHERE t.id = _timesheet_id
  ORDER BY CASE WHEN r.id = t.resource_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF cap IS NULL OR cap <= 0 THEN
    cap := 8;
  END IF;
  fmt_c := trim(to_char(cap, 'FM9990.0'));

  FOR rec IN
    SELECT v.lbl, v.hrs
    FROM (
      SELECT 'Mon'::text AS lbl, COALESCE(SUM(e.hours_mon), 0) AS hrs
      FROM public.timesheet_entries e WHERE e.timesheet_id = _timesheet_id
      UNION ALL
      SELECT 'Tue', COALESCE(SUM(e.hours_tue), 0)
      FROM public.timesheet_entries e WHERE e.timesheet_id = _timesheet_id
      UNION ALL
      SELECT 'Wed', COALESCE(SUM(e.hours_wed), 0)
      FROM public.timesheet_entries e WHERE e.timesheet_id = _timesheet_id
      UNION ALL
      SELECT 'Thu', COALESCE(SUM(e.hours_thu), 0)
      FROM public.timesheet_entries e WHERE e.timesheet_id = _timesheet_id
      UNION ALL
      SELECT 'Fri', COALESCE(SUM(e.hours_fri), 0)
      FROM public.timesheet_entries e WHERE e.timesheet_id = _timesheet_id
      UNION ALL
      SELECT 'Sat', COALESCE(SUM(e.hours_sat), 0)
      FROM public.timesheet_entries e WHERE e.timesheet_id = _timesheet_id
      UNION ALL
      SELECT 'Sun', COALESCE(SUM(e.hours_sun), 0)
      FROM public.timesheet_entries e WHERE e.timesheet_id = _timesheet_id
    ) v
  LOOP
    IF rec.hrs <= 0 THEN
      CONTINUE;
    END IF;
    logged_n := logged_n + 1;
    fmt_h := trim(to_char(rec.hrs, 'FM9990.0'));
    IF rec.hrs > cap + 0.01 THEN
      over_n := over_n + 1;
      bits := bits || rec.lbl || ' Over (' || fmt_h || '/' || fmt_c || 'h); ';
    ELSIF rec.hrs < cap * 0.6 THEN
      under_n := under_n + 1;
      bits := bits || rec.lbl || ' Under (' || fmt_h || '/' || fmt_c || 'h); ';
    ELSE
      bits := bits || rec.lbl || ' Optimal (' || fmt_h || '/' || fmt_c || 'h); ';
    END IF;
  END LOOP;

  IF logged_n = 0 THEN
    RETURN 'No hours logged against the ' || fmt_c || 'h daily cap.';
  END IF;

  IF over_n > 0 THEN
    headline := over_n::text || ' day(s) over the ' || fmt_c || 'h/day cap. ';
  ELSIF under_n = logged_n THEN
    headline := 'Hours under the ' || fmt_c || 'h/day cap. ';
  ELSE
    headline := 'Hours within the ' || fmt_c || 'h/day cap. ';
  END IF;

  RETURN headline || bits;
END;
$$;

REVOKE ALL ON FUNCTION public.timesheet_daily_load_note(uuid) FROM PUBLIC;

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
  load_note text;
  over_cap boolean := false;
  under_cap boolean := false;
  pm_title text;
  rm_title text;
  pm_body text;
  rm_body text;
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

  load_note := public.timesheet_daily_load_note(t.id);
  over_cap := load_note ILIKE '% over the %';
  under_cap := (NOT over_cap) AND load_note ILIKE 'Hours under the %';

  IF over_cap THEN
    pm_title := 'Timesheet awaiting PM approval — over daily cap';
    rm_title := 'Timesheet awaiting Resource Manager approval — over daily cap';
  ELSIF under_cap THEN
    pm_title := 'Timesheet awaiting PM approval — under daily cap';
    rm_title := 'Timesheet awaiting Resource Manager approval — under daily cap';
  ELSE
    pm_title := 'Timesheet awaiting PM approval';
    rm_title := 'Timesheet awaiting Resource Manager approval';
  END IF;

  pm_body := 'A timesheet for week starting ' || t.week_start::text
    || ' needs your approval as Project Manager. ' || load_note;
  rm_body := 'A timesheet for week starting ' || t.week_start::text
    || ' needs your approval as Resource Manager. ' || load_note;

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
        pm, t.org_id, 'timesheet_approval', pm_title, pm_body,
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
    INSERT INTO public.timesheet_approvals (org_id, timesheet_id, step, project_id, approver_user_id, status)
    VALUES (t.org_id, t.id, 'rm', NULL, mgr, 'pending');

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      mgr, t.org_id, 'timesheet_approval', rm_title,
      'A non-billable timesheet for week starting ' || t.week_start::text || ' needs your approval. ' || load_note,
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
