import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalFundingGateAsks,
  inFlightSpendRows,
  isFundingGateName,
  isInvestmentCommitteeForum,
  pickInvestmentCommitteeChannel,
} from "./investment-committee.ts";

describe("Investment Committee pack", () => {
  it("recognises the IC forum and live channel name", () => {
    assert.equal(isInvestmentCommitteeForum("Investment Committee"), true);
    assert.equal(isInvestmentCommitteeForum("the IC"), true);
    assert.equal(isInvestmentCommitteeForum("Steering"), false);
    assert.equal(
      pickInvestmentCommitteeChannel([{ name: "Steering" }, { name: "Investment Committee" }])?.name,
      "Investment Committee",
    );
  });

  it("treats Seed/Full Funding and Business Case as capital asks", () => {
    assert.equal(isFundingGateName("Business Case / Full Funding"), true);
    assert.equal(isFundingGateName("Build"), false);
  });

  it("prefers the project-level funding gate over a stream copy", () => {
    const asks = canonicalFundingGateAsks([
      { id: "s", project_id: "p1", stream_id: "st", gate_name: "Business Case / Full Funding", status: "pending", planned_date: "2026-09-01" },
      { id: "p", project_id: "p1", stream_id: null, gate_name: "Business Case / Full Funding", status: "in review", planned_date: "2026-08-01" },
    ]);
    assert.equal(asks.length, 1);
    assert.equal(asks[0].id, "p");
  });

  it("rolls in-flight spend from the same finance helpers as Financials", () => {
    const rows = inFlightSpendRows([
      {
        id: "p1",
        name: "Customer Portal Redesign",
        project_code: "PRJ-001",
        status: "In Progress",
        budget: 3_200_000,
        capex_incurred: 1_100_000,
        opex_incurred: 280_000,
      },
      {
        id: "p2",
        name: "Done",
        status: "Completed",
        budget: 10,
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].budget, 3_200_000);
    assert.equal(rows[0].incurred, 1_380_000);
    assert.equal(rows[0].remaining, 1_820_000);
  });
});
