import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { TURNSTILE_SRC, TurnstileWidget, isTurnstileEnabled } from "@/components/turnstile";
import { verifyTurnstile } from "@/lib/turnstile.functions";
import { getMfaStatus } from "@/lib/mfa";
import { recordAuthSecurityEvent, recordFailedLogin } from "@/lib/auth-events.functions";
import {
  applyAuthLogoDims,
  fetchLandingConfig,
  DEFAULT_LANDING,
  readCachedLandingConfig,
  getFreshLandingConfigSnapshot,
  resolveBrandLogoUrl,
  type LandingConfig,
} from "@/lib/landing-config";
import {
  assertUserBelongsToOrgSlug,
  getOrgBranding,
} from "@/lib/org-branding.functions";
import {
  assertClientIpAllowedForHomeOrg,
  assertClientIpAllowedForOrgSlug,
} from "@/lib/org-ip-restriction.functions";
import {
  AuthLayout,
  PasswordField,
  type AuthBrand,
  type AuthOrgBrand,
} from "@/components/auth-layout";
import { ProcessingOverlay } from "@/components/processing-animation";
import { clearOrgAuthEntry, rememberOrgAuthEntry } from "@/lib/org-auth-entry";
import { AlertTriangle } from "lucide-react";
import { RouteErrorView } from "@/components/route-error";
import { PUBLIC_AUTH_LOGO_HREF } from "@/lib/live-landing-logo";
import { resolveDocumentAuthLogoDims } from "@/lib/landing-public-logo.functions";
import { readAuthLogoSizeCookieBrowser } from "@/lib/landing-logo-cookie";

type OrgAccessAlert = {
  title: string;
  message: string;
  /** When true, an existing session was kept (wrong org link opened while logged in). */
  sessionPreserved: boolean;
};

type AuthSearch = { org?: string };

type AuthLoaderData = {
  platformBrand: AuthBrand;
  /** Only true when live config explicitly enables signup. */
  signupEnabled: boolean;
  /** White-label org — only when ?org= was present on the request. */
  orgBrand: AuthOrgBrand;
  orgRequested: boolean;
};

function toAuthPlatformBrand(
  brand: LandingConfig["brand"],
  dims?: { heightPx: number; maxWidthPx: number } | null,
): AuthBrand {
  // Same-origin file only — never swap to a CDN/data URL after first paint.
  return applyAuthLogoDims(
    {
      name: brand.name,
      logo_url: PUBLIC_AUTH_LOGO_HREF,
      tagline: brand.tagline,
      logo_size_auth: brand.logo_size_auth,
      logo_custom_auth: brand.logo_custom_auth,
    },
    dims,
  );
}

async function authLogoDims(): Promise<{ heightPx: number; maxWidthPx: number } | null> {
  if (typeof window !== "undefined") return readAuthLogoSizeCookieBrowser();
  try {
    return await resolveDocumentAuthLogoDims();
  } catch {
    return null;
  }
}

async function loadAuthPublicConfig(orgSlug?: string): Promise<AuthLoaderData> {
  const slug = orgSlug?.trim() || "";
  const dims = await authLogoDims();
  const cached =
    typeof window !== "undefined" ? getFreshLandingConfigSnapshot() ?? readCachedLandingConfig() : null;
  let orgBrand: AuthOrgBrand = null;
  if (slug) {
    try {
      const brand = await getOrgBranding({ data: { slug } });
      if (brand) {
        orgBrand = {
          name: brand.name,
          slug: brand.slug,
          logo_url: brand.logo_url,
          logo_size_auth: brand.logo_size_auth,
          logo_custom_auth: brand.logo_custom_auth,
          sso: brand.sso,
        };
      }
    } catch {
      /* paint sign-in; org chrome can resolve after */
    }
  }
  return {
    platformBrand: toAuthPlatformBrand(cached?.brand ?? DEFAULT_LANDING.brand, cached ? null : dims),
    signupEnabled: cached?.signup_enabled === true,
    orgBrand,
    orgRequested: Boolean(slug),
  };
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    org: typeof search.org === "string" && search.org.trim() ? search.org.trim() : undefined,
  }),
  loaderDeps: ({ search }) => ({ org: search.org }),
  head: ({ loaderData }) => ({
    meta: [
      { title: "Sign in — PMO Enterprise" },
      { name: "robots", content: "noindex" },
    ],
    links: [
      { rel: "preconnect", href: "https://challenges.cloudflare.com" },
      { rel: "preload", as: "script", href: TURNSTILE_SRC },
      {
        rel: "preload",
        as: "image",
        href: loaderData?.platformBrand.logo_url || PUBLIC_AUTH_LOGO_HREF,
      },
    ],
  }),
  loader: async ({ deps }): Promise<AuthLoaderData> => loadAuthPublicConfig(deps.org),
  staleTime: 60_000,
  pendingMs: 0,
  pendingComponent: AuthPending,
  errorComponent: function AuthRouteError({
    error,
    reset,
  }: {
    error: Error;
    reset: () => void;
  }) {
    return <RouteErrorView error={error} reset={reset} embedded={false} />;
  },
  component: AuthPage,
});

