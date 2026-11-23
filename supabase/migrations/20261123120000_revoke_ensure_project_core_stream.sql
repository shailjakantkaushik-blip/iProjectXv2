-- T3: ensure_project_core_stream is SECURITY DEFINER and was granted to
-- authenticated with no caller check. Guessing a project UUID could rewrite
-- another tenant's streams, gates, milestones, and monthly financials.
-- Public callers must use enable_project_streams (org-checked). Triggers and
-- other DEFINER functions keep working as the owner.

REVOKE ALL ON FUNCTION public.ensure_project_core_stream(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_project_core_stream(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_project_core_stream(uuid) TO service_role;

-- Same class of bug: default PUBLIC EXECUTE on an unguarded DEFINER rollup.
REVOKE ALL ON FUNCTION public.rollup_project_from_streams(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollup_project_from_streams(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollup_project_from_streams(uuid) TO service_role;
