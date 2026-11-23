-- T4: seed_default_page_permissions is SECURITY DEFINER, granted to
-- authenticated, and has no caller check. It is not called from the app;
-- revoke client EXECUTE. Keep a home-org + admin check so a later GRANT
-- cannot seed another tenant's page ACL.

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
    '/app/resources','/app/stakeholders','/app/status-updates','/app/lessons',
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
