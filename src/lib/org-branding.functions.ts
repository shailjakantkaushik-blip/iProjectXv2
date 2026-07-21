import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
