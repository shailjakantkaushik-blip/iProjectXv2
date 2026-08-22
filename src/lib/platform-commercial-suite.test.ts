import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runPlatformCommercialSuite } from "./platform-commercial-suite.ts";

describe("platform commercial suite isolation", () => {
  it("fails a platform data check when a foreign org_id appears", async () => {
    const seen: string[] = [];
    const report = await runPlatformCommercialSuite({
      origin: "https://www.iprojectx.com.au",
      resolvePlatformOrg: async () => ({ id: "plat", name: "iProjectX", slug: "iprojectx" }),
      selectPlatform: async (table, _cols, orgId) => {
        seen.push(`${table}:${orgId}`);
        if (table === "projects") {
          return [{ org_id: "customer-org", project_code: "PRJ-999", budget: 1 }];
        }
        return [];
      },
      restAnon: async (table) => (table === "landing_config" ? { status: 200, body: [{}] } : { status: 200, body: [] }),
      fetchText: async () => ({
        status: 200,
        body: 'src="/api/public/landing-logo" landing-nav-open',
      }),
    });
    assert.ok(seen.every((s) => s.endsWith(":plat")), `queried outside platform: ${seen.join(",")}`);
    const leak = report.checks.find((c) => c.id === "data-projects");
    assert.equal(leak?.status, "fail");
    assert.match(leak?.detail || "", /refused a row/);
  });
});
