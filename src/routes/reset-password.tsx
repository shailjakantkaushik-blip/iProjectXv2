import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { BarChart3 } from "lucide-react";
import { DEFAULT_LANDING, fetchLandingConfig } from "@/lib/landing-config";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — iProjectX" }, { name: "robots", content: "noindex" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [brand, setBrand] = useState(DEFAULT_LANDING.brand);

  useEffect(() => {
    fetchLandingConfig()
      .then((c) => setBrand(c.brand))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Supabase auto-processes the recovery token in the URL hash and fires
    // a PASSWORD_RECOVERY event with a temporary session. Wait for it.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
      }
    });
    // If the session is already set (page revisit), allow reset immediately.
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
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          {brand.logo_url ? (
            <img src={brand.logo_url} alt={brand.name} className="h-10 w-auto max-w-[200px] object-contain" />
          ) : (
            <div className="rounded-lg bg-primary p-2 text-primary-foreground"><BarChart3 className="h-5 w-5" /></div>
          )}
          <span className="text-lg font-semibold">{brand.name}</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Set a new password</CardTitle>
            <CardDescription>
              {ready
                ? "Enter and confirm your new password below."
                : "Validating your reset link…"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password">New password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" disabled={!ready} />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} autoComplete="new-password" disabled={!ready} />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !ready}>
                {busy ? "Updating…" : "Update password"}
              </Button>
              <div className="text-center text-sm">
                <Link to="/auth" className="text-primary hover:underline">Back to sign in</Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
