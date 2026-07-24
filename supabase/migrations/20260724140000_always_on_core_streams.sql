-- Always-on Core stream: every project has at least one delivery stream.
-- Project row remains the rollup (dates + finance); timelines default to stream
-- lanes, with an optional project rollup lane in the UI.

ALTER TABLE public.projects
  ALTER COLUMN streams_enabled SET DEFAULT true;

-- Internal ensure: create Core, migrate null-stream children, enable flag.
-- Used by INSERT trigger and backfill (no end-user auth check).
CREATE OR REPLACE FUNCTION public.ensure_project_core_stream(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_stream uuid;
  v_proj public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  v_org := v_proj.org_id;

  SELECT id INTO v_stream
  FROM public.project_streams
  WHERE project_id = p_project_id AND is_default
  LIMIT 1;

  IF v_stream IS NULL THEN
    INSERT INTO public.project_streams (
      org_id, project_id, name, code, is_default, sort_order, status, rag, owner,
      planned_start_date, planned_end_date, actual_start_date, actual_end_date,
      budget, capex_approved, capex_incurred, opex_approved, opex_incurred,
      forecast_at_completion
    )
    VALUES (
      v_org, p_project_id, 'Core', 'CORE', true, 0,
      COALESCE(v_proj.status::text, 'In Progress'), v_proj.rag, v_proj.sponsor,
      COALESCE(v_proj.planned_start_date, v_proj.start_date),
      COALESCE(v_proj.planned_end_date, v_proj.end_date),
      v_proj.actual_start_date, v_proj.actual_end_date,
      COALESCE(v_proj.budget, 0),
      COALESCE(v_proj.capex_approved, 0), COALESCE(v_proj.capex_incurred, 0),
      COALESCE(v_proj.opex_approved, 0), COALESCE(v_proj.opex_incurred, 0),
      v_proj.forecast_at_completion
    )
    ON CONFLICT (project_id, name) DO UPDATE
      SET is_default = true,
          updated_at = now()
    RETURNING id INTO v_stream;
  END IF;

  UPDATE public.stage_gates SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.milestones SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.financials_monthly SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.fy_allocations SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.resource_allocations SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;

  UPDATE public.projects
     SET streams_enabled = true, updated_at = now()
   WHERE id = p_project_id
     AND (NOT streams_enabled OR streams_enabled IS DISTINCT FROM true);

  RETURN v_stream;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_project_core_stream(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_project_core_stream(uuid) TO service_role;

-- Public RPC keeps org auth; delegates to ensure.
CREATE OR REPLACE FUNCTION public.enable_project_streams(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proj public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  IF v_proj.org_id IS DISTINCT FROM public.get_user_org(auth.uid())
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to enable streams for this project';
  END IF;
  RETURN public.ensure_project_core_stream(p_project_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_ensure_project_core_stream()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_project_core_stream(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_ensure_core_stream ON public.projects;
CREATE TRIGGER trg_projects_ensure_core_stream
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_ensure_project_core_stream();

-- Backfill existing projects
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.id
    FROM public.projects p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.project_streams s
      WHERE s.project_id = p.id AND s.is_default
    )
  LOOP
    PERFORM public.ensure_project_core_stream(r.id);
  END LOOP;

  UPDATE public.projects SET streams_enabled = true WHERE NOT streams_enabled;
END;
$$;

-- Rollup whenever streams exist (not only when flag is set)
CREATE OR REPLACE FUNCTION public.rollup_project_from_streams(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_streams WHERE project_id = p_project_id
  ) THEN
    RETURN;
  END IF;

  UPDATE public.projects p SET
    planned_start_date = s.min_ps,
    planned_end_date   = s.max_pe,
    actual_start_date  = s.min_as,
    actual_end_date    = s.max_ae,
    start_date = COALESCE(s.min_as, s.min_ps, p.start_date),
    end_date   = COALESCE(s.max_ae, s.max_pe, p.end_date),
    budget = COALESCE(s.sum_budget, 0),
    capex_approved = COALESCE(s.sum_capex_a, 0),
    capex_incurred = COALESCE(s.sum_capex_i, 0),
    opex_approved = COALESCE(s.sum_opex_a, 0),
    opex_incurred = COALESCE(s.sum_opex_i, 0),
    forecast_at_completion = s.sum_fac,
    updated_at = now()
  FROM (
    SELECT
      project_id,
      MIN(planned_start_date) AS min_ps,
      MAX(planned_end_date)   AS max_pe,
      MIN(actual_start_date)  AS min_as,
      MAX(actual_end_date)    AS max_ae,
      SUM(COALESCE(budget, 0)) AS sum_budget,
      SUM(COALESCE(capex_approved, 0)) AS sum_capex_a,
      SUM(COALESCE(capex_incurred, 0)) AS sum_capex_i,
      SUM(COALESCE(opex_approved, 0)) AS sum_opex_a,
      SUM(COALESCE(opex_incurred, 0)) AS sum_opex_i,
      SUM(COALESCE(forecast_at_completion, budget, 0)) AS sum_fac
    FROM public.project_streams
    WHERE project_id = p_project_id
    GROUP BY project_id
  ) s
  WHERE p.id = s.project_id;
END;
$$;

-- Re-rollup all projects that have streams (refresh PvA on project rows)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT project_id AS id FROM public.project_streams
  LOOP
    PERFORM public.rollup_project_from_streams(r.id);
  END LOOP;
END;
$$;
