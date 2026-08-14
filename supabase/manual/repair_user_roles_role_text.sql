-- Repair: unblock enum→text migration of user_roles.role on a partially
-- applied new Supabase project (error 0A000 / cert_org_admin_select).
-- Run this once in SQL Editor, then re-run the remainder of the full schema
-- OR re-run from migration 20260729193000 onward / the full schema file again
-- (later statements are mostly idempotent).

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

DROP POLICY IF EXISTS "cert_org_admin_select" ON public.org_license_certificates;
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
