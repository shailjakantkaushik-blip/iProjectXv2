-- =========================================================================
-- DEPRECATED — use wipe_and_seed_16_projects_with_streams.sql instead.
-- That script seeds stream-scoped stage gates (required for timelines),
-- work-item phase links, timesheets, and the full application demo set.
-- =========================================================================

DO $$
BEGIN
  RAISE EXCEPTION
    'Use supabase/seed/wipe_and_seed_16_projects_with_streams.sql — this older seed omits stream stage gates.';
END $$;
