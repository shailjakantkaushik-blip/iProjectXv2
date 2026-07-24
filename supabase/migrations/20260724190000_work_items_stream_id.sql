-- WBS / work_items: attach optional stream_id; autopopulate Core when streams enable.

ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS work_items_stream_idx ON public.work_items (stream_id);

-- Backfill: default stream when project already has streams.
UPDATE public.work_items wi
SET stream_id = ps.id
FROM public.project_streams ps
WHERE wi.stream_id IS NULL
  AND ps.project_id = wi.project_id
  AND ps.is_default = true;

-- Keep always-on Core helper in sync: also migrate work_items.
CREATE OR REPLACE FUNCTION public.ensure_project_core_stream(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_stream uuid;
  v_proj public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  v_org := v_proj.org_id;

  SELECT id INTO v_stream
  FROM public.project_streams
  WHERE project_id = p_project_id AND is_default
  LIMIT 1;

  IF v_stream IS NULL THEN
    INSERT INTO public.project_streams (
      org_id, project_id, name, code, is_default, sort_order, status, rag, owner,
      planned_start_date, planned_end_date, actual_start_date, actual_end_date,
      budget, capex_approved, capex_incurred, opex_approved, opex_incurred,
      forecast_at_completion
    )
    VALUES (
      v_org, p_project_id, 'Core', 'CORE', true, 0,
      COALESCE(v_proj.status::text, 'In Progress'), v_proj.rag, v_proj.sponsor,
      COALESCE(v_proj.planned_start_date, v_proj.start_date),
      COALESCE(v_proj.planned_end_date, v_proj.end_date),
      v_proj.actual_start_date, v_proj.actual_end_date,
      COALESCE(v_proj.budget, 0),
      COALESCE(v_proj.capex_approved, 0), COALESCE(v_proj.capex_incurred, 0),
      COALESCE(v_proj.opex_approved, 0), COALESCE(v_proj.opex_incurred, 0),
      v_proj.forecast_at_completion
    )
    ON CONFLICT (project_id, name) DO UPDATE
      SET is_default = true,
          updated_at = now()
    RETURNING id INTO v_stream;
  END IF;

  UPDATE public.stage_gates SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.milestones SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.financials_monthly SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.fy_allocations SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.resource_allocations SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;
  UPDATE public.work_items SET stream_id = v_stream
   WHERE project_id = p_project_id AND stream_id IS NULL;

  UPDATE public.projects
     SET streams_enabled = true, updated_at = now()
   WHERE id = p_project_id
     AND (NOT streams_enabled OR streams_enabled IS DISTINCT FROM true);

  RETURN v_stream;
END;
$$;
