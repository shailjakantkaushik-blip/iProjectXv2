-- Timesheet governance: audit trail, missing/approval reminders
-- Org reporting + exports are client-side (admins already SELECT all timesheets via RLS).

-- ========== AUDIT: timesheets status / create ==========
CREATE OR REPLACE FUNCTION public.tg_timesheet_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act text;
  summ text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_events (org_id, actor_user_id, entity_type, entity_id, action, summary, meta)
    VALUES (
      NEW.org_id,
      COALESCE(auth.uid(), NEW.user_id),
      'timesheet',
      NEW.id,
      'created',
      'Timesheet created for week ' || NEW.week_start::text,
      jsonb_build_object(
        'week_start', NEW.week_start,
        'user_id', NEW.user_id,
        'status', NEW.status
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    act := CASE NEW.status
      WHEN 'pending_pm' THEN 'submitted'
      WHEN 'pending_rm' THEN
        CASE WHEN OLD.status IN ('draft', 'rejected') THEN 'submitted' ELSE 'pm_complete' END
      WHEN 'approved' THEN 'approved'
      WHEN 'rejected' THEN 'rejected'
      WHEN 'draft' THEN 'reopened'
      ELSE 'status_changed'
    END;
    summ := CASE act
      WHEN 'submitted' THEN 'Timesheet submitted for week ' || NEW.week_start::text
      WHEN 'pm_complete' THEN 'All PM approvals complete — awaiting Resource Manager for week ' || NEW.week_start::text
      WHEN 'approved' THEN 'Timesheet approved for week ' || NEW.week_start::text
      WHEN 'rejected' THEN 'Timesheet rejected for week ' || NEW.week_start::text
      WHEN 'reopened' THEN 'Timesheet returned to draft for week ' || NEW.week_start::text
      ELSE 'Timesheet status ' || OLD.status || ' → ' || NEW.status || ' (week ' || NEW.week_start::text || ')'
    END;
    INSERT INTO public.audit_events (org_id, actor_user_id, entity_type, entity_id, action, summary, meta)
    VALUES (
      NEW.org_id,
      auth.uid(),
      'timesheet',
      NEW.id,
      act,
      summ,
      jsonb_build_object(
        'from', OLD.status,
        'to', NEW.status,
        'week_start', NEW.week_start,
        'user_id', NEW.user_id,
        'rejection_reason', NEW.rejection_reason
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_timesheet_audit ON public.timesheets;
CREATE TRIGGER trg_timesheet_audit
  AFTER INSERT OR UPDATE OF status ON public.timesheets
  FOR EACH ROW EXECUTE FUNCTION public.tg_timesheet_audit();

-- ========== AUDIT: entry create / edit / delete ==========
CREATE OR REPLACE FUNCTION public.tg_timesheet_entry_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org uuid;
  tid uuid;
  week_start date;
  owner uuid;
  hours_old numeric;
  hours_new numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    org := OLD.org_id;
    tid := OLD.timesheet_id;
    hours_old := OLD.hours_mon + OLD.hours_tue + OLD.hours_wed + OLD.hours_thu
               + OLD.hours_fri + OLD.hours_sat + OLD.hours_sun;
    SELECT t.week_start, t.user_id INTO week_start, owner FROM public.timesheets t WHERE t.id = tid;
    INSERT INTO public.audit_events (org_id, actor_user_id, entity_type, entity_id, action, summary, meta)
    VALUES (
      org,
      auth.uid(),
      'timesheet_entry',
      OLD.id,
      'deleted',
      'Timesheet entry deleted (' || round(hours_old, 2)::text || 'h) for week ' || COALESCE(week_start::text, '?'),
      jsonb_build_object(
        'timesheet_id', tid,
        'week_start', week_start,
        'owner_user_id', owner,
        'project_id', OLD.project_id,
        'work_item_id', OLD.work_item_id,
        'billable', OLD.billable,
        'custom_task', OLD.custom_task,
        'hours', hours_old
      )
    );
    RETURN OLD;
  END IF;

  hours_new := NEW.hours_mon + NEW.hours_tue + NEW.hours_wed + NEW.hours_thu
             + NEW.hours_fri + NEW.hours_sat + NEW.hours_sun;
  SELECT t.week_start, t.user_id INTO week_start, owner FROM public.timesheets t WHERE t.id = NEW.timesheet_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_events (org_id, actor_user_id, entity_type, entity_id, action, summary, meta)
    VALUES (
      NEW.org_id,
      auth.uid(),
      'timesheet_entry',
      NEW.id,
      'created',
      'Timesheet entry created (' || round(hours_new, 2)::text || 'h) for week ' || COALESCE(week_start::text, '?'),
      jsonb_build_object(
        'timesheet_id', NEW.timesheet_id,
        'week_start', week_start,
        'owner_user_id', owner,
        'project_id', NEW.project_id,
        'work_item_id', NEW.work_item_id,
        'billable', NEW.billable,
        'custom_task', NEW.custom_task,
        'hours', hours_new
      )
    );
    RETURN NEW;
  END IF;

  -- UPDATE: only log meaningful field changes
  IF OLD.hours_mon IS DISTINCT FROM NEW.hours_mon
     OR OLD.hours_tue IS DISTINCT FROM NEW.hours_tue
     OR OLD.hours_wed IS DISTINCT FROM NEW.hours_wed
     OR OLD.hours_thu IS DISTINCT FROM NEW.hours_thu
     OR OLD.hours_fri IS DISTINCT FROM NEW.hours_fri
     OR OLD.hours_sat IS DISTINCT FROM NEW.hours_sat
     OR OLD.hours_sun IS DISTINCT FROM NEW.hours_sun
     OR OLD.notes IS DISTINCT FROM NEW.notes
     OR OLD.billable IS DISTINCT FROM NEW.billable
     OR OLD.custom_task IS DISTINCT FROM NEW.custom_task
     OR OLD.project_id IS DISTINCT FROM NEW.project_id
     OR OLD.work_item_id IS DISTINCT FROM NEW.work_item_id
  THEN
    hours_old := OLD.hours_mon + OLD.hours_tue + OLD.hours_wed + OLD.hours_thu
               + OLD.hours_fri + OLD.hours_sat + OLD.hours_sun;
    INSERT INTO public.audit_events (org_id, actor_user_id, entity_type, entity_id, action, summary, meta)
    VALUES (
      NEW.org_id,
      auth.uid(),
      'timesheet_entry',
      NEW.id,
      'edited',
      'Timesheet entry edited (' || round(hours_old, 2)::text || 'h → ' || round(hours_new, 2)::text
        || 'h) for week ' || COALESCE(week_start::text, '?'),
      jsonb_build_object(
        'timesheet_id', NEW.timesheet_id,
        'week_start', week_start,
        'owner_user_id', owner,
        'project_id', NEW.project_id,
        'work_item_id', NEW.work_item_id,
        'billable', NEW.billable,
        'custom_task', NEW.custom_task,
        'hours_from', hours_old,
        'hours_to', hours_new
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_timesheet_entry_audit ON public.timesheet_entries;
CREATE TRIGGER trg_timesheet_entry_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.timesheet_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_timesheet_entry_audit();

-- ========== AUDIT: approval step acted ==========
CREATE OR REPLACE FUNCTION public.tg_timesheet_approval_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  week_start date;
  owner uuid;
  act text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('approved', 'rejected') THEN
    SELECT t.week_start, t.user_id INTO week_start, owner
    FROM public.timesheets t WHERE t.id = NEW.timesheet_id;

    act := CASE
      WHEN NEW.status = 'rejected' THEN 'rejected'
      WHEN NEW.step = 'pm' THEN 'pm_approved'
      WHEN NEW.step = 'rm' THEN 'rm_approved'
      ELSE 'approved'
    END;

    INSERT INTO public.audit_events (org_id, actor_user_id, entity_type, entity_id, action, summary, meta)
    VALUES (
      NEW.org_id,
      COALESCE(auth.uid(), NEW.approver_user_id),
      'timesheet_approval',
      NEW.id,
      act,
      CASE
        WHEN NEW.status = 'rejected' THEN
          upper(NEW.step) || ' rejected timesheet for week ' || COALESCE(week_start::text, '?')
        ELSE
          upper(NEW.step) || ' approved timesheet for week ' || COALESCE(week_start::text, '?')
      END,
      jsonb_build_object(
        'timesheet_id', NEW.timesheet_id,
        'week_start', week_start,
        'owner_user_id', owner,
        'step', NEW.step,
        'project_id', NEW.project_id,
        'approver_user_id', NEW.approver_user_id,
        'comment', NEW.comment,
        'decision', NEW.status
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_timesheet_approval_audit ON public.timesheet_approvals;
CREATE TRIGGER trg_timesheet_approval_audit
  AFTER UPDATE OF status ON public.timesheet_approvals
  FOR EACH ROW EXECUTE FUNCTION public.tg_timesheet_approval_audit();

-- ========== REMINDERS: missing timesheets ==========
-- Notifies linked resources who have no submitted/approved sheet for the week.
CREATE OR REPLACE FUNCTION public.remind_missing_timesheets(_week_start date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oid uuid;
  ws date;
  r record;
  notified int := 0;
  skipped int := 0;
  has_ok boolean;
BEGIN
  IF NOT public.has_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only organisation admins can send missing timesheet reminders';
  END IF;

  oid := public.get_user_org(auth.uid());
  IF oid IS NULL THEN
    RAISE EXCEPTION 'No organisation';
  END IF;

  -- Normalize to Monday (ISO)
  ws := COALESCE(_week_start, CURRENT_DATE);
  ws := ws - ((EXTRACT(ISODOW FROM ws)::int - 1));

  FOR r IN
    SELECT res.id AS resource_id, res.user_id, res.name
    FROM public.resources res
    WHERE res.org_id = oid
      AND res.user_id IS NOT NULL
      AND COALESCE(res.status, 'Active') ILIKE 'active'
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.timesheets t
      WHERE t.org_id = oid
        AND t.user_id = r.user_id
        AND t.week_start = ws
        AND t.status IN ('pending_pm', 'pending_rm', 'approved')
    ) INTO has_ok;

    IF has_ok THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    -- Avoid spamming: skip if same reminder sent in last 20 hours for this week
    IF EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = r.user_id
        AND n.org_id = oid
        AND n.kind = 'timesheet_missing'
        AND n.created_at > now() - interval '20 hours'
        AND COALESCE(n.body, '') LIKE '%' || ws::text || '%'
    ) THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      r.user_id,
      oid,
      'timesheet_missing',
      'Timesheet reminder',
      'Please submit your timesheet for week starting ' || ws::text || '.',
      '/app/timesheets'
    );
    notified := notified + 1;
  END LOOP;

  INSERT INTO public.audit_events (org_id, actor_user_id, entity_type, entity_id, action, summary, meta)
  VALUES (
    oid,
    auth.uid(),
    'timesheet',
    NULL,
    'remind_missing',
    'Sent missing timesheet reminders for week ' || ws::text,
    jsonb_build_object('week_start', ws, 'notified', notified, 'skipped', skipped)
  );

  RETURN jsonb_build_object('week_start', ws, 'notified', notified, 'skipped', skipped);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remind_missing_timesheets(date) TO authenticated;

-- ========== REMINDERS: pending approval requests ==========
CREATE OR REPLACE FUNCTION public.remind_pending_timesheet_approvals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oid uuid;
  a record;
  week_start date;
  notified int := 0;
  skipped int := 0;
BEGIN
  IF NOT public.has_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only organisation admins can send approval reminders';
  END IF;

  oid := public.get_user_org(auth.uid());
  IF oid IS NULL THEN
    RAISE EXCEPTION 'No organisation';
  END IF;

  FOR a IN
    SELECT ap.id, ap.approver_user_id, ap.timesheet_id, ap.step, t.week_start
    FROM public.timesheet_approvals ap
    JOIN public.timesheets t ON t.id = ap.timesheet_id
    WHERE ap.org_id = oid
      AND ap.status = 'pending'
      AND (
        (ap.step = 'pm' AND t.status = 'pending_pm')
        OR (ap.step = 'rm' AND t.status = 'pending_rm')
      )
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = a.approver_user_id
        AND n.org_id = oid
        AND n.kind = 'timesheet_approval_reminder'
        AND n.created_at > now() - interval '20 hours'
        AND COALESCE(n.body, '') LIKE '%' || a.week_start::text || '%'
    ) THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      a.approver_user_id,
      oid,
      'timesheet_approval_reminder',
      'Timesheet approval reminder',
      'A timesheet for week starting ' || a.week_start::text
        || ' is still awaiting your ' || upper(a.step) || ' approval.',
      '/app/timesheets?tab=approvals'
    );
    notified := notified + 1;
  END LOOP;

  INSERT INTO public.audit_events (org_id, actor_user_id, entity_type, entity_id, action, summary, meta)
  VALUES (
    oid,
    auth.uid(),
    'timesheet',
    NULL,
    'remind_approvals',
    'Sent pending timesheet approval reminders',
    jsonb_build_object('notified', notified, 'skipped', skipped)
  );

  RETURN jsonb_build_object('notified', notified, 'skipped', skipped);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remind_pending_timesheet_approvals() TO authenticated;

COMMENT ON FUNCTION public.remind_missing_timesheets(date) IS
  'Org admin: notify linked resources missing a submitted timesheet for the week.';
COMMENT ON FUNCTION public.remind_pending_timesheet_approvals() IS
  'Org admin: re-notify approvers with pending PM/RM timesheet approvals.';
