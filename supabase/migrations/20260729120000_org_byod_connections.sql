-- Bring Your Own Database (BYOD) — per-organisation customer Supabase connectivity.
-- Secrets are stored as AES-GCM ciphertext; access is service-role / server-fn only.
-- Default orgs keep using the shared iProjectX Supabase (byod_active = false).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS byod_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.byod_active IS
  'True when this org routes tenant data to a customer-hosted Supabase (BYOD). Control-plane data always stays on iProjectX.';

CREATE TABLE IF NOT EXISTS public.org_byod_connections (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'supabase'
    CHECK (provider IN ('supabase')),
  supabase_url text,
  -- Publishable/anon key (not as sensitive as service role; still server-managed)
  publishable_key text,
  -- AES-256-GCM ciphertext + nonce (base64). Never returned to clients.
  secret_ciphertext text,
  secret_nonce text,
  secret_configured boolean NOT NULL DEFAULT false,
  secret_hint text,
  status text NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured', 'configured', 'tested', 'active', 'error')),
  last_tested_at timestamptz,
  last_error text,
  notes text,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_byod_connections_status_idx
  ON public.org_byod_connections (status)
  WHERE enabled = true;

COMMENT ON TABLE public.org_byod_connections IS
  'Platform-admin BYOD config. Ciphertext columns are never exposed via client RLS; use server functions only.';

ALTER TABLE public.org_byod_connections ENABLE ROW LEVEL SECURITY;

-- No authenticated policies: browser clients cannot read or write this table.
-- Platform admins manage rows exclusively through service-role server functions.

REVOKE ALL ON public.org_byod_connections FROM PUBLIC;
REVOKE ALL ON public.org_byod_connections FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_byod_connections TO service_role;

-- Safe status view for future org-admin read-only (no ciphertext). Not granted to authenticated yet.
CREATE OR REPLACE VIEW public.org_byod_status
WITH (security_invoker = true)
AS
SELECT
  c.org_id,
  c.enabled,
  c.provider,
  c.status,
  c.secret_configured,
  c.secret_hint,
  c.last_tested_at,
  c.last_error,
  c.updated_at,
  o.byod_active
FROM public.org_byod_connections c
JOIN public.organizations o ON o.id = c.org_id;

REVOKE ALL ON public.org_byod_status FROM PUBLIC;
REVOKE ALL ON public.org_byod_status FROM anon, authenticated;
GRANT SELECT ON public.org_byod_status TO service_role;
