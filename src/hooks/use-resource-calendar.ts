import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildResourceCalendarIndex,
  type OrgPublicHoliday,
  type ResourceLeave,
} from "@/lib/resource-calendar";

export function useOrgResourceCalendar(orgId?: string | null) {
  const holidaysQ = useQuery({
    queryKey: ["org_public_holidays", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_public_holidays")
        .select("id,location,holiday_date,name")
        .eq("org_id", orgId)
        .order("holiday_date");
      if (error) throw error;
      return (data ?? []) as OrgPublicHoliday[];
    },
    enabled: !!orgId,
  });

  const leavesQ = useQuery({
    queryKey: ["resource_leaves", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_leaves")
        .select("id,resource_id,start_date,end_date,leave_type,notes")
        .eq("org_id", orgId)
        .order("start_date");
      if (error) throw error;
      return (data ?? []) as ResourceLeave[];
    },
    enabled: !!orgId,
  });

  const holidays = useMemo(() => holidaysQ.data ?? [], [holidaysQ.data]);
  const leaves = useMemo(() => leavesQ.data ?? [], [leavesQ.data]);
  const index = useMemo(() => buildResourceCalendarIndex(holidays, leaves), [holidays, leaves]);

  return {
    holidays,
    leaves,
    index,
    isLoading: holidaysQ.isLoading || leavesQ.isLoading,
  };
}
