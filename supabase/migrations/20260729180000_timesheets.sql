-- Timesheets: resource→manager link, work-item team assignees, weekly sheets,
-- entries against project/work items, sequential approval PM → Resource Manager.

-- ========== RESOURCES: link to login user + nominated manager ==========
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_org_user
  ON public.resources(org_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_resources_manager
  ON public.resources(manager_user_id)
  WHERE manager_user_id IS NOT NULL;

COMMENT ON COLUMN public.resources.user_id IS
  'Auth user linked to this resource record (fills timesheets).';
COMMENT ON COLUMN public.resources.manager_user_id IS
  'Nominated Resource Manager — second sequential timesheet approver.';

-- ========== WORK ITEM TEAM ASSIGNEES ==========
CREATE TABLE IF NOT EXISTS public.work_item_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  work_item_id uuid NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_item_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_item_assignees TO authenticated;
GRANT ALL ON public.work_item_assignees TO service_role;
ALTER TABLE public.work_item_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org read work_item_assignees" ON public.work_item_assignees
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "editors modify work_item_assignees" ON public.work_item_assignees
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_items wi
      WHERE wi.id = work_item_id AND public.can_edit_project(auth.uid(), wi.project_id)
    )
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.work_items wi
      WHERE wi.id = work_item_id AND public.can_edit_project(auth.uid(), wi.project_id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_work_item_assignees_user
  ON public.work_item_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_work_item_assignees_wi
  ON public.work_item_assignees(work_item_id);

-- Backfill owners as assignees
INSERT INTO public.work_item_assignees (org_id, work_item_id, user_id)
SELECT wi.org_id, wi.id, wi.owner_user_id
FROM public.work_items wi
WHERE wi.owner_user_id IS NOT NULL
ON CONFLICT (work_item_id, user_id) DO NOTHING;

-- Keep assignee row in sync when owner_user_id is set
CREATE OR REPLACE FUNCTION public.tg_work_item_owner_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN
    INSERT INTO public.work_item_assignees (org_id, work_item_id, user_id)
    VALUES (NEW.org_id, NEW.id, NEW.owner_user_id)
    ON CONFLICT (work_item_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_item_owner_assignee ON public.work_items;
CREATE TRIGGER trg_work_item_owner_assignee
  AFTER INSERT OR UPDATE OF owner_user_id
  ON public.work_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_item_owner_assignee();

-- ========== TIMESHEETS ==========
CREATE TABLE IF NOT EXISTS public.timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL,
  week_start date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_pm', 'pending_rm', 'approved', 'rejected')),
  manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  submitted_at timestamptz,
  rejected_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, week_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timesheets TO authenticated;
GRANT ALL ON public.timesheets TO service_role;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_timesheets_org_week ON public.timesheets(org_id, week_start);
CREATE INDEX IF NOT EXISTS idx_timesheets_user ON public.timesheets(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON public.timesheets(org_id, status);

DROP TRIGGER IF EXISTS trg_timesheets_updated ON public.timesheets;
CREATE TRIGGER trg_timesheets_updated
  BEFORE UPDATE ON public.timesheets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ========== TIMESHEET ENTRIES (daily hours per work item) ==========
CREATE TABLE IF NOT EXISTS public.timesheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  timesheet_id uuid NOT NULL REFERENCES public.timesheets(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  work_item_id uuid NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  hours_mon numeric(5,2) NOT NULL DEFAULT 0 CHECK (hours_mon >= 0 AND hours_mon <= 24),
  hours_tue numeric(5,2) NOT NULL DEFAULT 0 CHECK (hours_tue >= 0 AND hours_tue <= 24),
  hours_wed numeric(5,2) NOT NULL DEFAULT 0 CHECK (hours_wed >= 0 AND hours_wed <= 24),
  hours_thu numeric(5,2) NOT NULL DEFAULT 0 CHECK (hours_thu >= 0 AND hours_thu <= 24),
  hours_fri numeric(5,2) NOT NULL DEFAULT 0 CHECK (hours_fri >= 0 AND hours_fri <= 24),
  hours_sat numeric(5,2) NOT NULL DEFAULT 0 CHECK (hours_sat >= 0 AND hours_sat <= 24),
  hours_sun numeric(5,2) NOT NULL DEFAULT 0 CHECK (hours_sun >= 0 AND hours_sun <= 24),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (timesheet_id, work_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timesheet_entries TO authenticated;
GRANT ALL ON public.timesheet_entries TO service_role;
ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_timesheet_entries_updated ON public.timesheet_entries;
CREATE TRIGGER trg_timesheet_entries_updated
  BEFORE UPDATE ON public.timesheet_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_sheet ON public.timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_project ON public.timesheet_entries(project_id);

-- ========== APPROVAL STEPS (PM per project, then RM) ==========
CREATE TABLE IF NOT EXISTS public.timesheet_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  timesheet_id uuid NOT NULL REFERENCES public.timesheets(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('pm', 'rm')),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  approver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  comment text,
  acted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (timesheet_id, step, project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timesheet_approvals TO authenticated;
GRANT ALL ON public.timesheet_approvals TO service_role;
ALTER TABLE public.timesheet_approvals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_approver
  ON public.timesheet_approvals(approver_user_id, status);
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_sheet
  ON public.timesheet_approvals(timesheet_id);

-- ========== RLS HELPERS ==========
CREATE OR REPLACE FUNCTION public.is_timesheet_approver(_user_id uuid, _timesheet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.timesheet_approvals a
    WHERE a.timesheet_id = _timesheet_id
      AND a.approver_user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.timesheets t
    WHERE t.id = _timesheet_id
      AND t.manager_user_id = _user_id
  );
$$;

-- Timesheets policies
CREATE POLICY "org read own or approve timesheets" ON public.timesheets
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      user_id = auth.uid()
      OR public.has_any_admin(auth.uid())
      OR public.is_timesheet_approver(auth.uid(), id)
      OR manager_user_id = auth.uid()
    )
  );

CREATE POLICY "owner insert timesheets" ON public.timesheets
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "owner update draft timesheets" ON public.timesheets
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      (user_id = auth.uid() AND status IN ('draft', 'rejected'))
      OR public.has_any_admin(auth.uid())
      OR public.is_timesheet_approver(auth.uid(), id)
    )
  )
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "owner delete draft timesheets" ON public.timesheets
  FOR DELETE TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND user_id = auth.uid()
    AND status IN ('draft', 'rejected')
  );

-- Entries policies (via parent timesheet ownership / approval)
CREATE POLICY "read timesheet_entries" ON public.timesheet_entries
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.timesheets t
      WHERE t.id = timesheet_id
        AND (
          t.user_id = auth.uid()
          OR public.has_any_admin(auth.uid())
          OR public.is_timesheet_approver(auth.uid(), t.id)
          OR t.manager_user_id = auth.uid()
        )
    )
  );

