import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeProjectEvm,
  evmHealth,
  projectBac,
  workItemPctComplete,
} from "./evm.ts";

describe("EVM", () => {
  it("prefers baseline_budget for BAC", () => {
    assert.equal(projectBac({ id: "p", baseline_budget: 200, budget: 100, capex_approved: 40, opex_approved: 20 }), 200);
    assert.equal(projectBac({ id: "p", baseline_capex: 30, baseline_opex: 20, budget: 10 }), 50);
  });

  it("weights % complete by estimate hours and treats Done as 100%", () => {
    assert.equal(
      workItemPctComplete([
        { project_id: "p", estimate_hours: 80, percent_complete: 50, status: "active" },
        { project_id: "p", estimate_hours: 20, percent_complete: 0, status: "done" },
      ]),
      0.6,
    );
    assert.equal(workItemPctComplete([{ project_id: "p", status: "cancelled", percent_complete: 90 }]), 0);
  });

  it("computes CPI/SPI from EV, AC, and PV", () => {
    const evm = computeProjectEvm({
      asOf: "2026-07-01",
      project: {
        id: "p1",
        baseline_budget: 100,
        capex_incurred: 30,
        opex_incurred: 10,
        planned_start_date: "2026-01-01",
        planned_end_date: "2026-12-31",
      },
      workItems: [{ project_id: "p1", estimate_hours: 100, percent_complete: 50, status: "active" }],
    });
    assert.equal(evm.bac, 100);
    assert.equal(evm.ac, 40);
    assert.equal(evm.ev, 50);
    assert.ok(evm.cpi != null && evm.cpi > 1);
    assert.equal(evmHealth(1, 1), "Green");
    assert.equal(evmHealth(0.9, 0.9), "Amber");
    assert.equal(evmHealth(0.7, 0.9), "Red");
  });
});
