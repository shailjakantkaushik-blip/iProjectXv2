
-- ============ BATCH 1: DATA FOUNDATION - 21 additional PMO tables ============

-- Reusable trigger already exists: public.tg_set_updated_at()

-- Helper: standard org-scoped read policy uses get_user_org(); edit uses can_edit_project() where a project_id column exists.

-- ============ STAGE GATES ============
CREATE TABLE public.stage_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  gate_name TEXT NOT NULL,
  planned_date DATE,
  actual_date DATE,
  status TEXT DEFAULT 'Pending',
  approver TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_gates TO authenticated;
GRANT ALL ON public.stage_gates TO service_role;
ALTER TABLE public.stage_gates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read stage_gates" ON public.stage_gates FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify stage_gates" ON public.stage_gates FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_stage_gates_updated BEFORE UPDATE ON public.stage_gates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ MILESTONES ============
CREATE TABLE public.milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  planned_date DATE,
  actual_date DATE,
  status TEXT DEFAULT 'Planned',
  owner TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milestones TO authenticated;
GRANT ALL ON public.milestones TO service_role;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read milestones" ON public.milestones FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify milestones" ON public.milestones FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_milestones_updated BEFORE UPDATE ON public.milestones FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ RISKS ============
CREATE TABLE public.risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  probability INT CHECK (probability BETWEEN 1 AND 5),
  impact INT CHECK (impact BETWEEN 1 AND 5),
  severity INT,
  status TEXT DEFAULT 'Open',
  owner TEXT,
  mitigation TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risks TO authenticated;
GRANT ALL ON public.risks TO service_role;
ALTER TABLE public.risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read risks" ON public.risks FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify risks" ON public.risks FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_risks_updated BEFORE UPDATE ON public.risks FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ ISSUES ============
CREATE TABLE public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'Open',
  owner TEXT,
  raised_date DATE DEFAULT CURRENT_DATE,
  target_date DATE,
  resolved_date DATE,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issues TO authenticated;
GRANT ALL ON public.issues TO service_role;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read issues" ON public.issues FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify issues" ON public.issues FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_issues_updated BEFORE UPDATE ON public.issues FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ ACTIONS ============
CREATE TABLE public.actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  owner TEXT,
  priority TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'Open',
  due_date DATE,
  completed_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.actions TO authenticated;
GRANT ALL ON public.actions TO service_role;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read actions" ON public.actions FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify actions" ON public.actions FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_actions_updated BEFORE UPDATE ON public.actions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ DECISIONS ============
CREATE TABLE public.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  decision_date DATE DEFAULT CURRENT_DATE,
  decided_by TEXT,
  rationale TEXT,
  impact TEXT,
  status TEXT DEFAULT 'Approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decisions TO authenticated;
GRANT ALL ON public.decisions TO service_role;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read decisions" ON public.decisions FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify decisions" ON public.decisions FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_decisions_updated BEFORE UPDATE ON public.decisions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ DEPENDENCIES ============
CREATE TABLE public.dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  depends_on_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  dep_type TEXT DEFAULT 'Internal',
  status TEXT DEFAULT 'Open',
  owner TEXT,
  needed_by DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dependencies TO authenticated;
GRANT ALL ON public.dependencies TO service_role;
ALTER TABLE public.dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read dependencies" ON public.dependencies FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify dependencies" ON public.dependencies FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_dependencies_updated BEFORE UPDATE ON public.dependencies FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ CHANGE REQUESTS ============
CREATE TABLE public.change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cr_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  change_type TEXT,
  impact_scope TEXT,
  impact_schedule_days INT DEFAULT 0,
  impact_cost NUMERIC(14,2) DEFAULT 0,
  status TEXT DEFAULT 'Submitted',
  raised_by TEXT,
  raised_date DATE DEFAULT CURRENT_DATE,
  decision_date DATE,
  approver TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_requests TO authenticated;
GRANT ALL ON public.change_requests TO service_role;
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read change_requests" ON public.change_requests FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify change_requests" ON public.change_requests FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_change_requests_updated BEFORE UPDATE ON public.change_requests FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ FY ALLOCATIONS (multi-FY budget split) ============
CREATE TABLE public.fy_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  fy TEXT NOT NULL,
  capex NUMERIC(14,2) DEFAULT 0,
  opex NUMERIC(14,2) DEFAULT 0,
  benefits NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, fy)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fy_allocations TO authenticated;
