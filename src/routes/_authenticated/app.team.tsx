import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin, type AppRole } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/team")({
  component: Team,
});

const ROLES: AppRole[] = ["org_admin", "bu_lead", "pm", "executive"];

function Team() {
  const { organization, roles: myRoles } = useAuth();
  const admin = isAdmin(myRoles);
  const qc = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => { if (!admin) navigate({ to: "/app", replace: true }); }, [admin, navigate]);

  const { data: members = [] } = useQuery({
    queryKey: ["team", organization?.id],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("id,email,full_name").eq("org_id", organization!.id);
      const { data: rolesRows } = await supabase.from("user_roles").select("user_id,role").eq("org_id", organization!.id);
      const byUser = new Map<string, AppRole[]>();
      (rolesRows ?? []).forEach((r) => {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        byUser.set(r.user_id, arr);
      });
      return (profiles ?? []).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    },
    enabled: !!organization && admin,
  });

  const [targetUser, setTargetUser] = useState<string>("");
  const [targetRole, setTargetRole] = useState<AppRole>("pm");

  const assign = async () => {
    if (!targetUser || !organization) return;
    const { error } = await supabase.from("user_roles").insert({ user_id: targetUser, org_id: organization.id, role: targetRole });
    if (error) return toast.error(error.message);
    toast.success("Role added");
    qc.invalidateQueries({ queryKey: ["team"] });
  };

  const removeRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("org_id", organization!.id).eq("role", role);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["team"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team & Roles</h1>
        <p className="text-sm text-muted-foreground">Invite via signup URL. Assign roles below.</p>
      </div>

      <Card><CardContent className="pt-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-52">
            <label className="mb-1 block text-xs">User</label>
            <select value={targetUser} onChange={(e) => setTargetUser(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select…</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email} ({m.email})</option>)}
            </select>
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs">Role</label>
            <select value={targetRole} onChange={(e) => setTargetRole(e.target.value as AppRole)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <Button onClick={assign} disabled={!targetUser}>Assign</Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          To invite a new member: share your app URL. They sign up, then appear here. Users automatically join your organization when they belong to no org yet — until then they'll be in onboarding. (Auto-join by email domain can be added later.)
        </p>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        {members.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No members yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Roles</th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b align-top">
                  <td className="px-4 py-3 font-medium">{m.full_name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {m.roles.length === 0 && <span className="text-xs text-muted-foreground">viewer (no roles)</span>}
                      {m.roles.map((r) => (
                        <Badge key={r} variant="secondary" className="cursor-pointer" onClick={() => removeRole(m.id, r)} title="Click to remove">
                          {r} ×
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent></Card>
    </div>
  );
}
