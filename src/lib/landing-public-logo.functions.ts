import { createServerFn } from "@tanstack/react-start";

/**
 * Cookie-only. Never waits on Supabase — first HTML TTFB stays short.
 * Returns an https CDN URL on repeat visits, otherwise "".
 */
export const peekDocumentLandingLogoUrl = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => {
    const { readLandingLogoCookieFromRequest } = await import("@/lib/landing-logo-cookie.server");
    return readLandingLogoCookieFromRequest();
  },
);

export const peekDocumentAuthLogoUrl = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => {
    const { readAuthLogoCookieFromRequest } = await import("@/lib/landing-logo-cookie.server");
    return readAuthLogoCookieFromRequest();
  },
);

/**
 * https landing-logo URL for the first HTML document.
 * Cookie (repeat visit) first, then a short DB read. Client stubs never
 * import `@tanstack/react-start/server`.
 */
export const resolveDocumentLandingLogoUrl = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => {
    const { readLandingLogoCookieFromRequest } = await import("@/lib/landing-logo-cookie.server");
    const cookie = await readLandingLogoCookieFromRequest();
    if (cookie) return cookie;
    const { fetchPublicLandingLogoUrl } = await import("@/lib/fetch-landing-logo.server");
    return fetchPublicLandingLogoUrl();
  },
);

/** Configured landing mark size for the first HTML. Cookie, then a slim DB read. */
export const resolveDocumentLandingLogoDims = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ heightPx: number; maxWidthPx: number } | null> => {
    const { readLandingLogoSizeCookieFromRequest } = await import("@/lib/landing-logo-cookie.server");
    const cookie = await readLandingLogoSizeCookieFromRequest();
    if (cookie) return cookie;
    const { fetchPublicLandingLogoDims } = await import("@/lib/fetch-landing-logo.server");
    return fetchPublicLandingLogoDims();
  },
);
