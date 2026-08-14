-- Repair / unblock for fresh or partial schema applies.
-- Safe when org_license_certificates (or user_roles) does not exist yet.
--
-- If this is a brand-new empty project: skip this file and run only
--   supabase/manual/iprojectx_full_platform_schema.sql
--
-- If you already hit the role ALTER / policy error mid-apply: run this, then
-- re-run the full schema file.

DO $$
BEGIN
  -- Only touch the certificate policy when the table exists.
  IF to_regclass('public.org_license_certificates') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "cert_org_admin_select" ON public.org_license_certificates';
  END IF;

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

  IF to_regclass('public.org_license_certificates') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "cert_org_admin_select" ON public.org_license_certificates';
    EXECUTE $policy$
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
        )
    $policy$;
  END IF;
END $$;
