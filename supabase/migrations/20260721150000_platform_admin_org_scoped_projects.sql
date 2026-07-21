-- Privacy: platform_admin must not read other organisations' project/portfolio data.
-- They still get full visibility inside their own org (same as org admins).
-- Platform ops (billing, landing config, org directory) stay platform-scoped elsewhere.

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
  v_cfg jsonb;
  v_rules jsonb;
  v_user_rules jsonb;
  v_user_rule jsonb;
  v_user_roles text[];
  v_matched boolean := false;
  v_rule jsonb;
  v_mode text;
BEGIN
  IF p_user_id IS NULL OR p_project_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.org_id, coalesce(p.program, '')
  INTO v_org_id, v_program
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  -- Hard tenancy boundary: never cross organisations (includes platform_admin).
  IF public.get_user_org(p_user_id) IS DISTINCT FROM v_org_id THEN
    RETURN false;
  END IF;

  -- Within own org, platform_admin and org admins see the full portfolio.
  IF public.is_platform_admin(p_user_id) OR public.has_any_admin(p_user_id) THEN
    RETURN true;
  END IF;

  IF public.can_edit_project(p_user_id, p_project_id) THEN
    RETURN true;
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
    v_mode := lower(coalesce(v_user_rule->>'mode', 'all'));
    IF v_mode = 'all' OR v_mode = '' THEN
      RETURN true;
    END IF;
    IF v_mode = 'programs' THEN
      RETURN EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_user_rule->'programs', '[]'::jsonb)) AS prog(val)
        WHERE lower(trim(prog.val)) = lower(trim(v_program))
          AND trim(v_program) <> ''
      );
    END IF;
    IF v_mode = 'projects' THEN
      RETURN EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_user_rule->'project_ids', '[]'::jsonb)) AS pid(val)
        WHERE pid.val = p_project_id::text
      );
    END IF;
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
    v_mode := lower(coalesce(v_rule->>'mode', 'all'));

    IF v_mode = 'all' OR v_mode = '' THEN
      RETURN true;
    END IF;

    IF v_mode = 'programs' THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_rule->'programs', '[]'::jsonb)) AS prog(val)
        WHERE lower(trim(prog.val)) = lower(trim(v_program))
          AND trim(v_program) <> ''
      ) THEN
        RETURN true;
      END IF;
    ELSIF v_mode = 'projects' THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_rule->'project_ids', '[]'::jsonb)) AS pid(val)
        WHERE pid.val = p_project_id::text
      ) THEN
        RETURN true;
      END IF;
    ELSE
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
  'Org-tenant project visibility. Platform admins are scoped to their own organisation; they do not see other orgs'' portfolio data.';
