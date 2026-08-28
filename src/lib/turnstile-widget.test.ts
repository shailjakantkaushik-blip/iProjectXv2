import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isTurnstileFrameControl,
  readTurnstileFrameToken,
  readTurnstileTokenFromFrameWindow,
  turnstileFrameControlMessage,
  turnstileFrameSrc,
} from "./turnstile-frame.ts";
import { TURNSTILE_TOKEN_INPUT_ID } from "./turnstile-token-bridge.ts";
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

  it("does not treat handshake control messages as tokens", () => {
    assert.equal(readTurnstileFrameToken(turnstileFrameControlMessage("ready")), null);
    assert.equal(readTurnstileFrameToken(turnstileFrameControlMessage("ack")), null);
    assert.equal(isTurnstileFrameControl(turnstileFrameControlMessage("ready"), "ready"), true);
    assert.equal(isTurnstileFrameControl(turnstileFrameControlMessage("ack"), "ack"), true);
    assert.equal(isTurnstileFrameControl({ source: "iprojectx-turnstile", token: "abc" }, "ready"), false);
  });

  it("accepts JSON-string postMessage payloads from older WebKit", () => {
    assert.equal(
      readTurnstileFrameToken(JSON.stringify({ source: "iprojectx-turnstile", token: "abc" })),
      "abc",
    );
  });

  it("exposes a parent-page token bridge the frame can write", () => {
    assert.equal(TURNSTILE_TOKEN_INPUT_ID, "turnstile-token-bridge");
  });

  it("reads a token the iframe already collected", () => {
    assert.equal(
      readTurnstileTokenFromFrameWindow({
        iprojectxLastTurnstileToken: () => "from-api",
      }),
      "from-api",
    );
    assert.equal(
      readTurnstileTokenFromFrameWindow({
        document: {
          querySelector: () => ({ value: "from-field" }),
        },
      }),
      "from-field",
    );
    assert.equal(readTurnstileTokenFromFrameWindow({}), null);
    assert.equal(readTurnstileTokenFromFrameWindow(null), null);
  });
});
