import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAGES, pageKey, resolveCanViewPage } from "./permissions-acl.ts";

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
});