GRANT ALL ON public.fy_allocations TO service_role;
ALTER TABLE public.fy_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read fy_allocations" ON public.fy_allocations FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify fy_allocations" ON public.fy_allocations FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_fy_allocations_updated BEFORE UPDATE ON public.fy_allocations FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ FINANCIALS MONTHLY (actuals/forecast time series) ============
CREATE TABLE public.financials_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  capex_planned NUMERIC(14,2) DEFAULT 0,
  capex_actual NUMERIC(14,2) DEFAULT 0,
  capex_forecast NUMERIC(14,2) DEFAULT 0,
  opex_planned NUMERIC(14,2) DEFAULT 0,
  opex_actual NUMERIC(14,2) DEFAULT 0,
  opex_forecast NUMERIC(14,2) DEFAULT 0,
  benefits_planned NUMERIC(14,2) DEFAULT 0,
  benefits_actual NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financials_monthly TO authenticated;
GRANT ALL ON public.financials_monthly TO service_role;
ALTER TABLE public.financials_monthly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read financials_monthly" ON public.financials_monthly FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify financials_monthly" ON public.financials_monthly FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_financials_monthly_updated BEFORE UPDATE ON public.financials_monthly FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ BENEFITS ============
CREATE TABLE public.benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  benefit_type TEXT,
  target_value NUMERIC(14,2) DEFAULT 0,
  realised_value NUMERIC(14,2) DEFAULT 0,
  realisation_date DATE,
  owner TEXT,
  status TEXT DEFAULT 'Planned',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benefits TO authenticated;
GRANT ALL ON public.benefits TO service_role;
ALTER TABLE public.benefits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read benefits" ON public.benefits FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify benefits" ON public.benefits FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_benefits_updated BEFORE UPDATE ON public.benefits FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ SPRINTS ============
CREATE TABLE public.sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sprint_number INT,
  name TEXT,
  start_date DATE,
  end_date DATE,
  planned_points INT DEFAULT 0,
  completed_points INT DEFAULT 0,
  committed_stories INT DEFAULT 0,
  completed_stories INT DEFAULT 0,
  status TEXT DEFAULT 'Planned',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sprints TO authenticated;
GRANT ALL ON public.sprints TO service_role;
ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read sprints" ON public.sprints FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify sprints" ON public.sprints FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_sprints_updated BEFORE UPDATE ON public.sprints FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ RESOURCES ============
CREATE TABLE public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bu_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT,
  skills TEXT,
  capacity_hours_week NUMERIC(6,2) DEFAULT 40,
  cost_rate NUMERIC(10,2) DEFAULT 0,
  location TEXT,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT ALL ON public.resources TO service_role;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read resources" ON public.resources FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "admins modify resources" ON public.resources FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));
CREATE TRIGGER trg_resources_updated BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ RESOURCE ALLOCATIONS ============
CREATE TABLE public.resource_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  allocation_percent NUMERIC(5,2) DEFAULT 0,
  allocated_hours NUMERIC(8,2) DEFAULT 0,
  role_on_project TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, resource_id, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_allocations TO authenticated;
GRANT ALL ON public.resource_allocations TO service_role;
ALTER TABLE public.resource_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read resource_allocations" ON public.resource_allocations FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify resource_allocations" ON public.resource_allocations FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_resource_allocations_updated BEFORE UPDATE ON public.resource_allocations FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ STAKEHOLDERS ============
CREATE TABLE public.stakeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  influence TEXT,
  interest TEXT,
  engagement_strategy TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stakeholders TO authenticated;
GRANT ALL ON public.stakeholders TO service_role;
ALTER TABLE public.stakeholders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read stakeholders" ON public.stakeholders FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify stakeholders" ON public.stakeholders FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_stakeholders_updated BEFORE UPDATE ON public.stakeholders FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ STATUS UPDATES ============
CREATE TABLE public.status_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  update_date DATE DEFAULT CURRENT_DATE,
  reporter TEXT,
  overall_rag public.project_rag DEFAULT 'Green',
  schedule_rag public.project_rag DEFAULT 'Green',
  cost_rag public.project_rag DEFAULT 'Green',
  scope_rag public.project_rag DEFAULT 'Green',
  progress_summary TEXT,
  achievements TEXT,
  next_steps TEXT,
  blockers TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.status_updates TO authenticated;
