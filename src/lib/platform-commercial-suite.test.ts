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
    assert.equal(leak?.severity, "critical");
    assert.match(leak?.detail || "", /refused a row/);
    assert.ok(report.issues.some((i) => i.id === "data-projects" && i.severity === "critical"));
    assert.ok(report.issueCounts.critical >= 1);
  });

  it("keeps every catalogued suite selectable", async () => {
    const { ALL_PLATFORM_SUITE_KINDS, PLATFORM_SUITE_KINDS } = await import("./platform-commercial-suite.ts");
    assert.deepEqual(
      PLATFORM_SUITE_KINDS.map((s) => s.id),
      ["e2e", "functional", "system", "regression", "performance", "security"],
    );
    assert.equal(ALL_PLATFORM_SUITE_KINDS.length, 6);
  });
});
