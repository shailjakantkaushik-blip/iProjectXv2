import { createFileRoute } from "@tanstack/react-router";
import { brandSurfaceFromRequest, servePublicBrandLogo } from "@/lib/serve-public-brand-logo";

const PACKAGED = "/brand/iprojectx-mark.webp";

function packagedRedirect() {
  return new Response(null, {
    status: 302,
    headers: { Location: PACKAGED, "Cache-Control": "public, max-age=5" },
  });
}

/**
 * Checkpoint: previous public logo lookup.
 * Landing and login first-paint now use `/brand/landing.webp` and `/brand/auth.webp`.
 * Keep this URL so live smoke / commercial checks can still hit the old path.
 *
 * `?surface=auth` serves Platform → Landing → Auth logo; default is Landing.
 */
export const Route = createFileRoute("/api/public/landing-logo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await servePublicBrandLogo(brandSurfaceFromRequest(request.url), {
            cache: "checkpoint",
          });
        } catch {
          return packagedRedirect();
        }
      },
    },
  },
});
