import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/business-units")({
  component: BUs,
});

function BUs() {
  const { organization, roles } = useAuth();
  const admin = isAdmin(roles);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const { data: bus = [] } = useQuery({
    queryKey: ["bus", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_units").select("*").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !name.trim()) return;
    const { error } = await supabase.from("business_units").insert({ org_id: organization.id, name: name.trim(), code: code.trim() || null });
    if (error) return toast.error(error.message);
    toast.success("Added");
    setName(""); setCode("");
    qc.invalidateQueries({ queryKey: ["bus"] });
  };

  const del = async (id: string) => {
    if (!confirm("Delete business unit?")) return;
    const { error } = await supabase.from("business_units").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["bus"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Business Units</h1>
        <p className="text-sm text-muted-foreground">Divisions in {organization?.name}.</p>
      </div>

      {admin && (
        <Card><CardContent className="pt-6">
          <form onSubmit={add} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-40"><label className="mb-1 block text-xs">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div className="w-32"><label className="mb-1 block text-xs">Code</label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
            <Button type="submit"><Plus className="mr-2 h-4 w-4" />Add</Button>
          </form>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {bus.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No business units yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Code</th><th /></tr>
            </thead>
            <tbody>
              {bus.map((b) => (
                <tr key={b.id} className="border-b">
                  <td className="px-4 py-2 font-medium">{b.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{b.code || "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {admin && <Button variant="ghost" size="sm" onClick={() => del(b.id)}><Trash2 className="h-4 w-4" /></Button>}
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
