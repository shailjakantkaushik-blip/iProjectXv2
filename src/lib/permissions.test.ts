import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PAGES, capabilityKey, pageKey, resolveCanViewPage } from "./permissions-acl.ts";

describe("page ACL", () => {
  it("admins and org admins see every non-admin-only page", () => {
    assert.equal(resolveCanViewPage("/app/projects", ["org_admin"], []), true);
    assert.equal(resolveCanViewPage("/app/executive-cockpit", ["admin"], []), true);
  });

  it("fails closed when a role has no row for the page", () => {
    assert.equal(resolveCanViewPage("/app/projects", ["viewer"], []), false);
  });

  it("honours an explicit can_view row", () => {
    assert.equal(
      resolveCanViewPage("/app/projects", ["viewer"], [
        { role: "viewer", table_name: pageKey("/app/projects"), can_view: true },
      ]),
      true,
    );
    assert.equal(
      resolveCanViewPage("/app/projects", ["viewer"], [
        { role: "viewer", table_name: pageKey("/app/projects"), can_view: false },
      ]),
      false,
    );
  });

  it("keeps admin-only pages off org members who are not admin", () => {
    assert.equal(resolveCanViewPage("/app/audit-log", ["project_manager"], []), false);
    assert.equal(resolveCanViewPage("/app/audit-log", ["org_admin"], []), true);
  });

  it("lets platform admins open the role permissions page", () => {
    assert.equal(resolveCanViewPage("/app/permissions", ["platform_admin"], []), true);
    assert.equal(resolveCanViewPage("/app/audit-log", ["platform_admin"], []), false);
  });

  it("registers a commercial command-center and project-arena surface", () => {
    const paths = new Set(PAGES.map((p) => p.path));
    for (const required of [
      "/app/executive-cockpit",
      "/app/projects",
      "/app/fy-allocation",
      "/app/financials",
      "/app/risks",
      "/app/demand-pipeline",
    ]) {
      assert.ok(paths.has(required), `missing page ${required}`);
    }
  });

  it("stores capabilities as capability::<id> in the permissions matrix", () => {
    assert.equal(capabilityKey("timesheet_cost_view"), "capability::timesheet_cost_view");
    assert.equal(capabilityKey("data_editor"), "capability::data_editor");
  });

  it("imports capabilityKey into permissions.ts so Timesheets and Resources can resolve cost view", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(dir, "permissions.ts"), "utf8");
    // `export { capabilityKey } from` does not bind the name. useCapabilityPermission
    // calls capabilityKey() and throws ReferenceError if it is only re-exported.
    assert.match(
      src,
      /\bimport\s*\{[\s\S]*\bcapabilityKey\b[\s\S]*\}\s*from\s*["']@\/lib\/permissions-acl["']/,
    );
  });

  it("registers the leftover signed-in commercial surfaces", () => {
    const paths = new Set(PAGES.map((p) => p.path));
    for (const required of [
      "/app/investment-committee",
      "/app/timesheets",
      "/app/project-forecast",
      "/app/benefits",
      "/app/issues",
      "/app/actions",
      "/app/decisions",
      "/app/governance-channels",
      "/app/resources",
      "/app/alert-emails",
    ]) {
      assert.ok(paths.has(required), `missing page ${required}`);
    }
  });
});
