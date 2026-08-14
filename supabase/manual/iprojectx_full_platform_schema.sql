-- iProjectX FULL platform schema (new Supabase project)
-- Generated: 2026-08-14T15:29:42.818Z
-- Source: all files in supabase/migrations/ (75 migrations), in order.
--
-- HOW TO APPLY (new empty Supabase project):
-- 1. Supabase Dashboard → SQL Editor
-- 2. Paste/run this file (or: psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f iprojectx_full_platform_schema.sql)
-- 3. If a statement errors, stop and fix — do not ignore mid-file failures.
--
-- This creates schema/functions/RLS/triggers only (no row data, no auth.users).
-- After schema: import data separately, then point Vercel env at the new project.
--
-- If tables already exist but functions/triggers/policies are missing, use instead:
--   supabase/manual/check_platform_ddl.sql
--   supabase/manual/repair_platform_functions_triggers_policies.sql
--


-- =============================================================================
-- 20260720095542_fe684dfb-a86c-4dee-8677-269ef34d6e6d.sql
-- =============================================================================

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


-- =============================================================================
-- 20260720142651_ea675b15-ef58-490e-bbc1-84ee7dfe5be8.sql
-- =============================================================================

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


-- =============================================================================
-- 20260720154945_bad56956-d8c1-4ad3-b352-910507778ecd.sql
-- =============================================================================

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS brief JSONB NOT NULL DEFAULT '{}'::jsonb;


-- =============================================================================
-- 20260720160157_e35e7e88-c0c4-48a4-ad57-285fb894e0f5.sql
-- =============================================================================

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


-- =============================================================================
-- 20260720161305_80583084-2147-4dac-a3b3-4175b3fbcf09.sql
-- =============================================================================

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


-- =============================================================================
-- 20260720170906_397014ad-185f-4ef0-b550-81761bfdf749.sql
-- =============================================================================

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


-- =============================================================================
-- 20260720173551_6b8aab86-e9f5-4050-865b-12bb5e21abb9.sql
-- =============================================================================

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


-- =============================================================================
-- 20260720175729_db652369-8193-4b5e-9854-f4645cf5c144.sql
-- =============================================================================

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


-- =============================================================================
-- 20260720182224_b6139dec-7ab6-451b-b48f-94836ca6964a.sql
-- =============================================================================

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


-- =============================================================================
-- 20260720183419_b0b07096-1200-4dcc-9176-c729ef5a7394.sql
-- =============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_name TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_color TEXT,
  ADD COLUMN IF NOT EXISTS accent_color TEXT;


-- =============================================================================
-- 20260720183914_d339a828-5500-4290-a403-83b00d137037.sql
-- =============================================================================

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS palette JSONB NOT NULL DEFAULT '[]'::jsonb;
DROP POLICY IF EXISTS "Platform admins can update any organization branding" ON public.organizations;
CREATE POLICY "Platform admins can update any organization branding"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS "Platform admins can view all organizations" ON public.organizations;
CREATE POLICY "Platform admins can view all organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));


-- =============================================================================
-- 20260720184306_b3564da7-a7df-48fa-a725-1d97f96b7dd8.sql
-- =============================================================================

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS fy_start_month smallint NOT NULL DEFAULT 4 CHECK (fy_start_month BETWEEN 1 AND 12);


-- =============================================================================
-- 20260720185715_a9a80e49-6b8d-4760-91d9-7a82f8d12366.sql
-- =============================================================================

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


-- =============================================================================
-- 20260720190943_16e46bed-def4-4d08-9101-3bfd417aadf1.sql
-- =============================================================================

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


-- =============================================================================
-- 20260720193242_86ab4966-ea3c-4aed-935c-d9aae73e7075.sql
-- =============================================================================

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


-- =============================================================================
-- 20260720195543_fbbd6dca-b4e8-471c-b050-203ca74c1b3f.sql
-- =============================================================================

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


-- =============================================================================
-- 20260720203156_78a0313f-14ad-4024-879e-97d4c714a09a.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.landing_config (
  id text PRIMARY KEY DEFAULT 'singleton',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE ON public.landing_config TO anon, authenticated;
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


-- =============================================================================
-- 20260720205726_5d2e27a2-a78b-407c-a197-fd6d7d00f57c.sql
-- =============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;


-- =============================================================================
-- 20260721003000_invoice_template_config.sql
-- =============================================================================

-- Platform-wide invoice template configuration (logo, layout, copy).
CREATE TABLE IF NOT EXISTS public.invoice_template_config (
  id text PRIMARY KEY DEFAULT 'singleton',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE ON public.invoice_template_config TO authenticated;
GRANT ALL ON public.invoice_template_config TO service_role;

ALTER TABLE public.invoice_template_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_template authenticated read" ON public.invoice_template_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "invoice_template platform admin write" ON public.invoice_template_config
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

INSERT INTO public.invoice_template_config (id, config)
VALUES ('singleton', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER trg_invoice_template_config_updated
BEFORE UPDATE ON public.invoice_template_config
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- =============================================================================
-- 20260721004500_fix_landing_invoice_grants.sql
-- =============================================================================

-- Fix: RLS policies alone are not enough — authenticated needs INSERT/UPDATE grants
-- for platform-admin upserts on landing_config and invoice_template_config.

GRANT SELECT, INSERT, UPDATE ON public.landing_config TO anon, authenticated;
GRANT ALL ON public.landing_config TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.invoice_template_config TO authenticated;
GRANT ALL ON public.invoice_template_config TO service_role;

-- Ensure write policies exist (safe to re-run)
DROP POLICY IF EXISTS "landing_config platform admin write" ON public.landing_config;
CREATE POLICY "landing_config platform admin write" ON public.landing_config
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "landing_config public read" ON public.landing_config;
CREATE POLICY "landing_config public read" ON public.landing_config
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "invoice_template platform admin write" ON public.invoice_template_config;
CREATE POLICY "invoice_template platform admin write" ON public.invoice_template_config
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "invoice_template authenticated read" ON public.invoice_template_config;
CREATE POLICY "invoice_template authenticated read" ON public.invoice_template_config
  FOR SELECT TO authenticated USING (true);


-- =============================================================================
-- 20260721020000_decision_approver_notifications.sql
-- =============================================================================

-- Decision approver capability: link a real org user, notify them in-app,
-- and track when approval was requested / completed.

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

-- Stamp approval_requested_at when an approver is assigned for a pending review.
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

-- Notify the assigned approver (SECURITY DEFINER bypasses insert RLS).
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

-- Allow org members to mark their own notifications as read (already covered)
-- and ensure notifications for org realtime can be filtered by org_id.
COMMENT ON COLUMN public.decisions.approver_user_id IS
  'Org user who must approve/reject this decision; receives in-app notification.';


-- =============================================================================
-- 20260721030000_advanced_pmo_work_baselines.sql
-- =============================================================================

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


-- =============================================================================
-- 20260721080000_org_ui_config.sql
-- =============================================================================

-- Org-level UI preferences (navigation sequence, focus defaults, etc.)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ui_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.ui_config IS
  'Org UI prefs: { navigation: NavigationConfig, focus_mode?: boolean }';


-- =============================================================================
-- 20260721090000_role_project_visibility.sql
-- =============================================================================

-- Role-based project / program visibility (org admin config in organizations.ui_config).
-- ui_config.project_visibility.rules[]:
--   { "role": "pm"|"bu_lead"|"executive", "mode": "all"|"programs"|"projects",
--     "programs": ["..."], "project_ids": ["uuid", ...] }
-- No matching rule for a user's roles => full access. Empty rules => legacy (everyone sees all).
-- Admins / platform_admin always see all. Users who can_edit_project also see that project.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ui_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.user_can_view_project(p_user_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_program text;
  v_rules jsonb;
  v_user_roles text[];
  v_matched boolean := false;
  v_rule jsonb;
  v_mode text;
BEGIN
  IF p_user_id IS NULL OR p_project_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.org_id, coalesce(p.program, '')
  INTO v_org_id, v_program
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  -- Platform admins see everything
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.role::text = 'platform_admin'
  ) THEN
    RETURN true;
  END IF;

  -- Must belong to the project's organisation
  IF public.get_user_org(p_user_id) IS DISTINCT FROM v_org_id THEN
    RETURN false;
  END IF;

  -- Org / workspace admins always see all
  IF public.has_any_admin(p_user_id) THEN
    RETURN true;
  END IF;

  -- Anyone authorised to edit the project can view it
  IF public.can_edit_project(p_user_id, p_project_id) THEN
    RETURN true;
  END IF;

  SELECT coalesce(o.ui_config->'project_visibility'->'rules', '[]'::jsonb)
  INTO v_rules
  FROM public.organizations o
  WHERE o.id = v_org_id;

  IF v_rules IS NULL OR jsonb_typeof(v_rules) <> 'array' OR jsonb_array_length(v_rules) = 0 THEN
    RETURN true;
  END IF;

  SELECT coalesce(array_agg(lower(ur.role::text)), ARRAY[]::text[])
  INTO v_user_roles
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id
    AND (ur.org_id = v_org_id OR ur.org_id IS NULL);

  -- Union of access across matching role rules (OR). Unconfigured roles => full access.
  FOR v_rule IN
    SELECT r
    FROM jsonb_array_elements(v_rules) AS r
    WHERE lower(coalesce(r->>'role', '')) = ANY (v_user_roles)
  LOOP
    v_matched := true;
    v_mode := lower(coalesce(v_rule->>'mode', 'all'));

    IF v_mode = 'all' OR v_mode = '' THEN
      RETURN true;
    END IF;

    IF v_mode = 'programs' THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_rule->'programs', '[]'::jsonb)) AS prog(val)
        WHERE lower(trim(prog.val)) = lower(trim(v_program))
          AND trim(v_program) <> ''
      ) THEN
        RETURN true;
      END IF;
    ELSIF v_mode = 'projects' THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_rule->'project_ids', '[]'::jsonb)) AS pid(val)
        WHERE pid.val = p_project_id::text
      ) THEN
        RETURN true;
      END IF;
    ELSE
      RETURN true;
    END IF;
  END LOOP;

  -- No custom rule for this user's roles => default full access
  IF NOT v_matched THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_view_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_view_project(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "projects_read_org" ON public.projects;
CREATE POLICY "projects_read_org"
  ON public.projects FOR SELECT TO authenticated
  USING (public.user_can_view_project(auth.uid(), id));

-- Replace org-wide SELECT policies on project-scoped delivery tables.
-- (Multiple PERMISSIVE SELECT policies OR together and would bypass scoping.)
DO $$
DECLARE
  t text;
  pol record;
  has_org boolean;
  using_expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stage_gates',
    'milestones',
    'risks',
    'issues',
    'actions',
    'decisions',
    'dependencies',
    'change_requests',
    'fy_allocations',
    'financials_monthly',
    'benefits',
    'sprints',
    'resource_allocations',
    'stakeholders',
    'status_updates',
    'lessons_learned',
    'documents',
    'work_items',
    'scenario_projects'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'project_id'
    ) THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id'
    ) INTO has_org;

    -- Drop existing SELECT policies only (keep INSERT/UPDATE/DELETE / FOR ALL write policies)
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND cmd = 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    IF has_org THEN
      -- Nullable project_id rows stay org-scoped; otherwise require project visibility
      using_expr := format(
        '(project_id IS NOT NULL AND public.user_can_view_project(auth.uid(), project_id)) OR (project_id IS NULL AND org_id = public.get_user_org(auth.uid()))'
      );
    ELSE
      using_expr := 'public.user_can_view_project(auth.uid(), project_id)';
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      t || '_read_project_scope',
      t,
      using_expr
    );
  END LOOP;
END $$;


-- =============================================================================
-- 20260721100000_user_role_project_visibility.sql
-- =============================================================================

-- User + role project visibility.
-- organizations.ui_config.project_visibility:
--   rules[]:      { role, mode, programs[], project_ids[] }
--   user_rules[]: { user_id, mode, programs[], project_ids[] }
-- Precedence: admin/platform_admin > can_edit_project > user_rules (if any) > role rules > all.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ui_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.user_can_view_project(p_user_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_program text;
  v_cfg jsonb;
  v_rules jsonb;
  v_user_rules jsonb;
  v_user_rule jsonb;
  v_user_roles text[];
  v_matched boolean := false;
  v_rule jsonb;
  v_mode text;
BEGIN
  IF p_user_id IS NULL OR p_project_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.org_id, coalesce(p.program, '')
  INTO v_org_id, v_program
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.role::text = 'platform_admin'
  ) THEN
    RETURN true;
  END IF;

  IF public.get_user_org(p_user_id) IS DISTINCT FROM v_org_id THEN
    RETURN false;
  END IF;

  IF public.has_any_admin(p_user_id) THEN
    RETURN true;
  END IF;

  IF public.can_edit_project(p_user_id, p_project_id) THEN
    RETURN true;
  END IF;

  SELECT coalesce(o.ui_config->'project_visibility', '{}'::jsonb)
  INTO v_cfg
  FROM public.organizations o
  WHERE o.id = v_org_id;

  v_rules := coalesce(v_cfg->'rules', '[]'::jsonb);
  v_user_rules := coalesce(v_cfg->'user_rules', '[]'::jsonb);

  -- Per-user override wins over role rules when present
  SELECT r
  INTO v_user_rule
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_user_rules) = 'array' THEN v_user_rules ELSE '[]'::jsonb END
  ) AS r
  WHERE r->>'user_id' = p_user_id::text
  LIMIT 1;

  IF v_user_rule IS NOT NULL THEN
    v_mode := lower(coalesce(v_user_rule->>'mode', 'all'));
    IF v_mode = 'all' OR v_mode = '' THEN
      RETURN true;
    END IF;
    IF v_mode = 'programs' THEN
      RETURN EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_user_rule->'programs', '[]'::jsonb)) AS prog(val)
        WHERE lower(trim(prog.val)) = lower(trim(v_program))
          AND trim(v_program) <> ''
      );
    END IF;
    IF v_mode = 'projects' THEN
      RETURN EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_user_rule->'project_ids', '[]'::jsonb)) AS pid(val)
        WHERE pid.val = p_project_id::text
      );
    END IF;
    RETURN true;
  END IF;

  IF v_rules IS NULL OR jsonb_typeof(v_rules) <> 'array' OR jsonb_array_length(v_rules) = 0 THEN
    RETURN true;
  END IF;

  SELECT coalesce(array_agg(lower(ur.role::text)), ARRAY[]::text[])
  INTO v_user_roles
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id
    AND (ur.org_id = v_org_id OR ur.org_id IS NULL);

  FOR v_rule IN
    SELECT r
    FROM jsonb_array_elements(v_rules) AS r
    WHERE lower(coalesce(r->>'role', '')) = ANY (v_user_roles)
  LOOP
    v_matched := true;
    v_mode := lower(coalesce(v_rule->>'mode', 'all'));

    IF v_mode = 'all' OR v_mode = '' THEN
      RETURN true;
    END IF;

    IF v_mode = 'programs' THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_rule->'programs', '[]'::jsonb)) AS prog(val)
        WHERE lower(trim(prog.val)) = lower(trim(v_program))
          AND trim(v_program) <> ''
      ) THEN
        RETURN true;
      END IF;
    ELSIF v_mode = 'projects' THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_rule->'project_ids', '[]'::jsonb)) AS pid(val)
        WHERE pid.val = p_project_id::text
      ) THEN
        RETURN true;
      END IF;
    ELSE
      RETURN true;
    END IF;
  END LOOP;

  IF NOT v_matched THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_view_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_view_project(uuid, uuid) TO authenticated;

-- Ensure projects SELECT uses the function (idempotent if already applied)
DROP POLICY IF EXISTS "projects_read_org" ON public.projects;
CREATE POLICY "projects_read_org"
  ON public.projects FOR SELECT TO authenticated
  USING (public.user_can_view_project(auth.uid(), id));

-- Re-apply scoped SELECT on project-linked tables (idempotent)
DO $$
DECLARE
  t text;
  pol record;
  has_org boolean;
  using_expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stage_gates',
    'milestones',
    'risks',
    'issues',
    'actions',
    'decisions',
    'dependencies',
    'change_requests',
    'fy_allocations',
    'financials_monthly',
    'benefits',
    'sprints',
    'resource_allocations',
    'stakeholders',
    'status_updates',
    'lessons_learned',
    'documents',
    'work_items',
    'scenario_projects'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'project_id'
    ) THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id'
    ) INTO has_org;

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND cmd = 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    IF has_org THEN
      using_expr :=
        '(project_id IS NOT NULL AND public.user_can_view_project(auth.uid(), project_id)) OR (project_id IS NULL AND org_id = public.get_user_org(auth.uid()))';
    ELSE
      using_expr := 'public.user_can_view_project(auth.uid(), project_id)';
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      t || '_read_project_scope',
      t,
      using_expr
    );
  END LOOP;
END $$;


-- =============================================================================
-- 20260721110000_fix_user_roles_unique.sql
-- =============================================================================

-- Fix user_roles uniqueness for org-level roles (bu_id IS NULL).
-- The original UNIQUE (user_id, org_id, role, bu_id) does not reliably
-- dedupe rows when bu_id is NULL, and app upserts that used ON CONFLICT
-- (user_id, role) failed because no such constraint exists.

-- Remove duplicate org-level role rows (keep earliest)
DELETE FROM public.user_roles a
USING public.user_roles b
WHERE a.bu_id IS NULL
  AND b.bu_id IS NULL
  AND a.user_id = b.user_id
  AND a.org_id = b.org_id
  AND a.role = b.role
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_org_role_null_bu_uidx
  ON public.user_roles (user_id, org_id, role)
  WHERE bu_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_org_role_bu_uidx
  ON public.user_roles (user_id, org_id, role, bu_id)
  WHERE bu_id IS NOT NULL;


-- =============================================================================
-- 20260721120000_user_active_admin_management.sql
-- =============================================================================

-- User active/inactive for platform + org admin management.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.is_active IS
  'When false, user cannot access the app. Managed by platform_admin / org admins.';

CREATE INDEX IF NOT EXISTS profiles_org_active_idx
  ON public.profiles (org_id, is_active);

-- Org admins can clear org membership (soft remove without auth delete)
DROP POLICY IF EXISTS "profile_admin_update" ON public.profiles;
CREATE POLICY "profile_admin_update" ON public.profiles FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (
    -- Stay in same org or be cleared by admin
    (org_id = public.get_user_org(auth.uid()) OR org_id IS NULL)
    AND public.has_any_admin(auth.uid())
  );

-- Platform admins can update any profile (active flag, org assignment, etc.)
DROP POLICY IF EXISTS "profile_platform_admin_update" ON public.profiles;
CREATE POLICY "profile_platform_admin_update" ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Platform admins can read all profiles (directory)
DROP POLICY IF EXISTS "profile_platform_admin_read" ON public.profiles;
CREATE POLICY "profile_platform_admin_read" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Platform admins can read all roles
DROP POLICY IF EXISTS "roles_platform_admin_read" ON public.user_roles;
CREATE POLICY "roles_platform_admin_read" ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Platform admins can manage roles across orgs
DROP POLICY IF EXISTS "roles_platform_admin_write" ON public.user_roles;
CREATE POLICY "roles_platform_admin_write" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));


-- =============================================================================
-- 20260721130000_project_purge_notices.sql
-- =============================================================================

-- Closed project purge notices: platform notifies org admins with a grace window;
-- org admins can act; after grace, platform may purge.

CREATE TABLE IF NOT EXISTS public.project_purge_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  initiator_scope text NOT NULL CHECK (initiator_scope IN ('platform', 'org')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'purged', 'cancelled')),
  grace_days integer NOT NULL DEFAULT 14 CHECK (grace_days >= 1 AND grace_days <= 90),
  grace_until timestamptz NOT NULL,
  notified_at timestamptz NOT NULL DEFAULT now(),
  project_count integer NOT NULL DEFAULT 0,
  project_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  message text,
  purged_at timestamptz,
  purged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  purged_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purge_notices_org_status
  ON public.project_purge_notices(org_id, status, grace_until DESC);

CREATE INDEX IF NOT EXISTS idx_purge_notices_status_grace
  ON public.project_purge_notices(status, grace_until);

GRANT SELECT, INSERT, UPDATE ON public.project_purge_notices TO authenticated;
GRANT ALL ON public.project_purge_notices TO service_role;

ALTER TABLE public.project_purge_notices ENABLE ROW LEVEL SECURITY;

-- Platform admins: full access
CREATE POLICY "purge_notices_platform_all"
  ON public.project_purge_notices
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Org admins: read notices for their org
CREATE POLICY "purge_notices_org_select"
  ON public.project_purge_notices
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.has_any_admin(auth.uid())
  );

-- Org admins: create notices for their own org (self-service grace if desired)
CREATE POLICY "purge_notices_org_insert"
  ON public.project_purge_notices
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND public.has_any_admin(auth.uid())
    AND initiator_scope = 'org'
  );

-- Org admins: cancel or mark purged on their org's pending notices
CREATE POLICY "purge_notices_org_update"
  ON public.project_purge_notices
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.has_any_admin(auth.uid())
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND public.has_any_admin(auth.uid())
  );

CREATE OR REPLACE TRIGGER trg_purge_notices_updated
  BEFORE UPDATE ON public.project_purge_notices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Eligibility helper: closed (Completed/Cancelled) and older than 1 year
CREATE OR REPLACE FUNCTION public.project_purge_closed_on(p public.projects)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    p.actual_end_date,
    p.end_date,
    p.planned_end_date,
    (p.updated_at AT TIME ZONE 'UTC')::date
  );
$$;

COMMENT ON TABLE public.project_purge_notices IS
  'Grace-period notices before purging closed projects older than 1 year.';


-- =============================================================================
-- 20260721140000_sync_project_phase_and_schedule.sql
-- =============================================================================

-- Keep project schedule dates and current_phase aligned with planned/actual
-- dates and stage_gates — including Excel import / Data Editor writes.

-- ========== Schedule Start/End = Actual → else Planned ==========
CREATE OR REPLACE FUNCTION public.tg_sync_project_schedule_dates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Seed planned from legacy schedule once, if planned is empty.
  NEW.planned_start_date := COALESCE(NEW.planned_start_date, NEW.start_date);
  NEW.planned_end_date := COALESCE(NEW.planned_end_date, NEW.end_date);

  -- Legacy schedule window used by Gantt / FY / overdue.
  NEW.start_date := COALESCE(NEW.actual_start_date, NEW.planned_start_date, NEW.start_date);
  NEW.end_date := COALESCE(NEW.actual_end_date, NEW.planned_end_date, NEW.end_date);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_sync_schedule ON public.projects;
CREATE TRIGGER trg_projects_sync_schedule
  BEFORE INSERT OR UPDATE OF
    planned_start_date, planned_end_date,
    actual_start_date, actual_end_date,
    start_date, end_date
  ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sync_project_schedule_dates();

-- ========== Resolve current phase from stage gates ==========
CREATE OR REPLACE FUNCTION public.resolve_project_current_phase(p_project_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_phase text;
BEGIN
  -- Prefer first in-flight gate (org definition order, then planned date).
  SELECT g.gate_name INTO v_phase
  FROM public.stage_gates g
  LEFT JOIN public.stage_gate_definitions d
    ON d.org_id = g.org_id
   AND d.gate_name = g.gate_name
   AND COALESCE(d.is_active, true)
  WHERE g.project_id = p_project_id
    AND lower(trim(COALESCE(g.status, 'pending'))) IN (
      'pending', 'in progress', 'in-progress', 'in review', 'open', 'on hold'
    )
  ORDER BY COALESCE(d.sort_order, 9999), g.planned_date NULLS LAST, g.created_at
  LIMIT 1;

  IF v_phase IS NOT NULL THEN
    RETURN v_phase;
  END IF;

  -- Else last approved gate.
  SELECT g.gate_name INTO v_phase
  FROM public.stage_gates g
  LEFT JOIN public.stage_gate_definitions d
    ON d.org_id = g.org_id
   AND d.gate_name = g.gate_name
   AND COALESCE(d.is_active, true)
  WHERE g.project_id = p_project_id
    AND lower(trim(COALESCE(g.status, ''))) = 'approved'
  ORDER BY COALESCE(d.sort_order, -1) DESC, g.planned_date DESC NULLS LAST, g.created_at DESC
  LIMIT 1;

  RETURN v_phase;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_sync_project_phase_from_gates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  phase text;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  IF pid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  phase := public.resolve_project_current_phase(pid);
  IF phase IS NOT NULL THEN
    UPDATE public.projects
       SET current_phase = phase,
           updated_at = now()
     WHERE id = pid
       AND COALESCE(current_phase, '') IS DISTINCT FROM phase;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_stage_gates_sync_phase ON public.stage_gates;
CREATE TRIGGER trg_stage_gates_sync_phase
  AFTER INSERT OR UPDATE OF status, gate_name, planned_date OR DELETE
  ON public.stage_gates
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sync_project_phase_from_gates();

-- ========== One-time backfill ==========
UPDATE public.projects
   SET planned_start_date = COALESCE(planned_start_date, start_date),
       planned_end_date   = COALESCE(planned_end_date, end_date);

UPDATE public.projects
   SET start_date = COALESCE(actual_start_date, planned_start_date, start_date),
       end_date   = COALESCE(actual_end_date, planned_end_date, end_date);

UPDATE public.projects p
   SET current_phase = public.resolve_project_current_phase(p.id),
       updated_at = now()
 WHERE public.resolve_project_current_phase(p.id) IS NOT NULL
   AND COALESCE(p.current_phase, '') IS DISTINCT FROM public.resolve_project_current_phase(p.id);


-- =============================================================================
-- 20260721150000_platform_admin_org_scoped_projects.sql
-- =============================================================================

-- Privacy: platform_admin must not read other organisations' project/portfolio data.
-- They still get full visibility inside their own org (same as org admins).
-- Platform ops (billing, landing config, org directory) stay platform-scoped elsewhere.

CREATE OR REPLACE FUNCTION public.user_can_view_project(p_user_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_program text;
  v_cfg jsonb;
  v_rules jsonb;
  v_user_rules jsonb;
  v_user_rule jsonb;
  v_user_roles text[];
  v_matched boolean := false;
  v_rule jsonb;
  v_mode text;
BEGIN
  IF p_user_id IS NULL OR p_project_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.org_id, coalesce(p.program, '')
  INTO v_org_id, v_program
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  -- Hard tenancy boundary: never cross organisations (includes platform_admin).
  IF public.get_user_org(p_user_id) IS DISTINCT FROM v_org_id THEN
    RETURN false;
  END IF;

  -- Within own org, platform_admin and org admins see the full portfolio.
  IF public.is_platform_admin(p_user_id) OR public.has_any_admin(p_user_id) THEN
    RETURN true;
  END IF;

  IF public.can_edit_project(p_user_id, p_project_id) THEN
    RETURN true;
  END IF;

  SELECT coalesce(o.ui_config->'project_visibility', '{}'::jsonb)
  INTO v_cfg
  FROM public.organizations o
  WHERE o.id = v_org_id;

  v_rules := coalesce(v_cfg->'rules', '[]'::jsonb);
  v_user_rules := coalesce(v_cfg->'user_rules', '[]'::jsonb);

  SELECT r
  INTO v_user_rule
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_user_rules) = 'array' THEN v_user_rules ELSE '[]'::jsonb END
  ) AS r
  WHERE r->>'user_id' = p_user_id::text
  LIMIT 1;

  IF v_user_rule IS NOT NULL THEN
    v_mode := lower(coalesce(v_user_rule->>'mode', 'all'));
    IF v_mode = 'all' OR v_mode = '' THEN
      RETURN true;
    END IF;
    IF v_mode = 'programs' THEN
      RETURN EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_user_rule->'programs', '[]'::jsonb)) AS prog(val)
        WHERE lower(trim(prog.val)) = lower(trim(v_program))
          AND trim(v_program) <> ''
      );
    END IF;
    IF v_mode = 'projects' THEN
      RETURN EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_user_rule->'project_ids', '[]'::jsonb)) AS pid(val)
        WHERE pid.val = p_project_id::text
      );
    END IF;
    RETURN true;
  END IF;

  IF v_rules IS NULL OR jsonb_typeof(v_rules) <> 'array' OR jsonb_array_length(v_rules) = 0 THEN
    RETURN true;
  END IF;

  SELECT coalesce(array_agg(lower(ur.role::text)), ARRAY[]::text[])
  INTO v_user_roles
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id
    AND (ur.org_id = v_org_id OR ur.org_id IS NULL);

  FOR v_rule IN
    SELECT r
    FROM jsonb_array_elements(v_rules) AS r
    WHERE lower(coalesce(r->>'role', '')) = ANY (v_user_roles)
  LOOP
    v_matched := true;
    v_mode := lower(coalesce(v_rule->>'mode', 'all'));

    IF v_mode = 'all' OR v_mode = '' THEN
      RETURN true;
    END IF;

    IF v_mode = 'programs' THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_rule->'programs', '[]'::jsonb)) AS prog(val)
        WHERE lower(trim(prog.val)) = lower(trim(v_program))
          AND trim(v_program) <> ''
      ) THEN
        RETURN true;
      END IF;
    ELSIF v_mode = 'projects' THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_rule->'project_ids', '[]'::jsonb)) AS pid(val)
        WHERE pid.val = p_project_id::text
      ) THEN
        RETURN true;
      END IF;
    ELSE
      RETURN true;
    END IF;
  END LOOP;

  IF NOT v_matched THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.user_can_view_project(uuid, uuid) IS
  'Org-tenant project visibility. Platform admins are scoped to their own organisation; they do not see other orgs'' portfolio data.';


-- =============================================================================
-- 20260721160000_fy_forecast_and_project_fac.sql
-- =============================================================================

-- Canonical finance columns for FY budget vs forecast and project FAC.
-- Safe to re-run.

ALTER TABLE public.fy_allocations
  ADD COLUMN IF NOT EXISTS budget NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast NUMERIC(14,2) DEFAULT 0;

COMMENT ON COLUMN public.fy_allocations.budget IS
  'Total budget $ allocated to this FY (source of truth for Budget vs Forecast charts).';
COMMENT ON COLUMN public.fy_allocations.forecast IS
  'Total forecast $ allocated to this FY.';
COMMENT ON COLUMN public.fy_allocations.capex IS
  'CapEx portion of the FY budget split (detail).';
COMMENT ON COLUMN public.fy_allocations.opex IS
  'OpEx portion of the FY budget split (detail).';

-- Backfill budget/forecast from legacy capex+opex where new columns are empty.
UPDATE public.fy_allocations
SET
  budget = COALESCE(NULLIF(budget, 0), COALESCE(capex, 0) + COALESCE(opex, 0)),
  forecast = COALESCE(NULLIF(forecast, 0), COALESCE(capex, 0) + COALESCE(opex, 0))
