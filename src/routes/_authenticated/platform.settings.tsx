import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, RefreshCw, UserPlus, Sparkles, Menu } from "lucide-react";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import { CartoonSettingsPreview } from "@/components/cartoon-mascots";
import { NavSequenceEditor } from "@/components/nav-sequence-editor";
import {
  DEFAULT_LANDING,
  defaultNavigationConfig,
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
      toast.success("Platform settings saved — sidebar updates for everyone.");
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
          subtitle="Signup, cartoons, and sidebar navigation sequence for the whole platform."
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
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Interactive cartoons</SectionTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Lightweight animated guide characters that tip users toward My Work, risks, and
          scenarios. Respects reduced-motion preferences.
        </p>
        <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">Show animated cartoons in the app</div>
              <div className="text-xs text-muted-foreground">
                Home welcome strip + floating companion. Users can dismiss the companion for
                the session.
              </div>
            </div>
          </div>
          <Switch
            checked={cfg.cartoons_enabled}
            onCheckedChange={(v) => setCfg({ ...cfg, cartoons_enabled: v })}
          />
        </label>
        <div className="mt-4">
          <CartoonSettingsPreview enabled={cfg.cartoons_enabled} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Default cartoons: {DEFAULT_LANDING.cartoons_enabled ? "on" : "off"}.
        </p>
      </SectionFrame>

      <SectionFrame>
        <div className="mb-1 flex items-center gap-2">
          <Menu className="h-4 w-4 text-muted-foreground" />
          <SectionTitle>Navigation sequence</SectionTitle>
        </div>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Add or remove section headers, move links between sections, reorder, and hide items for
          every organisation. Also available under Landing Page → Access &amp; Cartoons.
        </p>
        <NavSequenceEditor
          value={cfg.navigation ?? defaultNavigationConfig()}
          onChange={(navigation) => setCfg({ ...cfg, navigation })}
          structureEditable
        />
      </SectionFrame>
    </div>
  );
}
