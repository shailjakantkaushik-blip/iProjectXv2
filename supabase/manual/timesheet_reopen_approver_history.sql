-- Approver history + reopen / withdraw timesheets
-- Paste in Supabase SQL Editor, then Reload schema.

-- Allow superseded approval rows (kept for history when sheet reopens / resubmits)
ALTER TABLE public.timesheet_approvals
  DROP CONSTRAINT IF EXISTS timesheet_approvals_status_check;

ALTER TABLE public.timesheet_approvals
  ADD CONSTRAINT timesheet_approvals_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'superseded'));

ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS reopen_reason text,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.timesheets.reopen_reason IS
  'Reason captured when an approver/admin reopens an approved timesheet to draft.';

-- Recompute work-item actual hours from remaining approved sheets
CREATE OR REPLACE FUNCTION public.recompute_work_item_hours_from_timesheets(_work_item_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _work_item_ids IS NULL OR array_length(_work_item_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.work_items wi
  SET actual_hours = COALESCE(agg.total, 0)
  FROM (
    SELECT e.work_item_id,
           SUM(
             COALESCE(e.hours_mon, 0) + COALESCE(e.hours_tue, 0) + COALESCE(e.hours_wed, 0)
             + COALESCE(e.hours_thu, 0) + COALESCE(e.hours_fri, 0) + COALESCE(e.hours_sat, 0)
             + COALESCE(e.hours_sun, 0)
           ) AS total
    FROM public.timesheet_entries e
    JOIN public.timesheets ts ON ts.id = e.timesheet_id
    WHERE ts.status = 'approved'
      AND e.billable = true
      AND e.work_item_id = ANY (_work_item_ids)
    GROUP BY e.work_item_id
  ) agg
  WHERE wi.id = agg.work_item_id;

  -- Zero out items that no longer have approved hours
  UPDATE public.work_items wi
  SET actual_hours = 0
  WHERE wi.id = ANY (_work_item_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.timesheet_entries e
      JOIN public.timesheets ts ON ts.id = e.timesheet_id
      WHERE e.work_item_id = wi.id
        AND ts.status = 'approved'
        AND e.billable = true
    );
END;
$$;

-- Recompute FTE labor for project/stream months (idempotent from approved sheets)
CREATE OR REPLACE FUNCTION public.recompute_opex_labor_for_projects_period(
  _org_id uuid,
  _project_ids uuid[],
  _period date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  sid uuid;
  labor numeric(14, 2);
  period date := date_trunc('month', _period)::date;
BEGIN
  IF _project_ids IS NULL OR array_length(_project_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT DISTINCT e.project_id,
           COALESCE(e.stream_id, wi.stream_id) AS stream_id
    FROM public.timesheet_entries e
    LEFT JOIN public.work_items wi ON wi.id = e.work_item_id
    JOIN public.timesheets ts ON ts.id = e.timesheet_id
    WHERE e.project_id = ANY (_project_ids)
      AND date_trunc('month', ts.week_start)::date = period
      AND e.billable = true
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

    SELECT COALESCE(SUM(e.labor_cost), 0) INTO labor
    FROM public.timesheet_entries e
    JOIN public.timesheets ts ON ts.id = e.timesheet_id
    LEFT JOIN public.work_items wi ON wi.id = e.work_item_id
    WHERE ts.status = 'approved'
      AND e.billable = true
      AND e.project_id = rec.project_id
      AND date_trunc('month', ts.week_start)::date = period
      AND COALESCE(e.stream_id, wi.stream_id, sid) IS NOT DISTINCT FROM sid;

    IF sid IS NOT NULL THEN
      UPDATE public.financials_monthly
      SET opex_labor_actual = labor,
          opex_other_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))),
          opex_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))) + labor
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id = sid;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month,
          opex_actual, opex_labor_actual, opex_other_actual
        ) VALUES (_org_id, rec.project_id, sid, period, labor, labor, 0);
      END IF;
    ELSE
      UPDATE public.financials_monthly
      SET opex_labor_actual = labor,
          opex_other_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))),
          opex_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))) + labor
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id IS NULL;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month,
          opex_actual, opex_labor_actual, opex_other_actual
        ) VALUES (_org_id, rec.project_id, NULL, period, labor, labor, 0);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.projects p
  SET
    opex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.opex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0),
    capex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.capex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0)
  WHERE p.id = ANY (_project_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_timesheet(
  _timesheet_id uuid,
  _reason text DEFAULT NULL
)
RETURNS public.timesheets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.timesheets;
  project_ids uuid[];
  wi_ids uuid[];
  period date;
BEGIN
  SELECT * INTO t FROM public.timesheets WHERE id = _timesheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timesheet not found';
  END IF;

  IF t.org_id <> public.get_user_org(auth.uid()) THEN
    RAISE EXCEPTION 'Wrong organisation';
  END IF;

  IF NOT (
    public.has_any_admin(auth.uid())
    OR public.is_timesheet_approver(auth.uid(), t.id)
    OR t.manager_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only an approver, resource manager, or org admin can reopen this timesheet';
  END IF;

  IF t.status <> 'approved' THEN
    RAISE EXCEPTION 'Only fully approved timesheets can be reopened (current status: %)', t.status;
  END IF;

  SELECT ARRAY_AGG(DISTINCT e.project_id) FILTER (WHERE e.project_id IS NOT NULL),
         ARRAY_AGG(DISTINCT e.work_item_id) FILTER (WHERE e.work_item_id IS NOT NULL)
  INTO project_ids, wi_ids
  FROM public.timesheet_entries e
  WHERE e.timesheet_id = t.id;

  period := date_trunc('month', t.week_start)::date;

  UPDATE public.timesheet_approvals
  SET status = 'superseded'
  WHERE timesheet_id = t.id
    AND status IN ('pending', 'approved', 'rejected');

  UPDATE public.timesheets
  SET status = 'draft',
      rejection_reason = NULL,
      rejected_at = NULL,
      rejected_by = NULL,
      submitted_at = NULL,
      reopen_reason = NULLIF(trim(COALESCE(_reason, '')), ''),
      reopened_at = now(),
      reopened_by = auth.uid()
  WHERE id = t.id
  RETURNING * INTO t;

  -- Clear labor stamps on this sheet; remaining approved sheets drive finance
  UPDATE public.timesheet_entries
  SET labor_cost = 0
  WHERE timesheet_id = t.id;

  PERFORM public.recompute_work_item_hours_from_timesheets(wi_ids);
  PERFORM public.recompute_opex_labor_for_projects_period(t.org_id, project_ids, period);

  INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
  VALUES (
    t.user_id,
    t.org_id,
    'timesheet_reopened',
    'Timesheet reopened',
    'Your timesheet for week starting ' || t.week_start::text
      || ' was returned to draft'
      || CASE WHEN t.reopen_reason IS NOT NULL THEN ': ' || t.reopen_reason ELSE '.' END,
    '/app/timesheets'
  );

  RETURN t;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_timesheet(_timesheet_id uuid)
RETURNS public.timesheets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.timesheets;
BEGIN
  SELECT * INTO t FROM public.timesheets WHERE id = _timesheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timesheet not found';
  END IF;

  IF t.user_id <> auth.uid() AND NOT public.has_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the timesheet owner (or org admin) can withdraw';
  END IF;

  IF t.status NOT IN ('pending_pm', 'pending_rm') THEN
    RAISE EXCEPTION 'Only timesheets awaiting approval can be withdrawn';
  END IF;

  UPDATE public.timesheet_approvals
  SET status = 'superseded'
  WHERE timesheet_id = t.id
    AND status = 'pending';

  UPDATE public.timesheets
  SET status = 'draft',
      submitted_at = NULL,
      rejection_reason = NULL,
      rejected_at = NULL,
      rejected_by = NULL
  WHERE id = t.id
  RETURNING * INTO t;

  RETURN t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_work_item_hours_from_timesheets(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_opex_labor_for_projects_period(uuid, uuid[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_timesheet(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_timesheet(uuid) TO authenticated;
