import {
  parseLiveLogoSurface,
  readFallbackLogoBytes,
  resolveLiveLandingLogo,
  type LiveLogoSurface,
} from "@/lib/live-landing-logo.server";

const PACKAGED = "/brand/iprojectx-mark.webp";

/** Edge/browser cache for the static-looking /brand/*.webp files. */
const BRAND_CACHE = "public, max-age=600, s-maxage=86400, stale-while-revalidate=604800";
/** Checkpoint API keeps the previous shorter browser cache. */
const CHECKPOINT_CACHE = "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";

function packagedRedirect() {
  return new Response(null, {
    status: 302,
    headers: { Location: PACKAGED, "Cache-Control": "public, max-age=5" },
  });
}

async function proxyHttps(url: string, cache: string): Promise<Response> {
  try {
    const upstream = await Promise.race([
      fetch(url, { redirect: "follow" }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("logo proxy timeout")), 2500);
      }),
    ]);
    if (!upstream.ok) {
      return new Response(null, {
        status: 302,
        headers: { Location: url, "Cache-Control": cache },
      });
    }
    const type = upstream.headers.get("content-type") || "image/webp";
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      headers: { "Content-Type": type, "Cache-Control": cache },
    });
  } catch {
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": cache },
    });
  }
}

/**
 * Serve the configured public mark as a normal image response.
 * `proxyHttps` makes `/brand/*.webp` a real file (no extra 302 hop).
 * The checkpoint API keeps 302-to-CDN behaviour.
 */
export async function servePublicBrandLogo(
  surface: LiveLogoSurface,
  opts: { proxyHttps?: boolean; cache?: "brand" | "checkpoint" } = {},
): Promise<Response> {
  const cache = opts.cache === "checkpoint" ? CHECKPOINT_CACHE : BRAND_CACHE;
  try {
    const resolved = await resolveLiveLandingLogo(surface);
    if (resolved.kind === "redirect") {
      if (opts.proxyHttps) return proxyHttps(resolved.url, cache);
      return new Response(null, {
        status: 302,
        headers: { Location: resolved.url, "Cache-Control": cache },
      });
    }
    if (resolved.kind === "bytes") {
      return new Response(Buffer.from(resolved.body), {
        headers: { "Content-Type": resolved.type, "Cache-Control": cache },
      });
    }
    try {
      const body = await readFallbackLogoBytes();
      return new Response(Buffer.from(body), {
        headers: { "Content-Type": resolved.type, "Cache-Control": "public, max-age=5" },
      });
    } catch {
      return packagedRedirect();
    }
  } catch {
    return packagedRedirect();
  }
}

export function brandSurfaceFromRequest(url: string): LiveLogoSurface {
  return parseLiveLogoSurface(new URL(url).searchParams.get("surface"));
}
