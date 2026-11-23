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

function lastFunctionBody(sql: string, fn: string): string {
  const re = new RegExp(
    String.raw`CREATE OR REPLACE FUNCTION public\.${fn}\([\s\S]*?\$\$;`,
    "gi",
  );
  const hits = [...sql.matchAll(re)].map((m) => m[0]);
  assert.ok(hits.length, `expected CREATE OR REPLACE FUNCTION for ${fn}`);
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

describe("refresh_org_kpi_summary caller check", () => {
  const sql = migrationSql();
  const body = lastFunctionBody(sql, "refresh_org_kpi_summary");

  it("requires the signed-in caller's home org and ignores platform_admin bypass", () => {
    assert.match(body, /auth\.uid\(\) IS NOT NULL/);
    assert.match(body, /public\.get_user_org\(auth\.uid\(\)\) IS DISTINCT FROM p_org_id/);
    assert.doesNotMatch(body, /is_platform_admin/);
  });

  it("keeps EXECUTE for authenticated (user JWT) after REVOKE PUBLIC/anon", () => {
    const last = lastGrantBlock(sql, "refresh_org_kpi_summary");
    assert.match(last, /GRANT EXECUTE ON FUNCTION public\.refresh_org_kpi_summary\(uuid\) TO authenticated,\s*service_role/i);
    assert.doesNotMatch(last, /TO anon/i);
  });
});

describe("sync_org_resources_from_profiles caller check", () => {
  const sql = migrationSql();
  const body = lastFunctionBody(sql, "sync_org_resources_from_profiles");

  it("requires org-admin of the home org when _org_id is set", () => {
    assert.match(body, /public\.has_any_admin\(auth\.uid\(\)\)/);
    assert.match(body, /home IS DISTINCT FROM _org_id/);
  });

  it("does not let a signed-in admin sync every organisation", () => {
    assert.match(body, /orgs := ARRAY\[home\]/);
    assert.match(body, /auth\.uid\(\) IS NOT NULL/);
  });
});

describe("seed_default_page_permissions is not client-callable", () => {
  const sql = migrationSql();
  const body = lastFunctionBody(sql, "seed_default_page_permissions");

  it("checks home org and admin when a user JWT is present", () => {
    assert.match(body, /public\.get_user_org\(auth\.uid\(\)\) IS DISTINCT FROM _org_id/);
    assert.match(body, /public\.has_any_admin\(auth\.uid\(\)\)/);
  });

  it("revokes EXECUTE from authenticated", () => {
    const last = lastGrantBlock(sql, "seed_default_page_permissions");
    assert.match(last, /GRANT EXECUTE ON FUNCTION public\.seed_default_page_permissions\(uuid\) TO service_role/i);
    assert.doesNotMatch(last, /TO authenticated/i);
  });
});

describe("ensure_org_delivery_methods caller check", () => {
  const sql = migrationSql();
  const body = lastFunctionBody(sql, "ensure_org_delivery_methods");

  it("allows the home org or a platform admin, not a guessed foreign org", () => {
    assert.match(body, /public\.get_user_org\(auth\.uid\(\)\) IS DISTINCT FROM p_org_id/);
    assert.match(body, /public\.is_platform_admin\(auth\.uid\(\)\)/);
  });

  it("keeps EXECUTE for authenticated so the delivery-methods UI still seeds", () => {
    const last = lastGrantBlock(sql, "ensure_org_delivery_methods");
    assert.match(last, /GRANT EXECUTE ON FUNCTION public\.ensure_org_delivery_methods\(uuid\) TO authenticated,\s*service_role/i);
  });
});
