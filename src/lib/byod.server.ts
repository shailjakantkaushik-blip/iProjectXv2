/**
 * BYOD data-plane helpers (server-only).
 * Default orgs → shared iProjectX supabaseAdmin.
 * Active BYOD orgs → ephemeral client against the customer HTTPS DB API
 * (PostgREST-compatible; not limited to *.supabase.co).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decryptByodSecret } from "@/lib/byod-crypto.server";
import type { ByodPublicStatus, ByodStatus } from "@/lib/byod-types";

export type { ByodPublicStatus, ByodStatus } from "@/lib/byod-types";

type ByodRow = {
  org_id: string;
  enabled: boolean;
  provider: string;
  supabase_url: string | null;
  publishable_key: string | null;
  secret_ciphertext: string | null;
  secret_nonce: string | null;
  secret_configured: boolean;
  secret_hint: string | null;
  status: ByodStatus;
  last_tested_at: string | null;
  last_error: string | null;
  notes: string | null;
  updated_at: string | null;
};

export function normalizeSupabaseUrl(url: string): string {
  const u = url.trim().replace(/\/+$/, "");
  if (!/^https:\/\/.+/i.test(u)) {
    throw new Error(
      "Customer database URL must be https (e.g. https://db.customer.example.com or https://xxxx.supabase.co)",
    );
  }
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:") {
      throw new Error("Customer database URL must use https");
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Customer database")) throw e;
    throw new Error("Customer database URL is not a valid https URL");
  }
  return u;
}

export function toPublicByodStatus(
  row: ByodRow | null,
  byodActive: boolean,
  kekConfigured: boolean,
): ByodPublicStatus {
  return {
    org_id: row?.org_id ?? "",
    enabled: row?.enabled ?? false,
    provider: row?.provider ?? "supabase",
    supabase_url: row?.supabase_url ?? null,
    publishable_key_configured: Boolean(row?.publishable_key),
    secret_configured: Boolean(row?.secret_configured),
    secret_hint: row?.secret_hint ?? null,
    status: row?.status ?? "not_configured",
    last_tested_at: row?.last_tested_at ?? null,
    last_error: row?.last_error ?? null,
    notes: row?.notes ?? null,
    byod_active: byodActive,
    kek_configured: kekConfigured,
    updated_at: row?.updated_at ?? null,
  };
}

export async function loadByodRow(orgId: string): Promise<ByodRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("org_byod_connections")
    .select(
      "org_id,enabled,provider,supabase_url,publishable_key,secret_ciphertext,secret_nonce,secret_configured,secret_hint,status,last_tested_at,last_error,notes,updated_at",
    )
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ByodRow | null) ?? null;
}

/** Probe customer Supabase with service-role key (does not require our schema). */
export async function testCustomerSupabaseConnection(
  url: string,
  serviceRoleKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const normalized = normalizeSupabaseUrl(url);
    const client = createClient(normalized, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Prefer a cheap REST call; table may not exist yet on a fresh customer project.
    const { error } = await client.from("projects").select("id").limit(1);
    if (!error) return { ok: true };
    const msg = error.message || String(error);
    // Connectivity OK if we authenticated but schema/table is missing.
    if (
      /relation|does not exist|PGRST205|PGRST116|Could not find the table/i.test(msg) ||
      error.code === "42P01" ||
      error.code === "PGRST205"
    ) {
      return { ok: true };
    }
    if (/Invalid API key|JWT|401|403|permission denied/i.test(msg)) {
      return { ok: false, error: "Authentication failed — check the service role secret." };
    }
    return { ok: false, error: msg.slice(0, 300) };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
  }
}

export type OrgDataClientResult = {
  client: SupabaseClient;
  mode: "platform" | "byod";
  orgId: string;
};

/**
 * Resolve the Supabase client for tenant business data.
 * Control-plane tables (orgs, billing, BYOD config) always stay on platform.
 */
export async function resolveOrgDataClient(orgId: string): Promise<OrgDataClientResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("byod_active")
    .eq("id", orgId)
    .maybeSingle();

  if (!(org as { byod_active?: boolean } | null)?.byod_active) {
    return { client: supabaseAdmin as unknown as SupabaseClient, mode: "platform", orgId };
  }

  const row = await loadByodRow(orgId);
  if (
    !row?.enabled ||
    row.status !== "active" ||
    !row.secret_configured ||
    !row.supabase_url ||
    !row.secret_ciphertext ||
    !row.secret_nonce
  ) {
    return { client: supabaseAdmin as unknown as SupabaseClient, mode: "platform", orgId };
  }

  const secret = decryptByodSecret(row.secret_ciphertext, row.secret_nonce);
  const client = createClient(normalizeSupabaseUrl(row.supabase_url), secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, mode: "byod", orgId };
}
