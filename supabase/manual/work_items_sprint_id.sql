-- Paste in Supabase SQL Editor, then Reload schema.
-- Adds optional sprint_id on work_items for Agile / Hybrid capture
-- (same idea as stage_gate_id for Waterfall phases).

ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS sprint_id uuid REFERENCES public.sprints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_items_sprint
  ON public.work_items (sprint_id)
  WHERE sprint_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_items_project_sprint
  ON public.work_items (project_id, sprint_id)
  WHERE sprint_id IS NOT NULL;

COMMENT ON COLUMN public.work_items.sprint_id IS
  'Optional sprint for Agile/Hybrid work items (parallel to stage_gate_id for Waterfall).';
