import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { TurnstileWidget, isTurnstileEnabled } from "@/components/turnstile";
import { verifyTurnstile } from "@/lib/turnstile.functions";
import {
  fetchLandingConfig,
  DEFAULT_LANDING,
  readCachedLandingConfigForPaint,
  resolveBrandLogoUrl,
  type LandingConfig,
} from "@/lib/landing-config";
import { getOrgBranding } from "@/lib/org-branding.functions";
import {
  AuthLayout,
  PasswordField,
  type AuthBrand,
  type AuthOrgBrand,
} from "@/components/auth-layout";

const ORG_SLUG_KEY = "pmo:lastOrgSlug";

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
    const cached = typeof window !== "undefined" ? readCachedLandingConfigForPaint() : null;
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
  staleTime: 0,
  pendingMs: 0,
  pendingComponent: AuthPending,
  component: AuthPage,
});

function authShellBrand(): AuthBrand {
  const cached = typeof window !== "undefined" ? readCachedLandingConfigForPaint() : null;
  return toAuthPlatformBrand(cached?.brand ?? DEFAULT_LANDING.brand);
}

function readOrgFromLocation(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const slug = new URLSearchParams(window.location.search).get("org")?.trim();
  return slug || undefined;
}

/** Pending shell: logos stripped from cache to avoid old→new blink. */
function AuthPending() {
  const orgRequested = Boolean(readOrgFromLocation());
  return (
    <AuthLayout
      platform={authShellBrand()}
      orgRequested={orgRequested}
      title="Welcome back"
      description="Sign in with your organisation account."
    >
      <div className="space-y-4 pt-4" aria-busy="true" aria-label="Loading sign in">
        <div className="h-10 animate-pulse rounded-md bg-muted" />
        <div className="h-10 animate-pulse rounded-md bg-muted" />
        <div className="h-10 animate-pulse rounded-md bg-muted" />
      </div>
    </AuthLayout>
  );
}

function AuthPage() {
  const { platformBrand, signupEnabled, orgBrand, orgRequested } = Route.useLoaderData();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [mode, setMode] = useState<"auth" | "forgot">("auth");
  const [forgotEmail, setForgotEmail] = useState("");
  const captchaRequired = isTurnstileEnabled();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/app", replace: true });
  }, [session, loading, navigate]);

  useEffect(() => {
    if (orgRequested && orgBrand?.slug) {
      try {
        window.localStorage.setItem(ORG_SLUG_KEY, orgBrand.slug);
      } catch {
        /* ignore */
      }
    }
  }, [orgRequested, orgBrand?.slug]);

  const handleToken = useCallback((t: string) => setCaptchaToken(t), []);
  const handleExpire = useCallback(() => setCaptchaToken(null), []);

  const onForgot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset link sent. Check your email.");
    setMode("auth");
  };

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

  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    if (!(await ensureCaptcha())) {
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("org_id")
          .eq("id", uid)
          .maybeSingle();
        const orgId = (prof as { org_id?: string } | null)?.org_id;
        if (orgId) {
          const { data: org } = await supabase
            .from("organizations")
            .select("slug")
            .eq("id", orgId)
            .maybeSingle();
          const slug = (org as { slug?: string } | null)?.slug;
          if (slug) window.localStorage.setItem(ORG_SLUG_KEY, slug);
        }
      }
    } catch {
      /* ignore */
    }
    toast.success("Signed in");
    navigate({ to: "/app", replace: true });
  };

  const onSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
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
      toast.success("Account created — check email if confirmation is required.");
      navigate({ to: "/app", replace: true });
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled = busy || (captchaRequired && !captchaToken);
  const brand = platformBrand;

  if (mode === "forgot") {
    return (
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
          <Button type="submit" className="h-10 w-full" disabled={busy || !forgotEmail}>
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      platform={brand}
      org={orgBrand}
      orgRequested={orgRequested}
      title={orgRequested && orgBrand ? `Welcome to ${orgBrand.name}` : "Welcome back"}
      description={
        signupEnabled
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
      {signupEnabled ? (
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
