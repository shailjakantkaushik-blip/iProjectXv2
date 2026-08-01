-- Paste in Supabase SQL editor: stakeholder ↔ user + project primary sponsor.
-- Same as supabase/migrations/20260801120000_stakeholder_user_sponsor.sql

ALTER TABLE public.stakeholders
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.stakeholders
  ADD COLUMN IF NOT EXISTS is_sponsor boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stakeholders.user_id IS
  'Optional link to an org login (profiles / auth.users). External sponsors may leave null.';
COMMENT ON COLUMN public.stakeholders.is_sponsor IS
  'True when this person acts as a project sponsor (may be multiple; project.sponsor_stakeholder_id is primary).';

CREATE INDEX IF NOT EXISTS idx_stakeholders_user
  ON public.stakeholders (org_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stakeholders_sponsor
  ON public.stakeholders (project_id)
  WHERE is_sponsor = true;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS sponsor_stakeholder_id uuid
    REFERENCES public.stakeholders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.projects.sponsor_stakeholder_id IS
  'Primary sponsor stakeholder for the project. projects.sponsor text is kept in sync for display/export.';

CREATE INDEX IF NOT EXISTS idx_projects_sponsor_stakeholder
  ON public.projects (sponsor_stakeholder_id)
  WHERE sponsor_stakeholder_id IS NOT NULL;
