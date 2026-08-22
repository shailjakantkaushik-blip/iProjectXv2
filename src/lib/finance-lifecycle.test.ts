import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  monthsForFyLabel,
  parseFyEndingYear,
  sumMonthlyActual,
  sumMonthlyForecast,
  sumMonthlyPlanned,
} from "./finance-lifecycle.ts";
import { PLATFORM_SEED_PROJECTS } from "./platform-seed.ts";

describe("FY / monthly finance lifecycle", () => {
  it("parses FY26 as the year ending 2026 and lists 12 AU months from July", () => {
    assert.equal(parseFyEndingYear("FY26"), 2026);
    const months = monthsForFyLabel("FY26", 7);
    assert.equal(months.length, 12);
    assert.equal(months[0], "2025-07-01");
    assert.equal(months[11], "2026-06-01");
  });

  it("keeps plan / actual / forecast columns independent on one month row", () => {
    const rows = [
      { capex_planned: 100, opex_planned: 40, capex_actual: 80, opex_actual: 20, capex_forecast: 110, opex_forecast: 45 },
    ];
    assert.equal(sumMonthlyPlanned(rows), 140);
    assert.equal(sumMonthlyActual(rows), 100);
    assert.equal(sumMonthlyForecast(rows), 155);
  });

  it("does not let PRJ-009 forecast at completion hide the approved envelope", () => {
    const wifi = PLATFORM_SEED_PROJECTS.find((p) => p.code === "PRJ-009");
    assert.ok(wifi);
    assert.ok(wifi.fac > wifi.budget);
    assert.equal(wifi.capexA + wifi.opexA, wifi.budget);
  });
});
