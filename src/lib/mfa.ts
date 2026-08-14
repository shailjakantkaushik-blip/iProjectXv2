import { supabase } from "@/integrations/supabase/client";

/**
 * MFA (TOTP authenticator app) is required for every signed-in user.
 * Free, phishing-resistant second factor — no SMS cost.
 */
export const MFA_REQUIRED_FOR_ALL_USERS = true;

export type MfaStatus = {
  currentLevel: string | null;
  nextLevel: string | null;
  /** Verified TOTP factors */
  verifiedFactorIds: string[];
  /** Password OK but MFA step still required */
  needsChallenge: boolean;
  hasVerifiedFactor: boolean;
};

/** @deprecated Always true — MFA is required for all users. Kept for call-site clarity. */
export function userRequiresMfa(): boolean {
  return MFA_REQUIRED_FOR_ALL_USERS;
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const [{ data: aal }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  const verified = (factors?.totp ?? []).filter((f) => f.status === "verified");
  const currentLevel = aal?.currentLevel ?? null;
  const nextLevel = aal?.nextLevel ?? null;

  return {
    currentLevel,
    nextLevel,
    verifiedFactorIds: verified.map((f) => f.id),
    needsChallenge: currentLevel === "aal1" && nextLevel === "aal2",
    hasVerifiedFactor: verified.length > 0,
  };
}

export async function challengeAndVerifyTotp(factorId: string, code: string) {
  const { data, error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\s/g, ""),
  });
  if (error) throw error;
  return data;
}

export async function enrollTotp(
  friendlyNameOrOpts: string | { friendlyName?: string; issuer?: string } = "Authenticator",
) {
  const opts =
    typeof friendlyNameOrOpts === "string"
      ? { friendlyName: friendlyNameOrOpts }
      : friendlyNameOrOpts ?? {};
  // Issuer appears in authenticator apps as "Issuer:email". Never pass a URL/host
  // with ports — GoTrue Site URL can produce labels like "localhost:3000:3000:…".
  const rawIssuer = (opts.issuer || "iProjectX").trim();
  const issuer =
    rawIssuer
      .replace(/^https?:\/\//i, "")
      .replace(/[:/?#].*$/, "") // drop port/path/query
      .replace(/[^\w.\- &]/g, "")
      .trim() || "iProjectX";

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: opts.friendlyName || "Authenticator",
    issuer,
  });
  if (error) throw error;
  return data;
}

export async function verifyTotpEnrollment(factorId: string, code: string) {
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr) throw cErr;
  const { data, error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.replace(/\s/g, ""),
  });
  if (error) throw error;
  return data;
}

export async function unenrollTotp(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
