-- Platform admins only see projects for their own organisation.
-- Latest user_can_view_project: hierarchy grants + user overrides for admins.
-- Same body as supabase/manual/project_access_hierarchy.sql (safe to re-run).

-- Hierarchical project data access: Strategic Alignment, Program, Functional Area,
-- Project, and Stream — for role rules and per-user overrides.
-- Safe to re-run. Paste this whole file into the Supabase SQL Editor, then
-- Settings → API → Reload schema cache.

-- Dimension grant: '(Unassigned)' matches null/blank; otherwise case-insensitive equality.
CREATE OR REPLACE FUNCTION public.project_visibility_dim_in(p_value text, p_list jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p_list) = 'array' THEN p_list ELSE '[]'::jsonb END
    ) AS g(val)
    WHERE (
      lower(trim(g.val)) IN ('(unassigned)', 'unassigned')
      AND trim(coalesce(p_value, '')) = ''
    )
    OR (
      trim(coalesce(p_value, '')) <> ''
      AND lower(trim(g.val)) = lower(trim(p_value))
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.project_visibility_rule_matches(
  p_rule jsonb,
  p_project_id uuid,
  p_program text,
  p_portfolio text,
  p_functional_area text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode text;
BEGIN
  IF p_rule IS NULL OR jsonb_typeof(p_rule) <> 'object' THEN
    RETURN false;
  END IF;

  v_mode := lower(trim(coalesce(p_rule->>'mode', 'all')));
  IF v_mode IN ('all', '') THEN
    RETURN true;
  END IF;

  -- Any non-all mode (legacy programs/projects, or scoped hierarchy): OR of grants.
  -- Parent grants include children (SA → program/FA/project/stream, etc.).
  IF public.project_visibility_dim_in(p_portfolio, p_rule->'strategic_alignments') THEN
    RETURN true;
  END IF;

  IF public.project_visibility_dim_in(p_program, p_rule->'programs') THEN
    RETURN true;
  END IF;

  IF public.project_visibility_dim_in(p_functional_area, p_rule->'functional_areas') THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(p_rule->'program_areas') = 'array' THEN p_rule->'program_areas'
        ELSE '[]'::jsonb
      END
    ) AS pa
    WHERE public.project_visibility_dim_in(p_program, jsonb_build_array(coalesce(pa->>'program', '')))
      AND public.project_visibility_dim_in(
        p_functional_area,
        jsonb_build_array(coalesce(pa->>'functional_area', ''))
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(p_rule->'project_ids') = 'array' THEN p_rule->'project_ids'
        ELSE '[]'::jsonb
      END
    ) AS pid(val)
    WHERE pid.val = p_project_id::text
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_streams s
    JOIN jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(p_rule->'stream_ids') = 'array' THEN p_rule->'stream_ids'
        ELSE '[]'::jsonb
      END
    ) AS sid(val)
      ON s.id::text = sid.val
    WHERE s.project_id = p_project_id
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

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

  -- Hard tenancy boundary: never cross organisations (includes platform_admin).
  IF public.get_user_org(p_user_id) IS DISTINCT FROM v_org_id THEN
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

  -- Explicit per-user override applies to everyone, including admins.
  IF v_user_rule IS NOT NULL THEN
    RETURN public.project_visibility_rule_matches(
      v_user_rule,
      p_project_id,
      v_program,
      v_portfolio,
      v_functional_area
    );
  END IF;

  -- No user override: platform_admin and org admins see the full portfolio.
  IF public.is_platform_admin(p_user_id) OR public.has_any_admin(p_user_id) THEN
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
    AND (ur.org_id = v_org_id OR ur.org_id IS NULL);

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

REVOKE ALL ON FUNCTION public.project_visibility_dim_in(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_visibility_rule_matches(jsonb, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_visibility_dim_in(text, jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.project_visibility_rule_matches(jsonb, uuid, text, text, text) TO postgres;

REVOKE ALL ON FUNCTION public.user_can_view_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_view_project(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.project_visibility_dim_in(text, jsonb) IS
  'Project access: match a portfolio/program/functional-area value against a JSON string array. (Unassigned) matches blank.';

COMMENT ON FUNCTION public.project_visibility_rule_matches(jsonb, uuid, text, text, text) IS
  'Project access: OR of Strategic Alignment, program, functional area, program×area, project, and stream grants. Parent includes children.';

COMMENT ON FUNCTION public.user_can_view_project(uuid, uuid) IS
  'Org-tenant project visibility. User overrides apply even to admins. Admins with no override see all in their org.';

-- Full org project list for the Project data access page (admins only).
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
  IF NOT (public.has_any_admin(auth.uid()) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.name, p.project_code, p.program, p.portfolio, p.functional_area
  FROM public.projects p
  WHERE p.org_id = v_org
  ORDER BY p.name;
END;
$$;

REVOKE ALL ON FUNCTION public.org_admin_list_access_projects() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_admin_list_access_projects() TO authenticated;

COMMENT ON FUNCTION public.org_admin_list_access_projects() IS
  'Project data access UI: org admins list every project in their org even if they have a user visibility override.';
