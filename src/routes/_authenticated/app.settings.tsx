import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Palette, CalendarClock, ShieldCheck, Mail } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MONTH_NAMES } from "@/lib/fiscal-year";
import { toast } from "sonner";
import { getMfaStatus } from "@/lib/mfa";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  normalizeNotificationPrefs,
  readAlertOutboundFromUiConfig,
  resolveEffectiveAlertEmails,
} from "@/lib/alert-outbound-config";

export const Route = createFileRoute("/_authenticated/app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { organization, profile, roles, refresh } = useAuth();
  const canEdit = isAdmin(roles);
  const [fyMonth, setFyMonth] = useState<number>(organization?.fy_start_month || 4);
  const [saving, setSaving] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState(() =>
    normalizeNotificationPrefs(profile?.notification_prefs),
  );
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const orgAlertConfig = useMemo(
    () => readAlertOutboundFromUiConfig(organization?.ui_config),
    [organization?.ui_config],
  );
  const effective = useMemo(
    () =>
      resolveEffectiveAlertEmails({
        orgConfig: orgAlertConfig,
        roleKeys: roles,
        userPrefs: prefs,
      }),
    [orgAlertConfig, roles, prefs],
  );

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("notification_prefs")
        .eq("id", profile.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setPrefsLoaded(true);
        return;
      }
      setPrefs(normalizeNotificationPrefs((data as any)?.notification_prefs));
      setPrefsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

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
    const { error } = await supabase
      .from("organizations")
      .update({ fy_start_month: fyMonth })
      .eq("id", organization.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Financial year now starts in ${MONTH_NAMES[fyMonth - 1]}.`);
    await refresh();
  };

  const savePrefs = async (next: ReturnType<typeof normalizeNotificationPrefs>) => {
    if (!profile?.id) return;
    if (!effective.userCanEdit) {
      toast.error("Your alert email preferences are managed by an organisation admin.");
      return;
    }
    setSavingPrefs(true);
    setPrefs(next);
    const { error } = await supabase
      .from("profiles")
      .update({
        notification_prefs: {
          ...next,
          // Preserve admin overrides set by org admin
          admin_disabled: prefs.admin_disabled,
          admin_locked: prefs.admin_locked,
        } as never,
      })
      .eq("id", profile.id);
    setSavingPrefs(false);
    if (error) {
      toast.error(error.message);
      setPrefs(normalizeNotificationPrefs(profile.notification_prefs));
      return;
    }
    toast.success("Email alert preferences saved.");
    await refresh();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Name:</span> {profile?.full_name}
          </div>
          <div>
            <span className="text-muted-foreground">Email:</span> {profile?.email}
          </div>
          <div>
            <span className="text-muted-foreground">Roles:</span>{" "}
            {roles.join(", ") || "viewer (read-only)"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Email alert digests
          </CardTitle>
          <CardDescription>
            Daily outbound email for approvals, overdue RAID, RAID escalation, and portfolio pulse.
            Configured by platform (org) and org admins (roles / users). In-app notifications always
            remain in the bell. Prefer the account menu (top-right initials) for password and
            authenticator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!orgAlertConfig.active ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Outbound alert emails are not active for this organisation. A platform admin must
              enable them under Platform → Outbound alert emails.
            </p>
          ) : prefs.admin_disabled ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              An organisation admin has disabled outbound alert emails for your account.
            </p>
          ) : !effective.userCanEdit ? (
            <p className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
              {prefs.admin_locked
                ? "An organisation admin has locked your email alert preferences."
                : "Your roles are not granted outbound alert emails. Ask an org admin to enable channels for your role."}
            </p>
          ) : null}
          {(
            [
              {
                key: "email_digest" as const,
                label: "Send daily email digests",
                hint: "Master switch for outbound PMO alert emails.",
              },
              {
                key: "approvals" as const,
                label: "Pending decision approvals",
                hint: "Decisions assigned to you that are still Pending / In Review.",
              },
              {
                key: "overdue_raid" as const,
                label: "Overdue RAID",
                hint: "Risks, issues, and actions that are overdue on your projects.",
              },
              {
                key: "raid_escalation" as const,
                label: "RAID escalation",
                hint: "Items that were auto-escalated (critical / overdue policy).",
              },
              {
                key: "pulse" as const,
                label: "Portfolio pulse snapshot",
                hint: "Critical risks, overdue decisions, and escalated RAID counts for your org.",
              },
            ] as const
          ).map((row) => (
            <label
              key={row.key}
              className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium">{row.label}</div>
                <div className="text-xs text-muted-foreground">{row.hint}</div>
              </div>
              <Switch
                checked={Boolean(prefs[row.key])}
                disabled={
                  savingPrefs ||
                  !prefsLoaded ||
                  !effective.userCanEdit ||
                  (row.key !== "email_digest" && !prefs.email_digest)
                }
                onCheckedChange={(v) => {
                  const next = { ...prefs, [row.key]: v };
                  if (row.key === "email_digest" && !v) {
                    next.approvals = false;
                    next.overdue_raid = false;
                    next.pulse = false;
                    next.raid_escalation = false;
                  }
                  if (row.key === "email_digest" && v) {
                    next.approvals = true;
                    next.overdue_raid = true;
                    next.pulse = true;
                    next.raid_escalation = true;
                  }
                  void savePrefs(next);
                }}
              />
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Details of your tenant.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Name:</span> {organization?.name}
          </div>
          <div>
            <span className="text-muted-foreground">Slug:</span> {organization?.slug}
          </div>
          <div>
            <span className="text-muted-foreground">Plan:</span> {organization?.plan}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" /> Financial Year
          </CardTitle>
          <CardDescription>
            Choose the month your organization&apos;s fiscal year begins. Applied across
            timelines, FY allocations, and dashboards. Current:{" "}
            <strong>{MONTH_NAMES[(organization?.fy_start_month || 4) - 1]}</strong>.
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
              {MONTH_NAMES.map((n, i) => (
                <option key={i} value={i + 1}>
                  {n}
                </option>
              ))}
            </select>
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-white disabled:opacity-50"
              onClick={saveFy}
              disabled={!canEdit || saving || fyMonth === (organization?.fy_start_month || 4)}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {!canEdit && (
              <span className="text-[11px] text-muted-foreground">
                Only org admins can change this.
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Example: April → FY ending in March. FY label uses the ending calendar year (Apr 2026
            – Mar 2027 = FY27).
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
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" /> White Label & Branding
          </CardTitle>
          <CardDescription>
            Brand name, logo, colour palette, SSO, and IP address restriction are managed by the
            platform team under White Label &amp; Branding. Organisation admins cannot edit them
            here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-3 rounded-md border p-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md"
              style={{ background: organization?.primary_color || "#e5e7eb" }}
            >
              {organization?.logo_url ? (
                <img
                  src={organization.logo_url}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-sm font-bold text-white">
                  {(organization?.brand_name || organization?.name || "?")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <div
                className="font-semibold"
                style={{ color: organization?.primary_color || undefined }}
              >
                {organization?.brand_name || organization?.name}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Primary {organization?.primary_color ?? "—"} · Accent{" "}
                {organization?.accent_color ?? "—"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