function authShellBrand(): AuthBrand {
  const cached =
    typeof window !== "undefined"
      ? getFreshLandingConfigSnapshot() ?? readCachedLandingConfig()
      : null;
  const dims = typeof window !== "undefined" ? readAuthLogoSizeCookieBrowser() : null;
  if (cached) return toAuthPlatformBrand(cached.brand);
  return applyAuthLogoDims(
    {
      name: DEFAULT_LANDING.brand.name,
      tagline: DEFAULT_LANDING.brand.tagline,
      logo_url: PUBLIC_AUTH_LOGO_HREF,
      logo_size_auth: DEFAULT_LANDING.brand.logo_size_auth,
      logo_custom_auth: DEFAULT_LANDING.brand.logo_custom_auth,
    },
    dims,
  );
}

function readOrgFromLocation(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const slug = new URLSearchParams(window.location.search).get("org")?.trim();
  return slug || undefined;
}

/**
 * Pending shell: form is a spinner. Brand comes from Landing-config cache
 * when the visitor just left the public site (Monday behaviour).
 */
function AuthPending() {
  const orgRequested = Boolean(readOrgFromLocation());
  return (
    <AuthLayout
      platform={authShellBrand()}
      orgRequested={orgRequested}
      brandReady={false}
      title="Welcome back"
      description="Sign in with your organisation account."
    >
      <div className="flex flex-col items-center justify-center py-8" aria-busy="true">
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
          aria-hidden
        />
        <p className="mt-3 text-sm text-muted-foreground">Preparing sign in…</p>
      </div>
    </AuthLayout>
  );
}

