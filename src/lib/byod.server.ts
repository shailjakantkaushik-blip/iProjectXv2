/**
 * BYOD data-plane helpers (server-only).
 * Default orgs → shared iProjectX supabaseAdmin.
 * Active BYOD orgs → ephemeral client against the customer HTTPS DB API
 * (PostgREST-compatible; not limited to *.supabase.co).
 *
 * resolveOrgDataClient results are cached briefly to avoid decrypt + client
 * construction on every proxied REST call.
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

const CACHE_TTL_MS = 120_000;

type CachedOrgData = {
  expires: number;
  result: OrgDataClientResult;
  upstream: ByodUpstreamCredentials | null;
};

const orgDataCache = new Map<string, CachedOrgData>();

export function invalidateOrgDataClientCache(orgId?: string): void {
  if (orgId) orgDataCache.delete(orgId);
  else orgDataCache.clear();
}

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

/** Raw credentials for the BYOD REST proxy (no supabase-js wrapper). */
export type ByodUpstreamCredentials = {
  orgId: string;
  baseUrl: string;
  serviceRoleKey: string;
};

async function buildOrgDataResolution(orgId: string): Promise<CachedOrgData> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("byod_active")
    .eq("id", orgId)
    .maybeSingle();

  const platformResult: OrgDataClientResult = {
    client: supabaseAdmin as unknown as SupabaseClient,
    mode: "platform",
    orgId,
  };

  if (!(org as { byod_active?: boolean } | null)?.byod_active) {
    return { expires: Date.now() + CACHE_TTL_MS, result: platformResult, upstream: null };
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
    return { expires: Date.now() + CACHE_TTL_MS, result: platformResult, upstream: null };
  }

  const secret = decryptByodSecret(row.secret_ciphertext, row.secret_nonce);
  const baseUrl = normalizeSupabaseUrl(row.supabase_url);
  const client = createClient(baseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    expires: Date.now() + CACHE_TTL_MS,
    result: { client, mode: "byod", orgId },
    upstream: { orgId, baseUrl, serviceRoleKey: secret },
  };
}

/**
 * Resolve the Supabase client for tenant business data.
 * Control-plane tables (orgs, billing, BYOD config) always stay on platform.
 */
export async function resolveOrgDataClient(orgId: string): Promise<OrgDataClientResult> {
  const hit = orgDataCache.get(orgId);
  if (hit && hit.expires > Date.now()) return hit.result;
  const built = await buildOrgDataResolution(orgId);
  orgDataCache.set(orgId, built);
  return built.result;
}

/** Credentials for same-origin BYOD REST proxy. Null when org uses platform DB. */
export async function resolveByodUpstream(
  orgId: string,
): Promise<ByodUpstreamCredentials | null> {
  const hit = orgDataCache.get(orgId);
  if (hit && hit.expires > Date.now()) return hit.upstream;
  const built = await buildOrgDataResolution(orgId);
  orgDataCache.set(orgId, built);
  return built.upstream;
}
