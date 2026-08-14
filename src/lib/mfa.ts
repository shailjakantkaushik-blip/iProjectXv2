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

type TotpFactorRow = {
  id: string;
  status?: string;
  factor_type?: string;
  friendly_name?: string | null;
};

export async function listTotpFactors(): Promise<{
  verified: TotpFactorRow[];
  unverified: TotpFactorRow[];
}> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;

  const all = (data?.all ?? []) as TotpFactorRow[];
  const totpAll = all.filter((f) => f.factor_type === "totp");
  const unverified = totpAll.filter((f) => f.status !== "verified");
  const verifiedFromAll = totpAll.filter((f) => f.status === "verified");
  const verified =
    verifiedFromAll.length > 0
      ? verifiedFromAll
      : ((data?.totp ?? []) as TotpFactorRow[]).filter((f) => f.status === "verified");

  return { verified, unverified };
}

export async function unenrollUnverifiedTotpFactors(): Promise<number> {
  const { unverified } = await listTotpFactors();
  let removed = 0;
  for (const f of unverified) {
    try {
      await unenrollTotp(f.id);
      removed += 1;
    } catch {
      /* leftover factor — continue so a fresh enroll can proceed */
    }
  }
  return removed;
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const [{ data: aal, error: aalError }, factors] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    listTotpFactors(),
  ]);
  if (aalError) throw aalError;

  const currentLevel = aal?.currentLevel ?? null;
  const nextLevel = aal?.nextLevel ?? null;

  return {
    currentLevel,
    nextLevel,
    verifiedFactorIds: factors.verified.map((f) => f.id),
    needsChallenge: currentLevel === "aal1" && nextLevel === "aal2",
    hasVerifiedFactor: factors.verified.length > 0,
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
  if (!data?.id || !data.totp) {
    throw new Error("Authenticator enrollment did not return a QR code. Try again.");
  }
  return data;
}

/**
 * Enroll a new TOTP factor for first-time setup.
 * Clears unfinished (unverified) factors first — those block a new QR
 * ("friendly name already exists") after switching browsers mid-setup.
 * If a verified authenticator already exists, throws with code
 * AUTHENTICATOR_ALREADY_VERIFIED so the UI can challenge instead.
 */
export async function enrollTotpForSetup(
  opts: { friendlyName?: string; issuer?: string } = {},
) {
  const { verified } = await listTotpFactors();
  if (verified.length > 0) {
    const err = new Error("AUTHENTICATOR_ALREADY_VERIFIED") as Error & {
      code: string;
      factorId: string;
    };
    err.code = "AUTHENTICATOR_ALREADY_VERIFIED";
    err.factorId = verified[0].id;
    throw err;
  }

  await unenrollUnverifiedTotpFactors();

  try {
    return await enrollTotp(opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    if (/already exists|friendly name|maximum|too many/i.test(msg)) {
      await unenrollUnverifiedTotpFactors();
      return await enrollTotp({
        ...opts,
        friendlyName: `Authenticator ${Date.now().toString(36)}`,
      });
    }
    throw e;
  }
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
