-- Per-organisation SSO (SAML) settings for white-label login.
-- Actual IdP registration still happens in Supabase (dashboard/CLI).
-- This stores the org ↔ provider mapping and enables the SSO button on /o/{slug}/login.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS sso_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sso_provider_id text NULL,
  ADD COLUMN IF NOT EXISTS sso_domains text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sso_button_label text NULL;

COMMENT ON COLUMN public.organizations.sso_enabled IS
  'When true, white-label login shows Sign in with SSO (requires sso_provider_id or sso_domains).';
COMMENT ON COLUMN public.organizations.sso_provider_id IS
  'Supabase Auth SSO provider UUID from `supabase sso add` / dashboard.';
COMMENT ON COLUMN public.organizations.sso_domains IS
  'Email domains for SP-initiated SSO (e.g. acme.com). Optional if provider_id is set.';
COMMENT ON COLUMN public.organizations.sso_button_label IS
  'Optional button label on org login, e.g. "Sign in with Acme SSO".';

CREATE OR REPLACE FUNCTION public.tg_organizations_lock_sso_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.sso_enabled IS DISTINCT FROM OLD.sso_enabled
    OR NEW.sso_provider_id IS DISTINCT FROM OLD.sso_provider_id
    OR NEW.sso_domains IS DISTINCT FROM OLD.sso_domains
    OR NEW.sso_button_label IS DISTINCT FROM OLD.sso_button_label
  ) THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF public.is_platform_admin(auth.uid()) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'only platform_admin can change organisation SSO settings';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_lock_sso_fields ON public.organizations;
CREATE TRIGGER trg_organizations_lock_sso_fields
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_organizations_lock_sso_fields();
