import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fyAllocBudget,
  projectApprovedFunding,
  projectBenefitCostRatio,
  projectForecast,
  projectIncurred,
  projectRemaining,
  projectTargetRoi,
  sumBenefitsRealised,
  sumBenefitsTarget,
} from "./project-finance.ts";

describe("project finance envelopes", () => {
  it("uses explicit approved funding before budget and CapEx+OpEx", () => {
    assert.equal(projectApprovedFunding({ approved_funding: 100, budget: 80, capex_approved: 40, opex_approved: 20 }), 100);
    assert.equal(projectApprovedFunding({ budget: 80, capex_approved: 40, opex_approved: 20 }), 80);
    assert.equal(projectApprovedFunding({ capex_approved: 40, opex_approved: 20 }), 60);
    assert.equal(projectApprovedFunding(null), 0);
  });

  it("does not invent a forecast uplift", () => {
    assert.equal(projectForecast({ forecast_at_completion: 120, capex_approved: 40, opex_approved: 20 }), 120);
    assert.equal(projectForecast({ capex_approved: 40, opex_approved: 20 }), 60);
    assert.equal(projectForecast({ budget: 90 }), 90);
  });

  it("keeps remaining and incurred on the same envelope", () => {
    const p = { budget: 100, capex_incurred: 30, opex_incurred: 10 };
    assert.equal(projectIncurred(p), 40);
    assert.equal(projectRemaining(p), 60);
  });

  it("prefers benefit register lines over project rollups", () => {
    const p = { id: "p1", benefits_target: 10, benefits_realised: 2 };
    const lines = [
      { project_id: "p1", target_value: 40, realised_value: 15 },
      { project_id: "p2", target_value: 99, realised_value: 99 },
    ];
    assert.equal(sumBenefitsTarget(lines, p, "p1"), 40);
    assert.equal(sumBenefitsRealised(lines, p, "p1"), 15);
    assert.equal(sumBenefitsTarget([], p), 10);
  });

  it("computes target ROI and benefit/cost from the same numbers", () => {
    const p = { budget: 100, benefits_target: 130, capex_incurred: 40, opex_incurred: 10, benefits_realised: 75 };
    assert.equal(projectTargetRoi(p), 30);
    assert.equal(projectBenefitCostRatio(p), 1.5);
  });

  it("reads FY allocation budget from budget, then legacy, then mix", () => {
    assert.equal(fyAllocBudget({ budget: 25 }), 25);
    assert.equal(fyAllocBudget({ allocated_amount: 18 }), 18);
    assert.equal(fyAllocBudget({ capex: 10, opex: 4 }), 14);
  });
});
