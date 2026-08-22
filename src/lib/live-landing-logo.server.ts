import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sanitizeLandingLogoCookieUrl } from "@/lib/landing-logo-cookie";
import {
  parseDataImageUrl,
  pickLiveLogoCandidate,
  type LiveLogoSurface,
} from "@/lib/live-landing-logo-parse";

export { parseDataImageUrl, parseLiveLogoSurface, pickLiveLogoCandidate } from "@/lib/live-landing-logo-parse";
export type { LiveLogoSurface };

export type LiveLandingLogo =
  | { kind: "redirect"; url: string }
  | { kind: "bytes"; type: string; body: Uint8Array }
  | { kind: "file"; path: string; type: string };

const CACHE_MS = 30_000;
const FALLBACK_FILE = join(process.cwd(), "public/brand/iprojectx-mark.webp");
const FETCH_MS = 800;

const cache = new Map<LiveLogoSurface, { at: number; value: LiveLandingLogo }>();

function fallbackFile(): LiveLandingLogo {
  return { kind: "file", path: FALLBACK_FILE, type: "image/webp" };
}

function fromBrand(
  brand: Record<string, unknown> | undefined,
  surface: LiveLogoSurface,
): LiveLandingLogo {
  const candidate = pickLiveLogoCandidate(brand, surface);
  if (!candidate) return fallbackFile();

  const https = sanitizeLandingLogoCookieUrl(candidate);
  if (https) return { kind: "redirect", url: https };

  if (candidate.startsWith("data:image/")) {
    const parsed = parseDataImageUrl(candidate);
    if (parsed) return { kind: "bytes", type: parsed.type, body: parsed.bytes };
  }
  return fallbackFile();
}

export async function resolveLiveLandingLogo(
  surface: LiveLogoSurface = "landing",
): Promise<LiveLandingLogo> {
  const hit = cache.get(surface);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
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
    const value = fromBrand(brand, surface);
    cache.set(surface, { at: Date.now(), value });
    return value;
  } catch {
    const value = fallbackFile();
    cache.set(surface, { at: Date.now(), value });
    return value;
  }
}

export async function readFallbackLogoBytes(): Promise<Uint8Array> {
  const buf = await readFile(FALLBACK_FILE);
  return new Uint8Array(buf);
}

export function invalidateLiveLandingLogoCache() {
  cache.clear();
}
