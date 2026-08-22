/** BYOD URL + public-status helpers (no Node crypto / admin client). */
import type { ByodPublicStatus, ByodStatus } from "./byod-types.ts";

export type ByodRowLike = {
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
  row: ByodRowLike | null,
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
