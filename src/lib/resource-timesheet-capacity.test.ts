import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_HOURS_PER_DAY,
  hoursLoadStatus,
  hoursToEffortUnit,
  resourceHoursPerDay,
  resourceHoursPerWeek,
} from "./resource-capacity.ts";
import { canEditTimesheet, entryWeekTotal, spreadHoursAcrossWeekdays, weekStartMonday } from "./timesheet.ts";

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
