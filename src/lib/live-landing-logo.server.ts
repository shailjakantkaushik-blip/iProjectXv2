import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { sanitizeLandingLogoCookieUrl } from "@/lib/landing-logo-cookie";
import {
  resolveSupabasePublishableKey,
  resolveSupabaseServiceRoleKey,
  resolveSupabaseUrl,
} from "@/integrations/supabase/env";
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
const PACKAGED_HREF = "/brand/iprojectx-mark.webp";
/** Image request is parallel to HTML — do not starve the configured file. */
const FETCH_MS = 8_000;

const cache = new Map<LiveLogoSurface, { at: number; value: LiveLandingLogo }>();

function fallbackFile(): LiveLandingLogo {
  return { kind: "file", path: FALLBACK_FILE, type: "image/webp" };
}

function isFallback(value: LiveLandingLogo): boolean {
  return value.kind === "file" || (value.kind === "redirect" && value.url === PACKAGED_HREF);
}

function brandFromRow(data: unknown): Record<string, unknown> | undefined {
  if (!data || typeof data !== "object") return undefined;
  const row = data as Record<string, unknown>;
  if (
    "logo_url_landing" in row ||
    "logo_url_auth" in row ||
    "logo_url" in row ||
    "logo_url_app" in row
  ) {
    return row;
  }
  if (row.brand && typeof row.brand === "object") {
    return row.brand as Record<string, unknown>;
  }
  if (row.config && typeof row.config === "object") {
    const cfg = row.config as Record<string, unknown>;
    if (cfg.brand && typeof cfg.brand === "object") {
      return cfg.brand as Record<string, unknown>;
    }
  }
  for (const value of Object.values(row)) {
    if (!value || typeof value !== "object") continue;
    const obj = value as Record<string, unknown>;
    if (
      "logo_url_landing" in obj ||
      "logo_url_auth" in obj ||
      "logo_url" in obj ||
      "logo_url_app" in obj
    ) {
      return obj;
    }
  }
  return undefined;
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

function makePublicClient() {
  const url = resolveSupabaseUrl();
  const service = resolveSupabaseServiceRoleKey();
  const anon = resolveSupabasePublishableKey();
  const key = service || anon;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readBrand(): Promise<Record<string, unknown> | undefined> {
  const client = makePublicClient();
  if (!client) return undefined;
  const slim = await client
    .from("landing_config" as never)
    .select("config->brand")
    .eq("id", "singleton")
    .maybeSingle();
  const slimBrand = brandFromRow(slim.data);
  if (slimBrand) return slimBrand;
  const full = await client
    .from("landing_config" as never)
    .select("config")
    .eq("id", "singleton")
    .maybeSingle();
  return brandFromRow(full.data);
}

export async function resolveLiveLandingLogo(
  surface: LiveLogoSurface = "landing",
): Promise<LiveLandingLogo> {
  const hit = cache.get(surface);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    const brand = await Promise.race([
      readBrand(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("landing logo timeout")), FETCH_MS);
      }),
    ]);
    const value = fromBrand(brand, surface);
    if (!isFallback(value)) cache.set(surface, { at: Date.now(), value });
    return value;
  } catch {
    return fallbackFile();
  }
}

export async function readFallbackLogoBytes(): Promise<Uint8Array> {
  const buf = await readFile(FALLBACK_FILE);
  return new Uint8Array(buf);
}

export function invalidateLiveLandingLogoCache() {
  cache.clear();
}
