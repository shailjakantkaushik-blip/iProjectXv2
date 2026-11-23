import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin, useAuth } from "@/lib/auth-context";
import { PageHeading } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { ApplyLeavePanel } from "@/components/resource-calendar-panel";
import { RESOURCES_TIMESHEET_SELECT } from "@/lib/query-selects";

export const Route = createFileRoute("/_authenticated/app/apply-leave")({
  component: ApplyLeavePage,
});

function ApplyLeavePage() {
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

  return (
    <PageExport name="Apply_Leave" title="Apply leave">
      <PageHeading icon="📅">Apply leave</PageHeading>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Record annual, sick, or general leave. Capacity, estimation, work-item demand, and
        timesheets treat those weekdays as unavailable.{" "}
        {admin ? (
          <>
            Org-wide public holidays live on{" "}
            <Link to="/app/org-holidays" className="font-medium text-primary hover:underline">
              Org holidays & leave
            </Link>
            .
          </>
        ) : (
          <>Public holidays for your location are listed below; org admins maintain them.</>
        )}
      </p>
      <ApplyLeavePanel resources={resources} scope="mine" />
    </PageExport>
  );
}
