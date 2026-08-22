/** Packaged iProjectX mark — last-resort static file, not the first-paint src. */
export const PACKAGED_PUBLIC_MARK_HREF = "/brand/iprojectx-mark.webp";

/**
 * Same-origin logo the first HTML can load. The browser starts this image
 * during parse. Do not later swap this src to a config URL — that is the
 * packaged→current flicker.
 */
export const PUBLIC_LANDING_LOGO_HREF = "/api/public/landing-logo";

/** Sign-in / MFA / reset. Reads Landing-config Auth logo. */
export const PUBLIC_AUTH_LOGO_HREF = "/api/public/landing-logo?surface=auth";

/** Configured URL when present, otherwise the packaged mark (never empty). */
export function visiblePublicLogoUrl(url?: string | null): string {
  const trimmed = typeof url === "string" ? url.trim() : "";
  return trimmed || PACKAGED_PUBLIC_MARK_HREF;
}
