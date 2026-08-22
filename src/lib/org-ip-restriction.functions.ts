import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OrgIpRestrictionResult } from "@/lib/org-ip-restriction.types";

export type { OrgIpRestrictionResult } from "@/lib/org-ip-restriction.types";

/**
 * After white-label membership succeeds (or on org login continue), enforce
 * that org's IP allowlist against the request client IP.
 *
 * Handler lives in a .server module so /auth never links
 * `@tanstack/react-start/server` in the browser (Safari: missing binding `t`).
 */
export const assertClientIpAllowedForOrgSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ slug: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data, context }): Promise<OrgIpRestrictionResult> => {
    const { assertClientIpAllowedForOrgSlugHandler } = await import(
      "@/lib/org-ip-restriction.server"
    );
    return assertClientIpAllowedForOrgSlugHandler({
      slug: data.slug,
      userId: context.userId,
      supabase: context.supabase as never,
    });
  });

/**
 * Enforce the authenticated user's home-org IP allowlist (general /auth and
 * authenticated app gate).
 */
export const assertClientIpAllowedForHomeOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrgIpRestrictionResult> => {
    const { assertClientIpAllowedForHomeOrgHandler } = await import(
      "@/lib/org-ip-restriction.server"
    );
    return assertClientIpAllowedForHomeOrgHandler({
      userId: context.userId,
      supabase: context.supabase as never,
    });
  });
