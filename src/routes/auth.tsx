import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { TurnstileWidget, isTurnstileEnabled } from "@/components/turnstile";
import { verifyTurnstile } from "@/lib/turnstile.functions";
import {
  fetchLandingConfig,
  DEFAULT_LANDING,
  readCachedLandingConfig,
  resolveBrandLogoUrl,
  type LandingConfig,
} from "@/lib/landing-config";
import {
  assertUserBelongsToOrgSlug,
  getOrgBranding,
} from "@/lib/org-branding.functions";
import {
  AuthLayout,
  PasswordField,
  type AuthBrand,
  type AuthOrgBrand,
} from "@/components/auth-layout";
import { ProcessingAnimation, ProcessingOverlay } from "@/components/processing-animation";
import { clearOrgAuthEntry, rememberOrgAuthEntry } from "@/lib/org-auth-entry";
import { AlertTriangle } from "lucide-react";

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

function toAuthPlatformBrand(brand: LandingConfig["brand"]): AuthBrand {
  return {
    name: brand.name,
    logo_url: resolveBrandLogoUrl(brand, "auth"),
    tagline: brand.tagline,
    logo_size_auth: brand.logo_size_auth,
    logo_custom_auth: brand.logo_custom_auth,
  };
}

async function loadAuthPublicConfig(orgSlug?: string): Promise<AuthLoaderData> {
  const slug = orgSlug?.trim() || "";
  try {
    const cfg = await fetchLandingConfig();
    let orgBrand: AuthOrgBrand = null;
    if (slug) {
      const brand = await getOrgBranding({ data: { slug } });
      if (brand) orgBrand = brand;
    }
    return {
      platformBrand: toAuthPlatformBrand(cfg.brand),
      signupEnabled: cfg.signup_enabled === true,
      orgBrand,
      orgRequested: Boolean(slug),
    };
  } catch {
    // Prefer full cache (with logos) over paint cache so a failed refetch
    // still shows the last known brand instead of a default placeholder.
    const cached = typeof window !== "undefined" ? readCachedLandingConfig() : null;
    return {
      platformBrand: toAuthPlatformBrand(cached?.brand ?? DEFAULT_LANDING.brand),
      signupEnabled: false,
      orgBrand: null,
      orgRequested: Boolean(slug),
    };
  }
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    org: typeof search.org === "string" && search.org.trim() ? search.org.trim() : undefined,
  }),
  loaderDeps: ({ search }) => ({ org: search.org }),
  head: () => ({
    meta: [
      { title: "Sign in — PMO Enterprise" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ deps }): Promise<AuthLoaderData> => loadAuthPublicConfig(deps.org),
  staleTime: 60_000,
  pendingMs: 0,
  pendingComponent: AuthPending,
  component: AuthPage,
});

function authShellBrand(): AuthBrand {
  // Neutral stub only — never paint cached name/logo during pending.
  return {
    name: "",
    logo_url: "",
    tagline: "",
    logo_size_auth: "lg",
  };
}

function readOrgFromLocation(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const slug = new URLSearchParams(window.location.search).get("org")?.trim();
  return slug || undefined;
}

