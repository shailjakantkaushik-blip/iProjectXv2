import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createOrgRole,
  deleteOrgRole,
  listOrgRolesForAdmin,
  updateOrgRole,
  type OrgRoleAdminRow,
} from "@/lib/org-role-admin.functions";
import { assignableOrgRoles, orgRolesQueryKey, useOrgRoles } from "@/lib/org-roles";

const COPY_NONE = "__none__";

export function OrgRoleCatalog({
  orgId,
  canManage,
}: {
  orgId: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const listRoles = useServerFn(listOrgRolesForAdmin);
  const createRole = useServerFn(createOrgRole);
  const updateRole = useServerFn(updateOrgRole);
  const removeRole = useServerFn(deleteOrgRole);

  const rolesQ = useQuery({
    queryKey: ["org_role_admin", orgId],
    queryFn: async () => listRoles({ data: { org_id: orgId } }),
    enabled: !!orgId && canManage,
  });

  const roles = rolesQ.data?.roles ?? [];

  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [copyFrom, setCopyFrom] = useState<string>(COPY_NONE);
  const fallbackRoles = useOrgRoles(canManage ? null : orgId);
  const [editing, setEditing] = useState<OrgRoleAdminRow | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSort, setEditSort] = useState("200");

  const copyOptions = useMemo(
    () => roles.map((r) => ({ value: r.role_key, label: r.label })),
    [roles],
  );

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["org_role_admin", orgId] }),
      qc.invalidateQueries({ queryKey: orgRolesQueryKey(orgId) }),
      qc.invalidateQueries({ queryKey: ["role_table_permissions"] }),
    ]);
  };

  const addMut = useMutation({
    mutationFn: async () =>
      createRole({
        data: {
          org_id: orgId,
          role_key: newKey,
          label: newLabel,
          description: newDesc.trim() || null,
          copy_from_role_key: copyFrom === COPY_NONE ? null : copyFrom,
        },
      }),
    onSuccess: (res) => {
      toast.success(
        res.copied_permissions
          ? `Role added — copied ${res.copied_permissions} permission rows`
          : "Role added — configure permissions below",
      );
      setNewKey("");
      setNewLabel("");
      setNewDesc("");
      setCopyFrom(COPY_NONE);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("No role selected");
      return updateRole({
        data: {
          org_id: orgId,
          role_id: editing.id,
          label: editLabel,
          description: editDesc.trim() || null,
          sort_order: Number(editSort) || editing.sort_order,
        },
      });
    },
    onSuccess: () => {
      toast.success("Role updated");
      setEditing(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (role: OrgRoleAdminRow) =>
      removeRole({ data: { org_id: orgId, role_id: role.id } }),
    onSuccess: () => {
      toast.success("Role removed");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (role: OrgRoleAdminRow) => {
    setEditing(role);
    setEditLabel(role.label);
    setEditDesc(role.description ?? "");
    setEditSort(String(role.sort_order ?? 200));
  };

  if (!canManage) {
    return (
      <div className="flex flex-wrap gap-2">
        {assignableOrgRoles(fallbackRoles.data ?? []).map((r) => (
          <span
            key={r.id}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs"
          >
            <span className="font-semibold">{r.label}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{r.role_key}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Users</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rolesQ.isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                  Loading roles…
                </td>
              </tr>
            )}
            {rolesQ.isError && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-rose-700">
                  {(rolesQ.error as Error).message}
                </td>
              </tr>
            )}
            {roles.map((r) => (
              <tr key={r.id} className="border-b align-top">
                <td className="px-3 py-3">
                  <div className="font-medium">{r.label}</div>
                  {r.description && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{r.description}</div>
                  )}
                </td>
                <td className="px-3 py-3 font-mono text-xs">{r.role_key}</td>
                <td className="px-3 py-3">
                  {r.is_system ? (
                    <Badge variant="secondary">System</Badge>
                  ) : (
                    <Badge>Custom</Badge>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{r.assigned_users}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                      Edit
                    </Button>
                    {!r.is_system && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          const extra =
                            r.assigned_users > 0
                              ? ` ${r.assigned_users} user${r.assigned_users === 1 ? "" : "s"} still have this key until you remove it.`
                              : "";
                          if (confirm(`Delete role “${r.label}”?${extra}`)) {
                            deleteMut.mutate(r);
                          }
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border bg-muted/20 p-3">
        <div className="mb-2 text-sm font-medium">Add a custom role</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <Label className="text-xs">Role key</Label>
            <Input
              placeholder="e.g. resource_manager"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Display label</Label>
            <Input
              placeholder="Resource manager"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input
              placeholder="Optional"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Copy permissions from</Label>
            <Select value={copyFrom} onValueChange={setCopyFrom}>
              <SelectTrigger>
                <SelectValue placeholder="None — start empty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={COPY_NONE}>None — start empty</SelectItem>
                {copyOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full"
              disabled={addMut.isPending || !newKey.trim()}
              onClick={() => addMut.mutate()}
            >
              {addMut.isPending ? "Adding…" : "Add role"}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Keys are permanent. System roles can be renamed in the label/description but cannot be
          deleted. New roles can be assigned from Admin: Users after you add them.
        </p>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit role</DialogTitle>
            <DialogDescription>
              {editing?.is_system
                ? "System role key stays fixed. You can change the display name and description."
                : "Update the display name, description, and list order. The role key cannot change."}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Role key</Label>
                <Input value={editing.role_key} disabled className="font-mono" />
              </div>
              <div>
                <Label>Display label</Label>
                <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <Label>Sort order</Label>
                <Input
                  type="number"
                  min={0}
                  max={9999}
                  value={editSort}
                  onChange={(e) => setEditSort(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={updateMut.isPending || !editLabel.trim()}
              onClick={() => updateMut.mutate()}
            >
              {updateMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
