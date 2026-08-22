import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { secretHint } from "./byod-crypto.server.ts";
import { normalizeSupabaseUrl, toPublicByodStatus } from "./byod-url.ts";
import { getOrgAuthLoginPath, getPostSignOutAuthPath } from "./org-auth-entry.ts";

describe("SSO, MFA, and BYOD platform policy", () => {
  it("requires MFA for every signed-in user", () => {
    const src = readFileSync(new URL("./mfa.ts", import.meta.url), "utf8");
    assert.match(src, /export const MFA_REQUIRED_FOR_ALL_USERS = true/);
  });

  it("sends org white-label sign-in to /o/<slug>/login", () => {
    assert.equal(getOrgAuthLoginPath("iprojectx"), "/o/iprojectx/login");
    assert.equal(getPostSignOutAuthPath(), "/auth");
  });

  it("rejects non-https customer database URLs and never echoes the service-role secret", () => {
    assert.throws(() => normalizeSupabaseUrl("http://db.customer.example.com"), /https/);
    assert.equal(normalizeSupabaseUrl("https://db.customer.example.com/"), "https://db.customer.example.com");
    const publicStatus = toPublicByodStatus(
      {
        org_id: "org",
        enabled: true,
        provider: "supabase",
        supabase_url: "https://db.customer.example.com",
        publishable_key: "sb_publishable_x",
        secret_ciphertext: "cipher",
        secret_nonce: "nonce",
        secret_configured: true,
        secret_hint: secretHint("service-role-super-secret"),
        status: "configured",
        last_tested_at: null,
        last_error: null,
        notes: null,
        updated_at: null,
      },
      false,
      true,
    );
    assert.equal(publicStatus.secret_configured, true);
    assert.equal(publicStatus.byod_active, false);
    assert.ok(!String(publicStatus.secret_hint).includes("service-role-super-secret"));
    assert.ok(!("secret_ciphertext" in publicStatus));
  });
});
