import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, RefreshCw, UserPlus } from "lucide-react";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_LANDING,
  fetchLandingConfig,
  saveLandingConfig,
  type LandingConfig,
} from "@/lib/landing-config";

export const Route = createFileRoute("/_authenticated/platform/settings")({
  component: PlatformSettingsPage,
});

function PlatformSettingsPage() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState<LandingConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void reload();
  }, []);

  async function reload() {
    setCfg(await fetchLandingConfig());
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      await saveLandingConfig(cfg, user?.id);
      toast.success(
        cfg.signup_enabled
          ? "Settings saved — public signup is enabled."
          : "Settings saved — public signup is disabled.",
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) {
    return <div className="p-8 text-sm text-muted-foreground">Loading platform settings…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title="Platform Settings"
          subtitle="Control access and platform-wide behaviour for the public site and auth screens."
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Reload
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <SectionFrame>
        <SectionTitle>Registration</SectionTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          When signup is off, the Sign up tab is hidden on <code>/auth</code> and new
          self-service accounts are blocked. Platform admins can still create users from
          Organizations &amp; Users.
        </p>
        <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
          <div className="flex items-start gap-3">
            <UserPlus className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">Allow public signup</div>
              <div className="text-xs text-muted-foreground">
                Default: on. Turn off for invite-only / admin-provisioned tenants.
              </div>
            </div>
          </div>
          <Switch
            checked={cfg.signup_enabled}
            onCheckedChange={(v) => setCfg({ ...cfg, signup_enabled: v })}
          />
        </label>
        <p className="mt-3 text-xs text-muted-foreground">
          Current state:{" "}
          <span className="font-medium text-foreground">
            {cfg.signup_enabled ? "Signup enabled" : "Signup disabled"}
          </span>
          {" · "}
          Stored with landing/platform config (no separate migration).
        </p>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Defaults reference</SectionTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Factory default for signup is{" "}
          <span className="font-medium text-foreground">
            {DEFAULT_LANDING.signup_enabled ? "enabled" : "disabled"}
          </span>
          . Landing page content is edited under Landing Page.
        </p>
      </SectionFrame>
    </div>
  );
}
