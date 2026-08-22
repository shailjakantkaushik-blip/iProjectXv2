import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RAID_CODE_PREFIX, raidCodeOf, raidLabel } from "./raid-code.ts";

describe("RAID human codes", () => {
  it("keeps register prefixes stable", () => {
    assert.deepEqual(RAID_CODE_PREFIX, {
      risks: "RSK",
      issues: "ISS",
      actions: "ACT",
      decisions: "DEC",
    });
  });

  it("labels packs with code · title and never shows a bare UUID", () => {
    assert.equal(raidLabel({ raid_code: "RSK-001", title: "Vendor slip" }), "RSK-001 · Vendor slip");
    assert.equal(raidCodeOf({ raid_code: "  " }), null);
    assert.equal(raidLabel({ title: "No code yet" }), "No code yet");
  });
});