WHERE COALESCE(budget, 0) = 0
   OR COALESCE(forecast, 0) = 0;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS forecast_at_completion NUMERIC(14,2) DEFAULT 0;

COMMENT ON COLUMN public.projects.forecast_at_completion IS
  'Forecast at completion (FAC). When 0/null, app uses CapEx+OpEx approved or budget.';

-- Backfill FAC from approved mix when empty.
UPDATE public.projects
SET forecast_at_completion = COALESCE(capex_approved, 0) + COALESCE(opex_approved, 0)
WHERE COALESCE(forecast_at_completion, 0) = 0
  AND (COALESCE(capex_approved, 0) + COALESCE(opex_approved, 0)) > 0;


-- =============================================================================
-- 20260722090000_sync_milestones_from_stage_gates.sql
-- =============================================================================

-- Stage gates are the governance source of truth. Mirror each gate into a
-- linked milestone so timeline / executive milestone views stay populated.
-- Manual (add-on) milestones remain allowed with stage_gate_id NULL.

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'milestones_stage_gate_id_key'
      AND conrelid = 'public.milestones'::regclass
  ) THEN
    ALTER TABLE public.milestones
      ADD CONSTRAINT milestones_stage_gate_id_key UNIQUE (stage_gate_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.map_gate_status_to_milestone(p_status text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text := lower(trim(COALESCE(p_status, 'pending')));
BEGIN
  IF s IN ('approved', 'complete', 'completed', 'passed') THEN
    RETURN 'Completed';
  ELSIF s IN ('in review', 'in progress', 'in-progress', 'open') THEN
    RETURN 'In Progress';
  ELSIF s IN ('on hold') THEN
    RETURN 'On Hold';
  ELSIF s IN ('rejected', 'cancelled', 'canceled') THEN
    RETURN 'Cancelled';
  ELSE
    RETURN 'Not Started';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_sync_milestone_from_stage_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_notes text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- CASCADE on stage_gate_id handles linked rows; nothing else to do.
    RETURN OLD;
  END IF;

  v_status := public.map_gate_status_to_milestone(NEW.status);
  v_notes := CASE
    WHEN NEW.notes IS NULL OR btrim(NEW.notes) = '' THEN 'Synced from stage gate'
    ELSE NEW.notes
  END;

  INSERT INTO public.milestones (
    org_id,
    project_id,
    stage_gate_id,
    name,
    planned_date,
    actual_date,
    status,
    owner,
    notes
  )
  VALUES (
    NEW.org_id,
    NEW.project_id,
    NEW.id,
    NEW.gate_name,
    NEW.planned_date,
    NEW.actual_date,
    v_status,
    NEW.approver,
    v_notes
  )
  ON CONFLICT (stage_gate_id)
  DO UPDATE SET
    name = EXCLUDED.name,
    planned_date = EXCLUDED.planned_date,
    actual_date = EXCLUDED.actual_date,
    status = EXCLUDED.status,
    owner = COALESCE(EXCLUDED.owner, public.milestones.owner),
    notes = CASE
      WHEN public.milestones.notes IS NULL
        OR btrim(public.milestones.notes) = ''
        OR public.milestones.notes = 'Synced from stage gate'
      THEN EXCLUDED.notes
      ELSE public.milestones.notes
    END,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stage_gates_sync_milestone ON public.stage_gates;
CREATE TRIGGER trg_stage_gates_sync_milestone
  AFTER INSERT OR UPDATE OF gate_name, planned_date, actual_date, status, approver, notes, project_id, org_id
  ON public.stage_gates
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sync_milestone_from_stage_gate();

-- Quiet auto-creates from gates; still announce meaningful completion changes.
CREATE OR REPLACE FUNCTION public.tg_milestone_to_status_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  proj_name text;
  msg text;
  is_new_complete boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Gate-linked milestones are system-mirrored; skip the "added" feed noise.
    IF NEW.stage_gate_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
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

-- Link existing same-name milestones, then create any missing gate mirrors.
UPDATE public.milestones m
SET stage_gate_id = g.id
FROM public.stage_gates g
WHERE m.stage_gate_id IS NULL
  AND m.project_id = g.project_id
  AND lower(trim(m.name)) = lower(trim(g.gate_name))
  AND NOT EXISTS (
    SELECT 1 FROM public.milestones x
    WHERE x.stage_gate_id = g.id
  );

INSERT INTO public.milestones (
  org_id, project_id, stage_gate_id, name, planned_date, actual_date, status, owner, notes
)
SELECT
  g.org_id,
  g.project_id,
  g.id,
  g.gate_name,
  g.planned_date,
  g.actual_date,
  public.map_gate_status_to_milestone(g.status),
  g.approver,
  COALESCE(NULLIF(btrim(g.notes), ''), 'Synced from stage gate')
FROM public.stage_gates g
WHERE NOT EXISTS (
  SELECT 1 FROM public.milestones m WHERE m.stage_gate_id = g.id
);


-- =============================================================================
-- 20260724120000_project_streams.sql
-- =============================================================================

-- Project streams: optional delivery lanes under a project.
-- When projects.streams_enabled, streams own dates/gates/finance/allocations;
-- the project row is the rollup. Enabling creates a default "Core" stream and
-- re-points existing child rows onto it.

-- ========== projects flag ==========
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS streams_enabled boolean NOT NULL DEFAULT false;

-- ========== project_streams ==========
CREATE TABLE IF NOT EXISTS public.project_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  description text,
  owner text,
  status text DEFAULT 'Active',
  rag text,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  budget numeric DEFAULT 0,
  capex_approved numeric DEFAULT 0,
  capex_incurred numeric DEFAULT 0,
  opex_approved numeric DEFAULT 0,
  opex_incurred numeric DEFAULT 0,
  forecast_at_completion numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS project_streams_project_idx ON public.project_streams (project_id);
CREATE INDEX IF NOT EXISTS project_streams_org_idx ON public.project_streams (org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_streams TO authenticated;
GRANT ALL ON public.project_streams TO service_role;
ALTER TABLE public.project_streams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read project_streams" ON public.project_streams;
CREATE POLICY "org read project_streams" ON public.project_streams
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "editors modify project_streams" ON public.project_streams;
CREATE POLICY "editors modify project_streams" ON public.project_streams
  FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id))
  WITH CHECK (public.can_edit_project(auth.uid(), project_id));

DROP TRIGGER IF EXISTS trg_project_streams_updated ON public.project_streams;
CREATE TRIGGER trg_project_streams_updated
  BEFORE UPDATE ON public.project_streams
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Only one default stream per project
CREATE UNIQUE INDEX IF NOT EXISTS project_streams_one_default_uidx
  ON public.project_streams (project_id)
  WHERE is_default;

-- ========== stream_id on child tables ==========
ALTER TABLE public.stage_gates
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE CASCADE;

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE CASCADE;

ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE CASCADE;

ALTER TABLE public.fy_allocations
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE CASCADE;

ALTER TABLE public.resource_allocations
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS stage_gates_stream_idx ON public.stage_gates (stream_id);
CREATE INDEX IF NOT EXISTS milestones_stream_idx ON public.milestones (stream_id);
CREATE INDEX IF NOT EXISTS financials_monthly_stream_idx ON public.financials_monthly (stream_id);
CREATE INDEX IF NOT EXISTS fy_allocations_stream_idx ON public.fy_allocations (stream_id);
CREATE INDEX IF NOT EXISTS resource_allocations_stream_idx ON public.resource_allocations (stream_id);

-- Replace project-only uniques with stream-aware uniques
ALTER TABLE public.financials_monthly DROP CONSTRAINT IF EXISTS financials_monthly_project_id_period_month_key;
CREATE UNIQUE INDEX IF NOT EXISTS financials_monthly_project_null_stream_period_uidx
  ON public.financials_monthly (project_id, period_month)
  WHERE stream_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS financials_monthly_project_stream_period_uidx
  ON public.financials_monthly (project_id, stream_id, period_month)
  WHERE stream_id IS NOT NULL;

ALTER TABLE public.fy_allocations DROP CONSTRAINT IF EXISTS fy_allocations_project_id_fy_key;
CREATE UNIQUE INDEX IF NOT EXISTS fy_allocations_project_null_stream_fy_uidx
  ON public.fy_allocations (project_id, fy)
  WHERE stream_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fy_allocations_project_stream_fy_uidx
  ON public.fy_allocations (project_id, stream_id, fy)
  WHERE stream_id IS NOT NULL;

ALTER TABLE public.resource_allocations DROP CONSTRAINT IF EXISTS resource_allocations_project_id_resource_id_period_month_key;
CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_null_stream_uidx
  ON public.resource_allocations (project_id, resource_id, period_month)
  WHERE stream_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_stream_uidx
  ON public.resource_allocations (project_id, stream_id, resource_id, period_month)
  WHERE stream_id IS NOT NULL;

-- ========== Enable streams: create Core + migrate children ==========
CREATE OR REPLACE FUNCTION public.enable_project_streams(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_stream uuid;
  v_proj public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  v_org := v_proj.org_id;
  IF v_org IS DISTINCT FROM public.get_user_org(auth.uid())
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to enable streams for this project';
  END IF;

  -- Already enabled: return default stream
  IF v_proj.streams_enabled THEN
    SELECT id INTO v_stream
    FROM public.project_streams
    WHERE project_id = p_project_id AND is_default
    LIMIT 1;
    IF v_stream IS NOT NULL THEN
      RETURN v_stream;
    END IF;
  END IF;

  INSERT INTO public.project_streams (
    org_id, project_id, name, code, is_default, sort_order, status, rag, owner,
    planned_start_date, planned_end_date, actual_start_date, actual_end_date,
    budget, capex_approved, capex_incurred, opex_approved, opex_incurred,
    forecast_at_completion
  )
  VALUES (
    v_org, p_project_id, 'Core', 'CORE', true, 0,
    COALESCE(v_proj.status::text, 'In Progress'), v_proj.rag, v_proj.sponsor,
    COALESCE(v_proj.planned_start_date, v_proj.start_date),
    COALESCE(v_proj.planned_end_date, v_proj.end_date),
    v_proj.actual_start_date, v_proj.actual_end_date,
    COALESCE(v_proj.budget, 0),
    COALESCE(v_proj.capex_approved, 0), COALESCE(v_proj.capex_incurred, 0),
    COALESCE(v_proj.opex_approved, 0), COALESCE(v_proj.opex_incurred, 0),
    v_proj.forecast_at_completion
  )
  ON CONFLICT (project_id, name) DO UPDATE
    SET is_default = true,
        updated_at = now()
  RETURNING id INTO v_stream;

  UPDATE public.stage_gates SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.milestones SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.financials_monthly SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.fy_allocations SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.resource_allocations SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;

  UPDATE public.projects
     SET streams_enabled = true, updated_at = now()
   WHERE id = p_project_id;

  RETURN v_stream;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enable_project_streams(uuid) TO authenticated;

-- ========== Roll project schedule + finance from streams ==========
CREATE OR REPLACE FUNCTION public.rollup_project_from_streams(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT streams_enabled INTO v_enabled FROM public.projects WHERE id = p_project_id;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN;
  END IF;

  UPDATE public.projects p SET
    planned_start_date = s.min_ps,
    planned_end_date   = s.max_pe,
    actual_start_date  = s.min_as,
    actual_end_date    = s.max_ae,
    start_date = COALESCE(s.min_as, s.min_ps, p.start_date),
    end_date   = COALESCE(s.max_ae, s.max_pe, p.end_date),
    budget = COALESCE(s.sum_budget, 0),
    capex_approved = COALESCE(s.sum_capex_a, 0),
    capex_incurred = COALESCE(s.sum_capex_i, 0),
    opex_approved = COALESCE(s.sum_opex_a, 0),
    opex_incurred = COALESCE(s.sum_opex_i, 0),
    forecast_at_completion = s.sum_fac,
    updated_at = now()
  FROM (
    SELECT
      project_id,
      MIN(planned_start_date) AS min_ps,
      MAX(planned_end_date)   AS max_pe,
      MIN(actual_start_date)  AS min_as,
      MAX(actual_end_date)    AS max_ae,
      SUM(COALESCE(budget, 0)) AS sum_budget,
      SUM(COALESCE(capex_approved, 0)) AS sum_capex_a,
      SUM(COALESCE(capex_incurred, 0)) AS sum_capex_i,
      SUM(COALESCE(opex_approved, 0)) AS sum_opex_a,
      SUM(COALESCE(opex_incurred, 0)) AS sum_opex_i,
      SUM(COALESCE(forecast_at_completion, budget, 0)) AS sum_fac
    FROM public.project_streams
    WHERE project_id = p_project_id
    GROUP BY project_id
  ) s
  WHERE p.id = s.project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_rollup_project_from_streams()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  IF pid IS NOT NULL THEN
    PERFORM public.rollup_project_from_streams(pid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_project_streams_rollup ON public.project_streams;
CREATE TRIGGER trg_project_streams_rollup
  AFTER INSERT OR UPDATE OR DELETE ON public.project_streams
  FOR EACH ROW EXECUTE FUNCTION public.tg_rollup_project_from_streams();


-- =============================================================================
-- 20260724140000_always_on_core_streams.sql
-- =============================================================================

-- Always-on Core stream: every project has at least one delivery stream.
-- Project row remains the rollup (dates + finance); timelines default to stream
-- lanes, with an optional project rollup lane in the UI.

ALTER TABLE public.projects
  ALTER COLUMN streams_enabled SET DEFAULT true;

-- Internal ensure: create Core, migrate null-stream children, enable flag.
-- Used by INSERT trigger and backfill (no end-user auth check).
CREATE OR REPLACE FUNCTION public.ensure_project_core_stream(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_stream uuid;
  v_proj public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  v_org := v_proj.org_id;

  SELECT id INTO v_stream
  FROM public.project_streams
  WHERE project_id = p_project_id AND is_default
  LIMIT 1;

  IF v_stream IS NULL THEN
    INSERT INTO public.project_streams (
      org_id, project_id, name, code, is_default, sort_order, status, rag, owner,
      planned_start_date, planned_end_date, actual_start_date, actual_end_date,
      budget, capex_approved, capex_incurred, opex_approved, opex_incurred,
      forecast_at_completion
    )
    VALUES (
      v_org, p_project_id, 'Core', 'CORE', true, 0,
      COALESCE(v_proj.status::text, 'In Progress'), v_proj.rag, v_proj.sponsor,
      COALESCE(v_proj.planned_start_date, v_proj.start_date),
      COALESCE(v_proj.planned_end_date, v_proj.end_date),
      v_proj.actual_start_date, v_proj.actual_end_date,
      COALESCE(v_proj.budget, 0),
      COALESCE(v_proj.capex_approved, 0), COALESCE(v_proj.capex_incurred, 0),
      COALESCE(v_proj.opex_approved, 0), COALESCE(v_proj.opex_incurred, 0),
      v_proj.forecast_at_completion
    )
    ON CONFLICT (project_id, name) DO UPDATE
      SET is_default = true,
          updated_at = now()
    RETURNING id INTO v_stream;
  END IF;

  UPDATE public.stage_gates SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.milestones SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.financials_monthly SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.fy_allocations SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.resource_allocations SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;

  UPDATE public.projects
     SET streams_enabled = true, updated_at = now()
   WHERE id = p_project_id
     AND (NOT streams_enabled OR streams_enabled IS DISTINCT FROM true);

  RETURN v_stream;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_project_core_stream(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_project_core_stream(uuid) TO service_role;

-- Public RPC keeps org auth; delegates to ensure.
CREATE OR REPLACE FUNCTION public.enable_project_streams(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proj public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  IF v_proj.org_id IS DISTINCT FROM public.get_user_org(auth.uid())
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to enable streams for this project';
  END IF;
  RETURN public.ensure_project_core_stream(p_project_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_ensure_project_core_stream()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_project_core_stream(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_ensure_core_stream ON public.projects;
CREATE TRIGGER trg_projects_ensure_core_stream
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_ensure_project_core_stream();

-- Backfill existing projects
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.id
    FROM public.projects p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.project_streams s
      WHERE s.project_id = p.id AND s.is_default
    )
  LOOP
    PERFORM public.ensure_project_core_stream(r.id);
  END LOOP;

  UPDATE public.projects SET streams_enabled = true WHERE NOT streams_enabled;
END;
$$;

-- Rollup whenever streams exist (not only when flag is set)
CREATE OR REPLACE FUNCTION public.rollup_project_from_streams(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_streams WHERE project_id = p_project_id
  ) THEN
    RETURN;
  END IF;

  UPDATE public.projects p SET
    planned_start_date = s.min_ps,
    planned_end_date   = s.max_pe,
    actual_start_date  = s.min_as,
    actual_end_date    = s.max_ae,
    start_date = COALESCE(s.min_as, s.min_ps, p.start_date),
    end_date   = COALESCE(s.max_ae, s.max_pe, p.end_date),
    budget = COALESCE(s.sum_budget, 0),
    capex_approved = COALESCE(s.sum_capex_a, 0),
    capex_incurred = COALESCE(s.sum_capex_i, 0),
    opex_approved = COALESCE(s.sum_opex_a, 0),
    opex_incurred = COALESCE(s.sum_opex_i, 0),
    forecast_at_completion = s.sum_fac,
    updated_at = now()
  FROM (
    SELECT
      project_id,
      MIN(planned_start_date) AS min_ps,
      MAX(planned_end_date)   AS max_pe,
      MIN(actual_start_date)  AS min_as,
      MAX(actual_end_date)    AS max_ae,
      SUM(COALESCE(budget, 0)) AS sum_budget,
      SUM(COALESCE(capex_approved, 0)) AS sum_capex_a,
      SUM(COALESCE(capex_incurred, 0)) AS sum_capex_i,
      SUM(COALESCE(opex_approved, 0)) AS sum_opex_a,
      SUM(COALESCE(opex_incurred, 0)) AS sum_opex_i,
      SUM(COALESCE(forecast_at_completion, budget, 0)) AS sum_fac
    FROM public.project_streams
    WHERE project_id = p_project_id
    GROUP BY project_id
  ) s
  WHERE p.id = s.project_id;
END;
$$;

-- Re-rollup all projects that have streams (refresh PvA on project rows)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT project_id AS id FROM public.project_streams
  LOOP
    PERFORM public.rollup_project_from_streams(r.id);
  END LOOP;
END;
$$;


-- =============================================================================
-- 20260724180000_eoi_and_licenses_policies.sql
-- =============================================================================

-- ============================================================
-- A) Expression of Interest (eoi_requests)
-- B) License Certificates (org_license_certificates)
-- C) Legal Policies (legal_policies)
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- A) EOI requests
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.eoi_requests (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  full_name        text        NOT NULL,
  email            text        NOT NULL,
  organization_name text,
  phone            text,
  job_title        text,
  company_size     text,
  interest_areas   text,
  message          text,
  status           text        NOT NULL DEFAULT 'New',
  notes            text,
  source           text        NOT NULL DEFAULT 'landing',
  CONSTRAINT eoi_status_check CHECK (status IN ('New','Contacted','Qualified','Closed'))
);

ALTER TABLE public.eoi_requests ENABLE ROW LEVEL SECURITY;

-- Anon + authenticated can INSERT (submit from landing page without login)
CREATE POLICY "eoi_insert_public"
  ON public.eoi_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only platform admins can SELECT
CREATE POLICY "eoi_select_platform_admin"
  ON public.eoi_requests FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Only platform admins can UPDATE (e.g. change status, add notes)
CREATE POLICY "eoi_update_platform_admin"
  ON public.eoi_requests FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- ──────────────────────────────────────────────────────────
-- B) Org license certificates
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_license_certificates (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  org_id             uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  certificate_number text        NOT NULL UNIQUE,
  issued_at          date        NOT NULL DEFAULT CURRENT_DATE,
  expires_at         date,
  plan_code          text,
  seats              int         NOT NULL DEFAULT 1,
  status             text        NOT NULL DEFAULT 'Active',
  pdf_meta           jsonb       NOT NULL DEFAULT '{}',
  issued_by          text,
  CONSTRAINT cert_status_check CHECK (status IN ('Active','Revoked','Expired'))
);

ALTER TABLE public.org_license_certificates ENABLE ROW LEVEL SECURITY;

-- Platform admins can do everything
CREATE POLICY "cert_platform_admin_all"
  ON public.org_license_certificates FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Org admins can read their own org's certificates
CREATE POLICY "cert_org_admin_select"
  ON public.org_license_certificates FOR SELECT
  TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id  = public.get_user_org(auth.uid())
        AND ur.role::text IN ('admin','org_admin')
    )
  );

-- ──────────────────────────────────────────────────────────
-- C) Legal policies
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.legal_policies (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text        NOT NULL UNIQUE,
  title         text        NOT NULL,
  category      text        NOT NULL DEFAULT 'Legal',
  body_markdown text        NOT NULL DEFAULT '',
  sort_order    int         NOT NULL DEFAULT 0,
  published     boolean     NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.legal_policies ENABLE ROW LEVEL SECURITY;

-- Platform admins manage policies
CREATE POLICY "policies_platform_admin_all"
  ON public.legal_policies FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- All authenticated users (and anon) can read published policies
CREATE POLICY "policies_public_select"
  ON public.legal_policies FOR SELECT
  TO anon, authenticated
  USING (published = true);

-- ──────────────────────────────────────────────────────────
-- Seed legal_policies with placeholder drafts
-- ──────────────────────────────────────────────────────────
INSERT INTO public.legal_policies (slug, title, category, sort_order, published, body_markdown) VALUES
-- Legal
('privacy-policy',         'Privacy Policy',                       'Legal',                      10, true,
'# Privacy Policy

*Last updated: [Date]*

## 1. Introduction
[Organization Name] ("we", "us", "our") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information.

## 2. Information We Collect
- **Account information**: name, email address, organization name
- **Usage data**: pages visited, features used, session duration
- **Technical data**: IP address, browser type, device identifiers

## 3. How We Use Your Information
We use collected information to provide, maintain, and improve our services, communicate with you, and comply with legal obligations.

## 4. Data Sharing
We do not sell your personal data. We may share data with trusted service providers under strict confidentiality agreements.

## 5. Your Rights
Depending on your jurisdiction you may have rights to access, correct, delete, or port your personal data. Contact us at [privacy@example.com].

## 6. Contact
[Organization Name], [Address]. Email: [privacy@example.com]
'),

('terms-of-service',       'Terms of Service',                     'Legal',                      20, true,
'# Terms of Service

*Last updated: [Date]*

## 1. Acceptance
By accessing or using our platform you agree to these Terms. If you do not agree, do not use the service.

## 2. License
We grant you a limited, non-exclusive, non-transferable licence to use the platform for your internal business purposes.

## 3. Prohibited Uses
You may not: reverse-engineer the platform; use it for unlawful purposes; resell or sublicense access without written consent.

## 4. Termination
Either party may terminate with [30] days written notice. We may suspend immediately for material breach.

## 5. Limitation of Liability
To the maximum extent permitted by law, our total liability shall not exceed the fees paid in the 12 months preceding the claim.

## 6. Governing Law
These Terms are governed by the laws of [Jurisdiction].
'),

('cookie-policy',          'Cookie Policy',                        'Legal',                      30, true,
'# Cookie Policy

*Last updated: [Date]*

## What Are Cookies?
Cookies are small text files stored on your device when you visit our platform.

## Cookies We Use
| Category       | Purpose                                 | Duration |
|----------------|-----------------------------------------|----------|
| Essential       | Authentication, security, session state | Session  |
| Analytics       | Usage statistics (anonymised)           | 12 months|
| Preferences     | UI settings, theme, language            | 12 months|

## Managing Cookies
You may disable cookies through your browser settings; this may affect platform functionality.

## Contact
[privacy@example.com]
'),

('acceptable-use',         'Acceptable Use Policy',                'Legal',                      40, true,
'# Acceptable Use Policy

*Last updated: [Date]*

## Overview
This policy governs how you may use our platform. Violations may result in suspension or termination.

## Prohibited Activities
- Uploading malicious code or interfering with platform integrity
- Attempting to gain unauthorized access to other accounts or systems
- Using the platform to send spam or conduct phishing
- Violating any applicable law or regulation

## Reporting Violations
Report violations to [security@example.com].
'),

('refund-cancellation',    'Refund & Cancellation Policy',         'Legal',                      50, true,
'# Refund & Cancellation Policy

*Last updated: [Date]*

## Cancellations
You may cancel your subscription at any time. Access continues until the end of the current billing period.

## Refunds
Fees paid are generally non-refundable. Exceptions may be granted at our discretion for:
- Platform outages exceeding our SLA commitments
- Billing errors on our part

## How to Cancel
Contact [billing@example.com] or use the self-service option in your account settings.
'),

-- Security & Compliance
('information-security',   'Information Security Policy',          'Security & Compliance',      10, true,
'# Information Security Policy

*Last updated: [Date]*

## Commitment
We implement industry-standard security controls to protect customer data.

## Key Controls
- **Encryption**: data encrypted in transit (TLS 1.2+) and at rest (AES-256)
- **Access control**: least-privilege, MFA for admin access
- **Vulnerability management**: regular scanning and patching cycles
- **Penetration testing**: annual third-party tests

## Reporting Security Issues
Responsible disclosure: [security@example.com]
'),

('data-processing-agreement', 'Data Processing Agreement',        'Security & Compliance',      20, true,
'# Data Processing Agreement (DPA)

*Last updated: [Date]*

This DPA forms part of the Master Services Agreement between [Organization Name] (Processor) and the Customer (Controller).

## 1. Scope
We process personal data solely to deliver the contracted services.

## 2. Sub-processors
A current list of approved sub-processors is available on request.

## 3. Data Subject Rights
We assist Customers in responding to data subject requests within [30] days.

## 4. Security Measures
See our Information Security Policy.

## 5. Breach Notification
We notify Customers of personal data breaches within [72] hours of becoming aware.
'),

('data-retention',         'Data Retention Policy',                'Security & Compliance',      30, true,
'# Data Retention Policy

*Last updated: [Date]*

## Retention Periods
| Data Category        | Retention Period      | Basis                |
|----------------------|-----------------------|----------------------|
| Account data         | Duration of contract + 7 years | Legal/audit |
| Project records      | Duration of contract + 3 years | Contractual  |
| Audit logs           | 2 years               | Security             |
| Support tickets      | 3 years               | Service improvement  |
| Anonymised analytics | Indefinite            | Aggregated only      |

## Deletion
Upon contract termination, customer data is purged within [90] days unless retention is required by law.
'),

('incident-response',      'Incident Response Policy',             'Security & Compliance',      40, true,
'# Incident Response Policy

*Last updated: [Date]*

## Classification
| Severity | Description                                | Response Time |
|----------|--------------------------------------------|---------------|
| P1       | Service unavailable, data breach suspected | 1 hour        |
| P2       | Significant feature degradation            | 4 hours       |
| P3       | Minor functionality issue                  | 1 business day|

## Process
1. Detection & triage
2. Containment
3. Eradication & recovery
4. Post-incident review
5. Customer notification (per SLA / DPA obligations)

## Contact
[security@example.com]
'),

-- Customer Information
('about',                  'About Us',                             'Customer Information',       10, true,
'# About Us

[Organization Name] provides an enterprise PMO command centre platform that helps organisations govern their project portfolios with live dashboards, financial controls, and RAID governance.

## Our Mission
To give every PMO the single, immutable source of truth they need to deliver strategic value consistently.

## Contact
- General enquiries: [hello@example.com]
- Support: [support@example.com]
- LinkedIn / Twitter: [links]
'),

('pricing-plans',          'Pricing & Plans',                      'Customer Information',       20, true,
'# Pricing & Plans

*Current as at [Date]*

Our plans are designed for teams of all sizes. All plans include core PMO features; higher tiers unlock advanced analytics, API access, and white-labelling.

Please contact us for current pricing or use the pricing page in the platform.

## Enterprise
Custom pricing for large organisations with dedicated onboarding and a named customer success manager.

Contact [sales@example.com] for a quote.
'),

('sla',                    'Service Level Agreement (SLA)',         'Customer Information',       30, true,
'# Service Level Agreement

*Last updated: [Date]*

## Uptime Commitment
We target **99.5% monthly uptime** for the production environment.

## Exclusions
Scheduled maintenance (notified ≥ 48 h in advance) is excluded from uptime calculations.

## Credits
| Monthly uptime | Credit      |
|----------------|-------------|
| 99.0 – 99.5%   | 5% of MRR   |
| 95.0 – 99.0%   | 10% of MRR  |
| < 95.0%        | 25% of MRR  |

Credits are applied to the next invoice. Contact [support@example.com] within [30] days of the incident.
'),

('support-help',           'Support & Help Centre',                'Customer Information',       40, true,
'# Support & Help Centre

*Last updated: [Date]*

## Getting Help
- **In-app help**: use the "?" icon for context-sensitive guidance
- **Email support**: [support@example.com] (response within 1 business day on Business plan; 4 hours on Enterprise)
- **Documentation**: [docs.example.com]

## Scope of Support
Support covers platform usage questions, bug reports, and account management. Consulting and custom development are out of scope for standard support.
'),

('system-status',          'System Status',                        'Customer Information',       50, true,
'# System Status

*Last updated: [Date]*

Visit our live status page at [status.example.com] for real-time uptime, incident history, and scheduled maintenance notices.

## Subscribe to Updates
Sign up for email or webhook notifications on the status page.
'),

-- Notices
('customer-responsibilities', 'Customer Responsibilities',         'Notices',                    10, true,
'# Customer Responsibilities

*Last updated: [Date]*

## Your Obligations
As a customer you agree to:

- Maintain accurate account information
- Keep login credentials confidential and notify us immediately of any suspected breach
- Ensure users of your account comply with our Acceptable Use Policy
- Not exceed the seat limits of your licence
- Provide reasonable cooperation for security reviews or audits upon request
'),

('ai-usage-disclosure',    'AI Usage Disclosure',                  'Notices',                    20, true,
'# AI Usage Disclosure

*Last updated: [Date]*

## AI Features
Our platform includes AI-assisted features (e.g. AI Assist, narrative generation) powered by third-party large-language model providers.

## Data Handling
Prompts and generated outputs may be processed by our AI provider under their data processing terms. We configure our providers to opt out of training on customer data where available.

## Human Oversight
AI-generated content is advisory only. You are responsible for reviewing and validating any AI output before acting on it.

## Providers
Current AI sub-processors: [list provider(s) and link to their privacy policies].
'),

('disclaimer',             'Disclaimer',                           'Notices',                    30, true,
'# Disclaimer

*Last updated: [Date]*

The information provided within the platform and associated documentation is for general informational purposes only. It does not constitute legal, financial, or professional advice.

While we strive for accuracy, we make no warranties or representations regarding the completeness or accuracy of information. Use of the platform is at your own risk.
'),

('contact-complaints',     'Contact & Complaints',                 'Notices',                    40, true,
'# Contact & Complaints

*Last updated: [Date]*

## General Contact
- Email: [hello@example.com]
- Address: [Physical address]

## Support
[support@example.com]

## Privacy & Data
[privacy@example.com]

## Complaints Process
If you have a complaint, please email [complaints@example.com] with:
1. Your name and account details
2. A description of the issue
3. The outcome you are seeking

We aim to respond within [10] business days.

If unresolved, you may escalate to the relevant regulatory body in your jurisdiction.
')

ON CONFLICT (slug) DO NOTHING;


-- =============================================================================
-- 20260724190000_work_items_stream_id.sql
-- =============================================================================

-- WBS / work_items: attach optional stream_id; autopopulate Core when streams enable.

ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS work_items_stream_idx ON public.work_items (stream_id);

-- Backfill: default stream when project already has streams.
UPDATE public.work_items wi
SET stream_id = ps.id
FROM public.project_streams ps
WHERE wi.stream_id IS NULL
  AND ps.project_id = wi.project_id
  AND ps.is_default = true;

-- Keep always-on Core helper in sync: also migrate work_items.
CREATE OR REPLACE FUNCTION public.ensure_project_core_stream(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_stream uuid;
  v_proj public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  v_org := v_proj.org_id;

  SELECT id INTO v_stream
  FROM public.project_streams
  WHERE project_id = p_project_id AND is_default
  LIMIT 1;

  IF v_stream IS NULL THEN
    INSERT INTO public.project_streams (
      org_id, project_id, name, code, is_default, sort_order, status, rag, owner,
      planned_start_date, planned_end_date, actual_start_date, actual_end_date,
      budget, capex_approved, capex_incurred, opex_approved, opex_incurred,
      forecast_at_completion
    )
    VALUES (
      v_org, p_project_id, 'Core', 'CORE', true, 0,
      COALESCE(v_proj.status::text, 'In Progress'), v_proj.rag, v_proj.sponsor,
      COALESCE(v_proj.planned_start_date, v_proj.start_date),
      COALESCE(v_proj.planned_end_date, v_proj.end_date),
      v_proj.actual_start_date, v_proj.actual_end_date,
      COALESCE(v_proj.budget, 0),
      COALESCE(v_proj.capex_approved, 0), COALESCE(v_proj.capex_incurred, 0),
      COALESCE(v_proj.opex_approved, 0), COALESCE(v_proj.opex_incurred, 0),
      v_proj.forecast_at_completion
    )
    ON CONFLICT (project_id, name) DO UPDATE
      SET is_default = true,
          updated_at = now()
    RETURNING id INTO v_stream;
  END IF;

  UPDATE public.stage_gates SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.milestones SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.financials_monthly SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.fy_allocations SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.resource_allocations SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.work_items SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;

  UPDATE public.projects
     SET streams_enabled = true, updated_at = now()
   WHERE id = p_project_id
     AND (NOT streams_enabled OR streams_enabled IS DISTINCT FROM true);

  RETURN v_stream;
END;
$$;


-- =============================================================================
-- 20260724193000_grant_eoi_licenses_policies.sql
-- =============================================================================

-- Grants missing from EOI / licenses / legal_policies tables.
-- Without these, PostgREST returns "permission denied for table …"
-- even when RLS policies exist.

GRANT SELECT, INSERT, UPDATE ON public.eoi_requests TO authenticated;
GRANT INSERT ON public.eoi_requests TO anon;
GRANT ALL ON public.eoi_requests TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_license_certificates TO authenticated;
GRANT ALL ON public.org_license_certificates TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_policies TO authenticated;
GRANT SELECT ON public.legal_policies TO anon;
GRANT ALL ON public.legal_policies TO service_role;


-- =============================================================================
-- 20260724194500_publish_legal_policies.sql
-- =============================================================================

-- Publish seeded legal policies so landing /legal/:slug links work.
UPDATE public.legal_policies
SET published = true,
    updated_at = now()
WHERE published = false;


-- =============================================================================
-- 20260724200000_iprojectx_legal_policy_bodies.sql
-- =============================================================================

-- Replace placeholder legal policy bodies with complete iProjectX policy text.
-- Bodies intentionally omit H1 titles and "Last updated" lines (shown by the UI).

-- ──────────────────────────────────────────────────────────
-- privacy-policy
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX ("we", "us", "our") is committed to protecting the personal information of individuals who use our project portfolio management platform and related services (the "Services"). This Privacy Policy explains what we collect, how we use and share it, how long we keep it, and the rights available to you under the Australian Privacy Act 1988 (Cth), the Australian Privacy Principles (APPs), and, where applicable, the EU General Data Protection Regulation (GDPR) and similar laws.

## 1. Scope

This policy applies to personal information processed when you visit our websites, create or use an iProjectX account, interact with support, or otherwise engage with the Services. It does not cover third-party sites or services that may link to or integrate with iProjectX.

## 2. Information We Collect

**Account and profile data.** Name, email address, organisation name, role or job title, authentication credentials, and preferences you configure in the platform.

**Customer content.** Project data, documents, comments, decisions, forecasts, and other materials you or your authorised users upload or generate in the Services ("Customer Content"). We process Customer Content as a service provider / processor on behalf of your organisation.

**Usage and technical data.** Feature usage, pages viewed, session duration, approximate location derived from IP address, browser type, device identifiers, and diagnostic or error logs needed to operate and secure the Services.

**Communications.** Messages you send to support, billing, privacy, or security contacts, and related metadata.

**Billing data.** Subscription plan, invoices, payment status, and limited payment method details processed by our payment providers (we do not store full card numbers).

## 3. How We Use Information

We use personal information to:

- Provide, maintain, authenticate, and improve the Services
- Manage accounts, subscriptions, and billing
- Communicate about product updates, security notices, and support
- Monitor integrity, prevent abuse, and investigate security incidents
- Comply with legal obligations and enforce our agreements
- Analyse aggregated or de-identified usage to improve reliability and usability

We do not sell personal information.

## 4. Legal Bases (where GDPR applies)

Where GDPR or similar frameworks apply, we rely on: performance of a contract; legitimate interests (securing and improving the Services, in a manner that does not override your rights); consent where required (for example certain cookies or marketing); and legal obligation.

## 5. Sharing and Third Parties

We may share personal information with:

- **Infrastructure and subprocessors** that host, store, email, monitor, or process data under contractual confidentiality and security obligations
- **Payment processors** for subscription billing
- **Professional advisors** (legal, accounting) under confidentiality
- **Authorities** when required by law or to protect rights, safety, or security

A current list of material subprocessors is available on request from privacy@iprojectx.com.

## 6. International Transfers

iProjectX may process data in Australia and other jurisdictions where our providers operate. Where required, we use appropriate safeguards such as contractual clauses and vendor due diligence.

## 7. Retention

We retain account and billing records for as long as your organisation maintains an active subscription and for a reasonable period afterward for legal, accounting, and dispute-resolution purposes (typically up to seven years for financial records, unless a shorter or longer period is required by law). Customer Content is retained per your organisation’s configuration and our Data Retention Policy. See also our Data Retention Policy for deletion request handling.

## 8. Security

We implement administrative, technical, and organisational measures appropriate to the risk, including encryption in transit, access controls, logging, and monitoring. No method of transmission or storage is perfectly secure; please also protect your credentials. See our Information Security Policy for more detail.

## 9. Your Rights

Subject to applicable law, you may request access, correction, deletion, restriction, portability, or objection to certain processing, and you may withdraw consent where processing is consent-based. Australian individuals may also complain to the Office of the Australian Information Commissioner (OAIC). EU/UK individuals may lodge a complaint with their supervisory authority.

To exercise rights, contact privacy@iprojectx.com. We may need to verify your identity and, for Customer Content held in an organisation workspace, may direct the request to your organisation’s administrator as the controller.

## 10. Children

The Services are intended for business use and are not directed to children under 16. We do not knowingly collect personal information from children.

## 11. Changes

We may update this policy from time to time. Material changes will be reflected by updating the policy on this page. Continued use of the Services after changes take effect constitutes acceptance where permitted by law.

## 12. Contact

Privacy enquiries: privacy@iprojectx.com  
General: hello@iprojectx.com  
Support: support@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'privacy-policy';

-- ──────────────────────────────────────────────────────────
-- terms-of-service
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
These Terms of Service ("Terms") govern access to and use of the iProjectX platform and related services (the "Services") provided by iProjectX ("iProjectX", "we", "us", "our"). By creating an account, inviting users, or using the Services, you agree to these Terms on behalf of yourself and, if applicable, the organisation you represent ("Customer").

## 1. Eligibility and Accounts

You must be legally able to enter a binding contract and authorised to bind your organisation if you accept these Terms for a business. You are responsible for the accuracy of registration information, safeguarding credentials, and all activity under your accounts. Notify support@iprojectx.com promptly of unauthorised access.

## 2. Licence to Use the Services

Subject to these Terms and timely payment of applicable fees, iProjectX grants Customer a limited, non-exclusive, non-transferable, non-sublicensable right to access and use the Services for Customer’s internal business purposes during the subscription term. We reserve all rights not expressly granted.

## 3. Customer Content and Intellectual Property

Customer retains ownership of data, documents, and materials submitted to the Services ("Customer Content"). Customer grants iProjectX a worldwide licence to host, process, transmit, and display Customer Content solely to provide and secure the Services and as otherwise directed by Customer.

iProjectX and its licensors own all right, title, and interest in the Services, software, documentation, branding, templates, and underlying technology, including improvements and aggregated insights that do not identify Customer or individuals. Feedback you provide may be used by iProjectX without restriction or obligation.

## 4. User Responsibilities

Customer and its users must:

- Use the Services only for lawful business purposes
- Comply with our Acceptable Use Policy and applicable laws
- Ensure only authorised personnel have access
- Maintain accurate account, billing, and user information
- Not misrepresent affiliation with iProjectX

Customer is responsible for configuring access permissions and for decisions made using outputs from the Services, including AI-assisted features.

## 5. Acceptable Use and Restrictions

You must not reverse engineer, scrape at abusive scale, interfere with security or availability, resell the Services without written consent, or use the Services to infringe others’ rights. Suspected violations may result in suspension. See the Acceptable Use Policy for detail.

## 6. Subscriptions, Fees, and Taxes

Paid plans are billed in advance according to the selected plan and billing frequency. Fees are non-refundable except as stated in our Refund & Cancellation Policy or required by law. Customer is responsible for applicable taxes. We may change pricing prospectively with notice; continued use after the effective date constitutes acceptance of the new pricing for subsequent terms.

## 7. Third-Party Services

The Services may integrate with third-party products. Those products are governed by their own terms. iProjectX is not responsible for third-party services outside our reasonable control.

## 8. Confidentiality

Each party will protect the other’s confidential information with reasonable care and use it only for performing under these Terms, except for information that is public, independently developed, or rightfully received from another source.

## 9. Suspension and Termination

Either party may terminate a subscription at the end of a billing period as described in the Refund & Cancellation Policy, or earlier for material breach if the breach remains uncured after 15 days’ written notice (or immediately for security/abuse risks). Upon termination, Customer’s right to access the Services ends. We will make Customer Content available for export for a reasonable period where feasible, after which we may delete it in accordance with our retention practices, unless legally required to retain it.

## 10. Warranties and Disclaimers

THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE". TO THE MAXIMUM EXTENT PERMITTED BY LAW, IPROJECTX DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. We do not warrant uninterrupted or error-free operation, or that the Services will achieve particular business outcomes. Nothing in these Terms excludes rights that cannot be excluded under Australian Consumer Law.

## 11. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, IPROJECTX’S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THE SERVICES OR THESE TERMS SHALL NOT EXCEED THE FEES PAID BY CUSTOMER TO IPROJECTX FOR THE SERVICES IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM. IPROJECTX SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOST PROFITS, REVENUE, OR DATA, EVEN IF ADVISED OF THE POSSIBILITY. These limits do not apply to liability that cannot be limited by law.

## 12. Indemnity

Customer will defend and indemnify iProjectX against claims arising from Customer Content, Customer’s misuse of the Services, or Customer’s violation of law or these Terms.

## 13. Governing Law

These Terms are governed by the laws of New South Wales, Australia, without regard to conflict-of-law rules. Courts in New South Wales have exclusive jurisdiction, subject to mandatory consumer protections.

## 14. Changes

We may update these Terms by posting a revised version. Material changes affecting paid subscriptions will be notified with reasonable advance notice where practicable. Continued use after the effective date constitutes acceptance.

## 15. Contact

Support: support@iprojectx.com  
Billing: billing@iprojectx.com  
General: hello@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'terms-of-service';

-- ──────────────────────────────────────────────────────────
-- cookie-policy
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Cookie Policy explains how iProjectX ("we", "us", "our") uses cookies and similar technologies on our websites and within the iProjectX platform (the "Services"). It should be read together with our Privacy Policy.

## 1. What Are Cookies?

Cookies are small text files placed on your device when you visit a site or use an application. Similar technologies include local storage, session storage, and pixels. They help us operate the Services securely, remember preferences, and understand usage.

## 2. How We Use Cookies

We use cookies for:

- **Essential operation** — authentication, session management, security, load balancing, and fraud prevention
- **Preferences** — remembering UI settings such as theme, language, or layout choices
- **Analytics** — understanding feature adoption, performance, and reliability so we can improve the product
- **Communications** — where applicable, measuring engagement with product or marketing messages in a privacy-respecting manner

## 3. Categories of Cookies

| Category | Purpose | Typical duration | Consent |
|----------|---------|------------------|---------|
| Strictly necessary | Sign-in, security, CSRF protection, session continuity | Session to 12 months | Required for the Services to function |
| Functional / preferences | Remember settings and improve usability | Up to 12 months | May be required for certain features |
| Analytics | Aggregated usage and performance metrics | Up to 12 months | Where required by law, we seek consent |
| Marketing | Only if enabled for our public marketing sites | Up to 12 months | Consent-based where required |

## 4. Analytics

We may use first-party analytics and carefully selected third-party analytics providers to measure traffic and product usage. Where feasible, we configure analytics to minimise personal identifiers, IP truncation, or similar privacy controls. Analytics cookies help us diagnose errors, prioritise improvements, and maintain service quality.

## 5. Consent and Control

Where required by law, non-essential cookies are used only with your consent. You can manage cookie preferences through:

- Our cookie banner or preference controls (where available)
- Your browser settings to block or delete cookies
- Opt-out mechanisms provided by analytics vendors where applicable

If you disable essential cookies, parts of the Services (including sign-in) may not work. Blocking analytics cookies will not generally prevent core product use.

## 6. Third-Party Cookies

Some cookies may be set by subprocessors that help us host, secure, or analyse the Services. Those parties process data under their own policies and our contractual instructions. For questions about specific vendors, contact privacy@iprojectx.com.

## 7. Retention of Cookie Data

Cookie lifetimes vary by purpose as noted above. Analytics datasets derived from cookies are retained only as long as needed for reporting and improvement, then aggregated, anonymised, or deleted according to our retention practices.

## 8. Updates

We may update this Cookie Policy to reflect changes in technology, providers, or law. The current version will always be available on this page.

## 9. Contact

Privacy: privacy@iprojectx.com  
Support: support@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'cookie-policy';

-- ──────────────────────────────────────────────────────────
-- acceptable-use
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Acceptable Use Policy ("AUP") sets rules for using the iProjectX platform and related services (the "Services"). It supplements our Terms of Service. Violations may result in warning, suspension, termination, or referral to authorities.

## 1. Purpose

iProjectX provides a professional environment for project, portfolio, and delivery management. Users must act responsibly, respect others’ rights, and protect the security and integrity of the Services and Customer Content.

## 2. Prohibited Activities

You may not use the Services to:

- Violate any applicable law, regulation, or third-party right
- Upload, store, or distribute malware, ransomware, or other harmful code
- Attempt unauthorised access to accounts, systems, networks, or data
- Probe, scan, or test vulnerabilities except with prior written authorisation from iProjectX
- Interfere with, disrupt, or degrade the Services, including denial-of-service attacks or abusive automation
- Bypass authentication, rate limits, access controls, or security features
- Phish, spam, or send unsolicited bulk communications through or using the Services
- Impersonate any person or entity, or misrepresent affiliation with iProjectX
- Harvest personal information without a lawful basis and appropriate notices
- Host or share content that is illegal, defamatory, fraudulent, or that exploits minors
- Use the Services to facilitate money laundering, sanctions evasion, or other financial crime
- Resell, sublicense, or provide the Services to third parties except as expressly permitted in a written agreement
- Scrape or extract data at a volume or manner that impairs the Services or violates these Terms
- Use AI features to generate content intended to deceive in regulated contexts without appropriate human review and disclosure

## 3. Security Violations

Security-related misuse is treated as a material breach. This includes sharing credentials, attempting privilege escalation, exploiting bugs without responsible disclosure, or introducing backdoors into Customer Content workflows. Suspected security issues should be reported promptly to security@iprojectx.com rather than exploited.

## 4. Customer Content Standards

Customer and its users remain responsible for Customer Content. Do not upload content you lack rights to process, or content that creates undue legal or security risk for iProjectX or other customers. Organisations must ensure users are authorised and appropriately trained.

## 5. Resource Fairness

Accounts must not consume disproportionate compute, storage, API, or support resources in a way that harms other customers. We may throttle, queue, or require plan upgrades where usage is abusive or outside fair use for the subscribed tier.

## 6. Monitoring and Enforcement

We may investigate suspected AUP violations, review logs, and take action including removing content, suspending users, or terminating subscriptions. Where lawful and appropriate, we cooperate with law enforcement. Enforcement actions do not waive our other rights under the Terms.

## 7. Reporting Abuse

Report abuse, suspicious activity, or AUP violations to:

- Security incidents: security@iprojectx.com  
- General abuse / support: support@iprojectx.com  
- Privacy concerns: privacy@iprojectx.com  

Include relevant URLs, user identifiers, timestamps, and a description of the issue. We aim to acknowledge credible reports promptly and escalate based on severity.

## 8. Updates

iProjectX may update this AUP as threats and product capabilities evolve. Continued use of the Services after updates constitutes acceptance.
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'acceptable-use';

-- ──────────────────────────────────────────────────────────
-- refund-cancellation
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Refund & Cancellation Policy explains how iProjectX handles subscription cancellations, refund eligibility, and billing disputes for paid plans of the iProjectX platform (the "Services"). It forms part of our Terms of Service.

## 1. Subscription Terms

Paid subscriptions renew automatically at the end of each billing period (monthly or annual, depending on your plan) unless cancelled before renewal. Fees are generally charged in advance. Plan features and pricing are described on our Pricing & Plans page and in your order or invoice.

## 2. How to Cancel

Account administrators can cancel through billing settings in the platform, or by emailing billing@iprojectx.com from an authorised account email. Cancellation takes effect at the end of the current paid term unless otherwise agreed in writing. You retain access to paid features until that date.

Downgrades to a lower plan typically take effect at the next renewal unless we agree to an earlier change. Upgrades may be prorated for the remainder of the term.

## 3. Refund Eligibility

**Generally.** Fees already paid are non-refundable and non-creditable, except as required by law (including non-excludable Australian Consumer Law rights) or as expressly stated below.

**Cooling-off / first-term consideration.** For new self-serve subscriptions, if you cancel within fourteen (14) days of the initial purchase and have not made material productive use of the Services beyond reasonable evaluation, you may request a refund by contacting billing@iprojectx.com. We may decline refunds where usage indicates more than evaluation (for example extensive data import, multi-user rollout, or sustained operational use).

**Service failure.** If we fail to provide the Services in a manner that constitutes a major failure under applicable consumer law, or if we permanently discontinue the Services without a reasonable alternative, you may be entitled to a refund or credit for unused prepaid periods.

**Annual plans.** Mid-term cancellations of annual plans do not ordinarily entitle you to a pro-rata refund of unused months, except where required by law or expressly offered in writing.

Enterprise or custom contracts may specify different cancellation and refund terms that prevail over this policy to the extent of conflict.

## 4. Chargebacks and Billing Disputes

Please contact billing@iprojectx.com before initiating a card chargeback so we can investigate quickly. Provide invoice number, date, amount, and a description of the issue. We aim to acknowledge billing disputes within two (2) business days and resolve straightforward cases within ten (10) business days.

Unauthorised chargebacks may result in suspension until the matter is resolved. If a chargeback is filed in error and later reversed, access may be restored once payment is confirmed.

## 5. Taxes and Currency

Refunds, where granted, are issued to the original payment method in the currency charged, less any non-recoverable payment-processor fees where permitted by law. Tax treatment follows applicable rules and your invoice.

## 6. Data After Cancellation

After cancellation and expiry of the paid term, access may be limited or removed. We provide a reasonable window to export Customer Content where feasible. Thereafter data is handled under our Data Retention Policy. Cancellation does not relieve you of fees owed for the current term.

## 7. Contact

Billing: billing@iprojectx.com  
Support: support@iprojectx.com  
Complaints: complaints@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'refund-cancellation';

-- ──────────────────────────────────────────────────────────
-- information-security
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX maintains an information security program designed to protect the confidentiality, integrity, and availability of the iProjectX platform, Customer Content, and related systems. This Information Security Policy summarises our approach for customers and prospects.

## 1. Governance

Security responsibilities are assigned within iProjectX. We review controls periodically, align practices with industry norms appropriate to a SaaS project-management platform, and require personnel with access to Customer Content to follow confidentiality and acceptable-use obligations.

## 2. Encryption

- **In transit:** Connections to the Services use TLS encryption for web and API traffic.
- **At rest:** Customer Content and databases are protected using encryption at rest provided by our infrastructure providers and platform configuration.
- Secrets such as API keys and credentials are stored using secure secret-management practices and are not committed to source control.

## 3. Access Controls

Access to production systems follows least privilege and need-to-know principles. Administrative access is authenticated, logged, and limited to authorised personnel. Customer organisations control end-user roles and permissions within their workspaces. We encourage strong passwords and support modern authentication practices offered by the platform.

## 4. Network and Application Security

We apply secure development practices, dependency management, and environment separation appropriate to our architecture. Application protections may include authentication checks, authorisation enforcement, input validation, and rate limiting. Infrastructure is hosted with reputable cloud providers that maintain physical and environmental controls for their facilities.

## 5. Monitoring, Logging, and Detection

We monitor service health and security-relevant events. Logs are retained for operational, security, and investigative purposes for limited periods. Anomalous activity may trigger investigation under our Incident Response Policy.

## 6. Vulnerability Management

We track and remediate known vulnerabilities in platforms and dependencies based on severity and exploitability. Customers and researchers who discover a potential vulnerability should report it responsibly to security@iprojectx.com. Please do not publicly disclose before we have had a reasonable opportunity to investigate and remediate.

## 7. Backup and Resilience

We maintain backup and recovery processes intended to support continuity of the Services. Recovery objectives may vary by component; enterprise customers may negotiate additional commitments in an order form or SLA addendum.

## 8. Personnel and Vendors

Personnel with production access receive security and privacy guidance relevant to their roles. Subprocessors are evaluated for security posture and bound by contractual confidentiality and data-protection terms. Material subprocessors can be requested from privacy@iprojectx.com or security@iprojectx.com.

## 9. Customer Shared Responsibility

Security is a shared model. Customers must manage user access, protect credentials, configure permissions appropriately, and ensure Customer Content is lawfully collected and classified. See our Customer Responsibilities policy.

## 10. Contact

Security: security@iprojectx.com  
Privacy: privacy@iprojectx.com  
Support: support@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'information-security';

-- ──────────────────────────────────────────────────────────
-- data-processing-agreement
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Data Processing Agreement ("DPA") forms part of the agreement between iProjectX ("Processor", "we", "us") and the customer organisation using the Services ("Controller", "Customer") for processing of personal data in Customer Content. It applies where Customer is a controller (or equivalent) under the GDPR, UK GDPR, Australian Privacy Act, or similar laws, and iProjectX processes personal data on Customer’s behalf.

## 1. Roles

Customer determines the purposes and means of processing personal data within Customer Content. iProjectX processes such personal data only to provide the Services, per Customer’s documented instructions (including configuration and use of the platform), and as required by law. For account, billing, and product-improvement data about Customer’s users that iProjectX collects as an independent controller, our Privacy Policy applies separately.

## 2. Nature and Purpose of Processing

**Subject matter:** Hosting and operation of a project portfolio management SaaS platform.  
**Duration:** The subscription term plus any post-termination retention/export window.  
**Nature:** Storage, retrieval, transmission, display, backup, and deletion of Customer Content.  
**Purpose:** Providing, securing, supporting, and improving the Services as instructed.  
**Types of data:** As determined by Customer — commonly names, emails, roles, project records, comments, documents, and related business data.  
**Data subjects:** Customer’s personnel, contractors, and other individuals whose data Customer elects to process in the Services.

## 3. Processor Obligations

iProjectX shall:

- Process personal data only on documented instructions from Customer, unless required by law (in which case we inform Customer unless legally prohibited)
- Ensure persons authorised to process personal data are bound by confidentiality
- Implement appropriate technical and organisational measures as described in our Information Security Policy
- Assist Customer, insofar as reasonably possible, with data subject requests, DPIAs, and consultations with supervisory authorities, at Customer’s reasonable expense if assistance is material
- Delete or return personal data after the Services end, at Customer’s choice, unless retention is required by law
- Make available information reasonably necessary to demonstrate compliance with this DPA

## 4. Subprocessors

Customer authorises iProjectX to engage subprocessors to deliver the Services. We impose data-protection obligations no less protective than those in this DPA. We remain responsible for subprocessors’ performance. On request to privacy@iprojectx.com, we will provide information about material subprocessors. If Customer reasonably objects to a new subprocessor on data-protection grounds, the parties will discuss alternatives in good faith, which may include termination rights for the affected Services.

## 5. International Transfers

Where personal data is transferred internationally, iProjectX will ensure an appropriate transfer mechanism is in place (such as standard contractual clauses or equivalent safeguards) where required by applicable law.

## 6. Security Incidents

iProjectX will notify Customer without undue delay after becoming aware of a personal data breach affecting Customer Content, and will provide information reasonably available to help Customer meet its own notification duties. See our Incident Response Policy for operational timelines.

## 7. Audits

Upon reasonable written notice, and subject to confidentiality, iProjectX will provide security documentation or summaries reasonably sufficient to demonstrate compliance. On-site audits may be agreed where documentation is insufficient, limited to once per year (unless a material incident occurs), during business hours, and at Customer’s cost unless a material non-compliance is found.

## 8. Liability

Liability under this DPA is subject to the limitations in the Terms of Service, except where prohibited by applicable data-protection law.

## 9. Contact

Privacy / DPA: privacy@iprojectx.com  
Security: security@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'data-processing-agreement';

-- ──────────────────────────────────────────────────────────
-- data-retention
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Data Retention Policy describes how long iProjectX retains information associated with the Services and how deletion requests are handled. It complements our Privacy Policy and Data Processing Agreement.

## 1. Principles

We retain information only as long as needed to provide the Services, meet legal and accounting obligations, resolve disputes, and enforce agreements. Retention periods vary by data category and Customer configuration.

## 2. Customer Content

Customer Content (projects, documents, comments, and similar workspace data) is retained for the life of the Customer’s active subscription and any agreed export window after termination or downgrade. Customers control day-to-day deletion of records within the product according to their permissions.

After subscription end, we typically retain Customer Content for a limited period (commonly up to thirty (30) days) to allow export, unless a longer hold is required for a legal dispute or expressly agreed. Thereafter, Customer Content is deleted or anonymised from active systems within a commercially reasonable period, subject to backup rotation cycles.

## 3. Account and Profile Data

User account profiles, authentication records, and organisation membership metadata are retained while the account or organisation remains active. After account closure, we retain limited records as needed for security, fraud prevention, and legal compliance.

## 4. Billing and Financial Records

Invoices, payment confirmations, and subscription history are generally retained for up to seven (7) years (or longer if required by tax or corporate law).

## 5. Support and Communications

Support tickets and related correspondence are retained for a period sufficient to maintain service history and quality (typically up to three (3) years), unless a longer period is needed for an ongoing matter.

## 6. Logs and Security Telemetry

Operational and security logs are retained for shorter periods appropriate to troubleshooting and threat detection (often 30–180 days depending on log type), unless needed longer for an investigation.

## 7. Analytics

Aggregated or de-identified analytics may be retained longer because they do not identify individuals. Raw analytics identifiers are retained only as needed for product improvement.

## 8. Deletion Requests

**End users.** Individuals may request deletion under applicable privacy law by contacting privacy@iprojectx.com. Where iProjectX acts as processor, we will direct the request to the Customer organisation (controller) or act on Customer instructions.

**Customer administrators.** Organisation admins may delete workspace data within product capabilities or request account closure via support@iprojectx.com or billing@iprojectx.com.

We may retain information where necessary to comply with law, resolve disputes, prevent fraud, or enforce agreements. Backup media are overwritten on a rolling schedule; residual copies may persist until those cycles complete.

## 9. Contact

Privacy: privacy@iprojectx.com  
Support: support@iprojectx.com  
Security: security@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'data-retention';

-- ──────────────────────────────────────────────────────────
-- incident-response
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Incident Response Policy outlines how iProjectX prepares for, detects, responds to, and communicates about security incidents affecting the Services or Customer Content.

## 1. Definitions

A **security incident** is a suspected or confirmed event that threatens the confidentiality, integrity, or availability of the Services or Customer Content. A **personal data breach** is a security incident leading to accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, personal data.

## 2. Preparation

We maintain runbooks, escalation paths, and contact channels for security events. Personnel with operational duties are instructed to escalate suspected incidents promptly. Customers should report suspected incidents to security@iprojectx.com (and support@iprojectx.com if account access is affected).

## 3. Detection and Triage

Alerts from monitoring, customer reports, vendor notices, and internal discovery are triaged by severity (for example: critical, high, medium, low) based on impact, exploitability, and data sensitivity. False positives are closed with documentation; confirmed issues enter containment.

## 4. Containment, Eradication, and Recovery

Depending on the incident, we may revoke credentials, isolate systems, apply patches, rotate secrets, restore from known-good backups, and increase monitoring. We prioritise stopping ongoing harm while preserving forensic evidence where practical.

## 5. Customer Notification Timelines

Where a personal data breach affecting Customer Content is confirmed, iProjectX will notify the affected Customer **without undue delay**, and in any event within **seventy-two (72) hours** of confirming the breach, where feasible and unless a longer or shorter period is required or permitted by law or a written customer agreement.

Notifications will include, where known at the time:

- Nature of the incident and approximate timeline
- Categories of data and data subjects potentially affected (high level)
- Likely consequences
- Measures taken or proposed to address the incident
- A point of contact for follow-up

We may provide updates as investigation progresses. Notification to individuals or regulators remains Customer’s responsibility as controller, except where law requires iProjectX to notify directly.

For significant availability incidents, we communicate via status updates and, where appropriate, email to administrators. See System Status.

## 6. Post-Incident Review

Material incidents undergo a post-incident review to identify root causes and improvement actions. Lessons learned may drive control enhancements, training, or vendor follow-up.

## 7. Customer Cooperation

Customers agree to reasonably cooperate with investigations, preserve relevant evidence under their control, and promptly secure compromised end-user accounts. Do not publicly disclose confidential forensic details that could increase risk without coordination.

## 8. Contact

Security (24×7 escalation intent for critical issues): security@iprojectx.com  
Support: support@iprojectx.com  
Privacy: privacy@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'incident-response';

-- ──────────────────────────────────────────────────────────
-- about
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX builds software that helps organisations plan, govern, and deliver complex projects with clarity. We combine portfolio visibility, structured workflows, and practical AI assistance so teams can make better decisions without drowning in spreadsheets and status noise.

## Mission

Our mission is to give project leaders and delivery teams a single, trustworthy operating system for work that matters — from initiation and funding through execution, risk, and outcomes — with security and accountability built in. We believe delivery excellence comes from shared truth: clear ownership, timely decisions, and data that leaders can trust.

## What We Offer

iProjectX provides cloud-hosted capabilities for project and portfolio management, including planning structures, collaboration, reporting, governance artefacts, and integrations that fit modern delivery organisations. We serve teams that need professionalism and auditability, not just task lists.

Typical use cases include capital and transformation programmes, operational improvement portfolios, stage-gate governance, and cross-functional status reporting for executives and delivery leads.

## How We Work

We design for clarity, reliability, and respectful handling of customer data. Product decisions favour durable workflows over novelty for its own sake. Security, privacy, and support commitments are documented in our public policies so customers know what to expect before they buy and while they operate.

We partner with customers through onboarding guidance, responsive support, and continuous product improvement informed by real delivery practice. Feedback from practitioners shapes our roadmap; we prioritise features that reduce ambiguity and administrative burden.

## Values

- **Clarity** — interfaces and workflows that make status and ownership obvious  
- **Accountability** — records that support audit, assurance, and decision traceability  
- **Respect for data** — privacy and security treated as product requirements, not afterthoughts  
- **Practical AI** — assistance that accelerates work while keeping humans in control  

## Contact

We welcome partnership and product conversations.

- General enquiries: hello@iprojectx.com  
- Customer support: support@iprojectx.com  
- Privacy: privacy@iprojectx.com  
- Security: security@iprojectx.com  
- Billing: billing@iprojectx.com  
- Complaints: complaints@iprojectx.com  

## Company

iProjectX operates as a technology service provider focused on project portfolio management software. For contractual notices, use the contacts above or the addresses specified in your order form or enterprise agreement. Related legal and operational documents — including Terms of Service, Privacy Policy, SLA, and Support & Help — are published alongside this page.

Thank you for trusting iProjectX with your delivery work.
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'about';

-- ──────────────────────────────────────────────────────────
-- pricing-plans
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX offers subscription plans designed for teams of different sizes and governance needs. Exact feature packaging, user limits, and list prices are shown at checkout or in your order form; this page describes the tiers in general terms.

## 1. Plan Tiers

### Standard

Built for growing teams that need a structured project workspace. Typical inclusions:

- Core project and portfolio views
- Collaboration, comments, and document attachments within platform limits
- Standard reporting and dashboards
- Email support during business hours
- Security baselines described in our Information Security Policy

### Business

For organisations that need stronger governance, scale, and administrative control. Typical inclusions:

- Everything in Standard, plus advanced roles and permissions
- Expanded reporting, exports, and workflow configuration
- Higher storage and automation allowances
- Priority support response targets (see SLA)
- Optional integrations available on the plan

### Enterprise

For complex estates and regulated environments. Typical inclusions:

- Everything in Business, plus custom contractual terms where agreed
- Dedicated onboarding / success engagement (as scoped)
- Enhanced admin, audit, and security configuration options
- Custom SSO or identity integrations where available
- Service credits and uptime commitments per SLA / order form
- Named support escalation paths

Feature availability evolves; the authoritative list for your subscription is the plan matrix presented at purchase or in your enterprise agreement.

## 2. Billing Frequency

Plans are typically available on **monthly** or **annual** billing. Annual billing may include a discount relative to month-to-month pricing. Fees are charged in advance. Taxes may apply based on your location.

## 3. Upgrades and Downgrades

**Upgrades** to a higher tier can usually be applied immediately; we may prorate the difference for the remainder of the current term.  
**Downgrades** generally take effect at the next renewal so you retain paid features through the period already purchased. Some Enterprise features cannot move to lower tiers without a new agreement.

Changes can be requested in-product by an administrator or via billing@iprojectx.com.

## 4. Seats and Usage

Plans may be priced per organisation, per active user/seat, or a combination. Exceeding included limits may require purchasing additional seats or moving to a higher tier. Fair-use limits may apply to storage, API calls, and AI features.

## 5. Trials and Evaluations

Where a trial is offered, it is for evaluation only, time-limited, and may exclude certain Enterprise features. Trial terms are presented at signup.

## 6. Cancellations and Refunds

Cancellation and refund rules are set out in the Refund & Cancellation Policy.

## 7. Contact

Billing: billing@iprojectx.com  
Sales / general: hello@iprojectx.com  
Support: support@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'pricing-plans';

-- ──────────────────────────────────────────────────────────
-- sla
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Service Level Agreement ("SLA") describes availability and support response commitments for paid iProjectX subscriptions. Enterprise agreements may supersede parts of this SLA where expressly stated.

## 1. Uptime Commitment

iProjectX targets **99.5% monthly uptime** for the production web application, measured as:

Monthly Uptime % = (Total Minutes in Month − Downtime Minutes) / Total Minutes in Month × 100

**Downtime** means the Services are unavailable to all or substantially all of Customer’s authorised users, excluding:

- Scheduled maintenance announced in advance
- Emergency maintenance required for security or stability
- Failures of Customer’s internet, devices, or identity providers
- Force majeure events and third-party upstream outages outside our reasonable control
- Beta, trial, or non-production environments
- Suspension due to Customer breach, non-payment, or AUP violations

## 2. Scheduled Maintenance

We aim to schedule maintenance during low-usage windows and to provide at least forty-eight (48) hours’ notice for planned downtime expected to exceed fifteen (15) minutes, via status page, in-app notice, or email to administrators where practicable.

## 3. Support Response Times

Support is available at support@iprojectx.com. Target first-response times during iProjectX business hours (Australian business days, unless otherwise agreed):

| Severity | Description | Standard | Business | Enterprise |
|----------|-------------|----------|----------|------------|
| P1 — Critical | Production down or severe security incident affecting all users | 8 business hours | 4 business hours | 2 business hours |
| P2 — High | Major feature impaired; workaround limited | 1 business day | 8 business hours | 4 business hours |
| P3 — Normal | Partial impairment or general how-to | 2 business days | 1 business day | 8 business hours |
| P4 — Low | Enhancement questions, minor issues | 3 business days | 2 business days | 1 business day |

These are response targets, not fix guarantees. Resolution time depends on complexity and Customer cooperation.

## 4. Service Credits

If Monthly Uptime falls below 99.5% for a calendar month, Customer may request a service credit against future subscription fees:

| Monthly Uptime | Credit |
|----------------|--------|
| < 99.5% and ≥ 99.0% | 5% of that month’s fees |
| < 99.0% and ≥ 98.0% | 10% of that month’s fees |
| < 98.0% | 15% of that month’s fees |

Credits are Customer’s sole remedy for downtime under this SLA unless an enterprise contract states otherwise. Credits are not cash refunds, do not roll beyond the subsequent invoice unless agreed, and exclude taxes and one-time fees.

## 5. Credit Requests

Email billing@iprojectx.com within thirty (30) days after the affected month with organisation name, dates, and a brief description. We will validate against our monitoring records.

## 6. Contact

Support: support@iprojectx.com  
Billing: billing@iprojectx.com  
Security emergencies: security@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'sla';

-- ──────────────────────────────────────────────────────────
-- support-help
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX support helps customers use the platform effectively, resolve technical issues, and escalate billing or security matters to the right team.

## 1. How to Get Help

- **Email:** support@iprojectx.com (primary channel for most requests)
- **Billing:** billing@iprojectx.com
- **Security:** security@iprojectx.com
- **Privacy:** privacy@iprojectx.com
- **General / partnerships:** hello@iprojectx.com

When contacting support, include your organisation name, affected users, environment (browser), steps to reproduce, and screenshots or error messages where relevant. Clear context shortens time to first meaningful response.

## 2. Hours and Response Targets

Support operates on Australian business days unless your Enterprise agreement specifies extended coverage. Response targets by plan are described in our SLA. Critical outages should be marked as urgent in your subject line and, for security incidents, also sent to security@iprojectx.com.

We may ask follow-up questions to reproduce an issue. Timely replies from your side help us meet response and resolution goals.

## 3. Brief FAQs

**How do I reset my password?** Use the sign-in “forgot password” flow. If you use SSO, contact your organisation’s identity administrator.

**Who can change billing or cancel?** Organisation administrators or billing contacts on file. See Refund & Cancellation Policy.

**How do I export data?** Administrators can use in-product export features where available, or request assistance via support for end-of-subscription exports.

**Do you offer training?** Business and Enterprise plans may include onboarding guidance; ask hello@iprojectx.com or your success contact.

**Where is system status?** See our System Status policy for how we publish incidents and maintenance.

**How is AI used?** See AI Usage Disclosure — outputs may require human review.

**Can you change data on our behalf?** We generally do not modify Customer Content without authorised administrator instruction, except as needed to restore service or address a confirmed security issue.

**How do I add or remove users?** Organisation administrators manage seats and roles in admin settings. Seat limits follow your plan; contact billing@iprojectx.com for expansions.

## 4. What Support Covers

We assist with product defects, availability issues, account access problems, and guidance on documented features. We do not provide unlimited custom consulting, legal advice, or configuration of unrelated third-party systems unless agreed in a statement of work.

Priority is given to P1/P2 issues affecting production access. Enhancement requests are logged as product feedback and are not subject to SLA fix timelines.

## 5. Escalations and Complaints

If you are unsatisfied with a support outcome, escalate to complaints@iprojectx.com with your original ticket reference. See Contact & Complaints for acknowledgement and resolution timeframes.

## 6. Updates

Help resources and channels may evolve; this page reflects current practice. For plan-specific entitlements, refer to Pricing & Plans and your order form.
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'support-help';

-- ──────────────────────────────────────────────────────────
-- system-status
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX communicates the operational health of the Services so customers can plan work and understand incidents.

## 1. Status Updates

We publish service status information through our status channel (status page and/or in-app notices). Administrators may also receive email for material incidents affecting availability or security. For the latest operational view, check the status page linked from the product or marketing site when available, or contact support@iprojectx.com.

Status messaging is intended to be factual and timely. During fast-moving incidents, early updates may be brief and refined as we learn more.

## 2. What We Report

Status communications typically cover:

- **Operational** — no known platform-wide issues
- **Degraded performance** — elevated errors or latency
- **Partial outage** — subset of features or regions affected
- **Major outage** — primary application unavailable
- **Maintenance** — planned work windows

Component-level notes (authentication, API, file storage, AI features, etc.) may be included when useful. Not every minor bug is elevated to a status event; issues limited to a single organisation are usually handled via support tickets.

## 3. Maintenance

Scheduled maintenance is announced in advance when downtime is expected to be material — typically at least forty-eight (48) hours ahead for windows expected to exceed fifteen (15) minutes, where practicable. Emergency maintenance may occur with little notice when required to protect security or data integrity. We minimise duration and impact wherever practical and prefer rolling or low-disruption deployments when feasible.

## 4. Incident History

After significant incidents, we may post a summary of impact and resolution on the status page. Detailed forensic information is shared with affected customers through private channels when appropriate. Historical status entries help customers understand past reliability; they are not a warranty of future performance. Formal availability commitments and credits are governed by the SLA.

Customers who believe an outage qualifies for a service credit should follow the credit-request process in the SLA rather than relying solely on status-page text.

## 5. Customer Actions During Incidents

- Check the status page before opening duplicate tickets
- Preserve error messages and timestamps
- Ensure local network and SSO providers are healthy
- For suspected account compromise, contact security@iprojectx.com immediately
- Designate an internal contact who can approve urgent configuration changes if requested

## 6. Relationship to Other Policies

System Status describes communication practices. The SLA defines measurable uptime and credits. The Incident Response Policy covers security breach handling and customer notification timelines for personal data incidents.

## 7. Contact

Support: support@iprojectx.com  
Security: security@iprojectx.com  
Billing (credits): billing@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'system-status';

-- ──────────────────────────────────────────────────────────
-- customer-responsibilities
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
Using iProjectX effectively and safely is a shared responsibility. This policy outlines what Customer organisations and their users must do when using the Services.

## 1. Account Security

Customers must:

- Assign accounts only to authorised individuals
- Require strong, unique credentials and protect them from sharing
- Revoke access promptly when staff leave or change roles
- Enable available security features (such as SSO or MFA where offered)
- Notify security@iprojectx.com and support@iprojectx.com of suspected unauthorised access
- Avoid storing passwords in shared documents or chat channels

iProjectX is not responsible for losses arising from compromised Customer credentials or mismanaged user permissions.

## 2. Data Accuracy and Lawfulness

Customers are responsible for the accuracy, quality, and legality of Customer Content. You must ensure you have a lawful basis and any required notices or consents to upload personal data, and that content does not infringe third-party rights. iProjectX does not independently verify the correctness of project data, forecasts, or decisions recorded in the platform.

If you process special categories of personal data or highly regulated information, confirm that your plan and configuration are appropriate before doing so.

## 3. Authorised Users and Administrators

Customer must designate administrators who correctly configure roles, billing contacts, and retention practices. Administrators act on behalf of Customer; instructions from administrators are treated as Customer instructions under our DPA.

Keep administrator contact details current so we can reach you during incidents or billing events.

## 4. Acceptable Use

Users must comply with the Acceptable Use Policy, Terms of Service, and applicable law. Customer is responsible for its users’ conduct, including contractors and temporary staff granted access.

## 5. Configuration and Backups of Customer-Managed Artefacts

Where the product allows exports or integrations, Customer should maintain appropriate internal records and export practices for business continuity. Relying solely on any single SaaS system without Customer-side continuity planning is at Customer’s risk, except as expressly covered by our SLA.

Test critical integrations after changes to identity providers, network rules, or API credentials.

## 6. AI and Automated Outputs

If Customer enables AI features, Customer must ensure human review appropriate to the risk of the decision, and must not use outputs as the sole basis for significant legal, financial, safety, or employment decisions without independent verification. See AI Usage Disclosure.

## 7. Cooperation

Customers agree to provide timely information reasonably required to diagnose issues, fulfil data-protection requests directed to Customer, and investigate incidents. Delayed responses may extend resolution times outside SLA targets.

## 8. Contact

Support: support@iprojectx.com  
Security: security@iprojectx.com  
Privacy: privacy@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'customer-responsibilities';

-- ──────────────────────────────────────────────────────────
-- ai-usage-disclosure
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX may offer artificial intelligence (AI) and machine-learning features that assist with drafting, summarising, classifying, suggesting, or analysing content within the platform. This disclosure explains how those features work at a high level and their limitations.

## 1. How AI Outputs Are Created

AI features may send relevant prompts, selected Customer Content, and contextual metadata to models operated by iProjectX and/or approved subprocessors to generate suggestions or transformed text. Processing is performed to provide the feature you invoke, to maintain safety filters, and to improve reliability of the feature under our privacy and security commitments.

We design AI features to operate within your authenticated workspace context. We do not sell your prompts or Customer Content to train third-party foundation models for unrelated public use. Where a vendor’s terms require specific handling, we bind them contractually as subprocessors.

Some features may use retrieval over your workspace content so answers stay grounded in your projects; grounding reduces but does not eliminate error.

## 2. Accuracy Limits

AI outputs can be incomplete, outdated, biased, or incorrect. They may omit critical risks, invent plausible-sounding details, or misread source material. **AI outputs are assistive only** and are not a substitute for professional judgement, qualified advice, or your organisation’s governance processes.

You should independently verify facts, figures, legal or compliance interpretations, schedules, cost estimates, and recommendations before relying on them for decisions. Confidence language in an output does not mean the content is verified.

## 3. Human Review

Customer must ensure an appropriately skilled human reviews AI-assisted content before it is used for external communications, regulatory submissions, financial approvals, safety-critical decisions, or employment-related actions. Administrators should set internal policies for when AI may be used and how review is evidenced.

## 4. Customer Responsibilities for Inputs

Do not submit secrets, unnecessary sensitive personal data, or content you lack rights to process into AI features. Customer remains controller of personal data included in prompts and source documents. Users should minimise personal data in prompts where possible.

## 5. Availability and Changes

AI features may be limited by plan, region, or capacity. We may modify, throttle, or discontinue AI functionality as models, regulations, and safety requirements evolve. Beta AI features may be less reliable and are provided without SLA uptime credits unless expressly stated.

## 6. Intellectual Property

Subject to the Terms of Service, Customer retains rights in Customer Content. Ownership of model outputs may depend on applicable law and vendor terms; regardless, Customer is responsible for ensuring its use of outputs does not infringe others’ rights.

## 7. Transparency to End Users

Where your organisation redistributes AI-assisted content externally, you are responsible for any disclosures required by law or your own policies.

## 8. Contact

Questions: support@iprojectx.com  
Privacy: privacy@iprojectx.com  
Security: security@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'ai-usage-disclosure';

-- ──────────────────────────────────────────────────────────
-- disclaimer
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Disclaimer applies to the iProjectX websites, documentation, and Services. It should be read with our Terms of Service.

## 1. No Guarantee of Business Outcomes

iProjectX provides software tools to support project and portfolio management. We do not guarantee that use of the Services will achieve any particular business result, including on-time delivery, cost savings, regulatory approval, funding outcomes, profit, or risk reduction. Project success depends on Customer’s people, processes, data quality, and external factors outside our control.

Forecasts, dashboards, risk scores, and similar views reflect the data and assumptions you provide. They are decision-support aids, not assurances of future performance.

## 2. Informational Content

Blog posts, guides, templates, examples, and AI-generated suggestions are for general informational purposes. They are not legal, financial, engineering, or professional advice. You should obtain advice from qualified professionals for your circumstances.

Training materials and sample configurations may not match your organisation’s policies or regulatory environment. Adapt them carefully before operational use.

## 3. Availability and Accuracy

While we strive for reliable service and accurate documentation, content and features may contain errors or become outdated. Temporary interruptions may occur. Formal availability commitments are limited to those in the SLA for eligible paid plans.

Screenshots and marketing descriptions may lag behind the live product. Where documentation conflicts with the in-product experience, the live Services and your order form prevail for feature entitlement questions.

## 4. Third-Party Materials

Links to third-party sites or integrations are provided for convenience. iProjectX does not control and is not responsible for third-party content, policies, or performance. Use of third-party services is at your own risk and subject to those providers’ terms.

## 5. Limitation of Liability

To the maximum extent permitted by law, iProjectX excludes liability for indirect, incidental, special, consequential, or punitive damages, and for lost profits, revenue, goodwill, or data, arising from use of or reliance on the Services or site content. Our aggregate liability is limited as set out in the Terms of Service (generally, fees paid in the twelve months preceding the claim). Nothing in this Disclaimer excludes liability that cannot be excluded under Australian Consumer Law or other mandatory rules.

## 6. Forward-Looking Statements

Statements about planned features, roadmaps, or future capabilities are aspirational and may change. They do not create contractual obligations unless expressly incorporated into a signed order form.

## 7. Acceptance

By using the Services or site, you acknowledge this Disclaimer. If you do not agree, do not use the Services.

## 8. Contact

General: hello@iprojectx.com  
Support: support@iprojectx.com  
Legal / complaints: complaints@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'disclaimer';
-- ──────────────────────────────────────────────────────────
-- contact-complaints
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX welcomes feedback and takes complaints seriously. This page explains how to contact us and how we handle formal complaints.

## 1. Primary Contacts

| Topic | Email |
|-------|-------|
| Customer support | support@iprojectx.com |
| General enquiries | hello@iprojectx.com |
| Billing | billing@iprojectx.com |
| Privacy | privacy@iprojectx.com |
| Security | security@iprojectx.com |
| Formal complaints | complaints@iprojectx.com |

## 2. Before Filing a Complaint

Many issues resolve faster through ordinary support. Please contact support@iprojectx.com first for product defects, access problems, or how-to questions, and billing@iprojectx.com for invoice concerns. If you remain unsatisfied after a reasonable attempt, escalate to complaints@iprojectx.com.

## 3. How to Submit a Complaint

Email complaints@iprojectx.com with:

- Your name, organisation, and account email
- A clear description of the issue and desired resolution
- Relevant dates, ticket numbers, invoices, or screenshots
- Whether the matter involves privacy, security, billing, or service quality

## 4. Acknowledgement and Resolution Timeframes

- **Acknowledgement:** We aim to acknowledge formal complaints within **two (2) business days**.
- **Investigation:** We investigate in good faith, which may include reviewing logs, speaking with support staff, and contacting you for clarification.
- **Substantive response:** We aim to provide a substantive response within **fifteen (15) business days** of acknowledgement for standard matters. Complex issues (for example multi-party security or legal questions) may take longer; we will notify you of revised timelines.
- **Privacy complaints:** Privacy-related complaints may also be sent to privacy@iprojectx.com; we handle them under our Privacy Policy and applicable law. You may have rights to escalate to a regulator such as the OAIC in Australia.

## 5. Escalation

If you are not satisfied with the outcome, reply to the complaints thread requesting escalation to a senior reviewer. Enterprise customers may also use escalation paths named in their agreement.

## 6. Good Faith

We expect complaints to be made in good faith with accurate information. Abusive or vexatious correspondence may be limited in accordance with our Acceptable Use Policy.

## 7. Related Policies

Support & Help, Refund & Cancellation, Privacy Policy, Incident Response, and Terms of Service provide additional detail on specific topics.
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'contact-complaints';


-- =============================================================================
-- 20260724210000_support_tickets.sql
-- =============================================================================

-- ============================================================
-- Support tickets: user logging + platform admin review
-- Org enablement: off / org_admin only / all users
-- ============================================================

CREATE TABLE IF NOT EXISTS public.org_support_settings (
  org_id     uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled    boolean NOT NULL DEFAULT false,
  audience   text NOT NULL DEFAULT 'org_admin'
             CHECK (audience IN ('org_admin', 'all_users')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  category    text NOT NULL DEFAULT 'General',
  priority    text NOT NULL DEFAULT 'Medium'
              CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
  status      text NOT NULL DEFAULT 'Open'
              CHECK (status IN ('Open', 'In Progress', 'Waiting on User', 'Resolved', 'Closed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS support_tickets_org_idx
  ON public.support_tickets (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON public.support_tickets (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_created_by_idx
  ON public.support_tickets (created_by);

CREATE TABLE IF NOT EXISTS public.support_ticket_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_comments_ticket_idx
  ON public.support_ticket_comments (ticket_id, created_at);

-- Keep ticket.updated_at fresh when comments are added
CREATE OR REPLACE FUNCTION public.tg_support_ticket_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
     SET updated_at = now()
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_comment_touch ON public.support_ticket_comments;
CREATE TRIGGER trg_support_comment_touch
  AFTER INSERT ON public.support_ticket_comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_ticket_touch();

CREATE OR REPLACE FUNCTION public.tg_support_ticket_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IN ('Resolved', 'Closed') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.resolved_at := coalesce(NEW.resolved_at, now());
  ELSIF NEW.status NOT IN ('Resolved', 'Closed') THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_updated ON public.support_tickets;
CREATE TRIGGER trg_support_ticket_updated
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_ticket_set_updated_at();

-- Can this user use Support for the given org?
CREATE OR REPLACE FUNCTION public.can_use_org_support(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled  boolean;
  v_audience text;
BEGIN
  IF p_user_id IS NULL OR p_org_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_platform_admin(p_user_id) THEN
    RETURN true;
  END IF;

  IF public.get_user_org(p_user_id) IS DISTINCT FROM p_org_id THEN
    RETURN false;
  END IF;

  SELECT s.enabled, s.audience
    INTO v_enabled, v_audience
    FROM public.org_support_settings s
   WHERE s.org_id = p_org_id;

  IF NOT FOUND OR coalesce(v_enabled, false) = false THEN
    RETURN false;
  END IF;

  IF v_audience = 'all_users' THEN
    RETURN true;
  END IF;

  -- org_admin audience
  RETURN public.has_any_admin(p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_use_org_support(uuid, uuid) TO authenticated;

ALTER TABLE public.org_support_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_comments ENABLE ROW LEVEL SECURITY;

-- ── Settings ──────────────────────────────────────────────
CREATE POLICY "org_support_settings_platform_all"
  ON public.org_support_settings FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Org members can read their own org's setting (to gate UI)
CREATE POLICY "org_support_settings_org_select"
  ON public.org_support_settings FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

-- ── Tickets ───────────────────────────────────────────────
CREATE POLICY "support_tickets_platform_all"
  ON public.support_tickets FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "support_tickets_org_select"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.can_use_org_support(auth.uid(), org_id)
    AND (
      created_by = auth.uid()
      OR public.has_any_admin(auth.uid())
    )
  );

CREATE POLICY "support_tickets_org_insert"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND created_by = auth.uid()
    AND public.can_use_org_support(auth.uid(), org_id)
  );

-- Status / field updates are platform-admin only (platform_all policy).
-- Org users reply via support_ticket_comments.

-- ── Comments ──────────────────────────────────────────────
CREATE POLICY "support_comments_platform_all"
  ON public.support_ticket_comments FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "support_comments_org_select"
  ON public.support_ticket_comments FOR SELECT
  TO authenticated
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.org_id = public.get_user_org(auth.uid())
        AND public.can_use_org_support(auth.uid(), t.org_id)
        AND (
          t.created_by = auth.uid()
          OR public.has_any_admin(auth.uid())
        )
    )
  );

CREATE POLICY "support_comments_org_insert"
  ON public.support_ticket_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.org_id = public.get_user_org(auth.uid())
        AND public.can_use_org_support(auth.uid(), t.org_id)
        AND t.status NOT IN ('Closed')
        AND (
          t.created_by = auth.uid()
          OR public.has_any_admin(auth.uid())
        )
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.org_support_settings TO authenticated;
GRANT ALL ON public.org_support_settings TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

GRANT SELECT, INSERT ON public.support_ticket_comments TO authenticated;
GRANT ALL ON public.support_ticket_comments TO service_role;

-- Notify ticket creator when platform adds a public comment or status changes.
-- Implemented in app for simplicity; DB trigger optional later.

COMMENT ON TABLE public.org_support_settings IS
  'Platform-admin toggle: enable Support for org_admin only or all users in an organisation.';
COMMENT ON TABLE public.support_tickets IS
  'Support tickets logged by organisation users; reviewed by platform admins.';
COMMENT ON TABLE public.support_ticket_comments IS
  'Threaded comments on support tickets. is_internal=true is platform-only.';


-- =============================================================================
-- 20260724220000_projects_portfolio.sql
-- =============================================================================

-- Portfolio label on the project register (data editor + executive filters).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS portfolio text;

COMMENT ON COLUMN public.projects.portfolio IS
  'Portfolio grouping for the project (e.g. Business Strategic, IT Run). Editable in Data Editor.';

CREATE INDEX IF NOT EXISTS projects_org_portfolio_idx
  ON public.projects (org_id, portfolio);


-- =============================================================================
-- 20260724230000_ensure_decision_approver_columns.sql
-- =============================================================================

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


-- =============================================================================
-- 20260725120000_security_hardening.sql
-- =============================================================================

-- ============================================================
-- Security hardening (SOC2 / ASVS L2 / multi-tenant SaaS)
-- 1) Lock profile org_id on self-update (tenant escape)
-- 2) Guard create_org_and_join (no org hopping)
-- 3) Restrict open organizations INSERT
-- 4) Align project_streams SELECT with project visibility
-- 5) Ensure role_table_permissions exists + RLS
-- 6) Restrict forgeable audit_events INSERT (trigger stays SECURITY DEFINER)
-- 7) EOI: remove open anon INSERT (submit via server fn + service role)
-- ============================================================

-- 1) profiles: block tenant escape via org_id reassignment (trigger; works with SECURITY DEFINER RPCs)
CREATE OR REPLACE FUNCTION public.tg_profiles_lock_org_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    -- Service role / system jobs often have no JWT
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    -- First assignment during onboarding (null → org)
    IF OLD.org_id IS NULL THEN
      RETURN NEW;
    END IF;
    -- Platform admins may re-home users
    IF public.is_platform_admin(auth.uid()) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'cannot change organisation membership directly';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_lock_org_id ON public.profiles;
CREATE TRIGGER trg_profiles_lock_org_id
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_lock_org_id();

-- Keep self-update policy; org_id lock is enforced by trigger above
DROP POLICY IF EXISTS "profile_update_own" ON public.profiles;
CREATE POLICY "profile_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 2) create_org_and_join: refuse users who already belong to an org
CREATE OR REPLACE FUNCTION public.create_org_and_join(_name TEXT, _slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org UUID;
  existing_org UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT org_id INTO existing_org FROM public.profiles WHERE id = auth.uid();
  IF existing_org IS NOT NULL THEN
    RAISE EXCEPTION 'already belongs to an organisation';
  END IF;

  IF length(trim(_name)) < 2 THEN
    RAISE EXCEPTION 'organisation name too short';
  END IF;
  IF _slug !~ '^[a-z0-9-]+$' OR length(_slug) < 2 THEN
    RAISE EXCEPTION 'invalid organisation slug';
  END IF;

  INSERT INTO public.organizations (name, slug)
  VALUES (trim(_name), lower(_slug))
  RETURNING id INTO new_org;

  UPDATE public.profiles
  SET org_id = new_org
  WHERE id = auth.uid()
    AND org_id IS NULL;

  INSERT INTO public.user_roles (user_id, org_id, role)
  VALUES (auth.uid(), new_org, 'org_admin');

  RETURN new_org;
END;
$$;

REVOKE ALL ON FUNCTION public.create_org_and_join(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_org_and_join(TEXT, TEXT) TO authenticated;

-- 3) organizations INSERT: platform admins only (RPC create_org_and_join is SECURITY DEFINER)
DROP POLICY IF EXISTS "org_insert_any_auth" ON public.organizations;
DROP POLICY IF EXISTS "org_insert_platform_admin" ON public.organizations;
CREATE POLICY "org_insert_platform_admin" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 4) project_streams: respect project visibility rules
DROP POLICY IF EXISTS "org read project_streams" ON public.project_streams;
CREATE POLICY "org read project_streams" ON public.project_streams
  FOR SELECT TO authenticated
  USING (public.user_can_view_project(auth.uid(), project_id));

-- 5) role_table_permissions (present in generated types / UI; ensure RLS in source of truth)
CREATE TABLE IF NOT EXISTS public.role_table_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  table_name text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, role, table_name)
);

ALTER TABLE public.role_table_permissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_table_permissions TO authenticated;
GRANT ALL ON public.role_table_permissions TO service_role;

DROP POLICY IF EXISTS "rtp_read_org" ON public.role_table_permissions;
CREATE POLICY "rtp_read_org" ON public.role_table_permissions
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "rtp_admin_write" ON public.role_table_permissions;
CREATE POLICY "rtp_admin_write" ON public.role_table_permissions
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

-- 6) audit_events: stop arbitrary member forgery; keep SECURITY DEFINER trigger inserts
DROP POLICY IF EXISTS "org insert audit_events" ON public.audit_events;
CREATE POLICY "org insert audit_events" ON public.audit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND public.has_any_admin(auth.uid())
  );

-- 7) EOI: close open public INSERT (submissions go through authenticated server fn + service role)
DROP POLICY IF EXISTS "eoi_insert_public" ON public.eoi_requests;
-- Keep platform admin write paths; no public insert policy.

COMMENT ON TABLE public.role_table_permissions IS
  'UI capability matrix per org/role. RLS: members read; org admins write.';


-- =============================================================================
-- 20260725160000_security_events_and_eoi_revoke.sql
-- =============================================================================

-- ============================================================
-- 1) Platform-level security_events (org_id optional)
--    Fixes login/logout/failed-login when user has no org yet.
-- 2) Revoke leftover EOI INSERT grants from anon/authenticated
-- ============================================================

CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_type text NOT NULL DEFAULT 'security',
  entity_id uuid,
  summary text NOT NULL,
  email text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_security_events_created
  ON public.security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type
  ON public.security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_email
  ON public.security_events (email, created_at DESC);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;

DROP POLICY IF EXISTS "security_events_platform_read" ON public.security_events;
CREATE POLICY "security_events_platform_read" ON public.security_events
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- No client INSERT — only service role / server writes

-- EOI: RLS already dropped public insert; also revoke table grants
REVOKE INSERT ON public.eoi_requests FROM anon, authenticated;

COMMENT ON TABLE public.security_events IS
  'Immutable-ish security audit stream (login/logout/failures). Service-role writes; platform_admin read.';


-- =============================================================================
-- 20260725170000_audit_events_admin_read.sql
-- =============================================================================

-- Org audit log: readable by org admins (+ platform admins), not all members.
-- Inserts remain org-admin-only (from prior hardening) / SECURITY DEFINER triggers.

DROP POLICY IF EXISTS "org read audit_events" ON public.audit_events;
CREATE POLICY "org read audit_events" ON public.audit_events
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      org_id = public.get_user_org(auth.uid())
      AND public.has_any_admin(auth.uid())
    )
  );

COMMENT ON POLICY "org read audit_events" ON public.audit_events IS
  'Tenant audit trail: org_admin/admin of that org, or platform_admin.';


-- =============================================================================
-- 20260725190000_org_inhouse_ai_model_enabled.sql
-- =============================================================================

-- Per-organisation opt-in for the approved In-house AI model.
-- Default FALSE: customer portfolio context never leaves the local engine
-- unless a platform_admin explicitly enables the org.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS inhouse_ai_model_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.inhouse_ai_model_enabled IS
  'When true AND server INHOUSE_AI_* is configured, In-house AI may send a capped RLS context pack to the approved model endpoint. Default false — local engine only.';

-- Only platform_admin (or service role with no JWT) may flip this entitlement.
CREATE OR REPLACE FUNCTION public.tg_organizations_lock_inhouse_ai_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.inhouse_ai_model_enabled IS DISTINCT FROM OLD.inhouse_ai_model_enabled THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role / system
    END IF;
    IF public.is_platform_admin(auth.uid()) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'only platform_admin can change inhouse_ai_model_enabled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_lock_inhouse_ai_flag ON public.organizations;
CREATE TRIGGER trg_organizations_lock_inhouse_ai_flag
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_organizations_lock_inhouse_ai_flag();


-- =============================================================================
-- 20260725193000_org_sso_config.sql
-- =============================================================================

-- Per-organisation SSO (SAML) settings for white-label login.
-- Actual IdP registration still happens in Supabase (dashboard/CLI).
-- This stores the org ↔ provider mapping and enables the SSO button on /o/{slug}/login.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS sso_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sso_provider_id text NULL,
  ADD COLUMN IF NOT EXISTS sso_domains text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sso_button_label text NULL;

COMMENT ON COLUMN public.organizations.sso_enabled IS
  'When true, white-label login shows Sign in with SSO (requires sso_provider_id or sso_domains).';
COMMENT ON COLUMN public.organizations.sso_provider_id IS
  'Supabase Auth SSO provider UUID from `supabase sso add` / dashboard.';
COMMENT ON COLUMN public.organizations.sso_domains IS
  'Email domains for SP-initiated SSO (e.g. acme.com). Optional if provider_id is set.';
COMMENT ON COLUMN public.organizations.sso_button_label IS
  'Optional button label on org login, e.g. "Sign in with Acme SSO".';

CREATE OR REPLACE FUNCTION public.tg_organizations_lock_sso_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.sso_enabled IS DISTINCT FROM OLD.sso_enabled
    OR NEW.sso_provider_id IS DISTINCT FROM OLD.sso_provider_id
    OR NEW.sso_domains IS DISTINCT FROM OLD.sso_domains
    OR NEW.sso_button_label IS DISTINCT FROM OLD.sso_button_label
  ) THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF public.is_platform_admin(auth.uid()) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'only platform_admin can change organisation SSO settings';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_lock_sso_fields ON public.organizations;
CREATE TRIGGER trg_organizations_lock_sso_fields
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_organizations_lock_sso_fields();


-- =============================================================================
-- 20260726093000_scope_admin_roles_to_home_org.sql
-- =============================================================================

-- Scope admin/role helpers to the user's home organisation (profiles.org_id).
-- Previously has_any_admin / has_role ignored user_roles.org_id, so a leftover
-- org_admin row for org B could elevate privileges inside org A.

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (
        -- Platform admins are global.
        _role = 'platform_admin'::public.app_role
        OR ur.org_id = public.get_user_org(_user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin'::public.app_role, 'org_admin'::public.app_role)
      AND ur.org_id = public.get_user_org(_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = _project_id
      AND p.org_id = public.get_user_org(_user_id)
      AND (
        public.has_any_admin(_user_id)
        OR p.pm_user_id = _user_id
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = _user_id
            AND ur.role = 'bu_lead'::public.app_role
            AND ur.org_id = p.org_id
            AND (ur.bu_id IS NULL OR ur.bu_id = p.bu_id)
        )
      )
  );
$$;

COMMENT ON FUNCTION public.has_any_admin(UUID) IS
  'True when user has admin/org_admin for their home org (profiles.org_id).';
COMMENT ON FUNCTION public.has_role(UUID, public.app_role) IS
  'Role check scoped to home org, except platform_admin which is global.';


-- =============================================================================
-- 20260726120000_page_download_ui_config.sql
-- =============================================================================

-- Page download allow/deny is stored in existing JSON configs (no new columns):
--   organizations.ui_config.page_download
--   landing_config.config.page_download
-- Document the org shape for operators.

COMMENT ON COLUMN public.organizations.ui_config IS
  'Org UI JSON: navigation, branding, style_theme, project_visibility, page_download (per-page PDF/PPT/PNG allow map), etc.';


-- =============================================================================
-- 20260729120000_org_byod_connections.sql
-- =============================================================================

-- Bring Your Own Database (BYOD) — per-organisation customer Supabase connectivity.
-- Secrets are stored as AES-GCM ciphertext; access is service-role / server-fn only.
-- Default orgs keep using the shared iProjectX Supabase (byod_active = false).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS byod_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.byod_active IS
  'True when this org routes tenant data to a customer-hosted Supabase (BYOD). Control-plane data always stays on iProjectX.';

CREATE TABLE IF NOT EXISTS public.org_byod_connections (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'supabase'
    CHECK (provider IN ('supabase')),
  supabase_url text,
  -- Publishable/anon key (not as sensitive as service role; still server-managed)
  publishable_key text,
  -- AES-256-GCM ciphertext + nonce (base64). Never returned to clients.
  secret_ciphertext text,
  secret_nonce text,
  secret_configured boolean NOT NULL DEFAULT false,
  secret_hint text,
  status text NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured', 'configured', 'tested', 'active', 'error')),
  last_tested_at timestamptz,
  last_error text,
  notes text,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_byod_connections_status_idx
  ON public.org_byod_connections (status)
  WHERE enabled = true;

COMMENT ON TABLE public.org_byod_connections IS
  'Platform-admin BYOD config. Ciphertext columns are never exposed via client RLS; use server functions only.';

ALTER TABLE public.org_byod_connections ENABLE ROW LEVEL SECURITY;

-- No authenticated policies: browser clients cannot read or write this table.
-- Platform admins manage rows exclusively through service-role server functions.

REVOKE ALL ON public.org_byod_connections FROM PUBLIC;
REVOKE ALL ON public.org_byod_connections FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_byod_connections TO service_role;

-- Safe status view for future org-admin read-only (no ciphertext). Not granted to authenticated yet.
CREATE OR REPLACE VIEW public.org_byod_status
WITH (security_invoker = true)
AS
SELECT
  c.org_id,
  c.enabled,
  c.provider,
  c.status,
  c.secret_configured,
  c.secret_hint,
  c.last_tested_at,
  c.last_error,
  c.updated_at,
  o.byod_active
FROM public.org_byod_connections c
JOIN public.organizations o ON o.id = c.org_id;

REVOKE ALL ON public.org_byod_status FROM PUBLIC;
REVOKE ALL ON public.org_byod_status FROM anon, authenticated;
GRANT SELECT ON public.org_byod_status TO service_role;


-- =============================================================================
-- 20260729180000_timesheets.sql
-- =============================================================================

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


-- =============================================================================
-- 20260729193000_roles_timesheet_cost.sql
-- =============================================================================

-- Custom org roles, timesheet billable/non-billable, labor cost rollup from hourly rates.

-- ========== 1) ORG ROLES CATALOG ==========
CREATE TABLE IF NOT EXISTS public.org_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  label text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, role_key),
  CONSTRAINT org_roles_key_format CHECK (role_key ~ '^[a-z][a-z0-9_]{1,62}$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_roles TO authenticated;
GRANT ALL ON public.org_roles TO service_role;
ALTER TABLE public.org_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read org_roles" ON public.org_roles;
CREATE POLICY "org read org_roles" ON public.org_roles
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "admins write org_roles" ON public.org_roles;
CREATE POLICY "admins write org_roles" ON public.org_roles
  FOR ALL TO authenticated
  USING (
    (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
    OR public.is_platform_admin(auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_org_roles_org ON public.org_roles(org_id, sort_order);

-- Seed system roles for every organisation
INSERT INTO public.org_roles (org_id, role_key, label, description, is_system, sort_order)
SELECT o.id, v.role_key, v.label, v.description, true, v.sort_order
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('admin', 'Admin', 'Full organisation administrator', 10),
    ('org_admin', 'Org Admin', 'Organisation administrator', 20),
    ('bu_lead', 'BU Lead', 'Business unit lead', 30),
    ('pm', 'Project Manager', 'Project delivery manager', 40),
    ('executive', 'Executive', 'Executive / portfolio viewer', 50)
) AS v(role_key, label, description, sort_order)
ON CONFLICT (org_id, role_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tg_seed_org_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.org_roles (org_id, role_key, label, description, is_system, sort_order)
  VALUES
    (NEW.id, 'admin', 'Admin', 'Full organisation administrator', true, 10),
    (NEW.id, 'org_admin', 'Org Admin', 'Organisation administrator', true, 20),
    (NEW.id, 'bu_lead', 'BU Lead', 'Business unit lead', true, 30),
    (NEW.id, 'pm', 'Project Manager', 'Project delivery manager', true, 40),
    (NEW.id, 'executive', 'Executive', 'Executive / portfolio viewer', true, 50)
  ON CONFLICT (org_id, role_key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_org_roles ON public.organizations;
CREATE TRIGGER trg_seed_org_roles
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_org_roles();

-- Convert role columns from enum → text so custom roles can be stored.
-- Postgres forbids ALTER TYPE on a column while RLS policies reference it
-- (e.g. cert_org_admin_select on org_license_certificates). Drop dependents,
-- alter, then recreate.
DROP POLICY IF EXISTS "cert_org_admin_select" ON public.org_license_certificates;

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE text USING role::text;

ALTER TABLE public.role_table_permissions
  ALTER COLUMN role TYPE text USING role::text;

-- Recreate policy that referenced user_roles.role (now text).
CREATE POLICY "cert_org_admin_select"
  ON public.org_license_certificates FOR SELECT
  TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id  = public.get_user_org(auth.uid())
        AND ur.role IN ('admin','org_admin')
    )
  );

-- has_role / has_any_admin accept text
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (
        _role = 'platform_admin'
        OR ur.org_id IS NULL
        OR ur.org_id = public.get_user_org(_user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin', 'org_admin')
      AND ur.org_id = public.get_user_org(_user_id)
  );
$$;

-- ========== 2) TIMESHEET BILLABLE / NON-BILLABLE + LABOR COST ==========
ALTER TABLE public.timesheet_entries
  ALTER COLUMN project_id DROP NOT NULL,
  ALTER COLUMN work_item_id DROP NOT NULL;

ALTER TABLE public.timesheet_entries
  ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS custom_task text,
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS labor_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE SET NULL;

-- Replace unique (timesheet_id, work_item_id) with partial uniques
ALTER TABLE public.timesheet_entries
  DROP CONSTRAINT IF EXISTS timesheet_entries_timesheet_id_work_item_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_timesheet_entries_billable_wi
  ON public.timesheet_entries (timesheet_id, work_item_id)
  WHERE billable = true AND work_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_timesheet_entries_nonbillable_task
  ON public.timesheet_entries (timesheet_id, lower(custom_task))
  WHERE billable = false AND custom_task IS NOT NULL;

ALTER TABLE public.timesheet_entries
  DROP CONSTRAINT IF EXISTS timesheet_entries_billable_shape;

ALTER TABLE public.timesheet_entries
  ADD CONSTRAINT timesheet_entries_billable_shape CHECK (
    (
      billable = true
      AND project_id IS NOT NULL
      AND work_item_id IS NOT NULL
      AND (custom_task IS NULL OR length(trim(custom_task)) = 0)
    )
    OR (
      billable = false
      AND custom_task IS NOT NULL
      AND length(trim(custom_task)) > 0
      AND work_item_id IS NULL
    )
  );

COMMENT ON COLUMN public.resources.cost_rate IS
  'Hourly cost rate (org currency). Used to compute timesheet labor cost → stream/project/portfolio.';

-- Apply approved timesheet labor into financials_monthly.opex_actual and project incurred
CREATE OR REPLACE FUNCTION public.apply_timesheet_labor_cost(_timesheet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.timesheets;
  rate numeric(12,2);
  rec record;
  period date;
  hours numeric;
  cost numeric;
  sid uuid;
BEGIN
  SELECT * INTO t FROM public.timesheets WHERE id = _timesheet_id;
  IF NOT FOUND OR t.status <> 'approved' THEN
    RETURN;
  END IF;

  SELECT COALESCE(r.cost_rate, 0) INTO rate
  FROM public.resources r
  WHERE r.id = t.resource_id OR (r.org_id = t.org_id AND r.user_id = t.user_id)
  ORDER BY CASE WHEN r.id = t.resource_id THEN 0 ELSE 1 END
  LIMIT 1;
  rate := COALESCE(rate, 0);

  -- Stamp entry costs (billable only contributes to project financials)
  UPDATE public.timesheet_entries e
  SET hourly_rate = rate,
      labor_cost = ROUND(
        rate * (e.hours_mon + e.hours_tue + e.hours_wed + e.hours_thu
                + e.hours_fri + e.hours_sat + e.hours_sun),
        2
      ),
      stream_id = COALESCE(
        e.stream_id,
        (SELECT wi.stream_id FROM public.work_items wi WHERE wi.id = e.work_item_id)
      )
  WHERE e.timesheet_id = t.id;

  IF rate <= 0 THEN
    RETURN; -- no rate configured — hours still logged, no $ rollup
  END IF;

  -- Distribute billable cost into the week_start month (OpEx actual) per project/stream
  period := date_trunc('month', t.week_start)::date;

  FOR rec IN
    SELECT e.project_id,
           COALESCE(e.stream_id, wi.stream_id) AS stream_id,
           SUM(e.labor_cost) AS cost
    FROM public.timesheet_entries e
    LEFT JOIN public.work_items wi ON wi.id = e.work_item_id
    WHERE e.timesheet_id = t.id
      AND e.billable = true
      AND e.project_id IS NOT NULL
    GROUP BY e.project_id, COALESCE(e.stream_id, wi.stream_id)
  LOOP
    sid := rec.stream_id;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id AND COALESCE(is_default, false) = true
      LIMIT 1;
    END IF;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id
      ORDER BY sort_order NULLS LAST
      LIMIT 1;
    END IF;

    -- Upsert into stream-aware unique indexes
    IF sid IS NOT NULL THEN
      UPDATE public.financials_monthly
      SET opex_actual = COALESCE(opex_actual, 0) + rec.cost
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id = sid;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month, opex_actual
        ) VALUES (t.org_id, rec.project_id, sid, period, rec.cost);
      END IF;
    ELSE
      UPDATE public.financials_monthly
      SET opex_actual = COALESCE(opex_actual, 0) + rec.cost
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id IS NULL;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month, opex_actual
        ) VALUES (t.org_id, rec.project_id, NULL, period, rec.cost);
      END IF;
    END IF;
  END LOOP;

  -- Recompute project incurred from monthly actuals for touched projects
  FOR rec IN
    SELECT DISTINCT project_id FROM public.timesheet_entries
    WHERE timesheet_id = t.id AND billable = true AND project_id IS NOT NULL
  LOOP
    UPDATE public.projects p
    SET
      opex_incurred = COALESCE((
        SELECT SUM(COALESCE(fm.opex_actual, 0)) FROM public.financials_monthly fm
        WHERE fm.project_id = rec.project_id
      ), 0),
      capex_incurred = COALESCE((
        SELECT SUM(COALESCE(fm.capex_actual, 0)) FROM public.financials_monthly fm
        WHERE fm.project_id = rec.project_id
      ), 0)
    WHERE p.id = rec.project_id;
  END LOOP;
END;
$$;

-- Patch act_on_timesheet_approval to call labor cost apply on final RM approve
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval not found'; END IF;
  IF a.approver_user_id <> auth.uid() AND NOT public.has_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'You are not the nominated approver';
  END IF;
  IF a.status <> 'pending' THEN
    RAISE EXCEPTION 'This approval step is already %', a.status;
  END IF;

  SELECT * INTO t FROM public.timesheets WHERE id = a.timesheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timesheet not found'; END IF;

  IF a.step = 'pm' AND t.status <> 'pending_pm' THEN
    RAISE EXCEPTION 'PM approval is not active (status %)', t.status;
  END IF;
  IF a.step = 'rm' AND t.status <> 'pending_rm' THEN
    RAISE EXCEPTION 'Resource Manager approval is not active (status %)', t.status;
  END IF;

  UPDATE public.timesheet_approvals
  SET status = _decision, comment = _comment, acted_at = now()
  WHERE id = a.id;

  IF _decision = 'rejected' THEN
    UPDATE public.timesheets
    SET status = 'rejected', rejected_at = now(), rejected_by = auth.uid(),
        rejection_reason = COALESCE(_comment, 'Rejected')
    WHERE id = t.id
    RETURNING * INTO t;

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      t.user_id, t.org_id, 'timesheet_rejected', 'Timesheet rejected',
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
        status = 'pending', acted_at = NULL, comment = NULL,
        approver_user_id = EXCLUDED.approver_user_id;

      UPDATE public.timesheets SET status = 'pending_rm' WHERE id = t.id RETURNING * INTO t;

      INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
      VALUES (
        t.manager_user_id, t.org_id, 'timesheet_approval',
        'Timesheet awaiting Resource Manager approval',
        'A timesheet for week starting ' || t.week_start::text || ' needs your approval as Resource Manager.',
        '/app/timesheets?tab=approvals'
      );
    END IF;
  ELSIF a.step = 'rm' THEN
    UPDATE public.timesheets SET status = 'approved' WHERE id = t.id RETURNING * INTO t;

    -- Recompute actual hours on work items from approved sheets
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
        AND e.billable = true
        AND e.work_item_id IS NOT NULL
        AND e.work_item_id IN (
          SELECT e2.work_item_id FROM public.timesheet_entries e2
          WHERE e2.timesheet_id = t.id AND e2.work_item_id IS NOT NULL
        )
      GROUP BY e.work_item_id
    ) agg
    WHERE wi.id = agg.work_item_id;

    PERFORM public.apply_timesheet_labor_cost(t.id);

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      t.user_id, t.org_id, 'timesheet_approved', 'Timesheet approved',
      'Your timesheet for week starting ' || t.week_start::text || ' was fully approved.',
      '/app/timesheets'
    );
  END IF;

  SELECT * INTO t FROM public.timesheets WHERE id = COALESCE(t.id, a.timesheet_id);
  RETURN t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.act_on_timesheet_approval(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_timesheet_labor_cost(uuid) TO authenticated;

-- Submit: billable → PM then RM; non-billable-only → RM directly
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
  has_billable boolean;
BEGIN
  SELECT * INTO t FROM public.timesheets WHERE id = _timesheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timesheet not found'; END IF;
  IF t.user_id <> auth.uid() AND NOT public.has_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the timesheet owner can submit';
  END IF;
  IF t.status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Timesheet is not editable (status %)', t.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.timesheet_entries e WHERE e.timesheet_id = t.id) THEN
    RAISE EXCEPTION 'Add at least one row before submitting';
  END IF;

  SELECT r.id, r.manager_user_id INTO rid, mgr
  FROM public.resources r
  WHERE r.org_id = t.org_id AND r.user_id = t.user_id
  LIMIT 1;

  IF mgr IS NULL THEN
    RAISE EXCEPTION 'Resource Manager is not configured for your resource profile. Ask an admin to set your manager.';
  END IF;

  DELETE FROM public.timesheet_approvals WHERE timesheet_id = t.id;

  SELECT EXISTS (
    SELECT 1 FROM public.timesheet_entries e
    WHERE e.timesheet_id = t.id AND e.billable = true
  ) INTO has_billable;

  IF has_billable THEN
    missing_pm := NULL;
    FOR proj IN
      SELECT DISTINCT e.project_id, p.name AS project_name, p.pm_user_id
      FROM public.timesheet_entries e
      JOIN public.projects p ON p.id = e.project_id
      WHERE e.timesheet_id = t.id AND e.billable = true
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
        pm, t.org_id, 'timesheet_approval', 'Timesheet awaiting PM approval',
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
    SET status = 'pending_pm', manager_user_id = mgr, resource_id = rid,
        submitted_at = now(), rejected_at = NULL, rejected_by = NULL, rejection_reason = NULL
    WHERE id = t.id
    RETURNING * INTO t;
  ELSE
    -- Non-billable only → Resource Manager
    INSERT INTO public.timesheet_approvals (org_id, timesheet_id, step, project_id, approver_user_id, status)
    VALUES (t.org_id, t.id, 'rm', NULL, mgr, 'pending');

    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (
      mgr, t.org_id, 'timesheet_approval',
      'Timesheet awaiting Resource Manager approval',
      'A non-billable timesheet for week starting ' || t.week_start::text || ' needs your approval.',
      '/app/timesheets?tab=approvals'
    );

    UPDATE public.timesheets
    SET status = 'pending_rm', manager_user_id = mgr, resource_id = rid,
        submitted_at = now(), rejected_at = NULL, rejected_by = NULL, rejection_reason = NULL
    WHERE id = t.id
    RETURNING * INTO t;
  END IF;

  RETURN t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_timesheet(uuid) TO authenticated;


-- =============================================================================
-- 20260729210000_timesheet_reporting_audit.sql
-- =============================================================================

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


-- =============================================================================
-- 20260729220000_work_item_resource_assignees.sql
-- =============================================================================

-- Work item assignees: assign resources (not login users).
-- Timesheet placeholders resolve via resources.user_id → current login.

-- 1) Add resource_id
ALTER TABLE public.work_item_assignees
  ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES public.resources(id) ON DELETE CASCADE;

-- 2) Backfill from linked resources
UPDATE public.work_item_assignees a
SET resource_id = r.id
FROM public.resources r
WHERE a.resource_id IS NULL
  AND r.org_id = a.org_id
  AND r.user_id IS NOT NULL
  AND a.user_id = r.user_id;

-- 3) Drop rows that cannot be mapped to a resource
DELETE FROM public.work_item_assignees WHERE resource_id IS NULL;

-- 4) Enforce resource_id uniqueness; relax/drop user_id requirement
ALTER TABLE public.work_item_assignees
  ALTER COLUMN resource_id SET NOT NULL;

ALTER TABLE public.work_item_assignees
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.work_item_assignees
  DROP CONSTRAINT IF EXISTS work_item_assignees_work_item_id_user_id_key;

DROP INDEX IF EXISTS public.work_item_assignees_work_item_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_work_item_assignees_resource
  ON public.work_item_assignees (work_item_id, resource_id);

CREATE INDEX IF NOT EXISTS idx_work_item_assignees_resource
  ON public.work_item_assignees (resource_id);

-- Keep user_id denormalised from resource for convenience (nullable)
UPDATE public.work_item_assignees a
SET user_id = r.user_id
FROM public.resources r
WHERE r.id = a.resource_id
  AND a.user_id IS DISTINCT FROM r.user_id;

-- 5) Owner trigger: map owner_user_id → their linked resource
CREATE OR REPLACE FUNCTION public.tg_work_item_owner_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid uuid;
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN
    SELECT r.id INTO rid
    FROM public.resources r
    WHERE r.org_id = NEW.org_id AND r.user_id = NEW.owner_user_id
    LIMIT 1;

    IF rid IS NOT NULL THEN
      INSERT INTO public.work_item_assignees (org_id, work_item_id, resource_id, user_id)
      VALUES (NEW.org_id, NEW.id, rid, NEW.owner_user_id)
      ON CONFLICT (work_item_id, resource_id) DO UPDATE
        SET user_id = EXCLUDED.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_item_owner_assignee ON public.work_items;
CREATE TRIGGER trg_work_item_owner_assignee
  AFTER INSERT OR UPDATE OF owner_user_id
  ON public.work_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_item_owner_assignee();

-- ON CONFLICT for unique index needs constraint name — use index inference:
-- Postgres ON CONFLICT (work_item_id, resource_id) works with unique index.

COMMENT ON TABLE public.work_item_assignees IS
  'Work-item team: resources assigned to the item. Timesheets use resources.user_id.';
COMMENT ON COLUMN public.work_item_assignees.resource_id IS
  'Assigned delivery resource (not the login).';
COMMENT ON COLUMN public.work_item_assignees.user_id IS
  'Optional denormalised login from resources.user_id when linked.';


-- =============================================================================
-- 20260729230000_profile_resource_sync_labor.sql
-- =============================================================================

-- 1) Org member ↔ resource 1:1 sync (same person)
-- 2) Track timesheet labor as a distinct OpEx component (opex_labor_actual)
-- Paste into Supabase SQL Editor, then Reload schema.

