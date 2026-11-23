import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEditTimesheet,
  canReopenTimesheet,
  canWithdrawTimesheet,
  entryWeekTotal,
  spreadHoursAcrossWeekdays,
  weekStartMonday,
  workItemWeekdayPlan,
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

  it("skips public holidays when applying a week plan", () => {
    const plan = workItemWeekdayPlan({
      estimateHours: 32,
      plannedStart: "2026-01-26",
      plannedEnd: "2026-01-30",
      weekStart: "2026-01-26",
      unavailable: ["2026-01-26"],
    });
    assert.equal(plan.perDay.hours_mon, 0);
    assert.equal(entryWeekTotal(plan.perDay), 32);
    assert.equal(plan.perDay.hours_sat, 0);
  });

  it("locks editing after the sheet leaves draft", () => {
    assert.equal(canEditTimesheet("draft"), true);
    assert.equal(canEditTimesheet("pending_pm"), false);
    assert.equal(canWithdrawTimesheet("pending_pm"), true);
    assert.equal(canReopenTimesheet("approved"), true);
    assert.equal(canReopenTimesheet("rejected"), false);
  });
});
