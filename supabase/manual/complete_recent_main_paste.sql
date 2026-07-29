-- =============================================================================
-- iProjectX — complete SQL for latest main (safe to re-run)
-- Paste into Supabase SQL Editor → Run → then: Settings → API → Reload schema
-- (or Dashboard → Project Settings → reload PostgREST schema cache)
-- =============================================================================

-- ---------- A) Planned FTE from work items ----------
ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_labor_planned NUMERIC(14,2) DEFAULT 0;

ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_labor_actual NUMERIC(14,2) DEFAULT 0;

ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_other_actual NUMERIC(14,2) DEFAULT 0;

COMMENT ON COLUMN public.financials_monthly.opex_labor_planned IS
  'Planned FTE / labor OpEx from work-item estimate_hours × resource cost_rate (synced from app). Separate from general opex_planned budget.';
COMMENT ON COLUMN public.financials_monthly.opex_labor_actual IS
  'FTE / timesheet labor actual OpEx for the period (recomputed from approved timesheets). Feeds project opex_incurred.';
COMMENT ON COLUMN public.financials_monthly.opex_other_actual IS
  'Non-labor OpEx actual (vendors, licenses, etc.). opex_actual ≈ other + labor.';

UPDATE public.financials_monthly
SET opex_other_actual = GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))
WHERE COALESCE(opex_other_actual, 0) = 0
  AND COALESCE(opex_actual, 0) > 0;

-- ---------- B) Work item planned / actual hours ----------
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS estimate_hours NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(12,2) DEFAULT 0;

COMMENT ON COLUMN public.work_items.estimate_hours IS
  'Planned hours for the work item (feeds demand + planned FTE $).';
COMMENT ON COLUMN public.work_items.actual_hours IS
  'Actual hours from approved billable timesheet entries.';

-- ---------- C) Resource allocation stage gate ----------
ALTER TABLE public.resource_allocations
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_resource_allocations_stage_gate
  ON public.resource_allocations (stage_gate_id)
  WHERE stage_gate_id IS NOT NULL;

COMMENT ON COLUMN public.resource_allocations.stage_gate_id IS
  'Optional stage gate / phase for planned FTE allocation (project + stream + gate + month).';

DROP INDEX IF EXISTS public.resource_allocations_project_stream_resource_period_uidx;
DROP INDEX IF EXISTS public.resource_allocations_project_null_stream_resource_period_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_proj_stream_gate_res_period_uidx
  ON public.resource_allocations (project_id, stream_id, stage_gate_id, resource_id, period_month)
  WHERE stream_id IS NOT NULL AND stage_gate_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_proj_stream_nullgate_res_period_uidx
  ON public.resource_allocations (project_id, stream_id, resource_id, period_month)
  WHERE stream_id IS NOT NULL AND stage_gate_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_proj_nullstream_gate_res_period_uidx
  ON public.resource_allocations (project_id, stage_gate_id, resource_id, period_month)
  WHERE stream_id IS NULL AND stage_gate_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_proj_nullstream_nullgate_res_period_uidx
  ON public.resource_allocations (project_id, resource_id, period_month)
  WHERE stream_id IS NULL AND stage_gate_id IS NULL;

-- ---------- D) Work item / timesheet stage gate (if missing) ----------
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL;

ALTER TABLE public.timesheet_entries
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL;

ALTER TABLE public.timesheet_entries
  ADD COLUMN IF NOT EXISTS stream_id uuid,
  ADD COLUMN IF NOT EXISTS labor_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(12,2);

-- ---------- E) Timesheet reopen columns ----------
ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS reopen_reason text,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  ALTER TABLE public.timesheet_approvals DROP CONSTRAINT IF EXISTS timesheet_approvals_status_check;
  ALTER TABLE public.timesheet_approvals
    ADD CONSTRAINT timesheet_approvals_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'superseded'));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'timesheet_approvals status check skipped: %', SQLERRM;
END $$;

-- Done. Reload schema, then in app: Financials → Sync planned FTE from work items
-- (and Sync incurred from actuals if needed).