/**
 * Pending shell: layout chrome only — no brand name/logo so landing→auth
 * never flashes a previous (or default) mark before live config arrives.
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
        <ProcessingAnimation label="Preparing sign in…" size="sm" />
      </div>
    </AuthLayout>
  );
}

function AuthPage() {
  const { platformBrand, signupEnabled, orgBrand, orgRequested } = Route.useLoaderData();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const assertOrgMembership = useServerFn(assertUserBelongsToOrgSlug);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [mode, setMode] = useState<"auth" | "forgot">("auth");
  const [forgotEmail, setForgotEmail] = useState("");
  const [orgAlert, setOrgAlert] = useState<OrgAccessAlert | null>(null);
  /** Prevents re-firing the org membership gate after the user dismisses the alert. */
  const [orgGateBlocked, setOrgGateBlocked] = useState(false);
  const captchaRequired = isTurnstileEnabled();
  // Org white-label links are invite-style: no public self-signup.
  const allowSignup = signupEnabled && !orgRequested;
  const targetOrgSlug = orgBrand?.slug || (orgRequested ? readOrgFromLocation() : undefined);
  const orgLabel = orgBrand?.name || targetOrgSlug || "this organisation";

  const showOrgAccessAlert = useCallback((alert: OrgAccessAlert) => {
    setOrgAlert(alert);
    setOrgGateBlocked(true);
    toast.error(alert.title, { description: alert.message, duration: 8_000 });
  }, []);

  /**
   * Verify the current session may use this org white-label link.
   * @param signOutOnFail — true after a fresh password sign-in (clear the
   *   rejected session). false when an existing session opened the wrong
   *   org link — keep that session so other tabs are not wiped.
   */
  const rejectWrongOrgSession = useCallback(
    async (slug: string, signOutOnFail: boolean): Promise<boolean> => {
      try {
        const result = await assertOrgMembership({ data: { slug } });
        if (result.allowed) {
          rememberOrgAuthEntry(result.orgSlug);
          return true;
        }
        if (signOutOnFail) {
          await supabase.auth.signOut({ scope: "local" });
        }
        showOrgAccessAlert({
          title: "Not an organisation user",
          message: `You are not a member of ${orgLabel}. Contact your administrator for access, then try again.`,
          sessionPreserved: !signOutOnFail,
        });
        return false;
      } catch (e) {
        if (signOutOnFail) {
          await supabase.auth.signOut({ scope: "local" });
        }
        showOrgAccessAlert({
          title: "Not an organisation user",
          message:
            e instanceof Error
              ? e.message
              : `You are not a member of ${orgLabel}. Contact your administrator for access, then try again.`,
          sessionPreserved: !signOutOnFail,
        });
        return false;
      }
    },
    [assertOrgMembership, showOrgAccessAlert, orgLabel],
  );

  // Avoid repeat navigations when auth state flickers (session refresh / Turnstile remounts).
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (!session) redirectedRef.current = false;
  }, [session]);

  useEffect(() => {
    if (loading || !session) return;
    // Stay on the auth page while the wrong-org alert is open / was dismissed.
    if (orgAlert || orgGateBlocked) return;
    if (redirectedRef.current) return;
    let cancelled = false;
    (async () => {
      if (orgRequested) {
        if (!targetOrgSlug) {
          if (!cancelled) {
            showOrgAccessAlert({
              title: "Invalid organisation sign-in link",
              message:
                "This link is missing a valid organisation. Use the link from your administrator, or sign in on the general page.",
              sessionPreserved: true,
            });
          }
          return;
        }
        // Existing session + wrong org link: keep session, alert the user.
        const ok = await rejectWrongOrgSession(targetOrgSlug, false);
        if (cancelled || !ok) return;
      }
      if (!cancelled) {
        redirectedRef.current = true;
        navigate({ to: "/app", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    session,
    loading,
    orgRequested,
    targetOrgSlug,
    rejectWrongOrgSession,
    navigate,
    orgAlert,
    orgGateBlocked,
    showOrgAccessAlert,
  ]);

  useEffect(() => {
    // Org white-label entry: remember so sign-out returns here.
    if (orgRequested && (orgBrand?.slug || targetOrgSlug)) {
      rememberOrgAuthEntry(orgBrand?.slug || targetOrgSlug);
    }
  }, [orgRequested, orgBrand?.slug, targetOrgSlug]);

  const handleToken = useCallback((t: string) => setCaptchaToken(t), []);
  const handleExpire = useCallback(() => setCaptchaToken(null), []);

  const ensureCaptcha = async (): Promise<boolean> => {
    if (!captchaRequired) return true;
    if (!captchaToken) {
      toast.error("Please complete the human check.");
      return false;
    }
    try {
      await verifyTurnstile({ data: { token: captchaToken } });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Human check failed. Try again.");
      setCaptchaToken(null);
      return false;
    }
  };

  const onForgot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setBusy(true);
    if (!(await ensureCaptcha())) {
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    setCaptchaToken(null);
    if (error) return toast.error(error.message);
    toast.success("Password reset link sent. Check your email.");
    setMode("auth");
  };

  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setOrgAlert(null);
    setOrgGateBlocked(false);
    if (!(await ensureCaptcha())) {
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }

    if (orgRequested) {
      if (!targetOrgSlug) {
        await supabase.auth.signOut({ scope: "local" });
        setBusy(false);
        showOrgAccessAlert({
          title: "Invalid organisation sign-in link",
          message:
            "This link is missing a valid organisation. Use the link from your administrator, or sign in on the general page.",
          sessionPreserved: false,
        });
        return;
      }
      // Fresh password sign-in on the wrong org link — clear that session.
      const ok = await rejectWrongOrgSession(targetOrgSlug, true);
      setBusy(false);
      if (!ok) return;
      toast.success("Signed in");
      navigate({ to: "/app", replace: true });
      return;
    }

    // General /auth sign-in — do not treat membership as org-link entry.
    clearOrgAuthEntry();
    setBusy(false);
    toast.success("Signed in");
    navigate({ to: "/app", replace: true });
  };

  const dismissOrgAlert = () => setOrgAlert(null);

  const goToWorkspaceFromAlert = () => {
    setOrgAlert(null);
    navigate({ to: "/app", replace: true });
  };

  const signOutFromAlert = async () => {
    setOrgAlert(null);
    setOrgGateBlocked(false);
    await supabase.auth.signOut({ scope: "local" });
    clearOrgAuthEntry();
    toast.message("Signed out", {
      description: "You can now sign in with a different account.",
    });
  };

  const onSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
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
      navigate({ to: "/app", replace: true });
    } finally {
      setBusy(false);
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
            <TurnstileWidget onToken={handleToken} onExpire={handleExpire} />
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
      {allowSignup ? (
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
              submitDisabled={submitDisabled}
              busy={busy}
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
                minLength={6}
                autoComplete="new-password"
                placeholder="At least 6 characters"
              />
              {captchaRequired && (
                <TurnstileWidget onToken={handleToken} onExpire={handleExpire} />
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
          submitDisabled={submitDisabled}
          busy={busy}
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
  submitDisabled,
  busy,
}: {
  onSignIn: (e: React.FormEvent<HTMLFormElement>) => void;
  onForgot: () => void;
  captchaRequired: boolean;
  onToken: (t: string) => void;
  onExpire: () => void;
  submitDisabled: boolean;
  busy: boolean;
}) {
  return (
    <form onSubmit={onSignIn} className="space-y-4 pt-4">
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
      {captchaRequired && <TurnstileWidget onToken={onToken} onExpire={onExpire} />}
      <Button type="submit" className="h-10 w-full" disabled={submitDisabled}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
