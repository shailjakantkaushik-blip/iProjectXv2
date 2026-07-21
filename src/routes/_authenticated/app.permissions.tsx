import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { EDITABLE_TABLES, PAGES, pageKey, useRolePermissions } from "@/lib/permissions";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/app/permissions")({
  component: PermissionsPage,
});

const ROLES: { key: "admin" | "org_admin" | "bu_lead" | "pm" | "executive"; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "org_admin", label: "Org Admin" },
  { key: "bu_lead", label: "BU Lead" },
  { key: "pm", label: "PM" },
  { key: "executive", label: "Executive" },
];

function PermissionsPage() {
  const { organization, roles: myRoles } = useAuth();
  const { data: rows = [] } = useRolePermissions();
  const qc = useQueryClient();

  const isAdmin = myRoles.some((r) => r === "admin" || r === "org_admin");

  const map = useMemo(() => {
    const m = new Map<string, { can_view: boolean; can_edit: boolean }>();
    rows.forEach((r) => m.set(`${r.role}::${r.table_name}`, { can_view: r.can_view, can_edit: r.can_edit }));
    return m;
  }, [rows]);

  const mut = useMutation({
    mutationFn: async (payload: { role: string; table_name: string; can_view: boolean; can_edit: boolean }) => {
      const { error } = await (supabase as any)
        .from("role_table_permissions")
        .upsert({ ...payload, org_id: organization!.id }, { onConflict: "org_id,role,table_name" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role_table_permissions"] }),
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const flip = (role: string, table_name: string, field: "can_view" | "can_edit", next: boolean) => {
    const cur = map.get(`${role}::${table_name}`) ?? { can_view: true, can_edit: false };
    const payload = { role, table_name, can_view: cur.can_view, can_edit: cur.can_edit, [field]: next };
    if (field === "can_edit" && next && !payload.can_view) payload.can_view = true;
    if (field === "can_view" && !next) payload.can_edit = false;
    mut.mutate(payload);
  };

  return (
    <div>
      <PageHeading icon="🔐">Role Permissions</PageHeading>
      <p className="mb-3 text-sm text-muted-foreground">
        Configure who can view and edit each data table. Changes apply to the whole organisation.
        Only Admins can modify this page. To limit which projects each role can see, use{" "}
        <Link to="/app/project-access" className="text-primary underline-offset-2 hover:underline">
          Project data access
        </Link>
        .
      </p>

      <SectionFrame>
        <SectionTitle>Permissions Matrix</SectionTitle>
        <div className="overflow-auto max-h-[70vh]">
          <table className="text-xs w-full">
            <thead className="sticky top-0 bg-background">
              <tr>
                <th className="text-left p-2 sticky left-0 bg-background">Table</th>
                {ROLES.map((r) => (
                  <th key={r.key} className="p-2 text-center min-w-[130px] border-l">{r.label}</th>
                ))}
              </tr>
              <tr className="text-[10px] text-muted-foreground">
                <th className="sticky left-0 bg-background"></th>
                {ROLES.map((r) => (
                  <th key={r.key} className="border-l">
                    <div className="flex justify-around px-2">
                      <span>View</span><span>Edit</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EDITABLE_TABLES.map((t, i) => (
                <tr key={t.name} className={i % 2 ? "bg-muted/30" : ""}>
                  <td className="p-2 font-medium sticky left-0 bg-inherit">{t.label}<div className="text-[10px] text-muted-foreground">{t.name}</div></td>
                  {ROLES.map((r) => {
                    const cur = map.get(`${r.key}::${t.name}`) ?? { can_view: true, can_edit: false };
                    return (
                      <td key={r.key} className="p-2 border-l">
                        <div className="flex justify-around">
                          <Checkbox
                            checked={cur.can_view}
                            disabled={!isAdmin || mut.isPending}
                            onCheckedChange={(v) => flip(r.key, t.name, "can_view", !!v)}
                          />
                          <Checkbox
                            checked={cur.can_edit}
                            disabled={!isAdmin || !cur.can_view || mut.isPending}
                            onCheckedChange={(v) => flip(r.key, t.name, "can_edit", !!v)}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Turning off <b>View</b> also removes edit access. Inline editors on every table respect these settings in real time.
        </p>
      </SectionFrame>

      <div className="mt-6" />
      <SectionFrame>
        <SectionTitle>Page Access</SectionTitle>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Control which roles can see each page in the sidebar. Admin & Org Admin always have access.
          Billing & Invoices, Admin: Users, and Admin: Permissions are locked to admins.
        </p>
        <div className="overflow-auto max-h-[70vh]">
          <table className="text-xs w-full">
            <thead className="sticky top-0 bg-background">
              <tr>
                <th className="text-left p-2 sticky left-0 bg-background">Page</th>
                {ROLES.map((r) => (
                  <th key={r.key} className="p-2 text-center min-w-[90px] border-l">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PAGES.map((p, i) => {
                const tname = pageKey(p.path);
                return (
                  <tr key={p.path} className={i % 2 ? "bg-muted/30" : ""}>
                    <td className="p-2 font-medium sticky left-0 bg-inherit">
                      {p.label}
                      <div className="text-[10px] text-muted-foreground">{p.group} · {p.path}</div>
                    </td>
                    {ROLES.map((r) => {
                      const isAdminRow = r.key === "admin" || r.key === "org_admin";
                      const cur = map.get(`${r.key}::${tname}`) ?? { can_view: true, can_edit: false };
                      const checked = isAdminRow ? true : cur.can_view;
                      return (
                        <td key={r.key} className="p-2 border-l text-center">
                          <Checkbox
                            checked={checked}
                            disabled={!isAdmin || isAdminRow || mut.isPending}
                            onCheckedChange={(v) => flip(r.key, tname, "can_view", !!v)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </div>
  );
}
