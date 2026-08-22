import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEditTimesheet,
  canReopenTimesheet,
  canWithdrawTimesheet,
  entryWeekTotal,
  spreadHoursAcrossWeekdays,
  weekStartMonday,
} from "./timesheet.ts";

describe("timesheets", () => {
  it("anchors the week on Monday", () => {
    assert.equal(weekStartMonday(new Date(Date.UTC(2026, 7, 22))), "2026-08-17");
  });

  it("totals a week and spreads hours across weekdays only", () => {
    const spread = spreadHoursAcrossWeekdays(10);
    assert.equal(entryWeekTotal(spread), 10);
    assert.equal(spread.hours_sat, 0);
    assert.equal(spread.hours_sun, 0);
  });

  it("locks editing after the sheet leaves draft", () => {
    assert.equal(canEditTimesheet("draft"), true);
    assert.equal(canEditTimesheet("pending_pm"), false);
    assert.equal(canWithdrawTimesheet("pending_pm"), true);
    assert.equal(canReopenTimesheet("approved"), true);
    assert.equal(canReopenTimesheet("rejected"), false);
  });
});
