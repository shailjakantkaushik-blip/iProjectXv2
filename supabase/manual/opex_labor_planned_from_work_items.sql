-- Planned FTE cost from work-item planned hours (estimate_hours × assignee rates).
-- Paste into Supabase SQL Editor, then Reload schema.
-- Actual FTE remains opex_labor_actual (from approved timesheets → project incurred).

ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_labor_planned NUMERIC(14,2) DEFAULT 0;

COMMENT ON COLUMN public.financials_monthly.opex_labor_planned IS
  'Planned FTE / labor OpEx from work-item estimate_hours × resource cost_rate (synced from app). Separate from general opex_planned budget.';

COMMENT ON COLUMN public.financials_monthly.opex_labor_actual IS
  'FTE / timesheet labor actual OpEx for the period (recomputed from approved timesheets). Feeds project opex_incurred.';
