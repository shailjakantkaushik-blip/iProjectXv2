import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { adminCreateOrganization, adminCreateUser } from "@/lib/platform-admin.functions";
import {
  adminAssignUserRole,
  adminDeleteUser,
  adminRemoveUserRole,
  adminSetUserActive,
  listAllOrgsDirectory,
} from "@/lib/user-admin.functions";
import { UserDirectoryTable, randomPassword } from "@/components/user-directory-table";
import { useAuth } from "@/lib/auth-context";
import { ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/platform/organizations")({
  component: OrgsPage,
});

function OrgsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const createOrg = useServerFn(adminCreateOrganization);
  const createUser = useServerFn(adminCreateUser);
  const listDirectory = useServerFn(listAllOrgsDirectory);
  const setActive = useServerFn(adminSetUserActive);
  const deleteUser = useServerFn(adminDeleteUser);
  const assignRole = useServerFn(adminAssignUserRole);
  const removeRole = useServerFn(adminRemoveUserRole);

  const { data: directory = [], isLoading } = useQuery({
    queryKey: ["platform_orgs_directory"],
    queryFn: async () => listDirectory(),
  });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");

  const addOrg = useMutation({
    mutationFn: async () => createOrg({ data: { name: orgName, slug: orgSlug } }),
    onSuccess: () => {
      toast.success("Organization created");
      setOrgName("");
      setOrgSlug("");
      qc.invalidateQueries({ queryKey: ["platform_orgs_directory"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [uEmail, setUEmail] = useState("");
  const [uName, setUName] = useState("");
  const [uOrg, setUOrg] = useState<string>("");
  const [uRole, setURole] = useState<string>("pm");
  const [uPwd, setUPwd] = useState(randomPassword());

  const addUser = useMutation({
    mutationFn: async () =>
      createUser({
        data: {
          email: uEmail,
          full_name: uName,
          org_id: uOrg,
          role: uRole as any,
          default_password: uPwd,
        },
      }),
    onSuccess: () => {
      toast.success(`User created. Share password: ${uPwd}`);
      setUEmail("");
      setUName("");
      setUPwd(randomPassword());
      qc.invalidateQueries({ queryKey: ["platform_orgs_directory"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return directory;
    return directory
      .map((org) => ({
        ...org,
        users: org.users.filter(
          (u) =>
            u.email.toLowerCase().includes(q) ||
            (u.full_name || "").toLowerCase().includes(q) ||
            u.roles.some((r) => r.toLowerCase().includes(q)),
        ),
      }))
      .filter(
        (org) =>
          org.name.toLowerCase().includes(q) ||
          org.slug.toLowerCase().includes(q) ||
          org.users.length > 0,
      );
  }, [directory, filter]);

  const runUserAction = async (userId: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusyId(userId);
    try {
      await fn();
      toast.success(okMsg);
      await qc.invalidateQueries({ queryKey: ["platform_orgs_directory"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organizations & Users</h1>
        <p className="text-sm text-muted-foreground">
          View every organisation and its users, assign roles, activate/deactivate, or delete
          accounts.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>New Organization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                value={orgSlug}
                onChange={(e) =>
                  setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                }
                placeholder="acme-corp"
              />
            </div>
            <Button
              disabled={!orgName || !orgSlug || addOrg.isPending}
              onClick={() => addOrg.mutate()}
            >
              {addOrg.isPending ? "Creating…" : "Create organization"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New User</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Full name</Label>
              <Input value={uName} onChange={(e) => setUName(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} />
            </div>
            <div>
              <Label>Organization</Label>
              <Select value={uOrg} onValueChange={setUOrg}>
                <SelectTrigger>
                  <SelectValue placeholder="Select org" />
                </SelectTrigger>
                <SelectContent>
                  {directory.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={uRole} onValueChange={setURole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_admin">Org Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="bu_lead">BU Lead</SelectItem>
                  <SelectItem value="pm">Project Manager</SelectItem>
                  <SelectItem value="executive">Executive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default password</Label>
              <div className="flex gap-2">
                <Input value={uPwd} onChange={(e) => setUPwd(e.target.value)} />
                <Button type="button" variant="secondary" onClick={() => setUPwd(randomPassword())}>
                  Regenerate
                </Button>
              </div>
            </div>
            <Button
              disabled={!uEmail || !uName || !uOrg || !uPwd || addUser.isPending}
              onClick={() => addUser.mutate()}
            >
              {addUser.isPending ? "Creating…" : "Create user"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle>
            {directory.length} organisations ·{" "}
            {directory.reduce((n, o) => n + o.users.length, 0)} users
          </CardTitle>
          <Input
            className="max-w-xs"
            placeholder="Filter org or user…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading directory…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No organisations match.</p>
          )}
          {filtered.map((org) => {
            const open = expanded[org.id] ?? true;
            return (
              <div key={org.id} className="rounded-lg border">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/40"
                  onClick={() => setExpanded((m) => ({ ...m, [org.id]: !open }))}
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{org.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {org.slug} · {org.plan} · {org.users.length} user
                      {org.users.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </button>
                {open && (
                  <div className="border-t px-2 pb-2">
                    <UserDirectoryTable
                      users={org.users}
                      orgId={org.id}
                      currentUserId={user?.id}
                      busyId={busyId}
                      onToggleActive={(u, next) =>
                        void runUserAction(
                          u.id,
                          () => setActive({ data: { user_id: u.id, is_active: next } }),
                          next ? "User activated" : "User deactivated",
                        )
                      }
                      onDelete={(u) =>
                        void runUserAction(
                          u.id,
                          () => deleteUser({ data: { user_id: u.id } }),
                          "User deleted",
                        )
                      }
                      onAssignRole={(u, role) =>
                        void runUserAction(
                          u.id,
                          () =>
                            assignRole({
                              data: { user_id: u.id, org_id: org.id, role: role as any },
                            }),
                          "Role added",
                        )
                      }
                      onRemoveRole={(u, role) =>
                        void runUserAction(
                          u.id,
                          () =>
                            removeRole({
                              data: { user_id: u.id, org_id: org.id, role: role as any },
                            }),
                          "Role removed",
                        )
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
