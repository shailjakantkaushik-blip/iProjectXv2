/**
 * Jira REST helpers + org integration server functions.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlatformAdmin } from "@/lib/user-admin.functions";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  isIntegrationsKekConfigured,
  secretHint,
} from "@/lib/integration-crypto.server";
import type {
  IntegrationConfig,
  IntegrationProvider,
  IntegrationPublicStatus,
  IntegrationStatus,
} from "@/lib/integration-types";

type IntegrationRow = {
  id: string;
  org_id: string;
  provider: IntegrationProvider;
  display_name: string | null;
  enabled: boolean;
  config: IntegrationConfig;
  secret_ciphertext: string | null;
  secret_nonce: string | null;
  secret_configured: boolean;
  secret_hint: string | null;
  status: IntegrationStatus;
  last_tested_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  notes: string | null;
  updated_at: string | null;
};

function toPublic(row: IntegrationRow | null, orgId: string, provider: IntegrationProvider): IntegrationPublicStatus {
  return {
    id: row?.id ?? null,
    org_id: orgId,
    provider: row?.provider ?? provider,
    display_name: row?.display_name ?? null,
    enabled: row?.enabled ?? false,
    config: (row?.config as IntegrationConfig) ?? {},
    secret_configured: Boolean(row?.secret_configured),
    secret_hint: row?.secret_hint ?? null,
    status: row?.status ?? "not_configured",
    last_tested_at: row?.last_tested_at ?? null,
    last_synced_at: row?.last_synced_at ?? null,
    last_error: row?.last_error ?? null,
    notes: row?.notes ?? null,
    kek_configured: isIntegrationsKekConfigured(),
    updated_at: row?.updated_at ?? null,
  };
}

async function assertOrgAdminOrPlatform(supabase: any, userId: string, orgId: string) {
  try {
    await assertPlatformAdmin(supabase, userId);
    return;
  } catch {
    /* fall through */
  }
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role,org_id")
    .eq("user_id", userId);
  const ok = (roles ?? []).some(
    (r: { role: string; org_id: string | null }) =>
      (r.role === "admin" || r.role === "org_admin") && r.org_id === orgId,
  );
  if (!ok) throw new Error("Organisation admin required");
}

async function loadRow(
  orgId: string,
  provider: IntegrationProvider,
): Promise<IntegrationRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("org_integrations")
    .select("*")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as IntegrationRow | null) ?? null;
}

function normalizeJiraSite(url: string): string {
  const u = url.trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(u)) throw new Error("Jira site URL must be https://…");
  return u;
}

/** Probe Jira Cloud/DC with email + API token. */
export async function testJiraConnection(opts: {
  siteUrl: string;
  email: string;
  apiToken: string;
}): Promise<{ ok: true; displayName?: string } | { ok: false; error: string }> {
  try {
    const base = normalizeJiraSite(opts.siteUrl);
    const auth = Buffer.from(`${opts.email}:${opts.apiToken}`).toString("base64");
    const res = await fetch(`${base}/rest/api/3/myself`, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `Jira auth failed (${res.status}): ${text.slice(0, 180)}`,
      };
    }
    const body = (await res.json()) as { displayName?: string };
    return { ok: true, displayName: body.displayName };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
  }
}

export const getOrgIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        org_id: z.string().uuid(),
        provider: z.enum(["jira", "azure_devops", "servicenow", "custom_webhook"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<IntegrationPublicStatus> => {
    await assertOrgAdminOrPlatform(context.supabase, context.userId, data.org_id);
    const row = await loadRow(data.org_id, data.provider);
    return toPublic(row, data.org_id, data.provider);
  });

export const listOrgIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ org_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<IntegrationPublicStatus[]> => {
    await assertOrgAdminOrPlatform(context.supabase, context.userId, data.org_id);
    const providers = ["jira", "azure_devops", "servicenow", "custom_webhook"] as const;
    const out: IntegrationPublicStatus[] = [];
    for (const p of providers) {
      const row = await loadRow(data.org_id, p);
      out.push(toPublic(row, data.org_id, p));
    }
    return out;
  });

