import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  adminAssignUserRole,
  adminRemoveUserRole,
  adminSetUserActive,
  listMyOrgUsers,
  orgAdminCreateUser,
} from "@/lib/user-admin.functions";
import { UserDirectoryTable, randomPassword } from "@/components/user-directory-table";
import { PageLoading } from "@/components/page-loading";

export const Route = createFileRoute("/_authenticated/app/team")({
  component: Team,
});

function Team() {
  const { organization, roles: myRoles, user } = useAuth();
  const admin = isAdmin(myRoles);
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!admin) navigate({ to: "/app", replace: true });
  }, [admin, navigate]);

  const listUsers = useServerFn(listMyOrgUsers);
  const createUser = useServerFn(orgAdminCreateUser);
  const setActive = useServerFn(adminSetUserActive);
  const assignRole = useServerFn(adminAssignUserRole);
  const removeRole = useServerFn(adminRemoveUserRole);

  const { data, isLoading } = useQuery({
    queryKey: ["org_team_directory", organization?.id],
    queryFn: async () => listUsers(),
    enabled: !!organization && admin,
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [uEmail, setUEmail] = useState("");
  const [uName, setUName] = useState("");
  const [uRole, setURole] = useState("pm");
  const [uPwd, setUPwd] = useState(randomPassword());

  const addUser = useMutation({
    mutationFn: async () =>
      createUser({
        data: {
          email: uEmail,
          full_name: uName,
          role: uRole as any,
          default_password: uPwd,
        },
      }),
    onSuccess: () => {
      toast.success(`User created. Share password: ${uPwd}`);
      setUEmail("");
      setUName("");
      setUPwd(randomPassword());
      qc.invalidateQueries({ queryKey: ["org_team_directory"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const runUserAction = async (userId: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusyId(userId);
    try {
      await fn();
      toast.success(okMsg);
      await qc.invalidateQueries({ queryKey: ["org_team_directory"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  if (!admin) return null;

  const orgId = data?.org.id ?? organization?.id ?? "";
  const users = data?.users ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team & Roles</h1>
        <p className="text-sm text-muted-foreground">
          Manage users in {organization?.name ?? "your organisation"} — roles and
          activate/deactivate. Account deletion is only available to platform admins.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create user</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Full name</Label>
            <Input value={uName} onChange={(e) => setUName(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} />
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
          <div className="md:col-span-2">
            <Button
              disabled={!uEmail || !uName || !uPwd || addUser.isPending}
              onClick={() => addUser.mutate()}
            >
              {addUser.isPending ? "Creating…" : "Create user"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              New users must change the password on first sign-in. They are created in your
              organisation only.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {users.length} user{users.length === 1 ? "" : "s"}
            {data?.org?.name ? ` · ${data.org.name}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <PageLoading label="Loading team…" fullScreen={false} size="md" />
          ) : (
            <UserDirectoryTable
              users={users}
              orgId={orgId}
              currentUserId={user?.id}
              busyId={busyId}
              onToggleActive={(u, next) =>
                void runUserAction(
                  u.id,
                  () => setActive({ data: { user_id: u.id, is_active: next } }),
                  next ? "User activated" : "User deactivated",
                )
              }
              onAssignRole={(u, role) =>
                void runUserAction(
                  u.id,
                  () =>
                    assignRole({
                      data: { user_id: u.id, org_id: orgId, role: role as any },
                    }),
                  "Role added",
                )
              }
              onRemoveRole={(u, role) =>
                void runUserAction(
                  u.id,
                  () =>
                    removeRole({
                      data: { user_id: u.id, org_id: orgId, role: role as any },
                    }),
                  "Role removed",
                )
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
