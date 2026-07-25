-- Org audit log: readable by org admins (+ platform admins), not all members.
-- Inserts remain org-admin-only (from prior hardening) / SECURITY DEFINER triggers.

DROP POLICY IF EXISTS "org read audit_events" ON public.audit_events;
CREATE POLICY "org read audit_events" ON public.audit_events
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      org_id = public.get_user_org(auth.uid())
      AND public.has_any_admin(auth.uid())
    )
  );

COMMENT ON POLICY "org read audit_events" ON public.audit_events IS
  'Tenant audit trail: org_admin/admin of that org, or platform_admin.';
