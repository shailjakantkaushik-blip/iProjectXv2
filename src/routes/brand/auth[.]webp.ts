import { createFileRoute } from "@tanstack/react-router";
import { servePublicBrandLogo } from "@/lib/serve-public-brand-logo";

/**
 * Platform sign-in mark as a normal same-origin file.
 * Org white-label (`?org=`) still uses that organisation's own logo_url.
 */
export const Route = createFileRoute("/brand/auth.webp")({
  server: {
    handlers: {
      GET: async () => servePublicBrandLogo("auth", { proxyHttps: true, cache: "brand" }),
    },
  },
});
