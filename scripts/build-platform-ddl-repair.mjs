/**
 * Build supabase/manual/repair_platform_functions_triggers_policies.sql
 * from supabase/manual/iprojectx_full_platform_schema.sql
 *
 * Keeps CREATE OR REPLACE FUNCTION, triggers, policies, grants, indexes,
 * ADD COLUMN, and related ALTER/COMMENT — skips CREATE TABLE/TYPE/seed DML.
 *
 * Usage: node scripts/build-platform-ddl-repair.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcFile = path.join(root, "supabase", "manual", "iprojectx_full_platform_schema.sql");
const outFile = path.join(
  root,
  "supabase",
  "manual",
  "repair_platform_functions_triggers_policies.sql",
);

function splitSql(sql) {
  const stmts = [];
  let buf = "";
  let i = 0;
  let inSingle = false;
  let dollarTag = null;
  let lineComment = false;
  let blockComment = false;

  while (i < sql.length) {
    const ch = sql[i];
    const nxt = sql[i + 1] ?? "";

    if (lineComment) {
      buf += ch;
      if (ch === "\n") lineComment = false;
      i++;
      continue;
    }
    if (blockComment) {
      buf += ch;
      if (ch === "*" && nxt === "/") {
        buf += nxt;
        i += 2;
        blockComment = false;
        continue;
      }
      i++;
      continue;
    }
    if (dollarTag != null) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }
    if (inSingle) {
      buf += ch;
      if (ch === "'") {
        if (nxt === "'") {
          buf += nxt;
          i += 2;
          continue;
        }
        inSingle = false;
      }
      i++;
      continue;
    }

    if (ch === "-" && nxt === "-") {
      buf += ch + nxt;
      i += 2;
      lineComment = true;
      continue;
    }
    if (ch === "/" && nxt === "*") {
      buf += ch + nxt;
      i += 2;
      blockComment = true;
      continue;
    }
    if (ch === "'") {
      buf += ch;
      inSingle = true;
      i++;
      continue;
    }
    if (ch === "$") {
      const m = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (m) {
        dollarTag = m[0];
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (ch === ";") {
      buf += ch;
      stmts.push(buf);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf.trim()) stmts.push(buf);
  return stmts;
}

function coreOf(stmt) {
  return stmt
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return t && !t.startsWith("--");
    })
    .join("\n")
    .trim();
}

function ensureSemi(s) {
  const t = s.trimEnd();
  return t.endsWith(";") ? t : `${t};`;
}

const src = await readFile(srcFile, "utf8");
const stmts = splitSql(src);
const keep = [];

for (const s of stmts) {
  const core = coreOf(s);
  if (!core) continue;
  const u = core.toUpperCase();

  if (u.startsWith("CREATE OR REPLACE FUNCTION") || u.startsWith("CREATE OR REPLACE PROCEDURE")) {
    keep.push(ensureSemi(s));
    continue;
  }
  if (u.startsWith("DROP TRIGGER") || u.startsWith("CREATE TRIGGER")) {
    keep.push(ensureSemi(s));
    continue;
  }
  if (u.startsWith("DROP POLICY") || u.startsWith("CREATE POLICY")) {
    keep.push(ensureSemi(s));
    continue;
  }
  if (u.startsWith("ALTER TABLE") && u.includes("ENABLE ROW LEVEL SECURITY")) {
    keep.push(ensureSemi(s));
    continue;
  }
  if (u.startsWith("ALTER TABLE") && u.includes("FORCE ROW LEVEL SECURITY")) {
    keep.push(ensureSemi(s));
    continue;
  }
  if (u.startsWith("GRANT ") || u.startsWith("REVOKE ")) {
    keep.push(ensureSemi(s));
    continue;
  }
  if (u.startsWith("CREATE INDEX IF NOT EXISTS") || u.startsWith("CREATE UNIQUE INDEX IF NOT EXISTS")) {
    keep.push(ensureSemi(s));
    continue;
  }
  if (u.startsWith("CREATE INDEX ") || u.startsWith("CREATE UNIQUE INDEX ")) {
    const fixed = core.replace(
      /^CREATE\s+(UNIQUE\s+)?INDEX\s+/i,
      (_m, uniq) => `CREATE ${uniq || ""}INDEX IF NOT EXISTS `,
    );
    keep.push(ensureSemi(fixed));
    continue;
  }
  if (u.startsWith("COMMENT ON") || u.startsWith("ALTER FUNCTION") || u.startsWith("ALTER ROUTINE")) {
    keep.push(ensureSemi(s));
    continue;
  }
  if (u.startsWith("DROP FUNCTION")) {
    keep.push(ensureSemi(s));
    continue;
  }
  if (u.startsWith("ALTER TYPE") && u.includes("ADD VALUE")) {
    keep.push(ensureSemi(s));
    continue;
  }
  if (u.startsWith("ALTER TABLE") && u.includes("ADD COLUMN")) {
    keep.push(ensureSemi(s));
    continue;
  }
  if (u.startsWith("DO ") && (u.includes("CREATE ") || u.includes("ALTER ") || u.includes("DROP ") || u.includes("GRANT "))) {
    keep.push(ensureSemi(s));
    continue;
  }
  if (u.startsWith("ALTER TABLE")) {
    keep.push(ensureSemi(s));
    continue;
  }
  // skip CREATE TABLE / TYPE / INSERT seed / etc.
}

const finalStmts = [];
for (const s of keep) {
  const core = coreOf(s);
  const u = core.toUpperCase();

  const trig = core.match(/^\s*CREATE\s+TRIGGER\s+(\S+)\s+[\s\S]*?\sON\s+([^\s(;]+)/i);
  if (trig) {
    finalStmts.push(`DROP TRIGGER IF EXISTS ${trig[1]} ON ${trig[2]};`);
  }
  const pol = core.match(/^\s*CREATE\s+POLICY\s+("(?:[^"]|"")+"|[^\s]+)\s+ON\s+([^\s(;]+)/i);
  if (pol) {
    finalStmts.push(`DROP POLICY IF EXISTS ${pol[1]} ON ${pol[2]};`);
  }
  finalStmts.push(ensureSemi(s));
}

/** Keep only the last CREATE OR REPLACE FUNCTION/PROCEDURE per signature.
 *  Replaying historical migration order otherwise reinstalls early bodies that
 *  compare text role columns to app_role (operator does not exist: text = app_role).
 */
