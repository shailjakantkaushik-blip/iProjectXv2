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

    const { writeSecurityEvent } = await import("@/lib/security-audit");
    await writeSecurityEvent({
      orgId: org.id,
      actorUserId: context.userId,
      eventType: "org_create",
      entityType: "organizations",
      entityId: org.id,
      summary: `Created organisation ${org.name}`,
      meta: { slug: org.slug },
    });

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
    return provisionUser(supabaseAdmin, data, context.userId);
  });

/**
 * Forced password change — sets the new password server-side and clears the flag.
 * Replaces the old clear-only endpoint (which could skip the actual password update).
 */
export const completeForcedPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        password: z.string().min(8).max(128),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.password,
    });
    if (authErr) throw new Error(authErr.message);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("org_id")
      .eq("id", context.userId)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    const { writeSecurityEvent } = await import("@/lib/security-audit");
    await writeSecurityEvent({
      orgId: profile?.org_id,
      actorUserId: context.userId,
      eventType: "password_change",
      entityType: "profiles",
      entityId: context.userId,
      summary: "Forced password change completed",
    });

    return { ok: true };
  });

