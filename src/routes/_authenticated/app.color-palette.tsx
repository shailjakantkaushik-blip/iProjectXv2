import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { ColorPaletteEditor } from "@/components/color-palette-editor";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  defaultOrgColorTheme,
  normalizeOrgColorTheme,
  publishOrgTheme,
  type OrgColorTheme,
} from "@/lib/org-theme";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/color-palette")({
  component: OrgColorPalettePage,
});

function OrgColorPalettePage() {
  const { organization, roles, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const admin = isAdmin(roles);
  const [theme, setTheme] = useState<OrgColorTheme>(() => defaultOrgColorTheme());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      void navigate({ to: "/app" });
      return;
    }
  }, [admin, loading, navigate]);

  useEffect(() => {
    if (!organization) return;
    const ui = organization.ui_config as { color_theme?: unknown } | null | undefined;
    const stored = normalizeOrgColorTheme(ui?.color_theme);
    if (stored.enabled) {
      setTheme(stored);
      return;
    }
    // Seed editor from legacy primary/accent so admins see current brand
    const seeded = defaultOrgColorTheme();
    if (organization.primary_color) seeded.palette.accent = organization.primary_color;
    if (organization.accent_color) seeded.palette.navyLight = organization.accent_color;
    seeded.enabled = true;
    seeded.palette_preset = "custom";
    setTheme(seeded);
  }, [organization]);

  // Live preview while editing (reverts if user leaves without save via org provider)
  useEffect(() => {
    if (!organization || !admin) return;
    publishOrgTheme(organization.id, { ...theme, enabled: true });
  }, [theme, organization, admin]);

  const save = async () => {
    if (!organization) return;
    setSaving(true);
    try {
      const nextTheme: OrgColorTheme = { ...theme, enabled: true };
      const prevUi =
        organization.ui_config && typeof organization.ui_config === "object"
          ? { ...organization.ui_config }
          : {};
      const nextUi = { ...prevUi, color_theme: nextTheme };

      const { error } = await supabase
        .from("organizations")
        .update({
          primary_color: nextTheme.palette.accent,
          accent_color: nextTheme.palette.navyLight,
          ui_config: nextUi as never,
        })
        .eq("id", organization.id);
      if (error) throw error;

      publishOrgTheme(organization.id, nextTheme);
      await refresh();
      toast.success("Organisation colour palette saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save palette");
    } finally {
      setSaving(false);
    }
  };

  const resetToPlatform = async () => {
    if (!organization) return;
    if (!confirm("Clear the organisation palette and fall back to the platform theme?")) return;
    setSaving(true);
    try {
      const prevUi =
        organization.ui_config && typeof organization.ui_config === "object"
          ? { ...organization.ui_config }
          : {};
      const cleared = defaultOrgColorTheme();
      const nextUi = { ...prevUi, color_theme: cleared };
      const { error } = await supabase
        .from("organizations")
        .update({
          primary_color: null,
          accent_color: null,
          ui_config: nextUi as never,
        })
        .eq("id", organization.id);
      if (error) throw error;
      setTheme(cleared);
      publishOrgTheme(organization.id, cleared);
      // Disabled theme → provider clears override
      await refresh();
      toast.success("Organisation palette cleared — platform theme applies");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to reset");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !admin) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title="Colour palette"
        subtitle="Choose a template or set custom hex codes for your organisation. Your palette overrides the platform theme across the app."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void resetToPlatform()} disabled={saving}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Use platform theme
            </Button>
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save palette"}
            </Button>
          </div>
        }
      />

      <ColorPaletteEditor value={theme} onChange={setTheme} />
    </div>
  );
}
