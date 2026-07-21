-- Role-based project / program visibility (org admin config in organizations.ui_config).
-- ui_config.project_visibility.rules[]:
--   { "role": "pm"|"bu_lead"|"executive", "mode": "all"|"programs"|"projects",
--     "programs": ["..."], "project_ids": ["uuid", ...] }
-- No matching rule for a user's roles => full access. Empty rules => legacy (everyone sees all).
-- Admins / platform_admin always see all. Users who can_edit_project also see that project.

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
  v_rules jsonb;
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

  -- Platform admins see everything
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.role::text = 'platform_admin'
  ) THEN
    RETURN true;
  END IF;

  -- Must belong to the project's organisation
  IF public.get_user_org(p_user_id) IS DISTINCT FROM v_org_id THEN
    RETURN false;
  END IF;

  -- Org / workspace admins always see all
  IF public.has_any_admin(p_user_id) THEN
    RETURN true;
  END IF;

  -- Anyone authorised to edit the project can view it
  IF public.can_edit_project(p_user_id, p_project_id) THEN
    RETURN true;
  END IF;

  SELECT coalesce(o.ui_config->'project_visibility'->'rules', '[]'::jsonb)
  INTO v_rules
  FROM public.organizations o
  WHERE o.id = v_org_id;

  IF v_rules IS NULL OR jsonb_typeof(v_rules) <> 'array' OR jsonb_array_length(v_rules) = 0 THEN
    RETURN true;
  END IF;

  SELECT coalesce(array_agg(lower(ur.role::text)), ARRAY[]::text[])
  INTO v_user_roles
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id
    AND (ur.org_id = v_org_id OR ur.org_id IS NULL);

  -- Union of access across matching role rules (OR). Unconfigured roles => full access.
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

  -- No custom rule for this user's roles => default full access
  IF NOT v_matched THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_view_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_view_project(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "projects_read_org" ON public.projects;
CREATE POLICY "projects_read_org"
  ON public.projects FOR SELECT TO authenticated
  USING (public.user_can_view_project(auth.uid(), id));

-- Replace org-wide SELECT policies on project-scoped delivery tables.
-- (Multiple PERMISSIVE SELECT policies OR together and would bypass scoping.)
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

    -- Drop existing SELECT policies only (keep INSERT/UPDATE/DELETE / FOR ALL write policies)
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
      -- Nullable project_id rows stay org-scoped; otherwise require project visibility
      using_expr := format(
        '(project_id IS NOT NULL AND public.user_can_view_project(auth.uid(), project_id)) OR (project_id IS NULL AND org_id = public.get_user_org(auth.uid()))'
      );
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
