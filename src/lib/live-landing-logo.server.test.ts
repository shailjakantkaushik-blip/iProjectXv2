import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDataImageUrl } from "./live-landing-logo-parse.ts";

describe("parseDataImageUrl", () => {
  it("decodes a small PNG data URL", () => {
    const png = Buffer.from("png-bytes").toString("base64");
    const parsed = parseDataImageUrl(`data:image/png;base64,${png}`);
    assert.ok(parsed);
    assert.equal(parsed.type, "image/png");
    assert.equal(Buffer.from(parsed.bytes).toString(), "png-bytes");
  });

  it("rejects SVG and oversized payloads", () => {
    assert.equal(parseDataImageUrl("data:image/svg+xml;base64,YQ=="), null);
    assert.equal(parseDataImageUrl("https://cdn.example/logo.png"), null);
  });
});
