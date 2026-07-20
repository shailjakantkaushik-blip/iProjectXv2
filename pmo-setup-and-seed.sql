-- =========================================================================
-- iProjectX — ALL-IN-ONE database setup
-- Paste this entire file into the Supabase SQL editor and run once.
-- Includes: full schema (enums, tables, RLS, functions, triggers) + seed
-- data (platform admin, iProjectX org, 4 BUs, 17 projects, and rich sample
-- rows for every operational table).
-- Idempotent — safe to re-run.
-- =========================================================================


-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'org_admin', 'bu_lead', 'pm', 'executive');
CREATE TYPE public.project_status AS ENUM ('Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled');
CREATE TYPE public.project_rag AS ENUM ('Green', 'Amber', 'Red');
CREATE TYPE public.delivery_method AS ENUM ('Waterfall', 'Agile', 'Hybrid');

-- ============ ORGANIZATIONS ============
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  full_name TEXT,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ BUSINESS UNITS ============
CREATE TABLE public.business_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_units TO authenticated;
GRANT ALL ON public.business_units TO service_role;
ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  bu_id UUID REFERENCES public.business_units(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id, role, bu_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ PROJECTS ============
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bu_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  project_code TEXT,
  name TEXT NOT NULL,
  program TEXT,
  sponsor TEXT,
  pm_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  priority TEXT DEFAULT 'Medium',
  status public.project_status DEFAULT 'Not Started',
  rag public.project_rag DEFAULT 'Green',
  current_phase TEXT,
  delivery_method public.delivery_method DEFAULT 'Waterfall',
  start_date DATE,
  end_date DATE,
  target_go_live DATE,
  budget NUMERIC(14,2) DEFAULT 0,
  capex_approved NUMERIC(14,2) DEFAULT 0,
  capex_incurred NUMERIC(14,2) DEFAULT 0,
  opex_approved NUMERIC(14,2) DEFAULT 0,
  opex_incurred NUMERIC(14,2) DEFAULT 0,
  benefits_target NUMERIC(14,2) DEFAULT 0,
  benefits_realised NUMERIC(14,2) DEFAULT 0,
  roi_percent NUMERIC(8,2) DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER FUNCTIONS (avoid RLS recursion) ============
CREATE OR REPLACE FUNCTION public.get_user_org(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','org_admin'))
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id
      AND p.org_id = public.get_user_org(_user_id)
      AND (
        public.has_any_admin(_user_id)
        OR p.pm_user_id = _user_id
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = _user_id
            AND ur.role = 'bu_lead'
            AND (ur.bu_id IS NULL OR ur.bu_id = p.bu_id)
        )
      )
  )
$$;

-- ============ RLS POLICIES ============

-- organizations: user sees their own org
CREATE POLICY "org_read_own" ON public.organizations FOR SELECT TO authenticated
  USING (id = public.get_user_org(auth.uid()));
CREATE POLICY "org_admin_update" ON public.organizations FOR UPDATE TO authenticated
  USING (id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));
CREATE POLICY "org_insert_any_auth" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (true);

-- profiles: user reads own + others in same org; user updates own; admin updates any in org
CREATE POLICY "profile_read_org" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR org_id = public.get_user_org(auth.uid()));
CREATE POLICY "profile_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());
CREATE POLICY "profile_admin_update" ON public.profiles FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));
CREATE POLICY "profile_insert_self" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- business_units: read in same org; admins can write
CREATE POLICY "bu_read_org" ON public.business_units FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "bu_admin_write" ON public.business_units FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

-- user_roles: user reads their own; admin reads/writes any in org
CREATE POLICY "roles_read_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid())));
CREATE POLICY "roles_admin_write" ON public.user_roles FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

-- projects: read same org; edit if admin / PM owner / BU lead
CREATE POLICY "projects_read_org" ON public.projects FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));
CREATE POLICY "projects_insert_admin" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));
CREATE POLICY "projects_update_authorized" ON public.projects FOR UPDATE TO authenticated
  USING (public.can_edit_project(auth.uid(), id));
