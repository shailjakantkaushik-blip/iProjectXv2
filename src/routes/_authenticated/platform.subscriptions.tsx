import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/platform/subscriptions")({
  component: SubsPage,
});

function SubsPage() {
  const qc = useQueryClient();

  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs_with_subs"],
    queryFn: async () => (await supabase.from("organizations").select("id,name,plan").order("name")).data ?? [],
  });
  const { data: subs = [] } = useQuery({
    queryKey: ["all_subs"],
    queryFn: async () => (await supabase.from("subscriptions").select("*, billing_plans(name,price_cents,interval)")).data ?? [],
  });
  const { data: plans = [] } = useQuery({
    queryKey: ["all_plans_light"],
    queryFn: async () => (await supabase.from("billing_plans").select("id,name,code").eq("active", true).order("sort_order")).data ?? [],
  });

  const upsert = useMutation({
    mutationFn: async ({ org_id, plan_id }: any) => {
      const existing = subs.find((s: any) => s.org_id === org_id);
      if (existing) return supabase.from("subscriptions").update({ plan_id }).eq("id", existing.id);
      return supabase.from("subscriptions").insert({ org_id, plan_id, status: "active", current_period_start: new Date().toISOString().slice(0, 10) });
    },
    onSuccess: () => { toast.success("Subscription updated"); qc.invalidateQueries({ queryKey: ["all_subs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const byOrg = new Map(subs.map((s: any) => [s.org_id, s]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Customer Subscriptions</h1>
        <p className="text-sm text-muted-foreground">Assign a plan to each customer organization.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>{orgs.length} organizations</CardTitle></CardHeader>
        <CardContent>
          <table className="st-table w-full">
            <thead><tr><th>Organization</th><th>Current plan</th><th>Status</th><th>Period end</th><th>Change plan</th></tr></thead>
            <tbody>
              {orgs.map((o: any) => {
                const s: any = byOrg.get(o.id);
                return (
                  <tr key={o.id}>
                    <td className="font-medium">{o.name}</td>
                    <td>{s?.billing_plans?.name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td>{s?.status ?? "—"}</td>
                    <td>{s?.current_period_end ?? "—"}</td>
                    <td>
                      <Select value={s?.plan_id ?? ""} onValueChange={(v) => upsert.mutate({ org_id: o.id, plan_id: v })}>
                        <SelectTrigger className="h-7 w-40"><SelectValue placeholder="Assign plan" /></SelectTrigger>
                        <SelectContent>{plans.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
