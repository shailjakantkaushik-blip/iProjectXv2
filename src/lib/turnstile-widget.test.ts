import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readTurnstileFrameToken, turnstileFrameSrc } from "./turnstile-frame.ts";
import { turnstileAuthWidgetSize, turnstileBoxForSize } from "./turnstile-size.ts";

describe("turnstileAuthWidgetSize", () => {
  it("uses the standard 300×65 rectangle everywhere", () => {
    assert.equal(turnstileAuthWidgetSize(), "normal");
    assert.deepEqual(turnstileBoxForSize(turnstileAuthWidgetSize()), {
      widthPx: 300,
      heightPx: 65,
    });
  });
});

describe("turnstile frame", () => {
  it("loads the official rectangle widget", () => {
    assert.equal(
      turnstileFrameSrc("0xTestKey"),
      "/turnstile-frame.html?k=0xTestKey&size=normal",
    );
  });

  it("accepts only same-origin frame token messages", () => {
    assert.equal(readTurnstileFrameToken({ source: "iprojectx-turnstile", token: "abc" }), "abc");
    assert.equal(readTurnstileFrameToken({ source: "iprojectx-turnstile", token: "" }), "");
    assert.equal(readTurnstileFrameToken({ source: "other", token: "abc" }), null);
    assert.equal(readTurnstileFrameToken(null), null);
  });
});
