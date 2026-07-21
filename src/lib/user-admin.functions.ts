import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AssignableRole = z.enum(["admin", "org_admin", "bu_lead", "pm", "executive"]);

type DirUser = {
  id: string;
  email: string;
  full_name: string | null;
  org_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  roles: string[];
  created_at?: string | null;
};

type DirOrg = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  users: DirUser[];
};

async function loadCallerRoles(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role,org_id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []) as { role: string; org_id: string | null }[];
}

async function assertPlatformAdmin(supabase: any, userId: string) {
  const roles = await loadCallerRoles(supabase, userId);
  if (!roles.some((r) => r.role === "platform_admin")) {
    throw new Error("Forbidden: platform_admin only");
  }
}

async function assertOrgAdminForOrg(supabase: any, userId: string, orgId: string) {
  const roles = await loadCallerRoles(supabase, userId);
  if (roles.some((r) => r.role === "platform_admin")) return { platform: true as const };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (profile?.org_id !== orgId) throw new Error("Forbidden: not a member of this organisation");

  const ok = roles.some(
    (r) =>
      (r.role === "admin" || r.role === "org_admin") &&
      (r.org_id === orgId || r.org_id == null),
  );
  if (!ok) throw new Error("Forbidden: org admin only");
  return { platform: false as const };
}

async function assertCanManageUser(
  supabase: any,
  supabaseAdmin: any,
  actorId: string,
  targetUserId: string,
) {
  if (actorId === targetUserId) {
    throw new Error("You cannot change or delete your own account here");
  }

  const roles = await loadCallerRoles(supabase, actorId);
  const isPlatform = roles.some((r) => r.role === "platform_admin");

  const { data: target, error } = await supabaseAdmin
    .from("profiles")
    .select("id,org_id,email,full_name,is_active")
    .eq("id", targetUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!target) throw new Error("User not found");

  const { data: targetRoles } = await supabaseAdmin
    .from("user_roles")
    .select("role,org_id")
    .eq("user_id", targetUserId);
  const targetRoleList = (targetRoles ?? []).map((r: any) => String(r.role));

  if (isPlatform) {
    return { target, targetRoleList, platform: true as const };
  }

  // Org admin: same org only; cannot manage platform_admin
  if (targetRoleList.includes("platform_admin")) {
    throw new Error("Forbidden: cannot manage platform administrators");
  }

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", actorId)
    .maybeSingle();
  if (!actorProfile?.org_id || actorProfile.org_id !== target.org_id) {
    throw new Error("Forbidden: user is not in your organisation");
  }

  const ok = roles.some(
    (r) =>
      (r.role === "admin" || r.role === "org_admin") &&
      (r.org_id === actorProfile.org_id || r.org_id == null),
  );
  if (!ok) throw new Error("Forbidden: org admin only");

  return { target, targetRoleList, platform: false as const };
}

async function fetchUsersForOrgs(supabaseAdmin: any, orgIds: string[]): Promise<DirUser[]> {
  if (!orgIds.length) return [];
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id,email,full_name,org_id,is_active,must_change_password,created_at")
    .in("org_id", orgIds)
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);

  const userIds = (profiles ?? []).map((p: any) => p.id);
  let roleRows: { user_id: string; role: string; org_id: string }[] = [];
  if (userIds.length) {
    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id,role,org_id")
      .in("user_id", userIds);
    if (rErr) throw new Error(rErr.message);
    roleRows = (roles ?? []) as any;
  }

  const byUser = new Map<string, string[]>();
  for (const r of roleRows) {
    const list = byUser.get(r.user_id) ?? [];
    if (!list.includes(r.role)) list.push(r.role);
    byUser.set(r.user_id, list);
  }

  return (profiles ?? []).map((p: any) => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    org_id: p.org_id,
    is_active: p.is_active !== false,
    must_change_password: !!p.must_change_password,
    roles: byUser.get(p.id) ?? [],
    created_at: p.created_at ?? null,
  }));
}

