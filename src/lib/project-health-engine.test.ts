import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateProjectHealth, scoreToRag } from "./project-health-engine.ts";

describe("project health engine", () => {
  it("maps score bands used on the cockpit", () => {
    assert.equal(scoreToRag(87), "Green");
    assert.equal(scoreToRag(72), "Amber");
    assert.equal(scoreToRag(58), "Red");
    assert.equal(scoreToRag(80), "Green");
    assert.equal(scoreToRag(65), "Amber");
  });

  it("scores a healthy in-flight project Green without inventing RAG", () => {
    const result = evaluateProjectHealth({
      nowMs: Date.parse("2026-06-15T00:00:00Z"),
      fyStartMonth: 7,
      project: {
        id: "p1",
        budget: 100,
        capex_approved: 60,
        opex_approved: 40,
        capex_incurred: 20,
        opex_incurred: 10,
        planned_start_date: "2026-01-01",
        planned_end_date: "2026-12-31",
        benefits_target: 140,
        benefits_realised: 40,
      },
      workItems: [{ project_id: "p1", estimate_hours: 100, percent_complete: 50, status: "active" }],
      fyAllocations: [{ fy: "FY26", budget: 50 }],
      risks: [{ status: "Open", residual_rating: "Low" }],
    });
    assert.equal(result.rag, scoreToRag(result.score));
    assert.ok(result.score >= 65, `expected healthy score, got ${result.score}`);
    assert.equal(result.dimensions.length, 8);
    assert.ok(result.dimensions.every((d) => d.score >= 0 && d.score <= 100));
  });

  it("does not let parent envelope RAG change the project score", () => {
    const base = {
      nowMs: Date.parse("2026-06-15T00:00:00Z"),
      project: {
        id: "p1",
        budget: 100,
        planned_start_date: "2026-01-01",
        planned_end_date: "2026-12-31",
      },
      workItems: [{ project_id: "p1", estimate_hours: 10, percent_complete: 80, status: "active" }],
    };
    const plain = evaluateProjectHealth(base);
    const withParent = evaluateProjectHealth({
      ...base,
      parentEnvelopes: [{ layer: "alignment", name: "Digital", envelope: 50, childApproved: 200 }],
    });
    assert.equal(plain.score, withParent.score);
  });
});
