-- Stage gates are the governance source of truth. Mirror each gate into a
-- linked milestone so timeline / executive milestone views stay populated.
-- Manual (add-on) milestones remain allowed with stage_gate_id NULL.

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'milestones_stage_gate_id_key'
      AND conrelid = 'public.milestones'::regclass
  ) THEN
    ALTER TABLE public.milestones
      ADD CONSTRAINT milestones_stage_gate_id_key UNIQUE (stage_gate_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.map_gate_status_to_milestone(p_status text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text := lower(trim(COALESCE(p_status, 'pending')));
BEGIN
  IF s IN ('approved', 'complete', 'completed', 'passed') THEN
    RETURN 'Completed';
  ELSIF s IN ('in review', 'in progress', 'in-progress', 'open') THEN
    RETURN 'In Progress';
  ELSIF s IN ('on hold') THEN
    RETURN 'On Hold';
  ELSIF s IN ('rejected', 'cancelled', 'canceled') THEN
    RETURN 'Cancelled';
  ELSE
    RETURN 'Not Started';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_sync_milestone_from_stage_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_notes text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- CASCADE on stage_gate_id handles linked rows; nothing else to do.
    RETURN OLD;
  END IF;

  v_status := public.map_gate_status_to_milestone(NEW.status);
  v_notes := CASE
    WHEN NEW.notes IS NULL OR btrim(NEW.notes) = '' THEN 'Synced from stage gate'
    ELSE NEW.notes
  END;

  INSERT INTO public.milestones (
    org_id,
    project_id,
    stage_gate_id,
    name,
    planned_date,
    actual_date,
    status,
    owner,
    notes
  )
  VALUES (
    NEW.org_id,
    NEW.project_id,
    NEW.id,
    NEW.gate_name,
    NEW.planned_date,
    NEW.actual_date,
    v_status,
    NEW.approver,
    v_notes
  )
  ON CONFLICT (stage_gate_id)
  DO UPDATE SET
    name = EXCLUDED.name,
    planned_date = EXCLUDED.planned_date,
    actual_date = EXCLUDED.actual_date,
    status = EXCLUDED.status,
    owner = COALESCE(EXCLUDED.owner, public.milestones.owner),
    notes = CASE
      WHEN public.milestones.notes IS NULL
        OR btrim(public.milestones.notes) = ''
        OR public.milestones.notes = 'Synced from stage gate'
      THEN EXCLUDED.notes
      ELSE public.milestones.notes
    END,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stage_gates_sync_milestone ON public.stage_gates;
CREATE TRIGGER trg_stage_gates_sync_milestone
  AFTER INSERT OR UPDATE OF gate_name, planned_date, actual_date, status, approver, notes, project_id, org_id
  ON public.stage_gates
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sync_milestone_from_stage_gate();

-- Quiet auto-creates from gates; still announce meaningful completion changes.
CREATE OR REPLACE FUNCTION public.tg_milestone_to_status_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  proj_name text;
  msg text;
  is_new_complete boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Gate-linked milestones are system-mirrored; skip the "added" feed noise.
    IF NEW.stage_gate_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    msg := 'Milestone added: ' || NEW.name;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.actual_date IS NOT NULL AND (OLD.actual_date IS NULL OR OLD.actual_date <> NEW.actual_date) THEN
      msg := 'Milestone completed: ' || NEW.name || ' on ' || NEW.actual_date::text;
      is_new_complete := true;
    ELSIF COALESCE(NEW.status,'') <> COALESCE(OLD.status,'') THEN
      msg := 'Milestone status changed to ' || COALESCE(NEW.status,'—') || ': ' || NEW.name;
    ELSIF COALESCE(NEW.planned_date::text,'') <> COALESCE(OLD.planned_date::text,'') THEN
      msg := 'Milestone rescheduled: ' || NEW.name || ' → ' || COALESCE(NEW.planned_date::text,'TBD');
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT name INTO proj_name FROM public.projects WHERE id = NEW.project_id;

  INSERT INTO public.status_updates (org_id, project_id, update_date, reporter, overall_rag, progress_summary, achievements)
  VALUES (
    NEW.org_id,
    NEW.project_id,
    COALESCE(NEW.actual_date, CURRENT_DATE),
    COALESCE(NEW.owner, 'System'),
    'Green',
    msg,
    CASE WHEN is_new_complete THEN '✅ ' || NEW.name ELSE NULL END
  );
  RETURN NEW;
END $$;

-- Link existing same-name milestones, then create any missing gate mirrors.
UPDATE public.milestones m
SET stage_gate_id = g.id
FROM public.stage_gates g
WHERE m.stage_gate_id IS NULL
  AND m.project_id = g.project_id
  AND lower(trim(m.name)) = lower(trim(g.gate_name))
  AND NOT EXISTS (
    SELECT 1 FROM public.milestones x
    WHERE x.stage_gate_id = g.id
  );

INSERT INTO public.milestones (
  org_id, project_id, stage_gate_id, name, planned_date, actual_date, status, owner, notes
)
SELECT
  g.org_id,
  g.project_id,
  g.id,
  g.gate_name,
  g.planned_date,
  g.actual_date,
  public.map_gate_status_to_milestone(g.status),
  g.approver,
  COALESCE(NULLIF(btrim(g.notes), ''), 'Synced from stage gate')
FROM public.stage_gates g
WHERE NOT EXISTS (
  SELECT 1 FROM public.milestones m WHERE m.stage_gate_id = g.id
);
