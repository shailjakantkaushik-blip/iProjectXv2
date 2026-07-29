/** Shared BYOD types safe for client + server imports (no Node/crypto). */

export type ByodStatus =
  | "not_configured"
  | "configured"
  | "tested"
  | "active"
  | "error";

export type ByodPublicStatus = {
  org_id: string;
  enabled: boolean;
  provider: string;
  supabase_url: string | null;
  publishable_key_configured: boolean;
  secret_configured: boolean;
  secret_hint: string | null;
  status: ByodStatus;
  last_tested_at: string | null;
  last_error: string | null;
  notes: string | null;
  byod_active: boolean;
  kek_configured: boolean;
  updated_at: string | null;
};
