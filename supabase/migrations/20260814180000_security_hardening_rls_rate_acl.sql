-- Harden org-member write policies: require can_edit_project (or admin for org-level).
-- Also: durable rate_limit_buckets for multi-instance rate limiting.
-- Also: seed default page ACL for system roles so default-deny page ACL stays usable.

-- ========== Durable rate limits ==========
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  count int NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
-- No authenticated policies — service role / SECURITY DEFINER only.
GRANT ALL ON public.rate_limit_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.check_rate_limit_bucket(
  _key text,
  _limit int,
  _window_seconds int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ts timestamptz := now();
  row_count int;
  row_reset timestamptz;
  retry int;
BEGIN
  IF _key IS NULL OR length(trim(_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'retry_after_sec', _window_seconds);
  END IF;

  SELECT count, reset_at INTO row_count, row_reset
  FROM public.rate_limit_buckets
  WHERE bucket_key = _key
  FOR UPDATE;

  IF NOT FOUND OR row_reset <= now_ts THEN
    INSERT INTO public.rate_limit_buckets (bucket_key, count, reset_at, updated_at)
    VALUES (_key, 1, now_ts + make_interval(secs => GREATEST(1, _window_seconds)), now_ts)
    ON CONFLICT (bucket_key) DO UPDATE
      SET count = 1,
          reset_at = now_ts + make_interval(secs => GREATEST(1, _window_seconds)),
          updated_at = now_ts;
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF row_count >= _limit THEN
    retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (row_reset - now_ts))));
    RETURN jsonb_build_object('ok', false, 'retry_after_sec', retry);
  END IF;

  UPDATE public.rate_limit_buckets
  SET count = count + 1, updated_at = now_ts
  WHERE bucket_key = _key;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit_bucket(text, int, int) TO service_role;

-- ========== Tighten write RLS ==========
-- lessons_learned
DROP POLICY IF EXISTS "org write lessons_learned" ON public.lessons_learned;
CREATE POLICY "editors write lessons_learned" ON public.lessons_learned
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
    )
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
    )
  );

-- documents
DROP POLICY IF EXISTS "org write documents" ON public.documents;
CREATE POLICY "editors write documents" ON public.documents
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
    )
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
    )
  );

-- demand_pipeline (org-level): admins / PMs with any edit rights via has_any_admin or role
DROP POLICY IF EXISTS "org write demand_pipeline" ON public.demand_pipeline;
CREATE POLICY "editors write demand_pipeline" ON public.demand_pipeline
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR public.has_role(auth.uid(), 'pm')
      OR public.has_role(auth.uid(), 'bu_lead')
    )
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR public.has_role(auth.uid(), 'pm')
      OR public.has_role(auth.uid(), 'bu_lead')
    )
  );

-- governance_channels: writers = admin
DROP POLICY IF EXISTS "org insert governance_channels" ON public.governance_channels;
DROP POLICY IF EXISTS "org update governance_channels" ON public.governance_channels;
DROP POLICY IF EXISTS "org_members_insert_governance_channels" ON public.governance_channels;
DROP POLICY IF EXISTS "org_members_update_governance_channels" ON public.governance_channels;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'governance_channels'
      AND policyname = 'org write governance_channels'
  ) THEN
    EXECUTE 'DROP POLICY "org write governance_channels" ON public.governance_channels';
  END IF;
END $$;

CREATE POLICY "admins write governance_channels" ON public.governance_channels
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

-- work_item_links (predecessor/successor graph)
DROP POLICY IF EXISTS "editors modify work_item_links" ON public.work_item_links;
DROP POLICY IF EXISTS "org write work_item_links" ON public.work_item_links;
DROP POLICY IF EXISTS "editors write work_item_links" ON public.work_item_links;
CREATE POLICY "editors write work_item_links" ON public.work_item_links
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.work_items wi
        WHERE wi.id IN (work_item_links.predecessor_id, work_item_links.successor_id)
          AND public.can_edit_project(auth.uid(), wi.project_id)
      )
    )
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.work_items wi
        WHERE wi.id IN (work_item_links.predecessor_id, work_item_links.successor_id)
          AND public.can_edit_project(auth.uid(), wi.project_id)
      )
    )
  );

-- custom_reports
DROP POLICY IF EXISTS "org write custom_reports" ON public.custom_reports;
CREATE POLICY "admins write custom_reports" ON public.custom_reports
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (public.has_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'executive'))
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND (public.has_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'executive'))
  );

-- governance_links / governance_tasks (if present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='governance_links') THEN
    EXECUTE 'DROP POLICY IF EXISTS "org write governance_links" ON public.governance_links';
    EXECUTE $p$
      CREATE POLICY "editors write governance_links" ON public.governance_links
        FOR ALL TO authenticated
        USING (
          org_id = public.get_user_org(auth.uid())
          AND (
            public.has_any_admin(auth.uid())
            OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
          )
        )
        WITH CHECK (
          org_id = public.get_user_org(auth.uid())
          AND (
            public.has_any_admin(auth.uid())
            OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
          )
        )
    $p$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='governance_tasks') THEN
    EXECUTE 'DROP POLICY IF EXISTS "org write governance_tasks" ON public.governance_tasks';
    EXECUTE $p$
      CREATE POLICY "editors write governance_tasks" ON public.governance_tasks
        FOR ALL TO authenticated
        USING (
          org_id = public.get_user_org(auth.uid())
          AND (
            public.has_any_admin(auth.uid())
            OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
          )
        )
        WITH CHECK (
          org_id = public.get_user_org(auth.uid())
          AND (
            public.has_any_admin(auth.uid())
            OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
          )
        )
    $p$;
  END IF;
END $$;

-- ========== Default page ACL seed helper ==========
-- Ensures non-admin roles get an explicit allow list when orgs have empty matrices.
CREATE OR REPLACE FUNCTION public.seed_default_page_permissions(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paths text[] := ARRAY[
    '/app','/app/projects','/app/portfolio-pulse','/app/executive-cockpit',
    '/app/risks','/app/issues','/app/actions','/app/decisions',
    '/app/timeline','/app/work-items','/app/work-board','/app/my-work',
    '/app/resources','/app/stakeholders','/app/status-updates','/app/lessons',
    '/app/benefits','/app/dependencies','/app/change-requests','/app/stage-gates',
    '/app/settings','/app/support'
  ];
  role_key text;
  p text;
BEGIN
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

GRANT EXECUTE ON FUNCTION public.seed_default_page_permissions(uuid) TO authenticated, service_role;

-- Best-effort: seed existing orgs that have zero page::* rows
DO $$
DECLARE
  o record;
  n int;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    SELECT count(*) INTO n
    FROM public.role_table_permissions
    WHERE org_id = o.id AND table_name LIKE 'page::%';
    IF n = 0 THEN
      PERFORM public.seed_default_page_permissions(o.id);
    END IF;
  END LOOP;
END $$;
