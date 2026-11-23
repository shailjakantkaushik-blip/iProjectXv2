import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_HOURS_PER_DAY,
  hoursLoadStatus,
  hoursLoadStatusForWindow,
  hoursToEffortUnit,
  resourceHoursPerDay,
  resourceHoursPerWeek,
  workItemAssigneeLoadStatus,
} from "./resource-capacity.ts";
import {
  canEditTimesheet,
  entryWeekTotal,
  spreadHoursAcrossWeekdays,
  weekStartMonday,
} from "./timesheet.ts";

describe("resources + timesheets (platform seed rates)", () => {
  it("derives a 40-hour week from 8 hours/day for the seed bench", () => {
    assert.equal(resourceHoursPerDay({ capacity_hours_week: 40 }), DEFAULT_HOURS_PER_DAY);
    assert.equal(resourceHoursPerWeek({ hours_per_day: 8 }), 40);
    assert.equal(hoursToEffortUnit(40, "days"), 5);
    assert.equal(hoursToEffortUnit(40, "weeks"), 1);
  });

  it("marks over-allocation when a person is booked past capacity", () => {
    assert.equal(hoursLoadStatus(32, 40), "Optimal");
    assert.equal(hoursLoadStatus(16, 40), "Under");
    assert.equal(hoursLoadStatus(44, 40), "Over");
  });

  it("marks Over when demand sits on a fully blocked leave window", () => {
    const leave = ["2026-01-26", "2026-01-27", "2026-01-28", "2026-01-29", "2026-01-30"];
    assert.equal(hoursLoadStatusForWindow(8, 8, "2026-01-26", "2026-01-30", leave), "Over");
    assert.equal(hoursLoadStatus(0, 8), "Under");
    const load = workItemAssigneeLoadStatus({
      estimateHours: 8,
      plannedStart: "2026-01-26",
      plannedEnd: "2026-01-30",
      assigneeCount: 1,
      unavailable: leave,
      cap: 8,
    });
    assert.equal(load.perDay, 0);
    assert.equal(load.status, "Over");
    // Weekend-only windows have no weekdays, so they are not leave-blocked Over.
    assert.equal(hoursLoadStatusForWindow(8, 8, "2026-01-24", "2026-01-25", leave), "Optimal");
    const weekend = workItemAssigneeLoadStatus({
      estimateHours: 8,
      plannedStart: "2026-01-24",
      plannedEnd: "2026-01-25",
      assigneeCount: 1,
      unavailable: leave,
      cap: 8,
    });
    assert.equal(weekend.status, "Under");
  });

  it("spreads a 40-hour timesheet across weekdays only", () => {
    const week = spreadHoursAcrossWeekdays(40);
    assert.equal(entryWeekTotal(week), 40);
    assert.equal(week.hours_sat, 0);
    assert.equal(week.hours_sun, 0);
    assert.equal(canEditTimesheet("draft"), true);
    assert.equal(canEditTimesheet("approved"), false);
    assert.equal(weekStartMonday(new Date(Date.UTC(2026, 7, 22))), "2026-08-17");
  });
});
