import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decisionOutcome,
  isDecisionAwaiting,
  memberLabel,
  normalizeDecisionOutcome,
} from "./decision-approval.ts";
import { scopeLabel } from "./governance-forums.ts";
import { PLATFORM_WATERFALL_GATES } from "./platform-seed.ts";
import {
  isActiveGateStatus,
  isApprovedGateStatus,
  isDoneGateStatus,
  matchPhase,
} from "./project-phase.ts";
import { RAID_CODE_PREFIX, raidLabel } from "./raid-code.ts";
import { gatesForRaidScope, normalizeGateStatus } from "./stage-gate-approval.ts";

describe("RAID + governance on the platform org", () => {
  it("keeps register prefixes and never paints a raw UUID", () => {
    assert.equal(RAID_CODE_PREFIX.risks, "RSK");
    assert.equal(raidLabel({ raid_code: "RSK-001", title: "Vendor slip" }), "RSK-001 · Vendor slip");
    assert.equal(memberLabel({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", full_name: null, email: null }), "Unknown user");
    assert.equal(memberLabel({ id: "x", full_name: null, email: "alex.morgan@example.com" }), "alex.morgan@example.com");
  });

  it("maps legacy decision status onto the five outcomes", () => {
    assert.equal(normalizeDecisionOutcome("under review"), "In Review");
    assert.equal(normalizeDecisionOutcome("accepted"), "Approved");
    assert.equal(decisionOutcome({ status: "Open" }), "Pending");
    assert.equal(isDecisionAwaiting({ outcome: "In Review" }), true);
    assert.equal(isDecisionAwaiting({ outcome: "Approved" }), false);
  });

  it("resolves current phase onto the seed waterfall list and treats in-review as active", () => {
    assert.equal(matchPhase("business case / full funding", [...PLATFORM_WATERFALL_GATES]), "Business Case / Full Funding");
    assert.equal(isActiveGateStatus("in review"), true);
    assert.equal(isApprovedGateStatus("Approved"), true);
    assert.equal(isDoneGateStatus("passed"), true);
    assert.equal(normalizeGateStatus("nonsense"), "Pending");
  });

  it("prefers stream gates when recording RAID against a stream", () => {
    const gates = [
      { id: "p", project_id: "PRJ-001", stream_id: null, gate_name: "Build", status: "Approved" },
      { id: "s", project_id: "PRJ-001", stream_id: "ux", gate_name: "Build", status: "In Review" },
    ];
    const scoped = gatesForRaidScope(gates, "PRJ-001", "ux", [...PLATFORM_WATERFALL_GATES]);
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0].id, "s");
  });

  it("labels Strategic Alignment forums without using the old portfolio wording", () => {
    assert.equal(scopeLabel("strategic_alignment"), "Strategic Alignment");
    assert.equal(scopeLabel("program"), "Program");
    assert.equal(scopeLabel("project"), "Project");
  });
});
