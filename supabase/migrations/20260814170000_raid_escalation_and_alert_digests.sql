-- RAID auto-escalation + outbound alert digest support.
-- Escalation rules (aligned with landing "Auto-escalation" + UI critical ≥15):
--   Risks: open/mitigating, severity ≥15 (or P×I) OR past due_date
--   Issues: open-ish, Critical/High priority, past target_date
--   Actions: open-ish, Critical/High priority, past due_date
-- Notifies project PM + org admins in-app; email digests opt via profiles.notification_prefs.

-- ========== Escalation columns ==========
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_level int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalation_reason text;

ALTER TABLE public.issues
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_level int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalation_reason text;

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_level int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalation_reason text;

CREATE INDEX IF NOT EXISTS idx_risks_escalated
  ON public.risks (org_id, escalated_at)
  WHERE escalated_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_issues_escalated
  ON public.issues (org_id, escalated_at)
  WHERE escalated_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_actions_escalated
  ON public.actions (org_id, escalated_at)
  WHERE escalated_at IS NOT NULL;

COMMENT ON COLUMN public.risks.escalated_at IS
  'Set by auto-escalation when severity/due rules fire; cleared when Closed/Accepted.';
COMMENT ON COLUMN public.issues.escalated_at IS
  'Set by auto-escalation when high-priority items pass target_date; cleared when Resolved/Closed.';
COMMENT ON COLUMN public.actions.escalated_at IS
  'Set by auto-escalation when high-priority items pass due_date; cleared when Closed.';

-- ========== User email digest prefs ==========
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.notification_prefs IS
  'Outbound alert prefs. Keys: email_digest (bool, default true), approvals, overdue_raid, pulse (bools).';

-- Dedupe outbound digests (same cadence as timesheet reminders ~20h)
CREATE TABLE IF NOT EXISTS public.alert_digest_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  digest_kind text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_alert_digest_sends_user_kind_sent
  ON public.alert_digest_sends (user_id, digest_kind, sent_at DESC);

ALTER TABLE public.alert_digest_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alert_digest_own_read" ON public.alert_digest_sends;
CREATE POLICY "alert_digest_own_read" ON public.alert_digest_sends
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.alert_digest_sends TO authenticated;
GRANT ALL ON public.alert_digest_sends TO service_role;

-- ========== Helpers ==========
CREATE OR REPLACE FUNCTION public.raid_effective_severity(
  _severity int,
  _probability int,
  _impact int
) RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(_severity, 0),
    CASE
      WHEN _probability IS NOT NULL AND _impact IS NOT NULL
        THEN _probability * _impact
      ELSE NULL
    END,
    0
  );
$$;

