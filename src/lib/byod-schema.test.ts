import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BYOD_SCHEMA_EXCLUDE, buildByodSchemaPack } from "./byod-schema.server.ts";

function lastGrantBlock(sql: string, fn: string): string {
  const re = new RegExp(
    String.raw`(?:REVOKE|GRANT)[\s\S]{0,240}?FUNCTION public\.${fn}\(uuid\)[\s\S]{0,80}?;`,
    "gi",
  );
  const hits = [...sql.matchAll(re)].map((m) => m[0]);
  assert.ok(hits.length, `expected GRANT/REVOKE for ${fn}`);
  return hits[hits.length - 1];
}

describe("BYOD tenant schema pack", () => {
  it("includes the 20261123 tenant hardening migrations and skips control-plane secrets", async () => {
    const pack = await buildByodSchemaPack();
    assert.ok(pack.included.includes("20261123120000_revoke_ensure_project_core_stream.sql"));
    assert.ok(pack.included.includes("20261123120100_gate_refresh_org_kpi_summary.sql"));
    assert.ok(pack.included.includes("20261123120500_force_row_level_security.sql"));
    assert.ok(pack.included.includes("20261123140000_resource_holidays_and_leaves.sql"));
    assert.ok(pack.included.includes("20261123140100_notify_resource_over_allocation.sql"));
    assert.ok(pack.included.includes("20261123140200_resource_leave_self_apply.sql"));
    assert.ok(pack.excluded.includes("20260729120000_org_byod_connections.sql"));
    assert.deepEqual([...pack.excluded].sort(), [...BYOD_SCHEMA_EXCLUDE].sort());
  });

  it("ends with service_role-only EXECUTE on unguarded stream RPCs", async () => {
    const pack = await buildByodSchemaPack();
    const stream = lastGrantBlock(pack.sql, "ensure_project_core_stream");
    assert.match(stream, /TO service_role/i);
    assert.doesNotMatch(stream, /TO authenticated/i);
    assert.match(pack.sql, /FORCE ROW LEVEL SECURITY/);
    assert.match(
      lastGrantBlock(pack.sql, "refresh_org_kpi_summary"),
      /TO authenticated,\s*service_role/i,
    );
  });

  it("keeps the build script exclude list in sync", () => {
    const mjs = readFileSync(join(process.cwd(), "scripts/build-byod-schema.mjs"), "utf8");
    for (const name of BYOD_SCHEMA_EXCLUDE) {
      assert.match(mjs, new RegExp(name.replace(/\./g, "\\.")));
    }
  });
});
