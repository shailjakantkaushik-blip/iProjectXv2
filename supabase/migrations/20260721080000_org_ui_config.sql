-- Org-level UI preferences (navigation sequence, focus defaults, etc.)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ui_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.ui_config IS
  'Org UI prefs: { navigation: NavigationConfig, focus_mode?: boolean }';
