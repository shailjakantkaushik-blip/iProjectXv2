import { createServerFn } from "@tanstack/react-start";

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
