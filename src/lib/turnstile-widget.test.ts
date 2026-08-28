import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TURNSTILE_SLOT_INNER_HTML,
  turnstileHostWidth,
  turnstileSizeForWidth,
} from "./turnstile-size.ts";
import {
  findTurnstileScript,
  isTurnstileScriptSrc,
  turnstileShouldPollApi,
} from "./turnstile-load.ts";

describe("turnstileSizeForWidth", () => {
  it("uses compact only when the card is narrower than the 300px normal widget", () => {
    assert.equal(turnstileSizeForWidth(248), "compact");
    assert.equal(turnstileSizeForWidth(299), "compact");
  });

  it("uses the standard normal widget on typical phones and desktop cards", () => {
    assert.equal(turnstileSizeForWidth(300), "normal");
    assert.equal(turnstileSizeForWidth(320), "normal");
    assert.equal(turnstileSizeForWidth(390), "normal");
    assert.equal(turnstileSizeForWidth(768), "normal");
  });

  it("falls back to normal when width is unknown (never flexible)", () => {
    assert.equal(turnstileSizeForWidth(0), "normal");
    assert.equal(turnstileSizeForWidth(-1), "normal");
  });
});

describe("turnstileHostWidth", () => {
  it("prefers the viewport so card padding does not force compact on phones", () => {
    assert.equal(turnstileHostWidth(248, 390), 390);
    assert.equal(turnstileHostWidth(352, 1280), 1280);
  });

  it("keeps the narrower value when both are below the normal widget", () => {
    assert.equal(turnstileHostWidth(248, 280), 280);
  });
});

describe("turnstile load", () => {
  it("always polls for window.turnstile (WebKit misses onload after preload)", () => {
    assert.equal(turnstileShouldPollApi(), true);
  });

  it("matches explicit and bare Turnstile api.js URLs", () => {
    assert.equal(
      isTurnstileScriptSrc("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"),
      true,
    );
    assert.equal(isTurnstileScriptSrc("https://challenges.cloudflare.com/turnstile/v0/api.js"), true);
    assert.equal(isTurnstileScriptSrc("https://example.com/other.js"), false);
  });

  it("finds an already-parsed Turnstile script so we do not wait on a missed load", () => {
    assert.equal(
      findTurnstileScript([
        { src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" },
      ]),
      true,
    );
    assert.equal(findTurnstileScript([{ src: "/assets/index.js" }]), false);
  });
});

describe("TURNSTILE_SLOT_INNER_HTML", () => {
  it("is a stable empty innerHTML so React will not wipe Cloudflare’s iframe", () => {
    assert.equal(TURNSTILE_SLOT_INNER_HTML.__html, "");
  });
});
