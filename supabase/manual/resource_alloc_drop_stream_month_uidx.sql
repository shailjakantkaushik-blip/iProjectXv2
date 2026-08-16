-- Allow planned allocations per stream AND phase in the same month.
-- Paste after resource_alloc_stage_gate_labor.sql if the stream-month unique
-- is still blocking inserts.

DROP INDEX IF EXISTS public.resource_allocations_stream_uidx;
DROP INDEX IF EXISTS public.resource_allocations_null_stream_uidx;
DROP INDEX IF EXISTS public.resource_allocations_project_stream_resource_period_uidx;
DROP INDEX IF EXISTS public.resource_allocations_project_null_stream_resource_period_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_proj_stream_gate_res_period_uidx
  ON public.resource_allocations (project_id, stream_id, stage_gate_id, resource_id, period_month)
  WHERE stream_id IS NOT NULL AND stage_gate_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_proj_stream_nullgate_res_period_uidx
  ON public.resource_allocations (project_id, stream_id, resource_id, period_month)
  WHERE stream_id IS NOT NULL AND stage_gate_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_proj_nullstream_gate_res_period_uidx
  ON public.resource_allocations (project_id, stage_gate_id, resource_id, period_month)
  WHERE stream_id IS NULL AND stage_gate_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resource_allocations_proj_nullstream_nullgate_res_period_uidx
  ON public.resource_allocations (project_id, resource_id, period_month)
  WHERE stream_id IS NULL AND stage_gate_id IS NULL;
