-- Scale hardening: covering indexes, index-friendly RLS, org KPI summaries,
-- async export jobs, and partition-ready helpers for large fact tables.
-- Safe / additive — preserves user_can_view_project semantics.

-- =============================================================================
-- 1) Covering indexes for hot org-scoped scans
-- =============================================================================

CREATE INDEX IF NOT EXISTS projects_org_id_idx ON public.projects (org_id);
CREATE INDEX IF NOT EXISTS projects_org_updated_idx ON public.projects (org_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_org_status_idx ON public.projects (org_id, status);
CREATE INDEX IF NOT EXISTS projects_org_rag_idx ON public.projects (org_id, rag);
CREATE INDEX IF NOT EXISTS projects_org_program_idx ON public.projects (org_id, program);

CREATE INDEX IF NOT EXISTS stage_gates_org_id_idx ON public.stage_gates (org_id);
CREATE INDEX IF NOT EXISTS stage_gates_org_project_idx ON public.stage_gates (org_id, project_id);
CREATE INDEX IF NOT EXISTS milestones_org_id_idx ON public.milestones (org_id);
CREATE INDEX IF NOT EXISTS milestones_org_project_idx ON public.milestones (org_id, project_id);
CREATE INDEX IF NOT EXISTS risks_org_id_idx ON public.risks (org_id);
CREATE INDEX IF NOT EXISTS risks_org_project_idx ON public.risks (org_id, project_id);
CREATE INDEX IF NOT EXISTS issues_org_id_idx ON public.issues (org_id);
CREATE INDEX IF NOT EXISTS issues_org_project_idx ON public.issues (org_id, project_id);
CREATE INDEX IF NOT EXISTS actions_org_id_idx ON public.actions (org_id);
CREATE INDEX IF NOT EXISTS actions_org_project_idx ON public.actions (org_id, project_id);
CREATE INDEX IF NOT EXISTS decisions_org_id_idx ON public.decisions (org_id);
CREATE INDEX IF NOT EXISTS decisions_org_project_idx ON public.decisions (org_id, project_id);
CREATE INDEX IF NOT EXISTS dependencies_org_id_idx ON public.dependencies (org_id);
CREATE INDEX IF NOT EXISTS financials_monthly_org_id_idx ON public.financials_monthly (org_id);
CREATE INDEX IF NOT EXISTS financials_monthly_org_project_period_idx
  ON public.financials_monthly (org_id, project_id, period_month);
CREATE INDEX IF NOT EXISTS documents_org_id_idx ON public.documents (org_id);
CREATE INDEX IF NOT EXISTS status_updates_org_id_idx ON public.status_updates (org_id);
CREATE INDEX IF NOT EXISTS benefits_org_id_idx ON public.benefits (org_id);
CREATE INDEX IF NOT EXISTS benefits_org_project_idx ON public.benefits (org_id, project_id);
CREATE INDEX IF NOT EXISTS fy_allocations_org_id_idx ON public.fy_allocations (org_id);
CREATE INDEX IF NOT EXISTS sprints_org_id_idx ON public.sprints (org_id);
CREATE INDEX IF NOT EXISTS sprints_org_project_idx ON public.sprints (org_id, project_id);
CREATE INDEX IF NOT EXISTS resource_allocations_org_id_idx ON public.resource_allocations (org_id);
CREATE INDEX IF NOT EXISTS resources_org_id_idx ON public.resources (org_id);
CREATE INDEX IF NOT EXISTS stakeholders_org_id_idx ON public.stakeholders (org_id);
CREATE INDEX IF NOT EXISTS work_items_org_status_idx ON public.work_items (org_id, status);
CREATE INDEX IF NOT EXISTS work_items_org_updated_idx ON public.work_items (org_id, updated_at DESC);

-- =============================================================================
-- 2) Index-friendly RLS: org predicate first, then visibility
-- =============================================================================

DROP POLICY IF EXISTS "projects_read_org" ON public.projects;
CREATE POLICY "projects_read_org"
  ON public.projects FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.get_user_org(auth.uid()))
    AND public.user_can_view_project(auth.uid(), id)
  );

