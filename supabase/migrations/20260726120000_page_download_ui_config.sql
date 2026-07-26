-- Page download allow/deny is stored in existing JSON configs (no new columns):
--   organizations.ui_config.page_download
--   landing_config.config.page_download
-- Document the org shape for operators.

COMMENT ON COLUMN public.organizations.ui_config IS
  'Org UI JSON: navigation, branding, style_theme, project_visibility, page_download (per-page PDF/PPT/PNG allow map), etc.';
