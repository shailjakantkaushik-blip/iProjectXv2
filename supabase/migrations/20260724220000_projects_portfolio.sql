-- Portfolio label on the project register (data editor + executive filters).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS portfolio text;

COMMENT ON COLUMN public.projects.portfolio IS
  'Portfolio grouping for the project (e.g. Business Strategic, IT Run). Editable in Data Editor.';

CREATE INDEX IF NOT EXISTS projects_org_portfolio_idx
  ON public.projects (org_id, portfolio);
