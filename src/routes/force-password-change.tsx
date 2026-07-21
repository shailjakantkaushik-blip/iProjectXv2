import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { clearMustChangePassword } from "@/lib/platform-admin.functions";
import { DEFAULT_LANDING, fetchLandingConfig } from "@/lib/landing-config";
import { AuthLayout, PasswordField } from "@/components/auth-layout";

export const Route = createFileRoute("/force-password-change")({
  head: () => ({
    meta: [
      { title: "Change your password — PMO Enterprise" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForcePwdPage,
});

function ForcePwdPage() {
  const navigate = useNavigate();
  const { session, loading, refresh } = useAuth();
  const clearFlag = useServerFn(clearMustChangePassword);
  const [busy, setBusy] = useState(false);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [brand, setBrand] = useState(DEFAULT_LANDING.brand);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    fetchLandingConfig()
      .then((c) => setBrand(c.brand))
      .catch(() => {});
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pwd.length < 8) return toast.error("Password must be at least 8 characters.");
    if (pwd !== confirm) return toast.error("Passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    try {
      await clearFlag({});
    } catch (e: any) {
      setBusy(false);
      return toast.error(e.message);
    }
    await refresh();
    toast.success("Password updated");
    navigate({ to: "/app", replace: true });
  };

  return (
    <AuthLayout
      platform={brand}
      title="Choose a new password"
      description="Your administrator created this account with a temporary password. Set your own password to continue."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <PasswordField
          id="pwd"
          label="New password"
          value={pwd}
          onChange={setPwd}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
        <PasswordField
          id="confirm"
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Button type="submit" className="h-10 w-full" disabled={busy}>
          {busy ? "Updating…" : "Update password & continue"}
        </Button>
      </form>
    </AuthLayout>
  );
}
