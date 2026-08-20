-- Estimation "further cost" lines can be CapEx or OpEx so Apply writes
-- capex_planned vs opex_planned accordingly.

ALTER TABLE public.project_forecast_other_costs
  ADD COLUMN IF NOT EXISTS cost_type text NOT NULL DEFAULT 'opex';

UPDATE public.project_forecast_other_costs
   SET cost_type = 'opex'
 WHERE cost_type IS NULL OR btrim(cost_type) = '';

ALTER TABLE public.project_forecast_other_costs
  DROP CONSTRAINT IF EXISTS project_forecast_other_costs_cost_type_check;

ALTER TABLE public.project_forecast_other_costs
  ADD CONSTRAINT project_forecast_other_costs_cost_type_check
  CHECK (cost_type IN ('capex', 'opex'));
