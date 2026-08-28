import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPhoneBrowser,
  turnstileBoxForSize,
  turnstileSizeForDevice,
  turnstileSizeForViewport,
} from "./turnstile-size.ts";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

describe("isPhoneBrowser", () => {
  it("treats iPhone Safari, iPhone Chrome, and Android as phones", () => {
    assert.equal(isPhoneBrowser({ userAgent: IPHONE }), true);
    assert.equal(isPhoneBrowser({ userAgent: IPHONE_CHROME }), true);
    assert.equal(isPhoneBrowser({ userAgent: ANDROID }), true);
  });

  it("treats iPad / iOS desktop-mode (MacIntel + touch) as a phone", () => {
    assert.equal(isPhoneBrowser({ platform: "MacIntel", maxTouchPoints: 5 }), true);
  });

  it("does not treat a desktop / laptop as a phone", () => {
    assert.equal(
      isPhoneBrowser({ userAgent: DESKTOP, platform: "Win32", maxTouchPoints: 0, viewportPx: 1280 }),
      false,
    );
  });
});

describe("turnstileSizeForDevice", () => {
  it("uses the square compact widget on phones and the rectangle on desktop", () => {
    assert.equal(turnstileSizeForDevice(true), "compact");
    assert.equal(turnstileSizeForDevice(false), "normal");
    assert.equal(turnstileSizeForViewport(390), "compact");
    assert.equal(turnstileSizeForViewport(1280), "normal");
  });
});

describe("turnstileBoxForSize", () => {
  it("reserves official footprints so the widget can paint", () => {
    assert.deepEqual(turnstileBoxForSize("compact"), { widthPx: 150, heightPx: 140 });
    assert.deepEqual(turnstileBoxForSize("normal"), { widthPx: 300, heightPx: 65 });
  });
});
