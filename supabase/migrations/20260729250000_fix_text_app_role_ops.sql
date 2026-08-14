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
