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
