-- Additive ops enhancements: forecast, meeting summary, RAG override,
-- strategic alignment fields, cadence hierarchy, manual rank, payback.
-- Safe / idempotent. Does not rename existing columns.

-- =============================================================================
-- 1) Project columns
-- =============================================================================
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS functional_area text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS payback_months numeric;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS manual_rank integer;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS rag_override text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS rag_override_reason text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS rag_override_owner text;

ALTER TABLE public.benefits ADD COLUMN IF NOT EXISTS payback_months numeric;

ALTER TABLE public.governance_channels ADD COLUMN IF NOT EXISTS parent_channel_id uuid
  REFERENCES public.governance_channels(id) ON DELETE SET NULL;
ALTER TABLE public.governance_channels ADD COLUMN IF NOT EXISTS last_meeting date;

CREATE INDEX IF NOT EXISTS idx_gov_channels_parent
  ON public.governance_channels (org_id, parent_channel_id);

-- =============================================================================
-- 2) Project meeting summaries (progress since last meet / plan to next)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.project_meeting_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  previous_meeting_date date,
  next_meeting_date date,
  progress_manual text,
  action_plan_manual text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_meeting_summaries_org
  ON public.project_meeting_summaries (org_id);

ALTER TABLE public.project_meeting_summaries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_meeting_summaries TO authenticated;
GRANT ALL ON public.project_meeting_summaries TO service_role;

DROP POLICY IF EXISTS "Members view meeting summaries" ON public.project_meeting_summaries;
CREATE POLICY "Members view meeting summaries"
  ON public.project_meeting_summaries FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "Members write meeting summaries" ON public.project_meeting_summaries;
CREATE POLICY "Members write meeting summaries"
  ON public.project_meeting_summaries FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

DROP TRIGGER IF EXISTS trg_project_meeting_summaries_updated_at ON public.project_meeting_summaries;
CREATE TRIGGER trg_project_meeting_summaries_updated_at
  BEFORE UPDATE ON public.project_meeting_summaries
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =============================================================================
-- 3) Project forecast (versioned estimate; lock after kickoff)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.project_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  override_budget boolean NOT NULL DEFAULT false,
  total_labor_cost numeric NOT NULL DEFAULT 0,
  total_other_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  notes text,
  locked_at timestamptz,
  locked_by uuid,
  unlock_requested_at timestamptz,
  unlock_requested_by uuid,
  unlock_approved_at timestamptz,
  unlock_approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, project_id)
);

CREATE TABLE IF NOT EXISTS public.project_forecast_phase_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  forecast_id uuid NOT NULL REFERENCES public.project_forecasts(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stream_id uuid REFERENCES public.project_streams(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES public.resources(id) ON DELETE CASCADE,
  effort_days numeric NOT NULL DEFAULT 0,
  daily_rate numeric NOT NULL DEFAULT 0,
  labor_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_forecast_other_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  forecast_id uuid NOT NULL REFERENCES public.project_forecasts(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  heading text NOT NULL DEFAULT 'Other cost',
  amount numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forecast_phase_res_forecast
  ON public.project_forecast_phase_resources (forecast_id);
CREATE INDEX IF NOT EXISTS idx_forecast_other_forecast
  ON public.project_forecast_other_costs (forecast_id);

ALTER TABLE public.project_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_forecast_phase_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_forecast_other_costs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_forecasts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_forecast_phase_resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_forecast_other_costs TO authenticated;
GRANT ALL ON public.project_forecasts TO service_role;
GRANT ALL ON public.project_forecast_phase_resources TO service_role;
GRANT ALL ON public.project_forecast_other_costs TO service_role;

DROP POLICY IF EXISTS "Members view forecasts" ON public.project_forecasts;
CREATE POLICY "Members view forecasts"
  ON public.project_forecasts FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));
DROP POLICY IF EXISTS "Members write forecasts" ON public.project_forecasts;
CREATE POLICY "Members write forecasts"
  ON public.project_forecasts FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "Members view forecast resources" ON public.project_forecast_phase_resources;
CREATE POLICY "Members view forecast resources"
  ON public.project_forecast_phase_resources FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));
DROP POLICY IF EXISTS "Members write forecast resources" ON public.project_forecast_phase_resources;
CREATE POLICY "Members write forecast resources"
  ON public.project_forecast_phase_resources FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "Members view forecast other costs" ON public.project_forecast_other_costs;
CREATE POLICY "Members view forecast other costs"
  ON public.project_forecast_other_costs FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));
DROP POLICY IF EXISTS "Members write forecast other costs" ON public.project_forecast_other_costs;
CREATE POLICY "Members write forecast other costs"
  ON public.project_forecast_other_costs FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

DROP TRIGGER IF EXISTS trg_project_forecasts_updated_at ON public.project_forecasts;
CREATE TRIGGER trg_project_forecasts_updated_at
  BEFORE UPDATE ON public.project_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
