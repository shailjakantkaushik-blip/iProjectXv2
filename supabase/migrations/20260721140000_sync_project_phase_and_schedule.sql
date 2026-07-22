-- Keep project schedule dates and current_phase aligned with planned/actual
-- dates and stage_gates — including Excel import / Data Editor writes.

-- ========== Schedule Start/End = Actual → else Planned ==========
CREATE OR REPLACE FUNCTION public.tg_sync_project_schedule_dates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Seed planned from legacy schedule once, if planned is empty.
  NEW.planned_start_date := COALESCE(NEW.planned_start_date, NEW.start_date);
  NEW.planned_end_date := COALESCE(NEW.planned_end_date, NEW.end_date);

  -- Legacy schedule window used by Gantt / FY / overdue.
  NEW.start_date := COALESCE(NEW.actual_start_date, NEW.planned_start_date, NEW.start_date);
  NEW.end_date := COALESCE(NEW.actual_end_date, NEW.planned_end_date, NEW.end_date);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_sync_schedule ON public.projects;
CREATE TRIGGER trg_projects_sync_schedule
  BEFORE INSERT OR UPDATE OF
    planned_start_date, planned_end_date,
    actual_start_date, actual_end_date,
    start_date, end_date
  ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sync_project_schedule_dates();

-- ========== Resolve current phase from stage gates ==========
CREATE OR REPLACE FUNCTION public.resolve_project_current_phase(p_project_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_phase text;
BEGIN
  -- Prefer first in-flight gate (org definition order, then planned date).
  SELECT g.gate_name INTO v_phase
  FROM public.stage_gates g
  LEFT JOIN public.stage_gate_definitions d
    ON d.org_id = g.org_id
   AND d.gate_name = g.gate_name
   AND COALESCE(d.is_active, true)
  WHERE g.project_id = p_project_id
    AND lower(trim(COALESCE(g.status, 'pending'))) IN (
      'pending', 'in progress', 'in-progress', 'in review', 'open', 'on hold'
    )
  ORDER BY COALESCE(d.sort_order, 9999), g.planned_date NULLS LAST, g.created_at
  LIMIT 1;

  IF v_phase IS NOT NULL THEN
    RETURN v_phase;
  END IF;

  -- Else last approved gate.
  SELECT g.gate_name INTO v_phase
  FROM public.stage_gates g
  LEFT JOIN public.stage_gate_definitions d
    ON d.org_id = g.org_id
   AND d.gate_name = g.gate_name
   AND COALESCE(d.is_active, true)
  WHERE g.project_id = p_project_id
    AND lower(trim(COALESCE(g.status, ''))) = 'approved'
  ORDER BY COALESCE(d.sort_order, -1) DESC, g.planned_date DESC NULLS LAST, g.created_at DESC
  LIMIT 1;

  RETURN v_phase;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_sync_project_phase_from_gates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  phase text;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  IF pid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  phase := public.resolve_project_current_phase(pid);
  IF phase IS NOT NULL THEN
    UPDATE public.projects
       SET current_phase = phase,
           updated_at = now()
     WHERE id = pid
       AND COALESCE(current_phase, '') IS DISTINCT FROM phase;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_stage_gates_sync_phase ON public.stage_gates;
CREATE TRIGGER trg_stage_gates_sync_phase
  AFTER INSERT OR UPDATE OF status, gate_name, planned_date OR DELETE
  ON public.stage_gates
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sync_project_phase_from_gates();

-- ========== One-time backfill ==========
UPDATE public.projects
   SET planned_start_date = COALESCE(planned_start_date, start_date),
       planned_end_date   = COALESCE(planned_end_date, end_date);

UPDATE public.projects
   SET start_date = COALESCE(actual_start_date, planned_start_date, start_date),
       end_date   = COALESCE(actual_end_date, planned_end_date, end_date);

UPDATE public.projects p
   SET current_phase = public.resolve_project_current_phase(p.id),
       updated_at = now()
 WHERE public.resolve_project_current_phase(p.id) IS NOT NULL
   AND COALESCE(p.current_phase, '') IS DISTINCT FROM public.resolve_project_current_phase(p.id);
