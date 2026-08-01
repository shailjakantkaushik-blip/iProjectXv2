import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Palette, CalendarClock, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MONTH_NAMES } from "@/lib/fiscal-year";
import { toast } from "sonner";
import { getMfaStatus } from "@/lib/mfa";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { organization, profile, roles, refresh } = useAuth();
  const canEdit = isAdmin(roles);
  const [fyMonth, setFyMonth] = useState<number>(organization?.fy_start_month || 4);
  const [saving, setSaving] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMfaStatus()
      .then((s) => {
        if (cancelled) return;
        setMfaEnabled(s.hasVerifiedFactor);
      })
      .catch(() => {
        if (!cancelled) setMfaEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveFy = async () => {
    if (!organization) return;
    setSaving(true);
    const { error } = await supabase.from("organizations").update({ fy_start_month: fyMonth }).eq("id", organization.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Financial year now starts in ${MONTH_NAMES[fyMonth - 1]}.`);
    await refresh();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      <Card>
        <CardHeader><CardTitle>Your account</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Name:</span> {profile?.full_name}</div>
          <div><span className="text-muted-foreground">Email:</span> {profile?.email}</div>
          <div><span className="text-muted-foreground">Roles:</span> {roles.join(", ") || "viewer (read-only)"}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Organization</CardTitle><CardDescription>Details of your tenant.</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Name:</span> {organization?.name}</div>
          <div><span className="text-muted-foreground">Slug:</span> {organization?.slug}</div>
          <div><span className="text-muted-foreground">Plan:</span> {organization?.plan}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Financial Year</CardTitle>
          <CardDescription>
            Choose the month your organization's fiscal year begins. Applied across timelines, FY allocations,
            and dashboards. Current: <strong>{MONTH_NAMES[(organization?.fy_start_month || 4) - 1]}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-muted-foreground">FY starts in</label>
            <select
              className="st-input"
              value={fyMonth}
              disabled={!canEdit}
              onChange={(e) => setFyMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
            </select>
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-white disabled:opacity-50"
              onClick={saveFy}
              disabled={!canEdit || saving || fyMonth === (organization?.fy_start_month || 4)}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {!canEdit && <span className="text-[11px] text-muted-foreground">Only org admins can change this.</span>}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Example: April → FY ending in March. FY label uses the ending calendar year (Apr 2026 – Mar 2027 = FY27).
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Two-factor authentication (MFA)
          </CardTitle>
          <CardDescription>
            Required for every account. Use an authenticator app (Google Authenticator, 1Password,
            Authy, etc.) each time you sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            Status:{" "}
            <strong>
              {mfaEnabled == null ? "Checking…" : mfaEnabled ? "Enabled" : "Not enabled"}
            </strong>
          </div>
          <div className="flex flex-wrap gap-2">
            {!mfaEnabled && (
              <Button asChild size="sm">
                <Link to="/mfa" search={{ mode: "enroll", next: "/app/settings" }}>
                  Set up MFA
                </Link>
              </Button>
            )}
            {mfaEnabled && (
              <span className="text-[11px] text-muted-foreground">
                MFA is required for all users and cannot be turned off.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> White Label & Branding</CardTitle>
          <CardDescription>
            Brand name, logo, colour palette, SSO, and IP address restriction are managed by the
            platform team under White Label &amp; Branding. Organisation admins cannot edit them
            here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-3 rounded-md border p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md overflow-hidden shrink-0" style={{ background: organization?.primary_color || "#e5e7eb" }}>
              {organization?.logo_url
                ? <img src={organization.logo_url} alt="" className="max-h-full max-w-full object-contain" />
                : <span className="text-white text-sm font-bold">{(organization?.brand_name || organization?.name || "?").slice(0, 2).toUpperCase()}</span>}
            </div>
            <div>
              <div className="font-semibold" style={{ color: organization?.primary_color || undefined }}>
                {organization?.brand_name || organization?.name}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Primary {organization?.primary_color ?? "—"} · Accent {organization?.accent_color ?? "—"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
