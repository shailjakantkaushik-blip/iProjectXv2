/**
 * Tenant RAID / document CRUD via resolveOrgDataClient (platform or BYOD).
 * Prefer these on BYOD-active orgs so residency claims hold for browser CRUD.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveOrgDataClient } from "@/lib/byod.server";

async function assertOrgMember(userClient: any, userId: string, orgId: string) {
  const { data: profile } = await userClient
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();
  if ((profile as { org_id?: string } | null)?.org_id !== orgId) {
    throw new Error("Organisation mismatch");
  }
}

const orgSchema = z.object({ orgId: z.string().uuid() });

export const listOrgRisks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { client, mode } = await resolveOrgDataClient(data.orgId);
    const { data: rows, error } = await client
      .from("risks")
      .select("*")
      .eq("org_id", data.orgId)
      .order("severity", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], mode };
  });

export const upsertOrgRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orgId: z.string().uuid(),
        id: z.string().uuid().optional().nullable(),
        patch: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { client, mode } = await resolveOrgDataClient(data.orgId);
    const patch = { ...data.patch, org_id: data.orgId };
    if (data.id) {
      const { data: row, error } = await client
        .from("risks")
        .update(patch as never)
        .eq("id", data.id)
        .eq("org_id", data.orgId)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { row, mode };
    }
    const { data: row, error } = await client
      .from("risks")
      .insert(patch as never)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { row, mode };
  });

export const deleteOrgRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ orgId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { client, mode } = await resolveOrgDataClient(data.orgId);
    const { error } = await client
      .from("risks")
      .delete()
      .eq("id", data.id)
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    return { ok: true, mode };
  });

export const listOrgIssues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { client, mode } = await resolveOrgDataClient(data.orgId);
    const { data: rows, error } = await client
      .from("issues")
      .select("*")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], mode };
  });

export const upsertOrgIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orgId: z.string().uuid(),
        id: z.string().uuid().optional().nullable(),
        patch: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { client, mode } = await resolveOrgDataClient(data.orgId);
    const patch = { ...data.patch, org_id: data.orgId };
    if (data.id) {
      const { data: row, error } = await client
        .from("issues")
        .update(patch as never)
        .eq("id", data.id)
        .eq("org_id", data.orgId)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { row, mode };
    }
    const { data: row, error } = await client
      .from("issues")
      .insert(patch as never)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { row, mode };
  });

export const deleteOrgIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ orgId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { client, mode } = await resolveOrgDataClient(data.orgId);
    const { error } = await client
      .from("issues")
      .delete()
      .eq("id", data.id)
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    return { ok: true, mode };
  });

export const listOrgActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { client, mode } = await resolveOrgDataClient(data.orgId);
    const { data: rows, error } = await client
      .from("actions")
      .select("*")
      .eq("org_id", data.orgId)
      .order("due_date", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], mode };
  });

export const upsertOrgAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orgId: z.string().uuid(),
        id: z.string().uuid().optional().nullable(),
        patch: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { client, mode } = await resolveOrgDataClient(data.orgId);
    const patch = { ...data.patch, org_id: data.orgId };
    if (data.id) {
      const { data: row, error } = await client
        .from("actions")
        .update(patch as never)
        .eq("id", data.id)
        .eq("org_id", data.orgId)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { row, mode };
    }
    const { data: row, error } = await client
      .from("actions")
      .insert(patch as never)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { row, mode };
  });

export const deleteOrgAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ orgId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { client, mode } = await resolveOrgDataClient(data.orgId);
    const { error } = await client
      .from("actions")
      .delete()
      .eq("id", data.id)
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    return { ok: true, mode };
  });
