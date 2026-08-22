import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { percentile, runPlatformCommercialSuite } from "./platform-commercial-suite.ts";

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

  it("selects columns that exist on timesheet entries and demand", async () => {
    const { PLATFORM_TABLES } = await import("./platform-commercial-suite.ts");
    const cols = Object.fromEntries(PLATFORM_TABLES);
    assert.match(cols.timesheet_entries, /timesheet_id/);
    assert.match(cols.timesheet_entries, /hours_mon/);
    assert.doesNotMatch(cols.timesheet_entries, /\bstatus\b/);
    assert.match(cols.timesheets, /\bstatus\b/);
    assert.match(cols.demand_pipeline, /idea_name/);
    assert.doesNotMatch(cols.demand_pipeline, /\btitle\b/);
  });

  it("keeps every catalogued suite selectable", async () => {
    const { ALL_PLATFORM_SUITE_KINDS, PLATFORM_SUITE_KINDS } = await import("./platform-commercial-suite.ts");
    assert.deepEqual(
      PLATFORM_SUITE_KINDS.map((s) => s.id),
      ["e2e", "functional", "system", "regression", "performance", "load", "security"],
    );
    assert.equal(ALL_PLATFORM_SUITE_KINDS.length, 7);
  });

  it("computes nearest-rank percentiles", () => {
    assert.equal(percentile([10, 20, 30, 40, 50], 50), 30);
    assert.equal(percentile([10, 20, 30, 40, 50], 95), 50);
    assert.equal(percentile([100], 95), 100);
    assert.equal(percentile([], 95), 0);
  });

  it("load suite stays on iProjectX and reports p50/p95", async () => {
    const seen: string[] = [];
    let fetches = 0;
    const report = await runPlatformCommercialSuite({
      origin: "https://www.iprojectx.com.au",
      suites: ["load"],
      resolvePlatformOrg: async () => ({ id: "plat", name: "iProjectX", slug: "iprojectx" }),
      selectPlatform: async (table, _cols, orgId) => {
        seen.push(`${table}:${orgId}`);
        return [{ org_id: orgId, project_code: "PRJ-001" }];
      },
      restAnon: async () => ({ status: 200, body: [] }),
      fetchText: async () => {
        fetches += 1;
        return { status: 200, body: "ok" };
      },
    });
    assert.equal(fetches, 32);
    assert.deepEqual(seen, ["projects:plat", "projects:plat", "projects:plat", "projects:plat"]);
    const home = report.checks.find((c) => c.id === "load-home");
    assert.equal(home?.status, "pass");
    assert.match(home?.detail || "", /p50 \d+ms · p95 \d+ms/);
    const db = report.checks.find((c) => c.id === "load-platform-projects");
    assert.equal(db?.status, "pass");
    assert.equal(report.failed, 0);
  });

  it("load suite refuses a foreign org_id on parallel project reads", async () => {
    const report = await runPlatformCommercialSuite({
      origin: "https://www.iprojectx.com.au",
      suites: ["load"],
      resolvePlatformOrg: async () => ({ id: "plat", name: "iProjectX", slug: "iprojectx" }),
      selectPlatform: async () => [{ org_id: "customer-org", project_code: "PRJ-999" }],
      restAnon: async () => ({ status: 200, body: [] }),
      fetchText: async () => ({ status: 200, body: "ok" }),
    });
    const db = report.checks.find((c) => c.id === "load-platform-projects");
    assert.equal(db?.status, "fail");
    assert.match(db?.detail || "", /refused a row/);
  });
});
