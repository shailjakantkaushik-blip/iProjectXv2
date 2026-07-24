import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";

export const SUPPORT_STATUSES = [
  "Open",
  "In Progress",
  "Waiting on User",
  "Resolved",
  "Closed",
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_CATEGORIES = [
  "General",
  "Access & Login",
  "Billing",
  "Bug",
  "Feature request",
  "Data & Import",
  "Other",
] as const;

export const SUPPORT_AUDIENCES = ["org_admin", "all_users"] as const;
export type SupportAudience = (typeof SUPPORT_AUDIENCES)[number];

export type OrgSupportSettings = {
  org_id: string;
  enabled: boolean;
  audience: SupportAudience;
  updated_at?: string;
  updated_by?: string | null;
};

export type SupportTicket = {
  id: string;
  org_id: string;
  created_by: string;
  title: string;
  body: string;
  category: string;
  priority: SupportPriority | string;
  status: SupportStatus | string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type SupportComment = {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
};

export const SUPPORT_STATUS_CLASS: Record<SupportStatus, string> = {
  Open: "bg-blue-100 text-blue-800",
  "In Progress": "bg-amber-100 text-amber-800",
  "Waiting on User": "bg-violet-100 text-violet-800",
  Resolved: "bg-emerald-100 text-emerald-800",
  Closed: "bg-slate-100 text-slate-600",
};

export const SUPPORT_PRIORITY_CLASS: Record<SupportPriority, string> = {
  Critical: "bg-rose-100 text-rose-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-sky-100 text-sky-800",
  Low: "bg-slate-100 text-slate-600",
};

export function audienceLabel(audience: SupportAudience | string) {
  return audience === "all_users" ? "All users" : "Org admins only";
}

/** Client-side gate mirroring can_use_org_support for org users (nav / empty states). */
export function canUseSupportFromSettings(
  settings: OrgSupportSettings | null | undefined,
  roles: string[],
): boolean {
  if (!settings?.enabled) return false;
  if (settings.audience === "all_users") return true;
  return isAdmin(roles as any);
}

export function useOrgSupportAccess() {
  const { organization, roles } = useAuth();
  const orgId = organization?.id;

  const { data: settings = null, isLoading, isSuccess } = useQuery({
    queryKey: ["org_support_settings", orgId],
    queryFn: async (): Promise<OrgSupportSettings | null> => {
      if (!orgId) return null;
      const { data, error } = await (supabase as any)
        .from("org_support_settings")
        .select("*")
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return (data as OrgSupportSettings) ?? null;
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const allowed = !!orgId && canUseSupportFromSettings(settings, roles);

  return {
    orgId,
    settings,
    allowed,
    isReady: !orgId || isSuccess || !isLoading,
    isLoading: !!orgId && isLoading,
  };
}

export async function notifySupportUser(opts: {
  userId: string;
  orgId: string;
  title: string;
  body: string;
  ticketId: string;
}) {
  const { error } = await supabase.from("notifications").insert({
    user_id: opts.userId,
    org_id: opts.orgId,
    kind: "support",
    title: opts.title,
    body: opts.body,
    link: `/app/support?ticket=${opts.ticketId}`,
  } as never);
  if (error) console.error("support notify failed", error);
}
