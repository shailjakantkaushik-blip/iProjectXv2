-- Forecast phases follow streams × delivery-method stage-gate template.
-- Duration drives the month/FY Gantt and writes planned dates only.

CREATE TABLE IF NOT EXISTS public.project_forecast_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  forecast_id uuid NOT NULL REFERENCES public.project_forecasts(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stream_id uuid REFERENCES public.project_streams(id) ON DELETE CASCADE,
  gate_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  duration_days numeric NOT NULL DEFAULT 20,
  start_date date,
  end_date date,
  dates_overridden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_forecast_phases_forecast_stream_gate
  ON public.project_forecast_phases (forecast_id, COALESCE(stream_id, '00000000-0000-0000-0000-000000000000'), gate_name);

ALTER TABLE public.project_forecast_phase_resources
  ADD COLUMN IF NOT EXISTS forecast_phase_id uuid REFERENCES public.project_forecast_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phase_name text;

ALTER TABLE public.project_forecast_other_costs
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS forecast_phase_id uuid REFERENCES public.project_forecast_phases(id) ON DELETE SET NULL;

ALTER TABLE public.project_forecasts
  ADD COLUMN IF NOT EXISTS applied_to_plan_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_start_date date;

CREATE INDEX IF NOT EXISTS idx_forecast_phases_forecast
  ON public.project_forecast_phases (forecast_id);

ALTER TABLE public.project_forecast_phases ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_forecast_phases TO authenticated;
GRANT ALL ON public.project_forecast_phases TO service_role;

DROP POLICY IF EXISTS "Members view forecast phases" ON public.project_forecast_phases;
CREATE POLICY "Members view forecast phases"
  ON public.project_forecast_phases FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));
DROP POLICY IF EXISTS "Members write forecast phases" ON public.project_forecast_phases;
CREATE POLICY "Members write forecast phases"
  ON public.project_forecast_phases FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

DROP TRIGGER IF EXISTS trg_project_forecast_phases_updated_at ON public.project_forecast_phases;
CREATE TRIGGER trg_project_forecast_phases_updated_at
  BEFORE UPDATE ON public.project_forecast_phases
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
