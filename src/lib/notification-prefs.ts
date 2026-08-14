/** User prefs for outbound PMO alert digests (profiles.notification_prefs). */

export type NotificationPrefs = {
  /** Master switch. Default true when unset. */
  email_digest?: boolean;
  approvals?: boolean;
  overdue_raid?: boolean;
  pulse?: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: Required<NotificationPrefs> = {
  email_digest: true,
  approvals: true,
  overdue_raid: true,
  pulse: true,
};

export function normalizeNotificationPrefs(raw: unknown): Required<NotificationPrefs> {
  const p = (raw && typeof raw === "object" ? raw : {}) as NotificationPrefs;
  const master = p.email_digest !== false;
  return {
    email_digest: master,
    approvals: master && p.approvals !== false,
    overdue_raid: master && p.overdue_raid !== false,
    pulse: master && p.pulse !== false,
  };
}
