-- People and resource managers can apply/remove leave for themselves / their team.
-- Org admins keep the existing FOR ALL policy on resource_leaves and org_public_holidays.

DROP POLICY IF EXISTS "self and managers modify resource_leaves" ON public.resource_leaves;
CREATE POLICY "self and managers modify resource_leaves" ON public.resource_leaves
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.resources r
      WHERE r.id = resource_leaves.resource_id
        AND r.org_id = resource_leaves.org_id
        AND (r.user_id = auth.uid() OR r.manager_user_id = auth.uid())
    )
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.resources r
      WHERE r.id = resource_leaves.resource_id
        AND r.org_id = resource_leaves.org_id
        AND (r.user_id = auth.uid() OR r.manager_user_id = auth.uid())
    )
  );

-- Seed Apply leave page ACL for roles that already see Resources, Timesheets, or My Work.
INSERT INTO public.role_table_permissions (org_id, role, table_name, can_view, can_edit)
SELECT
  x.org_id,
  x.role,
  'page::/app/apply-leave',
  bool_or(x.can_view),
  bool_or(x.can_edit)
FROM public.role_table_permissions x
WHERE x.table_name IN ('page::/app/resources', 'page::/app/timesheets', 'page::/app/my-work')
  AND NOT EXISTS (
    SELECT 1
    FROM public.role_table_permissions y
    WHERE y.org_id = x.org_id
      AND y.role = x.role
      AND y.table_name = 'page::/app/apply-leave'
  )
GROUP BY x.org_id, x.role;

CREATE OR REPLACE FUNCTION public.seed_default_page_permissions(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paths text[] := ARRAY[
    '/app','/app/projects','/app/portfolio-pulse','/app/executive-cockpit',
    '/app/strategic-alignment',
    '/app/risks','/app/issues','/app/actions','/app/decisions',
    '/app/timeline','/app/work-items','/app/work-board','/app/my-work',
    '/app/resources','/app/apply-leave','/app/stakeholders','/app/status-updates','/app/lessons',
    '/app/benefits','/app/dependencies','/app/change-requests','/app/stage-gates',
    '/app/governance-channels','/app/investment-committee',
    '/app/settings','/app/support'
  ];
  role_key text;
  p text;
BEGIN
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'org_id required';
  END IF;

  IF auth.uid() IS NOT NULL
     AND (
       public.get_user_org(auth.uid()) IS DISTINCT FROM _org_id
       OR NOT public.has_any_admin(auth.uid())
     ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOREACH role_key IN ARRAY ARRAY['pm','bu_lead','executive'] LOOP
    FOREACH p IN ARRAY paths LOOP
      INSERT INTO public.role_table_permissions (org_id, role, table_name, can_view, can_edit)
      SELECT _org_id, role_key, 'page::' || p, true, role_key IN ('pm','bu_lead')
      WHERE NOT EXISTS (
        SELECT 1 FROM public.role_table_permissions x
        WHERE x.org_id = _org_id AND x.role = role_key AND x.table_name = 'page::' || p
      );
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_page_permissions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_default_page_permissions(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_page_permissions(uuid) TO service_role;

-- Point over-allocation alerts at Apply leave (Resources calendars tab was removed).
CREATE OR REPLACE FUNCTION public.notify_resource_over_allocation(_resource_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oid uuid;
  uid uuid;
  mid uuid;
  rname text;
  n integer := 0;
  caller uuid := auth.uid();
  title_txt constant text := 'Over allocated (leave / holidays)';
  body_txt text;
  link_txt constant text := '/app/apply-leave';
BEGIN
  oid := public.get_user_org(caller);
  IF oid IS NULL THEN
    RAISE EXCEPTION 'not in an organisation';
  END IF;

  IF NOT (
    public.has_any_admin(caller)
    OR public.has_role(caller, 'pm')
    OR public.has_role(caller, 'bu_lead')
  ) THEN
    RAISE EXCEPTION 'not allowed to notify over-allocation';
  END IF;

  SELECT r.user_id, r.manager_user_id, r.name
    INTO uid, mid, rname
  FROM public.resources r
  WHERE r.id = _resource_id AND r.org_id = oid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'resource not found';
  END IF;

  body_txt := coalesce(rname, 'A resource')
    || ' has been assigned more hours than remain after public holidays and leave.';

  IF uid IS NOT NULL AND uid IS DISTINCT FROM caller THEN
    INSERT INTO public.notifications (org_id, user_id, kind, title, body, link)
    VALUES (oid, uid, 'resource_over_allocation', title_txt, body_txt, link_txt);
    n := n + 1;
  END IF;

  IF mid IS NOT NULL AND mid IS DISTINCT FROM caller AND mid IS DISTINCT FROM uid THEN
    INSERT INTO public.notifications (org_id, user_id, kind, title, body, link)
    VALUES (oid, mid, 'resource_over_allocation', title_txt, body_txt, link_txt);
    n := n + 1;
  END IF;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_resource_over_allocation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_resource_over_allocation(uuid)
  TO authenticated, service_role;
