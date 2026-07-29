import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlatformAdmin } from "@/lib/user-admin.functions";
import {
  encryptByodSecret,
  isByodKekConfigured,
  secretHint,
} from "@/lib/byod-crypto.server";
import {
  loadByodRow,
  normalizeSupabaseUrl,
  resolveOrgDataClient,
  testCustomerSupabaseConnection,
  toPublicByodStatus,
} from "@/lib/byod.server";
import type { ByodPublicStatus, ByodStatus } from "@/lib/byod-types";

async function orgByodActive(orgId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("byod_active")
    .eq("id", orgId)
    .maybeSingle();
  return Boolean((data as { byod_active?: boolean } | null)?.byod_active);
}

async function setOrgByodActive(orgId: string, active: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("organizations")
    .update({ byod_active: active } as never)
    .eq("id", orgId);
  if (error) throw new Error(error.message);
}

export const getOrgByodStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ org_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ByodPublicStatus> => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const row = await loadByodRow(data.org_id);
    const active = await orgByodActive(data.org_id);
    return toPublicByodStatus(
      row ? { ...row, org_id: data.org_id } : null,
      active,
      isByodKekConfigured(),
    );
  });

export const upsertOrgByodConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        org_id: z.string().uuid(),
        enabled: z.boolean().optional(),
        supabase_url: z.string().min(8).optional(),
        publishable_key: z.string().optional(),
        /** Write-only: omit or empty to keep existing secret */
        service_role_secret: z.string().optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ByodPublicStatus> => {
    await assertPlatformAdmin(context.supabase, context.userId);
    if (!isByodKekConfigured()) {
      throw new Error("Server missing BYOD_SECRETS_KEK — cannot store secrets.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await loadByodRow(data.org_id);

    let secret_ciphertext = existing?.secret_ciphertext ?? null;
    let secret_nonce = existing?.secret_nonce ?? null;
    let secret_configured = existing?.secret_configured ?? false;
    let secret_hint = existing?.secret_hint ?? null;
    let status: ByodStatus = existing?.status ?? "not_configured";

    const newSecret = data.service_role_secret?.trim();
    if (newSecret) {
      if (newSecret.length < 20) {
        throw new Error("Service role secret looks too short.");
      }
      const enc = encryptByodSecret(newSecret);
      secret_ciphertext = enc.ciphertext;
      secret_nonce = enc.nonce;
      secret_configured = true;
      secret_hint = secretHint(newSecret);
      status = status === "active" ? "configured" : "configured";
    }

    const supabase_url =
      data.supabase_url !== undefined
        ? data.supabase_url.trim()
          ? normalizeSupabaseUrl(data.supabase_url)
          : null
        : (existing?.supabase_url ?? null);

    const publishable_key =
      data.publishable_key !== undefined
        ? data.publishable_key.trim() || null
        : (existing?.publishable_key ?? null);

    const enabled = data.enabled ?? existing?.enabled ?? false;

    // Changing URL/keys after active → require re-test
    if (
      existing?.status === "active" &&
      (newSecret ||
        (data.supabase_url !== undefined && supabase_url !== existing.supabase_url))
    ) {
      status = "configured";
      await setOrgByodActive(data.org_id, false);
    }

    if (!secret_configured && !supabase_url) {
      status = "not_configured";
    }

    const row = {
      org_id: data.org_id,
      enabled,
      provider: "supabase",
      supabase_url,
      publishable_key,
      secret_ciphertext,
      secret_nonce,
      secret_configured,
      secret_hint,
      status,
      notes: data.notes !== undefined ? data.notes : (existing?.notes ?? null),
      last_error: null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };

    const { error } = await (supabaseAdmin as any)
      .from("org_byod_connections")
      .upsert(row, { onConflict: "org_id" });
    if (error) throw new Error(error.message);

    const { writeSecurityEvent } = await import("@/lib/security-audit");
    await writeSecurityEvent({
      orgId: data.org_id,
      actorUserId: context.userId,
      eventType: "admin_action",
      entityType: "org_byod_connections",
      entityId: data.org_id,
      summary: newSecret
        ? "BYOD connection saved (secret replaced)"
        : "BYOD connection saved",
      meta: {
        enabled,
        status,
        secret_replaced: Boolean(newSecret),
        url_set: Boolean(supabase_url),
      },
    });

    const active = await orgByodActive(data.org_id);
    const saved = await loadByodRow(data.org_id);
    return toPublicByodStatus(saved, active, true);
  });

export const clearOrgByodSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ org_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ByodPublicStatus> => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await setOrgByodActive(data.org_id, false);
    const { error } = await (supabaseAdmin as any)
      .from("org_byod_connections")
      .update({
        secret_ciphertext: null,
        secret_nonce: null,
        secret_configured: false,
        secret_hint: null,
        status: "not_configured",
        enabled: false,
        last_error: null,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", data.org_id);
    if (error) throw new Error(error.message);

    const { writeSecurityEvent } = await import("@/lib/security-audit");
    await writeSecurityEvent({
      orgId: data.org_id,
      actorUserId: context.userId,
      eventType: "admin_action",
      entityType: "org_byod_connections",
      entityId: data.org_id,
      summary: "BYOD secret cleared and connection disabled",
    });

    const saved = await loadByodRow(data.org_id);
    return toPublicByodStatus(saved, false, isByodKekConfigured());
  });

export const testOrgByodConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ org_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ByodPublicStatus> => {
    await assertPlatformAdmin(context.supabase, context.userId);
    if (!isByodKekConfigured()) {
      throw new Error("Server missing BYOD_SECRETS_KEK — cannot decrypt secrets.");
    }
    const row = await loadByodRow(data.org_id);
    if (!row?.supabase_url || !row.secret_configured || !row.secret_ciphertext || !row.secret_nonce) {
      throw new Error("Save a customer database URL and service role secret before testing.");
    }

    const { decryptByodSecret } = await import("@/lib/byod-crypto.server");
    const secret = decryptByodSecret(row.secret_ciphertext, row.secret_nonce);
    const result = await testCustomerSupabaseConnection(row.supabase_url, secret);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nextStatus: ByodStatus = result.ok ? "tested" : "error";
    // Failed test while active → drop active flag
    if (!result.ok && row.status === "active") {
      await setOrgByodActive(data.org_id, false);
    }

    const { error } = await (supabaseAdmin as any)
      .from("org_byod_connections")
      .update({
        status: nextStatus,
        last_tested_at: new Date().toISOString(),
        last_error: result.ok ? null : result.error,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
        ...(result.ok ? {} : row.status === "active" ? { enabled: false } : {}),
      })
      .eq("org_id", data.org_id);
    if (error) throw new Error(error.message);

    const { writeSecurityEvent } = await import("@/lib/security-audit");
    await writeSecurityEvent({
      orgId: data.org_id,
      actorUserId: context.userId,
      eventType: "admin_action",
      entityType: "org_byod_connections",
      entityId: data.org_id,
      summary: result.ok ? "BYOD connection test succeeded" : "BYOD connection test failed",
      meta: { ok: result.ok, error: result.ok ? null : result.error },
    });

    const saved = await loadByodRow(data.org_id);
    const active = await orgByodActive(data.org_id);
    return toPublicByodStatus(saved, active, true);
  });

