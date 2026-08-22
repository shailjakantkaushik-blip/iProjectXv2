import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canDeleteOrgRole,
  canManageOrgRoles,
  clampRoleSortOrder,
  isReservedRoleKey,
  normalizeRoleKey,
  normalizeRoleLabel,
  validateRoleKey,
} from "./org-role-admin.ts";

describe("org role catalog rules", () => {
  it("lets org admin, admin, and platform admin manage roles", () => {
    assert.equal(canManageOrgRoles(["pm"]), false);
    assert.equal(canManageOrgRoles(["executive", "bu_lead"]), false);
    assert.equal(canManageOrgRoles(["org_admin"]), true);
    assert.equal(canManageOrgRoles(["admin"]), true);
    assert.equal(canManageOrgRoles(["platform_admin"]), true);
    assert.equal(canManageOrgRoles(["pm", "platform_admin"]), true);
  });

  it("normalizes and validates role keys", () => {
    assert.equal(normalizeRoleKey(" Resource Manager "), "resource_manager");
    assert.equal(normalizeRoleKey("PMO-Lead!!"), "pmo_lead");
    assert.deepEqual(validateRoleKey("resource_manager"), {
      ok: true,
      key: "resource_manager",
    });
    assert.equal(validateRoleKey("1lead").ok, false);
    assert.equal(validateRoleKey("").ok, false);
    assert.equal(validateRoleKey("___").ok, false);
    const stripped = validateRoleKey("_hidden");
    assert.deepEqual(stripped, { ok: true, key: "hidden" });
  });

  it("blocks the reserved platform_admin key", () => {
    assert.equal(isReservedRoleKey("platform_admin"), true);
    const blocked = validateRoleKey("platform_admin");
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.match(blocked.error, /Reserved/);
  });

  it("blocks deleting system roles and allows custom roles", () => {
    assert.equal(canDeleteOrgRole({ is_system: true, role_key: "pm" }), false);
    assert.equal(canDeleteOrgRole({ is_system: false, role_key: "admin" }), false);
    assert.equal(canDeleteOrgRole({ is_system: false, role_key: "platform_admin" }), false);
    assert.equal(canDeleteOrgRole({ is_system: false, role_key: "resource_manager" }), true);
  });

  it("clamps sort order and falls back for labels", () => {
    assert.equal(clampRoleSortOrder(-4), 0);
    assert.equal(clampRoleSortOrder(12_000), 9999);
    assert.equal(clampRoleSortOrder("not-a-number"), 200);
    assert.equal(normalizeRoleLabel("  Finance lead  ", "finance_lead"), "Finance lead");
    assert.equal(normalizeRoleLabel("   ", "finance_lead"), "finance_lead");
  });
});