CREATE POLICY "owner modify timesheet_entries" ON public.timesheet_entries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.timesheets t
      WHERE t.id = timesheet_id
        AND t.org_id = public.get_user_org(auth.uid())
        AND t.user_id = auth.uid()
        AND t.status IN ('draft', 'rejected')
    )
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.timesheets t
      WHERE t.id = timesheet_id
        AND t.user_id = auth.uid()
        AND t.status IN ('draft', 'rejected')
    )
  );

-- Approvals policies
CREATE POLICY "read timesheet_approvals" ON public.timesheet_approvals
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      approver_user_id = auth.uid()
      OR public.has_any_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.timesheets t
        WHERE t.id = timesheet_id AND t.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "approver update timesheet_approvals" ON public.timesheet_approvals
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (approver_user_id = auth.uid() OR public.has_any_admin(auth.uid()))
  )
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

-- Inserts for approvals are done via SECURITY DEFINER submit function
CREATE POLICY "system insert timesheet_approvals" ON public.timesheet_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.timesheets t
        WHERE t.id = timesheet_id AND t.user_id = auth.uid()
      )
    )
  );

-- ========== SUBMIT: create PM approvals, notify ==========
CREATE OR REPLACE FUNCTION public.submit_timesheet(_timesheet_id uuid)
RETURNS public.timesheets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.timesheets;
  mgr uuid;
  rid uuid;
  proj record;
  pm uuid;
  missing_pm text;
