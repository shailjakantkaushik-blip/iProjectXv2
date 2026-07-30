-- Paste in Supabase SQL Editor, then Reload schema.
-- Other OpEx cost log with stage gate → rolls to OPEX Other / OPEX Actual (all).

-- Other OpEx cost log → rolls into financials_monthly.opex_other_actual
-- and keeps opex_actual = opex_labor_actual + opex_other_actual.

CREATE TABLE IF NOT EXISTS public.opex_other_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stream_id uuid REFERENCES public.project_streams(id) ON DELETE SET NULL,
  stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL,
  cost_date date NOT NULL DEFAULT (CURRENT_DATE),
  period_month date NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  description text,
  vendor text,
  invoice_ref text,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'posted'
    CHECK (status IN ('draft', 'posted')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opex_other_costs_org_month
  ON public.opex_other_costs (org_id, period_month);
CREATE INDEX IF NOT EXISTS idx_opex_other_costs_project_month
  ON public.opex_other_costs (project_id, period_month);
CREATE INDEX IF NOT EXISTS idx_opex_other_costs_stream
  ON public.opex_other_costs (stream_id);
CREATE INDEX IF NOT EXISTS idx_opex_other_costs_gate
  ON public.opex_other_costs (stage_gate_id);

COMMENT ON TABLE public.opex_other_costs IS
  'Non-labor OpEx line items. Posted rows roll up to financials_monthly.opex_other_actual.';

COMMENT ON COLUMN public.opex_other_costs.stage_gate_id IS
  'Optional stage gate / phase attribution for the cost.';

ALTER TABLE public.opex_other_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read opex_other_costs" ON public.opex_other_costs;
CREATE POLICY "org read opex_other_costs" ON public.opex_other_costs
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR public.user_can_view_project(auth.uid(), project_id)
    )
  );