DO $$
DECLARE
  t text;
  pol record;
  has_org boolean;
  has_project boolean;
  using_expr text;
  tables text[] := ARRAY[
    'milestones','stage_gates','risks','issues','actions','decisions',
    'dependencies','financials_monthly','fy_allocations','benefits',
    'documents','status_updates','change_requests','stakeholders',
    'resource_allocations','sprints','work_items','lessons_learned',
    'project_streams'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id'
    ) INTO has_org;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'project_id'
    ) INTO has_project;

    IF NOT has_org THEN
      CONTINUE;
    END IF;

    -- Drop all SELECT policies so we don't OR-stack with legacy names.
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND cmd = 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    IF has_project THEN
      using_expr :=
        'org_id = (SELECT public.get_user_org(auth.uid())) AND ('
        || '(project_id IS NOT NULL AND public.user_can_view_project(auth.uid(), project_id))'
        || ' OR project_id IS NULL)';
    ELSE
      using_expr := 'org_id = (SELECT public.get_user_org(auth.uid()))';
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      t || '_read_org_scope',
      t,
      using_expr
    );
  END LOOP;
END $$;

-- =============================================================================
-- 3) Org KPI summary rollups (executive / cockpit hot path)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.org_kpi_summaries (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_count integer NOT NULL DEFAULT 0,
  active_count integer NOT NULL DEFAULT 0,
  rag_green integer NOT NULL DEFAULT 0,
  rag_amber integer NOT NULL DEFAULT 0,
  rag_red integer NOT NULL DEFAULT 0,
  approved_funding numeric NOT NULL DEFAULT 0,
  incurred numeric NOT NULL DEFAULT 0,
  forecast_at_completion numeric NOT NULL DEFAULT 0,
  benefits_target numeric NOT NULL DEFAULT 0,
  benefits_realised numeric NOT NULL DEFAULT 0,
  open_risks integer NOT NULL DEFAULT 0,
  open_issues integer NOT NULL DEFAULT 0,
  open_actions integer NOT NULL DEFAULT 0,
  work_item_total integer NOT NULL DEFAULT 0,
  work_item_done integer NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS org_kpi_summaries_refreshed_idx
  ON public.org_kpi_summaries (refreshed_at DESC);

ALTER TABLE public.org_kpi_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_kpi_summaries_read_org ON public.org_kpi_summaries;
CREATE POLICY org_kpi_summaries_read_org
  ON public.org_kpi_summaries FOR SELECT TO authenticated
  USING (org_id = (SELECT public.get_user_org(auth.uid())));

-- Service role / SECURITY DEFINER refresh writes; no authenticated INSERT/UPDATE.

CREATE OR REPLACE FUNCTION public.refresh_org_kpi_summary(p_org_id uuid)
RETURNS public.org_kpi_summaries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.org_kpi_summaries;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'org_id required';
  END IF;

  INSERT INTO public.org_kpi_summaries AS s (
    org_id,
    project_count,
    active_count,
    rag_green,
    rag_amber,
    rag_red,
    approved_funding,
    incurred,
    forecast_at_completion,
    benefits_target,
    benefits_realised,
    open_risks,
    open_issues,
    open_actions,
    work_item_total,
    work_item_done,
    refreshed_at,
    meta
  )
  SELECT
    p_org_id,
    COALESCE(p.project_count, 0),
    COALESCE(p.active_count, 0),
    COALESCE(p.rag_green, 0),
    COALESCE(p.rag_amber, 0),
    COALESCE(p.rag_red, 0),
    COALESCE(p.approved_funding, 0),
    COALESCE(p.incurred, 0),
    COALESCE(p.forecast_at_completion, 0),
    COALESCE(p.benefits_target, 0),
    COALESCE(p.benefits_realised, 0),
    COALESCE(r.open_risks, 0),
    COALESCE(i.open_issues, 0),
    COALESCE(a.open_actions, 0),
    COALESCE(w.work_item_total, 0),
    COALESCE(w.work_item_done, 0),
    now(),
    jsonb_build_object('source', 'refresh_org_kpi_summary')
  FROM (SELECT 1) seed
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS project_count,
      COUNT(*) FILTER (
        WHERE COALESCE(status, '') NOT ILIKE '%closed%'
          AND COALESCE(status, '') NOT ILIKE '%complete%'
          AND COALESCE(status, '') NOT ILIKE '%cancelled%'
      )::int AS active_count,
      COUNT(*) FILTER (WHERE lower(COALESCE(rag, '')) IN ('green', 'g'))::int AS rag_green,
      COUNT(*) FILTER (WHERE lower(COALESCE(rag, '')) IN ('amber', 'yellow', 'a'))::int AS rag_amber,
      COUNT(*) FILTER (WHERE lower(COALESCE(rag, '')) IN ('red', 'r'))::int AS rag_red,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(budget, 0) > 0 THEN budget
          ELSE COALESCE(capex_approved, 0) + COALESCE(opex_approved, 0)
        END
      ), 0) AS approved_funding,
      COALESCE(SUM(COALESCE(capex_incurred, 0) + COALESCE(opex_incurred, 0)), 0) AS incurred,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(forecast_at_completion, 0) > 0 THEN forecast_at_completion
          WHEN COALESCE(budget, 0) > 0 THEN budget
          ELSE COALESCE(capex_approved, 0) + COALESCE(opex_approved, 0)
        END
      ), 0) AS forecast_at_completion,
      COALESCE(SUM(COALESCE(benefits_target, 0)), 0) AS benefits_target,
      COALESCE(SUM(COALESCE(benefits_realised, 0)), 0) AS benefits_realised
    FROM public.projects
    WHERE org_id = p_org_id
  ) p ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS open_risks
    FROM public.risks
    WHERE org_id = p_org_id
      AND COALESCE(status, '') NOT ILIKE '%closed%'
      AND COALESCE(status, '') NOT ILIKE '%mitigated%'
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS open_issues
    FROM public.issues
    WHERE org_id = p_org_id
      AND COALESCE(status, '') NOT ILIKE '%closed%'
      AND COALESCE(status, '') NOT ILIKE '%resolved%'
  ) i ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS open_actions
    FROM public.actions
    WHERE org_id = p_org_id
      AND COALESCE(status, '') NOT ILIKE '%done%'
      AND COALESCE(status, '') NOT ILIKE '%closed%'
      AND COALESCE(status, '') NOT ILIKE '%complete%'
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS work_item_total,
      COUNT(*) FILTER (WHERE status = 'Done')::int AS work_item_done
    FROM public.work_items
    WHERE org_id = p_org_id
      AND COALESCE(status, '') <> 'Cancelled'
  ) w ON true
  ON CONFLICT (org_id) DO UPDATE SET
    project_count = EXCLUDED.project_count,
    active_count = EXCLUDED.active_count,
    rag_green = EXCLUDED.rag_green,
    rag_amber = EXCLUDED.rag_amber,
    rag_red = EXCLUDED.rag_red,
    approved_funding = EXCLUDED.approved_funding,
    incurred = EXCLUDED.incurred,
    forecast_at_completion = EXCLUDED.forecast_at_completion,
    benefits_target = EXCLUDED.benefits_target,
    benefits_realised = EXCLUDED.benefits_realised,
    open_risks = EXCLUDED.open_risks,
    open_issues = EXCLUDED.open_issues,
    open_actions = EXCLUDED.open_actions,
    work_item_total = EXCLUDED.work_item_total,
    work_item_done = EXCLUDED.work_item_done,
    refreshed_at = EXCLUDED.refreshed_at,
    meta = EXCLUDED.meta
  RETURNING * INTO row;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_org_kpi_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_org_kpi_summary(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_refresh_org_kpi_from_projects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oid uuid;
BEGIN
  oid := COALESCE(NEW.org_id, OLD.org_id);
  IF oid IS NOT NULL THEN
    PERFORM public.refresh_org_kpi_summary(oid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_refresh_org_kpi ON public.projects;
CREATE TRIGGER trg_projects_refresh_org_kpi
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_org_kpi_from_projects();

-- Backfill summaries for existing orgs (best-effort).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    BEGIN
      PERFORM public.refresh_org_kpi_summary(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'KPI refresh skipped for %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;

-- =============================================================================
-- 4) Async export jobs (chunked org exports for large tenants)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'org_workbook',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  cursor_table text NULL,
  cursor_offset integer NOT NULL DEFAULT 0,
  row_count integer NOT NULL DEFAULT 0,
  result_path text NULL,
  error_message text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS export_jobs_org_created_idx
  ON public.export_jobs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS export_jobs_status_idx
  ON public.export_jobs (status, created_at ASC)
  WHERE status IN ('queued', 'running');

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS export_jobs_read_org ON public.export_jobs;
CREATE POLICY export_jobs_read_org
  ON public.export_jobs FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.get_user_org(auth.uid()))
    AND (
      requested_by = auth.uid()
      OR public.has_any_admin(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
  );

COMMENT ON TABLE public.export_jobs IS
  'Async chunked export queue for large org workbooks / evidence packs.';

-- =============================================================================
-- 5) Partition-ready helpers (extreme per-org size)
-- =============================================================================

-- Marker + helper used by ops to create monthly partitions for fact tables.
-- Does not rewrite existing tables in place (unsafe online); use for new
-- deployments or planned cutovers.

CREATE TABLE IF NOT EXISTS public.scale_partition_plan (
  table_name text PRIMARY KEY,
  strategy text NOT NULL DEFAULT 'range_month'
    CHECK (strategy IN ('range_month', 'hash_org')),
  partition_key text NOT NULL,
  notes text NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.scale_partition_plan (table_name, strategy, partition_key, notes, enabled)
VALUES
  ('financials_monthly', 'range_month', 'period_month', 'Candidate for monthly range partitions at extreme scale', false),
  ('timesheet_entries', 'range_month', 'created_at', 'Candidate via timesheet week_start join or created_at', false),
  ('audit_events', 'range_month', 'created_at', 'Retain hot window; archive cold partitions', false),
  ('work_items', 'hash_org', 'org_id', 'Only for single-tenant mega orgs / BYOD cutover', false)
ON CONFLICT (table_name) DO NOTHING;

ALTER TABLE public.scale_partition_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scale_partition_plan_platform_read ON public.scale_partition_plan;
CREATE POLICY scale_partition_plan_platform_read
  ON public.scale_partition_plan FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.ensure_month_partition(
  p_parent regclass,
  p_ym text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_name text;
  part_name text;
  start_d date;
  end_d date;
BEGIN
  -- Ops helper for planned cutovers. Parent must already be PARTITION BY RANGE.
  IF p_ym !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'p_ym must be YYYY-MM';
  END IF;
  parent_name := p_parent::text;
  part_name := replace(parent_name, '.', '_') || '_' || replace(p_ym, '-', '');
  start_d := (p_ym || '-01')::date;
  end_d := (start_d + interval '1 month')::date;

  IF to_regclass('public.' || part_name) IS NOT NULL THEN
    RETURN part_name;
  END IF;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
    part_name,
    parent_name,
    start_d,
    end_d
  );
  RETURN part_name;
EXCEPTION
  WHEN others THEN
    RAISE EXCEPTION 'ensure_month_partition failed (is % partitioned?): %', parent_name, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_month_partition(regclass, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_month_partition(regclass, text) TO service_role;

COMMENT ON FUNCTION public.ensure_month_partition(regclass, text) IS
  'Create a YYYY-MM range partition under an already-partitioned parent. For extreme-scale cutovers only.';

-- =============================================================================
-- 6) Portfolio chart aggregates (no full-table pull)
-- =============================================================================

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
  IF NOT (
    public.get_user_org(auth.uid()) = v_org
    OR public.is_platform_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT
    count(*)::int,
    count(*) FILTER (
      WHERE coalesce(status, '') ILIKE 'In Progress'
    )::int,
    count(*) FILTER (
      WHERE coalesce(status, '') ILIKE 'Completed'
         OR coalesce(status, '') ILIKE 'Complete'
    )::int,
    coalesce(sum(coalesce(budget, 0)), 0),
    coalesce(sum(coalesce(capex_incurred, 0)), 0)
  INTO v_total, v_active, v_completed, v_budget, v_incurred
  FROM public.projects
  WHERE org_id = v_org;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_rag
  FROM (
    SELECT coalesce(nullif(trim(rag), ''), 'Unknown') AS k, count(*)::int AS c
    FROM public.projects WHERE org_id = v_org GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_status
  FROM (
    SELECT coalesce(nullif(trim(status), ''), 'Unknown') AS k, count(*)::int AS c
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

REVOKE ALL ON FUNCTION public.portfolio_project_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portfolio_project_stats(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.portfolio_project_stats(uuid) IS
  'Org-scoped project chart aggregates for portfolio pages (avoids loading all rows).';
