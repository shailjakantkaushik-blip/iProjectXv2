/** Packaged iProjectX mark — last-resort static file, not the first-paint src. */
export const PACKAGED_PUBLIC_MARK_HREF = "/brand/iprojectx-mark.webp";

/**
 * Previous runtime lookup (DB on cache miss). Kept so we can roll back first-paint
 * to this URL and so live smoke still checks it.
 */
export const CHECKPOINT_PUBLIC_LANDING_LOGO_HREF = "/api/public/landing-logo";
export const CHECKPOINT_PUBLIC_AUTH_LOGO_HREF = "/api/public/landing-logo?surface=auth";

/**
 * Same-origin files the first HTML can load. The browser starts these during
 * parse. Do not later swap this src to a config data URL — that is the
 * packaged→current flicker and the Safari-unsafe inline.
 */
export const PUBLIC_LANDING_LOGO_HREF = "/brand/landing.webp";

/** Sign-in / MFA / reset. Reads Landing-config Auth logo. */
export const PUBLIC_AUTH_LOGO_HREF = "/brand/auth.webp";

/** Configured URL when present, otherwise the packaged mark (never empty). */
export function visiblePublicLogoUrl(url?: string | null): string {
  const trimmed = typeof url === "string" ? url.trim() : "";
  return trimmed || PACKAGED_PUBLIC_MARK_HREF;
}
