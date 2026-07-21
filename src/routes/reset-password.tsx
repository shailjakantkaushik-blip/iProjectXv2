import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ProcessingOverlay } from "@/components/processing-animation";
import { DEFAULT_LANDING, fetchLandingConfig, resolveBrandLogoUrl } from "@/lib/landing-config";
import { AuthLayout, PasswordField, type AuthBrand } from "@/components/auth-layout";
import { readOrgAuthEntrySlug } from "@/lib/org-auth-entry";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — iProjectX" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
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

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [brand, setBrand] = useState<AuthBrand>(() => toAuthBrand(DEFAULT_LANDING.brand));
  const orgEntrySlug = readOrgAuthEntrySlug();

  useEffect(() => {
    fetchLandingConfig()
      .then((c) => setBrand(toAuthBrand(c.brand)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (password !== confirm) return toast.error("Passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated. You are now signed in.");
    navigate({ to: "/app", replace: true });
  };

  return (
    <>
      <ProcessingOverlay open={busy} label="Updating password…" />
      <AuthLayout
      platform={brand}
      title="Set a new password"
      description={
        ready
          ? "Choose a strong password for your account, then continue to the app."
          : "Validating your reset link — this usually takes a moment."
      }
      footer={
        <Link
          to="/auth"
          search={orgEntrySlug ? { org: orgEntrySlug } : {}}
          className="font-medium text-primary hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <PasswordField
          id="password"
          label="New password"
          value={password}
          onChange={setPassword}
          required
          minLength={6}
          autoComplete="new-password"
          disabled={!ready}
          placeholder="At least 6 characters"
        />
        <PasswordField
          id="confirm"
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          required
          minLength={6}
          autoComplete="new-password"
          disabled={!ready}
        />
        {!ready && (
          <p className="text-xs text-muted-foreground">
            If this does not become ready, open the link from your email again.
          </p>
        )}
        <Button type="submit" className="h-10 w-full" disabled={busy || !ready}>
          {busy ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthLayout>
    </>
  );
}
