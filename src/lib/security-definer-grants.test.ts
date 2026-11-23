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

function lastGrantBlock(sql: string, fn: string): string {
  const re = new RegExp(
    String.raw`(?:REVOKE|GRANT)[\s\S]{0,240}?FUNCTION public\.${fn}\(uuid\)[\s\S]{0,80}?;`,
    "gi",
  );
  const hits = [...sql.matchAll(re)].map((m) => m[0]);
  assert.ok(hits.length, `expected GRANT/REVOKE for ${fn}`);
  return hits[hits.length - 1];
}

describe("unguarded stream DEFINER RPCs", () => {
  const sql = migrationSql();

  it("revokes ensure_project_core_stream from PUBLIC, anon, and authenticated", () => {
    const last = lastGrantBlock(sql, "ensure_project_core_stream");
    assert.match(last, /GRANT EXECUTE ON FUNCTION public\.ensure_project_core_stream\(uuid\) TO service_role/i);
    assert.doesNotMatch(last, /TO authenticated/i);
  });

  it("revokes rollup_project_from_streams from clients", () => {
    const last = lastGrantBlock(sql, "rollup_project_from_streams");
    assert.match(last, /GRANT EXECUTE ON FUNCTION public\.rollup_project_from_streams\(uuid\) TO service_role/i);
    assert.doesNotMatch(last, /TO authenticated/i);
  });
});
