-- Canonical finance columns for FY budget vs forecast and project FAC.
-- Safe to re-run.

ALTER TABLE public.fy_allocations
  ADD COLUMN IF NOT EXISTS budget NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast NUMERIC(14,2) DEFAULT 0;

COMMENT ON COLUMN public.fy_allocations.budget IS
  'Total budget $ allocated to this FY (source of truth for Budget vs Forecast charts).';
COMMENT ON COLUMN public.fy_allocations.forecast IS
  'Total forecast $ allocated to this FY.';
COMMENT ON COLUMN public.fy_allocations.capex IS
  'CapEx portion of the FY budget split (detail).';
COMMENT ON COLUMN public.fy_allocations.opex IS
  'OpEx portion of the FY budget split (detail).';

-- Backfill budget/forecast from legacy capex+opex where new columns are empty.
UPDATE public.fy_allocations
SET
  budget = COALESCE(NULLIF(budget, 0), COALESCE(capex, 0) + COALESCE(opex, 0)),
  forecast = COALESCE(NULLIF(forecast, 0), COALESCE(capex, 0) + COALESCE(opex, 0))
WHERE COALESCE(budget, 0) = 0
   OR COALESCE(forecast, 0) = 0;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS forecast_at_completion NUMERIC(14,2) DEFAULT 0;

COMMENT ON COLUMN public.projects.forecast_at_completion IS
  'Forecast at completion (FAC). When 0/null, app uses CapEx+OpEx approved or budget.';

-- Backfill FAC from approved mix when empty.
UPDATE public.projects
SET forecast_at_completion = COALESCE(capex_approved, 0) + COALESCE(opex_approved, 0)
WHERE COALESCE(forecast_at_completion, 0) = 0
  AND (COALESCE(capex_approved, 0) + COALESCE(opex_approved, 0)) > 0;