CREATE OR REPLACE FUNCTION public.raid_notify_escalation(
  _org_id uuid,
  _project_id uuid,
  _entity text,
  _entity_id uuid,
  _title text,
  _reason text,
  _link text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pm uuid;
  recip uuid;
  body_txt text;
  title_txt text;
BEGIN
  title_txt := initcap(_entity) || ' escalated';
  body_txt := COALESCE(_title, 'Untitled')
    || CASE WHEN _reason IS NOT NULL AND length(trim(_reason)) > 0
         THEN ' — ' || _reason ELSE '' END;

  SELECT p.pm_user_id INTO pm FROM public.projects p WHERE p.id = _project_id;

  -- Project PM
  IF pm IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (pm, _org_id, 'raid_escalation', title_txt, body_txt, _link);
  END IF;

  -- Org admins (home org)
  FOR recip IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    JOIN public.profiles pr ON pr.id = ur.user_id
    WHERE ur.org_id = _org_id
      AND ur.role IN ('admin', 'org_admin')
      AND COALESCE(pr.is_active, true)
      AND (pm IS NULL OR ur.user_id IS DISTINCT FROM pm)
  LOOP
    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (recip, _org_id, 'raid_escalation', title_txt, body_txt, _link);
  END LOOP;
END;
$$;

-- Clear escalation when item is closed / resolved
CREATE OR REPLACE FUNCTION public.tg_raid_clear_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'risks' THEN
    IF NEW.status IN ('Closed', 'Accepted') AND OLD.status IS DISTINCT FROM NEW.status THEN
      NEW.escalated_at := NULL;
      NEW.escalation_level := 0;
      NEW.escalation_reason := NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'issues' THEN
    IF NEW.status IN ('Resolved', 'Closed') AND OLD.status IS DISTINCT FROM NEW.status THEN
      NEW.escalated_at := NULL;
      NEW.escalation_level := 0;
      NEW.escalation_reason := NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'actions' THEN
    IF NEW.status = 'Closed' AND OLD.status IS DISTINCT FROM NEW.status THEN
      NEW.escalated_at := NULL;
      NEW.escalation_level := 0;
      NEW.escalation_reason := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_risks_clear_escalation ON public.risks;
CREATE TRIGGER trg_risks_clear_escalation
  BEFORE UPDATE OF status ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.tg_raid_clear_escalation();

DROP TRIGGER IF EXISTS trg_issues_clear_escalation ON public.issues;
CREATE TRIGGER trg_issues_clear_escalation
  BEFORE UPDATE OF status ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.tg_raid_clear_escalation();

DROP TRIGGER IF EXISTS trg_actions_clear_escalation ON public.actions;
CREATE TRIGGER trg_actions_clear_escalation
  BEFORE UPDATE OF status ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_raid_clear_escalation();

-- Immediate escalate on risk save when severity threshold met (time-based overdue still via cron)
CREATE OR REPLACE FUNCTION public.tg_risks_auto_escalate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sev int;
  reason text;
  should boolean := false;
BEGIN
  IF COALESCE(NEW.status, 'Open') IN ('Closed', 'Accepted') THEN
    RETURN NEW;
  END IF;

  sev := public.raid_effective_severity(NEW.severity, NEW.probability, NEW.impact);

  IF sev >= 15 THEN
    should := true;
    reason := 'Critical severity ' || sev || ' (≥15)';
  ELSIF NEW.due_date IS NOT NULL AND NEW.due_date::date < CURRENT_DATE THEN
    should := true;
    reason := 'Overdue since ' || NEW.due_date::text;
  END IF;

  IF NOT should THEN
    RETURN NEW;
  END IF;

  -- Already escalated — keep reason if still qualifying; no re-notify
  IF NEW.escalated_at IS NOT NULL THEN
    NEW.escalation_reason := COALESCE(NEW.escalation_reason, reason);
    NEW.escalation_level := GREATEST(COALESCE(NEW.escalation_level, 0), 1);
    RETURN NEW;
  END IF;

  NEW.escalated_at := now();
  NEW.escalation_level := GREATEST(COALESCE(NEW.escalation_level, 0), 1);
  NEW.escalation_reason := reason;

  PERFORM public.raid_notify_escalation(
    NEW.org_id,
    NEW.project_id,
    'risk',
    NEW.id,
    NEW.title,
    reason,
    '/app/risks'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_risks_auto_escalate ON public.risks;
CREATE TRIGGER trg_risks_auto_escalate
  BEFORE INSERT OR UPDATE OF probability, impact, severity, due_date, status
  ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.tg_risks_auto_escalate();

-- Batch job: escalate overdue RAID + return counts (called from alerts-digest cron)
CREATE OR REPLACE FUNCTION public.run_raid_auto_escalation(_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  risks_n int := 0;
  issues_n int := 0;
  actions_n int := 0;
  reason text;
BEGIN
  -- Risks: critical or overdue, not closed, not yet escalated
  FOR r IN
    SELECT id, org_id, project_id, title, due_date, severity, probability, impact
    FROM public.risks
    WHERE (_org_id IS NULL OR org_id = _org_id)
      AND COALESCE(status, 'Open') NOT IN ('Closed', 'Accepted')
      AND escalated_at IS NULL
      AND (
        public.raid_effective_severity(severity, probability, impact) >= 15
        OR (due_date IS NOT NULL AND due_date::date < CURRENT_DATE)
      )
  LOOP
    reason := CASE
      WHEN public.raid_effective_severity(r.severity, r.probability, r.impact) >= 15
        THEN 'Critical severity '
          || public.raid_effective_severity(r.severity, r.probability, r.impact)::text
          || ' (≥15)'
      ELSE 'Overdue since ' || r.due_date::text
    END;
    UPDATE public.risks
    SET escalated_at = now(),
        escalation_level = GREATEST(COALESCE(escalation_level, 0), 1),
        escalation_reason = reason,
        updated_at = now()
    WHERE id = r.id;
    -- Trigger may also fire; guard double notify by only notifying here when we set via UPDATE
    -- Disable re-notify: the BEFORE trigger sees escalated_at already null then sets and notifies.
    -- Our UPDATE of escalated_at goes through BEFORE trigger which will notify. Avoid double:
    -- Actually BEFORE trigger runs on UPDATE OF due_date etc — updating escalated_at alone may NOT fire
    -- trg_risks_auto_escalate (column list). So notify here.
    PERFORM public.raid_notify_escalation(
      r.org_id, r.project_id, 'risk', r.id, r.title, reason, '/app/risks'
    );
    risks_n := risks_n + 1;
  END LOOP;

  FOR r IN
    SELECT id, org_id, project_id, title, target_date, priority
    FROM public.issues
    WHERE (_org_id IS NULL OR org_id = _org_id)
      AND COALESCE(status, 'Open') NOT IN ('Resolved', 'Closed')
      AND escalated_at IS NULL
      AND COALESCE(priority, '') IN ('Critical', 'High')
      AND target_date IS NOT NULL
      AND target_date::date < CURRENT_DATE
  LOOP
    reason := COALESCE(r.priority, 'High') || ' issue overdue since ' || r.target_date::text;
    UPDATE public.issues
    SET escalated_at = now(),
        escalation_level = GREATEST(COALESCE(escalation_level, 0), 1),
        escalation_reason = reason,
        updated_at = now()
    WHERE id = r.id;
    PERFORM public.raid_notify_escalation(
      r.org_id, r.project_id, 'issue', r.id, r.title, reason, '/app/issues'
    );
    issues_n := issues_n + 1;
  END LOOP;

  FOR r IN
    SELECT id, org_id, project_id, title, due_date, priority
    FROM public.actions
    WHERE (_org_id IS NULL OR org_id = _org_id)
      AND COALESCE(status, 'Open') <> 'Closed'
      AND escalated_at IS NULL
      AND COALESCE(priority, '') IN ('Critical', 'High')
      AND due_date IS NOT NULL
      AND due_date::date < CURRENT_DATE
  LOOP
    reason := COALESCE(r.priority, 'High') || ' action overdue since ' || r.due_date::text;
    UPDATE public.actions
    SET escalated_at = now(),
        escalation_level = GREATEST(COALESCE(escalation_level, 0), 1),
        escalation_reason = reason,
        updated_at = now()
    WHERE id = r.id;
    PERFORM public.raid_notify_escalation(
      r.org_id, r.project_id, 'action', r.id, r.title, reason, '/app/actions'
    );
    actions_n := actions_n + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'risks', risks_n,
    'issues', issues_n,
    'actions', actions_n
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_raid_auto_escalation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.raid_effective_severity(int, int, int) TO authenticated, service_role;

-- Avoid double-notify when batch UPDATE hits columns that fire BEFORE escalate trigger.
-- The batch updates escalated_at / escalation_* only — not in OF list — so OK.
-- But if someone updates severity later, trigger sees escalated_at already set → no re-notify. Good.
