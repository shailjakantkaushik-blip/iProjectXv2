import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALERT_EMAIL_CHANNELS,
  normalizeAlertOutbound,
  resolveEffectiveAlertEmails,
} from "./alert-outbound-config.ts";

describe("outbound alert email", () => {
  it("keeps the four commercial channels stable", () => {
    assert.deepEqual([...ALERT_EMAIL_CHANNELS], [
      "approvals",
      "overdue_raid",
      "pulse",
      "raid_escalation",
    ]);
  });

  it("stays silent until the platform master switch is on", () => {
    const off = resolveEffectiveAlertEmails({
      orgConfig: normalizeAlertOutbound({ active: false }),
      roleKeys: ["org_admin"],
    });
    assert.equal(off.orgActive, false);
    assert.equal(off.approvals, false);
    assert.equal(off.raid_escalation, false);
  });

  it("lets a locked org-admin receive RAID escalation when the org is live", () => {
    const on = resolveEffectiveAlertEmails({
      orgConfig: normalizeAlertOutbound({ active: true }),
      roleKeys: ["org_admin"],
      userPrefs: { admin_locked: true, email_digest: false, raid_escalation: false },
    });
    assert.equal(on.orgActive, true);
    assert.equal(on.userCanEdit, false);
    assert.equal(on.raid_escalation, true);
    assert.equal(on.overdue_raid, true);
  });
});