CREATE POLICY "projects_delete_admin" ON public.projects FOR DELETE TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_orgs_updated BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_bu_updated BEFORE UPDATE ON public.business_units
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper RPC: create org + assign current user as admin (used on onboarding)
CREATE OR REPLACE FUNCTION public.create_org_and_join(_name TEXT, _slug TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_org UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.organizations (name, slug) VALUES (_name, _slug) RETURNING id INTO new_org;
  UPDATE public.profiles SET org_id = new_org WHERE id = auth.uid();
  INSERT INTO public.user_roles (user_id, org_id, role) VALUES (auth.uid(), new_org, 'org_admin');
  RETURN new_org;
END $$;

GRANT EXECUTE ON FUNCTION public.create_org_and_join(TEXT, TEXT) TO authenticated;

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
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS brief JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS planned_start_date date,
  ADD COLUMN IF NOT EXISTS planned_end_date date,
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS actual_end_date date;

-- Backfill planned dates from existing start/end where empty
UPDATE public.projects
   SET planned_start_date = COALESCE(planned_start_date, start_date),
       planned_end_date   = COALESCE(planned_end_date, end_date),
       actual_start_date  = COALESCE(actual_start_date, start_date),
       actual_end_date    = COALESCE(actual_end_date, end_date);

-- Stage gate definitions per organisation (configurable)
CREATE TABLE public.stage_gate_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  gate_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, gate_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_gate_definitions TO authenticated;
GRANT ALL ON public.stage_gate_definitions TO service_role;

ALTER TABLE public.stage_gate_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view org stage gate defs"
  ON public.stage_gate_definitions FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "Admins manage org stage gate defs"
  ON public.stage_gate_definitions FOR ALL
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

CREATE TRIGGER trg_stage_gate_definitions_updated_at
  BEFORE UPDATE ON public.stage_gate_definitions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed default gates for every existing organisation
INSERT INTO public.stage_gate_definitions (org_id, gate_name, sort_order)
SELECT o.id, g.name, g.ord
FROM public.organizations o
CROSS JOIN (VALUES
  ('Discovery', 1),
  ('Business Case / Seed Funding', 2),
  ('Design', 3),
  ('Business Case / Full Funding', 4),
  ('Build', 5),
  ('Testing', 6),
  ('Deployment', 7),
  ('Handover', 8),
  ('Benefit Realisation', 9)
) AS g(name, ord)
ON CONFLICT (org_id, gate_name) DO NOTHING;

-- Backfill stage_gates rows for projects that have none yet, spread evenly across project window
INSERT INTO public.stage_gates (org_id, project_id, gate_name, planned_date, status)
SELECT
  p.org_id,
  p.id,
  d.gate_name,
  (COALESCE(p.start_date, CURRENT_DATE)
    + ((COALESCE(p.end_date, p.start_date + INTERVAL '180 days')::date
        - COALESCE(p.start_date, CURRENT_DATE)::date)
       * (d.sort_order - 1) / 8))::date AS planned_date,
  'Pending'
FROM public.projects p
JOIN public.stage_gate_definitions d ON d.org_id = p.org_id AND d.is_active = true
WHERE NOT EXISTS (
  SELECT 1 FROM public.stage_gates sg
  WHERE sg.project_id = p.id AND sg.gate_name = d.gate_name
);

-- Seed sample risks (roadmap needs data) and FY allocations for financial views.
DO $$
DECLARE
  v_org uuid;
  r RECORD;
  i int;
  cats text[] := ARRAY['Schedule','Cost','Scope','Resource','Technical','Compliance','Vendor','Security'];
  owners text[] := ARRAY['J. Kim','A. Patel','C. Ng','R. Diaz','L. Chen','M. Novak','S. Ahmed','P. O''Brien'];
  statuses text[] := ARRAY['Open','Open','Open','Mitigating','Mitigating','Closed'];
  n_risks int;
BEGIN
  FOR r IN SELECT id, org_id, start_date, end_date FROM public.projects LOOP
    v_org := r.org_id;
    n_risks := 3 + (abs(hashtext(r.id::text)) % 3);  -- 3..5 per project
    FOR i IN 1..n_risks LOOP
      INSERT INTO public.risks (org_id, project_id, title, category, owner, status, probability, impact, severity, due_date, description, mitigation)
      VALUES (
        v_org, r.id,
        (cats[1 + (abs(hashtext(r.id::text || i::text)) % array_length(cats,1))]) || ' risk #' || i,
        cats[1 + (abs(hashtext(r.id::text || i::text || 'c')) % array_length(cats,1))],
        owners[1 + (abs(hashtext(r.id::text || i::text || 'o')) % array_length(owners,1))],
        statuses[1 + (abs(hashtext(r.id::text || i::text || 's')) % array_length(statuses,1))],
        1 + (abs(hashtext(r.id::text || i::text || 'p')) % 5),
        1 + (abs(hashtext(r.id::text || i::text || 'i')) % 5),
        1 + (abs(hashtext(r.id::text || i::text || 'v')) % 25),
        COALESCE(r.start_date, CURRENT_DATE) + ((abs(hashtext(r.id::text || i::text || 'd')) % 400))::int,
        'Auto-seeded risk for pilot data set',
        'Weekly review with sponsor & mitigation tracker'
      );
    END LOOP;

    -- FY Allocations: split budget across each FY the project spans (Apr–Mar UK/AU basis)
    IF r.start_date IS NOT NULL AND r.end_date IS NOT NULL THEN
      DECLARE
        fy_start int := CASE WHEN EXTRACT(MONTH FROM r.start_date) >= 4 THEN EXTRACT(YEAR FROM r.start_date)::int ELSE EXTRACT(YEAR FROM r.start_date)::int - 1 END;
        fy_end   int := CASE WHEN EXTRACT(MONTH FROM r.end_date)   >= 4 THEN EXTRACT(YEAR FROM r.end_date)::int   ELSE EXTRACT(YEAR FROM r.end_date)::int - 1 END;
        n int := (fy_end - fy_start + 1);
        b numeric;
        c numeric; o numeric; bn numeric;
        y int;
      BEGIN
        SELECT budget, COALESCE(capex_approved,0), COALESCE(opex_approved,0), COALESCE(benefits_target,0)
          INTO b, c, o, bn FROM public.projects WHERE id = r.id;
        IF n < 1 THEN n := 1; END IF;
        FOR y IN fy_start..fy_end LOOP
          INSERT INTO public.fy_allocations (org_id, project_id, fy, capex, opex, benefits)
          VALUES (v_org, r.id, 'FY' || RIGHT((y+1)::text, 2), c/n, o/n, bn/n);
        END LOOP;
      END;
    END IF;
  END LOOP;
END $$;

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

-- 1. Add owner + notes columns where missing
ALTER TABLE public.risks ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.decisions ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE public.decisions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.change_requests ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE public.change_requests ADD COLUMN IF NOT EXISTS notes text;

-- 2. Sample data (idempotent - skip if any rows already present per table)
DO $$
DECLARE
  v_org uuid;
  proj RECORD;
  i int;
BEGIN
  SELECT id INTO v_org FROM public.organizations LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;

  -- RISKS
  IF NOT EXISTS (SELECT 1 FROM public.risks) THEN
    i := 0;
    FOR proj IN SELECT id, name FROM public.projects WHERE org_id = v_org LIMIT 12 LOOP
      i := i + 1;
      INSERT INTO public.risks (org_id, project_id, title, description, category, probability, impact, severity, status, owner, mitigation, notes, due_date) VALUES
        (v_org, proj.id, 'Vendor delivery slippage on ' || proj.name, 'Third-party vendor showing signs of missing agreed dates.', 'Supplier', 4, 4, 16, 'Open', 'Priya Nair', 'Escalate to vendor governance; secondary supplier on standby.', 'Weekly steering check-in scheduled.', CURRENT_DATE + 21),
        (v_org, proj.id, 'Data quality gap in source system', 'Migration source records missing mandatory fields.', 'Data', 3, 4, 12, 'Mitigating', 'Alex Chen', 'Data cleansing sprint added to plan.', 'Owner sending daily quality report.', CURRENT_DATE + 14),
        (v_org, proj.id, 'Key SME unavailable during UAT window', 'Only one subject matter expert available for UAT.', 'Resource', 3, 3, 9, 'Open', 'Marta Silva', 'Cross-train backup SME; book calendar early.', CASE WHEN i % 2 = 0 THEN 'Backup identified.' ELSE 'Awaiting sponsor confirmation.' END, CURRENT_DATE + 30);
    END LOOP;
  END IF;

  -- ACTIONS
  IF NOT EXISTS (SELECT 1 FROM public.actions) THEN
    i := 0;
    FOR proj IN SELECT id, name FROM public.projects WHERE org_id = v_org LIMIT 12 LOOP
      i := i + 1;
      INSERT INTO public.actions (org_id, project_id, title, description, owner, priority, status, due_date, notes) VALUES
        (v_org, proj.id, 'Confirm go-live date with business', 'Align stakeholders on final cutover window.', 'Ravi Kumar', 'High', 'Open', CURRENT_DATE + 7, 'Comms drafted, awaiting sponsor sign-off.'),
        (v_org, proj.id, 'Close RAID items older than 30 days', 'Audit and close stale register items.', 'Anna Weber', 'Medium', CASE WHEN i % 3 = 0 THEN 'Closed' ELSE 'In Progress' END, CURRENT_DATE + 14, 'Weekly grooming session established.'),
        (v_org, proj.id, 'Publish updated project brief', 'Refresh sponsor / solution manager sections.', 'Jordan Blake', 'Low', 'Open', CURRENT_DATE + 21, 'Template merged from Data Editor.');
    END LOOP;
  END IF;

  -- DECISIONS
  IF NOT EXISTS (SELECT 1 FROM public.decisions) THEN
    FOR proj IN SELECT id, name, program, sponsor FROM public.projects WHERE org_id = v_org LIMIT 10 LOOP
      INSERT INTO public.decisions (org_id, project_id, title, description, decision_date, decided_by, rationale, impact, status, program, forum, sponsor, approvers, outcome, owner, notes) VALUES
        (v_org, proj.id, 'Approve budget uplift for ' || proj.name, 'Additional funding needed for scope expansion.', CURRENT_DATE - 5, proj.sponsor, 'ROI remains above threshold after uplift.', 'Positive', 'Approved', proj.program, 'Portfolio Board', proj.sponsor, 'CFO, CTO', 'Approved', proj.sponsor, 'Follow-up review at next quarterly gate.'),
        (v_org, proj.id, 'Defer non-critical scope item', 'Re-baseline scope to protect MVP delivery date.', CURRENT_DATE - 12, proj.sponsor, 'Timeline risk outweighs scope benefit.', 'Neutral', 'Approved', proj.program, 'Change Advisory Board', proj.sponsor, 'Delivery Lead', 'On Hold', proj.sponsor, 'Item added to backlog for FY+1 consideration.');
    END LOOP;
  END IF;

  -- CHANGE REQUESTS (release / change register)
  IF NOT EXISTS (SELECT 1 FROM public.change_requests) THEN
    i := 0;
    FOR proj IN SELECT id, name, sponsor FROM public.projects WHERE org_id = v_org LIMIT 12 LOOP
      i := i + 1;
      INSERT INTO public.change_requests (org_id, project_id, cr_number, title, description, change_type, impact_scope, impact_schedule_days, impact_cost, status, raised_by, raised_date, decision_date, approver, owner, notes) VALUES
        (v_org, proj.id, 'CR-' || LPAD(i::text, 4, '0'), 'Add analytics module to ' || proj.name, 'Business requested extra reporting capability.', 'Scope', 'Medium', 10, 45000, CASE WHEN i % 3 = 0 THEN 'Approved' WHEN i % 3 = 1 THEN 'Submitted' ELSE 'In Review' END, 'Sam Patel', CURRENT_DATE - 20, CURRENT_DATE - 5, proj.sponsor, 'Sam Patel', 'Design workshop planned for next sprint.'),
        (v_org, proj.id, 'CR-' || LPAD((i+100)::text, 4, '0'), 'Shift release window by two weeks', 'Business freeze conflict — realign release date.', 'Schedule', 'High', 14, 12000, CASE WHEN i % 2 = 0 THEN 'Approved' ELSE 'Submitted' END, 'Elena Rossi', CURRENT_DATE - 10, NULL, proj.sponsor, 'Elena Rossi', 'Communication drafted; stakeholders notified.');
    END LOOP;
  END IF;
END $$;
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_admin';

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'platform_admin')
$$;

