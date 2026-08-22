export type LiveLogoSurface = "landing" | "auth";

export function parseLiveLogoSurface(raw: string | null | undefined): LiveLogoSurface {
  return raw === "auth" ? "auth" : "landing";
}

/**
 * Pick the configured file for a public surface.
 * Never use the App-shell file (`logo_url_app`).
 * Auth prefers `logo_url_auth`, then the Landing file, then true-legacy `logo_url`.
 */
export function pickLiveLogoCandidate(
  brand: Record<string, unknown> | undefined,
  surface: LiveLogoSurface,
): string {
  const landing = typeof brand?.logo_url_landing === "string" ? brand.logo_url_landing.trim() : "";
  const auth = typeof brand?.logo_url_auth === "string" ? brand.logo_url_auth.trim() : "";
  const legacy = typeof brand?.logo_url === "string" ? brand.logo_url.trim() : "";
  if (surface === "auth") {
    return auth || landing || legacy;
  }
  return landing || legacy || auth;
}

export function parseDataImageUrl(
  url: string,
): { type: string; bytes: Uint8Array } | null {
  const u = url.trim();
  const m = /^data:(image\/[a-zA-Z0-9.+-]+)(;charset=[^;,]+)?(;base64)?,([\s\S]+)$/.exec(u);
  if (!m) return null;
  const type = m[1].toLowerCase();
  if (type.includes("svg")) return null;
  const isB64 = Boolean(m[3]);
  const payload = (m[4] ?? "").replace(/\s/g, "");
  // Stored landing logos can sit near the 550KB data-URL cap; allow the
  // decoded payload a little more room so first-paint does not fall back.
  if (!payload || payload.length > 2_000_000) return null;
  try {
    if (isB64) {
      const buf = Buffer.from(payload, "base64");
      if (!buf.length) return null;
      return { type, bytes: new Uint8Array(buf) };
    }
    const decoded = decodeURIComponent(payload);
    return { type, bytes: new Uint8Array(Buffer.from(decoded, "utf8")) };
  } catch {
    return null;
  }
}
