import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlatformAdmin } from "@/lib/user-admin.functions";
import { PLATFORM_ORG_SLUG, isPlatformOrgRow } from "@/lib/platform-org";
import {
  previewPlatformSample,
  resetPlatformSample,
  type PlatformSamplePack,
  type SamplePreview,
  type SampleResetDb,
  type SampleResetReport,
} from "@/lib/platform-sample-reset";

function missingRelation(error: { code?: string; message?: string } | null): boolean {
  const msg = error?.message || "";
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    /could not find the table|relation .* does not exist/i.test(msg)
  );
}

function asDb(supabaseAdmin: any): SampleResetDb {
  return {
    resolvePlatformOrg: async () => {
      const { data, error } = await supabaseAdmin
        .from("organizations")
        .select("id,name,slug")
        .eq("slug", PLATFORM_ORG_SLUG)
        .limit(1);
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0] ?? null;
      if (!row || !isPlatformOrgRow(row)) return null;
      return { id: row.id, name: row.name, slug: row.slug };
    },
    countEqOrgId: async (table, orgId) => {
      if (!orgId) throw new Error("refused count without platform org id");
      const { count, error } = await supabaseAdmin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId);
      if (error) {
        if (missingRelation(error)) return 0;
        throw new Error(error.message);
      }
      return count ?? 0;
    },
    deleteEqOrgId: async (table, orgId) => {
      if (!orgId) throw new Error("refused wipe without platform org id");
      const { error } = await supabaseAdmin.from(table).delete().eq("org_id", orgId);
      if (error) throw new Error(missingRelation(error) ? error.message : `${table}: ${error.message}`);
    },
    deleteScenarioProjectsForOrg: async (orgId) => {
      if (!orgId) throw new Error("refused wipe without platform org id");
      const { data, error } = await supabaseAdmin.from("portfolio_scenarios").select("id").eq("org_id", orgId);
      if (error) {
        if (missingRelation(error)) return;
        throw new Error(error.message);
      }
      const ids = (data ?? []).map((r: { id: string }) => r.id);
      if (!ids.length) return;
      const del = await supabaseAdmin.from("scenario_projects").delete().in("scenario_id", ids);
      if (del.error && !missingRelation(del.error)) throw new Error(del.error.message);
    },
    clearGovernanceParents: async (orgId) => {
      if (!orgId) throw new Error("refused wipe without platform org id");
      const { error } = await supabaseAdmin
        .from("governance_channels")
        .update({ parent_channel_id: null })
        .eq("org_id", orgId);
      if (error && !missingRelation(error)) throw new Error(error.message);
    },
    ensureDeliveryMethods: async (orgId) => {
      if (!orgId) throw new Error("refused rpc without platform org id");
      const { error } = await supabaseAdmin.rpc("ensure_org_delivery_methods", { p_org_id: orgId });
      if (error) throw new Error(error.message);
    },
    findDeliveryMethods: async (orgId) => {
      if (!orgId) throw new Error("refused query without platform org id");
      const { data, error } = await supabaseAdmin.from("delivery_methods").select("id,name").eq("org_id", orgId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    findPlatformUser: async (orgId) => {
      if (!orgId) throw new Error("refused query without platform org id");
      const { data: admins } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "platform_admin")
        .limit(8);
      const adminIds = (admins ?? []).map((r: { user_id: string }) => r.user_id);
      if (adminIds.length) {
        const { data } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("org_id", orgId)
          .in("id", adminIds)
          .limit(1);
        if (data?.[0]?.id) return { id: data[0].id };
      }
      const { data } = await supabaseAdmin.from("profiles").select("id").eq("org_id", orgId).limit(1);
      return data?.[0]?.id ? { id: data[0].id } : null;
    },
    selectEqOrgId: async (table, columns, orgId) => {
      if (!orgId) throw new Error("refused query without platform org id");
      const { data, error } = await supabaseAdmin.from(table).select(columns).eq("org_id", orgId);
      if (error) {
        if (missingRelation(error)) return [];
        throw new Error(error.message);
      }
      return data ?? [];
    },
    updateByIdOrg: async (table, id, orgId, patch) => {
      if (!orgId) throw new Error("refused update without platform org id");
      if (!id) throw new Error("refused update without row id");
      const { error } = await supabaseAdmin.from(table).update(patch).eq("id", id).eq("org_id", orgId);
      if (error && !missingRelation(error)) throw new Error(`${table}: ${error.message}`);
    },
    insert: async (table, rows) => {
      if (!rows.length) return [];
      const inserted: Array<{ id: string }> = [];
      for (let i = 0; i < rows.length; i += 80) {
        const chunk = rows.slice(i, i + 80);
        const { data, error } = await supabaseAdmin.from(table).insert(chunk).select("id");
        if (error) {
          throw new Error(missingRelation(error) ? error.message : `${table}: ${error.message}`);
        }
        inserted.push(...((data ?? []) as Array<{ id: string }>));
      }
      return inserted;
    },
  };
}

export const previewPlatformSampleData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SamplePreview> => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return previewPlatformSample(asDb(supabaseAdmin));
  });

export const resetPlatformSampleData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        pack: z.union([z.literal(4), z.literal(10), z.literal(16)]),
        confirm: z.string().min(1).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<SampleResetReport> => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return resetPlatformSample(asDb(supabaseAdmin), {
      pack: data.pack as PlatformSamplePack,
      confirm: data.confirm,
    });
  });