CREATE TABLE public.billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  interval text NOT NULL DEFAULT 'month',
  max_users integer,
  max_projects integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  stripe_price_id text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_plans TO anon, authenticated;
GRANT ALL ON public.billing_plans TO service_role;
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans readable by all" ON public.billing_plans FOR SELECT USING (true);
CREATE POLICY "plans manage platform" ON public.billing_plans FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.billing_plans FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.billing_plans(id),
  status text NOT NULL DEFAULT 'active',
  current_period_start date,
  current_period_end date,
  stripe_customer_id text,
  stripe_subscription_id text,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub view own or platform" ON public.subscriptions FOR SELECT
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "sub manage platform" ON public.subscriptions FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_subs_org ON public.subscriptions(org_id);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'draft',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
  paid_date date,
  period_start date,
  period_end date,
  stripe_invoice_id text,
  stripe_hosted_url text,
  notes text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv view own or platform" ON public.invoices FOR SELECT
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "inv manage platform" ON public.invoices FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER trg_inv_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_invoices_org ON public.invoices(org_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);

CREATE TABLE public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  paid_at timestamptz NOT NULL DEFAULT now(),
  method text,
  stripe_payment_intent_id text,
  reference text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pay view own or platform" ON public.invoice_payments FOR SELECT
  USING (public.is_platform_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.org_id = public.get_user_org(auth.uid())
  ));
CREATE POLICY "pay insert platform" ON public.invoice_payments FOR INSERT
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.platform_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  description text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  vendor text,
  recurring boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_expenses TO authenticated;
GRANT ALL ON public.platform_expenses TO service_role;
ALTER TABLE public.platform_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses platform only" ON public.platform_expenses FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER trg_exp_updated BEFORE UPDATE ON public.platform_expenses FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif own" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notif own update" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notif insert platform or self" ON public.notifications FOR INSERT
  WITH CHECK (public.is_platform_admin(auth.uid()) OR user_id = auth.uid());
CREATE INDEX idx_notif_user ON public.notifications(user_id, read_at);

CREATE OR REPLACE FUNCTION public.tg_invoice_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_user uuid;
  kind_txt text;
  title_txt text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'paid' THEN kind_txt := 'invoice_paid'; title_txt := 'Invoice ' || NEW.invoice_number || ' marked as paid';
  ELSIF NEW.status = 'sent' THEN kind_txt := 'invoice_sent'; title_txt := 'New invoice ' || NEW.invoice_number || ' issued';
  ELSIF NEW.status = 'overdue' THEN kind_txt := 'invoice_overdue'; title_txt := 'Invoice ' || NEW.invoice_number || ' is overdue';
  ELSE RETURN NEW;
  END IF;
  FOR admin_user IN
    SELECT ur.user_id FROM public.user_roles ur
    WHERE ur.org_id = NEW.org_id AND ur.role::text IN ('org_admin','admin')
  LOOP
    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (admin_user, NEW.org_id, kind_txt, title_txt,
      'Amount: ' || (NEW.amount_cents/100.0)::text || ' ' || NEW.currency, '/app/billing');
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_invoice_notify AFTER INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_notify();

INSERT INTO public.billing_plans (code, name, description, price_cents, interval, max_users, max_projects, features, sort_order) VALUES
  ('free', 'Free', 'Get started', 0, 'month', 3, 5, '["Up to 5 projects","1 admin","Community support"]'::jsonb, 1),
  ('team', 'Team', 'Growing teams', 4900, 'month', 10, NULL, '["Unlimited projects","10 users","Email support"]'::jsonb, 2),
  ('business', 'Business', 'Enterprise-ready', 19900, 'month', NULL, NULL, '["Unlimited users","SSO","Priority support"]'::jsonb, 3);
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_name TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_color TEXT,
  ADD COLUMN IF NOT EXISTS accent_color TEXT;ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS palette JSONB NOT NULL DEFAULT '[]'::jsonb;
DROP POLICY IF EXISTS "Platform admins can update any organization branding" ON public.organizations;
CREATE POLICY "Platform admins can update any organization branding"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS "Platform admins can view all organizations" ON public.organizations;
CREATE POLICY "Platform admins can view all organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS fy_start_month smallint NOT NULL DEFAULT 4 CHECK (fy_start_month BETWEEN 1 AND 12);
CREATE TABLE public.governance_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cadence TEXT,
  audience TEXT,
  purpose TEXT,
  chair TEXT,
  next_meeting DATE,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.governance_channels TO authenticated;
GRANT ALL ON public.governance_channels TO service_role;

ALTER TABLE public.governance_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view channels" ON public.governance_channels
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "Org members can insert channels" ON public.governance_channels
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "Org members can update channels" ON public.governance_channels
  FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "Org admins can delete channels" ON public.governance_channels
  FOR DELETE TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

CREATE TRIGGER trg_governance_channels_updated_at
  BEFORE UPDATE ON public.governance_channels
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed default channels for existing orgs
INSERT INTO public.governance_channels (org_id, name, cadence, audience, purpose)
SELECT o.id, x.name, x.cadence, x.audience, x.purpose
FROM public.organizations o
CROSS JOIN (VALUES
  ('Portfolio Steering Committee','Monthly','Executives & Sponsors','Approve investments, review portfolio health'),
  ('Program Board','Fortnightly','Program & BU Leads','Program-level RAG, dependencies, escalations'),
  ('Project Review Forum','Weekly','Project Managers','Milestones, risks, actions'),
  ('Change Advisory Board','Weekly','CAB Members','Assess and approve change requests'),
  ('Architecture Review','Bi-weekly','Architects & Tech Leads','Solution design, standards, non-functional review'),
  ('Benefits Realisation Review','Quarterly','Sponsors & Finance','Track benefits vs target post go-live')
) AS x(name,cadence,audience,purpose);

