import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import {
  AlertOutboundMasterSwitch,
  AlertOutboundRoleMatrix,
} from "@/components/alert-outbound-config-panel";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  mergeAlertOutboundIntoUiConfig,
  readAlertOutboundFromUiConfig,
  type AlertOutboundOrgConfig,
} from "@/lib/alert-outbound-config";
import { assignableOrgRoles, useOrgRoles } from "@/lib/org-roles";
import { Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/platform/alert-emails")({
  component: PlatformAlertEmailsPage,
});

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  brand_name: string | null;
  ui_config: unknown;
};

function PlatformAlertEmailsPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<AlertOutboundOrgConfig | null>(null);

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ["platform_orgs_alert_emails"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,slug,brand_name,ui_config")
        .order("name");
      if (error) throw error;
      return (data ?? []) as OrgRow[];
    },
  });

  const selected = useMemo(
    () => orgs.find((o) => o.id === selectedId) ?? orgs[0] ?? null,
    [orgs, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(readAlertOutboundFromUiConfig(selected.ui_config));
  }, [selected?.id, selected?.ui_config]);

  const { data: orgRoles = [] } = useOrgRoles(selected?.id ?? null);
  const roles = assignableOrgRoles(orgRoles);

  const save = useMutation({
    mutationFn: async () => {
      if (!selected || !draft) throw new Error("Select an organisation");
      const { data: current, error: readErr } = await supabase
        .from("organizations")
        .select("ui_config")
        .eq("id", selected.id)
        .maybeSingle();
      if (readErr) throw readErr;
      const nextUi = mergeAlertOutboundIntoUiConfig(current?.ui_config, draft);
      const { error } = await supabase
        .from("organizations")
        .update({ ui_config: nextUi as never })
        .eq("id", selected.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Outbound alert email settings saved for organisation");
      qc.invalidateQueries({ queryKey: ["platform_orgs_alert_emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <PageLoading label="Loading organisations…" fullScreen={false} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeading
          title="Outbound alert emails"
          subtitle="Platform control: activate digests and RAID escalation email per organisation, then set role-level channels. When active, org admins can refine roles and per-user overrides."
        />
        <Button
          size="sm"
          disabled={!selected || !draft || save.isPending}
          onClick={() => save.mutate()}
        >
          <Save className="mr-1.5 h-4 w-4" />
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      <SectionFrame>
        <SectionTitle>Organisation</SectionTitle>
        <select
          className="st-input mt-2 max-w-md"
          value={selected?.id ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.brand_name || o.name} ({o.slug})
            </option>
          ))}
        </select>
      </SectionFrame>

      {selected && draft ? (
        <SectionFrame>
          <SectionTitle>{selected.brand_name || selected.name}</SectionTitle>
          <div className="mt-3 space-y-4">
            <AlertOutboundMasterSwitch
              active={draft.active}
              hint="When off, no digest or RAID escalation emails are sent for this tenant (in-app notifications still work)."
              onChange={(active) => setDraft({ ...draft, active })}
            />
            <AlertOutboundRoleMatrix
              config={draft}
              roles={roles}
              disabled={!draft.active}
              onChange={setDraft}
            />
          </div>
        </SectionFrame>
      ) : (
        <p className="text-sm text-muted-foreground">No organisations found.</p>
      )}
    </div>
  );
}