-- ========== A) Labor component on monthly financials ==========
ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_labor_actual numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.financials_monthly.opex_labor_actual IS
  'Timesheet labor (FTE) actuals for the month. Included in opex_actual alongside other OpEx.';

-- Re-apply labor rollup: also increments opex_labor_actual
CREATE OR REPLACE FUNCTION public.apply_timesheet_labor_cost(_timesheet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.timesheets;
  rate numeric(12,2);
  rec record;
  period date;
  sid uuid;
BEGIN
  SELECT * INTO t FROM public.timesheets WHERE id = _timesheet_id;
  IF NOT FOUND OR t.status <> 'approved' THEN
    RETURN;
  END IF;

  SELECT COALESCE(r.cost_rate, 0) INTO rate
  FROM public.resources r
  WHERE r.id = t.resource_id OR (r.org_id = t.org_id AND r.user_id = t.user_id)
  ORDER BY CASE WHEN r.id = t.resource_id THEN 0 ELSE 1 END
  LIMIT 1;
  rate := COALESCE(rate, 0);

  -- Stamp entry costs; billable rows inherit stream from work item when missing
  UPDATE public.timesheet_entries e
  SET hourly_rate = rate,
      labor_cost = ROUND(
        rate * (e.hours_mon + e.hours_tue + e.hours_wed + e.hours_thu
                + e.hours_fri + e.hours_sat + e.hours_sun),
        2
      ),
      stream_id = COALESCE(
        e.stream_id,
        (SELECT wi.stream_id FROM public.work_items wi WHERE wi.id = e.work_item_id)
      )
  WHERE e.timesheet_id = t.id;

  IF rate <= 0 THEN
    RETURN;
  END IF;

  period := date_trunc('month', t.week_start)::date;

  FOR rec IN
    SELECT e.project_id,
           COALESCE(e.stream_id, wi.stream_id) AS stream_id,
           SUM(e.labor_cost) AS cost
    FROM public.timesheet_entries e
    LEFT JOIN public.work_items wi ON wi.id = e.work_item_id
    WHERE e.timesheet_id = t.id
      AND e.billable = true
      AND e.project_id IS NOT NULL
      AND e.work_item_id IS NOT NULL
    GROUP BY e.project_id, COALESCE(e.stream_id, wi.stream_id)
  LOOP
    sid := rec.stream_id;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id AND COALESCE(is_default, false) = true
      LIMIT 1;
    END IF;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id
      ORDER BY sort_order NULLS LAST
      LIMIT 1;
    END IF;

    IF sid IS NOT NULL THEN
      UPDATE public.financials_monthly
      SET opex_actual = COALESCE(opex_actual, 0) + rec.cost,
          opex_labor_actual = COALESCE(opex_labor_actual, 0) + rec.cost
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id = sid;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month, opex_actual, opex_labor_actual
        ) VALUES (t.org_id, rec.project_id, sid, period, rec.cost, rec.cost);
      END IF;
    ELSE
      UPDATE public.financials_monthly
      SET opex_actual = COALESCE(opex_actual, 0) + rec.cost,
          opex_labor_actual = COALESCE(opex_labor_actual, 0) + rec.cost
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id IS NULL;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month, opex_actual, opex_labor_actual
        ) VALUES (t.org_id, rec.project_id, NULL, period, rec.cost, rec.cost);
      END IF;
    END IF;
  END LOOP;

  -- Recompute project incurred from monthly actuals for touched projects
  UPDATE public.projects p
  SET
    opex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.opex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0),
    capex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.capex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0),
    updated_at = now()
  WHERE p.id IN (
    SELECT DISTINCT project_id FROM public.timesheet_entries
    WHERE timesheet_id = t.id AND billable = true AND project_id IS NOT NULL
  );

  -- Stream/project rollup when helper exists
  BEGIN
    FOR rec IN
      SELECT DISTINCT project_id AS pid
      FROM public.timesheet_entries
      WHERE timesheet_id = t.id AND billable = true AND project_id IS NOT NULL
    LOOP
      PERFORM public.rollup_project_from_streams(rec.pid);
    END LOOP;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_timesheet_labor_cost(uuid) TO authenticated;

