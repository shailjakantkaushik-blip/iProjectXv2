import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertPlatformAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ok = (data ?? []).some((r: any) => r.role === "platform_admin");
  if (!ok) throw new Error("Forbidden: platform_admin only");
}

export const adminCreateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().min(2),
      slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "lowercase, digits, hyphens"),
      plan: z.string().optional(),
    }).parse(d),
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
    z.object({
      email: z.string().email(),
      full_name: z.string().min(1),
      org_id: z.string().uuid(),
      role: z.enum(["admin", "org_admin", "bu_lead", "pm", "executive"]),
      default_password: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Create (or reuse) auth user
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.default_password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    let userId = created?.user?.id;
    if (cErr && !userId) {
      // If already exists, look them up
      if (!/already/i.test(cErr.message)) throw new Error(cErr.message);
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = list?.users?.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
      if (!found) throw new Error(cErr.message);
      userId = found.id;
      // Reset their password to the admin-provided default and force change
      await supabaseAdmin.auth.admin.updateUserById(userId, { password: data.default_password });
    }
    if (!userId) throw new Error("Failed to create user");

    // Upsert profile with org + must_change_password=true
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, email: data.email, full_name: data.full_name, org_id: data.org_id, must_change_password: true },
        { onConflict: "id" },
      );
    if (pErr) throw new Error(pErr.message);

    // Assign role (idempotent). Table unique key is (user_id, org_id, role, bu_id);
    // org-level roles use bu_id NULL — use a null-safe check instead of a mismatched ON CONFLICT.
    const { data: existingRole, error: findErr } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("org_id", data.org_id)
      .eq("role", data.role)
      .is("bu_id", null)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    if (!existingRole) {
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, org_id: data.org_id, role: data.role });
      if (rErr) {
        // Race: another insert may have won — treat unique violation as success
        if (!/duplicate|unique/i.test(rErr.message)) throw new Error(rErr.message);
      }
    }

    return { user_id: userId };
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
