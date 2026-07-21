import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Pretty org white-label sign-in alias.
 * Redirects to /auth?org=<slug> so AuthLayout can load org branding.
 */
export const Route = createFileRoute("/o/$slug/login")({
  beforeLoad: ({ params }) => {
    const slug = (params.slug || "").trim();
    if (!slug) {
      throw redirect({ to: "/auth" });
    }
    throw redirect({
      href: `/auth?org=${encodeURIComponent(slug)}`,
    });
  },
});
