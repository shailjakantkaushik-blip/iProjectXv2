-- T1: refresh_org_kpi_summary is SECURITY DEFINER and was executable by any
-- authenticated user for any org_id. A caller could upsert another tenant's
-- KPI snapshot. Keep GRANT to authenticated (portfolio.server uses the user
-- JWT on platform). Signed-in callers must match get_user_org(); platform
-- admins with no home org cannot refresh someone else's org. auth.uid() IS
-- NULL still allows service_role / triggers.

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

  IF auth.uid() IS NOT NULL
     AND public.get_user_org(auth.uid()) IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'not authorized';
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
      COUNT(*) FILTER (
        WHERE lower(
          CASE
            WHEN lower(trim(COALESCE(rag_override, ''))) IN ('green', 'amber', 'red')
              THEN trim(rag_override)
            ELSE COALESCE(rag::text, '')
          END
        ) IN ('green', 'g')
      )::int AS rag_green,
      COUNT(*) FILTER (
        WHERE lower(
          CASE
            WHEN lower(trim(COALESCE(rag_override, ''))) IN ('green', 'amber', 'red')
              THEN trim(rag_override)
            ELSE COALESCE(rag::text, '')
          END
        ) IN ('amber', 'yellow', 'a')
      )::int AS rag_amber,
      COUNT(*) FILTER (
        WHERE lower(
          CASE
            WHEN lower(trim(COALESCE(rag_override, ''))) IN ('green', 'amber', 'red')
              THEN trim(rag_override)
            ELSE COALESCE(rag::text, '')
          END
        ) IN ('red', 'r')
      )::int AS rag_red,
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
REVOKE ALL ON FUNCTION public.refresh_org_kpi_summary(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_org_kpi_summary(uuid) TO authenticated, service_role;
