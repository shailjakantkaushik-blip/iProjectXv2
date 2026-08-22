import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sanitizeLandingLogoCookieUrl } from "@/lib/landing-logo-cookie";
import { parseDataImageUrl } from "@/lib/live-landing-logo-parse";

export { parseDataImageUrl };

export type LiveLandingLogo =
  | { kind: "redirect"; url: string }
  | { kind: "bytes"; type: string; body: Uint8Array }
  | { kind: "file"; path: string; type: string };

const CACHE_MS = 30_000;
const FALLBACK_FILE = join(process.cwd(), "public/brand/iprojectx-mark.webp");
const FETCH_MS = 800;

let cache: { at: number; value: LiveLandingLogo } | null = null;

function fallbackFile(): LiveLandingLogo {
  return { kind: "file", path: FALLBACK_FILE, type: "image/webp" };
}

function fromBrand(brand: Record<string, unknown> | undefined): LiveLandingLogo {
  const landing = typeof brand?.logo_url_landing === "string" ? brand.logo_url_landing.trim() : "";
  const legacy = typeof brand?.logo_url === "string" ? brand.logo_url.trim() : "";
  const app = typeof brand?.logo_url_app === "string" ? brand.logo_url_app.trim() : "";
  const candidate = landing || (!app ? legacy : "");
  if (!candidate) return fallbackFile();

  const https = sanitizeLandingLogoCookieUrl(candidate);
  if (https) return { kind: "redirect", url: https };

  if (candidate.startsWith("data:image/")) {
    const parsed = parseDataImageUrl(candidate);
    if (parsed) return { kind: "bytes", type: parsed.type, body: parsed.bytes };
  }
  return fallbackFile();
}

export async function resolveLiveLandingLogo(): Promise<LiveLandingLogo> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
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
        setTimeout(() => reject(new Error("landing logo timeout")), FETCH_MS);
      }),
    ]);
    const brand = (data as { config?: { brand?: Record<string, unknown> } } | null)?.config?.brand;
    const value = fromBrand(brand);
    cache = { at: Date.now(), value };
    return value;
  } catch {
    const value = fallbackFile();
    cache = { at: Date.now(), value };
    return value;
  }
}

export async function readFallbackLogoBytes(): Promise<Uint8Array> {
  const buf = await readFile(FALLBACK_FILE);
  return new Uint8Array(buf);
}

export function invalidateLiveLandingLogoCache() {
  cache = null;
}
