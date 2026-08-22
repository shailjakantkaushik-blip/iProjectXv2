import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeBrandSurfaceLogos, resolvePublicLandingLogoUrl } from "./public-landing-logo.ts";
import { parseLandingLogoCookie, sanitizeLandingLogoCookieUrl } from "./landing-logo-cookie.ts";

const APP = "https://cdn.example/app-mark.png";
const LANDING = "https://cdn.example/landing-mark.png";
const LEGACY = "https://cdn.example/legacy.png";

describe("resolvePublicLandingLogoUrl", () => {
  it("uses the landing-specific URL, even when it matches the app file", () => {
    assert.equal(
      resolvePublicLandingLogoUrl({
        logo_url: APP,
        logo_url_landing: LANDING,
        logo_url_app: APP,
      }),
      LANDING,
    );
    assert.equal(
      resolvePublicLandingLogoUrl({
        logo_url: APP,
        logo_url_landing: APP,
        logo_url_app: APP,
      }),
      APP,
    );
  });

  it("does not fall back to the app-shell file", () => {
    assert.equal(
      resolvePublicLandingLogoUrl({
        logo_url: APP,
        logo_url_landing: "",
        logo_url_app: APP,
      }),
      "",
    );
  });

  it("uses a true legacy single logo when no app surface exists", () => {
    assert.equal(
      resolvePublicLandingLogoUrl({ logo_url: LEGACY, logo_url_landing: "", logo_url_app: "" }),
      LEGACY,
    );
  });
});

describe("mergeBrandSurfaceLogos", () => {
  it("does not copy legacy logo_url onto landing when app/auth surfaces exist", () => {
    const merged = mergeBrandSurfaceLogos({
      logo_url: APP,
      logo_url_app: APP,
    });
    assert.equal(merged.logo_url_landing, "");
    assert.equal(merged.logo_url_auth, "");
    assert.equal(merged.logo_url_app, APP);
  });

  it("copies legacy logo_url to every surface only for true single-logo configs", () => {
    const merged = mergeBrandSurfaceLogos({ logo_url: LEGACY });
    assert.equal(merged.logo_url_landing, LEGACY);
    assert.equal(merged.logo_url_app, LEGACY);
  });

  it("keeps an explicit empty landing field (do not backfill)", () => {
    const merged = mergeBrandSurfaceLogos({
      logo_url: APP,
      logo_url_landing: "",
      logo_url_app: APP,
    });
    assert.equal(merged.logo_url_landing, "");
  });
});

describe("landing logo cookie", () => {
  it("reads an https landing logo and rejects data URLs", () => {
    assert.equal(
      parseLandingLogoCookie(`other=1; pmo_llogo=${encodeURIComponent(LANDING)}`),
      LANDING,
    );
    assert.equal(sanitizeLandingLogoCookieUrl("data:image/png;base64,aaaa"), "");
    assert.equal(sanitizeLandingLogoCookieUrl("/relative.png"), "");
  });
});