function functionSignatureKey(stmt) {
  const core = coreOf(stmt);
  const m = core.match(
    /^\s*CREATE\s+OR\s+REPLACE\s+(?:FUNCTION|PROCEDURE)\s+([^\s(]+)\s*\(([^)]*)\)/i,
  );
  if (!m) return null;
  const name = m[1].replace(/\s+/g, "").toLowerCase();
  const args = m[2]
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      let part = a.split("=")[0].trim();
      part = part.replace(/^(IN|OUT|INOUT|VARIADIC)\s+/i, "");
      // Drop parameter name when present: "_user_id uuid" → "uuid"
      const tokens = part.split(/\s+/);
      if (tokens.length >= 2 && /^[_a-z][a-z0-9_]*$/i.test(tokens[0]) && !tokens[0].includes(".")) {
        return tokens.slice(1).join(" ").toLowerCase();
      }
      return part.toLowerCase();
    })
    .join(",");
  return `${name}(${args})`;
}

const lastFnIndex = new Map();
for (let i = 0; i < finalStmts.length; i++) {
  const key = functionSignatureKey(finalStmts[i]);
  if (key) lastFnIndex.set(key, i);
}

const afterFnDedupe = [];
for (let i = 0; i < finalStmts.length; i++) {
  const key = functionSignatureKey(finalStmts[i]);
  if (key && lastFnIndex.get(key) !== i) continue;
  afterFnDedupe.push(finalStmts[i]);
}

