import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/platform/plans")({
  component: PlansPage,
});

function PlansPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<any>({ code: "", name: "", price_cents: 0, interval: "month", features: "" });

  const { data: plans = [] } = useQuery({
    queryKey: ["all_plans"],
    queryFn: async () => (await supabase.from("billing_plans").select("*").order("sort_order")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async (p: any) => {
      const { id, ...rest } = p;
      const payload = { ...rest, features: typeof rest.features === "string" ? rest.features.split("\n").filter(Boolean) : rest.features };
      if (id) return supabase.from("billing_plans").update(payload).eq("id", id);
      return supabase.from("billing_plans").insert(payload);
    },
    onSuccess: () => { toast.success("Plan saved"); qc.invalidateQueries({ queryKey: ["all_plans"] }); setShowNew(false); setForm({ code: "", name: "", price_cents: 0, interval: "month", features: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => supabase.from("billing_plans").delete().eq("id", id),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["all_plans"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing Plans</h1>
          <p className="text-sm text-muted-foreground">Create and edit customer pricing plans.</p>
        </div>
        <Button onClick={() => setShowNew(!showNew)}><Plus className="mr-2 h-4 w-4" />New plan</Button>
      </div>

      {showNew && (
        <Card>
          <CardHeader><CardTitle>New plan</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="enterprise" /></div>
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Price (cents)</Label><Input type="number" value={form.price_cents} onChange={(e) => setForm({ ...form, price_cents: Number(e.target.value) })} /></div>
            <div><Label>Interval</Label><Input value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })} placeholder="month / year" /></div>
            <div className="md:col-span-2"><Label>Features (one per line)</Label><Textarea value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} /></div>
            <div className="md:col-span-2"><Button onClick={() => save.mutate(form)}>Save plan</Button></div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p: any) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <Input className="max-w-[70%]" defaultValue={p.name} onBlur={(e) => save.mutate({ id: p.id, name: e.target.value })} />
                <Button size="icon" variant="ghost" onClick={() => del.mutate(p.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Code</Label><Input defaultValue={p.code} onBlur={(e) => save.mutate({ id: p.id, code: e.target.value })} /></div>
                <div><Label className="text-xs">Interval</Label><Input defaultValue={p.interval} onBlur={(e) => save.mutate({ id: p.id, interval: e.target.value })} /></div>
                <div><Label className="text-xs">Price ¢</Label><Input type="number" defaultValue={p.price_cents} onBlur={(e) => save.mutate({ id: p.id, price_cents: Number(e.target.value) })} /></div>
                <div><Label className="text-xs">Stripe price id</Label><Input defaultValue={p.stripe_price_id ?? ""} onBlur={(e) => save.mutate({ id: p.id, stripe_price_id: e.target.value })} /></div>
              </div>
              <div>
                <Label className="text-xs">Features</Label>
                <Textarea rows={4} defaultValue={(p.features ?? []).join("\n")} onBlur={(e) => save.mutate({ id: p.id, features: e.target.value })} />
              </div>
              <div className="flex items-center gap-2"><Switch checked={p.active} onCheckedChange={(v) => save.mutate({ id: p.id, active: v })} /><span className="text-xs">Active</span></div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
