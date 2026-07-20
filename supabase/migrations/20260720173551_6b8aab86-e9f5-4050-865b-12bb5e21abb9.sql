
-- Extend decisions register
ALTER TABLE public.decisions
  ADD COLUMN IF NOT EXISTS program TEXT,
  ADD COLUMN IF NOT EXISTS forum TEXT,
  ADD COLUMN IF NOT EXISTS sponsor TEXT,
  ADD COLUMN IF NOT EXISTS approvers TEXT,
  ADD COLUMN IF NOT EXISTS stage_gate_id UUID REFERENCES public.stage_gates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome TEXT CHECK (outcome IN ('Approved','Rejected','On Hold','In Review','Pending'));

-- When a decision outcome is set/changed against a stage gate, propagate to the gate's status
CREATE OR REPLACE FUNCTION public.sync_stage_gate_from_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_status TEXT;
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
  UPDATE public.stage_gates
     SET status = new_status,
         actual_date = COALESCE(actual_date, NEW.decision_date, CURRENT_DATE),
         approver = COALESCE(NEW.approvers, approver),
         updated_at = now()
   WHERE id = NEW.stage_gate_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_decision_sync_gate ON public.decisions;
CREATE TRIGGER trg_decision_sync_gate
AFTER INSERT OR UPDATE OF outcome, stage_gate_id, decision_date, approvers
ON public.decisions
FOR EACH ROW EXECUTE FUNCTION public.sync_stage_gate_from_decision();
