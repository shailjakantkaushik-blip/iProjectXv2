import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fyEndFor, fyLabel, fyStartFor } from "./fiscal-year.ts";

describe("organisation financial year", () => {
  it("defaults to April and labels by the ending calendar year", () => {
    assert.equal(fyLabel(new Date(2026, 3, 1)), "FY27"); // 1 Apr 2026
    assert.equal(fyLabel(new Date(2026, 2, 31)), "FY26"); // 31 Mar 2026
  });

  it("honours a July start used by some AU orgs", () => {
    assert.equal(fyLabel(new Date(2026, 6, 1), 7), "FY27");
    assert.equal(fyLabel(new Date(2026, 5, 30), 7), "FY26");
    const start = fyStartFor(new Date(2026, 7, 15), 7);
    assert.equal(start.getMonth(), 6);
    assert.equal(start.getFullYear(), 2026);
    const end = fyEndFor(new Date(2026, 7, 15), 7);
    assert.equal(end.getMonth(), 5);
    assert.equal(end.getFullYear(), 2027);
  });
});
