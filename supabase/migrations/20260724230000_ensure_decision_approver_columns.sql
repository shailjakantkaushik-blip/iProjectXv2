-- Ensure decision approver columns exist on live DBs where
-- 20260721020000_decision_approver_notifications.sql was skipped/failed.
-- Also reload PostgREST schema cache so inserts stop failing with
-- "Could not find the 'approver_user_id' column ... in the schema cache".

ALTER TABLE public.decisions
  ADD COLUMN IF NOT EXISTS approver_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_decisions_approver_user
  ON public.decisions(approver_user_id)
  WHERE approver_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_decisions_outcome_approver
  ON public.decisions(org_id, outcome, approver_user_id);

CREATE OR REPLACE FUNCTION public.tg_decision_approval_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approver_user_id IS NOT NULL
     AND COALESCE(NEW.outcome, 'Pending') IN ('Pending', 'In Review')
     AND (
       TG_OP = 'INSERT'
       OR OLD.approver_user_id IS DISTINCT FROM NEW.approver_user_id
       OR (OLD.outcome IS DISTINCT FROM NEW.outcome AND NEW.outcome IN ('Pending', 'In Review'))
     )
  THEN
    NEW.approval_requested_at := COALESCE(NEW.approval_requested_at, now());
  END IF;

  IF NEW.outcome IN ('Approved', 'Rejected')
     AND (TG_OP = 'INSERT' OR OLD.outcome IS DISTINCT FROM NEW.outcome)
  THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decision_approval_stamp ON public.decisions;
CREATE TRIGGER trg_decision_approval_stamp
  BEFORE INSERT OR UPDATE OF approver_user_id, outcome, approval_requested_at, approved_at
  ON public.decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_decision_approval_stamp();

CREATE OR REPLACE FUNCTION public.tg_decision_notify_approver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj_code text;
  proj_name text;
  title_txt text;
  body_txt text;
  should_notify boolean := false;
BEGIN
  IF NEW.approver_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.outcome, 'Pending') NOT IN ('Pending', 'In Review') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    should_notify := true;
  ELSIF OLD.approver_user_id IS DISTINCT FROM NEW.approver_user_id THEN
    should_notify := true;
  ELSIF OLD.outcome IS DISTINCT FROM NEW.outcome
        AND NEW.outcome IN ('Pending', 'In Review') THEN
    should_notify := true;
  END IF;

  IF NOT should_notify THEN
    RETURN NEW;
  END IF;

  SELECT p.project_code, p.name
    INTO proj_code, proj_name
  FROM public.projects p
  WHERE p.id = NEW.project_id;

  title_txt := 'Decision approval requested';
  body_txt := COALESCE(NEW.title, 'Untitled decision')
    || CASE
         WHEN proj_code IS NOT NULL OR proj_name IS NOT NULL
           THEN ' · ' || COALESCE(proj_code || ' — ', '') || COALESCE(proj_name, '')
         ELSE ''
       END
    || CASE
         WHEN NEW.outcome IS NOT NULL THEN ' (' || NEW.outcome || ')'
         ELSE ''
       END;

  INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
  VALUES (
    NEW.approver_user_id,
    NEW.org_id,
    'decision_approval',
    title_txt,
    body_txt,
    '/app/decisions?awaiting=me'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decision_notify_approver ON public.decisions;
CREATE TRIGGER trg_decision_notify_approver
  AFTER INSERT OR UPDATE OF approver_user_id, outcome
  ON public.decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_decision_notify_approver();

COMMENT ON COLUMN public.decisions.approver_user_id IS
  'Org user who must approve/reject this decision; receives in-app notification.';

-- Force PostgREST to pick up the new columns immediately.
NOTIFY pgrst, 'reload schema';
