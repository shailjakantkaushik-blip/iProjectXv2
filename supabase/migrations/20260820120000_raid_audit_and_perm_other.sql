-- 1) Role permission matrix: View / Edit / Other
-- 2) RAID register writes (risk, action, issue, decision) land in audit_events

ALTER TABLE public.role_table_permissions
  ADD COLUMN IF NOT EXISTS can_other boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.role_table_permissions.can_other IS
  'Extra actions beyond view/edit: add/delete rows, upload, approve-adjacent, project delete.';

-- Capabilities previously used can_edit as a single "allowed" bit (incl. add/delete, uploads).
UPDATE public.role_table_permissions
SET can_other = true
WHERE table_name LIKE 'capability::%'
  AND can_edit = true
  AND can_other = false;

-- Timesheet cost view is a view-style capability; keep can_view in step with can_edit.
UPDATE public.role_table_permissions
SET can_view = true
WHERE table_name = 'capability::timesheet_cost_view'
  AND can_edit = true
  AND can_view = false;

CREATE OR REPLACE FUNCTION public.user_has_capability(_user_id uuid, _cap text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_row boolean;
  allowed boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_any_admin(_user_id) THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_table_permissions p
      ON p.org_id = ur.org_id AND p.role = ur.role
    WHERE ur.user_id = _user_id
      AND p.table_name = _cap
  ) INTO has_row;

  IF has_row THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_table_permissions p
        ON p.org_id = ur.org_id AND p.role = ur.role
      WHERE ur.user_id = _user_id
        AND p.table_name = _cap
        AND (
          COALESCE(p.can_edit, false)
          OR COALESCE(p.can_other, false)
          OR (_cap = 'capability::timesheet_cost_view' AND COALESCE(p.can_view, false))
        )
    ) INTO allowed;
    RETURN allowed;
  END IF;

  IF _cap = 'capability::timesheet_cost_view' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role IN ('pm', 'admin', 'org_admin')
    );
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.user_has_capability(uuid, text) IS
  'True when user is admin or has view/edit/other on the capability row; timesheet_cost_view defaults to org admin + PM when unconfigured.';

-- ========== RAID register audit ==========
-- Logs insert / update / delete for Risks, Actions, Issues, Decisions.
-- Replaces the decisions outcome-only trigger so every RAID change is visible.

CREATE OR REPLACE FUNCTION public.tg_raid_register_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec jsonb;
  oldj jsonb;
  newj jsonb;
  etype text;
  act text;
  title_txt text;
  summ text;
  meta jsonb;
  changed text[] := ARRAY[]::text[];
  k text;
  rec_id uuid;
  rec_org uuid;
BEGIN
  etype := CASE TG_TABLE_NAME
    WHEN 'risks' THEN 'risk'
    WHEN 'issues' THEN 'issue'
    WHEN 'actions' THEN 'action'
    WHEN 'decisions' THEN 'decision'
    ELSE TG_TABLE_NAME
  END;

  IF TG_OP = 'DELETE' THEN
    rec := to_jsonb(OLD);
    act := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    rec := to_jsonb(NEW);
    act := 'created';
  ELSE
    rec := to_jsonb(NEW);
    act := 'updated';
    oldj := to_jsonb(OLD);
    newj := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(newj)
    LOOP
      IF k IN ('updated_at', 'created_at') THEN
        CONTINUE;
      END IF;
      IF oldj -> k IS DISTINCT FROM newj -> k THEN
        changed := array_append(changed, k);
      END IF;
    END LOOP;
    IF coalesce(array_length(changed, 1), 0) = 0 THEN
      RETURN NEW;
    END IF;
    IF etype = 'decision' AND changed = ARRAY['outcome']::text[] THEN
      act := 'outcome_changed';
    END IF;
  END IF;

  rec_id := (rec ->> 'id')::uuid;
  rec_org := (rec ->> 'org_id')::uuid;
  title_txt := coalesce(rec ->> 'title', 'Untitled');

  IF TG_OP = 'UPDATE' THEN
    summ := initcap(etype) || ' "' || title_txt || '" updated (' || array_to_string(changed, ', ') || ')';
    IF act = 'outcome_changed' THEN
      summ := 'Decision "' || title_txt || '" → ' || coalesce(NEW.outcome, '—');
    END IF;
    meta := jsonb_build_object(
      'project_id', rec -> 'project_id',
      'raid_code', rec -> 'raid_code',
      'changed', to_jsonb(changed)
    );
    IF act = 'outcome_changed' THEN
      meta := meta || jsonb_build_object('from', OLD.outcome, 'to', NEW.outcome);
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    summ := initcap(etype) || ' "' || title_txt || '" created';
    meta := jsonb_build_object(
      'project_id', rec -> 'project_id',
      'raid_code', rec -> 'raid_code'
    );
  ELSE
    summ := initcap(etype) || ' "' || title_txt || '" deleted';
    meta := jsonb_build_object(
      'project_id', rec -> 'project_id',
      'raid_code', rec -> 'raid_code'
    );
  END IF;

  INSERT INTO public.audit_events (org_id, actor_user_id, entity_type, entity_id, action, summary, meta)
  VALUES (rec_org, auth.uid(), etype, rec_id, act, summ, meta);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decision_audit ON public.decisions;
DROP TRIGGER IF EXISTS trg_raid_audit_risks ON public.risks;
DROP TRIGGER IF EXISTS trg_raid_audit_issues ON public.issues;
DROP TRIGGER IF EXISTS trg_raid_audit_actions ON public.actions;
DROP TRIGGER IF EXISTS trg_raid_audit_decisions ON public.decisions;

CREATE TRIGGER trg_raid_audit_risks
  AFTER INSERT OR UPDATE OR DELETE ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.tg_raid_register_audit();

CREATE TRIGGER trg_raid_audit_issues
  AFTER INSERT OR UPDATE OR DELETE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.tg_raid_register_audit();

CREATE TRIGGER trg_raid_audit_actions
  AFTER INSERT OR UPDATE OR DELETE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_raid_register_audit();

CREATE TRIGGER trg_raid_audit_decisions
  AFTER INSERT OR UPDATE OR DELETE ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_raid_register_audit();
