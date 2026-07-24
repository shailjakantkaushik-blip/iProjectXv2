import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Award, Building2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/platform/licenses")({
  component: LicensesPage,
});

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-100 text-green-800",
  Revoked: "bg-red-100 text-red-800",
  Expired: "bg-gray-100 text-gray-600",
};

function generateCertNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `CERT-${year}-${rand}`;
}

function LicensesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs_light"],
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id,name,plan")
        .order("name");
      return data ?? [];
    },
  });

  const { data: certs = [], isLoading } = useQuery({
    queryKey: ["platform_license_certs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("org_license_certificates")
        .select("*, organizations(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [form, setForm] = useState({
    org_id: "",
    certificate_number: generateCertNumber(),
    issued_at: new Date().toISOString().slice(0, 10),
    expires_at: "",
    plan_code: "",
    seats: "10",
  });
  const [showForm, setShowForm] = useState(false);

  function setField(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const issueCert = useMutation({
    mutationFn: async () => {
      if (!form.org_id) throw new Error("Select an organization");
      const { error } = await (supabase as any)
        .from("org_license_certificates")
        .insert({
          org_id: form.org_id,
          certificate_number: form.certificate_number,
          issued_at: form.issued_at,
          expires_at: form.expires_at || null,
          plan_code: form.plan_code || null,
          seats: parseInt(form.seats, 10) || 1,
          issued_by: user?.email ?? null,
          status: "Active",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificate issued");
      setForm({
        org_id: "",
        certificate_number: generateCertNumber(),
        issued_at: new Date().toISOString().slice(0, 10),
        expires_at: "",
        plan_code: "",
        seats: "10",
      });
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["platform_license_certs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revokeOrActivate = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any)
        .from("org_license_certificates")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificate updated");
      qc.invalidateQueries({ queryKey: ["platform_license_certs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">License Certificates</h1>
          <p className="text-sm text-muted-foreground">
            Issue and manage software license certificates for customer organizations.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          Issue certificate
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              New License Certificate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <Label>Organization *</Label>
                <Select
                  value={form.org_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, org_id: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select organization…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(orgs as any[]).map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Certificate number</Label>
                <Input
                  value={form.certificate_number}
                  onChange={setField("certificate_number")}
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label>Plan code</Label>
                <Input
                  value={form.plan_code}
                  onChange={setField("plan_code")}
                  placeholder="e.g. enterprise"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Seats</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.seats}
                  onChange={setField("seats")}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Issued at</Label>
                <Input
                  type="date"
                  value={form.issued_at}
                  onChange={setField("issued_at")}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Expires at (optional)</Label>
                <Input
                  type="date"
                  value={form.expires_at}
                  onChange={setField("expires_at")}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={() => issueCert.mutate()} disabled={issueCert.isPending}>
                {issueCert.isPending ? "Issuing…" : "Issue certificate"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All certificates ({(certs as any[]).length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (certs as any[]).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No certificates issued yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Certificate #</th>
                    <th className="px-4 py-3 font-semibold">Organization</th>
                    <th className="px-4 py-3 font-semibold">Plan</th>
                    <th className="px-4 py-3 font-semibold">Seats</th>
                    <th className="px-4 py-3 font-semibold">Issued</th>
                    <th className="px-4 py-3 font-semibold">Expires</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(certs as any[]).map((c: any) => (
                    <tr key={c.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-5 py-3 font-mono font-semibold">
                        {c.certificate_number}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {c.organizations?.name ?? c.org_id}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.plan_code ?? "—"}
                      </td>
                      <td className="px-4 py-3">{c.seats}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.issued_at}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.expires_at ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS_COLORS[c.status] ?? ""}>{c.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {c.status === "Active" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-destructive hover:text-destructive"
                            onClick={() =>
                              revokeOrActivate.mutate({ id: c.id, status: "Revoked" })
                            }
                          >
                            Revoke
                          </Button>
                        ) : c.status === "Revoked" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() =>
                              revokeOrActivate.mutate({ id: c.id, status: "Active" })
                            }
                          >
                            Reactivate
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
