import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useAuth, isPlatformAdmin } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { OrgRoleCatalog } from "@/components/org-role-catalog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listOrgsForRoleAdmin } from "@/lib/org-role-admin.functions";

export const Route = createFileRoute("/_authenticated/platform/roles")({
  component: PlatformRolesPage,
});

function initialOrgFromUrl() {
  if (typeof window === "undefined") return "";
  const org = new URLSearchParams(window.location.search).get("org");
  return org && /^[0-9a-f-]{36}$/i.test(org) ? org : "";
}

function PlatformRolesPage() {
  const { roles } = useAuth();
  const allowed = isPlatformAdmin(roles);
  const listOrgs = useServerFn(listOrgsForRoleAdmin);
  const [orgId, setOrgId] = useState(initialOrgFromUrl);

  const orgsQ = useQuery({
    queryKey: ["role_admin_orgs"],
    queryFn: async () => listOrgs(),
    enabled: allowed,
  });

  const orgs = orgsQ.data?.orgs ?? [];

  useEffect(() => {
    if (!orgId && orgs.length === 1) setOrgId(orgs[0].id);
  }, [orgId, orgs]);

  if (!allowed) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Organisation roles</h1>
        <p className="mt-2 text-sm text-muted-foreground">Platform administrator access required.</p>
      </div>
    );
  }

  const selected = orgs.find((o) => o.id === orgId);

  return (
    <div className="space-y-6">
      <div>
        <PageHeading icon="🔐">Organisation roles</PageHeading>
        <p className="text-sm text-muted-foreground">
          Add custom roles and edit labels for any organisation. Permission matrices for an
          organisation you belong to remain on{" "}
          <Link to="/app/permissions" className="text-primary underline-offset-2 hover:underline">
            Admin: Permissions
          </Link>
          .
        </p>
      </div>

      <SectionFrame>
        <SectionTitle>Choose organisation</SectionTitle>
        <div className="max-w-md space-y-2">
          <Label>Organisation</Label>
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an organisation" />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name} · {o.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionFrame>

      {orgId && (
        <SectionFrame>
          <SectionTitle>{selected ? `${selected.name} roles` : "Roles"}</SectionTitle>
          <OrgRoleCatalog orgId={orgId} canManage />
        </SectionFrame>
      )}
    </div>
  );
}