CREATE OR REPLACE FUNCTION public.tg_milestone_to_status_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  proj_name text;
  msg text;
  is_new_complete boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    msg := 'Milestone added: ' || NEW.name;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.actual_date IS NOT NULL AND (OLD.actual_date IS NULL OR OLD.actual_date <> NEW.actual_date) THEN
      msg := 'Milestone completed: ' || NEW.name || ' on ' || NEW.actual_date::text;
      is_new_complete := true;
    ELSIF COALESCE(NEW.status,'') <> COALESCE(OLD.status,'') THEN
      msg := 'Milestone status changed to ' || COALESCE(NEW.status,'—') || ': ' || NEW.name;
    ELSIF COALESCE(NEW.planned_date::text,'') <> COALESCE(OLD.planned_date::text,'') THEN
      msg := 'Milestone rescheduled: ' || NEW.name || ' → ' || COALESCE(NEW.planned_date::text,'TBD');
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT name INTO proj_name FROM public.projects WHERE id = NEW.project_id;

  INSERT INTO public.status_updates (org_id, project_id, update_date, reporter, overall_rag, progress_summary, achievements)
  VALUES (
    NEW.org_id,
    NEW.project_id,
    COALESCE(NEW.actual_date, CURRENT_DATE),
    COALESCE(NEW.owner, 'System'),
    'Green',
    msg,
    CASE WHEN is_new_complete THEN '✅ ' || NEW.name ELSE NULL END
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_milestone_to_status_update ON public.milestones;
CREATE TRIGGER trg_milestone_to_status_update
  AFTER INSERT OR UPDATE ON public.milestones
  FOR EACH ROW EXECUTE FUNCTION public.tg_milestone_to_status_update();

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS override_max_users integer,
  ADD COLUMN IF NOT EXISTS override_max_projects integer;

CREATE OR REPLACE FUNCTION public.get_org_limits(_org_id uuid)
RETURNS TABLE(max_users integer, max_projects integer, plan_code text, plan_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(o.override_max_users, bp.max_users)    AS max_users,
    COALESCE(o.override_max_projects, bp.max_projects) AS max_projects,
    bp.code, bp.name
  FROM public.organizations o
  LEFT JOIN public.subscriptions s
    ON s.org_id = o.id AND s.status IN ('active','trialing','past_due')
  LEFT JOIN public.billing_plans bp ON bp.id = s.plan_id
  WHERE o.id = _org_id
  ORDER BY s.created_at DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_limits(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_enforce_project_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int; used int;
BEGIN
  IF NEW.org_id IS NULL THEN RETURN NEW; END IF;
  SELECT max_projects INTO lim FROM public.get_org_limits(NEW.org_id);
  IF lim IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO used FROM public.projects WHERE org_id = NEW.org_id;
  IF used >= lim THEN
    RAISE EXCEPTION 'Project limit reached for this organization (max % projects on current plan). Upgrade the plan or contact your administrator.', lim
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_project_limit ON public.projects;
CREATE TRIGGER trg_enforce_project_limit
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_project_limit();

CREATE OR REPLACE FUNCTION public.tg_enforce_user_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int; used int;
BEGIN
  IF NEW.org_id IS NULL THEN RETURN NEW; END IF;
  SELECT max_users INTO lim FROM public.get_org_limits(NEW.org_id);
  IF lim IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE org_id = NEW.org_id AND user_id = NEW.user_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(DISTINCT user_id) INTO used FROM public.user_roles WHERE org_id = NEW.org_id;
  IF used >= lim THEN
    RAISE EXCEPTION 'User limit reached for this organization (max % users on current plan). Upgrade the plan or contact your administrator.', lim
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_user_limit ON public.user_roles;
CREATE TRIGGER trg_enforce_user_limit
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_user_limit();

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS billing_email text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS email_last_error text;

CREATE OR REPLACE FUNCTION public.generate_due_invoices()
RETURNS TABLE(invoice_id uuid, org_id uuid, amount_cents integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub RECORD;
  new_period_start date;
  new_period_end date;
  new_invoice_id uuid;
  invoice_num text;
BEGIN
  FOR sub IN
    SELECT s.*, bp.price_cents, bp.currency, bp.interval, bp.name AS plan_name
    FROM public.subscriptions s
    JOIN public.billing_plans bp ON bp.id = s.plan_id
    WHERE s.status IN ('active','trialing','past_due')
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end <= CURRENT_DATE
      AND COALESCE(bp.price_cents,0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.subscription_id = s.id
          AND i.period_start = s.current_period_end
      )
  LOOP
    new_period_start := sub.current_period_end;
    new_period_end := CASE sub.interval
      WHEN 'month' THEN new_period_start + INTERVAL '1 month'
      WHEN 'year'  THEN new_period_start + INTERVAL '1 year'
      WHEN 'week'  THEN new_period_start + INTERVAL '1 week'
      ELSE new_period_start + INTERVAL '1 month'
    END;

    invoice_num := 'INV-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    INSERT INTO public.invoices
      (org_id, subscription_id, invoice_number, amount_cents, currency, status,
       issue_date, due_date, period_start, period_end, notes)
    VALUES
      (sub.org_id, sub.id, invoice_num, sub.price_cents, COALESCE(sub.currency,'USD'), 'sent',
       CURRENT_DATE, CURRENT_DATE + INTERVAL '14 day', new_period_start, new_period_end,
       sub.plan_name || ' subscription — ' || new_period_start::text || ' to ' || new_period_end::text)
    RETURNING id INTO new_invoice_id;

    UPDATE public.subscriptions
       SET current_period_start = new_period_start,
           current_period_end = new_period_end,
           updated_at = now()
     WHERE id = sub.id;

    invoice_id := new_invoice_id; org_id := sub.org_id; amount_cents := sub.price_cents;
    RETURN NEXT;
  END LOOP;

  UPDATE public.invoices
     SET status = 'overdue'
   WHERE status = 'sent' AND due_date < CURRENT_DATE;
END $$;

GRANT EXECUTE ON FUNCTION public.generate_due_invoices() TO service_role;

CREATE TABLE IF NOT EXISTS public.landing_config (
  id text PRIMARY KEY DEFAULT 'singleton',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT ON public.landing_config TO anon, authenticated;
GRANT ALL ON public.landing_config TO service_role;

ALTER TABLE public.landing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landing_config public read" ON public.landing_config
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "landing_config platform admin write" ON public.landing_config
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

INSERT INTO public.landing_config (id, config)
VALUES ('singleton', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER trg_landing_config_updated
BEFORE UPDATE ON public.landing_config
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- =========================================================================
-- iProjectX — Sample data seed (idempotent)
-- Assumes the schema above (all migrations) is already installed.
-- Creates: platform admin, iProjectX org, 4 BUs, 17 projects, and rich
-- sample data across every operational table.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -------------------------------------------------------------------------
-- 1) Platform admin user + iProjectX org
-- -------------------------------------------------------------------------
DO $$
DECLARE v_user_id UUID; v_org_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'shailja.kant.kaushik@gmail.com';
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      'shailja.kant.kaushik@gmail.com', crypt('Welcome@2026', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Shailja Kant Kaushik"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', 'shailja.kant.kaushik@gmail.com'),
      'email', v_user_id::text, now(), now(), now());
  END IF;

  SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'iprojectx';
  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, plan, fy_start_month)
    VALUES ('iProjectX', 'iprojectx', 'enterprise', 4) RETURNING id INTO v_org_id;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, org_id, must_change_password)
  VALUES (v_user_id, 'shailja.kant.kaushik@gmail.com', 'Shailja Kant Kaushik', v_org_id, true)
  ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id, must_change_password = true, full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user_id, v_org_id, 'platform_admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user_id, v_org_id, 'org_admin')      ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user_id, v_org_id, 'admin')          ON CONFLICT DO NOTHING;
END $$;

-- -------------------------------------------------------------------------
-- 2) Business Units
-- -------------------------------------------------------------------------
INSERT INTO public.business_units (org_id, name, code)
SELECT o.id, bu.name, bu.code
FROM public.organizations o
CROSS JOIN (VALUES
  ('Technology','TECH'),('Operations','OPS'),('Finance','FIN'),('Customer','CUST')
) AS bu(name, code)
WHERE o.slug = 'iprojectx'
ON CONFLICT DO NOTHING;

-- -------------------------------------------------------------------------
-- 3) Stage Gate Definitions
-- -------------------------------------------------------------------------
INSERT INTO public.stage_gate_definitions (org_id, gate_name, sort_order, is_active)
SELECT o.id, g.name, g.ord, true
FROM public.organizations o
CROSS JOIN (VALUES
  ('G0 — Ideation',1),('G1 — Business Case',2),('G2 — Design',3),
  ('G3 — Build',4),('G4 — Ready for Go-Live',5),('G5 — Benefits Realisation',6)
) AS g(name, ord)
WHERE o.slug = 'iprojectx'
ON CONFLICT DO NOTHING;

-- -------------------------------------------------------------------------
-- 4) 17 sample projects
-- -------------------------------------------------------------------------
WITH org AS (SELECT id FROM public.organizations WHERE slug='iprojectx'),
     bus AS (SELECT code, id FROM public.business_units WHERE org_id=(SELECT id FROM org))