GRANT ALL ON public.status_updates TO service_role;
ALTER TABLE public.status_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read status_updates" ON public.status_updates FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "editors modify status_updates" ON public.status_updates FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id)) WITH CHECK (public.can_edit_project(auth.uid(), project_id));
CREATE TRIGGER trg_status_updates_updated BEFORE UPDATE ON public.status_updates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ LESSONS LEARNED ============
CREATE TABLE public.lessons_learned (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  category TEXT,
  what_happened TEXT,
  root_cause TEXT,
  recommendation TEXT,
  captured_by TEXT,
  captured_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons_learned TO authenticated;
GRANT ALL ON public.lessons_learned TO service_role;
ALTER TABLE public.lessons_learned ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read lessons_learned" ON public.lessons_learned FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "org write lessons_learned" ON public.lessons_learned FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid())) WITH CHECK (org_id = public.get_user_org(auth.uid()));
CREATE TRIGGER trg_lessons_learned_updated BEFORE UPDATE ON public.lessons_learned FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ DOCUMENTS (metadata) ============
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  doc_type TEXT,
  url TEXT,
  version TEXT,
  owner TEXT,
  uploaded_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read documents" ON public.documents FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "org write documents" ON public.documents FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid())) WITH CHECK (org_id = public.get_user_org(auth.uid()));
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ DEMAND PIPELINE (proposed / pre-project ideas) ============
CREATE TABLE public.demand_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bu_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  idea_name TEXT NOT NULL,
  sponsor TEXT,
  description TEXT,
  estimated_cost NUMERIC(14,2) DEFAULT 0,
  estimated_benefit NUMERIC(14,2) DEFAULT 0,
  estimated_roi NUMERIC(8,2) DEFAULT 0,
  strategic_alignment INT CHECK (strategic_alignment BETWEEN 1 AND 5),
  complexity INT CHECK (complexity BETWEEN 1 AND 5),
  status TEXT DEFAULT 'Idea',
  submitted_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_pipeline TO authenticated;
GRANT ALL ON public.demand_pipeline TO service_role;
ALTER TABLE public.demand_pipeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read demand_pipeline" ON public.demand_pipeline FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "org write demand_pipeline" ON public.demand_pipeline FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid())) WITH CHECK (org_id = public.get_user_org(auth.uid()));
CREATE TRIGGER trg_demand_pipeline_updated BEFORE UPDATE ON public.demand_pipeline FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ PORTFOLIO SCENARIOS (what-if) ============
CREATE TABLE public.portfolio_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  budget_cap NUMERIC(14,2),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_scenarios TO authenticated;
GRANT ALL ON public.portfolio_scenarios TO service_role;
ALTER TABLE public.portfolio_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read portfolio_scenarios" ON public.portfolio_scenarios FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "admins write portfolio_scenarios" ON public.portfolio_scenarios FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));
CREATE TRIGGER trg_portfolio_scenarios_updated BEFORE UPDATE ON public.portfolio_scenarios FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ SCENARIO PROJECTS (link table) ============
CREATE TABLE public.scenario_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES public.portfolio_scenarios(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  included BOOLEAN DEFAULT TRUE,
  adjusted_budget NUMERIC(14,2),
  adjusted_start DATE,
  adjusted_end DATE,
  priority_score NUMERIC(6,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, project_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenario_projects TO authenticated;
GRANT ALL ON public.scenario_projects TO service_role;
ALTER TABLE public.scenario_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read scenario_projects" ON public.scenario_projects FOR SELECT TO authenticated USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "admins write scenario_projects" ON public.scenario_projects FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));
CREATE TRIGGER trg_scenario_projects_updated BEFORE UPDATE ON public.scenario_projects FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ AUDIT LOG ============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit_log" ON public.audit_log FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));
CREATE POLICY "authenticated insert audit_log" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org(auth.uid()));
