import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateProjectHealth, scoreToRag } from "./project-health-engine.ts";
import { fyEnvelopeOverAllocation } from "./fy-allocation-scope.ts";
import { PLATFORM_SEED_PROJECTS } from "./platform-seed.ts";
import { projectApprovedFunding, projectIncurred, projectRemaining } from "./project-finance.ts";

describe("iProjectX platform seed — finance + health", () => {
  it("keeps remaining = approved − incurred on every seed project", () => {
    for (const p of PLATFORM_SEED_PROJECTS) {
      const row = {
        budget: p.budget,
        capex_approved: p.capexA,
        opex_approved: p.opexA,
        capex_incurred: p.capexI,
        opex_incurred: p.opexI,
        forecast_at_completion: p.fac,
      };
      assert.equal(projectApprovedFunding(row), p.budget, p.code);
      assert.equal(projectIncurred(row), p.capexI + p.opexI, p.code);
      assert.equal(projectRemaining(row), p.budget - (p.capexI + p.opexI), p.code);
    }
  });

  it("does not let a year allocation exceed the PRJ-001 envelope", () => {
    const p = PLATFORM_SEED_PROJECTS[0];
    const over = fyEnvelopeOverAllocation({
      allocations: [{ fy: "FY26", budget: 2_000_000 }, { fy: "FY27", budget: 2_000_000 }],
      overallBudget: p.budget,
    });
    assert.ok(over);
    assert.ok(over.overBy > 0);
    assert.equal(
      fyEnvelopeOverAllocation({
        allocations: [{ fy: "FY26", budget: 1_000_000 }],
        overallBudget: p.budget,
      }),
      null,
    );
  });

  it("scores each seed project and keeps RAG aligned to the score", () => {
    for (const p of PLATFORM_SEED_PROJECTS) {
      const result = evaluateProjectHealth({
        nowMs: Date.parse("2026-03-15T00:00:00Z"),
        fyStartMonth: 7,
        project: {
          id: p.code,
          project_code: p.code,
          name: p.name,
          budget: p.budget,
          capex_approved: p.capexA,
          opex_approved: p.opexA,
          capex_incurred: p.capexI,
          opex_incurred: p.opexI,
          forecast_at_completion: p.fac,
          planned_start_date: p.start,
          planned_end_date: p.end,
        },
        workItems: [{ project_id: p.code, estimate_hours: 100, percent_complete: 55, status: "active" }],
        fyAllocations: [{ fy: "FY26", budget: Math.round(p.budget * 0.4) }],
      });
      assert.equal(result.rag, scoreToRag(result.score), p.code);
      assert.ok(result.score >= 0 && result.score <= 100, `${p.code} score ${result.score}`);
      assert.equal(result.dimensions.length, 8);
    }
  });
});
