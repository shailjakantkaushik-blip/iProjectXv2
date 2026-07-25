import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  challengeAndVerifyTotp,
  enrollTotp,
  getMfaStatus,
  verifyTotpEnrollment,
} from "@/lib/mfa";
import { recordAuthSecurityEvent } from "@/lib/auth-events.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ProcessingOverlay } from "@/components/processing-animation";
import { DEFAULT_LANDING, fetchLandingConfig, resolveBrandLogoUrl } from "@/lib/landing-config";
import { AuthLayout, type AuthBrand } from "@/components/auth-layout";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { readOrgAuthEntrySlug } from "@/lib/org-auth-entry";

type MfaSearch = { mode?: "challenge" | "enroll"; next?: string };

export const Route = createFileRoute("/mfa")({
  validateSearch: (s: Record<string, unknown>): MfaSearch => ({
    mode: s.mode === "enroll" ? "enroll" : s.mode === "challenge" ? "challenge" : undefined,
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Two-factor authentication — iProjectX" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MfaPage,
});

function toAuthBrand(brand: typeof DEFAULT_LANDING.brand): AuthBrand {
  return {
    name: brand.name,
    logo_url: resolveBrandLogoUrl(brand, "auth"),
    tagline: brand.tagline,
    logo_size_auth: brand.logo_size_auth,
    logo_custom_auth: brand.logo_custom_auth,
  };
}

function MfaPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { session, loading, refresh } = useAuth();
  const recordAuth = useServerFn(recordAuthSecurityEvent);
  const [brand, setBrand] = useState<AuthBrand>(() => toAuthBrand(DEFAULT_LANDING.brand));
  const [mode, setMode] = useState<"challenge" | "enroll">(search.mode ?? "challenge");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  const nextPath = search.next && search.next.startsWith("/") ? search.next : "/app";

  useEffect(() => {
    fetchLandingConfig()
      .then((c) => setBrand(toAuthBrand(c.brand)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      const slug = readOrgAuthEntrySlug();
      if (slug) void navigate({ to: "/auth", search: { org: slug }, replace: true });
      else void navigate({ to: "/auth", replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const status = await getMfaStatus();
        if (cancelled) return;
        if (status.needsChallenge) {
          setMode("challenge");
          setFactorId(status.verifiedFactorIds[0] ?? null);
        } else if (!status.hasVerifiedFactor) {
          setMode("enroll");
        } else if (status.currentLevel === "aal2") {
          // Already satisfied
          navigate({ to: nextPath, replace: true });
          return;
        } else {
          setMode(search.mode ?? "enroll");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Could not check MFA status");
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, loading, navigate, nextPath, search.mode]);

  const startEnroll = async () => {
    setBusy(true);
    try {
      const data = await enrollTotp("Authenticator");
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start MFA enrollment");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (booting || mode !== "enroll" || factorId || !session) return;
    void startEnroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, mode, session]);

  const finish = async (summary: string) => {
    try {
      await recordAuth({ data: { eventType: "login", summary, meta: { mfa: true } } });
    } catch {
      /* non-blocking */
    }
    await refresh();
    toast.success("Two-factor authentication verified");
    navigate({ to: nextPath, replace: true });
  };

  const onVerifyChallenge = async () => {
    if (!factorId || code.length < 6) return toast.error("Enter the 6-digit code");
    setBusy(true);
    try {
      await challengeAndVerifyTotp(factorId, code);
      await finish("Login with MFA challenge");
    } catch (e: any) {
      toast.error(e?.message ?? "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  const onVerifyEnroll = async () => {
    if (!factorId || code.length < 6) return toast.error("Enter the 6-digit code");
    setBusy(true);
    try {
      await verifyTotpEnrollment(factorId, code);
      await finish("MFA enrolled and verified");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not verify authenticator");
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (booting || loading) {
    return <ProcessingOverlay open label="Checking security…" />;
  }

  return (
    <>
      <ProcessingOverlay open={busy} label="Verifying…" />
      <AuthLayout
        platform={brand}
        title={mode === "enroll" ? "Set up two-factor authentication" : "Enter authentication code"}
        description={
          mode === "enroll"
            ? "Every account requires an authenticator app (Google Authenticator, 1Password, Authy, etc.)."
            : "Enter the 6-digit code from your authenticator app to continue."
        }
        footer={
          <button type="button" className="text-sm text-muted-foreground hover:underline" onClick={onSignOut}>
            Sign out
          </button>
        }
      >
        <div className="space-y-5">
          {mode === "enroll" && (
            <div className="space-y-3 rounded-md border p-4 text-sm">
              {qr ? (
                <img src={qr} alt="MFA QR code" className="mx-auto h-44 w-44" />
              ) : (
                <p className="text-muted-foreground">Preparing QR code…</p>
              )}
              {secret && (
                <p className="break-all text-center text-xs text-muted-foreground">
                  Manual key: <span className="font-mono text-foreground">{secret}</span>
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                {Array.from({ length: 6 }).map((_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button
              className="h-10 w-full"
              disabled={busy || code.length < 6}
              onClick={() => void (mode === "enroll" ? onVerifyEnroll() : onVerifyChallenge())}
            >
              {mode === "enroll" ? "Verify & enable" : "Verify & continue"}
            </Button>
          </div>
        </div>
      </AuthLayout>
    </>
  );
}
