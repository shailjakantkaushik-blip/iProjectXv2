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
