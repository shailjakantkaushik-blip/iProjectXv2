/** @deprecated Import from `@/lib/alert-outbound-config` — kept for existing imports. */
export {
  normalizeNotificationPrefs,
  type NotificationPrefs,
  ALERT_EMAIL_CHANNELS,
} from "@/lib/alert-outbound-config";

import { normalizeNotificationPrefs as norm } from "@/lib/alert-outbound-config";

export const DEFAULT_NOTIFICATION_PREFS = norm({});
