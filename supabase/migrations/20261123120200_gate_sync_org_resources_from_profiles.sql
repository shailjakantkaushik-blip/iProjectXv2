-- T2: sync_org_resources_from_profiles skipped the admin check when _org_id
-- was set, and the NULL path synced every organisation for any admin.
-- Signed-in callers must be an org admin of their home org only.
-- auth.uid() IS NULL (triggers / service_role) may still target one org or all.

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
  home uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    home := public.get_user_org(auth.uid());
    IF NOT public.has_any_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only organisation admins can sync resources';
    END IF;
    IF _org_id IS NOT NULL THEN
      IF home IS DISTINCT FROM _org_id THEN
        RAISE EXCEPTION 'not authorized';
      END IF;
      orgs := ARRAY[_org_id];
    ELSE
      IF home IS NULL THEN
        RAISE EXCEPTION 'not authorized';
      END IF;
      orgs := ARRAY[home];
    END IF;
  ELSIF _org_id IS NOT NULL THEN
    orgs := ARRAY[_org_id];
  ELSE
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

REVOKE ALL ON FUNCTION public.sync_org_resources_from_profiles(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_org_resources_from_profiles(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_org_resources_from_profiles(uuid) TO authenticated, service_role;
