import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OrgRole = {
  id: string;
  org_id: string;
  role_key: string;
  label: string;
  description: string | null;
  is_system: boolean;
  sort_order: number;
};

export const SYSTEM_ROLE_KEYS = ["admin", "org_admin", "bu_lead", "pm", "executive"] as const;

export function orgRolesQueryKey(orgId?: string | null) {
  return ["org_roles", orgId] as const;
}

export function useOrgRoles(orgId?: string | null) {
  return useQuery({
    queryKey: orgRolesQueryKey(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_roles" as any)
        .select("id,org_id,role_key,label,description,is_system,sort_order")
        .eq("org_id", orgId!)
        .order("sort_order")
        .order("label");
      if (error) throw error;
      return (data ?? []) as unknown as OrgRole[];
    },
    enabled: !!orgId,
  });
}

/** Roles shown on Permissions / Team (excludes platform_admin). */
export function assignableOrgRoles(roles: OrgRole[]) {
  return roles.filter((r) => r.role_key !== "platform_admin");
}

export function roleKeyToLabel(roles: OrgRole[], key: string) {
  return roles.find((r) => r.role_key === key)?.label || key;
}
