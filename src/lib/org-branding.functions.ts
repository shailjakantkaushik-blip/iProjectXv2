import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getOrgBranding = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("organizations")
      .select("name, slug, brand_name, logo_url")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) return null;
    if (!row) return null;
    return {
      name: (row.brand_name || row.name) as string,
      slug: row.slug as string,
      logo_url: (row.logo_url || "") as string,
    };
  });