-- ========== B) Sync org profiles → resources (1:1) ==========
CREATE OR REPLACE FUNCTION public.sync_org_resources_from_profiles(_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oid uuid;
  mgr uuid;
  p record;
  created int := 0;
  updated int := 0;
  rid uuid;
  orgs uuid[];
  o uuid;
BEGIN
  IF _org_id IS NOT NULL THEN
    orgs := ARRAY[_org_id];
  ELSE
    IF auth.uid() IS NOT NULL AND NOT public.has_any_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only organisation admins can sync all resources';
    END IF;
    SELECT array_agg(id) INTO orgs FROM public.organizations;
  END IF;

  IF orgs IS NULL THEN
    RETURN jsonb_build_object('created', 0, 'updated', 0);
  END IF;

  FOREACH o IN ARRAY orgs LOOP
    oid := o;

    SELECT ur.user_id INTO mgr
    FROM public.user_roles ur
    WHERE ur.org_id = oid AND ur.role IN ('admin', 'org_admin')
    ORDER BY ur.role
    LIMIT 1;

    FOR p IN
      SELECT pr.id, pr.full_name, pr.email
      FROM public.profiles pr
      WHERE pr.org_id = oid
    LOOP
      SELECT r.id INTO rid
      FROM public.resources r
      WHERE r.org_id = oid AND r.user_id = p.id
      LIMIT 1;

      IF rid IS NULL THEN
        INSERT INTO public.resources (
          org_id, name, email, user_id, manager_user_id,
          capacity_hours_week, cost_rate, status, role
        ) VALUES (
          oid,
          COALESCE(NULLIF(trim(p.full_name), ''), NULLIF(trim(p.email), ''), 'Member'),
          p.email,
          p.id,
          mgr,
          40,
          0,
          'Active',
          'Team member'
        )
        RETURNING id INTO rid;
        created := created + 1;
      ELSE
        UPDATE public.resources
        SET
          name = COALESCE(NULLIF(trim(p.full_name), ''), NULLIF(trim(p.email), ''), name),
          email = COALESCE(p.email, email),
          manager_user_id = COALESCE(manager_user_id, mgr),
          status = COALESCE(NULLIF(status, ''), 'Active')
        WHERE id = rid;
        updated := updated + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('created', created, 'updated', updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_org_resources_from_profiles(uuid) TO authenticated;

-- Auto-sync when a profile is created/updated into an org
CREATE OR REPLACE FUNCTION public.tg_profile_sync_resource()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mgr uuid;
  rid uuid;
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ur.user_id INTO mgr
  FROM public.user_roles ur
  WHERE ur.org_id = NEW.org_id AND ur.role IN ('admin', 'org_admin')
  ORDER BY ur.role
  LIMIT 1;

  SELECT r.id INTO rid
  FROM public.resources r
  WHERE r.org_id = NEW.org_id AND r.user_id = NEW.id
  LIMIT 1;

  IF rid IS NULL THEN
    INSERT INTO public.resources (
      org_id, name, email, user_id, manager_user_id,
      capacity_hours_week, cost_rate, status, role
    ) VALUES (
      NEW.org_id,
      COALESCE(NULLIF(trim(NEW.full_name), ''), NULLIF(trim(NEW.email), ''), 'Member'),
      NEW.email,
      NEW.id,
      mgr,
      40,
      0,
      'Active',
      'Team member'
    );
  ELSE
    UPDATE public.resources
    SET
      name = COALESCE(NULLIF(trim(NEW.full_name), ''), NULLIF(trim(NEW.email), ''), name),
      email = COALESCE(NEW.email, email),
      manager_user_id = COALESCE(manager_user_id, mgr)
    WHERE id = rid;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_sync_resource ON public.profiles;
CREATE TRIGGER trg_profile_sync_resource
  AFTER INSERT OR UPDATE OF org_id, full_name, email
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profile_sync_resource();

-- One-shot backfill for existing orgs
SELECT public.sync_org_resources_from_profiles(NULL);

COMMENT ON FUNCTION public.sync_org_resources_from_profiles(uuid) IS
  'Ensure every org profile has a linked resource (same person). Optional org filter.';


-- =============================================================================
-- 20260729240000_work_item_stage_gates_stream_only.sql
-- =============================================================================

-- Stage gates live on streams (not project rollup).
-- Work items select a stage gate so labor/cost can attribute to a phase.
-- Paste into Supabase SQL Editor, then Reload schema.

-- ========== 1) Backfill project-level gates onto Core stream ==========
UPDATE public.stage_gates g
SET stream_id = s.id
FROM public.project_streams s
WHERE g.stream_id IS NULL
  AND s.project_id = g.project_id
  AND COALESCE(s.is_default, false) = true;

-- ========== 2) Work items → stage gate (phase) ==========
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_items_stage_gate
  ON public.work_items (stage_gate_id)
  WHERE stage_gate_id IS NOT NULL;

