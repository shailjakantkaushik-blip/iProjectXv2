import { Switch } from "@/components/ui/switch";
import {
  ALERT_CHANNEL_LABELS,
  ALERT_EMAIL_CHANNELS,
  DEFAULT_ROLE_EMAIL_CONFIG,
  type AlertOutboundOrgConfig,
  type AlertRoleEmailConfig,
} from "@/lib/alert-outbound-config";
import type { OrgRole } from "@/lib/org-roles";
import { cn } from "@/lib/utils";

function roleRow(
  config: AlertOutboundOrgConfig,
  roleKey: string,
): Required<AlertRoleEmailConfig> {
  const r = config.roles[roleKey] ?? {};
  return {
    enabled: r.enabled !== false,
    approvals: r.approvals !== false,
    overdue_raid: r.overdue_raid !== false,
    pulse: r.pulse !== false,
    raid_escalation: r.raid_escalation !== false,
  };
}

export function AlertOutboundRoleMatrix({
  config,
  roles,
  disabled,
  onChange,
}: {
  config: AlertOutboundOrgConfig;
  roles: OrgRole[];
  disabled?: boolean;
  onChange: (next: AlertOutboundOrgConfig) => void;
}) {
  const setRole = (roleKey: string, patch: Partial<AlertRoleEmailConfig>) => {
    const prev = roleRow(config, roleKey);
    const nextRoles = {
      ...config.roles,
      [roleKey]: { ...prev, ...patch },
    };
    onChange({ ...config, roles: nextRoles });
  };

  const ensureDefaults = () => {
    const nextRoles = { ...config.roles };
    for (const r of roles) {
      if (!nextRoles[r.role_key]) {
        nextRoles[r.role_key] = { ...DEFAULT_ROLE_EMAIL_CONFIG };
      }
    }
    onChange({ ...config, roles: nextRoles });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Role-level outbound email channels. A user receives a channel when any of their roles
          grants it (and user/admin overrides allow it).
        </p>
        <button
          type="button"
          className="text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
          disabled={disabled}
          onClick={ensureDefaults}
        >
          Fill defaults for all roles
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Emails on</th>
              {ALERT_EMAIL_CHANNELS.map((c) => (
                <th key={c} className="px-3 py-2 font-medium">
                  {ALERT_CHANNEL_LABELS[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => {
              const row = roleRow(config, r.role_key);
              return (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.label}</div>
                    <div className="text-[10px] text-muted-foreground">{r.role_key}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Switch
                      checked={row.enabled}
                      disabled={disabled}
                      onCheckedChange={(v) => setRole(r.role_key, { enabled: v })}
                    />
                  </td>
                  {ALERT_EMAIL_CHANNELS.map((c) => (
                    <td key={c} className="px-3 py-2">
                      <Switch
                        checked={row.enabled && row[c]}
                        disabled={disabled || !row.enabled}
                        onCheckedChange={(v) => setRole(r.role_key, { [c]: v })}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
            {roles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No roles found for this organisation.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p
        className={cn(
          "text-[11px] text-muted-foreground",
          !config.active && "text-amber-700",
        )}
      >
        {config.active
          ? "Outbound emails are active for this organisation."
          : "Outbound emails are off for this organisation until the platform master switch is on."}
      </p>
    </div>
  );
}

export function AlertOutboundMasterSwitch({
  active,
  disabled,
  onChange,
  label = "Enable outbound alert emails for this organisation",
  hint,
}: {
  active: boolean;
  disabled?: boolean;
  onChange: (active: boolean) => void;
  label?: string;
  hint?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <Switch checked={active} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}
