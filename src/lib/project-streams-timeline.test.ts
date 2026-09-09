import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeTimelineLaneDates } from "./timeline-lane-dates.ts";

describe("normalizeTimelineLaneDates", () => {
  it("uses planned start and actual-or-planned end like the infographic", () => {
    const lane = normalizeTimelineLaneDates({
      planned_start_date: "2026-01-01",
      planned_end_date: "2026-06-01",
      actual_start_date: "2026-02-01",
      actual_end_date: "2026-07-01",
      start_date: "2026-02-01",
      end_date: "2026-07-01",
    });
    assert.equal(lane.start_date, "2026-01-01");
    assert.equal(lane.end_date, "2026-07-01");
  });

  it("falls back when planned or actual is missing", () => {
    const lane = normalizeTimelineLaneDates({
      planned_start_date: null,
      actual_start_date: "2026-03-01",
      planned_end_date: "2026-08-01",
      actual_end_date: null,
      start_date: null,
      end_date: null,
    });
    assert.equal(lane.start_date, "2026-03-01");
    assert.equal(lane.end_date, "2026-08-01");
  });
});
