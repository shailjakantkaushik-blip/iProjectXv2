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

function lastInsertGrant(sql: string, table: string): string {
  const re = new RegExp(
    String.raw`(?:REVOKE INSERT|GRANT SELECT, INSERT|GRANT INSERT)[\s\S]{0,80}?ON public\.${table}[\s\S]{0,80}?;`,
    "gi",
  );
  const hits = [...sql.matchAll(re)].map((m) => m[0]);
  assert.ok(hits.length, `expected INSERT grant/revoke for ${table}`);
  return hits[hits.length - 1];
}

function lastInsertPolicyAction(sql: string, table: string): "create" | "drop" {
  const re = new RegExp(
    String.raw`(DROP POLICY IF EXISTS "[^"]*insert[^"]*" ON public\.${table}|CREATE POLICY "[^"]+" ON public\.${table}[\s\S]{0,200}?FOR INSERT)`,
    "gi",
  );
  const hits = [...sql.matchAll(re)];
  assert.ok(hits.length, `expected insert policy history for ${table}`);
  const last = hits[hits.length - 1][0];
  return /^DROP/i.test(last) ? "drop" : "create";
}

describe("audit trail client inserts", () => {
  const sql = migrationSql();

  it("revokes authenticated INSERT on audit_events and drops the insert policy", () => {
    const grant = lastInsertGrant(sql, "audit_events");
    assert.match(grant, /REVOKE INSERT ON public\.audit_events FROM anon, authenticated/i);
    assert.equal(lastInsertPolicyAction(sql, "audit_events"), "drop");
  });

  it("revokes authenticated INSERT on audit_log", () => {
    const grant = lastInsertGrant(sql, "audit_log");
    assert.match(grant, /REVOKE INSERT ON public\.audit_log FROM anon, authenticated/i);
    assert.equal(lastInsertPolicyAction(sql, "audit_log"), "drop");
  });
});
