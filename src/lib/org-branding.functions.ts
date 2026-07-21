import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  clampLogoCustom,
  normalizeLogoSize,
  type LogoCustomDims,
  type LogoDisplaySize,
} from "@/lib/landing-config";

export type OrgWhiteLabelBranding = {
  name: string;
  slug: string;
  logo_url: string;
  logo_size_auth: LogoDisplaySize;
  logo_custom_auth: LogoCustomDims;
  logo_size_app: LogoDisplaySize;
  logo_custom_app: LogoCustomDims;
};

function readOrgLogoSizing(uiConfig: unknown): Pick<
  OrgWhiteLabelBranding,
  "logo_size_auth" | "logo_custom_auth" | "logo_size_app" | "logo_custom_app"
> {
  const branding =
    uiConfig && typeof uiConfig === "object"
      ? ((uiConfig as Record<string, unknown>).branding as Record<string, unknown> | undefined)
      : undefined;
  return {
    logo_size_auth: normalizeLogoSize(branding?.logo_size_auth, "lg"),
    logo_custom_auth: clampLogoCustom(branding?.logo_custom_auth, {
      heightPx: 48,
      maxWidthPx: 220,
    }),
    logo_size_app: normalizeLogoSize(branding?.logo_size_app, "md"),
    logo_custom_app: clampLogoCustom(branding?.logo_custom_app, {
      heightPx: 32,
      maxWidthPx: 160,
    }),
  };
}

export const getOrgBranding = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }): Promise<OrgWhiteLabelBranding | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("organizations")
      .select("name, slug, brand_name, logo_url, ui_config")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) return null;
    if (!row) return null;
    const sizing = readOrgLogoSizing(row.ui_config);
    return {
      name: (row.brand_name || row.name) as string,
      slug: row.slug as string,
      logo_url: (row.logo_url || "") as string,
      ...sizing,
    };
  });

export type OrgAuthMembershipResult =
  | { allowed: true; orgName: string; orgSlug: string }
  | { allowed: false; message: string };

/**
 * After password sign-in on an org white-label link (?org=slug), verify the
 * authenticated user belongs to that organisation (profile.org_id or a role
 * row for that org). Callers must sign the user out when allowed is false.
 */
export const assertUserBelongsToOrgSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ slug: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data, context }): Promise<OrgAuthMembershipResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const slug = data.slug.trim();
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organizations")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();
    if (orgErr) {
      return { allowed: false, message: "Could not verify organisation membership. Try again." };
    }
    if (!org) {
      return { allowed: false, message: "Organisation not found for this sign-in link." };
    }

    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("org_id, is_active")
      .eq("id", context.userId)
      .maybeSingle();
    if (profErr) {
      return { allowed: false, message: "Could not verify organisation membership. Try again." };
    }
    if (profile?.is_active === false) {
      return {
        allowed: false,
        message: "This account is deactivated. Contact your administrator.",
      };
    }

    if (profile?.org_id === org.id) {
      return { allowed: true, orgName: org.name as string, orgSlug: org.slug as string };
    }

    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("org_id", org.id)
      .limit(1);
    if (roleErr) {
      return { allowed: false, message: "Could not verify organisation membership. Try again." };
    }
    if ((roleRows ?? []).length > 0) {
      return { allowed: true, orgName: org.name as string, orgSlug: org.slug as string };
    }

    return {
      allowed: false,
      message: `This sign-in link is only for members of ${org.name}. Use your organisation’s link, or the general sign-in page.`,
    };
  });
