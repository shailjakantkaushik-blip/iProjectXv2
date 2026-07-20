import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import { adminCreateOrganization, adminCreateUser } from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/_authenticated/platform/organizations")({
  component: OrgsPage,
});

function randomPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + "!";
}

function OrgsPage() {
  const qc = useQueryClient();
  const createOrg = useServerFn(adminCreateOrganization);
  const createUser = useServerFn(adminCreateUser);

  const { data: orgs = [] } = useQuery({
    queryKey: ["platform_orgs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id,name,slug,plan").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");

  const addOrg = useMutation({
    mutationFn: async () => createOrg({ data: { name: orgName, slug: orgSlug } }),
    onSuccess: () => {
      toast.success("Organization created");
      setOrgName(""); setOrgSlug("");
      qc.invalidateQueries({ queryKey: ["platform_orgs"] });
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
      createUser({ data: { email: uEmail, full_name: uName, org_id: uOrg, role: uRole as any, default_password: uPwd } }),
    onSuccess: () => {
      toast.success(`User created. Share password: ${uPwd}`);
      setUEmail(""); setUName(""); setUPwd(randomPassword());
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organizations & Users</h1>
        <p className="text-sm text-muted-foreground">
          Create tenant organizations and provision users with a default password. Users will be forced to change it on first sign-in.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>New Organization</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Name</Label><Input value={orgName} onChange={(e) => setOrgName(e.target.value)} /></div>
            <div>
              <Label>Slug</Label>
              <Input value={orgSlug} onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="acme-corp" />
            </div>
            <Button disabled={!orgName || !orgSlug || addOrg.isPending} onClick={() => addOrg.mutate()}>
              {addOrg.isPending ? "Creating…" : "Create organization"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>New User</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Full name</Label><Input value={uName} onChange={(e) => setUName(e.target.value)} /></div>
            <div><Label>Email</Label><Input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} /></div>
            <div>
              <Label>Organization</Label>
              <Select value={uOrg} onValueChange={setUOrg}>
                <SelectTrigger><SelectValue placeholder="Select org" /></SelectTrigger>
                <SelectContent>
                  {orgs.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={uRole} onValueChange={setURole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Button type="button" variant="secondary" onClick={() => setUPwd(randomPassword())}>Regenerate</Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Share this with the user securely — they will be required to change it on first sign-in.</p>
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
        <CardHeader><CardTitle>{orgs.length} organizations</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="st-table w-full min-w-[600px]">
            <thead><tr><th className="text-left">Name</th><th className="text-left">Slug</th><th className="text-left">Plan</th></tr></thead>
            <tbody>
              {orgs.map((o: any) => (
                <tr key={o.id}><td>{o.name}</td><td className="text-muted-foreground">{o.slug}</td><td>{o.plan}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
