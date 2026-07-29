-- Fix: infinite recursion in timesheets / timesheet_entries RLS.
-- Cause: timesheets SELECT policy queried timesheet_entries, and
-- timesheet_entries SELECT policy queried timesheets (RLS re-entered).
-- Fix: SECURITY DEFINER helpers for cross-table checks (bypass RLS).

CREATE OR REPLACE FUNCTION public.user_can_view_approved_timesheet_for_cost(
  _user_id uuid,
  _timesheet_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.timesheets t
    WHERE t.id = _timesheet_id
      AND t.status = 'approved'
      AND public.user_has_capability(_user_id, 'capability::timesheet_cost_view')
      AND EXISTS (
        SELECT 1
        FROM public.timesheet_entries e
        WHERE e.timesheet_id = t.id
          AND e.project_id IS NOT NULL
          AND public.user_can_view_project(_user_id, e.project_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_timesheet_row(
  _user_id uuid,
  _timesheet_id uuid,
  _entry_project_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.timesheets t
    WHERE t.id = _timesheet_id
      AND (
        t.user_id = _user_id
        OR public.has_any_admin(_user_id)
        OR public.is_timesheet_approver(_user_id, t.id)
        OR t.manager_user_id = _user_id
        OR (
          t.status = 'approved'
          AND public.user_has_capability(_user_id, 'capability::timesheet_cost_view')
          AND _entry_project_id IS NOT NULL
          AND public.user_can_view_project(_user_id, _entry_project_id)
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_view_approved_timesheet_for_cost(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_read_timesheet_row(uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.user_can_view_approved_timesheet_for_cost(uuid, uuid) IS
  'SECURITY DEFINER: cost viewers may see approved timesheets that include a visible project entry (avoids RLS recursion).';

COMMENT ON FUNCTION public.user_can_read_timesheet_row(uuid, uuid, uuid) IS
  'SECURITY DEFINER: whether a user may read a timesheet / its entries (avoids RLS recursion).';

DROP POLICY IF EXISTS "org read own or approve timesheets" ON public.timesheets;
CREATE POLICY "org read own or approve timesheets" ON public.timesheets
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      user_id = auth.uid()
      OR public.has_any_admin(auth.uid())
      OR public.is_timesheet_approver(auth.uid(), id)
      OR manager_user_id = auth.uid()
      OR public.user_can_view_approved_timesheet_for_cost(auth.uid(), id)
    )
  );

DROP POLICY IF EXISTS "read timesheet_entries" ON public.timesheet_entries;
CREATE POLICY "read timesheet_entries" ON public.timesheet_entries
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.user_can_read_timesheet_row(auth.uid(), timesheet_id, project_id)
  );
