import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("SECURITY.md", () => {
  const text = readFileSync(join(process.cwd(), "SECURITY.md"), "utf8");

  it("explains how to report a vulnerability without claiming certification", () => {
    assert.match(text, /Report a vulnerability/i);
    assert.match(text, /\*\*not\*\* SOC 2 Type II or ISO 27001 certified/i);
    assert.doesNotMatch(text, /we are SOC 2 certified/i);
  });
});
