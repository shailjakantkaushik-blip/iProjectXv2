/**
 * Public marketing logo — Landing surface only, never the App-shell file.
 *
 * Always return a usable landing URL or "" so the UI can show the default
 * diamond + name. Never leave the nav empty.
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

/**
 * Logo URL for public landing / contact / legal chrome.
 * Prefer `logo_url_landing`. Fall back to legacy `logo_url` only when no
 * App-shell file is configured (true single-logo setups).
 * Never use `logo_url_app`.
 */
export function resolvePublicLandingLogoUrl(
  brand: PublicLandingBrandLogos | null | undefined,
): string {
  if (!brand) return "";
  const landing = trimUrl(brand.logo_url_landing);
  if (landing) return landing;
  const app = trimUrl(brand.logo_url_app);
  const legacy = trimUrl(brand.logo_url);
  if (legacy && !app) return legacy;
  return "";
}

/**
 * Merge rules for surface logos. Do not copy legacy `logo_url` onto Landing
 * when any per-surface field exists.
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
