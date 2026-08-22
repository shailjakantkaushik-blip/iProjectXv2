/** Short https landing-logo cookie so SSR can paint the real mark on return visits. */
export const LANDING_LOGO_COOKIE = "pmo_llogo";
/** Auth / sign-in mark (may differ from landing). */
export const AUTH_LOGO_COOKIE = "pmo_alogo";
const MAX_COOKIE_URL = 1800;
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

function parseHttpsCookie(cookieHeader: string, cookieName: string): string {
  if (!cookieHeader) return "";
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name !== cookieName) continue;
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

export function parseLandingLogoCookie(cookieHeader: string): string {
  return parseHttpsCookie(cookieHeader, LANDING_LOGO_COOKIE);
}

export function parseAuthLogoCookie(cookieHeader: string): string {
  return parseHttpsCookie(cookieHeader, AUTH_LOGO_COOKIE);
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

/** Configured landing mark size so first HTML matches hydrate (no 32px→xl jump). */
export const LANDING_LOGO_SIZE_COOKIE = "pmo_lsz";

export type LandingLogoSizeCookie = { heightPx: number; maxWidthPx: number };

export function parseLandingLogoSizeCookie(cookieHeader: string): LandingLogoSizeCookie | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name !== LANDING_LOGO_SIZE_COOKIE) continue;
    let value = part.slice(idx + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
    return sanitizeLandingLogoSizeCookie(value);
  }
  return null;
}

export function sanitizeLandingLogoSizeCookie(raw: unknown): LandingLogoSizeCookie | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  const m = /^(\d{2,3})x(\d{2,3})$/.exec(text);
  if (!m) return null;
  const heightPx = Number(m[1]);
  const maxWidthPx = Number(m[2]);
  if (!Number.isFinite(heightPx) || !Number.isFinite(maxWidthPx)) return null;
  if (heightPx < 16 || heightPx > 160 || maxWidthPx < 40 || maxWidthPx > 640) return null;
  return { heightPx, maxWidthPx };
}

export function formatLandingLogoSizeCookie(dims: LandingLogoSizeCookie): string {
  return `${Math.round(dims.heightPx)}x${Math.round(dims.maxWidthPx)}`;
}

export function readLandingLogoSizeCookieBrowser(): LandingLogoSizeCookie | null {
  if (typeof document === "undefined") return null;
  try {
    return parseLandingLogoSizeCookie(document.cookie);
  } catch {
    return null;
  }
}

export function writeLandingLogoSizeCookie(dims: LandingLogoSizeCookie | null | undefined) {
  if (typeof document === "undefined") return;
  try {
    if (!dims) {
      document.cookie = `${LANDING_LOGO_SIZE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
      return;
    }
    const safe = sanitizeLandingLogoSizeCookie(formatLandingLogoSizeCookie(dims));
    if (!safe) return;
    document.cookie = `${LANDING_LOGO_SIZE_COOKIE}=${formatLandingLogoSizeCookie(safe)}; Path=/; Max-Age=${MAX_AGE_SEC}; SameSite=Lax`;
  } catch {
    /* private / cookie blocked */
  }
}

function writeHttpsLogoCookie(cookieName: string, url: unknown) {
  if (typeof document === "undefined") return;
  const safe = sanitizeLandingLogoCookieUrl(url);
  try {
    if (!safe) {
      document.cookie = `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
      return;
    }
    document.cookie = `${cookieName}=${encodeURIComponent(safe)}; Path=/; Max-Age=${MAX_AGE_SEC}; SameSite=Lax`;
  } catch {
    /* private / cookie blocked */
  }
}

export function writeLandingLogoCookie(url: unknown) {
  writeHttpsLogoCookie(LANDING_LOGO_COOKIE, url);
}

export function writeAuthLogoCookie(url: unknown) {
  writeHttpsLogoCookie(AUTH_LOGO_COOKIE, url);
}

export function readAuthLogoCookieBrowser(): string {
  if (typeof document === "undefined") return "";
  try {
    return parseAuthLogoCookie(document.cookie);
  } catch {
    return "";
  }
}
