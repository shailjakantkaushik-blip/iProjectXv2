/** Short https landing-logo cookie so SSR can paint the real mark on return visits. */
export const LANDING_LOGO_COOKIE = "pmo_llogo";
const MAX_COOKIE_URL = 1800;
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function parseLandingLogoCookie(cookieHeader: string): string {
  if (!cookieHeader) return "";
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name !== LANDING_LOGO_COOKIE) continue;
    let value = part.slice(idx + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      return "";
    }
    return sanitizeLandingLogoCookieUrl(value);
  }
  return "";
}

export function sanitizeLandingLogoCookieUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  const u = url.trim();
  if (!u || u.length > MAX_COOKIE_URL) return "";
  if (u.startsWith("data:")) return "";
  if (!/^https?:\/\//i.test(u)) return "";
  return u;
}

export function readLandingLogoCookieBrowser(): string {
  if (typeof document === "undefined") return "";
  try {
    return parseLandingLogoCookie(document.cookie);
  } catch {
    return "";
  }
}

export function writeLandingLogoCookie(url: unknown) {
  if (typeof document === "undefined") return;
  const safe = sanitizeLandingLogoCookieUrl(url);
  try {
    if (!safe) {
      document.cookie = `${LANDING_LOGO_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
      return;
    }
    document.cookie = `${LANDING_LOGO_COOKIE}=${encodeURIComponent(safe)}; Path=/; Max-Age=${MAX_AGE_SEC}; SameSite=Lax`;
  } catch {
    /* private / cookie blocked */
  }
}
