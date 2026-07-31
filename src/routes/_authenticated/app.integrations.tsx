import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/streamlit";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { OrgIntegrationsPanel } from "@/components/org-integrations-panel";

export const Route = createFileRoute("/_authenticated/app/integrations")({
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { organization, roles } = useAuth();
  const admin = isAdmin(roles);

  if (!organization) {
    return (
      <div className="space-y-4">
        <PageHeading title="Integrations" subtitle="Connect Jira and other systems" />
        <p className="text-sm text-muted-foreground">Select an organisation to manage integrations.</p>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="space-y-4">
        <PageHeading title="Integrations" subtitle="Connect Jira and other systems" />
        <p className="text-sm text-muted-foreground">
          Organisation admin access is required to configure external system connectors.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeading
        title="Integrations"
        subtitle={`Connect external systems for ${organization.name}`}
      />
      <OrgIntegrationsPanel orgId={organization.id} />
    </div>
  );
}