COMMENT ON COLUMN public.work_items.stage_gate_id IS
  'Stage gate / phase this work item contributes to (stream-scoped).';

-- ========== 3) Stamp stage gate on timesheet entries for stable phase cost ==========
ALTER TABLE public.timesheet_entries
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_stage_gate
  ON public.timesheet_entries (stage_gate_id)
  WHERE stage_gate_id IS NOT NULL;

COMMENT ON COLUMN public.timesheet_entries.stage_gate_id IS
  'Copied from work_items.stage_gate_id when hours are stamped/approved — phase labor attribution.';

-- When stamping labor, also copy stage_gate_id from the work item
CREATE OR REPLACE FUNCTION public.apply_timesheet_labor_cost(_timesheet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.timesheets;
  rate numeric(12,2);
  rec record;
  period date;
  sid uuid;
BEGIN
  SELECT * INTO t FROM public.timesheets WHERE id = _timesheet_id;
  IF NOT FOUND OR t.status <> 'approved' THEN
    RETURN;
  END IF;

  SELECT COALESCE(r.cost_rate, 0) INTO rate
  FROM public.resources r
  WHERE r.id = t.resource_id OR (r.org_id = t.org_id AND r.user_id = t.user_id)
  ORDER BY CASE WHEN r.id = t.resource_id THEN 0 ELSE 1 END
  LIMIT 1;
  rate := COALESCE(rate, 0);

  UPDATE public.timesheet_entries e
  SET hourly_rate = rate,
      labor_cost = ROUND(
        rate * (e.hours_mon + e.hours_tue + e.hours_wed + e.hours_thu
                + e.hours_fri + e.hours_sat + e.hours_sun),
        2
      ),
      stream_id = COALESCE(
        e.stream_id,
        (SELECT wi.stream_id FROM public.work_items wi WHERE wi.id = e.work_item_id)
      ),
      stage_gate_id = COALESCE(
        e.stage_gate_id,
        (SELECT wi.stage_gate_id FROM public.work_items wi WHERE wi.id = e.work_item_id)
      )
  WHERE e.timesheet_id = t.id;

  IF rate <= 0 THEN
    RETURN;
  END IF;

  period := date_trunc('month', t.week_start)::date;

  FOR rec IN
    SELECT e.project_id,
           COALESCE(e.stream_id, wi.stream_id) AS stream_id,
           SUM(e.labor_cost) AS cost
    FROM public.timesheet_entries e
    LEFT JOIN public.work_items wi ON wi.id = e.work_item_id
    WHERE e.timesheet_id = t.id
      AND e.billable = true
      AND e.project_id IS NOT NULL
      AND e.work_item_id IS NOT NULL
    GROUP BY e.project_id, COALESCE(e.stream_id, wi.stream_id)
  LOOP
    sid := rec.stream_id;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id AND COALESCE(is_default, false) = true
      LIMIT 1;
    END IF;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id
      ORDER BY sort_order NULLS LAST
      LIMIT 1;
    END IF;

    IF sid IS NOT NULL THEN
      UPDATE public.financials_monthly
      SET opex_actual = COALESCE(opex_actual, 0) + rec.cost,
          opex_labor_actual = COALESCE(opex_labor_actual, 0) + rec.cost
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id = sid;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month, opex_actual, opex_labor_actual
        ) VALUES (t.org_id, rec.project_id, sid, period, rec.cost, rec.cost);
      END IF;
    ELSE
      UPDATE public.financials_monthly
      SET opex_actual = COALESCE(opex_actual, 0) + rec.cost,
          opex_labor_actual = COALESCE(opex_labor_actual, 0) + rec.cost
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id IS NULL;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month, opex_actual, opex_labor_actual
        ) VALUES (t.org_id, rec.project_id, NULL, period, rec.cost, rec.cost);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.projects p
  SET
    opex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.opex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0),
    capex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.capex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0),
    updated_at = now()
  WHERE p.id IN (
    SELECT DISTINCT project_id FROM public.timesheet_entries
    WHERE timesheet_id = t.id AND billable = true AND project_id IS NOT NULL
  );

  BEGIN
    FOR rec IN
      SELECT DISTINCT project_id AS pid
      FROM public.timesheet_entries
      WHERE timesheet_id = t.id AND billable = true AND project_id IS NOT NULL
    LOOP
      PERFORM public.rollup_project_from_streams(rec.pid);
    END LOOP;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_timesheet_labor_cost(uuid) TO authenticated;


