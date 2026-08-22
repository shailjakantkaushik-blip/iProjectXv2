/** Packaged iProjectX mark. Always a real static file on Vercel. */
export const PUBLIC_LANDING_LOGO_HREF = "/brand/iprojectx-mark.webp";
export const PUBLIC_AUTH_LOGO_HREF = "/brand/iprojectx-mark.webp";

/** Configured URL when present, otherwise the packaged mark (never empty). */
export function visiblePublicLogoUrl(url?: string | null): string {
  const trimmed = typeof url === "string" ? url.trim() : "";
  return trimmed || PUBLIC_LANDING_LOGO_HREF;
}
