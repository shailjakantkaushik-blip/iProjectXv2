import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertPlatformOrgId, isPlatformOrgRow, isPlatformOrgSlug } from "./platform-org.ts";

describe("platform org isolation", () => {
  it("only treats slug/name iprojectx as the platform tenant", () => {
    assert.equal(isPlatformOrgSlug("iprojectx"), true);
    assert.equal(isPlatformOrgSlug("iProjectX"), true);
    assert.equal(isPlatformOrgSlug("isafex"), false);
    assert.equal(isPlatformOrgRow({ slug: "acme", name: "Acme Bank" }), false);
    assert.equal(isPlatformOrgRow({ slug: "iprojectx", name: "iProjectX" }), true);
  });

  it("throws when a row belongs to another organisation", () => {
    assert.throws(() => assertPlatformOrgId("cust", "plat", "projects"), /refused a row/);
    assert.doesNotThrow(() => assertPlatformOrgId("plat", "plat", "projects"));
  });
});
