
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
