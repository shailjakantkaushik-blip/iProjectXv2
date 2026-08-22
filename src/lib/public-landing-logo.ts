/**
 * Public marketing logo rules — never paint the App-shell mark on landing.
 *
 * Platform Landing stores three surfaces. Older configs (and merge backfill)
 * copied the legacy/app file into `logo_url_landing`, so first paint showed
 * the in-app logo for a frame, then the real marketing mark.
 */

export type PublicLandingBrandLogos = {
  logo_url?: string | null;
  logo_url_landing?: string | null;
  logo_url_auth?: string | null;
  logo_url_app?: string | null;
};

function trimUrl(url: unknown): string {
  return typeof url === "string" ? url.trim() : "";
}

/** True when `landing` is only the App / legacy mark stored on the landing field. */
export function isAppMarkMasqueradingAsLanding(brand: PublicLandingBrandLogos): boolean {
  const landing = trimUrl(brand.logo_url_landing);
  const app = trimUrl(brand.logo_url_app);
  const legacy = trimUrl(brand.logo_url);
  if (!landing) return false;
  if (app && landing === app) return true;
  if (app && legacy && landing === legacy && app === legacy) return true;
  return false;
}

/**
 * Logo URL for the public landing / contact / legal chrome.
 * `phase: "first-paint"` never falls back to app/legacy, and ignores a
 * landing URL that is identical to the App-shell mark (stale cache).
 * `phase: "settled"` may use a true legacy single-logo (`logo_url` only).
 */
export function resolvePublicLandingLogoUrl(
  brand: PublicLandingBrandLogos | null | undefined,
  phase: "first-paint" | "settled" = "first-paint",
): string {
  if (!brand) return "";
  const landing = trimUrl(brand.logo_url_landing);
  const app = trimUrl(brand.logo_url_app);
  const legacy = trimUrl(brand.logo_url);

  if (landing) {
    if (phase === "first-paint" && isAppMarkMasqueradingAsLanding(brand)) {
      return "";
    }
    return landing;
  }

  if (phase === "settled" && legacy && !app) {
    return legacy;
  }

  return "";
}

/**
 * Merge rules for surface logos. Do not copy legacy `logo_url` onto Landing
 * when any per-surface field exists — that is how the App mark leaked onto
 * the public page.
 */
export function mergeBrandSurfaceLogos(input: PublicLandingBrandLogos | null | undefined): {
  logo_url: string;
  logo_url_landing: string;
  logo_url_auth: string;
  logo_url_app: string;
} {
  const brand = input ?? {};
  const legacy = typeof brand.logo_url === "string" ? brand.logo_url : "";
  const hasLanding = typeof brand.logo_url_landing === "string";
  const hasAuth = typeof brand.logo_url_auth === "string";
  const hasApp = typeof brand.logo_url_app === "string";
  const trueLegacy = !hasLanding && !hasAuth && !hasApp;

  return {
    logo_url: legacy,
    logo_url_landing: hasLanding ? (brand.logo_url_landing as string) : trueLegacy ? legacy : "",
    logo_url_auth: hasAuth ? (brand.logo_url_auth as string) : trueLegacy ? legacy : "",
    logo_url_app: hasApp ? (brand.logo_url_app as string) : trueLegacy ? legacy : "",
  };
}