export const setOrgByodActiveState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ org_id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ByodPublicStatus> => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const row = await loadByodRow(data.org_id);
    if (!row) throw new Error("Configure and test the connection first.");

    if (data.active) {
      if (!row.secret_configured || !row.supabase_url) {
        throw new Error("URL and secret required before activation.");
      }
      if (row.status !== "tested" && row.status !== "active") {
        throw new Error("Run a successful connection test before activating BYOD.");
      }
      // Re-test on activate for safety
      if (!isByodKekConfigured()) throw new Error("BYOD_SECRETS_KEK missing");
      const { decryptByodSecret } = await import("@/lib/byod-crypto.server");
      const secret = decryptByodSecret(row.secret_ciphertext!, row.secret_nonce!);
      const probe = await testCustomerSupabaseConnection(row.supabase_url, secret);
      if (!probe.ok) {
        throw new Error(`Activation blocked — connection test failed: ${probe.error}`);
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("org_byod_connections")
      .update({
        enabled: data.active,
        status: data.active ? "active" : row.status === "active" ? "tested" : row.status,
        last_error: null,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", data.org_id);
    if (error) throw new Error(error.message);

    await setOrgByodActive(data.org_id, data.active);

    const { writeSecurityEvent } = await import("@/lib/security-audit");
    await writeSecurityEvent({
      orgId: data.org_id,
      actorUserId: context.userId,
      eventType: "admin_action",
      entityType: "org_byod_connections",
      entityId: data.org_id,
      summary: data.active
        ? "BYOD activated — tenant data client uses customer DB"
        : "BYOD deactivated — tenant data uses iProjectX DB",
      meta: { active: data.active },
    });

    const saved = await loadByodRow(data.org_id);
    return toPublicByodStatus(saved, data.active, isByodKekConfigured());
  });

/** Server helper probe — confirms resolveOrgDataClient mode for an org. */
export const probeOrgDataClientMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ org_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const resolved = await resolveOrgDataClient(data.org_id);
    return { org_id: data.org_id, mode: resolved.mode };
  });
