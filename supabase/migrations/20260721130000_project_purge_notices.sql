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
