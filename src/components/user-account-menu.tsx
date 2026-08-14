import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { KeyRound, LogOut, Settings, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  enrollTotpForSetup,
  getMfaStatus,
  unenrollTotp,
  verifyTotpEnrollment,
} from "@/lib/mfa";
import { cn } from "@/lib/utils";

function initials(name?: string | null, email?: string | null) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

/**
 * Top-right (and reusable) account menu: settings, change password,
 * reset authenticator QR, and sign out.
 */
export function UserAccountMenu({
  className,
  avatarClassName,
  showLabel = false,
}: {
  className?: string;
  avatarClassName?: string;
  showLabel?: boolean;
}) {
  const { profile, signOut, organization } = useAuth();
  const primary = organization?.primary_color || undefined;

  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const startPasswordChange = () => {
    setPwd("");
    setPwd2("");
    setPwdOpen(true);
  };

  const submitPassword = async () => {
    if (pwd.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (pwd !== pwd2) {
      toast.error("Passwords do not match");
      return;
    }
    setPwdBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      toast.success("Password updated");
      setPwdOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update password");
    } finally {
      setPwdBusy(false);
    }
  };

  const startMfaReset = async () => {
    setMfaOpen(true);
    setQr(null);
    setSecret(null);
    setFactorId(null);
    setCode("");
    setMfaBusy(true);
    try {
      const status = await getMfaStatus();
      for (const id of status.verifiedFactorIds) {
        await unenrollTotp(id);
      }
      const data = await enrollTotpForSetup({
        friendlyName: "Authenticator",
        issuer: organization?.brand_name || organization?.name || "iProjectX",
      });
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start authenticator reset");
      setMfaOpen(false);
    } finally {
      setMfaBusy(false);
    }
  };

  const verifyMfa = async () => {
    if (!factorId || code.replace(/\s/g, "").length < 6) {
      toast.error("Enter the 6-digit code from your authenticator app");
      return;
    }
    setMfaBusy(true);
    try {
      await verifyTotpEnrollment(factorId, code);
      toast.success("Authenticator updated");
      setMfaOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Invalid code — try again");
    } finally {
      setMfaBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-full outline-none ring-offset-background transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
            aria-label="Account menu"
          >
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-primary-foreground ring-2 ring-background",
                avatarClassName,
              )}
              style={{ background: primary || "var(--primary)" }}
            >
              {initials(profile?.full_name, profile?.email)}
            </span>
            {showLabel ? (
              <span className="hidden max-w-[9rem] truncate text-left text-[12px] font-medium sm:block">
                {profile?.full_name || profile?.email || "Account"}
              </span>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="truncate text-sm font-medium">
              {profile?.full_name || "Account"}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {profile?.email}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/app/settings" className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              Account settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => startPasswordChange()}>
            <KeyRound className="mr-2 h-4 w-4" />
            Change password
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void startMfaReset();
            }}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Reset authenticator
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void (async () => {
                try {
                  const { error } = await supabase.auth.signOut({ scope: "others" });
                  if (error) throw error;
                  toast.success("Signed out of other devices / sessions");
                } catch (err: any) {
                  toast.error(err?.message ?? "Could not revoke other sessions");
                }
              })();
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out other devices
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-rose-700 focus:text-rose-800"
            onSelect={() => void signOut()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Choose a new password for {profile?.email}. You will stay signed in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-xs text-muted-foreground">New password</label>
              <Input
                type="password"
                autoComplete="new-password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Confirm password</label>
              <Input
                type="password"
                autoComplete="new-password"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdOpen(false)} disabled={pwdBusy}>
              Cancel
            </Button>
            <Button onClick={() => void submitPassword()} disabled={pwdBusy}>
              {pwdBusy ? "Saving…" : "Update password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mfaOpen} onOpenChange={setMfaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset authenticator</DialogTitle>
            <DialogDescription>
              Scan the new QR code in your authenticator app, then enter a 6-digit code to
              confirm. Your previous factor is removed when you start this reset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {mfaBusy && !qr ? (
              <p className="text-sm text-muted-foreground">Preparing new authenticator…</p>
            ) : null}
            {qr ? (
              <div className="flex flex-col items-center gap-2">
                <img
                  src={qr}
                  alt="Authenticator QR code"
                  className="h-44 w-44 rounded-md border bg-white p-2"
                />
                {secret ? (
                  <p className="break-all text-center text-[11px] text-muted-foreground">
                    Manual key: <code>{secret}</code>
                  </p>
                ) : null}
              </div>
            ) : null}
            {factorId ? (
              <div>
                <label className="text-xs text-muted-foreground">Verification code</label>
                <div className="mt-2 flex justify-center">
                  <InputOTP maxLength={6} value={code} onChange={setCode}>
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMfaOpen(false)} disabled={mfaBusy}>
              Cancel
            </Button>
            <Button onClick={() => void verifyMfa()} disabled={mfaBusy || !factorId}>
              {mfaBusy ? "Verifying…" : "Confirm authenticator"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
