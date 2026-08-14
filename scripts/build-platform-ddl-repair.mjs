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

const deduped = [];
let prev = null;
for (const s of finalStmts) {
  const key = s.replace(/\s+/g, " ").trim();
  if (key === prev) continue;
  deduped.push(s);
  prev = key;
}

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
--
-- Does NOT recreate enums/tables from scratch and does NOT insert seed data.
-- For a brand-new empty database, prefer instead:
--   supabase/manual/iprojectx_full_platform_schema.sql
-- then:
--   supabase/manual/seed_platform_baseline.sql
--   (plus org/project seeds as needed)
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
`;

const body = header + deduped.join("\n\n") + "\n" + diag;
await writeFile(outFile, body, "utf8");
console.log(
  `Wrote ${outFile} (${deduped.length} statements, ${body.split("\n").length} lines)`,
);
