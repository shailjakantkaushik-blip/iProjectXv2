-- Resource allocation at stage-gate grain + idempotent labor → OpEx rollup.
-- Also adds opex_other_actual so FTE labor and other OpEx stay distinct.
-- Paste into Supabase SQL Editor, then Reload schema.

-- ========== 1) Planned allocations → stage gate ==========
ALTER TABLE public.resource_allocations
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_resource_allocations_stage_gate
  ON public.resource_allocations (stage_gate_id)
  WHERE stage_gate_id IS NOT NULL;

COMMENT ON COLUMN public.resource_allocations.stage_gate_id IS
  'Optional stage gate / phase for planned FTE allocation (project + stream + gate + month).';

-- Prefer unique key that includes stage_gate (null-safe partial indexes).
DROP INDEX IF EXISTS public.resource_allocations_stream_uidx;
DROP INDEX IF EXISTS public.resource_allocations_null_stream_uidx;
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

-- ========== 2) Other OpEx (non-FTE) vs labor ==========
ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_other_actual NUMERIC(14,2) DEFAULT 0;

COMMENT ON COLUMN public.financials_monthly.opex_labor_actual IS
  'FTE / timesheet labor actual OpEx for the period (recomputed from approved timesheets).';
COMMENT ON COLUMN public.financials_monthly.opex_other_actual IS
  'Non-labor OpEx actual (vendors, licenses, etc.). opex_actual ≈ other + labor.';

-- Backfill other = total − labor when other is still zero
UPDATE public.financials_monthly
SET opex_other_actual = GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))
WHERE COALESCE(opex_other_actual, 0) = 0
  AND COALESCE(opex_actual, 0) > 0;

-- ========== 3) Idempotent labor apply ==========
CREATE OR REPLACE FUNCTION public.apply_timesheet_labor_cost(_timesheet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.timesheets;
  rate numeric(12,2);
  rec record;
  period date;
  sid uuid;
  labor numeric(14,2);
BEGIN
  SELECT * INTO t FROM public.timesheets WHERE id = _timesheet_id;
  IF NOT FOUND OR t.status <> 'approved' THEN
    RETURN;
  END IF;

  SELECT COALESCE(r.cost_rate, 0) INTO rate
  FROM public.resources r
  WHERE r.id = t.resource_id OR (r.org_id = t.org_id AND r.user_id = t.user_id)
  ORDER BY CASE WHEN r.id = t.resource_id THEN 0 ELSE 1 END
  LIMIT 1;
  rate := COALESCE(rate, 0);

  UPDATE public.timesheet_entries e
  SET hourly_rate = rate,
      labor_cost = ROUND(
        rate * (e.hours_mon + e.hours_tue + e.hours_wed + e.hours_thu
                + e.hours_fri + e.hours_sat + e.hours_sun),
        2
      ),
      stream_id = COALESCE(
        e.stream_id,
        (SELECT wi.stream_id FROM public.work_items wi WHERE wi.id = e.work_item_id)
      ),
      stage_gate_id = COALESCE(
        e.stage_gate_id,
        (SELECT wi.stage_gate_id FROM public.work_items wi WHERE wi.id = e.work_item_id)
      )
  WHERE e.timesheet_id = t.id;

  period := date_trunc('month', t.week_start)::date;

  -- Recompute labor for every project/stream month touched by this sheet
  -- (idempotent: set labor from ALL approved entries, not += this sheet).
  FOR rec IN
    SELECT DISTINCT e.project_id,
           COALESCE(e.stream_id, wi.stream_id) AS stream_id
    FROM public.timesheet_entries e
    LEFT JOIN public.work_items wi ON wi.id = e.work_item_id
    WHERE e.timesheet_id = t.id
      AND e.billable = true
      AND e.project_id IS NOT NULL
  LOOP
    sid := rec.stream_id;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id AND COALESCE(is_default, false) = true
      LIMIT 1;
    END IF;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id
      ORDER BY sort_order NULLS LAST
      LIMIT 1;
    END IF;

    SELECT COALESCE(SUM(e.labor_cost), 0) INTO labor
    FROM public.timesheet_entries e
    JOIN public.timesheets ts ON ts.id = e.timesheet_id
    LEFT JOIN public.work_items wi ON wi.id = e.work_item_id
    WHERE ts.status = 'approved'
      AND e.billable = true
      AND e.project_id = rec.project_id
      AND date_trunc('month', ts.week_start)::date = period
      AND COALESCE(e.stream_id, wi.stream_id, sid) IS NOT DISTINCT FROM sid;

    IF sid IS NOT NULL THEN
      UPDATE public.financials_monthly
      SET opex_labor_actual = labor,
          opex_other_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))),
          opex_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))) + labor
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id = sid;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month,
          opex_actual, opex_labor_actual, opex_other_actual
        ) VALUES (t.org_id, rec.project_id, sid, period, labor, labor, 0);
      END IF;
    ELSE
      UPDATE public.financials_monthly
      SET opex_labor_actual = labor,
          opex_other_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))),
          opex_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))) + labor
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id IS NULL;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month,
          opex_actual, opex_labor_actual, opex_other_actual
        ) VALUES (t.org_id, rec.project_id, NULL, period, labor, labor, 0);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.projects p
  SET
    opex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.opex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0),
    capex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.capex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0)
  WHERE p.id IN (
    SELECT DISTINCT project_id FROM public.timesheet_entries
    WHERE timesheet_id = t.id AND project_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_timesheet_labor_cost(uuid) TO authenticated;

-- ========== 4) Default capability: timesheet / resource cost view ==========
-- Stored as capability::timesheet_cost_view — org admins can change on Permissions.
INSERT INTO public.role_table_permissions (org_id, role, table_name, can_view, can_edit)
SELECT o.id, r.role_key, 'capability::timesheet_cost_view', true, true
FROM public.organizations o
CROSS JOIN (
  VALUES ('admin'), ('org_admin'), ('pm'), ('executive'), ('bu_lead')
) AS r(role_key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_table_permissions p
  WHERE p.org_id = o.id
    AND p.role = r.role_key
    AND p.table_name = 'capability::timesheet_cost_view'
);
