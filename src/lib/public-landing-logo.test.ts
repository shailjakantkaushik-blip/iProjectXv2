import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAppMarkMasqueradingAsLanding,
  mergeBrandSurfaceLogos,
  resolvePublicLandingLogoUrl,
} from "./public-landing-logo.ts";

const APP = "https://cdn.example/app-mark.png";
const LANDING = "https://cdn.example/landing-mark.png";
const LEGACY = "https://cdn.example/legacy.png";

describe("resolvePublicLandingLogoUrl", () => {
  it("uses the landing-specific URL when it is not the app mark", () => {
    assert.equal(
      resolvePublicLandingLogoUrl({
        logo_url: APP,
        logo_url_landing: LANDING,
        logo_url_app: APP,
      }),
      LANDING,
    );
  });

  it("does not paint the app mark on first paint even if it was backfilled onto landing", () => {
    assert.equal(
      resolvePublicLandingLogoUrl({
        logo_url: APP,
        logo_url_landing: APP,
        logo_url_app: APP,
      }),
      "",
    );
    assert.equal(
      isAppMarkMasqueradingAsLanding({
        logo_url: APP,
        logo_url_landing: APP,
        logo_url_app: APP,
      }),
      true,
    );
  });

  it("does not fall back to the app or legacy mark while waiting for live config", () => {
    assert.equal(
      resolvePublicLandingLogoUrl({
        logo_url: APP,
        logo_url_landing: "",
        logo_url_app: APP,
      }),
      "",
    );
  });

  it("after settle, uses a true legacy single logo only when no app surface exists", () => {
    assert.equal(
      resolvePublicLandingLogoUrl(
        { logo_url: LEGACY, logo_url_landing: "", logo_url_app: "" },
        "settled",
      ),
      LEGACY,
    );
    assert.equal(
      resolvePublicLandingLogoUrl(
        { logo_url: APP, logo_url_landing: "", logo_url_app: APP },
        "settled",
      ),
      "",
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