-- =============================================================================
-- 20260729250000_fix_text_app_role_ops.sql
-- =============================================================================

-- Fix: after user_roles.role became text (custom org roles), leftover
-- comparisons to public.app_role break RLS reads (financials_monthly,
-- stage_gates, etc.) with:
--   operator does not exist: text = app_role
--
-- user_can_view_project → can_edit_project was the hot path on Executive.

-- Ensure role columns are text (idempotent if already migrated).
-- Drop policies that block ALTER TYPE of user_roles.role, then recreate.
DROP POLICY IF EXISTS "cert_org_admin_select" ON public.org_license_certificates;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_roles'
      AND column_name = 'role' AND udt_name = 'app_role'
  ) THEN
    ALTER TABLE public.user_roles
      ALTER COLUMN role TYPE text USING role::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'role_table_permissions'
      AND column_name = 'role' AND udt_name = 'app_role'
  ) THEN
    ALTER TABLE public.role_table_permissions
      ALTER COLUMN role TYPE text USING role::text;
  END IF;
END $$;

CREATE POLICY "cert_org_admin_select"
  ON public.org_license_certificates FOR SELECT
  TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id  = public.get_user_org(auth.uid())
        AND ur.role IN ('admin','org_admin')
    )
  );

-- Drop enum overload left behind when has_role(uuid, text) was added.
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (
        _role = 'platform_admin'
        OR ur.org_id IS NULL
        OR ur.org_id = public.get_user_org(_user_id)
      )
  );
$$;

-- Compatibility wrapper for any remaining callers that pass app_role.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, _role::text);
$$;

CREATE OR REPLACE FUNCTION public.has_any_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin', 'org_admin')
      AND ur.org_id = public.get_user_org(_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = _project_id
      AND p.org_id = public.get_user_org(_user_id)
      AND (
        public.has_any_admin(_user_id)
        OR p.pm_user_id = _user_id
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = _user_id
            AND ur.role = 'bu_lead'
            AND ur.org_id = p.org_id
            AND (ur.bu_id IS NULL OR ur.bu_id = p.bu_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = 'platform_admin'
  );
$$;

COMMENT ON FUNCTION public.has_role(uuid, text) IS
  'Role check scoped to home org; platform_admin is global. Role keys are text (custom org roles).';
COMMENT ON FUNCTION public.has_role(uuid, public.app_role) IS
  'Compatibility wrapper — casts enum to text and delegates to has_role(uuid, text).';
COMMENT ON FUNCTION public.can_edit_project(uuid, uuid) IS
  'Project edit rights using text role keys (no app_role comparisons).';

GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;


-- =============================================================================
-- 20260729260000_resource_alloc_stage_gate_labor_idempotent.sql
-- =============================================================================

-- Resource allocation at stage-gate grain + idempotent labor → OpEx rollup.
-- Also adds opex_other_actual so FTE labor and other OpEx stay distinct.
-- Paste into Supabase SQL Editor, then Reload schema.

-- ========== 1) Planned allocations → stage gate ==========
ALTER TABLE public.resource_allocations
  ADD COLUMN IF NOT EXISTS stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_resource_allocations_stage_gate
  ON public.resource_allocations (stage_gate_id)
  WHERE stage_gate_id IS NOT NULL;

COMMENT ON COLUMN public.resource_allocations.stage_gate_id IS
  'Optional stage gate / phase for planned FTE allocation (project + stream + gate + month).';

-- Prefer unique key that includes stage_gate (null-safe partial indexes).
DROP INDEX IF EXISTS public.resource_allocations_project_stream_resource_period_uidx;
DROP INDEX IF EXISTS public.resource_allocations_project_null_stream_resource_period_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_proj_stream_gate_res_period_uidx
  ON public.resource_allocations (project_id, stream_id, stage_gate_id, resource_id, period_month)
  WHERE stream_id IS NOT NULL AND stage_gate_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_proj_stream_nullgate_res_period_uidx
  ON public.resource_allocations (project_id, stream_id, resource_id, period_month)
  WHERE stream_id IS NOT NULL AND stage_gate_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_proj_nullstream_gate_res_period_uidx
  ON public.resource_allocations (project_id, stage_gate_id, resource_id, period_month)
  WHERE stream_id IS NULL AND stage_gate_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_proj_nullstream_nullgate_res_period_uidx
  ON public.resource_allocations (project_id, resource_id, period_month)
  WHERE stream_id IS NULL AND stage_gate_id IS NULL;

-- ========== 2) Other OpEx (non-FTE) vs labor ==========
ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_other_actual NUMERIC(14,2) DEFAULT 0;

COMMENT ON COLUMN public.financials_monthly.opex_labor_actual IS
  'FTE / timesheet labor actual OpEx for the period (recomputed from approved timesheets).';
COMMENT ON COLUMN public.financials_monthly.opex_other_actual IS
  'Non-labor OpEx actual (vendors, licenses, etc.). opex_actual ≈ other + labor.';

-- Backfill other = total − labor when other is still zero
UPDATE public.financials_monthly
SET opex_other_actual = GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))
WHERE COALESCE(opex_other_actual, 0) = 0
  AND COALESCE(opex_actual, 0) > 0;

-- ========== 3) Idempotent labor apply ==========
CREATE OR REPLACE FUNCTION public.apply_timesheet_labor_cost(_timesheet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.timesheets;
  rate numeric(12,2);
  rec record;
  period date;
  sid uuid;
  labor numeric(14,2);
BEGIN
  SELECT * INTO t FROM public.timesheets WHERE id = _timesheet_id;
  IF NOT FOUND OR t.status <> 'approved' THEN
    RETURN;
  END IF;

  SELECT COALESCE(r.cost_rate, 0) INTO rate
  FROM public.resources r
  WHERE r.id = t.resource_id OR (r.org_id = t.org_id AND r.user_id = t.user_id)
  ORDER BY CASE WHEN r.id = t.resource_id THEN 0 ELSE 1 END
  LIMIT 1;
  rate := COALESCE(rate, 0);

  UPDATE public.timesheet_entries e
  SET hourly_rate = rate,
      labor_cost = ROUND(
        rate * (e.hours_mon + e.hours_tue + e.hours_wed + e.hours_thu
                + e.hours_fri + e.hours_sat + e.hours_sun),
        2
      ),
      stream_id = COALESCE(
        e.stream_id,
        (SELECT wi.stream_id FROM public.work_items wi WHERE wi.id = e.work_item_id)
      ),
      stage_gate_id = COALESCE(
        e.stage_gate_id,
        (SELECT wi.stage_gate_id FROM public.work_items wi WHERE wi.id = e.work_item_id)
      )
  WHERE e.timesheet_id = t.id;

  period := date_trunc('month', t.week_start)::date;

  -- Recompute labor for every project/stream month touched by this sheet
  -- (idempotent: set labor from ALL approved entries, not += this sheet).
  FOR rec IN
    SELECT DISTINCT e.project_id,
           COALESCE(e.stream_id, wi.stream_id) AS stream_id
    FROM public.timesheet_entries e
    LEFT JOIN public.work_items wi ON wi.id = e.work_item_id
    WHERE e.timesheet_id = t.id
      AND e.billable = true
      AND e.project_id IS NOT NULL
  LOOP
    sid := rec.stream_id;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id AND COALESCE(is_default, false) = true
      LIMIT 1;
    END IF;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id
      ORDER BY sort_order NULLS LAST
      LIMIT 1;
    END IF;

    SELECT COALESCE(SUM(e.labor_cost), 0) INTO labor
    FROM public.timesheet_entries e
    JOIN public.timesheets ts ON ts.id = e.timesheet_id
    LEFT JOIN public.work_items wi ON wi.id = e.work_item_id
    WHERE ts.status = 'approved'
      AND e.billable = true
      AND e.project_id = rec.project_id
      AND date_trunc('month', ts.week_start)::date = period
      AND COALESCE(e.stream_id, wi.stream_id, sid) IS NOT DISTINCT FROM sid;

    IF sid IS NOT NULL THEN
      UPDATE public.financials_monthly
      SET opex_labor_actual = labor,
          opex_other_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))),
          opex_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))) + labor
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id = sid;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month,
          opex_actual, opex_labor_actual, opex_other_actual
        ) VALUES (t.org_id, rec.project_id, sid, period, labor, labor, 0);
      END IF;
    ELSE
      UPDATE public.financials_monthly
      SET opex_labor_actual = labor,
          opex_other_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))),
          opex_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))) + labor
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id IS NULL;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month,
          opex_actual, opex_labor_actual, opex_other_actual
        ) VALUES (t.org_id, rec.project_id, NULL, period, labor, labor, 0);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.projects p
  SET
    opex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.opex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0),
    capex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.capex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0)
  WHERE p.id IN (
    SELECT DISTINCT project_id FROM public.timesheet_entries
    WHERE timesheet_id = t.id AND project_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_timesheet_labor_cost(uuid) TO authenticated;

-- ========== 4) Default capability: timesheet / resource cost view ==========
-- Stored as capability::timesheet_cost_view — org admins can change on Permissions.
INSERT INTO public.role_table_permissions (org_id, role, table_name, can_view, can_edit)
SELECT o.id, r.role_key, 'capability::timesheet_cost_view', true, true
FROM public.organizations o
CROSS JOIN (
  VALUES ('admin'), ('org_admin'), ('pm'), ('executive'), ('bu_lead')
) AS r(role_key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_table_permissions p
  WHERE p.org_id = o.id
    AND p.role = r.role_key
    AND p.table_name = 'capability::timesheet_cost_view'
);


-- =============================================================================
-- 20260729270000_timesheet_cost_pm_access.sql
-- =============================================================================

-- Cost quick view / org reporting / PM resource setup access
-- 1) Capability helper (default: org admin + PM for timesheet_cost_view)
-- 2) Approved timesheet read for cost viewers on projects they can view
-- 3) PM can update rates/managers for resources on their editable projects
-- 4) Ensure capability seed includes pm (+ admin/org_admin)

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
        AND COALESCE(p.can_edit, false) = true
    ) INTO allowed;
    RETURN allowed;
  END IF;

  -- Unconfigured defaults
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

