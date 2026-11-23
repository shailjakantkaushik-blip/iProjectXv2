import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin, useAuth } from "@/lib/auth-context";
import { PageHeading } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { ApplyLeavePanel, OrgHolidaysPanel } from "@/components/resource-calendar-panel";
import { RESOURCES_TIMESHEET_SELECT } from "@/lib/query-selects";

export const Route = createFileRoute("/_authenticated/app/org-holidays")({
  component: OrgHolidaysPage,
});

function OrgHolidaysPage() {
  const { organization, roles } = useAuth();
  const orgId = organization?.id;
  const admin = isAdmin(roles);

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", orgId, "leave"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select(RESOURCES_TIMESHEET_SELECT as "*")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        name: string;
        location?: string | null;
        user_id?: string | null;
        manager_user_id?: string | null;
      }[];
    },
    enabled: !!orgId,
  });

  if (!admin) {
    return (
      <div className="space-y-3">
        <PageHeading icon="📅">Org holidays & leave</PageHeading>
        <p className="text-sm text-muted-foreground">
          Only org admins manage public holidays and the org leave register. Apply your own leave on{" "}
          <Link to="/app/apply-leave" className="font-medium text-primary hover:underline">
            Apply leave
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <PageExport name="Org_Holidays_Leave" title="Org holidays & leave">
      <PageHeading icon="📅">Org holidays & leave</PageHeading>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Public holidays by geography, and the organisation leave register. People apply their own
        leave on{" "}
        <Link to="/app/apply-leave" className="font-medium text-primary hover:underline">
          Apply leave
        </Link>
        ; resource managers can apply for their team.
      </p>
      <div className="space-y-4">
        <OrgHolidaysPanel resources={resources} />
        <ApplyLeavePanel resources={resources} scope="org" />
      </div>
    </PageExport>
  );
}
