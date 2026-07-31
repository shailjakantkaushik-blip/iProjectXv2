-- Org integrations (Jira and extensible connectors).
-- Secrets encrypted at rest (app layer AES-256-GCM via BYOD_SECRETS_KEK / INTEGRATIONS_SECRETS_KEK).

CREATE TABLE IF NOT EXISTS public.org_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('jira', 'azure_devops', 'servicenow', 'custom_webhook')),
  display_name text,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ciphertext text,
  secret_nonce text,
  secret_configured boolean NOT NULL DEFAULT false,
  secret_hint text,
  status text NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured', 'configured', 'tested', 'active', 'error')),
  last_tested_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (org_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_org_integrations_org ON public.org_integrations (org_id);

COMMENT ON TABLE public.org_integrations IS
  'Per-org external system connectors. API tokens encrypted; never expose plaintext to clients.';
COMMENT ON COLUMN public.org_integrations.config IS
  'Non-secret settings: site_url, email, project_keys[], sync_mode, map_to (work_items|demand_pipeline).';

ALTER TABLE public.org_integrations ENABLE ROW LEVEL SECURITY;

-- No authenticated policies — service-role / server functions only (same pattern as BYOD).
REVOKE ALL ON public.org_integrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.org_integrations TO service_role;

-- External entity links (Jira issue key ↔ work item / demand)
CREATE TABLE IF NOT EXISTS public.integration_external_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text NOT NULL,
  external_key text,
  entity_type text NOT NULL CHECK (entity_type IN ('work_item', 'demand_pipeline', 'project')),
  entity_id uuid NOT NULL,
  last_synced_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_links_org ON public.integration_external_links (org_id);
CREATE INDEX IF NOT EXISTS idx_integration_links_entity
  ON public.integration_external_links (org_id, entity_type, entity_id);

ALTER TABLE public.integration_external_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read integration links" ON public.integration_external_links;
CREATE POLICY "org read integration links" ON public.integration_external_links
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "admins write integration links" ON public.integration_external_links;
CREATE POLICY "admins write integration links" ON public.integration_external_links
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.has_any_admin(auth.uid())
  )
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND public.has_any_admin(auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_external_links TO authenticated;
GRANT ALL ON public.integration_external_links TO service_role;
