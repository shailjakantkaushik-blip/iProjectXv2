import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roleGrantsOrgAdmin } from "./org-admin-scope.ts";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("org admin scope", () => {
  it("does not treat a null org_id admin row as admin of every tenant", () => {
    assert.equal(
      roleGrantsOrgAdmin([{ role: "org_admin", org_id: null }], ORG_A),
      false,
    );
    assert.equal(
      roleGrantsOrgAdmin([{ role: "admin", org_id: null }], ORG_B),
      false,
    );
  });

  it("accepts admin/org_admin only for the matching org", () => {
    assert.equal(
      roleGrantsOrgAdmin([{ role: "org_admin", org_id: ORG_A }], ORG_A),
      true,
    );
    assert.equal(
      roleGrantsOrgAdmin([{ role: "org_admin", org_id: ORG_A }], ORG_B),
      false,
    );
    assert.equal(roleGrantsOrgAdmin([{ role: "pm", org_id: ORG_A }], ORG_A), false);
  });
});