INSERT INTO public.projects (
  org_id, bu_id, project_code, name, program, sponsor, priority, status, rag,
  current_phase, delivery_method, planned_start_date, planned_end_date,
  actual_start_date, target_go_live, budget, capex_approved, capex_incurred,
  opex_approved, opex_incurred, benefits_target, benefits_realised, roi_percent, description
)
SELECT (SELECT id FROM org), (SELECT id FROM bus WHERE code=p.bu),
  p.code, p.name, p.program, p.sponsor, p.priority, p.status::project_status, p.rag::project_rag,
  p.phase, p.method::delivery_method, p.p_start::date, p.p_end::date,
  p.a_start::date, p.golive::date, p.budget, p.capex_a, p.capex_i,
  p.opex_a, p.opex_i, p.ben_t, p.ben_r, p.roi, p.descr
FROM (VALUES
  ('TECH','PRJ-001','Cloud Migration Wave 1','Cloud Modernization','Sarah Chen','Critical','In Progress','Amber','Execute','Waterfall','2026-04-01','2026-12-31','2026-04-10','2026-12-15',2500000,1800000,950000,700000,320000,4200000,850000,68,'Migrate 40 legacy apps to AWS'),
  ('TECH','PRJ-002','ERP Upgrade to S/4HANA','Finance Transform','John Wright','Critical','In Progress','Red','Execute','Waterfall','2026-01-15','2027-06-30','2026-02-01','2027-06-30',8500000,6000000,3200000,2500000,1100000,12000000,0,41,'Global SAP ECC to S/4HANA'),
  ('CUST','PRJ-003','Customer Portal v2','Digital Customer','Priya Nair','High','In Progress','Green','Build','Agile','2026-05-01','2026-11-30','2026-05-05',NULL,1400000,900000,560000,500000,280000,3100000,420000,121,'Self-service customer portal'),
  ('OPS','PRJ-004','Warehouse Robotics Pilot','Supply Chain','Marco Rossi','Medium','In Progress','Amber','Pilot','Waterfall','2026-06-01','2027-03-31','2026-06-15',NULL,3200000,2500000,800000,700000,180000,4800000,0,50,'AGV pilot in Rotterdam DC'),
  ('FIN','PRJ-005','Treasury Automation','Finance Transform','John Wright','High','In Progress','Green','Execute','Agile','2026-03-01','2026-10-31','2026-03-10',NULL,850000,500000,320000,350000,180000,2200000,600000,159,'Automate FX and cash forecasting'),
  ('TECH','PRJ-006','Zero Trust Security','Cybersecurity','Alex Kim','Critical','In Progress','Amber','Execute','Hybrid','2026-01-01','2026-12-31','2026-01-15',NULL,4200000,2800000,1400000,1400000,650000,6500000,1200000,55,'Rollout ZTNA + SASE'),
  ('CUST','PRJ-007','Mobile App Redesign','Digital Customer','Priya Nair','High','Not Started','Green','Design','Agile','2026-08-01','2027-02-28',NULL,NULL,650000,400000,0,250000,0,1800000,0,177,'iOS/Android UX overhaul'),
  ('OPS','PRJ-008','Global HR Platform','People','Emma Larsson','Medium','In Progress','Amber','Build','Waterfall','2025-11-01','2026-10-31','2025-11-20','2026-10-15',2100000,1500000,1100000,600000,380000,3200000,180000,52,'Workday deployment'),
  ('TECH','PRJ-009','Data Lakehouse','Data & AI','Michael Torres','High','In Progress','Green','Execute','Agile','2026-02-01','2027-01-31','2026-02-15',NULL,1800000,1200000,720000,600000,290000,4500000,550000,150,'Databricks lakehouse'),
  ('CUST','PRJ-010','AI Contact Center','Digital Customer','Priya Nair','High','Not Started','Green','Design','Hybrid','2026-09-01','2027-06-30',NULL,NULL,2400000,1600000,0,800000,0,5600000,0,133,'Genesys + Copilot deployment'),
  ('FIN','PRJ-011','Procurement Analytics','Finance Transform','John Wright','Medium','In Progress','Green','Execute','Agile','2026-04-01','2026-11-30','2026-04-20',NULL,720000,450000,290000,270000,140000,2400000,380000,233,'Coupa spend analytics'),
  ('OPS','PRJ-012','Sustainability Reporting','ESG','Ingrid Bakker','High','In Progress','Amber','Build','Waterfall','2026-01-01','2026-09-30','2026-01-10','2026-09-15',950000,600000,480000,350000,180000,1800000,120000,89,'CSRD-compliant reporting'),
  ('TECH','PRJ-013','Network SD-WAN Refresh','Infrastructure','Alex Kim','Medium','In Progress','Green','Execute','Waterfall','2026-05-01','2026-12-31','2026-05-15',NULL,1600000,1200000,650000,400000,170000,2400000,300000,50,'Global SD-WAN'),
  ('CUST','PRJ-014','Loyalty Program 2.0','Marketing','Sofia Marin','Low','Not Started','Green','Design','Agile','2026-10-01','2027-04-30',NULL,NULL,540000,320000,0,220000,0,1400000,0,159,'Points + tiers redesign'),
  ('FIN','PRJ-015','Tax Engine Upgrade','Finance Transform','John Wright','Medium','On Hold','Red','Discovery','Waterfall','2026-07-01','2027-03-31',NULL,NULL,1100000,700000,120000,400000,80000,1800000,0,64,'Vertex O Series upgrade'),
  ('OPS','PRJ-016','Field Service Mobile','Operations','Marco Rossi','High','In Progress','Green','Execute','Agile','2026-03-15','2026-10-31','2026-04-01',NULL,890000,560000,340000,330000,190000,2600000,410000,192,'ServiceMax on iPad'),
  ('TECH','PRJ-017','AI Assistant for PMO','Data & AI','Michael Torres','High','In Progress','Green','Build','Agile','2026-06-01','2026-12-31','2026-06-10',NULL,780000,500000,240000,280000,120000,2200000,220000,182,'GenAI copilot for portfolio insights')
) AS p(bu, code, name, program, sponsor, priority, status, rag, phase, method,
       p_start, p_end, a_start, golive, budget, capex_a, capex_i, opex_a, opex_i, ben_t, ben_r, roi, descr)