BEGIN
  SELECT * INTO t FROM public.timesheets WHERE id = _timesheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timesheet not found';
  END IF;
  IF t.user_id <> auth.uid() AND NOT public.has_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the timesheet owner can submit';
  END IF;
  IF t.status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Timesheet is not editable (status %)', t.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.timesheet_entries e WHERE e.timesheet_id = t.id) THEN
    RAISE EXCEPTION 'Add at least one work-item row before submitting';
  END IF;

  SELECT r.id, r.manager_user_id INTO rid, mgr
  FROM public.resources r
  WHERE r.org_id = t.org_id AND r.user_id = t.user_id
  LIMIT 1;

  IF mgr IS NULL THEN
    RAISE EXCEPTION 'Resource Manager is not configured for your resource profile. Ask an admin to set your manager.';
  END IF;

  -- Clear prior approval rows (resubmit after reject)
  DELETE FROM public.timesheet_approvals WHERE timesheet_id = t.id;

  missing_pm := NULL;
  FOR proj IN
    SELECT DISTINCT e.project_id, p.name AS project_name, p.pm_user_id
    FROM public.timesheet_entries e
    JOIN public.projects p ON p.id = e.project_id
    WHERE e.timesheet_id = t.id
  LOOP
    pm := proj.pm_user_id;
    IF pm IS NULL THEN
      missing_pm := COALESCE(missing_pm || ', ', '') || COALESCE(proj.project_name, proj.project_id::text);
      CONTINUE;
    END IF;
    INSERT INTO public.timesheet_approvals (org_id, timesheet_id, step, project_id, approver_user_id, status)
    VALUES (t.org_id, t.id, 'pm', proj.project_id, pm, 'pending');

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      pm,
      t.org_id,
      'timesheet_approval',
      'Timesheet awaiting PM approval',
      'A timesheet for week starting ' || t.week_start::text || ' needs your approval as Project Manager.',
      '/app/timesheets?tab=approvals'
    );
  END LOOP;

  IF missing_pm IS NOT NULL THEN
    RAISE EXCEPTION 'Project Manager is not set on: %', missing_pm;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.timesheet_approvals WHERE timesheet_id = t.id AND step = 'pm') THEN
    RAISE EXCEPTION 'No project PM approvals could be created';
  END IF;

  UPDATE public.timesheets
  SET status = 'pending_pm',
      manager_user_id = mgr,
      resource_id = rid,
      submitted_at = now(),
      rejected_at = NULL,
      rejected_by = NULL,
      rejection_reason = NULL
  WHERE id = t.id
  RETURNING * INTO t;

  RETURN t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_timesheet(uuid) TO authenticated;

-- ========== ACT ON APPROVAL (PM then RM in sequence) ==========
CREATE OR REPLACE FUNCTION public.act_on_timesheet_approval(
  _approval_id uuid,
  _decision text,
  _comment text DEFAULT NULL
)
RETURNS public.timesheets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.timesheet_approvals;
  t public.timesheets;
  pending_pm int;
