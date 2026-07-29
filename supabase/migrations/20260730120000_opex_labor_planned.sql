-- Planned FTE cost column (work-item driven). See also supabase/manual/opex_labor_planned_from_work_items.sql
ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_labor_planned NUMERIC(14,2) DEFAULT 0;

COMMENT ON COLUMN public.financials_monthly.opex_labor_planned IS
  'Planned FTE / labor OpEx from work-item estimate_hours × resource cost_rate (synced from app). Separate from general opex_planned budget.';
