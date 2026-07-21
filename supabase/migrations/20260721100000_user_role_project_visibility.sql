-- User + role project visibility.
-- organizations.ui_config.project_visibility:
--   rules[]:      { role, mode, programs[], project_ids[] }
--   user_rules[]: { user_id, mode, programs[], project_ids[] }
-- Precedence: admin/platform_admin > can_edit_project > user_rules (if any) > role rules > all.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ui_config jsonb NOT NULL DEFAULT '{}'::jsonb;

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

  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.role::text = 'platform_admin'
  ) THEN
    RETURN true;
  END IF;

  IF public.get_user_org(p_user_id) IS DISTINCT FROM v_org_id THEN
    RETURN false;
  END IF;

  IF public.has_any_admin(p_user_id) THEN
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

  -- Per-user override wins over role rules when present
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

REVOKE ALL ON FUNCTION public.user_can_view_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_view_project(uuid, uuid) TO authenticated;

-- Ensure projects SELECT uses the function (idempotent if already applied)
DROP POLICY IF EXISTS "projects_read_org" ON public.projects;
CREATE POLICY "projects_read_org"
  ON public.projects FOR SELECT TO authenticated
  USING (public.user_can_view_project(auth.uid(), id));

-- Re-apply scoped SELECT on project-linked tables (idempotent)
DO $$
DECLARE
  t text;
  pol record;
  has_org boolean;
  using_expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stage_gates',
    'milestones',
    'risks',
    'issues',
    'actions',
    'decisions',
    'dependencies',
    'change_requests',
    'fy_allocations',
    'financials_monthly',
    'benefits',
    'sprints',
    'resource_allocations',
    'stakeholders',
    'status_updates',
    'lessons_learned',
    'documents',
    'work_items',
    'scenario_projects'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'project_id'
    ) THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id'
    ) INTO has_org;

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND cmd = 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    IF has_org THEN
      using_expr :=
        '(project_id IS NOT NULL AND public.user_can_view_project(auth.uid(), project_id)) OR (project_id IS NULL AND org_id = public.get_user_org(auth.uid()))';
    ELSE
      using_expr := 'public.user_can_view_project(auth.uid(), project_id)';
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      t || '_read_project_scope',
      t,
      using_expr
    );
  END LOOP;
END $$;
