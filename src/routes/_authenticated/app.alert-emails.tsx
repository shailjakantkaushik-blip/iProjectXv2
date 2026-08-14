import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import {
  AlertOutboundMasterSwitch,
  AlertOutboundRoleMatrix,
} from "@/components/alert-outbound-config-panel";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import {
  mergeAlertOutboundIntoUiConfig,
  normalizeNotificationPrefs,
  readAlertOutboundFromUiConfig,
  type AlertOutboundOrgConfig,
} from "@/lib/alert-outbound-config";
import { assignableOrgRoles, useOrgRoles } from "@/lib/org-roles";
import { Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/alert-emails")({
  component: OrgAlertEmailsPage,
});

type MemberRow = {
  id: string;
  email: string;
  full_name: string | null;
  notification_prefs: unknown;
};

function OrgAlertEmailsPage() {
  const { organization, roles, refresh } = useAuth();
  const canEdit = isAdmin(roles);
  const orgId = organization?.id;
  const qc = useQueryClient();

  const platformConfig = readAlertOutboundFromUiConfig(organization?.ui_config);
  const [draft, setDraft] = useState<AlertOutboundOrgConfig | null>(null);
  const config = draft ?? platformConfig;

  const { data: orgRoles = [], isLoading: rolesLoading } = useOrgRoles(orgId);
  const roleList = assignableOrgRoles(orgRoles);

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["org_alert_email_members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,full_name,notification_prefs")
        .eq("org_id", orgId!)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as MemberRow[];
    },
    enabled: !!orgId && platformConfig.active,
  });

  const saveOrg = useMutation({
    mutationFn: async () => {
      if (!orgId || !canEdit) throw new Error("Not allowed");
      if (!platformConfig.active) {
        throw new Error("Platform has not activated outbound emails for this organisation");
      }
      const { data: current, error: readErr } = await supabase
        .from("organizations")
        .select("ui_config")
        .eq("id", orgId)
        .maybeSingle();
      if (readErr) throw readErr;
      // Org admins cannot flip the platform master off/on — preserve active from server.
      const next: AlertOutboundOrgConfig = {
        active: true,
        roles: config.roles,
      };
      const nextUi = mergeAlertOutboundIntoUiConfig(current?.ui_config, next);
      const { error } = await supabase
        .from("organizations")
        .update({ ui_config: nextUi as never })
        .eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Role-level alert email settings saved");
      setDraft(null);
      await refresh();
      qc.invalidateQueries({ queryKey: ["org_alert_email_members", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveUser = useMutation({
    mutationFn: async (args: {
      userId: string;
      admin_disabled: boolean;
      admin_locked: boolean;
    }) => {
      if (!canEdit) throw new Error("Not allowed");
      const member = members.find((m) => m.id === args.userId);
      const prev = normalizeNotificationPrefs(member?.notification_prefs);
      const next = {
        ...prev,
        admin_disabled: args.admin_disabled,
        admin_locked: args.admin_locked,
      };
      const { error } = await supabase
        .from("profiles")
        .update({ notification_prefs: next as never })
        .eq("id", args.userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User alert override saved");
      qc.invalidateQueries({ queryKey: ["org_alert_email_members", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) =>
        (a.full_name || a.email).localeCompare(b.full_name || b.email),
      ),
    [members],
  );

  if (!orgId) {
    return <PageLoading label="Loading…" fullScreen={false} />;
  }

  if (!platformConfig.active) {
    return (
      <div className="space-y-4">
        <PageHeading
          title="Outbound alert emails"
          subtitle="Email digests and RAID escalation notices for your organisation."
        />
        <SectionFrame>
          <p className="text-sm text-muted-foreground">
            Outbound alert emails are not active for this organisation. Ask a platform admin to
            enable them under <strong>Platform → Outbound alert emails</strong>. In-app
            notifications continue to work in the bell.
          </p>
        </SectionFrame>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeading
          title="Outbound alert emails"
          subtitle="Platform has activated emails for this organisation. Adjust role channels and per-user overrides. Users can further opt out unless you lock them."
        />
        {canEdit ? (
          <Button size="sm" disabled={saveOrg.isPending} onClick={() => saveOrg.mutate()}>
            <Save className="mr-1.5 h-4 w-4" />
            {saveOrg.isPending ? "Saving…" : "Save roles"}
          </Button>
        ) : null}
      </div>

      <SectionFrame>
        <SectionTitle>Organisation status</SectionTitle>
        <div className="mt-3">
          <AlertOutboundMasterSwitch
            active
            disabled
            label="Outbound emails active (platform)"
            hint="Only platform admins can turn this master switch off."
            onChange={() => undefined}
          />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Role-level channels</SectionTitle>
        <div className="mt-3">
          {rolesLoading ? (
            <p className="text-sm text-muted-foreground">Loading roles…</p>
          ) : (
            <AlertOutboundRoleMatrix
              config={config}
              roles={roleList}
              disabled={!canEdit}
              onChange={(next) => setDraft({ ...next, active: true })}
            />
          )}
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Per-user overrides</SectionTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Disable stops all outbound alert emails for that user. Lock prevents the user from
          opting out of channels their roles grant.
        </p>
        {membersLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading members…</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Disable emails</th>
                  <th className="px-3 py-2 font-medium">Lock prefs</th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((m) => {
                  const prefs = normalizeNotificationPrefs(m.notification_prefs);
                  return (
                    <tr key={m.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{m.full_name || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{m.email}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Switch
                          checked={prefs.admin_disabled}
                          disabled={!canEdit || saveUser.isPending}
                          onCheckedChange={(v) =>
                            saveUser.mutate({
                              userId: m.id,
                              admin_disabled: v,
                              admin_locked: prefs.admin_locked,
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Switch
                          checked={prefs.admin_locked}
                          disabled={!canEdit || saveUser.isPending || prefs.admin_disabled}
                          onCheckedChange={(v) =>
                            saveUser.mutate({
                              userId: m.id,
                              admin_disabled: prefs.admin_disabled,
                              admin_locked: v,
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
                {sortedMembers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No active users.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </div>
  );
}
