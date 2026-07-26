import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, RefreshCw, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { PageDownloadSettings } from "@/components/page-download-settings";
import { PageLoading } from "@/components/page-loading";
import {
  defaultPageDownloadConfig,
  normalizePageDownloadConfig,
  type PageDownloadConfig,
} from "@/lib/page-download";
import { fetchLandingConfig } from "@/lib/landing-config";

export const Route = createFileRoute("/_authenticated/app/page-downloads")({
  component: OrgPageDownloadsPage,
});

type OrgUiConfig = {
  page_download?: PageDownloadConfig;
  [key: string]: unknown;
};

function OrgPageDownloadsPage() {
  const { organization, roles, refresh } = useAuth();
  const canEdit = isAdmin(roles);
  const [cfg, setCfg] = useState<PageDownloadConfig>(defaultPageDownloadConfig());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const ui = ((data as { ui_config?: OrgUiConfig } | null)?.ui_config ?? {}) as OrgUiConfig;
      if (ui.page_download && Object.keys(ui.page_download.pages ?? {}).length > 0) {
        setCfg({
          pages: {
            ...defaultPageDownloadConfig().pages,
            ...normalizePageDownloadConfig(ui.page_download).pages,
          },
        });
      } else {
        const platform = await fetchLandingConfig();
        setCfg({
          pages: {
            ...defaultPageDownloadConfig().pages,
            ...normalizePageDownloadConfig(platform.page_download).pages,
          },
        });
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
      const prev = ((existing as { ui_config?: OrgUiConfig } | null)?.ui_config ??
        {}) as OrgUiConfig;
      const next: OrgUiConfig = {
        ...prev,
        page_download: normalizePageDownloadConfig(cfg),
      };
      const { error } = await supabase
        .from("organizations")
        .update({ ui_config: next as never })
        .eq("id", organization.id);
      if (error) throw error;
      toast.success("Page download settings saved.");
      await refresh();
      window.dispatchEvent(new CustomEvent("pmo:org-ui-config-change", { detail: next }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!organization) {
    return <div className="p-6 text-sm text-muted-foreground">Join an organisation first.</div>;
  }

  if (loading) {
    return <PageLoading label="Loading download settings…" fullScreen={false} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title="Page downloads"
          subtitle="Allow or disallow Download page (PDF / PPT / PNG) for each workspace page. Org Admin and Platform pages are never included."
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={!canEdit}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Reload
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || !canEdit}>
            <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {!canEdit ? (
        <p className="text-sm text-muted-foreground">Only organisation admins can change this.</p>
      ) : (
        <SectionFrame exportable={false}>
          <div className="mb-3 flex items-center gap-2">
            <FileDown className="h-4 w-4 text-muted-foreground" />
            <SectionTitle>Workspace pages</SectionTitle>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Defaults come from platform settings when your organisation has not saved an override.
            Users still need page view permission to open the page.
          </p>
          <PageDownloadSettings value={cfg} onChange={setCfg} />
        </SectionFrame>
      )}
    </div>
  );
}
