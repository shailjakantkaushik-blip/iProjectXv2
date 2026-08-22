import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  canDeleteOrgRole,
  clampRoleSortOrder,
  isReservedRoleKey,
  normalizeRoleLabel,
  validateRoleKey,
} from "@/lib/org-role-admin";
import type { OrgRole } from "@/lib/org-roles";

export type OrgRoleAdminRow = OrgRole & { assigned_users: number };

export type RoleAdminOrg = { id: string; name: string; slug: string };

async function loadCallerRoles(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role,org_id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []) as { role: string; org_id: string | null }[];
}

async function assertCanManageOrgRoles(supabase: any, userId: string, orgId: string) {
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
  if (!ok) throw new Error("Forbidden: org admin or platform admin only");
  return { platform: false as const };
}

async function loadOrg(supabaseAdmin: any, orgId: string): Promise<RoleAdminOrg> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id,name,slug")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Organisation not found");
  return data as RoleAdminOrg;
}

async function countAssignments(supabaseAdmin: any, orgId: string, roleKeys: string[]) {
  const counts = new Map<string, number>();
  for (const key of roleKeys) counts.set(key, 0);
  if (!roleKeys.length) return counts;

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("org_id", orgId)
    .in("role", roleKeys);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const key = String((row as { role: string }).role);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

async function listRolesForOrg(supabaseAdmin: any, orgId: string): Promise<OrgRoleAdminRow[]> {
  const { data, error } = await supabaseAdmin
    .from("org_roles" as any)
    .select("id,org_id,role_key,label,description,is_system,sort_order")
    .eq("org_id", orgId)
    .order("sort_order")
    .order("label");
  if (error) throw new Error(error.message);
  const roles = (data ?? []) as OrgRole[];
  const counts = await countAssignments(
    supabaseAdmin,
    orgId,
    roles.map((r) => r.role_key),
  );
  return roles
    .filter((r) => r.role_key !== "platform_admin")
    .map((r) => ({ ...r, assigned_users: counts.get(r.role_key) ?? 0 }));
}

async function copyRolePermissions(
  supabaseAdmin: any,
  orgId: string,
  fromRoleKey: string,
  toRoleKey: string,
) {
  const { data: src, error } = await supabaseAdmin
    .from("role_table_permissions")
    .select("table_name,can_view,can_edit,can_other")
    .eq("org_id", orgId)
    .eq("role", fromRoleKey);
  if (error) throw new Error(error.message);
  const rows = src ?? [];
  if (!rows.length) return 0;
  const { error: insErr } = await supabaseAdmin.from("role_table_permissions").insert(
    rows.map((r: { table_name: string; can_view: boolean; can_edit: boolean; can_other?: boolean }) => ({
      org_id: orgId,
      role: toRoleKey,
      table_name: r.table_name,
      can_view: r.can_view,
      can_edit: r.can_edit,
      can_other: !!r.can_other,
    })),
  );
  if (insErr) throw new Error(insErr.message);
  return rows.length;
}

export const listOrgsForRoleAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ orgs: RoleAdminOrg[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const roles = await loadCallerRoles(context.supabase, context.userId);
    if (roles.some((r) => r.role === "platform_admin")) {
      const { data, error } = await supabaseAdmin
        .from("organizations")
        .select("id,name,slug")
        .order("name");
      if (error) throw new Error(error.message);
      return { orgs: (data ?? []) as RoleAdminOrg[] };
    }

    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("org_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile?.org_id) throw new Error("No organisation");
    await assertCanManageOrgRoles(context.supabase, context.userId, profile.org_id);
    const org = await loadOrg(supabaseAdmin, profile.org_id);
    return { orgs: [org] };
  });

export const listOrgRolesForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ org_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ org: RoleAdminOrg; roles: OrgRoleAdminRow[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanManageOrgRoles(context.supabase, context.userId, data.org_id);
    const org = await loadOrg(supabaseAdmin, data.org_id);
    const roles = await listRolesForOrg(supabaseAdmin, data.org_id);
    return { org, roles };
  });