const deduped = [];
let prev = null;
for (const s of afterFnDedupe) {
  const key = s.replace(/\s+/g, " ").trim();
  if (key === prev) continue;
  deduped.push(s);
  prev = key;
}

const roleBootstrap = `-- =============================================================================
-- Bootstrap: user_roles.role / role_table_permissions.role must be text
-- before installing has_role / RLS helpers (avoids text = app_role errors).
-- =============================================================================
DROP POLICY IF EXISTS "cert_org_admin_select" ON public.org_license_certificates;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_roles'
      AND column_name = 'role' AND udt_name = 'app_role'
  ) THEN
    ALTER TABLE public.user_roles
      ALTER COLUMN role TYPE text USING role::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'role_table_permissions'
      AND column_name = 'role' AND udt_name = 'app_role'
  ) THEN
    ALTER TABLE public.role_table_permissions
      ALTER COLUMN role TYPE text USING role::text;
  END IF;
END $$;
`;

const roleFixPath = path.join(root, "supabase", "manual", "fix_text_app_role_ops.sql");
const roleFix = await readFile(roleFixPath, "utf8");

const header = `-- =============================================================================
-- iProjectX — Repair pack: functions, triggers, RLS policies, grants, indexes
-- =============================================================================
-- Generated by: node scripts/build-platform-ddl-repair.mjs
-- Source: supabase/manual/iprojectx_full_platform_schema.sql
--
-- Use when tables already exist (from a partial schema apply) but the previous
-- version's functions / triggers / policies are missing.
--
-- Safe to re-run: uses CREATE OR REPLACE FUNCTION, DROP POLICY/TRIGGER IF EXISTS,
-- CREATE INDEX IF NOT EXISTS, and ADD COLUMN IF NOT EXISTS where possible.
-- Function bodies are de-duplicated to the *latest* migration version so early
-- has_role(text = app_role) definitions are not replayed.
--
-- Does NOT recreate enums/tables from scratch and does NOT insert seed data.
-- For a brand-new empty database, prefer instead:
--   supabase/manual/iprojectx_full_platform_schema.sql
-- then:
--   supabase/manual/seed_platform_baseline.sql
--   (plus org/project seeds as needed)
--
-- If you only hit "operator does not exist: text = app_role", you can run just:
--   supabase/manual/fix_text_app_role_ops.sql
--
-- HOW TO APPLY:
-- 1. Run supabase/manual/check_platform_ddl.sql (optional inventory)
-- 2. Supabase Dashboard → SQL Editor (postgres / service_role)
-- 3. Paste/run this file
-- 4. Re-run check_platform_ddl.sql to confirm functions/triggers/policies
-- =============================================================================

`;

const diag = `
-- =============================================================================
-- Post-repair inventory
-- =============================================================================
SELECT 'functions' AS kind, count(*)::text AS n
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
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
ORDER BY 1;

-- Smoke: must not raise "operator does not exist: text = app_role"
SELECT public.has_role('00000000-0000-0000-0000-000000000000'::uuid, 'platform_admin'::text) AS has_role_text_ok;
`;

const body =
  header +
  roleBootstrap +
  "\n" +
  deduped.join("\n\n") +
  "\n\n-- =============================================================================\n" +
  "-- Final text/app_role compatibility (idempotent)\n" +
  "-- =============================================================================\n" +
  roleFix.trim() +
  "\n" +
  diag;

await writeFile(outFile, body, "utf8");

const hasRoleCount = (body.match(/CREATE OR REPLACE FUNCTION public\.has_role/gi) || []).length;
const brokenCompare = (body.match(/role = _role\)/g) || []).length;
console.log(
  `Wrote ${outFile} (${deduped.length} statements, ${body.split("\n").length} lines)`,
);
console.log(`has_role definitions: ${hasRoleCount}; raw "role = _role)" hits: ${brokenCompare}`);

