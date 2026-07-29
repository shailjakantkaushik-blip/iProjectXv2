-- Cost quick view / org reporting / PM resource setup access
-- 1) Capability helper (default: org admin + PM for timesheet_cost_view)
-- 2) Approved timesheet read for cost viewers on projects they can view
-- 3) PM can update rates/managers for resources on their editable projects
-- 4) Ensure capability seed includes pm (+ admin/org_admin)

CREATE OR REPLACE FUNCTION public.user_has_capability(_user_id uuid, _cap text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_row boolean;
  allowed boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_any_admin(_user_id) THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_table_permissions p
      ON p.org_id = ur.org_id AND p.role = ur.role
    WHERE ur.user_id = _user_id
      AND p.table_name = _cap
  ) INTO has_row;

  IF has_row THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_table_permissions p
        ON p.org_id = ur.org_id AND p.role = ur.role
      WHERE ur.user_id = _user_id
        AND p.table_name = _cap
        AND COALESCE(p.can_edit, false) = true
    ) INTO allowed;
    RETURN allowed;
  END IF;

  -- Unconfigured defaults
  IF _cap = 'capability::timesheet_cost_view' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role IN ('pm', 'admin', 'org_admin')
    );
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_has_capability(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.user_has_capability(uuid, text) IS
  'True when user is admin or has can_edit on the capability row; timesheet_cost_view defaults to org admin + PM when unconfigured.';

-- ========== Timesheets: cost viewers may read approved sheets for visible projects ==========
-- Cross-table checks must be SECURITY DEFINER — policy EXISTS loops between
-- timesheets ↔ timesheet_entries cause "infinite recursion detected in policy".
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

-- ========== PM / cost viewers: update rates for resources on editable projects ==========
DROP POLICY IF EXISTS "pm update team resource rates" ON public.resources;
CREATE POLICY "pm update team resource rates" ON public.resources
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.user_has_capability(auth.uid(), 'capability::timesheet_cost_view')
    AND (
      public.has_any_admin(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.resource_allocations ra
        WHERE ra.resource_id = resources.id
          AND public.can_edit_project(auth.uid(), ra.project_id)
      )
    )
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
  );

-- ========== Seed / refresh capability for admin, org_admin, pm ==========
INSERT INTO public.role_table_permissions (org_id, role, table_name, can_view, can_edit)
SELECT o.id, r.role_key, 'capability::timesheet_cost_view', true, true
FROM public.organizations o
CROSS JOIN (
  VALUES ('admin'), ('org_admin'), ('pm')
) AS r(role_key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_table_permissions p
  WHERE p.org_id = o.id
    AND p.role = r.role_key
    AND p.table_name = 'capability::timesheet_cost_view'
);