export const createOrgRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        org_id: z.string().uuid(),
        role_key: z.string().min(1).max(80),
        label: z.string().max(80).optional().default(""),
        description: z.string().max(500).optional().nullable(),
        sort_order: z.number().int().min(0).max(9999).optional(),
        copy_from_role_key: z.string().max(64).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanManageOrgRoles(context.supabase, context.userId, data.org_id);

    const parsed = validateRoleKey(data.role_key);
    if (!parsed.ok) throw new Error(parsed.error);
    const roleKey = parsed.key;
    const label = normalizeRoleLabel(data.label ?? "", roleKey);
    const sortOrder = clampRoleSortOrder(data.sort_order, 200);
    const description = data.description?.trim() || null;

    const { data: existing } = await supabaseAdmin
      .from("org_roles" as any)
      .select("id")
      .eq("org_id", data.org_id)
      .eq("role_key", roleKey)
      .maybeSingle();
    if (existing) throw new Error(`A role with key “${roleKey}” already exists`);

    const { data: created, error } = await supabaseAdmin
      .from("org_roles" as any)
      .insert({
        org_id: data.org_id,
        role_key: roleKey,
        label,
        description,
        is_system: false,
        sort_order: sortOrder,
      } as never)
      .select("id,org_id,role_key,label,description,is_system,sort_order")
      .single();
    if (error) throw new Error(error.message);

    let copied = 0;
    const copyFrom = data.copy_from_role_key?.trim() || "";
    if (copyFrom && copyFrom !== roleKey && !isReservedRoleKey(copyFrom)) {
      copied = await copyRolePermissions(supabaseAdmin, data.org_id, copyFrom, roleKey);
    }

    const { writeSecurityEvent } = await import("@/lib/security-audit");
    await writeSecurityEvent({
      orgId: data.org_id,
      actorUserId: context.userId,
      eventType: "admin_action",
      entityType: "org_roles",
      entityId: created.id,
      summary: `Created role ${roleKey}`,
      meta: { role_key: roleKey, copied_permissions: copied, copy_from: copyFrom || null },
    });

    return { role: created as OrgRole, copied_permissions: copied };
  });

export const updateOrgRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        org_id: z.string().uuid(),
        role_id: z.string().uuid(),
        label: z.string().min(1).max(80),
        description: z.string().max(500).optional().nullable(),
        sort_order: z.number().int().min(0).max(9999).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanManageOrgRoles(context.supabase, context.userId, data.org_id);

    const { data: row, error: loadErr } = await supabaseAdmin
      .from("org_roles" as any)
      .select("id,org_id,role_key,label,description,is_system,sort_order")
      .eq("id", data.role_id)
      .eq("org_id", data.org_id)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!row) throw new Error("Role not found");
    if (isReservedRoleKey(String((row as OrgRole).role_key))) {
      throw new Error("Reserved roles cannot be edited here");
    }

    const label = normalizeRoleLabel(data.label, (row as OrgRole).role_key);
    const sortOrder = clampRoleSortOrder(data.sort_order, (row as OrgRole).sort_order);
    const description = data.description?.trim() || null;

    const { data: updated, error } = await supabaseAdmin
      .from("org_roles" as any)
      .update({
        label,
        description,
        sort_order: sortOrder,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.role_id)
      .eq("org_id", data.org_id)
      .select("id,org_id,role_key,label,description,is_system,sort_order")
      .single();
    if (error) throw new Error(error.message);

    const { writeSecurityEvent } = await import("@/lib/security-audit");
    await writeSecurityEvent({
      orgId: data.org_id,
      actorUserId: context.userId,
      eventType: "admin_action",
      entityType: "org_roles",
      entityId: data.role_id,
      summary: `Updated role ${(row as OrgRole).role_key}`,
      meta: { role_key: (row as OrgRole).role_key },
    });

    return { role: updated as OrgRole };
  });

export const deleteOrgRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ org_id: z.string().uuid(), role_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanManageOrgRoles(context.supabase, context.userId, data.org_id);

    const { data: row, error: loadErr } = await supabaseAdmin
      .from("org_roles" as any)
      .select("id,org_id,role_key,label,description,is_system,sort_order")
      .eq("id", data.role_id)
      .eq("org_id", data.org_id)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!row) throw new Error("Role not found");
    const role = row as OrgRole;
    if (!canDeleteOrgRole(role)) {
      throw new Error("System roles cannot be deleted");
    }

    const { error: permErr } = await supabaseAdmin
      .from("role_table_permissions")
      .delete()
      .eq("org_id", data.org_id)
      .eq("role", role.role_key);
    if (permErr) throw new Error(permErr.message);

    const { error } = await supabaseAdmin
      .from("org_roles" as any)
      .delete()
      .eq("id", data.role_id)
      .eq("org_id", data.org_id);
    if (error) throw new Error(error.message);

    const { writeSecurityEvent } = await import("@/lib/security-audit");
    await writeSecurityEvent({
      orgId: data.org_id,
      actorUserId: context.userId,
      eventType: "admin_action",
      entityType: "org_roles",
      entityId: data.role_id,
      summary: `Deleted role ${role.role_key}`,
      meta: { role_key: role.role_key },
    });

    return { ok: true, role_key: role.role_key };
  });
