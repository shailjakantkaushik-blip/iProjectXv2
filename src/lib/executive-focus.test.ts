import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExecutiveFocus,
  criticalityFromScore,
  parseFocusWeights,
  DEFAULT_FOCUS_WEIGHTS,
} from "./executive-focus.ts";
import { PLATFORM_SEED_PROJECTS } from "./platform-seed.ts";

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
    sponsor: "Executive Sponsor",
    priority: p.rag === "Red" ? "P1" : "P2",
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

describe("executive focus scoring", () => {
  it("keeps default weights when ui_config is empty", () => {
    assert.deepEqual(parseFocusWeights(null), DEFAULT_FOCUS_WEIGHTS);
    assert.equal(parseFocusWeights({ executive_focus: { weights: { urgency: 20 } } }).urgency, 20);
    assert.equal(parseFocusWeights({ executive_focus: { weights: { urgency: 20 } } }).financialImpact, 18);
  });

  it("bands attention scores", () => {
    assert.equal(criticalityFromScore(90), "Critical");
    assert.equal(criticalityFromScore(60), "High");
    assert.equal(criticalityFromScore(40), "Watch");
    assert.equal(criticalityFromScore(10), "Stable");
  });
});

describe("executive focus on iProjectX seed", () => {
  const now = new Date("2026-03-15T00:00:00Z");

  it("surfaces PRJ-009 money, late gate, and critical risk — not every red project", () => {
    const wifi = financeRow("PRJ-009");
    const portal = financeRow("PRJ-001");
    const quiet = {
      ...financeRow("PRJ-008"),
      rag: "Red",
      rag_override: "Red",
      forecast_at_completion: 980_000,
      planned_end_date: "2026-12-15",
    };
    const focus = buildExecutiveFocus({
      now,
      fyStartMonth: 7,
      projects: [portal, wifi, quiet],
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

    assert.ok(focus.summary.critical >= 1);
    assert.ok(focus.summary.decisionsRequired >= 1);
    assert.ok(focus.summary.financialExposure > 0, "PRJ-009 FAC is above envelope");
    assert.ok(focus.byArea.financial.some((i) => i.projectId === "PRJ-009"));
    assert.ok(focus.byArea.financial.some((i) => i.subtype === "forecast" || i.subtype === "actual"));
    assert.ok(focus.byArea.risk.some((i) => i.subtype === "risk"));
    assert.ok(focus.byArea.decision.some((i) => i.subtype === "overdue"));
    assert.ok(focus.byArea.risk.some((i) => i.title.includes("Site access")));
    assert.ok(focus.byArea.decision.some((i) => i.criticality === "Critical"));
    assert.equal(
      focus.byArea.delivery.some((i) => i.projectId === "PRJ-008"),
      false,
      "red RAG with no material impact stays off the list",
    );
    assert.ok(focus.top.length <= 5);
    assert.ok(focus.top[0].why && focus.top[0].impact && focus.top[0].action);
  });

  it("flags a skill shortage at portfolio level", () => {
    const portal = financeRow("PRJ-001");
    const wifi = financeRow("PRJ-009");
    const focus = buildExecutiveFocus({
      now,
      projects: [portal, wifi],
      resources: [
        { id: "eng-1", name: "Ada", role: "Data Engineer", skills: "Data Engineer", capacity_hours_week: 40, status: "Active" },
      ],
      allocations: [
        { resource_id: "eng-1", project_id: "PRJ-001", allocation_percent: 100, period_month: "2026-03" },
        { resource_id: "eng-1", project_id: "PRJ-009", allocation_percent: 200, period_month: "2026-03" },
      ],
    });
    assert.ok(focus.summary.fteGap >= 0);
    assert.ok(focus.byArea.resource.length >= 1);
    assert.ok(focus.byArea.resource[0].headline.includes("FTE"));
  });

  it("shows a delayed cross-project dependency with successor count", () => {
    const portal = financeRow("PRJ-001");
    const wifi = { ...financeRow("PRJ-009"), planned_end_date: "2026-05-31", actual_end_date: "2026-06-20" };
    const focus = buildExecutiveFocus({
      now,
      projects: [portal, wifi],
      dependencies: [
        {
          id: "dep1",
          project_id: "PRJ-001",
          depends_on_project_id: "PRJ-009",
          title: "WiFi before portal go-live",
          status: "Open",
          needed_by: "2026-03-01",
          owner: "Integration lead",
        },
      ],
    });
    assert.ok(focus.byArea.dependency.length >= 1);
    assert.ok((focus.byArea.dependency[0].projectsImpacted || 0) >= 1);
    assert.equal(focus.byArea.dependency[0].link.kind, "dependencies");
  });
});
