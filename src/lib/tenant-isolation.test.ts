import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEnsureDeliveryMethods,
  canRefreshOrgKpi,
  canSeedPagePermissions,
  canSyncOrgResources,
  type IsolationCaller,
} from "./tenant-isolation.ts";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const memberA: IsolationCaller = {
  uid: "user-a",
  homeOrgId: ORG_A,
  isOrgAdmin: false,
  isPlatformAdmin: false,
};

const adminA: IsolationCaller = {
  uid: "admin-a",
  homeOrgId: ORG_A,
  isOrgAdmin: true,
  isPlatformAdmin: false,
};

const platformNoHome: IsolationCaller = {
  uid: "platform",
  homeOrgId: null,
  isOrgAdmin: false,
  isPlatformAdmin: true,
};

const serviceRole: IsolationCaller = {
  uid: null,
  homeOrgId: null,
  isOrgAdmin: false,
  isPlatformAdmin: false,
};

describe("two-org isolation for DEFINER RPCs", () => {
  it("blocks org A from refreshing org B KPIs, including platform admins with no home org", () => {
    assert.equal(canRefreshOrgKpi(adminA, ORG_A), true);
    assert.equal(canRefreshOrgKpi(adminA, ORG_B), false);
    assert.equal(canRefreshOrgKpi(memberA, ORG_B), false);
    assert.equal(canRefreshOrgKpi(platformNoHome, ORG_B), false);
    assert.equal(canRefreshOrgKpi(serviceRole, ORG_B), true);
  });

  it("blocks org A admin from syncing org B resources; NULL org id stays home-only", () => {
    assert.equal(canSyncOrgResources(adminA, ORG_A), true);
    assert.equal(canSyncOrgResources(adminA, ORG_B), false);
    assert.equal(canSyncOrgResources(adminA, null), true);
    assert.equal(canSyncOrgResources(memberA, ORG_A), false);
    assert.equal(canSyncOrgResources(platformNoHome, ORG_B), false);
    assert.equal(canSyncOrgResources(serviceRole, ORG_B), true);
  });

  it("does not let org A seed page ACL or delivery methods for org B", () => {
    assert.equal(canSeedPagePermissions(adminA, ORG_A), true);
    assert.equal(canSeedPagePermissions(adminA, ORG_B), false);
    assert.equal(canSeedPagePermissions(memberA, ORG_A), false);
    assert.equal(canEnsureDeliveryMethods(memberA, ORG_A), true);
    assert.equal(canEnsureDeliveryMethods(adminA, ORG_B), false);
    assert.equal(canEnsureDeliveryMethods(platformNoHome, ORG_B), true);
    assert.equal(canEnsureDeliveryMethods(serviceRole, ORG_B), true);
  });
});