GRANT EXECUTE ON FUNCTION public.user_has_capability(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.user_has_capability(uuid, text) IS
  'True when user is admin or has can_edit on the capability row; timesheet_cost_view defaults to org admin + PM when unconfigured.';

-- ========== Timesheets: cost viewers may read approved sheets for visible projects ==========
-- Cross-table checks must be SECURITY DEFINER — policy EXISTS loops between
-- timesheets ↔ timesheet_entries cause "infinite recursion detected in policy".
CREATE OR REPLACE FUNCTION public.user_can_view_approved_timesheet_for_cost(
  _user_id uuid,
  _timesheet_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.timesheets t
    WHERE t.id = _timesheet_id
      AND t.status = 'approved'
      AND public.user_has_capability(_user_id, 'capability::timesheet_cost_view')
      AND EXISTS (
        SELECT 1
        FROM public.timesheet_entries e
        WHERE e.timesheet_id = t.id
          AND e.project_id IS NOT NULL
          AND public.user_can_view_project(_user_id, e.project_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_timesheet_row(
  _user_id uuid,
  _timesheet_id uuid,
  _entry_project_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.timesheets t
    WHERE t.id = _timesheet_id
      AND (
        t.user_id = _user_id
        OR public.has_any_admin(_user_id)
        OR public.is_timesheet_approver(_user_id, t.id)
        OR t.manager_user_id = _user_id
        OR (
          t.status = 'approved'
          AND public.user_has_capability(_user_id, 'capability::timesheet_cost_view')
          AND _entry_project_id IS NOT NULL
          AND public.user_can_view_project(_user_id, _entry_project_id)
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_view_approved_timesheet_for_cost(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_read_timesheet_row(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "org read own or approve timesheets" ON public.timesheets;
CREATE POLICY "org read own or approve timesheets" ON public.timesheets
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      user_id = auth.uid()
      OR public.has_any_admin(auth.uid())
      OR public.is_timesheet_approver(auth.uid(), id)
      OR manager_user_id = auth.uid()
      OR public.user_can_view_approved_timesheet_for_cost(auth.uid(), id)
    )
  );

DROP POLICY IF EXISTS "read timesheet_entries" ON public.timesheet_entries;
CREATE POLICY "read timesheet_entries" ON public.timesheet_entries
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.user_can_read_timesheet_row(auth.uid(), timesheet_id, project_id)
  );

-- ========== PM / cost viewers: update rates for resources on editable projects ==========
DROP POLICY IF EXISTS "pm update team resource rates" ON public.resources;
CREATE POLICY "pm update team resource rates" ON public.resources
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.user_has_capability(auth.uid(), 'capability::timesheet_cost_view')
    AND (
      public.has_any_admin(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.resource_allocations ra
        WHERE ra.resource_id = resources.id
          AND public.can_edit_project(auth.uid(), ra.project_id)
      )
    )
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
  );

-- ========== Seed / refresh capability for admin, org_admin, pm ==========
INSERT INTO public.role_table_permissions (org_id, role, table_name, can_view, can_edit)
SELECT o.id, r.role_key, 'capability::timesheet_cost_view', true, true
FROM public.organizations o
CROSS JOIN (
  VALUES ('admin'), ('org_admin'), ('pm')
) AS r(role_key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_table_permissions p
  WHERE p.org_id = o.id
    AND p.role = r.role_key
    AND p.table_name = 'capability::timesheet_cost_view'
);


-- =============================================================================
-- 20260729280000_timesheet_reopen_approver_history.sql
-- =============================================================================

-- Approver history + reopen / withdraw timesheets
-- Paste in Supabase SQL Editor, then Reload schema.

-- Allow superseded approval rows (kept for history when sheet reopens / resubmits)
ALTER TABLE public.timesheet_approvals
  DROP CONSTRAINT IF EXISTS timesheet_approvals_status_check;

ALTER TABLE public.timesheet_approvals
  ADD CONSTRAINT timesheet_approvals_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'superseded'));

ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS reopen_reason text,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.timesheets.reopen_reason IS
  'Reason captured when an approver/admin reopens an approved timesheet to draft.';

-- Recompute work-item actual hours from remaining approved sheets
CREATE OR REPLACE FUNCTION public.recompute_work_item_hours_from_timesheets(_work_item_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _work_item_ids IS NULL OR array_length(_work_item_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.work_items wi
  SET actual_hours = COALESCE(agg.total, 0)
  FROM (
    SELECT e.work_item_id,
           SUM(
             COALESCE(e.hours_mon, 0) + COALESCE(e.hours_tue, 0) + COALESCE(e.hours_wed, 0)
             + COALESCE(e.hours_thu, 0) + COALESCE(e.hours_fri, 0) + COALESCE(e.hours_sat, 0)
             + COALESCE(e.hours_sun, 0)
           ) AS total
    FROM public.timesheet_entries e
    JOIN public.timesheets ts ON ts.id = e.timesheet_id
    WHERE ts.status = 'approved'
      AND e.billable = true
      AND e.work_item_id = ANY (_work_item_ids)
    GROUP BY e.work_item_id
  ) agg
  WHERE wi.id = agg.work_item_id;

  -- Zero out items that no longer have approved hours
  UPDATE public.work_items wi
  SET actual_hours = 0
  WHERE wi.id = ANY (_work_item_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.timesheet_entries e
      JOIN public.timesheets ts ON ts.id = e.timesheet_id
      WHERE e.work_item_id = wi.id
        AND ts.status = 'approved'
        AND e.billable = true
    );
END;
$$;

-- Recompute FTE labor for project/stream months (idempotent from approved sheets)
CREATE OR REPLACE FUNCTION public.recompute_opex_labor_for_projects_period(
  _org_id uuid,
  _project_ids uuid[],
  _period date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  sid uuid;
  labor numeric(14, 2);
  period date := date_trunc('month', _period)::date;
BEGIN
  IF _project_ids IS NULL OR array_length(_project_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT DISTINCT e.project_id,
           COALESCE(e.stream_id, wi.stream_id) AS stream_id
    FROM public.timesheet_entries e
    LEFT JOIN public.work_items wi ON wi.id = e.work_item_id
    JOIN public.timesheets ts ON ts.id = e.timesheet_id
    WHERE e.project_id = ANY (_project_ids)
      AND date_trunc('month', ts.week_start)::date = period
      AND e.billable = true
  LOOP
    sid := rec.stream_id;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id AND COALESCE(is_default, false) = true
      LIMIT 1;
    END IF;
    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.project_streams
      WHERE project_id = rec.project_id
      ORDER BY sort_order NULLS LAST
      LIMIT 1;
    END IF;

    SELECT COALESCE(SUM(e.labor_cost), 0) INTO labor
    FROM public.timesheet_entries e
    JOIN public.timesheets ts ON ts.id = e.timesheet_id
    LEFT JOIN public.work_items wi ON wi.id = e.work_item_id
    WHERE ts.status = 'approved'
      AND e.billable = true
      AND e.project_id = rec.project_id
      AND date_trunc('month', ts.week_start)::date = period
      AND COALESCE(e.stream_id, wi.stream_id, sid) IS NOT DISTINCT FROM sid;

    IF sid IS NOT NULL THEN
      UPDATE public.financials_monthly
      SET opex_labor_actual = labor,
          opex_other_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))),
          opex_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))) + labor
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id = sid;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month,
          opex_actual, opex_labor_actual, opex_other_actual
        ) VALUES (_org_id, rec.project_id, sid, period, labor, labor, 0);
      END IF;
    ELSE
      UPDATE public.financials_monthly
      SET opex_labor_actual = labor,
          opex_other_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))),
          opex_actual = COALESCE(opex_other_actual,
            GREATEST(0, COALESCE(opex_actual, 0) - COALESCE(opex_labor_actual, 0))) + labor
      WHERE project_id = rec.project_id
        AND period_month = period
        AND stream_id IS NULL;
      IF NOT FOUND THEN
        INSERT INTO public.financials_monthly (
          org_id, project_id, stream_id, period_month,
          opex_actual, opex_labor_actual, opex_other_actual
        ) VALUES (_org_id, rec.project_id, NULL, period, labor, labor, 0);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.projects p
  SET
    opex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.opex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0),
    capex_incurred = COALESCE((
      SELECT SUM(COALESCE(fm.capex_actual, 0)) FROM public.financials_monthly fm
      WHERE fm.project_id = p.id
    ), 0)
  WHERE p.id = ANY (_project_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_timesheet(
  _timesheet_id uuid,
  _reason text DEFAULT NULL
)
RETURNS public.timesheets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.timesheets;
  project_ids uuid[];
  wi_ids uuid[];
  period date;
BEGIN
  SELECT * INTO t FROM public.timesheets WHERE id = _timesheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timesheet not found';
  END IF;

  IF t.org_id <> public.get_user_org(auth.uid()) THEN
    RAISE EXCEPTION 'Wrong organisation';
  END IF;

  IF NOT (
    public.has_any_admin(auth.uid())
    OR public.is_timesheet_approver(auth.uid(), t.id)
    OR t.manager_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only an approver, resource manager, or org admin can reopen this timesheet';
  END IF;

  IF t.status <> 'approved' THEN
    RAISE EXCEPTION 'Only fully approved timesheets can be reopened (current status: %)', t.status;
  END IF;

  SELECT ARRAY_AGG(DISTINCT e.project_id) FILTER (WHERE e.project_id IS NOT NULL),
         ARRAY_AGG(DISTINCT e.work_item_id) FILTER (WHERE e.work_item_id IS NOT NULL)
  INTO project_ids, wi_ids
  FROM public.timesheet_entries e
  WHERE e.timesheet_id = t.id;

  period := date_trunc('month', t.week_start)::date;

  UPDATE public.timesheet_approvals
  SET status = 'superseded'
  WHERE timesheet_id = t.id
    AND status IN ('pending', 'approved', 'rejected');

  UPDATE public.timesheets
  SET status = 'draft',
      rejection_reason = NULL,
      rejected_at = NULL,
      rejected_by = NULL,
      submitted_at = NULL,
      reopen_reason = NULLIF(trim(COALESCE(_reason, '')), ''),
      reopened_at = now(),
      reopened_by = auth.uid()
  WHERE id = t.id
  RETURNING * INTO t;

  -- Clear labor stamps on this sheet; remaining approved sheets drive finance
  UPDATE public.timesheet_entries
  SET labor_cost = 0
  WHERE timesheet_id = t.id;

  PERFORM public.recompute_work_item_hours_from_timesheets(wi_ids);
  PERFORM public.recompute_opex_labor_for_projects_period(t.org_id, project_ids, period);

  INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
  VALUES (
    t.user_id,
    t.org_id,
    'timesheet_reopened',
    'Timesheet reopened',
    'Your timesheet for week starting ' || t.week_start::text
      || ' was returned to draft'
      || CASE WHEN t.reopen_reason IS NOT NULL THEN ': ' || t.reopen_reason ELSE '.' END,
    '/app/timesheets'
  );

  RETURN t;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_timesheet(_timesheet_id uuid)
RETURNS public.timesheets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.timesheets;
BEGIN
  SELECT * INTO t FROM public.timesheets WHERE id = _timesheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timesheet not found';
  END IF;

  IF t.user_id <> auth.uid() AND NOT public.has_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the timesheet owner (or org admin) can withdraw';
  END IF;

  IF t.status NOT IN ('pending_pm', 'pending_rm') THEN
    RAISE EXCEPTION 'Only timesheets awaiting approval can be withdrawn';
  END IF;

  UPDATE public.timesheet_approvals
  SET status = 'superseded'
  WHERE timesheet_id = t.id
    AND status = 'pending';

  UPDATE public.timesheets
  SET status = 'draft',
      submitted_at = NULL,
      rejection_reason = NULL,
      rejected_at = NULL,
      rejected_by = NULL
  WHERE id = t.id
  RETURNING * INTO t;

  RETURN t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_work_item_hours_from_timesheets(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_opex_labor_for_projects_period(uuid, uuid[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_timesheet(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_timesheet(uuid) TO authenticated;


-- =============================================================================
-- 20260730120000_opex_labor_planned.sql
-- =============================================================================

-- Planned FTE cost column (work-item driven). See also supabase/manual/opex_labor_planned_from_work_items.sql
ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_labor_planned NUMERIC(14,2) DEFAULT 0;

COMMENT ON COLUMN public.financials_monthly.opex_labor_planned IS
  'Planned FTE / labor OpEx from work-item estimate_hours × resource cost_rate (synced from app). Separate from general opex_planned budget.';


-- =============================================================================
-- 20260730130000_fix_timesheet_rls_recursion.sql
-- =============================================================================

-- Fix: infinite recursion in timesheets / timesheet_entries RLS.
-- Cause: timesheets SELECT policy queried timesheet_entries, and
-- timesheet_entries SELECT policy queried timesheets (RLS re-entered).
-- Fix: SECURITY DEFINER helpers for cross-table checks (bypass RLS).

CREATE OR REPLACE FUNCTION public.user_can_view_approved_timesheet_for_cost(
  _user_id uuid,
  _timesheet_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.timesheets t
    WHERE t.id = _timesheet_id
      AND t.status = 'approved'
      AND public.user_has_capability(_user_id, 'capability::timesheet_cost_view')
      AND EXISTS (
        SELECT 1
        FROM public.timesheet_entries e
        WHERE e.timesheet_id = t.id
          AND e.project_id IS NOT NULL
          AND public.user_can_view_project(_user_id, e.project_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_timesheet_row(
  _user_id uuid,
  _timesheet_id uuid,
  _entry_project_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.timesheets t
    WHERE t.id = _timesheet_id
      AND (
        t.user_id = _user_id
        OR public.has_any_admin(_user_id)
        OR public.is_timesheet_approver(_user_id, t.id)
        OR t.manager_user_id = _user_id
        OR (
          t.status = 'approved'
          AND public.user_has_capability(_user_id, 'capability::timesheet_cost_view')
          AND _entry_project_id IS NOT NULL
          AND public.user_can_view_project(_user_id, _entry_project_id)
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_view_approved_timesheet_for_cost(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_read_timesheet_row(uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.user_can_view_approved_timesheet_for_cost(uuid, uuid) IS
  'SECURITY DEFINER: cost viewers may see approved timesheets that include a visible project entry (avoids RLS recursion).';

COMMENT ON FUNCTION public.user_can_read_timesheet_row(uuid, uuid, uuid) IS
  'SECURITY DEFINER: whether a user may read a timesheet / its entries (avoids RLS recursion).';

DROP POLICY IF EXISTS "org read own or approve timesheets" ON public.timesheets;
CREATE POLICY "org read own or approve timesheets" ON public.timesheets
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      user_id = auth.uid()
      OR public.has_any_admin(auth.uid())
      OR public.is_timesheet_approver(auth.uid(), id)
      OR manager_user_id = auth.uid()
      OR public.user_can_view_approved_timesheet_for_cost(auth.uid(), id)
    )
  );

DROP POLICY IF EXISTS "read timesheet_entries" ON public.timesheet_entries;
CREATE POLICY "read timesheet_entries" ON public.timesheet_entries
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.user_can_read_timesheet_row(auth.uid(), timesheet_id, project_id)
  );


-- =============================================================================
-- 20260730140000_opex_other_costs.sql
-- =============================================================================

-- Other OpEx cost log → rolls into financials_monthly.opex_other_actual
-- and keeps opex_actual = opex_labor_actual + opex_other_actual.

CREATE TABLE IF NOT EXISTS public.opex_other_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stream_id uuid REFERENCES public.project_streams(id) ON DELETE SET NULL,
  stage_gate_id uuid REFERENCES public.stage_gates(id) ON DELETE SET NULL,
  cost_date date NOT NULL DEFAULT (CURRENT_DATE),
  period_month date NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  description text,
  vendor text,
  invoice_ref text,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'posted'
    CHECK (status IN ('draft', 'posted')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opex_other_costs_org_month
  ON public.opex_other_costs (org_id, period_month);
CREATE INDEX IF NOT EXISTS idx_opex_other_costs_project_month
  ON public.opex_other_costs (project_id, period_month);
CREATE INDEX IF NOT EXISTS idx_opex_other_costs_stream
  ON public.opex_other_costs (stream_id);
CREATE INDEX IF NOT EXISTS idx_opex_other_costs_gate
  ON public.opex_other_costs (stage_gate_id);

COMMENT ON TABLE public.opex_other_costs IS
  'Non-labor OpEx line items. Posted rows roll up to financials_monthly.opex_other_actual.';
COMMENT ON COLUMN public.opex_other_costs.stage_gate_id IS
  'Optional stage gate / phase attribution for the cost.';

ALTER TABLE public.opex_other_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read opex_other_costs" ON public.opex_other_costs;
CREATE POLICY "org read opex_other_costs" ON public.opex_other_costs
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR public.user_can_view_project(auth.uid(), project_id)
    )
  );

DROP POLICY IF EXISTS "editors write opex_other_costs" ON public.opex_other_costs;
CREATE POLICY "editors write opex_other_costs" ON public.opex_other_costs
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.can_edit_project(auth.uid(), project_id)
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND public.can_edit_project(auth.uid(), project_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opex_other_costs TO authenticated;
GRANT ALL ON public.opex_other_costs TO service_role;

ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_labor_actual NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.financials_monthly
  ADD COLUMN IF NOT EXISTS opex_other_actual NUMERIC(14,2) DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recompute_opex_other_for_lane(
  _org_id uuid,
  _project_id uuid,
  _stream_id uuid,
  _period_month date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  period date := date_trunc('month', _period_month)::date;
  other_amt numeric(14,2);
  labor_amt numeric(14,2) := 0;
  sid uuid := _stream_id;
BEGIN
  SELECT COALESCE(SUM(c.amount), 0) INTO other_amt
  FROM public.opex_other_costs c
  WHERE c.org_id = _org_id
    AND c.project_id = _project_id
    AND c.status = 'posted'
    AND c.period_month = period
    AND c.stream_id IS NOT DISTINCT FROM sid;

  IF sid IS NOT NULL THEN
    SELECT COALESCE(opex_labor_actual, 0) INTO labor_amt
    FROM public.financials_monthly
    WHERE project_id = _project_id
      AND period_month = period
      AND stream_id = sid;

    UPDATE public.financials_monthly
    SET opex_other_actual = other_amt,
        opex_actual = COALESCE(labor_amt, 0) + other_amt
    WHERE project_id = _project_id
      AND period_month = period
      AND stream_id = sid;

    IF NOT FOUND THEN
      INSERT INTO public.financials_monthly (
        org_id, project_id, stream_id, period_month,
        opex_actual, opex_labor_actual, opex_other_actual,
        capex_planned, capex_actual, opex_planned
      ) VALUES (
        _org_id, _project_id, sid, period,
        other_amt, 0, other_amt,
        0, 0, 0
      );
    END IF;
  ELSE
    SELECT COALESCE(opex_labor_actual, 0) INTO labor_amt
    FROM public.financials_monthly
    WHERE project_id = _project_id
      AND period_month = period
      AND stream_id IS NULL;

    UPDATE public.financials_monthly
    SET opex_other_actual = other_amt,
        opex_actual = COALESCE(labor_amt, 0) + other_amt
    WHERE project_id = _project_id
      AND period_month = period
      AND stream_id IS NULL;

    IF NOT FOUND THEN
      INSERT INTO public.financials_monthly (
        org_id, project_id, stream_id, period_month,
        opex_actual, opex_labor_actual, opex_other_actual,
        capex_planned, capex_actual, opex_planned
      ) VALUES (
        _org_id, _project_id, NULL, period,
        other_amt, 0, other_amt,
        0, 0, 0
      );
    END IF;
  END IF;

  UPDATE public.projects p
  SET opex_incurred = COALESCE((
    SELECT SUM(COALESCE(fm.opex_actual, 0)) FROM public.financials_monthly fm
    WHERE fm.project_id = p.id
  ), 0)
  WHERE p.id = _project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_opex_other_costs_period_month()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.period_month := date_trunc('month', COALESCE(NEW.cost_date, CURRENT_DATE))::date;
  NEW.updated_at := now();
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org(auth.uid());
  END IF;
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_opex_other_costs_after_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_opex_other_for_lane(
      OLD.org_id, OLD.project_id, OLD.stream_id, OLD.period_month
    );
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.project_id IS DISTINCT FROM NEW.project_id
       OR OLD.stream_id IS DISTINCT FROM NEW.stream_id
       OR OLD.period_month IS DISTINCT FROM NEW.period_month
       OR OLD.org_id IS DISTINCT FROM NEW.org_id THEN
      PERFORM public.recompute_opex_other_for_lane(
        OLD.org_id, OLD.project_id, OLD.stream_id, OLD.period_month
      );
    END IF;
  END IF;

  PERFORM public.recompute_opex_other_for_lane(
    NEW.org_id, NEW.project_id, NEW.stream_id, NEW.period_month
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opex_other_costs_period ON public.opex_other_costs;
CREATE TRIGGER trg_opex_other_costs_period
  BEFORE INSERT OR UPDATE ON public.opex_other_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_opex_other_costs_period_month();

DROP TRIGGER IF EXISTS trg_opex_other_costs_aiud ON public.opex_other_costs;
CREATE TRIGGER trg_opex_other_costs_aiud
  AFTER INSERT OR UPDATE OR DELETE ON public.opex_other_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_opex_other_costs_after_rollup();

GRANT EXECUTE ON FUNCTION public.recompute_opex_other_for_lane(uuid, uuid, uuid, date) TO authenticated;


-- =============================================================================
-- 20260730150000_work_items_sprint_id.sql
-- =============================================================================

-- Optional sprint attribution on work items (Agile / Hybrid),
-- parallel to stage_gate_id for Waterfall phases.

ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS sprint_id uuid REFERENCES public.sprints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_items_sprint
  ON public.work_items (sprint_id)
  WHERE sprint_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_items_project_sprint
  ON public.work_items (project_id, sprint_id)
  WHERE sprint_id IS NOT NULL;

COMMENT ON COLUMN public.work_items.sprint_id IS
  'Optional sprint for Agile/Hybrid work items (parallel to stage_gate_id for Waterfall).';


-- =============================================================================
-- 20260730160000_ppm_platform_depth.sql
-- =============================================================================

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


-- =============================================================================
-- 20260731120000_org_integrations.sql
-- =============================================================================

-- Org integrations (Jira and extensible connectors).
-- Secrets encrypted at rest (app layer AES-256-GCM via BYOD_SECRETS_KEK / INTEGRATIONS_SECRETS_KEK).

CREATE TABLE IF NOT EXISTS public.org_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('jira', 'azure_devops', 'servicenow', 'custom_webhook')),
  display_name text,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ciphertext text,
  secret_nonce text,
  secret_configured boolean NOT NULL DEFAULT false,
  secret_hint text,
  status text NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured', 'configured', 'tested', 'active', 'error')),
  last_tested_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (org_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_org_integrations_org ON public.org_integrations (org_id);

COMMENT ON TABLE public.org_integrations IS
  'Per-org external system connectors. API tokens encrypted; never expose plaintext to clients.';
COMMENT ON COLUMN public.org_integrations.config IS
  'Non-secret settings: site_url, email, project_keys[], sync_mode, map_to (work_items|demand_pipeline).';

ALTER TABLE public.org_integrations ENABLE ROW LEVEL SECURITY;

-- No authenticated policies — service-role / server functions only (same pattern as BYOD).
REVOKE ALL ON public.org_integrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.org_integrations TO service_role;

-- External entity links (Jira issue key ↔ work item / demand)
CREATE TABLE IF NOT EXISTS public.integration_external_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text NOT NULL,
  external_key text,
  entity_type text NOT NULL CHECK (entity_type IN ('work_item', 'demand_pipeline', 'project')),
  entity_id uuid NOT NULL,
  last_synced_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_links_org ON public.integration_external_links (org_id);
CREATE INDEX IF NOT EXISTS idx_integration_links_entity
  ON public.integration_external_links (org_id, entity_type, entity_id);

ALTER TABLE public.integration_external_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read integration links" ON public.integration_external_links;
CREATE POLICY "org read integration links" ON public.integration_external_links
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "admins write integration links" ON public.integration_external_links;
CREATE POLICY "admins write integration links" ON public.integration_external_links
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.has_any_admin(auth.uid())
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND public.has_any_admin(auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_external_links TO authenticated;
GRANT ALL ON public.integration_external_links TO service_role;


-- =============================================================================
-- 20260801120000_stakeholder_user_sponsor.sql
-- =============================================================================

-- Stakeholders: optional login link + sponsor flag; projects link to primary sponsor stakeholder.

ALTER TABLE public.stakeholders
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.stakeholders
  ADD COLUMN IF NOT EXISTS is_sponsor boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stakeholders.user_id IS
  'Optional link to an org login (profiles / auth.users). External sponsors may leave null.';
COMMENT ON COLUMN public.stakeholders.is_sponsor IS
  'True when this person acts as a project sponsor (may be multiple; project.sponsor_stakeholder_id is primary).';

CREATE INDEX IF NOT EXISTS idx_stakeholders_user
  ON public.stakeholders (org_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stakeholders_sponsor
  ON public.stakeholders (project_id)
  WHERE is_sponsor = true;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS sponsor_stakeholder_id uuid
    REFERENCES public.stakeholders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.projects.sponsor_stakeholder_id IS
  'Primary sponsor stakeholder for the project. projects.sponsor text is kept in sync for display/export.';

CREATE INDEX IF NOT EXISTS idx_projects_sponsor_stakeholder
  ON public.projects (sponsor_stakeholder_id)
  WHERE sponsor_stakeholder_id IS NOT NULL;


-- =============================================================================
-- 20260801140000_org_ip_restriction.sql
-- =============================================================================

-- Per-organisation IP address restriction for white-label sign-in / app access.
-- When enabled, only client IPs matching ip_allowlist (exact or CIDR) may enter.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ip_restriction_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ip_allowlist text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.organizations.ip_restriction_enabled IS
  'When true, members of this organisation may only sign in / use the app from IPs in ip_allowlist.';
COMMENT ON COLUMN public.organizations.ip_allowlist IS
  'Allowed client IPs or CIDR ranges (e.g. 203.0.113.10, 10.0.0.0/8). Empty while enabled denies all non–platform-admin access.';

-- Only platform_admin (or service role with no JWT) may change IP restriction settings.
CREATE OR REPLACE FUNCTION public.tg_organizations_lock_ip_restriction_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.ip_restriction_enabled IS DISTINCT FROM OLD.ip_restriction_enabled
    OR NEW.ip_allowlist IS DISTINCT FROM OLD.ip_allowlist
  ) THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF public.is_platform_admin(auth.uid()) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'only platform_admin can change organisation IP restriction settings';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_lock_ip_restriction_fields ON public.organizations;
CREATE TRIGGER trg_organizations_lock_ip_restriction_fields
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_organizations_lock_ip_restriction_fields();


-- =============================================================================
-- 20260804120000_scale_hardening.sql
-- =============================================================================

-- Scale hardening: covering indexes, index-friendly RLS, org KPI summaries,
-- async export jobs, and partition-ready helpers for large fact tables.
-- Safe / additive — preserves user_can_view_project semantics.

-- =============================================================================
-- 1) Covering indexes for hot org-scoped scans
-- =============================================================================

CREATE INDEX IF NOT EXISTS projects_org_id_idx ON public.projects (org_id);
CREATE INDEX IF NOT EXISTS projects_org_updated_idx ON public.projects (org_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_org_status_idx ON public.projects (org_id, status);
CREATE INDEX IF NOT EXISTS projects_org_rag_idx ON public.projects (org_id, rag);
CREATE INDEX IF NOT EXISTS projects_org_program_idx ON public.projects (org_id, program);

CREATE INDEX IF NOT EXISTS stage_gates_org_id_idx ON public.stage_gates (org_id);
CREATE INDEX IF NOT EXISTS stage_gates_org_project_idx ON public.stage_gates (org_id, project_id);
CREATE INDEX IF NOT EXISTS milestones_org_id_idx ON public.milestones (org_id);
CREATE INDEX IF NOT EXISTS milestones_org_project_idx ON public.milestones (org_id, project_id);
CREATE INDEX IF NOT EXISTS risks_org_id_idx ON public.risks (org_id);
CREATE INDEX IF NOT EXISTS risks_org_project_idx ON public.risks (org_id, project_id);
CREATE INDEX IF NOT EXISTS issues_org_id_idx ON public.issues (org_id);
CREATE INDEX IF NOT EXISTS issues_org_project_idx ON public.issues (org_id, project_id);
CREATE INDEX IF NOT EXISTS actions_org_id_idx ON public.actions (org_id);
CREATE INDEX IF NOT EXISTS actions_org_project_idx ON public.actions (org_id, project_id);
CREATE INDEX IF NOT EXISTS decisions_org_id_idx ON public.decisions (org_id);
CREATE INDEX IF NOT EXISTS decisions_org_project_idx ON public.decisions (org_id, project_id);
CREATE INDEX IF NOT EXISTS dependencies_org_id_idx ON public.dependencies (org_id);
CREATE INDEX IF NOT EXISTS financials_monthly_org_id_idx ON public.financials_monthly (org_id);
CREATE INDEX IF NOT EXISTS financials_monthly_org_project_period_idx
  ON public.financials_monthly (org_id, project_id, period_month);
CREATE INDEX IF NOT EXISTS documents_org_id_idx ON public.documents (org_id);
CREATE INDEX IF NOT EXISTS status_updates_org_id_idx ON public.status_updates (org_id);
CREATE INDEX IF NOT EXISTS benefits_org_id_idx ON public.benefits (org_id);
CREATE INDEX IF NOT EXISTS benefits_org_project_idx ON public.benefits (org_id, project_id);
CREATE INDEX IF NOT EXISTS fy_allocations_org_id_idx ON public.fy_allocations (org_id);
CREATE INDEX IF NOT EXISTS sprints_org_id_idx ON public.sprints (org_id);
CREATE INDEX IF NOT EXISTS sprints_org_project_idx ON public.sprints (org_id, project_id);
CREATE INDEX IF NOT EXISTS resource_allocations_org_id_idx ON public.resource_allocations (org_id);
CREATE INDEX IF NOT EXISTS resources_org_id_idx ON public.resources (org_id);
CREATE INDEX IF NOT EXISTS stakeholders_org_id_idx ON public.stakeholders (org_id);
CREATE INDEX IF NOT EXISTS work_items_org_status_idx ON public.work_items (org_id, status);
CREATE INDEX IF NOT EXISTS work_items_org_updated_idx ON public.work_items (org_id, updated_at DESC);

-- =============================================================================
-- 2) Index-friendly RLS: org predicate first, then visibility
-- =============================================================================

DROP POLICY IF EXISTS "projects_read_org" ON public.projects;
CREATE POLICY "projects_read_org"
  ON public.projects FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.get_user_org(auth.uid()))
    AND public.user_can_view_project(auth.uid(), id)
  );

DO $$
DECLARE
  t text;
  pol record;
  has_org boolean;
  has_project boolean;
  using_expr text;
  tables text[] := ARRAY[
    'milestones','stage_gates','risks','issues','actions','decisions',
    'dependencies','financials_monthly','fy_allocations','benefits',
    'documents','status_updates','change_requests','stakeholders',
    'resource_allocations','sprints','work_items','lessons_learned',
    'project_streams'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id'
    ) INTO has_org;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'project_id'
    ) INTO has_project;

    IF NOT has_org THEN
      CONTINUE;
    END IF;

    -- Drop all SELECT policies so we don't OR-stack with legacy names.
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND cmd = 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    IF has_project THEN
      using_expr :=
        'org_id = (SELECT public.get_user_org(auth.uid())) AND ('
        || '(project_id IS NOT NULL AND public.user_can_view_project(auth.uid(), project_id))'
        || ' OR project_id IS NULL)';
    ELSE
      using_expr := 'org_id = (SELECT public.get_user_org(auth.uid()))';
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      t || '_read_org_scope',
      t,
      using_expr
    );
  END LOOP;
END $$;

-- =============================================================================
-- 3) Org KPI summary rollups (executive / cockpit hot path)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.org_kpi_summaries (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_count integer NOT NULL DEFAULT 0,
  active_count integer NOT NULL DEFAULT 0,
  rag_green integer NOT NULL DEFAULT 0,
  rag_amber integer NOT NULL DEFAULT 0,
  rag_red integer NOT NULL DEFAULT 0,
  approved_funding numeric NOT NULL DEFAULT 0,
  incurred numeric NOT NULL DEFAULT 0,
  forecast_at_completion numeric NOT NULL DEFAULT 0,
  benefits_target numeric NOT NULL DEFAULT 0,
  benefits_realised numeric NOT NULL DEFAULT 0,
  open_risks integer NOT NULL DEFAULT 0,
  open_issues integer NOT NULL DEFAULT 0,
  open_actions integer NOT NULL DEFAULT 0,
  work_item_total integer NOT NULL DEFAULT 0,
  work_item_done integer NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS org_kpi_summaries_refreshed_idx
  ON public.org_kpi_summaries (refreshed_at DESC);

ALTER TABLE public.org_kpi_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_kpi_summaries_read_org ON public.org_kpi_summaries;
CREATE POLICY org_kpi_summaries_read_org
  ON public.org_kpi_summaries FOR SELECT TO authenticated
  USING (org_id = (SELECT public.get_user_org(auth.uid())));

-- Service role / SECURITY DEFINER refresh writes; no authenticated INSERT/UPDATE.

CREATE OR REPLACE FUNCTION public.refresh_org_kpi_summary(p_org_id uuid)
RETURNS public.org_kpi_summaries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.org_kpi_summaries;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'org_id required';
  END IF;

  INSERT INTO public.org_kpi_summaries AS s (
    org_id,
    project_count,
    active_count,
    rag_green,
    rag_amber,
    rag_red,
    approved_funding,
    incurred,
    forecast_at_completion,
    benefits_target,
    benefits_realised,
    open_risks,
    open_issues,
    open_actions,
    work_item_total,
    work_item_done,
    refreshed_at,
    meta
  )
  SELECT
    p_org_id,
    COALESCE(p.project_count, 0),
    COALESCE(p.active_count, 0),
    COALESCE(p.rag_green, 0),
    COALESCE(p.rag_amber, 0),
    COALESCE(p.rag_red, 0),
    COALESCE(p.approved_funding, 0),
    COALESCE(p.incurred, 0),
    COALESCE(p.forecast_at_completion, 0),
    COALESCE(p.benefits_target, 0),
    COALESCE(p.benefits_realised, 0),
    COALESCE(r.open_risks, 0),
    COALESCE(i.open_issues, 0),
    COALESCE(a.open_actions, 0),
    COALESCE(w.work_item_total, 0),
    COALESCE(w.work_item_done, 0),
    now(),
    jsonb_build_object('source', 'refresh_org_kpi_summary')
  FROM (SELECT 1) seed
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS project_count,
      COUNT(*) FILTER (
        WHERE COALESCE(status, '') NOT ILIKE '%closed%'
          AND COALESCE(status, '') NOT ILIKE '%complete%'
          AND COALESCE(status, '') NOT ILIKE '%cancelled%'
      )::int AS active_count,
      COUNT(*) FILTER (WHERE lower(COALESCE(rag, '')) IN ('green', 'g'))::int AS rag_green,
      COUNT(*) FILTER (WHERE lower(COALESCE(rag, '')) IN ('amber', 'yellow', 'a'))::int AS rag_amber,
      COUNT(*) FILTER (WHERE lower(COALESCE(rag, '')) IN ('red', 'r'))::int AS rag_red,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(budget, 0) > 0 THEN budget
          ELSE COALESCE(capex_approved, 0) + COALESCE(opex_approved, 0)
        END
      ), 0) AS approved_funding,
      COALESCE(SUM(COALESCE(capex_incurred, 0) + COALESCE(opex_incurred, 0)), 0) AS incurred,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(forecast_at_completion, 0) > 0 THEN forecast_at_completion
          WHEN COALESCE(budget, 0) > 0 THEN budget
          ELSE COALESCE(capex_approved, 0) + COALESCE(opex_approved, 0)
        END
      ), 0) AS forecast_at_completion,
      COALESCE(SUM(COALESCE(benefits_target, 0)), 0) AS benefits_target,
      COALESCE(SUM(COALESCE(benefits_realised, 0)), 0) AS benefits_realised
    FROM public.projects
    WHERE org_id = p_org_id
  ) p ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS open_risks
    FROM public.risks
    WHERE org_id = p_org_id
      AND COALESCE(status, '') NOT ILIKE '%closed%'
      AND COALESCE(status, '') NOT ILIKE '%mitigated%'
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS open_issues
    FROM public.issues
    WHERE org_id = p_org_id
      AND COALESCE(status, '') NOT ILIKE '%closed%'
      AND COALESCE(status, '') NOT ILIKE '%resolved%'
  ) i ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS open_actions
    FROM public.actions
    WHERE org_id = p_org_id
      AND COALESCE(status, '') NOT ILIKE '%done%'
      AND COALESCE(status, '') NOT ILIKE '%closed%'
      AND COALESCE(status, '') NOT ILIKE '%complete%'
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS work_item_total,
      COUNT(*) FILTER (WHERE status = 'Done')::int AS work_item_done
    FROM public.work_items
    WHERE org_id = p_org_id
      AND COALESCE(status, '') <> 'Cancelled'
  ) w ON true
  ON CONFLICT (org_id) DO UPDATE SET
    project_count = EXCLUDED.project_count,
    active_count = EXCLUDED.active_count,
    rag_green = EXCLUDED.rag_green,
    rag_amber = EXCLUDED.rag_amber,
    rag_red = EXCLUDED.rag_red,
    approved_funding = EXCLUDED.approved_funding,
    incurred = EXCLUDED.incurred,
    forecast_at_completion = EXCLUDED.forecast_at_completion,
    benefits_target = EXCLUDED.benefits_target,
    benefits_realised = EXCLUDED.benefits_realised,
    open_risks = EXCLUDED.open_risks,
    open_issues = EXCLUDED.open_issues,
    open_actions = EXCLUDED.open_actions,
    work_item_total = EXCLUDED.work_item_total,
    work_item_done = EXCLUDED.work_item_done,
    refreshed_at = EXCLUDED.refreshed_at,
    meta = EXCLUDED.meta
  RETURNING * INTO row;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_org_kpi_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_org_kpi_summary(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_refresh_org_kpi_from_projects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oid uuid;
BEGIN
  oid := COALESCE(NEW.org_id, OLD.org_id);
  IF oid IS NOT NULL THEN
    PERFORM public.refresh_org_kpi_summary(oid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_refresh_org_kpi ON public.projects;
CREATE TRIGGER trg_projects_refresh_org_kpi
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_org_kpi_from_projects();

-- Backfill summaries for existing orgs (best-effort).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    BEGIN
      PERFORM public.refresh_org_kpi_summary(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'KPI refresh skipped for %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;

-- =============================================================================
-- 4) Async export jobs (chunked org exports for large tenants)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'org_workbook',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  cursor_table text NULL,
  cursor_offset integer NOT NULL DEFAULT 0,
  row_count integer NOT NULL DEFAULT 0,
  result_path text NULL,
  error_message text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS export_jobs_org_created_idx
  ON public.export_jobs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS export_jobs_status_idx
  ON public.export_jobs (status, created_at ASC)
  WHERE status IN ('queued', 'running');

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS export_jobs_read_org ON public.export_jobs;
CREATE POLICY export_jobs_read_org
  ON public.export_jobs FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.get_user_org(auth.uid()))
    AND (
      requested_by = auth.uid()
      OR public.has_any_admin(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
  );

COMMENT ON TABLE public.export_jobs IS
  'Async chunked export queue for large org workbooks / evidence packs.';

-- =============================================================================
-- 5) Partition-ready helpers (extreme per-org size)
-- =============================================================================

-- Marker + helper used by ops to create monthly partitions for fact tables.
-- Does not rewrite existing tables in place (unsafe online); use for new
-- deployments or planned cutovers.

CREATE TABLE IF NOT EXISTS public.scale_partition_plan (
  table_name text PRIMARY KEY,
  strategy text NOT NULL DEFAULT 'range_month'
    CHECK (strategy IN ('range_month', 'hash_org')),
  partition_key text NOT NULL,
  notes text NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.scale_partition_plan (table_name, strategy, partition_key, notes, enabled)
VALUES
  ('financials_monthly', 'range_month', 'period_month', 'Candidate for monthly range partitions at extreme scale', false),
  ('timesheet_entries', 'range_month', 'created_at', 'Candidate via timesheet week_start join or created_at', false),
  ('audit_events', 'range_month', 'created_at', 'Retain hot window; archive cold partitions', false),
  ('work_items', 'hash_org', 'org_id', 'Only for single-tenant mega orgs / BYOD cutover', false)
ON CONFLICT (table_name) DO NOTHING;

ALTER TABLE public.scale_partition_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scale_partition_plan_platform_read ON public.scale_partition_plan;
CREATE POLICY scale_partition_plan_platform_read
  ON public.scale_partition_plan FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.ensure_month_partition(
  p_parent regclass,
  p_ym text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_name text;
  part_name text;
  start_d date;
  end_d date;
BEGIN
  -- Ops helper for planned cutovers. Parent must already be PARTITION BY RANGE.
  IF p_ym !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'p_ym must be YYYY-MM';
  END IF;
  parent_name := p_parent::text;
  part_name := replace(parent_name, '.', '_') || '_' || replace(p_ym, '-', '');
  start_d := (p_ym || '-01')::date;
  end_d := (start_d + interval '1 month')::date;

  IF to_regclass('public.' || part_name) IS NOT NULL THEN
    RETURN part_name;
  END IF;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
    part_name,
    parent_name,
    start_d,
    end_d
  );
  RETURN part_name;
EXCEPTION
  WHEN others THEN
    RAISE EXCEPTION 'ensure_month_partition failed (is % partitioned?): %', parent_name, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_month_partition(regclass, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_month_partition(regclass, text) TO service_role;

COMMENT ON FUNCTION public.ensure_month_partition(regclass, text) IS
  'Create a YYYY-MM range partition under an already-partitioned parent. For extreme-scale cutovers only.';

-- =============================================================================
-- 6) Portfolio chart aggregates (no full-table pull)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.portfolio_project_stats(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := coalesce(p_org_id, public.get_user_org(auth.uid()));
  v_by_rag jsonb;
  v_by_status jsonb;
  v_by_program jsonb;
  v_by_priority jsonb;
  v_total int;
  v_active int;
  v_completed int;
  v_budget numeric;
  v_incurred numeric;
BEGIN
  IF v_org IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  IF NOT (
    public.get_user_org(auth.uid()) = v_org
    OR public.is_platform_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT
    count(*)::int,
    count(*) FILTER (
      WHERE coalesce(status, '') ILIKE 'In Progress'
    )::int,
    count(*) FILTER (
      WHERE coalesce(status, '') ILIKE 'Completed'
         OR coalesce(status, '') ILIKE 'Complete'
    )::int,
    coalesce(sum(coalesce(budget, 0)), 0),
    coalesce(sum(coalesce(capex_incurred, 0)), 0)
  INTO v_total, v_active, v_completed, v_budget, v_incurred
  FROM public.projects
  WHERE org_id = v_org;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_rag
  FROM (
    SELECT coalesce(nullif(trim(rag), ''), 'Unknown') AS k, count(*)::int AS c
    FROM public.projects WHERE org_id = v_org GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_status
  FROM (
    SELECT coalesce(nullif(trim(status), ''), 'Unknown') AS k, count(*)::int AS c
    FROM public.projects WHERE org_id = v_org GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_program
  FROM (
    SELECT coalesce(nullif(trim(program), ''), 'Unassigned') AS k, count(*)::int AS c
    FROM public.projects WHERE org_id = v_org GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_priority
  FROM (
    SELECT coalesce(nullif(trim(priority), ''), 'Unassigned') AS k, count(*)::int AS c
    FROM public.projects WHERE org_id = v_org GROUP BY 1
  ) s;

  RETURN jsonb_build_object(
    'total', v_total,
    'active', v_active,
    'completed', v_completed,
    'budget_total', v_budget,
    'capex_incurred', v_incurred,
    'by_rag', v_by_rag,
    'by_status', v_by_status,
    'by_program', v_by_program,
    'by_priority', v_by_priority
  );
END;
$$;

REVOKE ALL ON FUNCTION public.portfolio_project_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portfolio_project_stats(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.portfolio_project_stats(uuid) IS
  'Org-scoped project chart aggregates for portfolio pages (avoids loading all rows).';


-- =============================================================================
-- 20260807120000_executive_intelligence.sql
-- =============================================================================

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


-- =============================================================================
-- 20260807140000_stage_gate_checklist_governance.sql
-- =============================================================================

-- Align stage-gate checklist templates with org stage_gate_definitions names.
-- Additive / safe to re-run. Does not remove legacy Initiate/Plan/… templates.

-- Seed governance checklists for the standard 9-gate waterfall (and any org
-- that already uses these definition names).
INSERT INTO public.stage_gate_checklist_items (org_id, gate_name, title, required, sort_order)
SELECT o.id, i.gate_name, i.title, i.required, i.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  -- Discovery
  ('Discovery', 'Problem / opportunity statement agreed', true, 10),
  ('Discovery', 'Stakeholders identified', true, 20),
  ('Discovery', 'Initial options shortlist documented', false, 30),
  -- Business Case / Seed Funding
  ('Business Case / Seed Funding', 'Draft business case attached', true, 10),
  ('Business Case / Seed Funding', 'Seed funding amount proposed', true, 20),
  ('Business Case / Seed Funding', 'Sponsor endorsement recorded', true, 30),
  -- Design
  ('Design', 'Solution design approved', true, 10),
  ('Design', 'Architecture / security review complete', true, 20),
  ('Design', 'Dependencies & integration map updated', true, 30),
  ('Design', 'Non-functional requirements captured', false, 40),
  -- Business Case / Full Funding
  ('Business Case / Full Funding', 'Full business case approved', true, 10),
  ('Business Case / Full Funding', 'Budget & benefits baseline set', true, 20),
  ('Business Case / Full Funding', 'Delivery approach confirmed', true, 30),
  -- Build
  ('Build', 'Delivery plan current', true, 10),
  ('Build', 'RAID log reviewed this stage', true, 20),
  ('Build', 'Build quality checks passed', true, 30),
  ('Build', 'Benefits tracker live', false, 40),
  -- Testing
  ('Testing', 'Test strategy / plan approved', true, 10),
  ('Testing', 'UAT / acceptance criteria signed off', true, 20),
  ('Testing', 'Defects at exit criteria', true, 30),
  ('Testing', 'Security / performance tests complete', false, 40),
  -- Deployment
  ('Deployment', 'Go-live readiness checklist complete', true, 10),
  ('Deployment', 'Rollback plan documented', true, 20),
  ('Deployment', 'Support / ops handover confirmed', true, 30),
  -- Handover
  ('Handover', 'Operational documentation handed over', true, 10),
  ('Handover', 'Training completed', true, 20),
  ('Handover', 'Warranty / hypercare plan agreed', false, 30),
  -- Benefit Realisation
  ('Benefit Realisation', 'Benefits measures baseline confirmed', true, 10),
  ('Benefit Realisation', 'Owner for each benefit assigned', true, 20),
  ('Benefit Realisation', 'First benefits review scheduled', true, 30)
) AS i(gate_name, title, required, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.stage_gate_checklist_items x
  WHERE x.org_id = o.id AND x.gate_name = i.gate_name AND x.title = i.title
);

-- Also seed for any active definition name that still has zero template rows,
-- using a minimal generic pack (orgs with custom gate names).
INSERT INTO public.stage_gate_checklist_items (org_id, gate_name, title, required, sort_order)
SELECT d.org_id, d.gate_name, g.title, g.required, g.sort_order
FROM public.stage_gate_definitions d
CROSS JOIN (VALUES
  ('Entry criteria met / prior gate closed', true, 10),
  ('Stage review pack attached', true, 20),
  ('Risks, issues & decisions reviewed', true, 30),
  ('Sponsor / forum endorsement recorded', true, 40)
) AS g(title, required, sort_order)
WHERE COALESCE(d.is_active, true)
  AND NOT EXISTS (
    SELECT 1 FROM public.stage_gate_checklist_items x
    WHERE x.org_id = d.org_id AND x.gate_name = d.gate_name
  );

COMMENT ON TABLE public.stage_gate_checklist_items IS
  'Org-level checklist templates keyed by gate_name (matches stage_gate_definitions.gate_name).';
COMMENT ON TABLE public.stage_gate_checklist_responses IS
  'Per stage_gate instance completion + evidence against org checklist templates.';


-- =============================================================================
-- 20260807150000_fix_kpi_refresh_enum_coalesce.sql
-- =============================================================================

-- Fix: Reforecast (and any projects UPDATE) failed with
--   invalid input value for enum project_status: ""
-- because refresh_org_kpi_summary / portfolio_project_stats used
-- COALESCE(status, '') / COALESCE(rag, '') on enum columns. Postgres
-- casts the '' literal to the enum type and rejects it.

CREATE OR REPLACE FUNCTION public.refresh_org_kpi_summary(p_org_id uuid)
RETURNS public.org_kpi_summaries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.org_kpi_summaries;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'org_id required';
  END IF;

  INSERT INTO public.org_kpi_summaries AS s (
    org_id,
    project_count,
    active_count,
    rag_green,
    rag_amber,
    rag_red,
    approved_funding,
    incurred,
    forecast_at_completion,
    benefits_target,
    benefits_realised,
    open_risks,
    open_issues,
    open_actions,
    work_item_total,
    work_item_done,
    refreshed_at,
    meta
  )
  SELECT
    p_org_id,
    COALESCE(p.project_count, 0),
    COALESCE(p.active_count, 0),
    COALESCE(p.rag_green, 0),
    COALESCE(p.rag_amber, 0),
    COALESCE(p.rag_red, 0),
    COALESCE(p.approved_funding, 0),
    COALESCE(p.incurred, 0),
    COALESCE(p.forecast_at_completion, 0),
    COALESCE(p.benefits_target, 0),
    COALESCE(p.benefits_realised, 0),
    COALESCE(r.open_risks, 0),
    COALESCE(i.open_issues, 0),
    COALESCE(a.open_actions, 0),
    COALESCE(w.work_item_total, 0),
    COALESCE(w.work_item_done, 0),
    now(),
    jsonb_build_object('source', 'refresh_org_kpi_summary')
  FROM (SELECT 1) seed
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS project_count,
      COUNT(*) FILTER (
        WHERE COALESCE(status::text, '') NOT ILIKE '%closed%'
          AND COALESCE(status::text, '') NOT ILIKE '%complete%'
          AND COALESCE(status::text, '') NOT ILIKE '%cancelled%'
      )::int AS active_count,
      COUNT(*) FILTER (WHERE lower(COALESCE(rag::text, '')) IN ('green', 'g'))::int AS rag_green,
      COUNT(*) FILTER (WHERE lower(COALESCE(rag::text, '')) IN ('amber', 'yellow', 'a'))::int AS rag_amber,
      COUNT(*) FILTER (WHERE lower(COALESCE(rag::text, '')) IN ('red', 'r'))::int AS rag_red,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(budget, 0) > 0 THEN budget
          ELSE COALESCE(capex_approved, 0) + COALESCE(opex_approved, 0)
        END
      ), 0) AS approved_funding,
      COALESCE(SUM(COALESCE(capex_incurred, 0) + COALESCE(opex_incurred, 0)), 0) AS incurred,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(forecast_at_completion, 0) > 0 THEN forecast_at_completion
          WHEN COALESCE(budget, 0) > 0 THEN budget
          ELSE COALESCE(capex_approved, 0) + COALESCE(opex_approved, 0)
        END
      ), 0) AS forecast_at_completion,
      COALESCE(SUM(COALESCE(benefits_target, 0)), 0) AS benefits_target,
      COALESCE(SUM(COALESCE(benefits_realised, 0)), 0) AS benefits_realised
    FROM public.projects
    WHERE org_id = p_org_id
  ) p ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS open_risks
    FROM public.risks
    WHERE org_id = p_org_id
      AND COALESCE(status, '') NOT ILIKE '%closed%'
      AND COALESCE(status, '') NOT ILIKE '%mitigated%'
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS open_issues
    FROM public.issues
    WHERE org_id = p_org_id
      AND COALESCE(status, '') NOT ILIKE '%closed%'
      AND COALESCE(status, '') NOT ILIKE '%resolved%'
  ) i ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS open_actions
    FROM public.actions
    WHERE org_id = p_org_id
      AND COALESCE(status, '') NOT ILIKE '%done%'
      AND COALESCE(status, '') NOT ILIKE '%closed%'
      AND COALESCE(status, '') NOT ILIKE '%complete%'
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS work_item_total,
      COUNT(*) FILTER (WHERE status = 'Done')::int AS work_item_done
    FROM public.work_items
    WHERE org_id = p_org_id
      AND COALESCE(status, '') <> 'Cancelled'
  ) w ON true
  ON CONFLICT (org_id) DO UPDATE SET
    project_count = EXCLUDED.project_count,
    active_count = EXCLUDED.active_count,
    rag_green = EXCLUDED.rag_green,
    rag_amber = EXCLUDED.rag_amber,
    rag_red = EXCLUDED.rag_red,
    approved_funding = EXCLUDED.approved_funding,
    incurred = EXCLUDED.incurred,
    forecast_at_completion = EXCLUDED.forecast_at_completion,
    benefits_target = EXCLUDED.benefits_target,
    benefits_realised = EXCLUDED.benefits_realised,
    open_risks = EXCLUDED.open_risks,
    open_issues = EXCLUDED.open_issues,
    open_actions = EXCLUDED.open_actions,
    work_item_total = EXCLUDED.work_item_total,
    work_item_done = EXCLUDED.work_item_done,
    refreshed_at = EXCLUDED.refreshed_at,
    meta = EXCLUDED.meta
  RETURNING * INTO row;

  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.portfolio_project_stats(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := coalesce(p_org_id, public.get_user_org(auth.uid()));
  v_by_rag jsonb;
  v_by_status jsonb;
  v_by_program jsonb;
  v_by_priority jsonb;
  v_total int;
  v_active int;
  v_completed int;
  v_budget numeric;
  v_incurred numeric;
BEGIN
  IF v_org IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  IF NOT (
    public.get_user_org(auth.uid()) = v_org
    OR public.is_platform_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT
    count(*)::int,
    count(*) FILTER (
      WHERE coalesce(status::text, '') ILIKE 'In Progress'
    )::int,
    count(*) FILTER (
      WHERE coalesce(status::text, '') ILIKE 'Completed'
         OR coalesce(status::text, '') ILIKE 'Complete'
    )::int,
    coalesce(sum(coalesce(budget, 0)), 0),
    coalesce(sum(coalesce(capex_incurred, 0)), 0)
  INTO v_total, v_active, v_completed, v_budget, v_incurred
  FROM public.projects
  WHERE org_id = v_org;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_rag
  FROM (
    SELECT coalesce(nullif(trim(rag::text), ''), 'Unknown') AS k, count(*)::int AS c
    FROM public.projects WHERE org_id = v_org GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_status
  FROM (
    SELECT coalesce(nullif(trim(status::text), ''), 'Unknown') AS k, count(*)::int AS c
    FROM public.projects WHERE org_id = v_org GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_program
  FROM (
    SELECT coalesce(nullif(trim(program), ''), 'Unassigned') AS k, count(*)::int AS c
    FROM public.projects WHERE org_id = v_org GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) INTO v_by_priority
  FROM (
    SELECT coalesce(nullif(trim(priority), ''), 'Unassigned') AS k, count(*)::int AS c
    FROM public.projects WHERE org_id = v_org GROUP BY 1
  ) s;

  RETURN jsonb_build_object(
    'total', v_total,
    'active', v_active,
    'completed', v_completed,
    'budget_total', v_budget,
    'capex_incurred', v_incurred,
    'by_rag', v_by_rag,
    'by_status', v_by_status,
    'by_program', v_by_program,
    'by_priority', v_by_priority
  );
END;
$$;


-- =============================================================================
-- 20260814150000_delivery_methods_stage_gates.sql
-- =============================================================================

-- Delivery methods (org-configurable) + stage gate templates per method.
-- Enables Waterfall / Agile / Hybrid defaults and custom methods created by org admins.
-- Safe / additive / mostly idempotent.

-- =============================================================================
-- 1) delivery_methods
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.delivery_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  uses_stage_gates boolean NOT NULL DEFAULT true,
  uses_sprints boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code),
  UNIQUE (org_id, name),
  CONSTRAINT delivery_methods_code_format CHECK (code ~ '^[a-z0-9][a-z0-9_-]{0,62}$')
);

CREATE INDEX IF NOT EXISTS idx_delivery_methods_org
  ON public.delivery_methods (org_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_methods TO authenticated;
GRANT ALL ON public.delivery_methods TO service_role;

ALTER TABLE public.delivery_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view org delivery methods" ON public.delivery_methods;
CREATE POLICY "Members view org delivery methods"
  ON public.delivery_methods FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "Admins manage org delivery methods" ON public.delivery_methods;
CREATE POLICY "Admins manage org delivery methods"
  ON public.delivery_methods FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_delivery_methods_updated_at ON public.delivery_methods;
CREATE TRIGGER trg_delivery_methods_updated_at
  BEFORE UPDATE ON public.delivery_methods
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =============================================================================
-- 2) Link stage_gate_definitions → delivery_methods
-- =============================================================================
ALTER TABLE public.stage_gate_definitions
  ADD COLUMN IF NOT EXISTS delivery_method_id uuid
    REFERENCES public.delivery_methods(id) ON DELETE CASCADE;

-- Seed built-in methods for every org
INSERT INTO public.delivery_methods (
  org_id, code, name, description, uses_stage_gates, uses_sprints, is_system, sort_order
)
SELECT o.id, v.code, v.name, v.description, v.uses_stage_gates, v.uses_sprints, true, v.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  ('waterfall', 'Waterfall', 'Sequential stage-gate delivery', true,  false, 1),
  ('agile',     'Agile',     'Iterative delivery with sprints', false, true,  2),
  ('hybrid',    'Hybrid',    'Stage gates plus sprints',        true,  true,  3)
) AS v(code, name, description, uses_stage_gates, uses_sprints, sort_order)
ON CONFLICT (org_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  uses_stage_gates = EXCLUDED.uses_stage_gates,
  uses_sprints = EXCLUDED.uses_sprints,
  is_system = true,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Attach existing org-global gate defs to Waterfall (legacy behaviour)
UPDATE public.stage_gate_definitions d
SET delivery_method_id = m.id
FROM public.delivery_methods m
WHERE m.org_id = d.org_id
  AND m.code = 'waterfall'
  AND d.delivery_method_id IS NULL;

-- Widen uniqueness: same gate name can exist on different methods
ALTER TABLE public.stage_gate_definitions
  DROP CONSTRAINT IF EXISTS stage_gate_definitions_org_id_gate_name_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stage_gate_definitions_org_method_gate_key'
  ) THEN
    ALTER TABLE public.stage_gate_definitions
      ADD CONSTRAINT stage_gate_definitions_org_method_gate_key
      UNIQUE (org_id, delivery_method_id, gate_name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stage_gate_definitions_method
  ON public.stage_gate_definitions (org_id, delivery_method_id, sort_order);

-- =============================================================================
-- 3) Default gate templates per built-in method (only when method has zero defs)
-- =============================================================================
-- Waterfall: keep whatever already exists; if still empty, seed canonical 9
INSERT INTO public.stage_gate_definitions (org_id, delivery_method_id, gate_name, sort_order, is_active)
SELECT m.org_id, m.id, g.name, g.ord, true
FROM public.delivery_methods m
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
WHERE m.code = 'waterfall'
  AND NOT EXISTS (
    SELECT 1 FROM public.stage_gate_definitions d
    WHERE d.delivery_method_id = m.id
  );

-- Agile: lighter release-oriented gates (optional on Agile projects)
INSERT INTO public.stage_gate_definitions (org_id, delivery_method_id, gate_name, sort_order, is_active)
SELECT m.org_id, m.id, g.name, g.ord, true
FROM public.delivery_methods m
CROSS JOIN (VALUES
  ('Discovery', 1),
  ('MVP Definition', 2),
  ('Build / Iterate', 3),
  ('Release Readiness', 4),
  ('Launch', 5),
  ('Hypercare', 6)
) AS g(name, ord)
WHERE m.code = 'agile'
  AND NOT EXISTS (
    SELECT 1 FROM public.stage_gate_definitions d
    WHERE d.delivery_method_id = m.id
  );

-- Hybrid: same as Waterfall by default (gates + sprints both enabled on method)
INSERT INTO public.stage_gate_definitions (org_id, delivery_method_id, gate_name, sort_order, is_active)
SELECT m.org_id, m.id, g.name, g.ord, true
FROM public.delivery_methods m
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
WHERE m.code = 'hybrid'
  AND NOT EXISTS (
    SELECT 1 FROM public.stage_gate_definitions d
    WHERE d.delivery_method_id = m.id
  );

-- =============================================================================
-- 4) projects.delivery_method: enum → text so custom method names can be stored
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects'
      AND column_name = 'delivery_method' AND udt_name = 'delivery_method'
  ) THEN
    ALTER TABLE public.projects
      ALTER COLUMN delivery_method DROP DEFAULT;
    ALTER TABLE public.projects
      ALTER COLUMN delivery_method TYPE text USING delivery_method::text;
    ALTER TABLE public.projects
      ALTER COLUMN delivery_method SET DEFAULT 'Waterfall';
  END IF;