WHERE NOT EXISTS (SELECT 1 FROM public.projects x WHERE x.org_id=(SELECT id FROM org) AND x.project_code=p.code);

UPDATE public.projects
   SET start_date = COALESCE(start_date, planned_start_date),
       end_date   = COALESCE(end_date,   planned_end_date),
       actual_start_date = COALESCE(actual_start_date, planned_start_date)
 WHERE org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx');

-- =========================================================================
-- 5) Rich operational data — driven off each project
-- =========================================================================

-- 5a) Milestones (3 per project)
INSERT INTO public.milestones (org_id, project_id, name, planned_date, actual_date, status, owner)
SELECT p.org_id, p.id, m.n, (p.planned_start_date + (m.k * ((p.planned_end_date - p.planned_start_date) / 4)))::date,
  CASE WHEN m.k <= 1 THEN (p.planned_start_date + (m.k * ((p.planned_end_date - p.planned_start_date) / 4)))::date END,
  CASE WHEN m.k <= 1 THEN 'Complete' ELSE 'Planned' END, p.sponsor
FROM public.projects p
CROSS JOIN (VALUES ('Kickoff',1),('Design Complete',2),('Go-Live',3)) AS m(n,k)
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.milestones x WHERE x.project_id=p.id AND x.name=m.n);

-- 5b) Stage Gates (auto-populated from definitions + planned dates)
INSERT INTO public.stage_gates (org_id, project_id, gate_name, planned_date, actual_date, status, approver)
SELECT p.org_id, p.id, d.gate_name,
  (p.planned_start_date + (d.sort_order * ((p.planned_end_date - p.planned_start_date) / 7)))::date,
  CASE WHEN d.sort_order <= 2 THEN (p.planned_start_date + (d.sort_order * ((p.planned_end_date - p.planned_start_date) / 7)))::date END,
  CASE WHEN d.sort_order <= 2 THEN 'Approved' WHEN d.sort_order = 3 THEN 'In Review' ELSE 'Pending' END,
  p.sponsor
FROM public.projects p
JOIN public.stage_gate_definitions d ON d.org_id = p.org_id AND d.is_active
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.stage_gates x WHERE x.project_id=p.id AND x.gate_name=d.gate_name);

-- 5c) Risks (2 per project)
INSERT INTO public.risks (org_id, project_id, title, category, probability, impact, severity, status, owner, mitigation, due_date)
SELECT p.org_id, p.id, r.t, r.c, r.pr, r.im, r.pr*r.im, r.s, p.sponsor, r.mit, (p.planned_end_date - INTERVAL '30 day')::date
FROM public.projects p
CROSS JOIN (VALUES
  ('Vendor delivery slippage','Delivery',3,4,'Open','Weekly vendor reviews with escalation triggers'),
  ('Regulatory change mid-project','Compliance',2,5,'Monitoring','Legal engaged; quarterly compliance scan')
) AS r(t,c,pr,im,s,mit)
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.risks x WHERE x.project_id=p.id AND x.title=r.t);

-- 5d) Issues (2 per project)
INSERT INTO public.issues (org_id, project_id, title, priority, status, owner, raised_date, target_date)
SELECT p.org_id, p.id, i.t, i.pr, i.s, p.sponsor, CURRENT_DATE - i.d, CURRENT_DATE + 14
FROM public.projects p
CROSS JOIN (VALUES
  ('Integration test environment unstable','High','Open',10),
  ('Requirements clarification pending','Medium','In Progress',5)
) AS i(t,pr,s,d)
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.issues x WHERE x.project_id=p.id AND x.title=i.t);

-- 5e) Actions (2 per project)
INSERT INTO public.actions (org_id, project_id, title, owner, priority, status, due_date)
SELECT p.org_id, p.id, a.t, p.sponsor, a.pr, a.s, CURRENT_DATE + a.d
FROM public.projects p
CROSS JOIN (VALUES
  ('Finalize architecture review','High','In Progress',7),
  ('Schedule steering committee','Medium','Open',14)
) AS a(t,pr,s,d)
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.actions x WHERE x.project_id=p.id AND x.title=a.t);

-- 5f) Decisions (1 per project) — linked to first stage gate
INSERT INTO public.decisions (org_id, project_id, title, decision_date, decided_by, rationale, status, program, forum, sponsor, approvers, stage_gate_id, outcome, owner)
SELECT p.org_id, p.id, 'Approve project charter', CURRENT_DATE - 30, p.sponsor,
  'Business case validated; funding secured', 'Approved', p.program, 'Steering Committee', p.sponsor, p.sponsor,
  (SELECT id FROM public.stage_gates sg WHERE sg.project_id=p.id ORDER BY planned_date LIMIT 1),
  'Approved', p.sponsor
FROM public.projects p
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.decisions x WHERE x.project_id=p.id AND x.title='Approve project charter');

-- 5g) Benefits (2 per project)
INSERT INTO public.benefits (org_id, project_id, title, benefit_type, target_value, realised_value, realisation_date, owner, status)
SELECT p.org_id, p.id, b.t, b.k, ROUND(p.benefits_target * b.ratio), ROUND(p.benefits_realised * b.ratio), (p.planned_end_date + INTERVAL '90 day')::date, p.sponsor, b.s
FROM public.projects p
CROSS JOIN (VALUES
  ('Cost savings','Financial',0.6,'On Track'),
  ('Productivity uplift','Non-Financial',0.4,'On Track')
) AS b(t,k,ratio,s)
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.benefits x WHERE x.project_id=p.id AND x.title=b.t);

-- 5h) Financials monthly (6 months per project)
INSERT INTO public.financials_monthly (org_id, project_id, period_month, capex_planned, capex_actual, capex_forecast, opex_planned, opex_actual, opex_forecast, benefits_planned, benefits_actual)
SELECT p.org_id, p.id,
  (date_trunc('month', p.planned_start_date) + (mo || ' month')::interval)::date,
  ROUND(p.capex_approved/12.0), ROUND(p.capex_incurred/6.0),
  ROUND(p.capex_approved/12.0),
  ROUND(p.opex_approved/12.0), ROUND(p.opex_incurred/6.0),
  ROUND(p.opex_approved/12.0),
  ROUND(p.benefits_target/24.0), ROUND(p.benefits_realised/12.0)
