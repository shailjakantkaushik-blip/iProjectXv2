import { createFileRoute } from "@tanstack/react-router";
import {
  readFallbackLogoBytes,
  resolveLiveLandingLogo,
} from "@/lib/live-landing-logo.server";

/**
 * Browser-native landing logo. The first HTML always references this URL, so
 * the image starts loading during HTML parse — same as a professional site —
 * not after React hydrates and fetches config.
 */
export const Route = createFileRoute("/api/public/landing-logo")({
  server: {
    handlers: {
      GET: async () => {
        const resolved = await resolveLiveLandingLogo();
        const cache = "public, max-age=60, stale-while-revalidate=600";
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
            headers: { "Content-Type": resolved.type, "Cache-Control": cache },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