BEGIN
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;

  SELECT * INTO a FROM public.timesheet_approvals WHERE id = _approval_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;
  IF a.approver_user_id <> auth.uid() AND NOT public.has_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'You are not the nominated approver';
  END IF;
  IF a.status <> 'pending' THEN
    RAISE EXCEPTION 'This approval step is already %', a.status;
  END IF;

  SELECT * INTO t FROM public.timesheets WHERE id = a.timesheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timesheet not found';
  END IF;

  -- Enforce sequence: PM only while pending_pm; RM only while pending_rm
  IF a.step = 'pm' AND t.status <> 'pending_pm' THEN
    RAISE EXCEPTION 'PM approval is not active (status %)', t.status;
  END IF;
  IF a.step = 'rm' AND t.status <> 'pending_rm' THEN
    RAISE EXCEPTION 'Resource Manager approval is not active (status %)', t.status;
  END IF;

  UPDATE public.timesheet_approvals
  SET status = _decision,
      comment = _comment,
      acted_at = now()
  WHERE id = a.id;

  IF _decision = 'rejected' THEN
    UPDATE public.timesheets
    SET status = 'rejected',
        rejected_at = now(),
        rejected_by = auth.uid(),
        rejection_reason = COALESCE(_comment, 'Rejected')
    WHERE id = t.id
    RETURNING * INTO t;

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      t.user_id,
      t.org_id,
      'timesheet_rejected',
      'Timesheet rejected',
      'Your timesheet for week starting ' || t.week_start::text || ' was rejected.',
      '/app/timesheets'
    );
    RETURN t;
  END IF;

  -- Approved path
  IF a.step = 'pm' THEN
    SELECT COUNT(*) INTO pending_pm
    FROM public.timesheet_approvals
    WHERE timesheet_id = t.id AND step = 'pm' AND status = 'pending';

    IF pending_pm = 0 THEN
      -- All PMs done → open Resource Manager step
      INSERT INTO public.timesheet_approvals (org_id, timesheet_id, step, project_id, approver_user_id, status)
      VALUES (t.org_id, t.id, 'rm', NULL, t.manager_user_id, 'pending')
      ON CONFLICT (timesheet_id, step, project_id) DO UPDATE
        SET status = 'pending', acted_at = NULL, comment = NULL, approver_user_id = EXCLUDED.approver_user_id;

      UPDATE public.timesheets SET status = 'pending_rm' WHERE id = t.id RETURNING * INTO t;

      INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
      VALUES (
        t.manager_user_id,
        t.org_id,
        'timesheet_approval',
        'Timesheet awaiting Resource Manager approval',
        'A timesheet for week starting ' || t.week_start::text || ' needs your approval as Resource Manager.',
        '/app/timesheets?tab=approvals'
      );
    END IF;
  ELSIF a.step = 'rm' THEN
    UPDATE public.timesheets SET status = 'approved' WHERE id = t.id RETURNING * INTO t;

    -- Roll hours into work_items.actual_hours (additive for this week’s entry totals)
    UPDATE public.work_items wi
    SET actual_hours = COALESCE(wi.actual_hours, 0) + sub.total
    FROM (
      SELECT e.work_item_id,
             (e.hours_mon + e.hours_tue + e.hours_wed + e.hours_thu + e.hours_fri + e.hours_sat + e.hours_sun) AS total
      FROM public.timesheet_entries e
      WHERE e.timesheet_id = t.id
    ) sub
    WHERE wi.id = sub.work_item_id;

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      t.user_id,
      t.org_id,
      'timesheet_approved',
      'Timesheet approved',
      'Your timesheet for week starting ' || t.week_start::text || ' was fully approved.',
      '/app/timesheets'
    );
  END IF;

  SELECT * INTO t FROM public.timesheets WHERE id = t.id;
  RETURN t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.act_on_timesheet_approval(uuid, text, text) TO authenticated;

-- UNIQUE (timesheet_id, step, project_id) treats NULLs as distinct in Postgres —
-- for RM step use a partial unique index instead.
ALTER TABLE public.timesheet_approvals
  DROP CONSTRAINT IF EXISTS timesheet_approvals_timesheet_id_step_project_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_timesheet_approvals_pm
  ON public.timesheet_approvals (timesheet_id, project_id)
  WHERE step = 'pm';

CREATE UNIQUE INDEX IF NOT EXISTS uq_timesheet_approvals_rm
  ON public.timesheet_approvals (timesheet_id)
  WHERE step = 'rm';

-- Fix ON CONFLICT in act_on_timesheet_approval for RM upsert
CREATE OR REPLACE FUNCTION public.act_on_timesheet_approval(
  _approval_id uuid,
  _decision text,
  _comment text DEFAULT NULL
)
RETURNS public.timesheets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.timesheet_approvals;
  t public.timesheets;
  pending_pm int;
