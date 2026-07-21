-- Advanced PMO: work items (tasks/WBS), financial baselines, light audit log.

-- ========== WORK ITEMS ==========
CREATE TABLE IF NOT EXISTS public.work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.work_items(id) ON DELETE SET NULL,
  wbs_code text,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'To Do',
  priority text DEFAULT 'Medium',
  owner text,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  percent_complete numeric DEFAULT 0,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  estimate_hours numeric,
  actual_hours numeric,
  milestone_id uuid REFERENCES public.milestones(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_items TO authenticated;
GRANT ALL ON public.work_items TO service_role;
ALTER TABLE public.work_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org read work_items" ON public.work_items
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "editors modify work_items" ON public.work_items
  FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id))
  WITH CHECK (public.can_edit_project(auth.uid(), project_id));

DROP TRIGGER IF EXISTS trg_work_items_updated ON public.work_items;
CREATE TRIGGER trg_work_items_updated
  BEFORE UPDATE ON public.work_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_work_items_org_project ON public.work_items(org_id, project_id);
CREATE INDEX IF NOT EXISTS idx_work_items_owner ON public.work_items(owner_user_id);

-- ========== PROJECT FINANCIAL BASELINES ==========
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS baseline_budget numeric,
  ADD COLUMN IF NOT EXISTS baseline_capex numeric,
  ADD COLUMN IF NOT EXISTS baseline_opex numeric,
  ADD COLUMN IF NOT EXISTS baseline_benefits numeric,
  ADD COLUMN IF NOT EXISTS baseline_date date,
  ADD COLUMN IF NOT EXISTS baseline_label text;

-- ========== LIGHT AUDIT LOG ==========
CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  summary text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org read audit_events" ON public.audit_events
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "org insert audit_events" ON public.audit_events
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_audit_events_org_created
  ON public.audit_events(org_id, created_at DESC);

-- Log decision outcome changes into audit_events
CREATE OR REPLACE FUNCTION public.tg_decision_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.outcome IS DISTINCT FROM NEW.outcome THEN
    INSERT INTO public.audit_events (org_id, actor_user_id, entity_type, entity_id, action, summary, meta)
    VALUES (
      NEW.org_id,
      auth.uid(),
      'decision',
      NEW.id,
      'outcome_changed',
      'Decision "' || COALESCE(NEW.title, 'Untitled') || '" → ' || COALESCE(NEW.outcome, '—'),
      jsonb_build_object('from', OLD.outcome, 'to', NEW.outcome, 'approver_user_id', NEW.approver_user_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decision_audit ON public.decisions;
CREATE TRIGGER trg_decision_audit
  AFTER UPDATE OF outcome ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_decision_audit();
