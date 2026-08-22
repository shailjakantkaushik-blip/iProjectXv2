import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  capAllocationToOverall,
  fyEnvelopeOverAllocation,
  fyScopedBudget,
  fyYearWatches,
  monthlyLayerSplit,
} from "./fy-allocation-scope.ts";

describe("FY allocation is a year slice of the project envelope", () => {
  it("never presents a year as larger than the lifetime envelope", () => {
    assert.equal(capAllocationToOverall(140, 100), 100);
    assert.equal(capAllocationToOverall(-5, 100), 0);
    assert.equal(capAllocationToOverall(40, 0), 40);
  });

  it("flags stored FY rows that sum above the lifetime envelope", () => {
    const over = fyEnvelopeOverAllocation({
      allocations: [{ budget: 70 }, { budget: 50 }],
      overallBudget: 100,
    });
    assert.ok(over);
    assert.equal(over.overBy, 20);
    assert.equal(
      fyEnvelopeOverAllocation({ allocations: [{ budget: 40 }], overallBudget: 100 }),
      null,
    );
  });

  it("scopes the shown budget to selected years and still caps to overall", () => {
    assert.equal(
      fyScopedBudget({
        allocations: [
          { fy: "FY26", budget: 40 },
          { fy: "FY27", budget: 80 },
        ],
        overallBudget: 100,
        fySelected: ["FY27"],
      }),
      80,
    );
    assert.equal(
      fyScopedBudget({
        allocations: [{ fy: "FY27", budget: 140 }],
        overallBudget: 100,
        fySelected: ["FY27"],
      }),
      100,
    );
  });

  it("watches plan/actual/forecast against that year's allocation", () => {
    const watches = fyYearWatches({
      allocations: [{ fy: "FY27", budget: 100, capex: 60, opex: 40 }],
      fyStartMonth: 7,
      overallBudget: 200,
      monthly: [
        {
          period_month: "2026-08-01",
          capex_planned: 80,
          opex_planned: 40,
          capex_actual: 20,
          opex_actual: 10,
          capex_forecast: 70,
          opex_forecast: 20,
        },
      ],
    });
    assert.equal(watches.length, 1);
    assert.equal(watches[0].fy, "FY27");
    assert.equal(watches[0].allocation, 100);
    assert.equal(watches[0].plan, 120);
    assert.ok(watches[0].overBy > 0);
    assert.equal(watches[0].peakSource, "plan");
  });

  it("splits monthly layers into CapEx + OpEx", () => {
    const split = monthlyLayerSplit(
      [{ capex_planned: 10, opex_planned: 5, capex_actual: 0, opex_actual: 0, capex_forecast: 0, opex_forecast: 0 }],
      "planned",
    );
    assert.deepEqual(split, { capex: 10, opex: 5, total: 15 });
  });
});
