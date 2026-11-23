-- L1: org admins could INSERT arbitrary audit_events (and audit_log) rows.
-- Tenant-visible audit must come from SECURITY DEFINER triggers or
-- service_role. SELECT stays for org-admin readers.

DROP POLICY IF EXISTS "org insert audit_events" ON public.audit_events;
REVOKE INSERT ON public.audit_events FROM PUBLIC;
REVOKE INSERT ON public.audit_events FROM anon, authenticated;
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;

DROP POLICY IF EXISTS "authenticated insert audit_log" ON public.audit_log;
REVOKE INSERT ON public.audit_log FROM PUBLIC;
REVOKE INSERT ON public.audit_log FROM anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
