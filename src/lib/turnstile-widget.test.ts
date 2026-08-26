import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isIosWebKit,
  turnstileBoxForSize,
  turnstileHostWidth,
  turnstileSizeForHost,
  turnstileSizeForWidth,
} from "./turnstile-size.ts";

describe("turnstileSizeForHost", () => {
  it("uses the standard normal widget on typical phones and desktop cards", () => {
    assert.equal(turnstileSizeForHost(318, 390), "normal");
    assert.equal(turnstileSizeForHost(360, 430), "normal");
    assert.equal(turnstileSizeForHost(352, 1280), "normal");
    assert.equal(turnstileSizeForHost(400, 768), "normal");
  });

  it("uses compact only when the card is narrower than the 300px checkbox", () => {
    assert.equal(turnstileSizeForHost(248, 390), "compact");
    assert.equal(turnstileSizeForHost(299, 1024), "compact");
  });

  it("does not force compact on iOS when the card can fit the normal widget", () => {
    assert.equal(turnstileSizeForHost(318, 390, true), "normal");
    assert.equal(turnstileSizeForHost(800, 844, true), "normal");
  });

  it("falls back to normal when width is unknown (never flexible)", () => {
    assert.equal(turnstileSizeForHost(0, 0), "normal");
    assert.equal(turnstileSizeForHost(-1, -1), "normal");
    assert.equal(turnstileSizeForWidth(0), "normal");
  });
});

describe("turnstileBoxForSize", () => {
  it("reserves Cloudflare's official compact footprint so the widget can paint", () => {
    assert.deepEqual(turnstileBoxForSize("compact"), { widthPx: 150, heightPx: 140 });
    assert.deepEqual(turnstileBoxForSize("normal"), { widthPx: 300, heightPx: 65 });
  });
});

describe("turnstileHostWidth", () => {
  it("prefers the card width so padding can select compact", () => {
    assert.equal(turnstileHostWidth(248, 390), 248);
    assert.equal(turnstileHostWidth(352, 1280), 352);
  });

  it("falls back to the viewport when the card has not laid out", () => {
    assert.equal(turnstileHostWidth(0, 390), 390);
  });
});

describe("isIosWebKit", () => {
  it("detects iPhone and iPadOS", () => {
    assert.equal(
      isIosWebKit(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "iPhone",
        5,
      ),
      true,
    );
    assert.equal(isIosWebKit("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5), true);
    assert.equal(isIosWebKit("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32", 0), false);
  });
});
