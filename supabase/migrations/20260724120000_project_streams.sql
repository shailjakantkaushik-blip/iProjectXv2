-- Project streams: optional delivery lanes under a project.
-- When projects.streams_enabled, streams own dates/gates/finance/allocations;
-- the project row is the rollup. Enabling creates a default "Core" stream and
-- re-points existing child rows onto it.

-- ========== projects flag ==========
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS streams_enabled boolean NOT NULL DEFAULT false;

-- ========== project_streams ==========
CREATE TABLE IF NOT EXISTS public.project_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  description text,
  owner text,
  status text DEFAULT 'Active',
  rag text,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  budget numeric DEFAULT 0,
  capex_approved numeric DEFAULT 0,
  capex_incurred numeric DEFAULT 0,
  opex_approved numeric DEFAULT 0,
  opex_incurred numeric DEFAULT 0,
  forecast_at_completion numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS project_streams_project_idx ON public.project_streams (project_id);
CREATE INDEX IF NOT EXISTS project_streams_org_idx ON public.project_streams (org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_streams TO authenticated;
GRANT ALL ON public.project_streams TO service_role;
ALTER TABLE public.project_streams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read project_streams" ON public.project_streams;
CREATE POLICY "org read project_streams" ON public.project_streams
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "editors modify project_streams" ON public.project_streams;
CREATE POLICY "editors modify project_streams" ON public.project_streams
  FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id))
  WITH CHECK (public.can_edit_project(auth.uid(), project_id));

DROP TRIGGER IF EXISTS trg_project_streams_updated ON public.project_streams;
CREATE TRIGGER trg_project_streams_updated
  BEFORE UPDATE ON public.project_streams
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Only one default stream per project
CREATE UNIQUE INDEX IF NOT EXISTS project_streams_one_default_uidx
  ON public.project_streams (project_id)
  WHERE is_default;

-- ========== stream_id on child tables ==========
ALTER TABLE public.stage_gates
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE CASCADE;

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE CASCADE;

ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE CASCADE;

ALTER TABLE public.fy_allocations
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE CASCADE;

ALTER TABLE public.resource_allocations
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS stage_gates_stream_idx ON public.stage_gates (stream_id);
CREATE INDEX IF NOT EXISTS milestones_stream_idx ON public.milestones (stream_id);
CREATE INDEX IF NOT EXISTS financials_monthly_stream_idx ON public.financials_monthly (stream_id);
CREATE INDEX IF NOT EXISTS fy_allocations_stream_idx ON public.fy_allocations (stream_id);
CREATE INDEX IF NOT EXISTS resource_allocations_stream_idx ON public.resource_allocations (stream_id);

-- Replace project-only uniques with stream-aware uniques
ALTER TABLE public.financials_monthly DROP CONSTRAINT IF EXISTS financials_monthly_project_id_period_month_key;
CREATE UNIQUE INDEX IF NOT EXISTS financials_monthly_project_null_stream_period_uidx
  ON public.financials_monthly (project_id, period_month)
  WHERE stream_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS financials_monthly_project_stream_period_uidx
  ON public.financials_monthly (project_id, stream_id, period_month)
  WHERE stream_id IS NOT NULL;

ALTER TABLE public.fy_allocations DROP CONSTRAINT IF EXISTS fy_allocations_project_id_fy_key;
CREATE UNIQUE INDEX IF NOT EXISTS fy_allocations_project_null_stream_fy_uidx
  ON public.fy_allocations (project_id, fy)
  WHERE stream_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fy_allocations_project_stream_fy_uidx
  ON public.fy_allocations (project_id, stream_id, fy)
  WHERE stream_id IS NOT NULL;

ALTER TABLE public.resource_allocations DROP CONSTRAINT IF EXISTS resource_allocations_project_id_resource_id_period_month_key;
CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_null_stream_uidx
  ON public.resource_allocations (project_id, resource_id, period_month)
  WHERE stream_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_stream_uidx
  ON public.resource_allocations (project_id, stream_id, resource_id, period_month)
  WHERE stream_id IS NOT NULL;

-- ========== Enable streams: create Core + migrate children ==========
CREATE OR REPLACE FUNCTION public.enable_project_streams(p_project_id uuid)
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
  IF v_org IS DISTINCT FROM public.get_user_org(auth.uid())
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to enable streams for this project';
  END IF;

  -- Already enabled: return default stream
  IF v_proj.streams_enabled THEN
    SELECT id INTO v_stream
    FROM public.project_streams
    WHERE project_id = p_project_id AND is_default
    LIMIT 1;
    IF v_stream IS NOT NULL THEN
      RETURN v_stream;
    END IF;
  END IF;

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
   WHERE id = p_project_id;

  RETURN v_stream;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enable_project_streams(uuid) TO authenticated;

-- ========== Roll project schedule + finance from streams ==========
CREATE OR REPLACE FUNCTION public.rollup_project_from_streams(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT streams_enabled INTO v_enabled FROM public.projects WHERE id = p_project_id;
  IF NOT COALESCE(v_enabled, false) THEN
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

CREATE OR REPLACE FUNCTION public.tg_rollup_project_from_streams()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  IF pid IS NOT NULL THEN
    PERFORM public.rollup_project_from_streams(pid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_project_streams_rollup ON public.project_streams;
CREATE TRIGGER trg_project_streams_rollup
  AFTER INSERT OR UPDATE OR DELETE ON public.project_streams
  FOR EACH ROW EXECUTE FUNCTION public.tg_rollup_project_from_streams();
