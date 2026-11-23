import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOLIDAY_ORG_WIDE,
  buildResourceCalendarIndex,
  countWorkingDaysInclusive,
  holidayAppliesToLocation,
  monthCapacityHours,
  normalizeLocation,
  isFullyUnavailableWindow,
  MAX_ISO_DATE_SPAN_DAYS,
  overAllocationMessage,
  splitHoursByWorkingDays,
  windowCapacityHours,
  workingDaysInMonth,
} from "./resource-calendar.ts";

describe("resource calendar (holidays + leave)", () => {
  it("treats All / * as org-wide geography", () => {
    assert.equal(normalizeLocation(" * "), HOLIDAY_ORG_WIDE);
    assert.equal(normalizeLocation("All locations"), HOLIDAY_ORG_WIDE);
    assert.equal(holidayAppliesToLocation("*", "Sydney"), true);
    assert.equal(holidayAppliesToLocation("sydney", "Sydney"), true);
    assert.equal(holidayAppliesToLocation("Sydney", "London"), false);
    assert.equal(holidayAppliesToLocation("Sydney", null), false);
  });

  it("drops weekends and location holidays from working days", () => {
    // Mon 26 Jan 2026 is Australia Day; Sat 24 / Sun 25 sit in the same week.
    const days = countWorkingDaysInclusive("2026-01-23", "2026-01-27", ["2026-01-26"]);
    // Fri 23, Mon 26 (holiday), Tue 27 → 2 working days
    assert.equal(days, 2);
    assert.equal(countWorkingDaysInclusive("2026-01-23", "2026-01-27"), 3);
  });

  it("clips long leave to the requested window so later months still count as off", () => {
    const index = buildResourceCalendarIndex(
      [],
      [
        {
          resource_id: "ada",
          start_date: "2023-01-01",
          end_date: "2028-12-31",
          leave_type: "Annual",
        },
      ],
    );
    const jan27 = index.unavailableFor("ada", "Sydney", "2026-01-01", "2026-01-31");
    assert.equal(jan27.has("2026-01-15"), true);
    assert.equal(workingDaysInMonth("2026-01-01", jan27), 0);
    const fourYear = index.unavailableFor("ada", "Sydney", "2025-01-01", "2028-12-31");
    assert.equal(fourYear.has("2025-01-15"), true);
    assert.equal(fourYear.has("2028-06-15"), true);
    assert.ok(MAX_ISO_DATE_SPAN_DAYS >= 4000);
  });

  it("unions leave ranges with holidays for that person only", () => {
    const index = buildResourceCalendarIndex(
      [
        { location: "Sydney", holiday_date: "2026-01-26", name: "Australia Day" },
        { location: "London", holiday_date: "2026-01-01", name: "New Year" },
      ],
      [
        {
          resource_id: "ada",
          start_date: "2026-01-27",
          end_date: "2026-01-28",
          leave_type: "Annual",
        },
      ],
    );
    const ada = index.unavailableFor("ada", "Sydney", "2026-01-01", "2026-01-31");
    assert.equal(ada.has("2026-01-26"), true);
    assert.equal(ada.has("2026-01-27"), true);
    assert.equal(ada.has("2026-01-01"), false);
    const bob = index.unavailableFor("bob", "Sydney", "2026-01-01", "2026-01-31");
    assert.equal(bob.has("2026-01-26"), true);
    assert.equal(bob.has("2026-01-27"), false);
  });

  it("uses working days × hours/day for January 2026 capacity", () => {
    // Jan 2026 has 22 weekdays; Australia Day removes Monday 26th → 21 × 8 = 168
    assert.equal(workingDaysInMonth("2026-01-01"), 22);
    assert.equal(monthCapacityHours("2026-01-01", 8, ["2026-01-26"]), 168);
    assert.equal(windowCapacityHours("2026-01-26", "2026-01-30", 8, ["2026-01-26"]), 32);
  });

  it("treats a fully blocked dated window as unavailable", () => {
    const leave = ["2026-01-26", "2026-01-27", "2026-01-28", "2026-01-29", "2026-01-30"];
    assert.equal(isFullyUnavailableWindow("2026-01-26", "2026-01-30", leave), true);
    assert.equal(isFullyUnavailableWindow("2026-01-26", "2026-01-30"), false);
    // Sat 24 / Sun 25 Jan 2026 — weekend-only, not leave-blocked weekdays.
    assert.equal(isFullyUnavailableWindow("2026-01-24", "2026-01-25", leave), false);
    assert.equal(isFullyUnavailableWindow("2026-01-24", "2026-01-25"), false);
    assert.equal(windowCapacityHours("2026-01-26", "2026-01-30", 8, leave), 0);
    const msg = overAllocationMessage({
      name: "Ada",
      assignedHours: 8,
      availableHours: 0,
      workingDays: 0,
      offWeekdays: 5,
      dailyHours: 8,
      dayCap: 8,
    });
    assert.ok(msg && /no working days/.test(msg));
  });

  it("warns when assigned hours exceed leave-adjusted availability", () => {
    const msg = overAllocationMessage({
      name: "Ada",
      assignedHours: 40,
      availableHours: 16,
      workingDays: 2,
      offWeekdays: 3,
      dailyHours: 20,
      dayCap: 8,
    });
    assert.ok(msg && /Ada would be Over/.test(msg));
    assert.ok(
      overAllocationMessage({
        name: "Ada",
        assignedHours: 16,
        availableHours: 16,
        workingDays: 2,
        offWeekdays: 3,
        dailyHours: 8,
        dayCap: 8,
      }) == null,
    );
  });

  it("weights estimate hours toward months with more working days", () => {
    const leaveJan = [];
    for (let d = 5; d <= 30; d++) leaveJan.push(`2026-01-${String(d).padStart(2, "0")}`);
    const split = splitHoursByWorkingDays({
      hours: 100,
      start: "2026-01-01",
      end: "2026-02-28",
      months: ["2026-01-01", "2026-02-01"],
      unavailable: leaveJan,
    });
    const jan = split.get("2026-01-01") || 0;
    const feb = split.get("2026-02-01") || 0;
    assert.equal(Math.round((jan + feb) * 10) / 10, 100);
    assert.ok(feb > jan, `February should take more of 100h (got jan=${jan} feb=${feb})`);
  });
});
