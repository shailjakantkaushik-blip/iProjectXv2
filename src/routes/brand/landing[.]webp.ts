import { createFileRoute } from "@tanstack/react-router";
import { servePublicBrandLogo } from "@/lib/serve-public-brand-logo";

/**
 * Platform landing mark as a normal same-origin file.
 * The previous `/api/public/landing-logo` lookup stays as a checkpoint.
 */
export const Route = createFileRoute("/brand/landing.webp")({
  server: {
    handlers: {
      GET: async () => servePublicBrandLogo("landing", { proxyHttps: true, cache: "brand" }),
    },
  },
});