function AuthPage() {
  const loader = Route.useLoaderData();
  const { orgBrand, orgRequested } = loader;
  const [platformBrand, setPlatformBrand] = useState(loader.platformBrand);
  const [signupEnabled, setSignupEnabled] = useState(loader.signupEnabled);
  const { session, loading, profile } = useAuth();
  const navigate = useNavigate();
  const assertOrgMembership = useServerFn(assertUserBelongsToOrgSlug);
  const assertOrgIp = useServerFn(assertClientIpAllowedForOrgSlug);
  const assertHomeOrgIp = useServerFn(assertClientIpAllowedForHomeOrg);
  const recordAuth = useServerFn(recordAuthSecurityEvent);
  const recordFail = useServerFn(recordFailedLogin);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  /** Bumped to reset the Turnstile widget after a consumed/failed challenge. */
  const [captchaResetNonce, setCaptchaResetNonce] = useState(0);
  const [mode, setMode] = useState<"auth" | "forgot">("auth");
  const [forgotEmail, setForgotEmail] = useState("");
  const [orgAlert, setOrgAlert] = useState<OrgAccessAlert | null>(null);
  /** Prevents re-firing the org membership gate after the user dismisses the alert. */
  const [orgGateBlocked, setOrgGateBlocked] = useState(false);
  /** User explicitly chose to sign in as someone else — do not auto-continue prior session. */
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const captchaRequired = isTurnstileEnabled();
  // Org white-label links are invite-style: no public self-signup.
  const allowSignup = signupEnabled && !orgRequested;
  const targetOrgSlug = orgBrand?.slug || (orgRequested ? readOrgFromLocation() : undefined);
  const orgLabel = orgBrand?.name || targetOrgSlug || "this organisation";
  const sessionEmail =
    session?.user?.email || profile?.email || null;

  // Cached Landing-config (from the public site) has the Auth logo already.
  // Apply it before paint — do not wait on /api/public/landing-logo.
  useLayoutEffect(() => {
    const cached = getFreshLandingConfigSnapshot() ?? readCachedLandingConfig();
    if (!cached) return;
    setPlatformBrand(toAuthPlatformBrand(cached.brand));
    if (cached.signup_enabled === true) setSignupEnabled(true);
  }, []);

  useEffect(() => {
    if (loader.platformBrand.logo_url) setPlatformBrand(loader.platformBrand);
    setSignupEnabled(loader.signupEnabled);
  }, [loader.platformBrand, loader.signupEnabled]);

  // Server loader returns empty logos (Safari-safe). Fetch live config in the
  // browser — same path as Monday, when sign-in was instant after landing.
  useEffect(() => {
    let cancelled = false;
    void fetchLandingConfig()
      .then((cfg) => {
        if (cancelled) return;
        setPlatformBrand(toAuthPlatformBrand(cfg.brand));
        setSignupEnabled(cfg.signup_enabled === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Warm the landing logo so "Back to site" paints the current mark, not a stale swap.
  useEffect(() => {
    const snap = getFreshLandingConfigSnapshot();
    const landingLogo = snap ? resolveBrandLogoUrl(snap.brand, "landing") : "";
    if (!landingLogo || landingLogo.startsWith("data:")) return;
    const img = new Image();
    img.decoding = "async";
    img.src = landingLogo;
  }, [platformBrand]);

  const showOrgAccessAlert = useCallback((alert: OrgAccessAlert) => {
    setOrgAlert(alert);
    setOrgGateBlocked(true);
    toast.error(alert.title, { description: alert.message, duration: 8_000 });
  }, []);

  /**
   * Verify the current session may use this org white-label link.
   * @param signOutOnFail — true after a fresh password/SSO sign-in (clear the
   *   rejected session). false when an existing session opened the wrong
   *   org link — keep that session so other tabs are not wiped, unless the
   *   user is unprovisioned (no profile.org_id), in which case we always
   *   sign out so SSO JIT users cannot fall through to self-serve onboarding.
   */
  const rejectWrongOrgSession = useCallback(
    async (slug: string, signOutOnFail: boolean): Promise<boolean> => {
      const shouldClearSession = async (): Promise<boolean> => {
        if (signOutOnFail) return true;
        // Soft path: preserve sessions that already belong to another org.
        // Unprovisioned users (typical SSO JIT) must not keep a session.
        try {
          const uid = session?.user?.id;
          if (!uid) return true;
          if (profile && profile.org_id == null) return true;
          if (profile?.org_id) return false;
          const { data: row } = await supabase
            .from("profiles")
            .select("org_id")
            .eq("id", uid)
            .maybeSingle();
          return !row?.org_id;
        } catch {
          return true;
        }
      };

      try {
        const result = await assertOrgMembership({ data: { slug } });
        if (result.allowed) {
          const ip = await assertOrgIp({ data: { slug } });
          if (!ip.allowed) {
            // IP deny always clears the session — this user belongs to the org
            // but must not enter from a non-allowlisted network.
            await supabase.auth.signOut({ scope: "local" });
            showOrgAccessAlert({
              title: "Network not allowed",
              message: ip.message,
              sessionPreserved: false,
            });
            return false;
          }
          rememberOrgAuthEntry(result.orgSlug);
          return true;
        }
        const clear = await shouldClearSession();
        if (clear) {
          await supabase.auth.signOut({ scope: "local" });
        }
        showOrgAccessAlert({
          title: "Not an organisation user",
          message: `You are not a member of ${orgLabel}. Contact your administrator for access, then try again.`,
          sessionPreserved: !clear,
        });
        return false;
      } catch (e) {
        const clear = await shouldClearSession();
        if (clear) {
          await supabase.auth.signOut({ scope: "local" });
        }
        showOrgAccessAlert({
          title: "Not an organisation user",
          message:
            e instanceof Error
              ? e.message
              : `You are not a member of ${orgLabel}. Contact your administrator for access, then try again.`,
          sessionPreserved: !clear,
        });
        return false;
      }
    },
    [assertOrgMembership, assertOrgIp, showOrgAccessAlert, orgLabel, session?.user?.id, profile],
  );

  // Existing session on /auth: do NOT auto-redirect into the app. That made
  // "change email and sign in as someone else" impossible — the prior session
  // always won. Show an explicit continue / switch-account choice instead.
  useEffect(() => {
    if (!session) setSwitchingAccount(false);
  }, [session]);

  useEffect(() => {
    if (loading || !session || switchingAccount || orgAlert || orgGateBlocked) return;
    if (!orgRequested || !targetOrgSlug) return;
    // Soft-check org membership for white-label links; keep session on failure.
    let cancelled = false;
    (async () => {
      const ok = await rejectWrongOrgSession(targetOrgSlug, false);
      if (cancelled || ok) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [
    session,
    loading,
    switchingAccount,
    orgRequested,
    targetOrgSlug,
    rejectWrongOrgSession,
    orgAlert,
    orgGateBlocked,
  ]);

  const continueAsCurrentUser = async () => {
    if (orgRequested) {
      if (!targetOrgSlug) {
        showOrgAccessAlert({
          title: "Invalid organisation sign-in link",
          message:
            "This link is missing a valid organisation. Use the link from your administrator, or sign in on the general page.",
          sessionPreserved: true,
        });
        return;
      }
      setBusy(true);
      const ok = await rejectWrongOrgSession(targetOrgSlug, false);
      setBusy(false);
      if (!ok) return;
    }
    navigate({ to: "/app", replace: true });
  };

  const beginSwitchAccount = async () => {
    setSwitchingAccount(true);
    setOrgAlert(null);
    setOrgGateBlocked(false);
    setBusy(true);
    try {
      await recordAuth({ data: { eventType: "logout", summary: "Switch account sign-out" } });
    } catch {
      /* still clear local session */
    }
    await supabase.auth.signOut({ scope: "local" });
    clearOrgAuthEntry();
    setBusy(false);
    toast.message("Ready for a different account", {
      description: "Enter the email and password you want to use.",
    });
  };

  useEffect(() => {
    // Org white-label entry: remember so sign-out returns here.
    if (orgRequested && (orgBrand?.slug || targetOrgSlug)) {
      rememberOrgAuthEntry(orgBrand?.slug || targetOrgSlug);
    }
  }, [orgRequested, orgBrand?.slug, targetOrgSlug]);

  const handleToken = useCallback((t: string) => {
    setCaptchaToken((prev) => (prev === t ? prev : t));
  }, []);
  const handleExpire = useCallback(() => setCaptchaToken(null), []);

  /** Clear a used/invalid captcha and ask the widget for a fresh challenge. */
  const refreshCaptcha = useCallback(() => {
    setCaptchaToken(null);
    setCaptchaResetNonce((n) => n + 1);
  }, []);

  const ensureCaptcha = async (): Promise<boolean> => {
    if (!captchaRequired) return true;
    if (!captchaToken) {
      toast.error("Please complete the human check.");
      return false;
    }
    try {
      await verifyTurnstile({ data: { token: captchaToken } });
      // Token is single-use after server verify — drop it so Sign in cannot
      // stay enabled on a dead token if the rest of the flow fails.
      setCaptchaToken(null);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Human check failed. Try again.");
      refreshCaptcha();
      return false;
    }
  };

  const onForgot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setBusy(true);
    try {
      if (!(await ensureCaptcha())) return;
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password reset link sent. Check your email.");
      setMode("auth");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset link.");
    } finally {
      setBusy(false);
      refreshCaptcha();
    }
  };

  const onSsoSignIn = async () => {
    const sso = orgBrand?.sso;
    if (!sso?.enabled) return;
    setBusy(true);
    setOrgAlert(null);
    let redirected = false;
    try {
      const redirectTo = `${window.location.origin}/auth${
        targetOrgSlug ? `?org=${encodeURIComponent(targetOrgSlug)}` : ""
      }`;
      const opts =
        sso.provider_id
          ? { providerId: sso.provider_id, options: { redirectTo } }
          : sso.domains[0]
            ? { domain: sso.domains[0], options: { redirectTo } }
            : null;
      if (!opts) {
        toast.error("SSO is not fully configured for this organisation.");
        return;
      }
      const { data, error } = await supabase.auth.signInWithSSO(opts);
      if (error) {
        toast.error(error.message);
        return;
      }
      if (data?.url) {
        redirected = true;
        window.location.assign(data.url);
        return;
      }
      toast.error("SSO provider did not return a sign-in URL.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "SSO sign-in failed");
    } finally {
      if (!redirected) setBusy(false);
    }
  };

  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    setBusy(true);
    setOrgAlert(null);
    setOrgGateBlocked(false);
    let leftAuthPage = false;
    try {
      if (!(await ensureCaptcha())) return;
      // If a prior session is still present (e.g. browser restored it), clear it
      // before signing in — especially when the email differs — so the new
      // credentials actually become the active user.
      const currentEmail = session?.user?.email?.toLowerCase() || null;
      if (session && (!currentEmail || currentEmail !== email.toLowerCase())) {
        await supabase.auth.signOut({ scope: "local" });
      }
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        void recordFail({ data: { email, reason: error.message } });
        toast.error(error.message);
        return;
      }
      setSwitchingAccount(false);
      try {
        sessionStorage.removeItem("iprojectx.auth.email-draft");
      } catch {
        /* private mode */
      }

      // Org white-label gate MUST run before MFA redirect. Previously MFA sent
      // users to /mfa?next=/app and skipped membership checks, so credentials
      // from Org A could enter the app via Org B's login link.
      if (orgRequested) {
        if (!targetOrgSlug) {
          await supabase.auth.signOut({ scope: "local" });
          showOrgAccessAlert({
            title: "Invalid organisation sign-in link",
            message:
              "This link is missing a valid organisation. Use the link from your administrator, or sign in on the general page.",
            sessionPreserved: false,
          });
          return;
        }
        const ok = await rejectWrongOrgSession(targetOrgSlug, true);
        if (!ok) return;
      } else {
        // General /auth sign-in — do not treat membership as org-link entry.
        clearOrgAuthEntry();
        try {
          const ip = await assertHomeOrgIp();
          if (!ip.allowed) {
            await supabase.auth.signOut({ scope: "local" });
            showOrgAccessAlert({
              title: "Network not allowed",
              message: ip.message,
              sessionPreserved: false,
            });
            return;
          }
        } catch (err) {
          await supabase.auth.signOut({ scope: "local" });
          showOrgAccessAlert({
            title: "Network not allowed",
            message:
              err instanceof Error
                ? err.message
                : "Could not verify IP restriction for your organisation. Try again.",
            sessionPreserved: false,
          });
          return;
        }
      }

      // MFA: challenge existing authenticator, or enroll if none is verified yet.
      try {
        const mfa = await getMfaStatus();
        if (mfa.hasVerifiedFactor && mfa.currentLevel !== "aal2") {
          leftAuthPage = true;
          navigate({ to: "/mfa", search: { mode: "challenge", next: "/app" }, replace: true });
          return;
        }
        if (!mfa.hasVerifiedFactor) {
          leftAuthPage = true;
          navigate({ to: "/mfa", search: { mode: "enroll", next: "/app" }, replace: true });
          return;
        }
      } catch {
        /* If MFA APIs unavailable (not enabled in project), continue; Gate will re-check. */
      }

      try {
        await recordAuth({ data: { eventType: "login", summary: "Password login" } });
      } catch {
        /* non-blocking */
      }
      toast.success("Signed in");
      leftAuthPage = true;
      navigate({ to: "/app", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed. Try again.");
    } finally {
      setBusy(false);
      // Captcha was consumed on verify — reset so Sign in is not stuck muted
      // after wrong-org / bad password / network errors (refresh used to fix this).
      if (!leftAuthPage) refreshCaptcha();
    }
  };

  const dismissOrgAlert = () => setOrgAlert(null);

  const goToWorkspaceFromAlert = () => {
    // Leaving a wrong org white-label link for the user's real workspace —
    // drop the branded entry so sign-out does not bounce them back here.
    clearOrgAuthEntry();
    setOrgAlert(null);
    setOrgGateBlocked(false);
    navigate({ to: "/app", replace: true });
  };

  const signOutFromAlert = async () => {
    setOrgAlert(null);
    setOrgGateBlocked(false);
    try {
      await recordAuth({ data: { eventType: "logout", summary: "Signed out from org access alert" } });
    } catch {
      /* still clear local session */
    }
    await supabase.auth.signOut({ scope: "local" });
    clearOrgAuthEntry();
    toast.message("Signed out", {
      description: "You can now sign in with a different account.",
    });
  };

  const onSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    let leftAuthPage = false;
    try {
      if (orgRequested) {
        toast.error(
          "Self-signup is not available on organisation sign-in links. Ask your administrator for an account.",
        );
        return;
      }
      let allowed = signupEnabled;
      try {
        const latest = await fetchLandingConfig();
        allowed = latest.signup_enabled === true;
      } catch {
        /* keep loader flag */
      }
      if (!allowed) {
        toast.error("Public signup is disabled. Contact your platform administrator.");
        return;
      }
      if (!(await ensureCaptcha())) return;
      const fd = new FormData(e.currentTarget);
      const { error } = await supabase.auth.signUp({
        email: String(fd.get("email")),
        password: String(fd.get("password")),
        options: {
          data: { full_name: String(fd.get("full_name") || "") },
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      clearOrgAuthEntry();
      toast.success("Account created — check email if confirmation is required.");
      leftAuthPage = true;
      navigate({ to: "/app", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed. Try again.");
    } finally {
      setBusy(false);
      if (!leftAuthPage) refreshCaptcha();
    }
  };

  const submitDisabled = busy || (captchaRequired && !captchaToken);
  const brand = platformBrand;
  const orgLoginDescription = orgBrand
    ? `Sign in with your ${orgBrand.name} account. Only members of this organisation can use this link.`
    : "Sign in with your organisation account. Only members of this organisation can use this link.";

  const orgAlertDialog = (
    <AlertDialog open={Boolean(orgAlert)} onOpenChange={(open) => !open && dismissOrgAlert()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {orgAlert?.title || "Not an organisation user"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {orgAlert?.message ||
              `You are not a member of ${orgLabel}. Contact your administrator for access, then try again.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {orgAlert?.sessionPreserved ? (
            <>
              <AlertDialogCancel onClick={signOutFromAlert}>Sign out</AlertDialogCancel>
              <AlertDialogAction onClick={goToWorkspaceFromAlert}>
                Go to my workspace
              </AlertDialogAction>
            </>
          ) : (
            <AlertDialogAction onClick={dismissOrgAlert}>Try again</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const orgAlertBanner =
    orgAlert && !orgAlert.sessionPreserved ? (
      <div
        role="alert"
        className="mb-4 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 space-y-1">
          <div className="font-semibold">{orgAlert.title}</div>
          <p className="text-xs leading-relaxed opacity-90">{orgAlert.message}</p>
        </div>
      </div>
    ) : null;

  if (mode === "forgot") {
    return (
      <>
        {orgAlertDialog}
        <ProcessingOverlay open={busy} label="Sending reset link…" />
        <AuthLayout
          platform={brand}
          org={orgBrand}
          orgRequested={orgRequested}
          title="Reset your password"
          description="Enter the email for your account and we'll send a secure reset link."
          footer={
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setMode("auth")}
            >
              Back to sign in
            </button>
          }
        >
        <form onSubmit={onForgot} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="h-10"
            />
          </div>
          {captchaRequired && (
            <TurnstileWidget
              onToken={handleToken}
              onExpire={handleExpire}
              resetNonce={captchaResetNonce}
            />
          )}
          <Button
            type="submit"
            className="h-10 w-full"
            disabled={busy || !forgotEmail || (captchaRequired && !captchaToken)}
          >
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </AuthLayout>
      </>
    );
  }

  return (
    <>
      {orgAlertDialog}
      <ProcessingOverlay
        open={busy}
        label={orgRequested ? "Verifying organisation access…" : "Signing you in…"}
      />
      <AuthLayout
      platform={brand}
      org={orgBrand}
      orgRequested={orgRequested}
      title={orgRequested && orgBrand ? `Welcome to ${orgBrand.name}` : "Welcome back"}
      description={
        orgRequested
          ? orgLoginDescription
          : allowSignup
            ? "Sign in to continue, or create an account to get started."
            : "Sign in with your organisation account. Public signup is currently disabled."
      }
      footer={
        <span>
          By continuing you agree to the{" "}
          <Link to="/" className="font-medium text-foreground hover:underline">
            platform terms
          </Link>
          .
        </span>
      }
    >
      {orgAlertBanner}
      {!loading && session && !switchingAccount && !orgGateBlocked ? (
        <div className="space-y-4 pt-2">
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Already signed in
            </div>
            <div className="mt-1 break-all font-medium text-foreground">
              {sessionEmail || "Current session"}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Continue with this account, or sign out to use a different email.
            </p>
          </div>
          <Button
            type="button"
            className="h-10 w-full"
            disabled={busy}
            onClick={() => void continueAsCurrentUser()}
          >
            {busy ? "Continuing…" : "Continue to app"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full"
            disabled={busy}
            onClick={() => void beginSwitchAccount()}
          >
            Use a different account
          </Button>
        </div>
      ) : allowSignup ? (
        <Tabs defaultValue="signin">
          <TabsList className="grid h-10 w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="mt-0">
            <SignInForm
              onSignIn={onSignIn}
              onForgot={() => setMode("forgot")}
              captchaRequired={captchaRequired}
              onToken={handleToken}
              onExpire={handleExpire}
              captchaResetNonce={captchaResetNonce}
              submitDisabled={submitDisabled}
              busy={busy}
              sso={orgBrand?.sso ?? null}
              onSso={onSsoSignIn}
            />
          </TabsContent>
          <TabsContent value="signup" className="mt-0">
            <form onSubmit={onSignUp} className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full name</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  required
                  autoComplete="name"
                  placeholder="Jane Smith"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email2">Email</Label>
                <Input
                  id="email2"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="h-10"
                />
              </div>
              <PasswordField
                id="password2"
                name="password"
                label="Password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
              {captchaRequired && (
                <TurnstileWidget
                  onToken={handleToken}
                  onExpire={handleExpire}
                  resetNonce={captchaResetNonce}
                />
              )}
              <Button type="submit" className="h-10 w-full" disabled={submitDisabled}>
                {busy ? "Creating…" : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      ) : (
        <SignInForm
          onSignIn={onSignIn}
          onForgot={() => setMode("forgot")}
          captchaRequired={captchaRequired}
          onToken={handleToken}
          onExpire={handleExpire}
          captchaResetNonce={captchaResetNonce}
          submitDisabled={submitDisabled}
          busy={busy}
          sso={orgBrand?.sso ?? null}
          onSso={onSsoSignIn}
        />
      )}
    </AuthLayout>
    </>
  );
}

function SignInForm({
  onSignIn,
  onForgot,
  captchaRequired,
  onToken,
  onExpire,
  captchaResetNonce,
  submitDisabled,
  busy,
  sso,
  onSso,
}: {
  onSignIn: (e: React.FormEvent<HTMLFormElement>) => void;
  onForgot: () => void;
  captchaRequired: boolean;
  onToken: (t: string) => void;
  onExpire: () => void;
  captchaResetNonce: number;
  submitDisabled: boolean;
  busy: boolean;
  sso: NonNullable<AuthOrgBrand>["sso"] | null | undefined;
  onSso: () => void;
}) {
  const emailDraftKey = "iprojectx.auth.email-draft";
  const [email, setEmail] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return sessionStorage.getItem(emailDraftKey) ?? "";
    } catch {
      return "";
    }
  });

  // Show whenever SSO is toggled on for the org. Provider ID / domains are
  // validated on click — hiding the button when those were empty made enable
  // look broken after save.
  const ssoEnabled = !!sso?.enabled;

  return (
    <form onSubmit={onSignIn} className="space-y-4 pt-4">
      {ssoEnabled && (
        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full"
            disabled={busy || submitDisabled}
            onClick={() => void onSso()}
          >
            {busy ? "Redirecting…" : sso.button_label || "Sign in with SSO"}
          </Button>
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wide">
              <span className="bg-card px-2 text-muted-foreground">or email</span>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className="h-10"
          value={email}
          onChange={(e) => {
            const v = e.target.value;
            setEmail(v);
            try {
              sessionStorage.setItem(emailDraftKey, v);
            } catch {
              /* private mode */
            }
          }}
        />
      </div>
      <PasswordField
        id="password"
        name="password"
        label="Password"
        required
        autoComplete="current-password"
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onForgot}
          className="text-xs font-medium text-primary hover:underline"
        >
          Forgot password?
        </button>
      </div>
      {captchaRequired && (
        <TurnstileWidget onToken={onToken} onExpire={onExpire} resetNonce={captchaResetNonce} />
      )}
      <Button type="submit" className="h-10 w-full" disabled={submitDisabled}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
