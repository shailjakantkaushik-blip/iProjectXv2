import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

export type DirectoryUser = {
  id: string;
  email: string;
  full_name: string | null;
  org_id: string | null;
  is_active: boolean;
  must_change_password?: boolean;
  roles: string[];
};

const ROLE_OPTIONS = [
  { value: "org_admin", label: "Org Admin" },
  { value: "admin", label: "Admin" },
  { value: "bu_lead", label: "BU Lead" },
  { value: "pm", label: "PM" },
  { value: "executive", label: "Executive" },
] as const;

export function UserDirectoryTable({
  users,
  orgId,
  currentUserId,
  busyId,
  onToggleActive,
  onDelete,
  onAssignRole,
  onRemoveRole,
}: {
  users: DirectoryUser[];
  orgId: string;
  currentUserId?: string | null;
  busyId?: string | null;
  onToggleActive: (user: DirectoryUser, next: boolean) => void;
  onDelete: (user: DirectoryUser) => void;
  onAssignRole: (user: DirectoryUser, role: string) => void;
  onRemoveRole: (user: DirectoryUser, role: string) => void;
}) {
  const [addRoleFor, setAddRoleFor] = useState<Record<string, string>>({});

  if (users.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">No users in this organisation yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">User</th>
            <th className="px-3 py-2">Roles</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const self = u.id === currentUserId;
            const busy = busyId === u.id;
            const assignable = ROLE_OPTIONS.filter((r) => !u.roles.includes(r.value));
            return (
              <tr key={u.id} className="border-b align-top">
                <td className="px-3 py-3">
                  <div className="font-medium">{u.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                  {u.must_change_password && (
                    <div className="mt-1 text-[11px] text-amber-700">Must change password</div>
                  )}
                  {self && (
                    <div className="mt-1 text-[11px] text-muted-foreground">You</div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 && (
                      <span className="text-xs text-muted-foreground">No roles</span>
                    )}
                    {u.roles.map((r) => (
                      <Badge
                        key={r}
                        variant="secondary"
                        className={self ? "" : "cursor-pointer"}
                        title={self ? r : "Click to remove role"}
                        onClick={() => {
                          if (!self && !busy && ROLE_OPTIONS.some((o) => o.value === r)) {
                            onRemoveRole(u, r);
                          }
                        }}
                      >
                        {r}
                        {!self && ROLE_OPTIONS.some((o) => o.value === r) ? " ×" : ""}
                      </Badge>
                    ))}
                  </div>
                  {!self && assignable.length > 0 && (
                    <div className="mt-2 flex max-w-xs items-center gap-2">
                      <Select
                        value={addRoleFor[u.id] ?? ""}
                        onValueChange={(v) => setAddRoleFor((m) => ({ ...m, [u.id]: v }))}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Add role" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignable.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!addRoleFor[u.id] || busy}
                        onClick={() => {
                          const role = addRoleFor[u.id];
                          if (!role) return;
                          onAssignRole(u, role);
                          setAddRoleFor((m) => ({ ...m, [u.id]: "" }));
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  {u.is_active ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>
                  ) : (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={self || busy}
                      onClick={() => onToggleActive(u, !u.is_active)}
                    >
                      {u.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={self || busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Permanently delete ${u.full_name || u.email}? This cannot be undone.`,
                          )
                        ) {
                          onDelete(u);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Org id for role ops: {orgId.slice(0, 8)}… · Click a role badge to remove it. You cannot
        deactivate or delete your own account.
      </p>
    </div>
  );
}

export function randomPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + "!";
}
