-- Stage gates live on streams (not project rollup).
-- Work items select a stage gate so labor/cost can attribute to a phase.
-- Paste into Supabase SQL Editor, then Reload schema.

-- ========== 1) Backfill project-level gates onto Core stream ==========
UPDATE public.stage_gates g
SET stream_id = s.id
FROM public.project_streams s
WHERE g.stream_id IS NULL
  AND s.project_id = g.project_id
  AND COALESCE(s.is_default, false) = true;

-- ========== 2) Work items → stage gate (phase) ==========
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_items_stage_gate
  ON public.work_items (stage_gate_id)
  WHERE stage_gate_id IS NOT NULL;

COMMENT ON COLUMN public.work_items.stage_gate_id IS
  'Stage gate / phase this work item contributes to (stream-scoped).';

-- ========== 3) Stamp stage gate on timesheet entries for stable phase cost ==========
ALTER TABLE public.timesheet_entries
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_stage_gate
  ON public.timesheet_entries (stage_gate_id)
  WHERE stage_gate_id IS NOT NULL;

COMMENT ON COLUMN public.timesheet_entries.stage_gate_id IS
  'Copied from work_items.stage_gate_id when hours are stamped/approved — phase labor attribution.';

-- When stamping labor, also copy stage_gate_id from the work item
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

  IF rate <= 0 THEN
    RETURN;
  END IF;

  period := date_trunc('month', t.week_start)::date;

  FOR rec IN
    SELECT e.project_id,
           COALESCE(e.stream_id, wi.stream_id) AS stream_id,
           SUM(e.labor_cost) AS cost
    FROM public.timesheet_entries e
    LEFT JOIN public.work_items wi ON wi.id = e.work_item_id
    WHERE e.timesheet_id = t.id
      AND e.billable = true
      AND e.project_id IS NOT NULL
      AND e.work_item_id IS NOT NULL
    GROUP BY e.project_id, COALESCE(e.stream_id, wi.stream_id)
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

    IF sid IS NOT NULL THEN
      UPDATE public.financials_monthly
      SET opex_actual = COALESCE(opex_actual, 0) + rec.cost,
          opex_labor_actual = COALESCE(opex_labor_actual, 0) + rec.cost
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id = sid;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month, opex_actual, opex_labor_actual
        ) VALUES (t.org_id, rec.project_id, sid, period, rec.cost, rec.cost);
      END IF;
    ELSE
      UPDATE public.financials_monthly
      SET opex_actual = COALESCE(opex_actual, 0) + rec.cost,
          opex_labor_actual = COALESCE(opex_labor_actual, 0) + rec.cost
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id IS NULL;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month, opex_actual, opex_labor_actual
        ) VALUES (t.org_id, rec.project_id, NULL, period, rec.cost, rec.cost);
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
    ), 0),
    updated_at = now()
  WHERE p.id IN (
    SELECT DISTINCT project_id FROM public.timesheet_entries
    WHERE timesheet_id = t.id AND billable = true AND project_id IS NOT NULL
  );

  BEGIN
    FOR rec IN
      SELECT DISTINCT project_id AS pid
      FROM public.timesheet_entries
      WHERE timesheet_id = t.id AND billable = true AND project_id IS NOT NULL
    LOOP
      PERFORM public.rollup_project_from_streams(rec.pid);
    END LOOP;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_timesheet_labor_cost(uuid) TO authenticated;
