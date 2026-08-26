import { sanitizeLandingLogoCookieUrl } from "@/lib/landing-logo-cookie";
import {
  clampLogoCustom,
  logoSizeDims,
  normalizeLogoSize,
} from "@/lib/landing-config";

export type PublicLandingLogoDims = { heightPx: number; maxWidthPx: number };

const LOGO_FETCH_MS = 500;

/**
 * Public landing logo URL only (https). Never embed data: URLs in SSR HTML —
 * those blew Safari's script budget. A half-second wait for one string is
 * safe; waiting on the full landing_config + logos was not.
 */
export async function fetchPublicLandingLogoUrl(
  timeoutMs: number = LOGO_FETCH_MS,
): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const query = supabaseAdmin
      .from("landing_config" as never)
      .select("config")
      .eq("id", "singleton")
      .maybeSingle();
    const { data } = await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("landing logo timeout")), timeoutMs);
      }),
    ]);
    const brand = (data as { config?: { brand?: Record<string, unknown> } } | null)?.config?.brand;
    const landing = typeof brand?.logo_url_landing === "string" ? brand.logo_url_landing : "";
    const legacy = typeof brand?.logo_url === "string" ? brand.logo_url : "";
    const app = typeof brand?.logo_url_app === "string" ? brand.logo_url_app : "";
    const candidate = landing.trim() || (!app.trim() ? legacy.trim() : "");
    return sanitizeLandingLogoCookieUrl(candidate);
  } catch {
    return "";
  }
}

function walkBrandSize(
  data: unknown,
  sizeKey: "logo_size_landing" | "logo_size_auth",
  customKey: "logo_custom_landing" | "logo_custom_auth",
): { size?: unknown; custom?: unknown } {
  if (!data || typeof data !== "object") return {};
  const o = data as Record<string, unknown>;
  if (sizeKey in o || customKey in o) {
    return { size: o[sizeKey], custom: o[customKey] };
  }
  for (const value of Object.values(o)) {
    const found = walkBrandSize(value, sizeKey, customKey);
    if (found.size != null || found.custom != null) return found;
  }
  return {};
}

/**
 * Configured landing mark size only — never the data: URL bytes.
 * Safe to wait on during document SSR so .com and .com.au paint the same size.
 */
export async function fetchPublicLandingLogoDims(
  timeoutMs: number = 800,
): Promise<PublicLandingLogoDims | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const query = supabaseAdmin
      .from("landing_config" as never)
      .select(
        "logo_size_landing:config->brand->logo_size_landing, logo_custom_landing:config->brand->logo_custom_landing",
      )
      .eq("id", "singleton")
      .maybeSingle();
    const { data } = await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("landing logo size timeout")), timeoutMs);
      }),
    ]);
    const found = walkBrandSize(data, "logo_size_landing", "logo_custom_landing");
    if (found.size == null && found.custom == null) return null;
    return logoSizeDims(normalizeLogoSize(found.size), clampLogoCustom(found.custom));
  } catch {
    return null;
  }
}

/** Configured auth / sign-in mark size — never the data: URL bytes. */
export async function fetchPublicAuthLogoDims(
  timeoutMs: number = 800,
): Promise<PublicLandingLogoDims | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const query = supabaseAdmin
      .from("landing_config" as never)
      .select(
        "logo_size_auth:config->brand->logo_size_auth, logo_custom_auth:config->brand->logo_custom_auth",
      )
      .eq("id", "singleton")
      .maybeSingle();
    const { data } = await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("auth logo size timeout")), timeoutMs);
      }),
    ]);
    const found = walkBrandSize(data, "logo_size_auth", "logo_custom_auth");
    if (found.size == null && found.custom == null) return null;
    return logoSizeDims(normalizeLogoSize(found.size), clampLogoCustom(found.custom));
  } catch {
    return null;
  }
}
