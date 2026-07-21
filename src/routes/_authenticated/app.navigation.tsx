import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, RefreshCw, Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { NavSequenceEditor } from "@/components/nav-sequence-editor";
import {
  APP_NAV_GROUPS,
  defaultAppNavigationConfig,
  scopeNavigationToCatalog,
  type NavigationConfig,
} from "@/lib/navigation-config";
import { fetchLandingConfig } from "@/lib/landing-config";
import { PageLoading } from "@/components/page-loading";

export const Route = createFileRoute("/_authenticated/app/navigation")({
  component: OrgNavigationPage,
});

type OrgUiConfig = {
  navigation?: NavigationConfig;
  focus_mode?: boolean;
};

function OrgNavigationPage() {
  const { organization, roles, refresh } = useAuth();
  const canEdit = isAdmin(roles);
  const [nav, setNav] = useState<NavigationConfig>(defaultAppNavigationConfig());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, [organization?.id]);

  async function load() {
    if (!organization?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("organizations")
        .select("ui_config")
        .eq("id", organization.id)
        .maybeSingle();
      const ui = ((data as any)?.ui_config ?? {}) as OrgUiConfig;
      if (ui.navigation) {
        setNav(scopeNavigationToCatalog(ui.navigation, APP_NAV_GROUPS));
      } else {
        // Seed from platform defaults — workspace groups only (never Platform)
        const platform = await fetchLandingConfig();
        setNav(scopeNavigationToCatalog(platform.navigation ?? {}, APP_NAV_GROUPS));
      }
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!organization?.id || !canEdit) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("organizations")
        .select("ui_config")
        .eq("id", organization.id)
        .maybeSingle();
      const prev = ((existing as any)?.ui_config ?? {}) as OrgUiConfig;
      const next: OrgUiConfig = {
        ...prev,
        navigation: scopeNavigationToCatalog(nav, APP_NAV_GROUPS),
      };
      const { error } = await supabase
        .from("organizations")
        .update({ ui_config: next as any })
        .eq("id", organization.id);
      if (error) throw error;
      toast.success("Organisation navigation saved.");
      await refresh();
      window.dispatchEvent(new CustomEvent("pmo:org-ui-config-change", { detail: next }));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save — ensure ui_config migration is applied.");
    } finally {
      setSaving(false);
    }
  }

  if (!organization) {
    return <div className="p-6 text-sm text-muted-foreground">Join an organisation first.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title="Navigation sequence"
          subtitle={`Sidebar order for ${organization.name}. Workspace pages only — Platform admin links are not shown or editable here.`}
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Reload
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!canEdit || saving || loading}>
            <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {!canEdit && (
        <p className="text-sm text-muted-foreground">Only organisation admins can edit navigation.</p>
      )}

      <SectionFrame>
        <div className="mb-3 flex items-center gap-2">
          <Menu className="h-4 w-4 text-muted-foreground" />
          <SectionTitle>Workspace sidebar</SectionTitle>
        </div>
        {loading ? (
          <PageLoading label="Loading navigation…" fullScreen={false} size="sm" />
        ) : (
          <fieldset disabled={!canEdit} className="min-w-0">
            <NavSequenceEditor
              value={nav}
              onChange={setNav}
              catalog={APP_NAV_GROUPS}
              structureEditable
            />
          </fieldset>
        )}
      </SectionFrame>
    </div>
  );
}
