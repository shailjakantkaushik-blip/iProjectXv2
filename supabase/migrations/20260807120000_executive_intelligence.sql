-- Executive intelligence: richer decisions + cause-effect governance links.
-- Additive / safe to re-run.

-- ---------------------------------------------------------------------------
-- 1) Decision management fields (options, recommendation, required date)
-- ---------------------------------------------------------------------------
ALTER TABLE public.decisions
  ADD COLUMN IF NOT EXISTS options text NULL,
  ADD COLUMN IF NOT EXISTS recommendation text NULL,
  ADD COLUMN IF NOT EXISTS required_date date NULL,
  ADD COLUMN IF NOT EXISTS schedule_impact_days integer NULL,
  ADD COLUMN IF NOT EXISTS cost_impact numeric NULL;

COMMENT ON COLUMN public.decisions.options IS
  'Decision options (free text / bullet list) for executive choice.';
COMMENT ON COLUMN public.decisions.recommendation IS
  'Recommended option from PM / analyst.';
COMMENT ON COLUMN public.decisions.required_date IS
  'Date by which a decision is required to avoid impact.';

-- ---------------------------------------------------------------------------
-- 2) Cause-effect links: Risk → Issue → Decision → Action → Outcome
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.governance_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  from_entity_type text NOT NULL
    CHECK (from_entity_type IN ('risk','issue','decision','action','change_request','dependency','outcome')),
  from_entity_id uuid NOT NULL,
  to_entity_type text NOT NULL
    CHECK (to_entity_type IN ('risk','issue','decision','action','change_request','dependency','outcome')),
  to_entity_id uuid NOT NULL,
  link_role text NULL DEFAULT 'leads_to',
  notes text NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id)
);

CREATE INDEX IF NOT EXISTS governance_links_org_idx ON public.governance_links (org_id);
CREATE INDEX IF NOT EXISTS governance_links_project_idx ON public.governance_links (org_id, project_id);
CREATE INDEX IF NOT EXISTS governance_links_from_idx
  ON public.governance_links (org_id, from_entity_type, from_entity_id);
CREATE INDEX IF NOT EXISTS governance_links_to_idx
  ON public.governance_links (org_id, to_entity_type, to_entity_id);

ALTER TABLE public.governance_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS governance_links_read_org ON public.governance_links;
CREATE POLICY governance_links_read_org
  ON public.governance_links FOR SELECT TO authenticated
  USING (org_id = (SELECT public.get_user_org(auth.uid())));

DROP POLICY IF EXISTS governance_links_write_org ON public.governance_links;
CREATE POLICY governance_links_write_org
  ON public.governance_links FOR ALL TO authenticated
  USING (org_id = (SELECT public.get_user_org(auth.uid())))
  WITH CHECK (org_id = (SELECT public.get_user_org(auth.uid())));

COMMENT ON TABLE public.governance_links IS
  'Cause-and-effect chain across risks, issues, decisions, actions, changes.';

-- ---------------------------------------------------------------------------
-- 3) Governance automation task queue (generated / tracked)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.governance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cadence text NOT NULL
    CHECK (cadence IN ('weekly','monthly','quarterly','stage_gate','ad_hoc')),
  task_type text NOT NULL,
  title text NOT NULL,
  due_date date NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','done','skipped','overdue')),
  source text NOT NULL DEFAULT 'automation',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS governance_tasks_org_due_idx
  ON public.governance_tasks (org_id, due_date, status);
CREATE INDEX IF NOT EXISTS governance_tasks_project_idx
  ON public.governance_tasks (org_id, project_id);

ALTER TABLE public.governance_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS governance_tasks_read_org ON public.governance_tasks;
CREATE POLICY governance_tasks_read_org
  ON public.governance_tasks FOR SELECT TO authenticated
  USING (org_id = (SELECT public.get_user_org(auth.uid())));

DROP POLICY IF EXISTS governance_tasks_write_org ON public.governance_tasks;
CREATE POLICY governance_tasks_write_org
  ON public.governance_tasks FOR ALL TO authenticated
  USING (org_id = (SELECT public.get_user_org(auth.uid())))
  WITH CHECK (org_id = (SELECT public.get_user_org(auth.uid())));

COMMENT ON TABLE public.governance_tasks IS
  'Automated / tracked governance cadence tasks (weekly update, monthly health, etc.).';