DROP POLICY IF EXISTS "editors write opex_other_costs" ON public.opex_other_costs;
CREATE POLICY "editors write opex_other_costs" ON public.opex_other_costs
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.can_edit_project(auth.uid(), project_id)
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND public.can_edit_project(auth.uid(), project_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opex_other_costs TO authenticated;
GRANT ALL ON public.opex_other_costs TO service_role;

-- Ensure monthly labor/other columns exist
ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_labor_actual NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_other_actual NUMERIC(14,2) DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recompute_opex_other_for_lane(
  _org_id uuid,
  _project_id uuid,
  _stream_id uuid,
  _period_month date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  period date := date_trunc('month', _period_month)::date;
  other_amt numeric(14,2);
  labor_amt numeric(14,2);
  sid uuid := _stream_id;
BEGIN
  SELECT COALESCE(SUM(c.amount), 0) INTO other_amt
  FROM public.opex_other_costs c
  WHERE c.org_id = _org_id
    AND c.project_id = _project_id
    AND c.status = 'posted'
    AND c.period_month = period
    AND c.stream_id IS NOT DISTINCT FROM sid;

  IF sid IS NOT NULL THEN
    SELECT COALESCE(opex_labor_actual, 0) INTO labor_amt
    FROM public.financials_monthly
    WHERE project_id = _project_id
      AND period_month = period
      AND stream_id = sid;

    UPDATE public.financials_monthly
    SET opex_other_actual = other_amt,
        opex_actual = COALESCE(labor_amt, 0) + other_amt
    WHERE project_id = _project_id
      AND period_month = period
      AND stream_id = sid;

    IF NOT FOUND THEN
      INSERT INTO public.financials_monthly (
        org_id, project_id, stream_id, period_month,
        opex_actual, opex_labor_actual, opex_other_actual,
        capex_planned, capex_actual, opex_planned
      ) VALUES (
        _org_id, _project_id, sid, period,
        other_amt, 0, other_amt,
        0, 0, 0
      );
    END IF;
  ELSE
    SELECT COALESCE(opex_labor_actual, 0) INTO labor_amt
    FROM public.financials_monthly
    WHERE project_id = _project_id
      AND period_month = period
      AND stream_id IS NULL;

    UPDATE public.financials_monthly
    SET opex_other_actual = other_amt,
        opex_actual = COALESCE(labor_amt, 0) + other_amt
    WHERE project_id = _project_id
      AND period_month = period
      AND stream_id IS NULL;

    IF NOT FOUND THEN
      INSERT INTO public.financials_monthly (
        org_id, project_id, stream_id, period_month,
        opex_actual, opex_labor_actual, opex_other_actual,
        capex_planned, capex_actual, opex_planned
      ) VALUES (
        _org_id, _project_id, NULL, period,
        other_amt, 0, other_amt,
        0, 0, 0
      );
    END IF;
  END IF;

  UPDATE public.projects p
  SET
    opex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.opex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0)
  WHERE p.id = _project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_opex_other_costs_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    NEW.period_month := date_trunc('month', NEW.cost_date)::date;
    NEW.updated_at := now();
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_opex_other_for_lane(
      OLD.org_id, OLD.project_id, OLD.stream_id, OLD.period_month
    );
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Recompute old lane if project/stream/month changed
    IF OLD.project_id IS DISTINCT FROM NEW.project_id
       OR OLD.stream_id IS DISTINCT FROM NEW.stream_id
       OR OLD.period_month IS DISTINCT FROM NEW.period_month
       OR OLD.org_id IS DISTINCT FROM NEW.org_id THEN
      PERFORM public.recompute_opex_other_for_lane(
        OLD.org_id, OLD.project_id, OLD.stream_id, OLD.period_month
      );
    END IF;
  END IF;

  PERFORM public.recompute_opex_other_for_lane(
    NEW.org_id, NEW.project_id, NEW.stream_id, NEW.period_month
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opex_other_costs_bi ON public.opex_other_costs;
CREATE TRIGGER trg_opex_other_costs_bi
  BEFORE INSERT OR UPDATE OF cost_date ON public.opex_other_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_opex_other_costs_period_month();

-- Split period_month assignment (BEFORE) from rollup (AFTER)
CREATE OR REPLACE FUNCTION public.trg_opex_other_costs_period_month()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.period_month := date_trunc('month', COALESCE(NEW.cost_date, CURRENT_DATE))::date;
  NEW.updated_at := now();
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org(auth.uid());
  END IF;
  IF NEW.created_by IS NULL AND TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_opex_other_costs_after_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_opex_other_for_lane(
      OLD.org_id, OLD.project_id, OLD.stream_id, OLD.period_month
    );
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.project_id IS DISTINCT FROM NEW.project_id
       OR OLD.stream_id IS DISTINCT FROM NEW.stream_id
       OR OLD.period_month IS DISTINCT FROM NEW.period_month
       OR OLD.org_id IS DISTINCT FROM NEW.org_id
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.amount IS DISTINCT FROM NEW.amount THEN
      PERFORM public.recompute_opex_other_for_lane(
        OLD.org_id, OLD.project_id, OLD.stream_id, OLD.period_month
      );
    END IF;
  END IF;

  PERFORM public.recompute_opex_other_for_lane(
    NEW.org_id, NEW.project_id, NEW.stream_id, NEW.period_month
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opex_other_costs_bi ON public.opex_other_costs;
DROP TRIGGER IF EXISTS trg_opex_other_costs_period ON public.opex_other_costs;
CREATE TRIGGER trg_opex_other_costs_period
  BEFORE INSERT OR UPDATE ON public.opex_other_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_opex_other_costs_period_month();

DROP TRIGGER IF EXISTS trg_opex_other_costs_rollup ON public.opex_other_costs;
DROP TRIGGER IF EXISTS trg_opex_other_costs_aiud ON public.opex_other_costs;
CREATE TRIGGER trg_opex_other_costs_aiud
  AFTER INSERT OR UPDATE OR DELETE ON public.opex_other_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_opex_other_costs_after_rollup();

-- Clean up unused combined trigger function if created above
DROP FUNCTION IF EXISTS public.trg_opex_other_costs_rollup();

GRANT EXECUTE ON FUNCTION public.recompute_opex_other_for_lane(uuid, uuid, uuid, date) TO authenticated;
