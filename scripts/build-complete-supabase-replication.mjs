/**
 * Build one pasteable Supabase replication SQL:
 *   supabase/manual/COMPLETE_SUPABASE_REPLICATION.sql
 *
 * Contents (in order):
 *   1. Full DDL from all supabase/migrations/*.sql (tables, enums, RLS,
 *      functions, triggers, grants, indexes)
 *   2. Platform control-plane baseline seed (plans, landing, invoice template,
 *      legal policies, expenses, subscriptions)
 *   3. Fresh platform admin + iProjectX org bootstrap
 *   4. Rich 4-project iProjectX sample portfolio
 *
 * Usage:
 *   node scripts/build-complete-supabase-replication.mjs
 *
 * Apply to a NEW empty Supabase project:
 *   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/manual/COMPLETE_SUPABASE_REPLICATION.sql
 *   (or paste into SQL Editor in sections if the UI size-limits a single paste)
 */
import { readdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const manualDir = path.join(root, "supabase", "manual");
const outFile = path.join(manualDir, "COMPLETE_SUPABASE_REPLICATION.sql");

async function readOptional(rel) {
  const full = path.isAbsolute(rel) ? rel : path.join(root, rel);
  try {
    await access(full);
    return await readFile(full, "utf8");
  } catch {
    return null;
  }
}

const generatedAt = new Date().toISOString();
const migrationNames = (await readdir(migrationsDir))
  .filter((n) => n.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

const parts = [];

parts.push(`-- =============================================================================
-- iProjectX — COMPLETE Supabase replication pack
-- Generated: ${generatedAt}
-- =============================================================================
--
-- WHAT THIS FILE CONTAINS
--   1) Full schema from ${migrationNames.length} migrations
--      (enums, tables, indexes, RLS policies, grants, functions, triggers)
--   2) Platform control-plane baseline
--      (billing_plans, landing_config, invoice_template_config, legal_policies,
--       platform_expenses, subscriptions for orgs)
--   3) Bootstrap platform admin + iProjectX organisation
--   4) Rich sample portfolio (4 iProjectX projects end-to-end)
--
-- TARGET
--   Brand-new EMPTY Supabase project (no prior public schema objects).
--   Do NOT run against a production DB that already has data you care about —
--   section 4 wipes/reseeds the iProjectX org project graph.
--
-- HOW TO APPLY
--   A) psql (preferred for large files):
--        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f COMPLETE_SUPABASE_REPLICATION.sql
--      Use the Supabase Dashboard → Project Settings → Database connection string
--      (prefer "Session mode" / direct Postgres URI with the service role password).
--
--   B) SQL Editor:
--      If paste size is limited, run the four logical sections in order
--      (search for "SECTION 1/4", "SECTION 2/4", …).
--
-- AFTER APPLY
--   Login:  admin@iprojectx.com
--   Password (forced change): ChangeMe@2026!
--   Point Vercel / app env at this project's URL + anon/publishable key
--   (+ service role on the server only).
--
-- REGENERATE
--   node scripts/build-complete-supabase-replication.mjs
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

`);

parts.push(`
-- #############################################################################
-- SECTION 1/4 — FULL SCHEMA (migrations in order)
-- #############################################################################
`);

for (const name of migrationNames) {
  const body = (await readFile(path.join(migrationsDir, name), "utf8")).trim();
  parts.push(`
-- -----------------------------------------------------------------------------
-- migration: ${name}
-- -----------------------------------------------------------------------------
${body}
`);
}

// Safety fix that must win after historical migrations
const roleFix = await readOptional("supabase/manual/fix_text_app_role_ops.sql");
if (roleFix) {
  parts.push(`
-- #############################################################################
-- SECTION 1b — text / app_role compatibility (idempotent)
-- #############################################################################
${roleFix.trim()}
`);
}

const baseline =
  (await readOptional("supabase/manual/seed_platform_baseline.sql")) ||
  (await readOptional("/tmp/seed_platform_baseline.sql"));
if (baseline) {
  // Also write it into manual/ so the pack is self-contained in-repo
  await writeFile(path.join(manualDir, "seed_platform_baseline.sql"), baseline, "utf8");
  parts.push(`
-- #############################################################################
-- SECTION 2/4 — PLATFORM CONTROL-PLANE BASELINE
-- #############################################################################
${baseline.trim()}
`);
} else {
  parts.push(`
-- #############################################################################
-- SECTION 2/4 — PLATFORM CONTROL-PLANE BASELINE (MISSING)
-- #############################################################################
-- WARNING: seed_platform_baseline.sql was not found when this pack was built.
-- Create billing_plans / legal_policies manually or re-run the builder after
-- adding supabase/manual/seed_platform_baseline.sql
`);
}

const freshAdmin = await readOptional("supabase/manual/fresh_seed_platform_admin.sql");
if (freshAdmin) {
  parts.push(`
-- #############################################################################
-- SECTION 3/4 — PLATFORM ADMIN + iProjectX ORG BOOTSTRAP
-- #############################################################################
${freshAdmin.trim()}
`);
}

// Ensure delivery methods exist after org bootstrap (idempotent when present).
parts.push(`
-- Ensure delivery methods + per-method gate templates for bootstrap org
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_org_delivery_methods'
  ) THEN
    PERFORM public.ensure_org_delivery_methods(id)
    FROM public.organizations
    WHERE slug IN ('iprojectx', 'isafex');
  END IF;
END $$;
`);

const sample =
  (await readOptional("supabase/manual/wipe_seed_iprojectx_4_projects_e2e.sql"));
if (sample) {
  parts.push(`
-- #############################################################################
-- SECTION 4/4 — SAMPLE PORTFOLIO (iProjectX 4 projects end-to-end)
-- NOTE: This section intentionally wipes then reseeds iProjectX project data only.
-- #############################################################################
${sample.trim()}
`);
}

parts.push(`
-- =============================================================================
-- REPLICATION COMPLETE — smoke checks
-- =============================================================================
SELECT 'organizations' AS entity, count(*)::text AS n FROM public.organizations
UNION ALL SELECT 'projects', count(*)::text FROM public.projects
UNION ALL SELECT 'billing_plans', count(*)::text FROM public.billing_plans
UNION ALL SELECT 'legal_policies', count(*)::text FROM public.legal_policies
UNION ALL SELECT 'delivery_methods', count(*)::text FROM public.delivery_methods
UNION ALL SELECT 'stage_gate_definitions', count(*)::text FROM public.stage_gate_definitions
UNION ALL SELECT 'functions', count(*)::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
UNION ALL SELECT 'triggers', count(*)::text
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY 1;

-- Login after apply:
--   email:    admin@iprojectx.com
--   password: ChangeMe@2026!
`);

const body = parts.join("\n");
await writeFile(outFile, body, "utf8");
console.log(
  `Wrote ${outFile} (${(body.length / 1024).toFixed(0)} KB, ${body.split("\n").length} lines, ${migrationNames.length} migrations)`,
);
