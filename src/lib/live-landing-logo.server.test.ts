import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseDataImageUrl,
  parseLiveLogoSurface,
  pickLiveLogoCandidate,
} from "./live-landing-logo-parse.ts";
import { visiblePublicLogoUrl } from "./live-landing-logo.ts";

describe("visiblePublicLogoUrl", () => {
  it("never returns empty — packaged mark when config is blank", () => {
    assert.equal(visiblePublicLogoUrl(""), "/brand/iprojectx-mark.webp");
    assert.equal(visiblePublicLogoUrl(null), "/brand/iprojectx-mark.webp");
    assert.equal(visiblePublicLogoUrl("https://cdn.example/logo.png"), "https://cdn.example/logo.png");
  });
});

describe("pickLiveLogoCandidate", () => {
  it("uses Auth then Landing then legacy, never App-shell", () => {
    assert.equal(
      pickLiveLogoCandidate(
        { logo_url_auth: "https://cdn.example/auth.png", logo_url_landing: "https://cdn.example/land.png" },
        "auth",
      ),
      "https://cdn.example/auth.png",
    );
    assert.equal(
      pickLiveLogoCandidate({ logo_url_landing: "https://cdn.example/land.png" }, "auth"),
      "https://cdn.example/land.png",
    );
    assert.equal(
      pickLiveLogoCandidate({ logo_url: "https://cdn.example/legacy.png" }, "auth"),
      "https://cdn.example/legacy.png",
    );
    assert.equal(
      pickLiveLogoCandidate(
        { logo_url: "https://cdn.example/legacy.png", logo_url_app: "https://cdn.example/app.png" },
        "auth",
      ),
      "",
    );
  });

  it("keeps Landing off the App-shell file", () => {
    assert.equal(
      pickLiveLogoCandidate({ logo_url_landing: "https://cdn.example/land.png" }, "landing"),
      "https://cdn.example/land.png",
    );
    assert.equal(
      pickLiveLogoCandidate(
        { logo_url: "https://cdn.example/legacy.png", logo_url_app: "https://cdn.example/app.png" },
        "landing",
      ),
      "",
    );
  });

  it("parses the surface query", () => {
    assert.equal(parseLiveLogoSurface("auth"), "auth");
    assert.equal(parseLiveLogoSurface("landing"), "landing");
    assert.equal(parseLiveLogoSurface("app"), "landing");
    assert.equal(parseLiveLogoSurface(null), "landing");
  });
});

describe("parseDataImageUrl", () => {
  it("decodes a small PNG data URL", () => {
    const png = Buffer.from("png-bytes").toString("base64");
    const parsed = parseDataImageUrl(`data:image/png;base64,${png}`);
    assert.ok(parsed);
    assert.equal(parsed.type, "image/png");
    assert.equal(Buffer.from(parsed.bytes).toString(), "png-bytes");
  });

  it("rejects SVG and non-data URLs", () => {
    assert.equal(parseDataImageUrl("data:image/svg+xml;base64,YQ=="), null);
    assert.equal(parseDataImageUrl("https://cdn.example/logo.png"), null);
  });

  it("accepts base64 with whitespace", () => {
    const png = Buffer.from("png-bytes").toString("base64");
    const parsed = parseDataImageUrl(`data:image/png;base64,${png.slice(0, 4)}\n${png.slice(4)}`);
    assert.ok(parsed);
    assert.equal(Buffer.from(parsed.bytes).toString(), "png-bytes");
  });
});
