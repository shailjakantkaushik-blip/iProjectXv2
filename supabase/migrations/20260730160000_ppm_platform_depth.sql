-- PPM platform depth: EVM support fields, demand→project, WI schedule links,
-- gate checklists/evidence, entity comments, report definitions.

-- 1) Demand → project
ALTER TABLE public.demand_pipeline
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.demand_pipeline
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;
ALTER TABLE public.demand_pipeline
  ADD COLUMN IF NOT EXISTS converted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_demand_pipeline_project
  ON public.demand_pipeline (project_id)
  WHERE project_id IS NOT NULL;

COMMENT ON COLUMN public.demand_pipeline.project_id IS
  'Project created from this demand idea (promote workflow).';

-- 2) Work-item schedule links for CPM (FS/SS/FF/SF)
CREATE TABLE IF NOT EXISTS public.work_item_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  predecessor_id uuid NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  successor_id uuid NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  link_type text NOT NULL DEFAULT 'FS'
    CHECK (link_type IN ('FS', 'SS', 'FF', 'SF')),
  lag_days int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (predecessor_id, successor_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_work_item_links_org ON public.work_item_links (org_id);
CREATE INDEX IF NOT EXISTS idx_work_item_links_pred ON public.work_item_links (predecessor_id);
CREATE INDEX IF NOT EXISTS idx_work_item_links_succ ON public.work_item_links (successor_id);

ALTER TABLE public.work_item_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read work_item_links" ON public.work_item_links;
CREATE POLICY "org read work_item_links" ON public.work_item_links
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "editors write work_item_links" ON public.work_item_links;
CREATE POLICY "editors write work_item_links" ON public.work_item_links
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_item_links TO authenticated;
GRANT ALL ON public.work_item_links TO service_role;

-- 3) Stage gate checklist templates + per-gate responses / evidence
CREATE TABLE IF NOT EXISTS public.stage_gate_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  gate_name text NOT NULL,
  title text NOT NULL,
  description text,
  required boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sg_checklist_items_org_gate
  ON public.stage_gate_checklist_items (org_id, gate_name);

ALTER TABLE public.stage_gate_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read sg_checklist_items" ON public.stage_gate_checklist_items;
CREATE POLICY "org read sg_checklist_items" ON public.stage_gate_checklist_items
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "admins write sg_checklist_items" ON public.stage_gate_checklist_items;
CREATE POLICY "admins write sg_checklist_items" ON public.stage_gate_checklist_items
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.has_any_admin(auth.uid())
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND public.has_any_admin(auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_gate_checklist_items TO authenticated;
GRANT ALL ON public.stage_gate_checklist_items TO service_role;

CREATE TABLE IF NOT EXISTS public.stage_gate_checklist_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stage_gate_id uuid NOT NULL REFERENCES public.stage_gates(id) ON DELETE CASCADE,
  checklist_item_id uuid NOT NULL REFERENCES public.stage_gate_checklist_items(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  evidence_url text,
  evidence_notes text,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_gate_id, checklist_item_id)
);

CREATE INDEX IF NOT EXISTS idx_sg_checklist_resp_gate
  ON public.stage_gate_checklist_responses (stage_gate_id);

ALTER TABLE public.stage_gate_checklist_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read sg_checklist_responses" ON public.stage_gate_checklist_responses;
CREATE POLICY "org read sg_checklist_responses" ON public.stage_gate_checklist_responses
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "editors write sg_checklist_responses" ON public.stage_gate_checklist_responses;
CREATE POLICY "editors write sg_checklist_responses" ON public.stage_gate_checklist_responses
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_gate_checklist_responses TO authenticated;
GRANT ALL ON public.stage_gate_checklist_responses TO service_role;

-- 4) Collaboration threads (polymorphic comments)
CREATE TABLE IF NOT EXISTS public.entity_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  parent_id uuid REFERENCES public.entity_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_comments_entity
  ON public.entity_comments (org_id, entity_type, entity_id, created_at);

ALTER TABLE public.entity_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read entity_comments" ON public.entity_comments;
CREATE POLICY "org read entity_comments" ON public.entity_comments
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "org write entity_comments" ON public.entity_comments;
CREATE POLICY "org write entity_comments" ON public.entity_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND author_id = auth.uid()
  );

DROP POLICY IF EXISTS "authors update entity_comments" ON public.entity_comments;
CREATE POLICY "authors update entity_comments" ON public.entity_comments
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "authors delete entity_comments" ON public.entity_comments;
CREATE POLICY "authors delete entity_comments" ON public.entity_comments
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.has_any_admin(auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_comments TO authenticated;
GRANT ALL ON public.entity_comments TO service_role;

-- 5) Saved custom report definitions
CREATE TABLE IF NOT EXISTS public.custom_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_reports_org ON public.custom_reports (org_id);

ALTER TABLE public.custom_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read custom_reports" ON public.custom_reports;
CREATE POLICY "org read custom_reports" ON public.custom_reports
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "org write custom_reports" ON public.custom_reports;
CREATE POLICY "org write custom_reports" ON public.custom_reports
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_reports TO authenticated;
GRANT ALL ON public.custom_reports TO service_role;

-- Seed default checklist items per common gate name (idempotent per org via NOT EXISTS)
INSERT INTO public.stage_gate_checklist_items (org_id, gate_name, title, required, sort_order)
SELECT o.id, g.gate_name, i.title, i.required, i.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  ('Initiate', 'Business case approved', true, 10),
  ('Initiate', 'Sponsor appointed', true, 20),
  ('Initiate', 'Charter signed', true, 30),
  ('Plan', 'Scope baseline agreed', true, 10),
  ('Plan', 'Schedule baseline set', true, 20),
  ('Plan', 'Budget baseline approved', true, 30),
  ('Plan', 'RAID log opened', false, 40),
  ('Execute', 'Delivery plan current', true, 10),
  ('Execute', 'Benefits tracker live', false, 20),
  ('Execute', 'Quality checks passed', true, 30),
  ('Control', 'Stage review pack attached', true, 10),
  ('Control', 'Cost & schedule variance reviewed', true, 20),
  ('Close', 'Lessons learned captured', true, 10),
  ('Close', 'Benefits handoff complete', true, 20),
  ('Close', 'Final finance reconciliation', true, 30)
) AS i(gate_name, title, required, sort_order)
CROSS JOIN (VALUES
  ('Initiate'), ('Plan'), ('Execute'), ('Control'), ('Close')
) AS g(gate_name)
WHERE g.gate_name = i.gate_name
  AND NOT EXISTS (
    SELECT 1 FROM public.stage_gate_checklist_items x
    WHERE x.org_id = o.id AND x.gate_name = i.gate_name AND x.title = i.title
  );