END $$;

-- Optional FK-ish helper column (nullable); name remains source of truth for UI
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS delivery_method_id uuid
    REFERENCES public.delivery_methods(id) ON DELETE SET NULL;

UPDATE public.projects p
SET delivery_method_id = m.id
FROM public.delivery_methods m
WHERE m.org_id = p.org_id
  AND lower(m.name) = lower(coalesce(p.delivery_method, 'Waterfall'))
  AND p.delivery_method_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_delivery_method_id
  ON public.projects (delivery_method_id);

-- =============================================================================
-- 5) ensure_org_delivery_methods — call from UI / triggers for new orgs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ensure_org_delivery_methods(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.delivery_methods (
    org_id, code, name, description, uses_stage_gates, uses_sprints, is_system, sort_order
  )
  VALUES
    (p_org_id, 'waterfall', 'Waterfall', 'Sequential stage-gate delivery', true,  false, true, 1),
    (p_org_id, 'agile',     'Agile',     'Iterative delivery with sprints', false, true,  true, 2),
    (p_org_id, 'hybrid',    'Hybrid',    'Stage gates plus sprints',        true,  true,  true, 3)
  ON CONFLICT (org_id, code) DO NOTHING;

  -- Waterfall gates
  INSERT INTO public.stage_gate_definitions (org_id, delivery_method_id, gate_name, sort_order)
  SELECT p_org_id, m.id, g.name, g.ord
  FROM public.delivery_methods m
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
  WHERE m.org_id = p_org_id AND m.code = 'waterfall'
    AND NOT EXISTS (SELECT 1 FROM public.stage_gate_definitions d WHERE d.delivery_method_id = m.id);

  -- Agile gates
  INSERT INTO public.stage_gate_definitions (org_id, delivery_method_id, gate_name, sort_order)
  SELECT p_org_id, m.id, g.name, g.ord
  FROM public.delivery_methods m
  CROSS JOIN (VALUES
    ('Discovery', 1),
    ('MVP Definition', 2),
    ('Build / Iterate', 3),
    ('Release Readiness', 4),
    ('Launch', 5),
    ('Hypercare', 6)
  ) AS g(name, ord)
  WHERE m.org_id = p_org_id AND m.code = 'agile'
    AND NOT EXISTS (SELECT 1 FROM public.stage_gate_definitions d WHERE d.delivery_method_id = m.id);

  -- Hybrid gates
  INSERT INTO public.stage_gate_definitions (org_id, delivery_method_id, gate_name, sort_order)
  SELECT p_org_id, m.id, g.name, g.ord
  FROM public.delivery_methods m
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
  WHERE m.org_id = p_org_id AND m.code = 'hybrid'
    AND NOT EXISTS (SELECT 1 FROM public.stage_gate_definitions d WHERE d.delivery_method_id = m.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_org_delivery_methods(uuid) TO authenticated;

-- Auto-seed when a new organisation is created
CREATE OR REPLACE FUNCTION public.tg_org_ensure_delivery_methods()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_org_delivery_methods(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_ensure_delivery_methods ON public.organizations;
CREATE TRIGGER trg_org_ensure_delivery_methods
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_org_ensure_delivery_methods();

COMMENT ON TABLE public.delivery_methods IS
  'Org delivery models (Waterfall/Agile/Hybrid + custom). Controls gates vs sprints and gate templates.';
COMMENT ON COLUMN public.stage_gate_definitions.delivery_method_id IS
  'Stage-gate template set for a delivery method. Null only for legacy rows mid-migration.';


-- =============================================================================
-- 20260814170000_raid_escalation_and_alert_digests.sql
-- =============================================================================

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


-- =============================================================================
-- 20260814180000_security_hardening_rls_rate_acl.sql
-- =============================================================================

-- Harden org-member write policies: require can_edit_project (or admin for org-level).
-- Also: durable rate_limit_buckets for multi-instance rate limiting.
-- Also: seed default page ACL for system roles so default-deny page ACL stays usable.

-- ========== Durable rate limits ==========
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  count int NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
-- No authenticated policies — service role / SECURITY DEFINER only.
GRANT ALL ON public.rate_limit_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.check_rate_limit_bucket(
  _key text,
  _limit int,
  _window_seconds int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ts timestamptz := now();
  row_count int;
  row_reset timestamptz;
  retry int;
BEGIN
  IF _key IS NULL OR length(trim(_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'retry_after_sec', _window_seconds);
  END IF;

  SELECT count, reset_at INTO row_count, row_reset
  FROM public.rate_limit_buckets
  WHERE bucket_key = _key
  FOR UPDATE;

  IF NOT FOUND OR row_reset <= now_ts THEN
    INSERT INTO public.rate_limit_buckets (bucket_key, count, reset_at, updated_at)
    VALUES (_key, 1, now_ts + make_interval(secs => GREATEST(1, _window_seconds)), now_ts)
    ON CONFLICT (bucket_key) DO UPDATE
      SET count = 1,
          reset_at = now_ts + make_interval(secs => GREATEST(1, _window_seconds)),
          updated_at = now_ts;
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF row_count >= _limit THEN
    retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (row_reset - now_ts))));
    RETURN jsonb_build_object('ok', false, 'retry_after_sec', retry);
  END IF;

  UPDATE public.rate_limit_buckets
  SET count = count + 1, updated_at = now_ts
  WHERE bucket_key = _key;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit_bucket(text, int, int) TO service_role;

-- ========== Tighten write RLS ==========
-- lessons_learned
DROP POLICY IF EXISTS "org write lessons_learned" ON public.lessons_learned;
CREATE POLICY "editors write lessons_learned" ON public.lessons_learned
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
    )
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
    )
  );

-- documents
DROP POLICY IF EXISTS "org write documents" ON public.documents;
CREATE POLICY "editors write documents" ON public.documents
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
    )
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
    )
  );

-- demand_pipeline (org-level): admins / PMs with any edit rights via has_any_admin or role
DROP POLICY IF EXISTS "org write demand_pipeline" ON public.demand_pipeline;
CREATE POLICY "editors write demand_pipeline" ON public.demand_pipeline
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR public.has_role(auth.uid(), 'pm')
      OR public.has_role(auth.uid(), 'bu_lead')
    )
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR public.has_role(auth.uid(), 'pm')
      OR public.has_role(auth.uid(), 'bu_lead')
    )
  );

-- governance_channels: writers = admin
DROP POLICY IF EXISTS "org insert governance_channels" ON public.governance_channels;
DROP POLICY IF EXISTS "org update governance_channels" ON public.governance_channels;
DROP POLICY IF EXISTS "org_members_insert_governance_channels" ON public.governance_channels;
DROP POLICY IF EXISTS "org_members_update_governance_channels" ON public.governance_channels;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'governance_channels'
      AND policyname = 'org write governance_channels'
  ) THEN
    EXECUTE 'DROP POLICY "org write governance_channels" ON public.governance_channels';
  END IF;
END $$;

CREATE POLICY "admins write governance_channels" ON public.governance_channels
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

-- work_item_links (predecessor/successor graph)
DROP POLICY IF EXISTS "editors modify work_item_links" ON public.work_item_links;
DROP POLICY IF EXISTS "org write work_item_links" ON public.work_item_links;
DROP POLICY IF EXISTS "editors write work_item_links" ON public.work_item_links;
CREATE POLICY "editors write work_item_links" ON public.work_item_links
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.work_items wi
        WHERE wi.id IN (work_item_links.predecessor_id, work_item_links.successor_id)
          AND public.can_edit_project(auth.uid(), wi.project_id)
      )
    )
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.work_items wi
        WHERE wi.id IN (work_item_links.predecessor_id, work_item_links.successor_id)
          AND public.can_edit_project(auth.uid(), wi.project_id)
      )
    )
  );

-- custom_reports
DROP POLICY IF EXISTS "org write custom_reports" ON public.custom_reports;
CREATE POLICY "admins write custom_reports" ON public.custom_reports
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND (public.has_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'executive'))
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND (public.has_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'executive'))
  );

-- governance_links / governance_tasks (if present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='governance_links') THEN
    EXECUTE 'DROP POLICY IF EXISTS "org write governance_links" ON public.governance_links';
    EXECUTE $p$
      CREATE POLICY "editors write governance_links" ON public.governance_links
        FOR ALL TO authenticated
        USING (
          org_id = public.get_user_org(auth.uid())
          AND (
            public.has_any_admin(auth.uid())
            OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
          )
        )
        WITH CHECK (
          org_id = public.get_user_org(auth.uid())
          AND (
            public.has_any_admin(auth.uid())
            OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
          )
        )
    $p$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='governance_tasks') THEN
    EXECUTE 'DROP POLICY IF EXISTS "org write governance_tasks" ON public.governance_tasks';
    EXECUTE $p$
      CREATE POLICY "editors write governance_tasks" ON public.governance_tasks
        FOR ALL TO authenticated
        USING (
          org_id = public.get_user_org(auth.uid())
          AND (
            public.has_any_admin(auth.uid())
            OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
          )
        )
        WITH CHECK (
          org_id = public.get_user_org(auth.uid())
          AND (
            public.has_any_admin(auth.uid())
            OR (project_id IS NOT NULL AND public.can_edit_project(auth.uid(), project_id))
          )
        )
    $p$;
  END IF;
END $$;

-- ========== Default page ACL seed helper ==========
-- Ensures non-admin roles get an explicit allow list when orgs have empty matrices.
CREATE OR REPLACE FUNCTION public.seed_default_page_permissions(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paths text[] := ARRAY[
    '/app','/app/projects','/app/portfolio-pulse','/app/executive-cockpit',
    '/app/risks','/app/issues','/app/actions','/app/decisions',
    '/app/timeline','/app/work-items','/app/work-board','/app/my-work',
    '/app/resources','/app/stakeholders','/app/status-updates','/app/lessons',
    '/app/benefits','/app/dependencies','/app/change-requests','/app/stage-gates',
    '/app/settings','/app/support'
  ];
  role_key text;
  p text;
BEGIN
  FOREACH role_key IN ARRAY ARRAY['pm','bu_lead','executive'] LOOP
    FOREACH p IN ARRAY paths LOOP
      INSERT INTO public.role_table_permissions (org_id, role, table_name, can_view, can_edit)
      SELECT _org_id, role_key, 'page::' || p, true, role_key IN ('pm','bu_lead')
      WHERE NOT EXISTS (
        SELECT 1 FROM public.role_table_permissions x
        WHERE x.org_id = _org_id AND x.role = role_key AND x.table_name = 'page::' || p
      );
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_default_page_permissions(uuid) TO authenticated, service_role;

-- Best-effort: seed existing orgs that have zero page::* rows
DO $$
DECLARE
  o record;
  n int;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    SELECT count(*) INTO n
    FROM public.role_table_permissions
    WHERE org_id = o.id AND table_name LIKE 'page::%';
    IF n = 0 THEN
      PERFORM public.seed_default_page_permissions(o.id);
    END IF;
  END LOOP;
END $$;

