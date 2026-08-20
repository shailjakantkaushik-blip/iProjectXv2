import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin as checkIsAdmin } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import {
  CAPABILITIES,
  EDITABLE_TABLES,
  PAGES,
  capabilityKey,
  defaultCapabilityFlags,
  pageKey,
  useRolePermissions,
} from "@/lib/permissions";
import { assignableOrgRoles, useOrgRoles, type OrgRole } from "@/lib/org-roles";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/permissions")({
  component: PermissionsPage,
});

function PermissionsPage() {
  const { organization, roles: myRoles } = useAuth();
  const orgId = organization?.id;
  const { data: rows = [] } = useRolePermissions();
  const rolesQ = useOrgRoles(orgId);
  const qc = useQueryClient();

  const canManage = checkIsAdmin(myRoles);
  const roles = assignableOrgRoles(rolesQ.data ?? []);

  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const map = useMemo(() => {
    const m = new Map<string, { can_view: boolean; can_edit: boolean; can_other: boolean }>();
    rows.forEach((r) =>
      m.set(`${r.role}::${r.table_name}`, {
        can_view: r.can_view,
        can_edit: r.can_edit,
        can_other: !!(r as { can_other?: boolean }).can_other,
      }),
    );
    return m;
  }, [rows]);

  const mut = useMutation({
    mutationFn: async (payload: {
      role: string;
      table_name: string;
      can_view: boolean;
      can_edit: boolean;
      can_other: boolean;
    }) => {
      const { error } = await (supabase as any)
        .from("role_table_permissions")
        .upsert({ ...payload, org_id: organization!.id }, { onConflict: "org_id,role,table_name" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role_table_permissions"] }),
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const addRole = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organisation");
      const key = newKey
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
      if (!/^[a-z][a-z0-9_]{1,62}$/.test(key)) {
        throw new Error("Role key must start with a letter and use a-z, 0-9, underscore");
      }
      if (["platform_admin"].includes(key)) throw new Error("Reserved role key");
      const label = newLabel.trim() || key;
      const { error } = await supabase.from("org_roles" as any).insert({
        org_id: orgId,
        role_key: key,
        label,
        description: newDesc.trim() || null,
        is_system: false,
        sort_order: 200,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_roles", orgId] });
      toast.success("Role added — configure permissions below");
      setNewKey("");
      setNewLabel("");
      setNewDesc("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRole = useMutation({
    mutationFn: async (role: OrgRole) => {
      if (role.is_system) throw new Error("System roles cannot be deleted");
      const { error } = await supabase
        .from("org_roles" as any)
        .delete()
        .eq("id", role.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_roles", orgId] });
      toast.success("Role removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const flip = (
    role: string,
    table_name: string,
    field: "can_view" | "can_edit" | "can_other",
    next: boolean,
  ) => {
    const cur = map.get(`${role}::${table_name}`) ?? {
      can_view: true,
      can_edit: false,
      can_other: false,
    };
    const payload = {
      role,
      table_name,
      can_view: cur.can_view,
      can_edit: cur.can_edit,
      can_other: cur.can_other,
      [field]: next,
    };
    if ((field === "can_edit" || field === "can_other") && next && !payload.can_view) {
      payload.can_view = true;
    }
    if (field === "can_view" && !next) {
      payload.can_edit = false;
      payload.can_other = false;
    }
    mut.mutate(payload);
  };

  const capabilityFlags = (role: string, capId: string) => {
    const key = capabilityKey(capId);
    return map.get(`${role}::${key}`) ?? defaultCapabilityFlags(capId, [role]);
  };

  return (
    <div>
      <PageHeading icon="🔐">Role Permissions</PageHeading>
      <p className="mb-3 text-sm text-muted-foreground">
        Configure who can view, edit, and perform other actions (add/delete, upload, delete
        project) for each data table, Data Editor tools, and pages. Add custom roles for your
        organisation — the matrices below update automatically. To limit which projects each role
        or user can see (Strategic Alignment, program, functional area, project, stream), use{" "}
        <Link to="/app/project-access" className="text-primary underline-offset-2 hover:underline">
          Project data access
        </Link>
        .
      </p>

      <SectionFrame>
        <SectionTitle>Organisation roles</SectionTitle>
        <div className="mb-3 flex flex-wrap gap-2">
          {roles.map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs"
            >
              <span className="font-semibold">{r.label}</span>
              <span className="text-muted-foreground font-mono text-[10px]">{r.role_key}</span>
              {!r.is_system && canManage && (
                <button
                  type="button"
                  className="text-rose-600 hover:underline text-[10px]"
                  onClick={() =>
                    confirm(`Delete role “${r.label}”? Users keep the key until you remove it.`) &&
                    deleteRole.mutate(r)
                  }
                >
                  Delete
                </button>
              )}
            </span>
          ))}
        </div>
        {canManage && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <Input
              placeholder="Role key (e.g. resource_manager)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <Input
              placeholder="Display label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <Input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <Button
              type="button"
              disabled={addRole.isPending || !newKey.trim()}
              onClick={() => addRole.mutate()}
            >
              {addRole.isPending ? "Adding…" : "Add role"}
            </Button>
          </div>
        )}
      </SectionFrame>

      <div className="mt-6" />
      <SectionFrame>
        <SectionTitle>Data tools</SectionTitle>
        <p className="mb-2 text-xs text-muted-foreground">
          View = see the tool. Edit = change data. Other = extra actions (add/delete rows, upload
          workbooks).
        </p>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background">
              <tr>
                <th className="p-2 text-left sticky left-0 bg-background">Capability</th>
                {roles.map((r) => (
                  <th key={r.role_key} className="min-w-[150px] border-l p-2 text-center">
                    {r.label}
                  </th>
                ))}
              </tr>
              <tr className="text-[10px] text-muted-foreground">
                <th className="sticky left-0 bg-background"></th>
                {roles.map((r) => (
                  <th key={r.role_key} className="border-l">
                    <div className="flex justify-around px-2">
                      <span>View</span>
                      <span>Edit</span>
                      <span>Other</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((cap, i) => {
                const tname = capabilityKey(cap.id);
                return (
                  <tr key={cap.id} className={i % 2 ? "bg-muted/30" : ""}>
                    <td className="sticky left-0 bg-inherit p-2 font-medium">
                      {cap.label}
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {cap.description}
                      </div>
                    </td>
                    {roles.map((r) => {
                      const cur = capabilityFlags(r.role_key, cap.id);
                      return (
                        <td key={r.role_key} className="border-l p-2">
                          <div className="flex justify-around">
                            <Checkbox
                              checked={cur.can_view}
                              disabled={!canManage || mut.isPending}
                              onCheckedChange={(v) => flip(r.role_key, tname, "can_view", !!v)}
                            />
                            <Checkbox
                              checked={cur.can_edit}
                              disabled={!canManage || !cur.can_view || mut.isPending}
                              onCheckedChange={(v) => flip(r.role_key, tname, "can_edit", !!v)}
                            />
                            <Checkbox
                              checked={cur.can_other}
                              disabled={!canManage || !cur.can_view || mut.isPending}
                              onCheckedChange={(v) => flip(r.role_key, tname, "can_other", !!v)}
                            />
                          </div>
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

      <div className="mt-6" />
      <SectionFrame>
        <SectionTitle>Permissions Matrix</SectionTitle>
        <div className="overflow-auto max-h-[70vh]">
          <table className="text-xs w-full">
            <thead className="sticky top-0 bg-background">
              <tr>
                <th className="text-left p-2 sticky left-0 bg-background">Table</th>
                {roles.map((r) => (
                  <th key={r.role_key} className="p-2 text-center min-w-[160px] border-l">
                    {r.label}
                  </th>
                ))}
              </tr>
              <tr className="text-[10px] text-muted-foreground">
                <th className="sticky left-0 bg-background"></th>
                {roles.map((r) => (
                  <th key={r.role_key} className="border-l">
                    <div className="flex justify-around px-2">
                      <span>View</span>
                      <span>Edit</span>
                      <span>Other</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EDITABLE_TABLES.map((t, i) => (
                <tr key={t.name} className={i % 2 ? "bg-muted/30" : ""}>
                  <td className="p-2 font-medium sticky left-0 bg-inherit">
                    {t.label}
                    <div className="text-[10px] text-muted-foreground">{t.name}</div>
                  </td>
                  {roles.map((r) => {
                    const cur = map.get(`${r.role_key}::${t.name}`) ?? {
                      can_view: true,
                      can_edit: false,
                      can_other: false,
                    };
                    return (
                      <td key={r.role_key} className="p-2 border-l">
                        <div className="flex justify-around">
                          <Checkbox
                            checked={cur.can_view}
                            disabled={!canManage || mut.isPending}
                            onCheckedChange={(v) => flip(r.role_key, t.name, "can_view", !!v)}
                          />
                          <Checkbox
                            checked={cur.can_edit}
                            disabled={!canManage || !cur.can_view || mut.isPending}
                            onCheckedChange={(v) => flip(r.role_key, t.name, "can_edit", !!v)}
                          />
                          <Checkbox
                            checked={cur.can_other}
                            disabled={!canManage || !cur.can_view || mut.isPending}
                            onCheckedChange={(v) => flip(r.role_key, t.name, "can_other", !!v)}
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
      </SectionFrame>

      <div className="mt-6" />
      <SectionFrame>
        <SectionTitle>Page Access</SectionTitle>
        <p className="mb-2 text-xs text-muted-foreground">
          View controls whether the page appears in navigation. Edit / Other on a page are stored
          with the same flags as tables (page-level actions); table permissions above still govern
          the underlying registers.
        </p>
        <div className="overflow-auto max-h-[70vh]">
          <table className="text-xs w-full">
            <thead className="sticky top-0 bg-background">
              <tr>
                <th className="text-left p-2 sticky left-0 bg-background">Page</th>
                {roles.map((r) => (
                  <th key={r.role_key} className="p-2 text-center min-w-[160px] border-l">
                    {r.label}
                  </th>
                ))}
              </tr>
              <tr className="text-[10px] text-muted-foreground">
                <th className="sticky left-0 bg-background"></th>
                {roles.map((r) => (
                  <th key={r.role_key} className="border-l">
                    <div className="flex justify-around px-2">
                      <span>View</span>
                      <span>Edit</span>
                      <span>Other</span>
                    </div>
                  </th>
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
                      <div className="text-[10px] text-muted-foreground">
                        {p.group} · {p.path}
                      </div>
                    </td>
                    {roles.map((r) => {
                      const isAdminRow = r.role_key === "admin" || r.role_key === "org_admin";
                      const cur = map.get(`${r.role_key}::${tname}`) ?? {
                        can_view: true,
                        can_edit: false,
                        can_other: false,
                      };
                      const viewChecked = isAdminRow ? true : cur.can_view;
                      return (
                        <td key={r.role_key} className="p-2 border-l">
                          <div className="flex justify-around">
                            <Checkbox
                              checked={viewChecked}
                              disabled={!canManage || isAdminRow || mut.isPending}
                              onCheckedChange={(v) => flip(r.role_key, tname, "can_view", !!v)}
                            />
                            <Checkbox
                              checked={isAdminRow ? true : cur.can_edit}
                              disabled={!canManage || isAdminRow || !viewChecked || mut.isPending}
                              onCheckedChange={(v) => flip(r.role_key, tname, "can_edit", !!v)}
                            />
                            <Checkbox
                              checked={isAdminRow ? true : cur.can_other}
                              disabled={!canManage || isAdminRow || !viewChecked || mut.isPending}
                              onCheckedChange={(v) => flip(r.role_key, tname, "can_other", !!v)}
                            />
                          </div>
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
