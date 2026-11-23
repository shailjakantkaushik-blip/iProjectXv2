import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOLIDAY_ORG_WIDE,
  buildResourceCalendarIndex,
  countWorkingDaysInclusive,
  holidayAppliesToLocation,
  monthCapacityHours,
  normalizeLocation,
  splitHoursByWorkingDays,
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
