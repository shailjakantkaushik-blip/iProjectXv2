import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { turnstileSizeForWidth } from "./turnstile-size.ts";

describe("turnstileSizeForWidth", () => {
  it("uses compact on phone-width cards so the iframe is not clipped", () => {
    assert.equal(turnstileSizeForWidth(248), "compact");
    assert.equal(turnstileSizeForWidth(320), "compact");
    assert.equal(turnstileSizeForWidth(390), "compact");
    assert.equal(turnstileSizeForWidth(419), "compact");
  });

  it("uses flexible from 420px up (desktop auth card)", () => {
    assert.equal(turnstileSizeForWidth(420), "flexible");
    assert.equal(turnstileSizeForWidth(768), "flexible");
  });

  it("falls back to flexible when width is unknown", () => {
    assert.equal(turnstileSizeForWidth(0), "flexible");
    assert.equal(turnstileSizeForWidth(-1), "flexible");
  });
});
