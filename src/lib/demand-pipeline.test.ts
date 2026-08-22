import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEMAND_STAGES, demandPaybackMonths, demandStageOptions, impliedDemandRoi } from "./demand-pipeline.ts";

describe("demand pipeline", () => {
  it("keeps the commercial funnel stages stable", () => {
    assert.deepEqual([...DEMAND_STAGES], [
      "Idea",
      "Screening",
      "Business Case",
      "Approved",
      "Rejected",
      "On Hold",
    ]);
  });

  it("computes payback and implied ROI from cost/benefit", () => {
    assert.equal(demandPaybackMonths({ estimated_cost: 120, estimated_benefit: 60 }), 24);
    assert.equal(impliedDemandRoi(120, 180), 150);
    assert.equal(demandPaybackMonths({ estimated_cost: 0, estimated_benefit: 10 }), null);
  });

  it("keeps unknown historic statuses without dropping the canonical list", () => {
    const opts = demandStageOptions([{ status: "Assessment" }]);
    assert.ok(opts.includes("Idea"));
    assert.ok(opts.includes("Assessment"));
  });
});
