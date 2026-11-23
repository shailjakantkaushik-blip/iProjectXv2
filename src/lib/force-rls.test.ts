import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");

function migrationSql(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n\n");
}

function enabledTables(sql: string): string[] {
  return [
    ...new Set(
      [...sql.matchAll(/ALTER TABLE public\.(\w+)\s+ENABLE ROW LEVEL SECURITY/gi)].map((m) => m[1]),
    ),
  ].sort();
}

function lastForce(sql: string, table: string): "force" | "no-force" | null {
  const re = new RegExp(
    String.raw`ALTER TABLE public\.${table}\s+(NO FORCE|FORCE) ROW LEVEL SECURITY`,
    "gi",
  );
  const hits = [...sql.matchAll(re)].map((m) => m[1].toUpperCase());
  if (!hits.length) return null;
  return hits[hits.length - 1] === "FORCE" ? "force" : "no-force";
}

describe("FORCE ROW LEVEL SECURITY", () => {
  const sql = migrationSql();

  it("forces RLS on every public table that enabled it", () => {
    const tables = enabledTables(sql);
    assert.ok(tables.length >= 70, `expected tenant tables, got ${tables.length}`);
    const missing = tables.filter((t) => lastForce(sql, t) !== "force");
    assert.deepEqual(missing, []);
  });
});
