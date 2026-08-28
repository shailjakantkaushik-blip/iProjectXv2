import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { turnstileBoxForSize, turnstileSizeForViewport } from "./turnstile-size.ts";

describe("turnstileSizeForViewport", () => {
  it("uses the square compact widget on phones", () => {
    assert.equal(turnstileSizeForViewport(320), "compact");
    assert.equal(turnstileSizeForViewport(390), "compact");
    assert.equal(turnstileSizeForViewport(430), "compact");
    assert.equal(turnstileSizeForViewport(767), "compact");
  });

  it("uses the standard rectangle on desktop and laptop", () => {
    assert.equal(turnstileSizeForViewport(768), "normal");
    assert.equal(turnstileSizeForViewport(1024), "normal");
    assert.equal(turnstileSizeForViewport(1280), "normal");
    assert.equal(turnstileSizeForViewport(0), "normal");
  });
});

describe("turnstileBoxForSize", () => {
  it("reserves the official compact square so the phone widget can paint", () => {
    assert.deepEqual(turnstileBoxForSize("compact"), { widthPx: 150, heightPx: 140 });
  });

  it("reserves the official rectangle on desktop", () => {
    assert.deepEqual(turnstileBoxForSize("normal"), { widthPx: 300, heightPx: 65 });
  });
});
