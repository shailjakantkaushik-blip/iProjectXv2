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
import { fetchLandingConfig, DEFAULT_LANDING, type LandingConfig } from "@/lib/landing-config";
import { getOrgBranding } from "@/lib/org-branding.functions";
import { AuthLayout, PasswordField, type AuthOrgBrand } from "@/components/auth-layout";

const ORG_SLUG_KEY = "pmo:lastOrgSlug";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PMO Enterprise" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [mode, setMode] = useState<"auth" | "forgot">("auth");
  const [forgotEmail, setForgotEmail] = useState("");
  const [platformBrand, setPlatformBrand] = useState(DEFAULT_LANDING.brand);
  const [orgBrand, setOrgBrand] = useState<AuthOrgBrand>(null);
  const captchaRequired = isTurnstileEnabled();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/app", replace: true });
  }, [session, loading, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchLandingConfig();
        if (!cancelled) setPlatformBrand(cfg.brand);
      } catch {
        /* keep defaults */
      }
      try {
        const params = new URLSearchParams(window.location.search);
        const slug = params.get("org") || window.localStorage.getItem(ORG_SLUG_KEY) || "";
        if (!slug) return;
        const brand = await getOrgBranding({ data: { slug } });
        if (!cancelled && brand) setOrgBrand(brand);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    if (!(await ensureCaptcha())) {
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { full_name: String(fd.get("full_name") || "") },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — check email if confirmation is required.");
    navigate({ to: "/app", replace: true });
  };

  const submitDisabled = busy || (captchaRequired && !captchaToken);
  const brand: LandingConfig["brand"] = platformBrand;

  if (mode === "forgot") {
    return (
      <AuthLayout
        platform={brand}
        org={orgBrand}
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
      title={orgBrand ? `Welcome to ${orgBrand.name}` : "Welcome back"}
      description="Sign in to continue, or create an account to get started."
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
      <Tabs defaultValue="signin">
        <TabsList className="grid h-10 w-full grid-cols-2">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="signup">Sign up</TabsTrigger>
        </TabsList>
        <TabsContent value="signin" className="mt-0">
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
                onClick={() => setMode("forgot")}
                className="text-xs font-medium text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>
            {captchaRequired && (
              <TurnstileWidget onToken={handleToken} onExpire={handleExpire} />
            )}
            <Button type="submit" className="h-10 w-full" disabled={submitDisabled}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
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
    </AuthLayout>
  );
}
