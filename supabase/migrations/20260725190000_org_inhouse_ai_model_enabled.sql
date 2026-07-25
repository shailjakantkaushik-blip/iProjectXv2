-- Per-organisation opt-in for the approved In-house AI model.
-- Default FALSE: customer portfolio context never leaves the local engine
-- unless a platform_admin explicitly enables the org.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS inhouse_ai_model_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.inhouse_ai_model_enabled IS
  'When true AND server INHOUSE_AI_* is configured, In-house AI may send a capped RLS context pack to the approved model endpoint. Default false — local engine only.';

-- Only platform_admin (or service role with no JWT) may flip this entitlement.
CREATE OR REPLACE FUNCTION public.tg_organizations_lock_inhouse_ai_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.inhouse_ai_model_enabled IS DISTINCT FROM OLD.inhouse_ai_model_enabled THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role / system
    END IF;
    IF public.is_platform_admin(auth.uid()) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'only platform_admin can change inhouse_ai_model_enabled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_lock_inhouse_ai_flag ON public.organizations;
CREATE TRIGGER trg_organizations_lock_inhouse_ai_flag
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_organizations_lock_inhouse_ai_flag();
