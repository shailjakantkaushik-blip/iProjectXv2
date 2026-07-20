import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { BarChart3 } from "lucide-react";
import { TurnstileWidget, isTurnstileEnabled } from "@/components/turnstile";
import { verifyTurnstile } from "@/lib/turnstile.functions";
import { fetchLandingConfig, DEFAULT_LANDING, type LandingConfig } from "@/lib/landing-config";
import { getOrgBranding } from "@/lib/org-branding.functions";

const ORG_SLUG_KEY = "pmo:lastOrgSlug";

type OrgBrand = { name: string; slug: string; logo_url: string } | null;

function BrandHeader({ platform, org }: { platform: LandingConfig["brand"]; org: OrgBrand }) {
  if (org) {
    return (
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          {org.logo_url ? (
            <img src={org.logo_url} alt={`${org.name} logo`} className="h-12 w-auto max-w-[180px] object-contain" />
          ) : (
            <div className="rounded-lg bg-primary p-2 text-primary-foreground"><BarChart3 className="h-6 w-6" /></div>
          )}
          <span className="text-xl font-semibold">{org.name}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>powered by</span>
          {platform.logo_url ? (
            <img src={platform.logo_url} alt={`${platform.name} logo`} className="h-4 w-auto max-w-[80px] object-contain" />
          ) : null}
          <span className="font-medium text-foreground/80">{platform.name}</span>
        </div>
      </div>
    );
  }
  return (
    <Link to="/" className="mb-6 flex items-center justify-center gap-2">
      {platform.logo_url ? (
        <img src={platform.logo_url} alt={`${platform.name} logo`} className="h-10 w-auto max-w-[200px] object-contain" />
      ) : (
        <div className="rounded-lg bg-primary p-2 text-primary-foreground"><BarChart3 className="h-5 w-5" /></div>
      )}
      <span className="text-lg font-semibold">{platform.name}</span>
    </Link>
  );
}

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — PMO Enterprise" }, { name: "robots", content: "noindex" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [platformBrand, setPlatformBrand] = useState(DEFAULT_LANDING.brand);
  const [orgBrand, setOrgBrand] = useState<OrgBrand>(null);
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
      } catch { /* keep defaults */ }
      try {
        const params = new URLSearchParams(window.location.search);
        const slug = params.get("org") || window.localStorage.getItem(ORG_SLUG_KEY) || "";
        if (!slug) return;
        const brand = await getOrgBranding({ data: { slug } });
        if (!cancelled && brand) setOrgBrand(brand);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
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
    setForgotOpen(false);
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
    if (!(await ensureCaptcha())) { setBusy(false); return; }
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    // Cache org slug so next visit to signin shows their branding.
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (uid) {
        const { data: prof } = await supabase.from("profiles").select("org_id").eq("id", uid).maybeSingle();
        const orgId = (prof as { org_id?: string } | null)?.org_id;
        if (orgId) {
          const { data: org } = await supabase.from("organizations").select("slug").eq("id", orgId).maybeSingle();
          const slug = (org as { slug?: string } | null)?.slug;
          if (slug) window.localStorage.setItem(ORG_SLUG_KEY, slug);
        }
      }
    } catch { /* ignore */ }
    toast.success("Signed in");
    navigate({ to: "/app", replace: true });
  };

  const onSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    if (!(await ensureCaptcha())) { setBusy(false); return; }
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <BrandHeader platform={platformBrand} org={orgBrand} />
        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in or create an account to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={onSignIn} className="space-y-4 pt-4">
                  <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
                  <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required autoComplete="current-password" /></div>
                  {captchaRequired && (
                    <TurnstileWidget onToken={handleToken} onExpire={handleExpire} />
                  )}
                  <Button type="submit" className="w-full" disabled={submitDisabled}>{busy ? "…" : "Sign in"}</Button>
                  <div className="text-center text-sm">
                    <button type="button" onClick={() => setForgotOpen((v) => !v)} className="text-primary hover:underline">
                      Forgot password?
                    </button>
                  </div>
                  {forgotOpen && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <Label htmlFor="forgot-email">Enter your email to receive a reset link</Label>
                      <Input id="forgot-email" type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required />
                      <Button type="button" onClick={(e) => onForgot(e as unknown as React.FormEvent<HTMLFormElement>)} disabled={busy || !forgotEmail} className="w-full" variant="secondary">
                        {busy ? "Sending…" : "Send reset link"}
                      </Button>
                    </div>
                  )}
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={onSignUp} className="space-y-4 pt-4">
                  <div><Label htmlFor="full_name">Full name</Label><Input id="full_name" name="full_name" required /></div>
                  <div><Label htmlFor="email2">Email</Label><Input id="email2" name="email" type="email" required autoComplete="email" /></div>
                  <div><Label htmlFor="password2">Password</Label><Input id="password2" name="password" type="password" required minLength={6} autoComplete="new-password" /></div>
                  {captchaRequired && (
                    <TurnstileWidget onToken={handleToken} onExpire={handleExpire} />
                  )}
                  <Button type="submit" className="w-full" disabled={submitDisabled}>{busy ? "…" : "Create account"}</Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
