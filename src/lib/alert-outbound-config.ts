/**
 * Outbound alert email + RAID escalation email configuration hierarchy:
 *
 * 1) Platform admin — per org master `active` + per-role channel defaults
 *    (stored on organizations.ui_config.alert_outbound)
 * 2) When active — org admin can edit the same role matrix and per-user overrides
 *    (profiles.notification_prefs.admin_disabled / admin_locked + channel flags)
 * 3) User — can opt in/out of channels when org is active, role grants them,
 *    and admin has not locked/disabled the user
 */

export const ALERT_EMAIL_CHANNELS = [
  "approvals",
  "overdue_raid",
  "pulse",
  "raid_escalation",
] as const;

export type AlertEmailChannel = (typeof ALERT_EMAIL_CHANNELS)[number];

export type AlertRoleEmailConfig = {
  /** Master for this role — when false, no outbound alert emails for the role. */
  enabled?: boolean;
  approvals?: boolean;
  overdue_raid?: boolean;
  pulse?: boolean;
  /** Email when RAID items auto-escalate (included in digest / escalation notices). */
  raid_escalation?: boolean;
};

export type AlertOutboundOrgConfig = {
  /** Platform master switch for the organisation. */
  active: boolean;
  roles: Record<string, AlertRoleEmailConfig>;
};

export type NotificationPrefs = {
  email_digest?: boolean;
  approvals?: boolean;
  overdue_raid?: boolean;
  pulse?: boolean;
  raid_escalation?: boolean;
  /** Org admin forced this user off outbound emails. */
  admin_disabled?: boolean;
  /** Org admin locked prefs — user cannot opt out while role still grants. */
  admin_locked?: boolean;
};

export type EffectiveAlertEmailChannels = {
  /** Org feature active and user not admin-disabled. */
  orgActive: boolean;
  /** User may edit their own channel toggles. */
  userCanEdit: boolean;
  email_digest: boolean;
  approvals: boolean;
  overdue_raid: boolean;
  pulse: boolean;
  raid_escalation: boolean;
};

/** Roles that receive outbound alerts by default when no explicit role row exists. */
export const DEFAULT_ALERT_ROLE_KEYS = new Set([
  "admin",
  "org_admin",
  "bu_lead",
  "pm",
  "executive",
]);

export const DEFAULT_ROLE_EMAIL_CONFIG: Required<AlertRoleEmailConfig> = {
  enabled: true,
  approvals: true,
  overdue_raid: true,
  pulse: true,
  raid_escalation: true,
};

export function normalizeAlertOutbound(raw: unknown): AlertOutboundOrgConfig {
  if (!raw || typeof raw !== "object") {
    // Legacy: feature considered on until platform explicitly configures / disables.
    return { active: true, roles: {} };
  }
  const o = raw as Record<string, unknown>;
  const rolesRaw =
    o.roles && typeof o.roles === "object" ? (o.roles as Record<string, unknown>) : {};
  const roles: Record<string, AlertRoleEmailConfig> = {};
  for (const [key, val] of Object.entries(rolesRaw)) {
    if (!val || typeof val !== "object") continue;
    const r = val as Record<string, unknown>;
    roles[key] = {
      enabled: r.enabled !== false,
      approvals: r.approvals !== false,
      overdue_raid: r.overdue_raid !== false,
      pulse: r.pulse !== false,
      raid_escalation: r.raid_escalation !== false,
    };
  }
  return {
    active: o.active !== false,
    roles,
  };
}

export function readAlertOutboundFromUiConfig(uiConfig: unknown): AlertOutboundOrgConfig {
  const ui =
    uiConfig && typeof uiConfig === "object" ? (uiConfig as Record<string, unknown>) : {};
  return normalizeAlertOutbound(ui.alert_outbound);
}

export function mergeAlertOutboundIntoUiConfig(
  uiConfig: unknown,
  next: AlertOutboundOrgConfig,
): Record<string, unknown> {
  const prev =
    uiConfig && typeof uiConfig === "object" ? { ...(uiConfig as Record<string, unknown>) } : {};
  prev.alert_outbound = next;
  return prev;
}

export function normalizeNotificationPrefs(raw: unknown): Required<
  Pick<
    NotificationPrefs,
    | "email_digest"
    | "approvals"
    | "overdue_raid"
    | "pulse"
    | "raid_escalation"
    | "admin_disabled"
    | "admin_locked"
  >
> {
  const p = (raw && typeof raw === "object" ? raw : {}) as NotificationPrefs;
  const master = p.email_digest !== false;
  return {
    email_digest: master,
    approvals: master && p.approvals !== false,
    overdue_raid: master && p.overdue_raid !== false,
    pulse: master && p.pulse !== false,
    raid_escalation: master && p.raid_escalation !== false,
    admin_disabled: p.admin_disabled === true,
    admin_locked: p.admin_locked === true,
  };
}

function roleGrantsChannel(
  config: AlertOutboundOrgConfig,
  roleKeys: string[],
  channel: AlertEmailChannel | "enabled",
): boolean {
  if (!roleKeys.length) return false;
  let sawExplicit = false;
  for (const rk of roleKeys) {
    const row = config.roles[rk];
    if (row) {
      sawExplicit = true;
      if (row.enabled === false) continue;
      if (channel === "enabled") return true;
      if (row[channel] === false) continue;
      return true;
    }
  }
  if (sawExplicit) return false;
  // No explicit role rows: default leadership roles get all channels.
  return roleKeys.some((rk) => DEFAULT_ALERT_ROLE_KEYS.has(rk));
}

export function resolveEffectiveAlertEmails(opts: {
  orgConfig: AlertOutboundOrgConfig;
  roleKeys: string[];
  userPrefs?: unknown;
}): EffectiveAlertEmailChannels {
  const prefs = normalizeNotificationPrefs(opts.userPrefs);
  const orgActive = opts.orgConfig.active === true;

  if (!orgActive || prefs.admin_disabled) {
    return {
      orgActive,
      userCanEdit: false,
      email_digest: false,
      approvals: false,
      overdue_raid: false,
      pulse: false,
      raid_escalation: false,
    };
  }

  const roleMaster = roleGrantsChannel(opts.orgConfig, opts.roleKeys, "enabled");
  const roleApprovals = roleMaster && roleGrantsChannel(opts.orgConfig, opts.roleKeys, "approvals");
  const roleOverdue =
    roleMaster && roleGrantsChannel(opts.orgConfig, opts.roleKeys, "overdue_raid");
  const rolePulse = roleMaster && roleGrantsChannel(opts.orgConfig, opts.roleKeys, "pulse");
  const roleEsc =
    roleMaster && roleGrantsChannel(opts.orgConfig, opts.roleKeys, "raid_escalation");

  const locked = prefs.admin_locked;
  const userMaster = locked ? true : prefs.email_digest;

  return {
    orgActive: true,
    userCanEdit: !locked && roleMaster,
    email_digest: roleMaster && userMaster,
    approvals: roleApprovals && userMaster && (locked || prefs.approvals),
    overdue_raid: roleOverdue && userMaster && (locked || prefs.overdue_raid),
    pulse: rolePulse && userMaster && (locked || prefs.pulse),
    raid_escalation: roleEsc && userMaster && (locked || prefs.raid_escalation),
  };
}

export const ALERT_CHANNEL_LABELS: Record<AlertEmailChannel, string> = {
  approvals: "Pending approvals",
  overdue_raid: "Overdue RAID",
  pulse: "Portfolio pulse",
  raid_escalation: "RAID escalation",
};