FROM public.projects p
CROSS JOIN generate_series(0,5) AS mo
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (
    SELECT 1 FROM public.financials_monthly x
    WHERE x.project_id=p.id
      AND x.period_month = (date_trunc('month', p.planned_start_date) + (mo || ' month')::interval)::date
  );

-- 5i) FY Allocations (FY27, FY28)
INSERT INTO public.fy_allocations (org_id, project_id, fy, capex, opex, benefits)
SELECT p.org_id, p.id, fy.f,
  ROUND(p.capex_approved * fy.ratio), ROUND(p.opex_approved * fy.ratio), ROUND(p.benefits_target * fy.ratio)
FROM public.projects p
CROSS JOIN (VALUES ('FY27',0.6),('FY28',0.4)) AS fy(f, ratio)
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.fy_allocations x WHERE x.project_id=p.id AND x.fy=fy.f);

-- 5j) Status updates (1 per project, current)
INSERT INTO public.status_updates (org_id, project_id, update_date, reporter, overall_rag, schedule_rag, cost_rag, scope_rag, progress_summary, achievements, next_steps)
SELECT p.org_id, p.id, CURRENT_DATE - 3, p.sponsor, p.rag, p.rag, p.rag, 'Green'::project_rag,
  'Project progressing per plan; key workstreams on track.',
  'Completed design review; secured vendor SOW; onboarded core team.',
  'Begin build sprint; finalize integration test plan; steering review next week.'
FROM public.projects p
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.status_updates x WHERE x.project_id=p.id AND x.update_date = CURRENT_DATE - 3);

-- 5k) Sprints (only for Agile projects — 4 sprints each)
INSERT INTO public.sprints (org_id, project_id, sprint_number, name, start_date, end_date, planned_points, completed_points, committed_stories, completed_stories, status)
SELECT p.org_id, p.id, s.n, 'Sprint '||s.n,
  (p.planned_start_date + ((s.n-1)*14) * INTERVAL '1 day')::date,
  (p.planned_start_date + (s.n*14 - 1) * INTERVAL '1 day')::date,
  40, CASE WHEN s.n <= 3 THEN 35 + s.n ELSE 0 END,
  15, CASE WHEN s.n <= 3 THEN 12 + s.n ELSE 0 END,
  CASE WHEN s.n <= 3 THEN 'Complete' ELSE 'Planned' END
FROM public.projects p
CROSS JOIN generate_series(1,4) AS s(n)
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND p.delivery_method IN ('Agile','Hybrid')
  AND NOT EXISTS (SELECT 1 FROM public.sprints x WHERE x.project_id=p.id AND x.sprint_number=s.n);

-- 5l) Change requests (1 per project)
INSERT INTO public.change_requests (org_id, project_id, cr_number, title, change_type, impact_scope, impact_schedule_days, impact_cost, status, raised_by, raised_date, owner)
SELECT p.org_id, p.id, 'CR-'||p.project_code||'-01', 'Scope adjustment for phase 2', 'Scope', 'Medium', 14, 45000,
  'Under Review', p.sponsor, CURRENT_DATE - 20, p.sponsor
FROM public.projects p
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.change_requests x WHERE x.project_id=p.id AND x.cr_number='CR-'||p.project_code||'-01');

-- 5m) Lessons learned (1 per project)
INSERT INTO public.lessons_learned (org_id, project_id, category, what_happened, root_cause, recommendation, captured_by, captured_date)
SELECT p.org_id, p.id, 'Planning', 'Initial estimates underestimated integration effort',
  'Insufficient discovery on legacy interfaces',
  'Add 2-week integration discovery phase to all similar projects',
  p.sponsor, CURRENT_DATE - 40
FROM public.projects p
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.lessons_learned x WHERE x.project_id=p.id AND x.category='Planning');

-- 5n) Stakeholders (2 per project)
INSERT INTO public.stakeholders (org_id, project_id, name, role, email, influence, interest, engagement_strategy)
SELECT p.org_id, p.id, s.n, s.r, s.e, s.inf, s.intr, s.strat
FROM public.projects p
CROSS JOIN (VALUES
  ('Executive Sponsor','Sponsor','sponsor@iprojectx.com','High','High','Weekly 1:1 updates'),
  ('Business Lead','Lead','businesslead@iprojectx.com','Medium','High','Fortnightly steering')
) AS s(n,r,e,inf,intr,strat)
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.stakeholders x WHERE x.project_id=p.id AND x.name=s.n);

-- 5o) Documents (1 per project)
INSERT INTO public.documents (org_id, project_id, name, doc_type, url, version, owner, uploaded_date)
SELECT p.org_id, p.id, 'Project Charter — '||p.name, 'Charter', 'https://docs.example.com/'||p.project_code, 'v1.0', p.sponsor, CURRENT_DATE - 60
FROM public.projects p
WHERE p.org_id = (SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.documents x WHERE x.project_id=p.id AND x.name='Project Charter — '||p.name);

-- 5p) Dependencies (chain: each project depends on previous)
WITH ordered AS (
  SELECT id, project_code, ROW_NUMBER() OVER (ORDER BY project_code) AS rn,
         LAG(id) OVER (ORDER BY project_code) AS prev_id, org_id, sponsor
  FROM public.projects WHERE org_id=(SELECT id FROM public.organizations WHERE slug='iprojectx')
)
INSERT INTO public.dependencies (org_id, project_id, depends_on_project_id, title, dep_type, status, owner, needed_by)
SELECT o.org_id, o.id, o.prev_id, 'Upstream deliverable required', 'Finish-to-Start', 'Open', o.sponsor, CURRENT_DATE + 30
FROM ordered o
WHERE o.prev_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.dependencies x WHERE x.project_id=o.id AND x.depends_on_project_id=o.prev_id);

-- =========================================================================
-- 6) Org-level data
-- =========================================================================

-- 6a) Resources (10 org-wide)
INSERT INTO public.resources (org_id, bu_id, name, email, role, skills, capacity_hours_week, cost_rate, location, status)
SELECT (SELECT id FROM public.organizations WHERE slug='iprojectx'),
       (SELECT id FROM public.business_units WHERE code=r.bu AND org_id=(SELECT id FROM public.organizations WHERE slug='iprojectx')),
       r.n, r.e, r.role, r.sk, 40, r.rate, r.loc, 'Active'
FROM (VALUES
  ('TECH','Aarav Sharma','aarav@iprojectx.com','Solution Architect','Cloud, AWS, Kubernetes',180,'Bengaluru'),
  ('TECH','Diego Fernandez','diego@iprojectx.com','DevOps Engineer','CI/CD, Terraform',150,'Madrid'),
  ('TECH','Yuki Tanaka','yuki@iprojectx.com','Security Engineer','ZTNA, SASE, IAM',170,'Tokyo'),
  ('OPS','Nadia Petrova','nadia@iprojectx.com','Operations Lead','Lean, Six Sigma',140,'Warsaw'),
  ('OPS','Liam O''Brien','liam@iprojectx.com','Robotics Engineer','AGV, ROS',160,'Dublin'),
  ('FIN','Fatima Al-Rashid','fatima@iprojectx.com','Financial Analyst','SAP FICO, Treasury',130,'Dubai'),
  ('FIN','Hiroshi Nakamura','hiroshi@iprojectx.com','Tax Specialist','Vertex, Compliance',145,'Osaka'),
  ('CUST','Ana Silva','ana@iprojectx.com','UX Designer','Figma, Research',120,'Lisbon'),
  ('CUST','Kwame Boateng','kwame@iprojectx.com','Product Manager','Mobile, Loyalty',150,'Accra'),
  ('CUST','Elena Rossi','elena@iprojectx.com','Contact Center SME','Genesys, AI',140,'Milan')
) AS r(bu,n,e,role,sk,rate,loc)
WHERE NOT EXISTS (SELECT 1 FROM public.resources x WHERE x.email=r.e);

