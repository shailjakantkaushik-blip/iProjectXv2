import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isIosSafariBrowser,
  isIosWebKit,
  turnstileAuthWidgetSize,
  turnstileBoxForSize,
  turnstileContainerHasIframe,
  turnstileHostWidth,
  turnstileSizeForHost,
  turnstileSizeForWidth,
} from "./turnstile-size.ts";
import { isTurnstileScriptSrc, turnstileMustPollApi } from "./turnstile-load.ts";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";

describe("turnstileSizeForHost", () => {
  it("uses the standard normal widget on typical phones and desktop cards", () => {
    assert.equal(turnstileSizeForHost(318, 390), "normal");
    assert.equal(turnstileSizeForHost(360, 430), "normal");
    assert.equal(turnstileSizeForHost(352, 1280), "normal");
    assert.equal(turnstileSizeForHost(400, 768), "normal");
  });

  it("uses the same 300×65 checkbox on Mobile Safari as Chrome-in-app", () => {
    assert.equal(turnstileSizeForHost(318, 390, true), "normal");
    assert.equal(turnstileSizeForHost(352, 844, true), "normal");
  });

  it("uses compact when the card is narrower than the 300px checkbox", () => {
    assert.equal(turnstileSizeForHost(248, 390), "compact");
    assert.equal(turnstileSizeForHost(299, 1024), "compact");
  });

  it("falls back to normal when width is unknown (never flexible)", () => {
    assert.equal(turnstileSizeForHost(0, 0), "normal");
    assert.equal(turnstileSizeForHost(-1, -1), "normal");
    assert.equal(turnstileSizeForWidth(0), "normal");
  });
});

describe("turnstileAuthWidgetSize", () => {
  it("always uses the 300×65 checkbox on login — never the empty compact tombstone", () => {
    assert.equal(turnstileAuthWidgetSize(), "normal");
    assert.deepEqual(turnstileBoxForSize(turnstileAuthWidgetSize()), {
      widthPx: 300,
      heightPx: 65,
    });
  });
});

describe("turnstileContainerHasIframe", () => {
  it("detects when Cloudflare has injected its iframe", () => {
    assert.equal(turnstileContainerHasIframe(""), false);
    assert.equal(turnstileContainerHasIframe("<div></div>"), false);
    assert.equal(
      turnstileContainerHasIframe('<iframe src="https://challenges.cloudflare.com/"></iframe>'),
      true,
    );
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

describe("isIosSafariBrowser", () => {
  it("detects stock Mobile Safari and not Chrome-in-app or the home-screen PWA", () => {
    assert.equal(isIosSafariBrowser(IPHONE_SAFARI, "iPhone", 5, false), true);
    assert.equal(isIosSafariBrowser(IPHONE_CHROME, "iPhone", 5, false), false);
    assert.equal(isIosSafariBrowser(IPHONE_SAFARI, "iPhone", 5, true), false);
    assert.equal(isIosWebKit(IPHONE_CHROME, "iPhone", 5), true);
    assert.equal(isIosSafariBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32", 0), false);
  });
});

describe("turnstileMustPollApi", () => {
  it("polls when the first HTML already started the script (Safari misses onload)", () => {
    assert.equal(
      turnstileMustPollApi({ turnstilePresent: false, scriptAlreadyInDocument: true }),
      true,
    );
  });

  it("does not wait when the API is already on window", () => {
    assert.equal(
      turnstileMustPollApi({ turnstilePresent: true, scriptAlreadyInDocument: true }),
      false,
    );
  });

  it("still polls after we insert the script ourselves", () => {
    assert.equal(
      turnstileMustPollApi({ turnstilePresent: false, scriptAlreadyInDocument: false }),
      false,
    );
  });
});

describe("isTurnstileScriptSrc", () => {
  it("matches explicit and bare Turnstile api.js URLs", () => {
    assert.equal(
      isTurnstileScriptSrc("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"),
      true,
    );
    assert.equal(isTurnstileScriptSrc("https://challenges.cloudflare.com/turnstile/v0/api.js"), true);
    assert.equal(isTurnstileScriptSrc("https://example.com/other.js"), false);
  });
});
