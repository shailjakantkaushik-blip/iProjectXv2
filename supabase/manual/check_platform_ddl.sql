-- =============================================================================
-- iProjectX — Diagnose missing platform DDL (functions / triggers / policies)
-- =============================================================================
-- Run in Supabase SQL Editor BEFORE/AFTER applying:
--   supabase/manual/repair_platform_functions_triggers_policies.sql
-- or a full apply of:
--   supabase/manual/iprojectx_full_platform_schema.sql
-- =============================================================================

-- Expected ballpark after a complete apply (counts drift as migrations grow):
--   functions  ~60+
--   triggers   ~60+
--   policies  ~150+

SELECT 'functions' AS kind, count(*)::text AS n
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
UNION ALL
SELECT 'triggers', count(*)::text
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
UNION ALL
SELECT 'policies', count(*)::text
FROM pg_policies WHERE schemaname = 'public'
UNION ALL
SELECT 'tables', count(*)::text
FROM pg_tables WHERE schemaname = 'public'
ORDER BY 1;

-- Critical helper functions used by RLS / app
SELECT f.fn AS expected_function,
       EXISTS (
         SELECT 1
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = f.fn
       ) AS present
FROM (VALUES
  ('get_user_org'),
  ('has_role'),
  ('has_any_admin'),
  ('is_platform_admin'),
  ('can_edit_project'),
  ('handle_new_user'),
  ('tg_set_updated_at'),
  ('ensure_project_core_stream'),
  ('generate_due_invoices'),
  ('refresh_org_kpi_summary')
) AS f(fn)
ORDER BY 1;

-- Critical triggers
SELECT x.tg AS expected_trigger,
       EXISTS (
         SELECT 1
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname IN ('public', 'auth')
           AND NOT t.tgisinternal
           AND t.tgname = x.tg
       ) AS present
FROM (VALUES
  ('on_auth_user_created'),
  ('trg_orgs_updated'),
  ('trg_projects_updated'),
  ('trg_stage_gates_updated'),
  ('trg_invoice_notify')
) AS x(tg)
ORDER BY 1;

-- Sample of missing-looking empties: tables with RLS enabled but zero policies
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
  )
ORDER BY 1
LIMIT 50;
