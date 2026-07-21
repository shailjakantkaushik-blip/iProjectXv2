import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlatformAdmin, provisionUser } from "@/lib/user-admin.functions";

export const adminCreateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(2),
        slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "lowercase, digits, hyphens"),
        plan: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .insert({ name: data.name, slug: data.slug, plan: data.plan ?? "starter" })
      .select("id,name,slug")
      .single();
    if (error) throw new Error(error.message);
    return org;
  });

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().email(),
        full_name: z.string().min(1),
        org_id: z.string().uuid(),
        role: z.enum(["admin", "org_admin", "bu_lead", "pm", "executive"]),
        default_password: z.string().min(8),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return provisionUser(supabaseAdmin, data);
  });

export const clearMustChangePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
