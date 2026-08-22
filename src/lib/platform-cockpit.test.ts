import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildExecutiveBriefing } from "./executive-briefing.ts";
import { PLATFORM_SEED_PROJECTS } from "./platform-seed.ts";
import { buildPortfolioPulse } from "./portfolio-pulse.ts";

function financeRow(code: string) {
  const p = PLATFORM_SEED_PROJECTS.find((x) => x.code === code);
  if (!p) throw new Error(code);
  return {
    id: p.code,
    project_code: p.code,
    name: p.name,
    status: p.status,
    rag: p.rag,
    program: p.program,
    budget: p.budget,
    capex_approved: p.capexA,
    opex_approved: p.opexA,
    capex_incurred: p.capexI,
    opex_incurred: p.opexI,
    forecast_at_completion: p.fac,
    benefits_target: p.benT,
    benefits_realised: p.benR,
    planned_start_date: p.start,
    planned_end_date: p.end,
  };
}

describe("executive cockpit + portfolio pulse on iProjectX seed", () => {
  it("flags PRJ-009 overrun and an open critical risk in the steering pack", () => {
    const wifi = financeRow("PRJ-009");
    const portal = financeRow("PRJ-001");
    const briefing = buildExecutiveBriefing({
      now: new Date("2026-03-15T00:00:00Z"),
      fyStartMonth: 7,
      projects: [portal, wifi],
      monthly: [],
      gates: [
        {
          id: "g1",
          project_id: "PRJ-009",
          gate_name: "Testing",
          status: "in review",
          planned_date: "2026-01-15",
        },
      ],
      risks: [
        {
          id: "r1",
          project_id: "PRJ-009",
          raid_code: "RSK-009",
          title: "Site access delay",
          status: "Open",
          severity: 16,
          probability: 4,
          impact: 4,
        },
      ],
      decisions: [
        {
          id: "d1",
          project_id: "PRJ-001",
          raid_code: "DEC-001",
          title: "Go-live weekend",
          outcome: "Pending",
          required_date: "2026-03-01",
        },
      ],
    });
    assert.ok(briefing.criticalRisks >= 1);
    assert.ok(briefing.decisionsWaiting >= 1);
    assert.ok(briefing.moneyAtRisk > 0, "PRJ-009 FAC is above approved funding");
    assert.ok(briefing.pack.some((row) => row.project.project_code === "PRJ-009"));
    assert.ok(briefing.healthPct >= 0 && briefing.healthPct <= 100);
  });

  it("scores the six pulse areas for the in-flight Digital Transformation pair", () => {
    const pulse = buildPortfolioPulse({
      orgId: "iprojectx",
      nowMs: Date.parse("2026-03-15T00:00:00Z"),
      fyStartMonth: 7,
      projects: [
        { project: financeRow("PRJ-001"), workItems: [{ project_id: "PRJ-001", estimate_hours: 100, percent_complete: 55, status: "active" }] },
        { project: financeRow("PRJ-011"), workItems: [{ project_id: "PRJ-011", estimate_hours: 80, percent_complete: 20, status: "active" }] },
      ],
    });
    assert.equal(pulse.projectCount, 2);
    assert.equal(pulse.areas.length, 6);
    assert.deepEqual(
      pulse.areas.map((a) => a.key),
      ["financial", "delivery", "resource", "risk", "benefits", "dependencies"],
    );
    assert.ok(pulse.healthPct >= 0 && pulse.healthPct <= 100);
  });
});
