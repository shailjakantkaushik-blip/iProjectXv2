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
