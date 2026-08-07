-- Fix: Reforecast (and any projects UPDATE) failed with
--   invalid input value for enum project_status: ""
-- because refresh_org_kpi_summary / portfolio_project_stats used
-- COALESCE(status, '') / COALESCE(rag, '') on enum columns. Postgres
-- casts the '' literal to the enum type and rejects it.

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
        WHERE COALESCE(status::text, '') NOT ILIKE '%closed%'
          AND COALESCE(status::text, '') NOT ILIKE '%complete%'
          AND COALESCE(status::text, '') NOT ILIKE '%cancelled%'
      )::int AS active_count,
      COUNT(*) FILTER (WHERE lower(COALESCE(rag::text, '')) IN ('green', 'g'))::int AS rag_green,
      COUNT(*) FILTER (WHERE lower(COALESCE(rag::text, '')) IN ('amber', 'yellow', 'a'))::int AS rag_amber,
      COUNT(*) FILTER (WHERE lower(COALESCE(rag::text, '')) IN ('red', 'r'))::int AS rag_red,
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
    SELECT coalesce(nullif(trim(rag::text), ''), 'Unknown') AS k, count(*)::int AS c
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
