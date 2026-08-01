-- Per-organisation IP address restriction for white-label sign-in / app access.
-- When enabled, only client IPs matching ip_allowlist (exact or CIDR) may enter.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ip_restriction_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ip_allowlist text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.organizations.ip_restriction_enabled IS
  'When true, members of this organisation may only sign in / use the app from IPs in ip_allowlist.';
COMMENT ON COLUMN public.organizations.ip_allowlist IS
  'Allowed client IPs or CIDR ranges (e.g. 203.0.113.10, 10.0.0.0/8). Empty while enabled denies all non–platform-admin access.';

-- Only platform_admin (or service role with no JWT) may change IP restriction settings.
CREATE OR REPLACE FUNCTION public.tg_organizations_lock_ip_restriction_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.ip_restriction_enabled IS DISTINCT FROM OLD.ip_restriction_enabled
    OR NEW.ip_allowlist IS DISTINCT FROM OLD.ip_allowlist
  ) THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF public.is_platform_admin(auth.uid()) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'only platform_admin can change organisation IP restriction settings';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_lock_ip_restriction_fields ON public.organizations;
CREATE TRIGGER trg_organizations_lock_ip_restriction_fields
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_organizations_lock_ip_restriction_fields();
