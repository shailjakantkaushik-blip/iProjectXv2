import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/billing")({
  component: Billing,
});

const money = (cents: number, cur = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format((cents ?? 0) / 100);

const statusColor: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  sent: "bg-blue-100 text-blue-800",
  overdue: "bg-red-100 text-red-800",
  draft: "bg-gray-100 text-gray-800",
  void: "bg-gray-100 text-gray-500",
};

function Billing() {
  const { organization } = useAuth();

  const { data: plans = [] } = useQuery({
    queryKey: ["billing_plans"],
    queryFn: async () => (await supabase.from("billing_plans").select("*").eq("active", true).order("sort_order")).data ?? [],
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription", organization?.id],
    queryFn: async () => (await supabase.from("subscriptions").select("*, billing_plans(*)").eq("org_id", organization!.id).maybeSingle()).data,
    enabled: !!organization,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", organization?.id],
    queryFn: async () => (await supabase.from("invoices").select("*").eq("org_id", organization!.id).order("issue_date", { ascending: false })).data ?? [],
    enabled: !!organization,
  });

  const currentPlanId = subscription?.plan_id;
  const totalPaid = invoices.filter((i: any) => i.status === "paid").reduce((s: number, i: any) => s + i.amount_cents, 0);
  const totalDue = invoices.filter((i: any) => i.status === "sent" || i.status === "overdue").reduce((s: number, i: any) => s + i.amount_cents, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing & Invoices</h1>
        <p className="text-sm text-muted-foreground">Manage your subscription and view invoice history.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Current plan</CardDescription><CardTitle className="text-2xl">{(subscription as any)?.billing_plans?.name ?? "Free"}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Status: <Badge variant="outline">{subscription?.status ?? "active"}</Badge>
            {subscription?.current_period_end && <div className="mt-1">Renews {subscription.current_period_end}</div>}
          </CardContent>
        </Card>
        <Card><CardHeader className="pb-2"><CardDescription>Total paid</CardDescription><CardTitle className="text-2xl text-green-700">{money(totalPaid)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Outstanding</CardDescription><CardTitle className={"text-2xl " + (totalDue > 0 ? "text-red-700" : "text-muted-foreground")}>{money(totalDue)}</CardTitle></CardHeader></Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Available plans</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p: any) => {
            const current = p.id === currentPlanId;
            return (
              <Card key={p.id} className={current ? "border-primary ring-2 ring-primary/20" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">{p.name} {current && <Badge>Current</Badge>}</CardTitle>
                  <CardDescription className="text-2xl font-bold text-foreground">
                    {money(p.price_cents, p.currency)}<span className="text-xs font-normal text-muted-foreground">/{p.interval}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1.5 text-sm">
                    {(p.features as string[]).map((f) => (
                      <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" />{f}</li>
                    ))}
                  </ul>
                  <Button className="w-full" variant={current ? "outline" : "default"} disabled={current}>
                    {current ? "Current plan" : "Contact sales to upgrade"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Invoice history</CardTitle></CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No invoices yet.</div>
          ) : (
            <table className="st-table w-full">
              <thead><tr><th>Invoice #</th><th>Issue</th><th>Due</th><th>Period</th><th className="text-right">Amount</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {invoices.map((i: any) => (
                  <tr key={i.id}>
                    <td className="font-mono text-xs">{i.invoice_number}</td>
                    <td>{i.issue_date}</td>
                    <td>{i.due_date}</td>
                    <td className="text-xs text-muted-foreground">{i.period_start ?? "—"} → {i.period_end ?? "—"}</td>
                    <td className="text-right tabular-nums">{money(i.amount_cents, i.currency)}</td>
                    <td><span className={"rounded px-2 py-0.5 text-xs font-medium " + (statusColor[i.status] ?? "bg-gray-100")}>{i.status}</span></td>
                    <td>{i.stripe_hosted_url && <a href={i.stripe_hosted_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs inline-flex items-center gap-1">View <ExternalLink className="h-3 w-3" /></a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