-- 6b) Resource allocations (each resource on 1-2 projects, current + next month)
INSERT INTO public.resource_allocations (org_id, project_id, resource_id, period_month, allocation_percent, allocated_hours, role_on_project)
SELECT r.org_id, p.id, r.id, date_trunc('month', CURRENT_DATE)::date + (mo || ' month')::interval, 50, 80, r.role
FROM public.resources r
JOIN public.projects p ON p.org_id=r.org_id AND p.bu_id=r.bu_id
CROSS JOIN generate_series(0,1) mo
WHERE r.org_id=(SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_allocations x
    WHERE x.resource_id=r.id AND x.project_id=p.id
      AND x.period_month = (date_trunc('month', CURRENT_DATE)::date + (mo || ' month')::interval)::date
  )
LIMIT 60;

-- 6c) Governance Channels
INSERT INTO public.governance_channels (org_id, name, cadence, audience, purpose, chair, next_meeting, status)
SELECT (SELECT id FROM public.organizations WHERE slug='iprojectx'), g.n, g.c, g.a, g.p, g.ch, CURRENT_DATE + g.d, 'Active'
FROM (VALUES
  ('Portfolio Steering Committee','Monthly','Executives','Portfolio decisions & funding','CEO',14),
  ('Programme Board','Bi-weekly','Programme Leads','Cross-programme coordination','COO',7),
  ('Architecture Review Board','Weekly','Architects','Design decisions','CTO',3),
  ('Risk & Compliance Forum','Monthly','Risk owners','Enterprise risk review','CRO',21),
  ('Benefits Realisation Forum','Quarterly','Finance & Sponsors','Track benefits','CFO',45)
) AS g(n,c,a,p,ch,d)
WHERE NOT EXISTS (SELECT 1 FROM public.governance_channels x WHERE x.name=g.n AND x.org_id=(SELECT id FROM public.organizations WHERE slug='iprojectx'));

-- 6d) Demand pipeline
INSERT INTO public.demand_pipeline (org_id, bu_id, idea_name, sponsor, description, estimated_cost, estimated_benefit, estimated_roi, strategic_alignment, complexity, status, submitted_date)
SELECT (SELECT id FROM public.organizations WHERE slug='iprojectx'),
       (SELECT id FROM public.business_units WHERE code=d.bu AND org_id=(SELECT id FROM public.organizations WHERE slug='iprojectx')),
       d.n, d.s, d.desc_, d.cost, d.ben, ROUND((d.ben - d.cost) * 100.0 / d.cost, 1), d.align, d.cplx, d.st, CURRENT_DATE - d.age
FROM (VALUES
  ('TECH','Edge Compute Rollout','Sarah Chen','Deploy edge nodes to 20 sites',900000,2100000,5,3,'Under Review',20),
  ('CUST','Voice-of-Customer AI','Priya Nair','LLM-based feedback analysis',420000,1500000,5,2,'Approved',12),
  ('OPS','Predictive Maintenance','Marco Rossi','IoT + ML for asset uptime',1200000,3200000,4,4,'Under Review',40),
  ('FIN','Real-time FX Hedging','John Wright','Automated FX strategy engine',650000,1800000,4,3,'Backlog',5),
  ('TECH','Green IT Programme','Alex Kim','Datacenter carbon reduction',780000,1400000,3,2,'Under Review',30)
) AS d(bu,n,s,desc_,cost,ben,align,cplx,st,age)
WHERE NOT EXISTS (SELECT 1 FROM public.demand_pipeline x WHERE x.idea_name=d.n AND x.org_id=(SELECT id FROM public.organizations WHERE slug='iprojectx'));

-- =========================================================================
-- 7) Billing: plans + subscription + one paid invoice for iProjectX
-- =========================================================================
INSERT INTO public.billing_plans (code, name, description, price_cents, currency, interval, max_users, max_projects, features, active, sort_order)
VALUES
  ('starter','Starter','For small teams starting out',9900,'USD','month',5,10,'["Core PMO","Email support"]'::jsonb,true,1),
  ('growth','Growth','For growing PMOs',39900,'USD','month',25,50,'["All Starter","Advanced analytics","Priority support"]'::jsonb,true,2),
  ('enterprise','Enterprise','Full portfolio governance',99900,'USD','month',200,500,'["All Growth","SSO","White label","Dedicated CSM"]'::jsonb,true,3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.subscriptions (org_id, plan_id, status, current_period_start, current_period_end)
SELECT (SELECT id FROM public.organizations WHERE slug='iprojectx'),
       (SELECT id FROM public.billing_plans WHERE code='enterprise'),
       'active', date_trunc('month', CURRENT_DATE)::date, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions x WHERE x.org_id=(SELECT id FROM public.organizations WHERE slug='iprojectx'));

INSERT INTO public.invoices (org_id, subscription_id, invoice_number, amount_cents, currency, status, issue_date, due_date, period_start, period_end, notes)
SELECT s.org_id, s.id, 'INV-'||to_char(CURRENT_DATE,'YYYYMM')||'-0001', 99900, 'USD', 'paid',
  CURRENT_DATE - 20, CURRENT_DATE - 6, s.current_period_start, s.current_period_end, 'Enterprise subscription'
FROM public.subscriptions s
WHERE s.org_id=(SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.invoices x WHERE x.subscription_id=s.id);

INSERT INTO public.invoice_payments (invoice_id, amount_cents, currency, paid_at, method, reference)
SELECT i.id, i.amount_cents, i.currency, now() - INTERVAL '5 day', 'card', 'seed-payment'
FROM public.invoices i
JOIN public.subscriptions s ON s.id=i.subscription_id
WHERE s.org_id=(SELECT id FROM public.organizations WHERE slug='iprojectx')
  AND NOT EXISTS (SELECT 1 FROM public.invoice_payments p WHERE p.invoice_id=i.id);

-- =========================================================================
-- 8) Platform-level: expenses + landing_config default row
-- =========================================================================
INSERT INTO public.platform_expenses (category, description, amount_cents, currency, expense_date, vendor, recurring)
VALUES
  ('Infrastructure','Supabase Enterprise',59900,'USD',CURRENT_DATE - 10,'Supabase',true),
  ('Infrastructure','Vercel Pro',20000,'USD',CURRENT_DATE - 10,'Vercel',true),
  ('Tooling','GitHub Enterprise',21000,'USD',CURRENT_DATE - 15,'GitHub',true),
  ('Marketing','Google Ads',80000,'USD',CURRENT_DATE - 5,'Google',false)
ON CONFLICT DO NOTHING;

-- =========================================================================
-- Done. Login:
--   Email:    shailja.kant.kaushik@gmail.com
--   Password: Welcome@2026   (forced change on first login)
-- =========================================================================
