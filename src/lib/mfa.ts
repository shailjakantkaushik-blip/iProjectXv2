import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/auth-context";

/** Privileged roles must enroll and use TOTP MFA (AAL2). */
export const MFA_REQUIRED_ROLES: AppRole[] = ["platform_admin", "org_admin", "admin"];

export type MfaStatus = {
  currentLevel: string | null;
  nextLevel: string | null;
  /** Verified TOTP factors */
  verifiedFactorIds: string[];
  /** Password OK but MFA step still required */
  needsChallenge: boolean;
  hasVerifiedFactor: boolean;
};

export function roleRequiresMfa(roles: AppRole[] | string[]): boolean {
  return roles.some((r) => MFA_REQUIRED_ROLES.includes(r as AppRole));
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

export async function enrollTotp(friendlyName = "Authenticator app") {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
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
