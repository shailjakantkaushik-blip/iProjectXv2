/**
 * Concatenate all supabase/migrations/*.sql into
 * supabase/manual/iprojectx_full_platform_schema.sql
 *
 * Also rebuilds the re-runnable repair pack (functions / triggers / policies)
 * via scripts/build-platform-ddl-repair.mjs.
 *
 * Usage: node scripts/build-full-platform-schema.mjs
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const outFile = path.join(root, "supabase", "manual", "iprojectx_full_platform_schema.sql");

const generatedAt = new Date().toISOString();
const names = (await readdir(migrationsDir))
  .filter((n) => n.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

const chunks = [];
chunks.push(`-- iProjectX FULL platform schema (new Supabase project)
-- Generated: ${generatedAt}
-- Source: all files in supabase/migrations/ (${names.length} migrations), in order.
--
-- HOW TO APPLY (new empty Supabase project):
-- 1. Supabase Dashboard → SQL Editor
-- 2. Paste/run this file (or: psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f iprojectx_full_platform_schema.sql)
-- 3. If a statement errors, stop and fix — do not ignore mid-file failures.
--
-- This creates schema/functions/RLS/triggers only (no row data, no auth.users).
-- After schema: import data separately, then point Vercel env at the new project.
--
-- If tables already exist but functions/triggers/policies are missing, use instead:
--   supabase/manual/check_platform_ddl.sql
--   supabase/manual/repair_platform_functions_triggers_policies.sql
--
`);

for (const name of names) {
  const body = await readFile(path.join(migrationsDir, name), "utf8");
  chunks.push(`
-- =============================================================================
-- ${name}
-- =============================================================================

${body.trim()}
`);
}

await writeFile(outFile, chunks.join("\n") + "\n", "utf8");
console.log(`Wrote ${outFile} (${names.length} migrations)`);

const repair = spawnSync(process.execPath, [path.join(root, "scripts", "build-platform-ddl-repair.mjs")], {
  cwd: root,
  stdio: "inherit",
});
if (repair.status !== 0) {
  process.exit(repair.status ?? 1);
}