async function provisionUser(
  supabaseAdmin: any,
  data: {
    email: string;
    full_name: string;
    org_id: string;
    role: z.infer<typeof AssignableRole>;
    default_password: string;
  },
) {
  const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
    email: data.email,
    password: data.default_password,
    email_confirm: true,
    user_metadata: { full_name: data.full_name },
  });
  let userId = created?.user?.id as string | undefined;
  if (cErr && !userId) {
    if (!/already/i.test(cErr.message)) throw new Error(cErr.message);
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find((u: any) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (!found) throw new Error(cErr.message);
    userId = found.id;
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.default_password,
      ban_duration: "none",
    });
  }
  if (!userId) throw new Error("Failed to create user");

  const { error: pErr } = await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      email: data.email,
      full_name: data.full_name,
      org_id: data.org_id,
      must_change_password: true,
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (pErr) throw new Error(pErr.message);

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
    if (rErr && !/duplicate|unique/i.test(rErr.message)) throw new Error(rErr.message);
  }

  return { user_id: userId };
}

/** Platform: all organisations with their users + roles */
export const listAllOrgsDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DirOrg[]> => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: orgs, error } = await supabaseAdmin
      .from("organizations")
      .select("id,name,slug,plan")
      .order("name");
    if (error) throw new Error(error.message);

    const orgList = orgs ?? [];
    const users = await fetchUsersForOrgs(
      supabaseAdmin,
      orgList.map((o: any) => o.id),
    );
    const byOrg = new Map<string, DirUser[]>();
    for (const u of users) {
      if (!u.org_id) continue;
      const list = byOrg.get(u.org_id) ?? [];
      list.push(u);
      byOrg.set(u.org_id, list);
    }

    return orgList.map((o: any) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      plan: o.plan,
      users: byOrg.get(o.id) ?? [],
    }));
  });

/** Org admin: users in the caller's organisation */
export const listMyOrgUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ org: { id: string; name: string }; users: DirUser[] }> => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("org_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile?.org_id) throw new Error("No organisation");

    await assertOrgAdminForOrg(context.supabase, context.userId, profile.org_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: org, error: oErr } = await supabaseAdmin
      .from("organizations")
      .select("id,name")
      .eq("id", profile.org_id)
      .single();
    if (oErr) throw new Error(oErr.message);

    const users = await fetchUsersForOrgs(supabaseAdmin, [profile.org_id]);
    return { org: { id: org.id, name: org.name }, users };
  });

export const adminSetUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ user_id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanManageUser(context.supabase, supabaseAdmin, context.userId, data.user_id);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.is_active })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);

    // Ban / unban in Auth so sessions cannot continue when inactive
    const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.is_active ? "none" : "876000h",
    });
    if (aErr) throw new Error(aErr.message);

    return { ok: true, is_active: data.is_active };
  });

/** Permanent delete — platform_admin only (org admins may deactivate). */
export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanManageUser(
      context.supabase,
      supabaseAdmin,
      context.userId,
      data.user_id,
    );

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminAssignUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        org_id: z.string().uuid(),
        role: AssignableRole,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanManageUser(context.supabase, supabaseAdmin, context.userId, data.user_id);
    await assertOrgAdminForOrg(context.supabase, context.userId, data.org_id);

    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", data.user_id)
      .eq("org_id", data.org_id)
      .eq("role", data.role)
      .is("bu_id", null)
      .maybeSingle();
    if (existing) return { ok: true };

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, org_id: data.org_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRemoveUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        org_id: z.string().uuid(),
        role: AssignableRole,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanManageUser(context.supabase, supabaseAdmin, context.userId, data.user_id);

    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("org_id", data.org_id)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Org admin creates a user in their own organisation */
export const orgAdminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().email(),
        full_name: z.string().min(1),
        role: AssignableRole,
        default_password: z.string().min(8),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("org_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile?.org_id) throw new Error("No organisation");

    await assertOrgAdminForOrg(context.supabase, context.userId, profile.org_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    return provisionUser(supabaseAdmin, {
      email: data.email,
      full_name: data.full_name,
      org_id: profile.org_id,
      role: data.role,
      default_password: data.default_password,
    });
  });

// Re-export helpers used by platform-admin create path
export { provisionUser, assertPlatformAdmin };
