import { createFileRoute } from "@tanstack/react-router";
import {
  parseLiveLogoSurface,
  readFallbackLogoBytes,
  resolveLiveLandingLogo,
} from "@/lib/live-landing-logo.server";

const PACKAGED = "/brand/iprojectx-mark.webp";

function packagedRedirect() {
  return new Response(null, {
    status: 302,
    headers: { Location: PACKAGED, "Cache-Control": "public, max-age=5" },
  });
}

/**
 * Browser-native public logo. First HTML always references this URL so the
 * configured mark starts with HTML parse — never a packaged→current swap.
 *
 * `?surface=auth` serves Platform → Landing → Auth logo; default is Landing.
 */
export const Route = createFileRoute("/api/public/landing-logo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const surface = parseLiveLogoSurface(new URL(request.url).searchParams.get("surface"));
          const resolved = await resolveLiveLandingLogo(surface);
          const cache = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
          if (resolved.kind === "redirect") {
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
      },
    },
  },
});