export const upsertOrgIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        org_id: z.string().uuid(),
        provider: z.enum(["jira", "azure_devops", "servicenow", "custom_webhook"]),
        display_name: z.string().max(120).optional(),
        enabled: z.boolean().optional(),
        config: z
          .object({
            site_url: z.string().optional(),
            email: z.string().optional(),
            project_keys: z.array(z.string()).optional(),
            map_to: z.enum(["work_items", "demand_pipeline"]).optional(),
            jql: z.string().optional(),
            sync_mode: z.enum(["manual", "scheduled"]).optional(),
          })
          .optional(),
        api_token: z.string().optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<IntegrationPublicStatus> => {
    await assertOrgAdminOrPlatform(context.supabase, context.userId, data.org_id);
    if (!isIntegrationsKekConfigured()) {
      throw new Error("Server missing INTEGRATIONS_SECRETS_KEK or BYOD_SECRETS_KEK");
    }
    const existing = await loadRow(data.org_id, data.provider);
    let secret_ciphertext = existing?.secret_ciphertext ?? null;
    let secret_nonce = existing?.secret_nonce ?? null;
    let secret_configured = existing?.secret_configured ?? false;
    let secret_hint = existing?.secret_hint ?? null;
    let status: IntegrationStatus = existing?.status ?? "not_configured";

    const token = data.api_token?.trim();
    if (token) {
      const enc = encryptIntegrationSecret(token);
      secret_ciphertext = enc.ciphertext;
      secret_nonce = enc.nonce;
      secret_configured = true;
      secret_hint = secretHint(token);
      status = status === "active" ? "configured" : "configured";
    }

    const config: IntegrationConfig = {
      ...(existing?.config ?? {}),
      ...(data.config ?? {}),
    };
    if (config.site_url) config.site_url = normalizeJiraSite(config.site_url);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      org_id: data.org_id,
      provider: data.provider,
      display_name: data.display_name ?? existing?.display_name ?? null,
      enabled: data.enabled ?? existing?.enabled ?? false,
      config,
      secret_ciphertext,
      secret_nonce,
      secret_configured,
      secret_hint,
      status: secret_configured || config.site_url ? status : "not_configured",
      notes: data.notes !== undefined ? data.notes : (existing?.notes ?? null),
      last_error: null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };

    const { error } = await (supabaseAdmin as any)
      .from("org_integrations")
      .upsert(row, { onConflict: "org_id,provider" });
    if (error) throw new Error(error.message);

    const saved = await loadRow(data.org_id, data.provider);
    return toPublic(saved, data.org_id, data.provider);
  });

