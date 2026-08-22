import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStageGateFlows, isInFlightProject } from "./stage-gate-flow.ts";

describe("stage-gate flow by method", () => {
  it("ignores completed and cancelled projects", () => {
    assert.equal(isInFlightProject("In Progress"), true);
    assert.equal(isInFlightProject("Completed"), false);
    assert.equal(isInFlightProject("Cancelled"), false);
  });

  it("does not mix Waterfall and Agile gates on one axis", () => {
    const flows = buildStageGateFlows(
      [
        {
          id: "wf",
          org_id: "org",
          name: "Waterfall",
          code: "waterfall",
          uses_sprints: false,
          uses_stage_gates: true,
          is_system: true,
          is_active: true,
          sort_order: 1,
        },
        {
          id: "ag",
          org_id: "org",
          name: "Agile",
          code: "agile",
          uses_sprints: true,
          uses_stage_gates: true,
          is_system: true,
          is_active: true,
          sort_order: 2,
        },
      ],
      [
        { delivery_method_id: "wf", gate_name: "Initiate", sort_order: 1 },
        { delivery_method_id: "wf", gate_name: "Deliver", sort_order: 2 },
        { delivery_method_id: "ag", gate_name: "Sprint 0", sort_order: 1 },
        { delivery_method_id: "ag", gate_name: "Release", sort_order: 2 },
      ],
      [
        { status: "Active", delivery_method_id: "wf", current_phase: "Deliver" },
        { status: "Active", delivery_method_id: "ag", current_phase: "Release" },
        { status: "Completed", delivery_method_id: "wf", current_phase: "Deliver" },
      ],
    );
    assert.equal(flows.length, 2);
    const wf = flows.find((f) => f.methodId === "wf");
    const ag = flows.find((f) => f.methodId === "ag");
    assert.ok(wf && ag);
    assert.deepEqual(wf.stages, ["Initiate", "Deliver"]);
    assert.deepEqual(ag.stages, ["Sprint 0", "Release"]);
    assert.equal(wf.rows.find((r) => r.stage === "Deliver")?.count, 1);
    assert.equal(ag.rows.find((r) => r.stage === "Release")?.count, 1);
    assert.equal(wf.activeCount, 1);
  });
});
