-- Decision outcomes drive stage-gate approval everywhere the same gate name
-- appears on a project (project-level + each stream), not only the linked row.

CREATE OR REPLACE FUNCTION public.sync_stage_gate_from_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_status TEXT;
  src_project UUID;
  src_name TEXT;
  src_org UUID;
BEGIN
  IF NEW.stage_gate_id IS NULL OR NEW.outcome IS NULL THEN
    RETURN NEW;
  END IF;

  new_status := CASE NEW.outcome
    WHEN 'Approved'  THEN 'Approved'
    WHEN 'Rejected'  THEN 'Rejected'
    WHEN 'On Hold'   THEN 'On Hold'
    WHEN 'In Review' THEN 'In Review'
    ELSE 'Pending'
  END;

  SELECT project_id, gate_name, org_id
    INTO src_project, src_name, src_org
    FROM public.stage_gates
   WHERE id = NEW.stage_gate_id;

  IF src_project IS NULL OR coalesce(trim(src_name), '') = '' THEN
    UPDATE public.stage_gates
       SET status = new_status,
           actual_date = COALESCE(actual_date, NEW.decision_date, CURRENT_DATE),
           approver = COALESCE(NEW.approvers, approver),
           updated_at = now()
     WHERE id = NEW.stage_gate_id;
    RETURN NEW;
  END IF;

  UPDATE public.stage_gates
     SET status = new_status,
         actual_date = CASE
           WHEN new_status = 'Approved' THEN COALESCE(actual_date, NEW.decision_date, CURRENT_DATE)
           ELSE actual_date
         END,
         approver = COALESCE(NEW.approvers, approver),
         updated_at = now()
   WHERE project_id = src_project
     AND gate_name = src_name;

  IF NOT EXISTS (
    SELECT 1
      FROM public.stage_gates
     WHERE project_id = src_project
       AND gate_name = src_name
       AND stream_id IS NULL
  ) AND src_org IS NOT NULL THEN
    INSERT INTO public.stage_gates (
      org_id, project_id, stream_id, gate_name, status, actual_date, approver
    ) VALUES (
      src_org,
      src_project,
      NULL,
      src_name,
      new_status,
      CASE WHEN new_status = 'Approved' THEN COALESCE(NEW.decision_date, CURRENT_DATE) ELSE NULL END,
      NEW.approvers
    );
  END IF;

  RETURN NEW;
END $$;
