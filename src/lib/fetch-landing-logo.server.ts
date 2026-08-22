import { sanitizeLandingLogoCookieUrl } from "@/lib/landing-logo-cookie";

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