BEGIN
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;

  SELECT * INTO a FROM public.timesheet_approvals WHERE id = _approval_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;
  IF a.approver_user_id <> auth.uid() AND NOT public.has_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'You are not the nominated approver';
  END IF;
  IF a.status <> 'pending' THEN
    RAISE EXCEPTION 'This approval step is already %', a.status;
  END IF;

  SELECT * INTO t FROM public.timesheets WHERE id = a.timesheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timesheet not found';
  END IF;

  IF a.step = 'pm' AND t.status <> 'pending_pm' THEN
    RAISE EXCEPTION 'PM approval is not active (status %)', t.status;
  END IF;
  IF a.step = 'rm' AND t.status <> 'pending_rm' THEN
    RAISE EXCEPTION 'Resource Manager approval is not active (status %)', t.status;
  END IF;

  UPDATE public.timesheet_approvals
  SET status = _decision,
      comment = _comment,
      acted_at = now()
  WHERE id = a.id;

  IF _decision = 'rejected' THEN
    UPDATE public.timesheets
    SET status = 'rejected',
        rejected_at = now(),
        rejected_by = auth.uid(),
        rejection_reason = COALESCE(_comment, 'Rejected')
    WHERE id = t.id
    RETURNING * INTO t;

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      t.user_id,
      t.org_id,
      'timesheet_rejected',
      'Timesheet rejected',
      'Your timesheet for week starting ' || t.week_start::text || ' was rejected.',
      '/app/timesheets'
    );
    RETURN t;
  END IF;

  IF a.step = 'pm' THEN
    SELECT COUNT(*) INTO pending_pm
    FROM public.timesheet_approvals
    WHERE timesheet_id = t.id AND step = 'pm' AND status = 'pending';

    IF pending_pm = 0 THEN
      INSERT INTO public.timesheet_approvals (org_id, timesheet_id, step, project_id, approver_user_id, status)
      VALUES (t.org_id, t.id, 'rm', NULL, t.manager_user_id, 'pending')
      ON CONFLICT (timesheet_id) WHERE step = 'rm'
      DO UPDATE SET
        status = 'pending',
        acted_at = NULL,
        comment = NULL,
        approver_user_id = EXCLUDED.approver_user_id;

      UPDATE public.timesheets SET status = 'pending_rm' WHERE id = t.id RETURNING * INTO t;

      INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
      VALUES (
        t.manager_user_id,
        t.org_id,
        'timesheet_approval',
        'Timesheet awaiting Resource Manager approval',
        'A timesheet for week starting ' || t.week_start::text || ' needs your approval as Resource Manager.',
        '/app/timesheets?tab=approvals'
      );
    END IF;
  ELSIF a.step = 'rm' THEN
    UPDATE public.timesheets SET status = 'approved' WHERE id = t.id RETURNING * INTO t;

    -- Recompute actual hours from all approved timesheet entries (safe on resubmit).
    UPDATE public.work_items wi
    SET actual_hours = COALESCE(agg.total, 0)
    FROM (
      SELECT e.work_item_id,
             SUM(
               e.hours_mon + e.hours_tue + e.hours_wed + e.hours_thu
               + e.hours_fri + e.hours_sat + e.hours_sun
             ) AS total
      FROM public.timesheet_entries e
      JOIN public.timesheets ts ON ts.id = e.timesheet_id
      WHERE ts.status = 'approved'
        AND e.work_item_id IN (
          SELECT e2.work_item_id FROM public.timesheet_entries e2 WHERE e2.timesheet_id = t.id
        )
      GROUP BY e.work_item_id
    ) agg
    WHERE wi.id = agg.work_item_id;

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      t.user_id,
      t.org_id,
      'timesheet_approved',
      'Timesheet approved',
      'Your timesheet for week starting ' || t.week_start::text || ' was fully approved.',
      '/app/timesheets'
    );
  END IF;

  SELECT * INTO t FROM public.timesheets WHERE id = COALESCE(t.id, a.timesheet_id);
  RETURN t;
END;
$$;
