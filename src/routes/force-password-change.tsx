import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { clearMustChangePassword } from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/force-password-change")({
  head: () => ({ meta: [{ title: "Change your password — PMO Enterprise" }, { name: "robots", content: "noindex" }] }),
  component: ForcePwdPage,
});

function ForcePwdPage() {
  const navigate = useNavigate();
  const { session, loading, refresh } = useAuth();
  const clearFlag = useServerFn(clearMustChangePassword);
  const [busy, setBusy] = useState(false);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pwd.length < 8) return toast.error("Password must be at least 8 characters.");
    if (pwd !== confirm) return toast.error("Passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) { setBusy(false); return toast.error(error.message); }
    try { await clearFlag({}); } catch (e: any) { setBusy(false); return toast.error(e.message); }
    await refresh();
    toast.success("Password updated");
    navigate({ to: "/app", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Set a new password</CardTitle>
            <CardDescription>
              Your administrator created this account with a temporary password. Please choose a new password to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label htmlFor="pwd">New password</Label>
                <Input id="pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={8} autoComplete="new-password" />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Updating…" : "Update password & continue"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
