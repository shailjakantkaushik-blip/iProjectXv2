-- Platform operators must not read tenant PMO data.
-- platform_admin is for billing, EOI, landing, org directory, licenses.
-- Tenant data requires a tenant role on that org (org_admin, admin, pm, …).
-- Dual-hat: if you also grant an org role, that person is a tenant user too —
-- do not dual-hat platform operators onto customer organisations.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.user_has_tenant_org_role(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.org_id = p_org_id
      AND lower(ur.role::text) IS DISTINCT FROM 'platform_admin'
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_tenant_org_role(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_tenant_org_role(uuid, uuid) TO postgres;

COMMENT ON FUNCTION public.user_has_tenant_org_role(uuid, uuid) IS
  'True when the user holds a tenant role (not platform_admin) on that organisation.';

-- Home org for tenant RLS. Null for platform_admin with no tenant role so
-- org_id = get_user_org(...) policies cannot leak PMO rows.
CREATE OR REPLACE FUNCTION public.get_user_org(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.org_id
  FROM public.profiles p
  WHERE p.id = _user_id
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = _user_id
          AND lower(ur.role::text) = 'platform_admin'
      )
      OR public.user_has_tenant_org_role(_user_id, p.org_id)
    );
$$;

COMMENT ON FUNCTION public.get_user_org(uuid) IS
  'Tenant home org for RLS. Returns null for platform_admin operators who have no tenant org role.';

CREATE OR REPLACE FUNCTION public.user_can_view_project(p_user_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_program text;
  v_portfolio text;
  v_functional_area text;
  v_cfg jsonb;
  v_rules jsonb;
  v_user_rules jsonb;
  v_user_rule jsonb;
  v_user_roles text[];
  v_matched boolean := false;
  v_rule jsonb;
BEGIN
  IF p_user_id IS NULL OR p_project_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.org_id,
         coalesce(p.program, ''),
         coalesce(p.portfolio, ''),
         coalesce(p.functional_area, '')
  INTO v_org_id, v_program, v_portfolio, v_functional_area
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  -- Hard tenancy boundary (platform_admin with no tenant role has null home org).
  IF public.get_user_org(p_user_id) IS DISTINCT FROM v_org_id THEN
    RETURN false;
  END IF;

  -- Platform operator without a tenant role: never PMO data (ignore user_rules too).
  IF public.is_platform_admin(p_user_id)
     AND NOT public.user_has_tenant_org_role(p_user_id, v_org_id) THEN
    RETURN false;
  END IF;

  SELECT coalesce(o.ui_config->'project_visibility', '{}'::jsonb)
  INTO v_cfg
  FROM public.organizations o
  WHERE o.id = v_org_id;

  v_rules := coalesce(v_cfg->'rules', '[]'::jsonb);
  v_user_rules := coalesce(v_cfg->'user_rules', '[]'::jsonb);

  SELECT r
  INTO v_user_rule
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_user_rules) = 'array' THEN v_user_rules ELSE '[]'::jsonb END
  ) AS r
  WHERE r->>'user_id' = p_user_id::text
  LIMIT 1;

  IF v_user_rule IS NOT NULL THEN
    RETURN public.project_visibility_rule_matches(
      v_user_rule,
      p_project_id,
      v_program,
      v_portfolio,
      v_functional_area
    );
  END IF;

  -- Org Admin / Admin only — platform_admin does not unlock the portfolio.
  IF public.has_any_admin(p_user_id) THEN
    RETURN true;
  END IF;

  IF public.can_edit_project(p_user_id, p_project_id) THEN
    RETURN true;
  END IF;

  IF v_rules IS NULL OR jsonb_typeof(v_rules) <> 'array' OR jsonb_array_length(v_rules) = 0 THEN
    RETURN true;
  END IF;

  SELECT coalesce(array_agg(lower(ur.role::text)), ARRAY[]::text[])
  INTO v_user_roles
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id
    AND (ur.org_id = v_org_id OR ur.org_id IS NULL)
    AND lower(ur.role::text) IS DISTINCT FROM 'platform_admin';

  FOR v_rule IN
    SELECT r
    FROM jsonb_array_elements(v_rules) AS r
    WHERE lower(coalesce(r->>'role', '')) = ANY (v_user_roles)
  LOOP
    v_matched := true;
    IF public.project_visibility_rule_matches(
      v_rule,
      p_project_id,
      v_program,
      v_portfolio,
      v_functional_area
    ) THEN
      RETURN true;
    END IF;
  END LOOP;

  IF NOT v_matched THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.user_can_view_project(uuid, uuid) IS
  'Tenant PMO visibility. platform_admin never grants project access. Org admins with no user override see all in their org. User overrides apply to tenant users including org admins.';

