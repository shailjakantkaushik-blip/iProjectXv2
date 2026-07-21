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