export const testOrgIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        org_id: z.string().uuid(),
        provider: z.enum(["jira", "azure_devops", "servicenow", "custom_webhook"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<IntegrationPublicStatus> => {
    await assertOrgAdminOrPlatform(context.supabase, context.userId, data.org_id);
    const row = await loadRow(data.org_id, data.provider);
    if (!row) throw new Error("Save the integration first");
    if (data.provider !== "jira") throw new Error("Test is only implemented for Jira today");
    if (!row.secret_configured || !row.secret_ciphertext || !row.secret_nonce) {
      throw new Error("API token required");
    }
    const site = row.config?.site_url;
    const email = row.config?.email;
    if (!site || !email) throw new Error("Site URL and email required in config");

    const token = decryptIntegrationSecret(row.secret_ciphertext, row.secret_nonce);
    const result = await testJiraConnection({ siteUrl: site, email, apiToken: token });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("org_integrations")
      .update({
        status: result.ok ? "tested" : "error",
        last_tested_at: new Date().toISOString(),
        last_error: result.ok ? null : result.error,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", data.org_id)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);

    const saved = await loadRow(data.org_id, data.provider);
    return toPublic(saved, data.org_id, data.provider);
  });

/**
 * Pull recent Jira issues into demand_pipeline or work_items + link table.
 * Manual sync — scheduled sync can call the same path later.
 */
export const syncJiraIssues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        org_id: z.string().uuid(),
        max_results: z.number().int().min(1).max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdminOrPlatform(context.supabase, context.userId, data.org_id);
    const row = await loadRow(data.org_id, "jira");
    if (!row || (row.status !== "tested" && row.status !== "active")) {
      throw new Error("Test the Jira connection successfully before syncing");
    }
    if (!row.secret_ciphertext || !row.secret_nonce) throw new Error("Missing API token");
    const site = normalizeJiraSite(row.config.site_url || "");
    const email = row.config.email || "";
    const token = decryptIntegrationSecret(row.secret_ciphertext, row.secret_nonce);
    const keys = (row.config.project_keys ?? []).map((k) => k.trim()).filter(Boolean);
    const jql =
      row.config.jql?.trim() ||
      (keys.length
        ? `project in (${keys.map((k) => `"${k.replace(/"/g, "")}"`).join(",")}) ORDER BY updated DESC`
        : "ORDER BY updated DESC");
    const mapTo = row.config.map_to ?? "demand_pipeline";
    const max = data.max_results ?? 50;

    const auth = Buffer.from(`${email}:${token}`).toString("base64");
    const searchUrl = new URL(`${site}/rest/api/3/search`);
    searchUrl.searchParams.set("jql", jql);
    searchUrl.searchParams.set("maxResults", String(max));
    searchUrl.searchParams.set("fields", "summary,status,issuetype,priority,assignee,updated");

    const res = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira search failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const body = (await res.json()) as {
      issues?: Array<{
        id: string;
        key: string;
        fields?: {
          summary?: string;
          status?: { name?: string };
          issuetype?: { name?: string };
          priority?: { name?: string };
        };
      }>;
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let created = 0;
    let linked = 0;
    for (const issue of body.issues ?? []) {
      const { data: existingLink } = await (supabaseAdmin as any)
        .from("integration_external_links")
        .select("id,entity_id,entity_type")
        .eq("org_id", data.org_id)
        .eq("provider", "jira")
        .eq("external_id", issue.id)
        .maybeSingle();

      if (existingLink) {
        linked++;
        continue;
      }

      const title = issue.fields?.summary || issue.key;
      let entityId: string | null = null;
      let entityType: "work_item" | "demand_pipeline" = "demand_pipeline";

      if (mapTo === "work_items") {
        // Prefer demand when no default project — safer for first sync
        entityType = "demand_pipeline";
      }

      const { data: demand, error: dErr } = await (supabaseAdmin as any)
        .from("demand_pipeline")
        .insert({
          org_id: data.org_id,
          idea_name: `[${issue.key}] ${title}`.slice(0, 240),
          description: `Imported from Jira ${issue.key}. Type: ${issue.fields?.issuetype?.name ?? "—"}; Status: ${issue.fields?.status?.name ?? "—"}; Priority: ${issue.fields?.priority?.name ?? "—"}.`,
          status: "Idea",
          sponsor: "Jira",
        })
        .select("id")
        .single();
      if (dErr) throw new Error(dErr.message);
      entityId = demand.id;

      await (supabaseAdmin as any).from("integration_external_links").insert({
        org_id: data.org_id,
        provider: "jira",
        external_id: issue.id,
        external_key: issue.key,
        entity_type: entityType,
        entity_id: entityId,
        last_synced_at: new Date().toISOString(),
        payload: { key: issue.key, summary: title },
      });
      created++;
    }

    await (supabaseAdmin as any)
      .from("org_integrations")
      .update({
        status: "active",
        enabled: true,
        last_synced_at: new Date().toISOString(),
        last_error: null,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", data.org_id)
      .eq("provider", "jira");

    try {
      const { writeSecurityEvent } = await import("@/lib/security-audit");
      await writeSecurityEvent({
        orgId: data.org_id,
        actorUserId: context.userId,
        eventType: "admin_action",
        entityType: "org_integrations",
        entityId: data.org_id,
        summary: `Jira sync: ${created} imported, ${linked} already linked`,
        meta: { created, linked, max },
      });
    } catch {
      /* non-blocking */
    }

    return { created, linked, total: (body.issues ?? []).length };
  });