REVOKE ALL ON FUNCTION public.user_can_view_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_view_project(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.org_admin_list_access_projects()
RETURNS TABLE (
  id uuid,
  name text,
  project_code text,
  program text,
  portfolio text,
  functional_area text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  v_org := public.get_user_org(auth.uid());
  IF v_org IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.has_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.name, p.project_code, p.program, p.portfolio, p.functional_area
  FROM public.projects p
  WHERE p.org_id = v_org
  ORDER BY p.name;
END;
$$;

COMMENT ON FUNCTION public.org_admin_list_access_projects() IS
  'Project data access UI catalog. Org admins only — not platform_admin.';

-- Tenant role catalog is org-admin, not platform ops.
DROP POLICY IF EXISTS "org read org_roles" ON public.org_roles;
CREATE POLICY "org read org_roles" ON public.org_roles
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "admins write org_roles" ON public.org_roles;
CREATE POLICY "admins write org_roles" ON public.org_roles
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

DROP POLICY IF EXISTS export_jobs_read_org ON public.export_jobs;
CREATE POLICY export_jobs_read_org
  ON public.export_jobs FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.get_user_org(auth.uid()))
    AND (
      requested_by = auth.uid()
      OR public.has_any_admin(auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.portfolio_project_stats(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := coalesce(p_org_id, public.get_user_org(auth.uid()));
  v_by_rag jsonb;
  v_by_status jsonb;
  v_by_program jsonb;
  v_by_priority jsonb;
  v_total int;
  v_active int;
  v_completed int;
  v_budget numeric;
  v_incurred numeric;
BEGIN
  IF v_org IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  IF public.get_user_org(auth.uid()) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT
    count(*)::int,
    count(*) FILTER (
      WHERE coalesce(status::text, '') ILIKE 'In Progress'
    )::int,
    count(*) FILTER (
      WHERE coalesce(status::text, '') ILIKE 'Completed'
         OR coalesce(status::text, '') ILIKE 'Complete'
    )::int,
    coalesce(sum(coalesce(budget, 0)), 0),
    coalesce(sum(coalesce(capex_incurred, 0)), 0)
  INTO v_total, v_active, v_completed, v_budget, v_incurred
  FROM public.projects
  WHERE org_id = v_org;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_rag
  FROM (
    SELECT
      CASE
        WHEN lower(trim(COALESCE(rag_override, ''))) IN ('green', 'amber', 'red')
          THEN trim(rag_override)
        ELSE coalesce(nullif(trim(rag::text), ''), 'Unknown')
      END AS k,
      count(*)::int AS c
    FROM public.projects WHERE org_id = v_org GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_status
  FROM (
    SELECT coalesce(nullif(trim(status::text), ''), 'Unknown') AS k, count(*)::int AS c
    FROM public.projects WHERE org_id = v_org GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_program
  FROM (
    SELECT coalesce(nullif(trim(program), ''), 'Unassigned') AS k, count(*)::int AS c
    FROM public.projects WHERE org_id = v_org GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_priority
  FROM (
    SELECT coalesce(nullif(trim(priority), ''), 'Unassigned') AS k, count(*)::int AS c
    FROM public.projects WHERE org_id = v_org GROUP BY 1
  ) s;

  RETURN jsonb_build_object(
    'total', v_total,
    'active', v_active,
    'completed', v_completed,
    'budget_total', v_budget,
    'capex_incurred', v_incurred,
    'by_rag', v_by_rag,
    'by_status', v_by_status,
    'by_program', v_by_program,
    'by_priority', v_by_priority
  );
END;
$$;
