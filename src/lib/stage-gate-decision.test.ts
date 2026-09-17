import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStageGateDecisionRow,
  defaultStageGateDecisionTitle,
} from "./stage-gate-decision-fields.ts";

describe("stage-gate decision helpers", () => {
  it("titles a gate status change like the Decisions log", () => {
    assert.equal(defaultStageGateDecisionTitle("Initiate", "Approved"), "Initiate — Approved");
    assert.equal(defaultStageGateDecisionTitle("  Design  ", "in review"), "Design — In Review");
    assert.equal(defaultStageGateDecisionTitle("", null), "Stage gate — Pending");
  });

  it("builds a decisions row that links the gate and canonical outcome", () => {
    const row = buildStageGateDecisionRow({
      orgId: "org-1",
      projectId: "proj-1",
      stageGateId: "gate-1",
      streamId: "",
      program: "PMO",
      forum: "Steering",
      sponsor: "Ada",
      approverUserId: "user-1",
      approver: { id: "user-1", full_name: "Ada Lovelace", email: "ada@example.com" },
      owner: "PM",
      outcome: "approved",
      decisionDate: "2026-09-17",
      requiredDate: "",
      title: "  Initiate — Approved  ",
      options: "Go / No-go",
      recommendation: "Go",
      scheduleImpactDays: 0,
      costImpact: 0,
      rationale: "Checklist complete",
      notes: null,
    });

    assert.equal(row.org_id, "org-1");
    assert.equal(row.project_id, "proj-1");
    assert.equal(row.stage_gate_id, "gate-1");
    assert.equal(row.stream_id, null);
    assert.equal(row.outcome, "Approved");
    assert.equal(row.status, "Approved");
    assert.equal(row.title, "Initiate — Approved");
    assert.equal(row.approver_user_id, "user-1");
    assert.equal(row.approvers, "Ada Lovelace");
    assert.equal(row.forum, "Steering");
    assert.equal(row.required_date, null);
    assert.equal(row.schedule_impact_days, 0);
    assert.equal(row.cost_impact, 0);
    assert.equal(row.notes, null);
  });
});
