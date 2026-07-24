import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Line,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { calcInvoiceGst, fetchInvoiceTemplate } from "@/lib/invoice-template";
import { ExpandableChart } from "@/components/expandable-chart";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/platform/finance")({
  component: FinancePage,
});

const money = (c: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format((c ?? 0) / 100);
const monthKey = (d: string | Date) => new Date(d).toISOString().slice(0, 7);

function FinancePage() {
  const { data: invoices = [] } = useQuery({
    queryKey: ["fin_invoices"],
    queryFn: async () => (await supabase.from("invoices").select("*")).data ?? [],
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["fin_expenses"],
    queryFn: async () => (await supabase.from("platform_expenses").select("*")).data ?? [],
  });
  const { data: subs = [] } = useQuery({
    queryKey: ["fin_subs"],
    queryFn: async () =>
      (await supabase.from("subscriptions").select("*, billing_plans(price_cents,interval,name)"))
        .data ?? [],
  });
  const { data: invoiceTemplate } = useQuery({
    queryKey: ["invoice-template"],
    queryFn: fetchInvoiceTemplate,
  });

  const invoiceTotal = (amountCents: number) =>
    calcInvoiceGst(
      amountCents,
      invoiceTemplate ?? {
        gst_enabled: false,
        gst_percent: 0,
        gst_label: "GST",
        gst_inclusive: false,
      },
    ).total_cents;

  const kpis = useMemo(() => {
    const paid = invoices.filter((i: any) => i.status === "paid");
    const totalRevenue = paid.reduce((s: number, i: any) => s + invoiceTotal(i.amount_cents), 0);
    const totalDue = invoices
      .filter((i: any) => ["sent", "overdue"].includes(i.status))
      .reduce((s: number, i: any) => s + invoiceTotal(i.amount_cents), 0);
    const overdue = invoices
      .filter((i: any) => i.status === "overdue")
      .reduce((s: number, i: any) => s + invoiceTotal(i.amount_cents), 0);
    const totalExpenses = expenses.reduce((s: number, e: any) => s + e.amount_cents, 0);
    const netProfit = totalRevenue - totalExpenses;
    // MRR: sum of active subs' monthly-equivalent
    const mrr = subs
      .filter((s: any) => s.status === "active" && s.billing_plans)
      .reduce((s: number, sub: any) => {
        const p = sub.billing_plans;
        const monthly = p.interval === "year" ? p.price_cents / 12 : p.price_cents;
        return s + monthly;
      }, 0);
    return {
      totalRevenue,
      totalDue,
      overdue,
      totalExpenses,
      netProfit,
      mrr,
      arr: mrr * 12,
      paidCount: paid.length,
      dueCount: invoices.length - paid.length,
    };
  }, [invoices, expenses, subs, invoiceTemplate]);

  // Monthly revenue vs expenses (last 12 months + 6 forecast)
  const monthly = useMemo(() => {
    const map = new Map<
      string,
      { month: string; revenue: number; expenses: number; forecast: number }
    >();
    const now = new Date();
    for (let i = -11; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      map.set(monthKey(d), { month: monthKey(d), revenue: 0, expenses: 0, forecast: 0 });
    }
    invoices
      .filter((i: any) => i.status === "paid" && i.paid_date)
      .forEach((i: any) => {
        const k = monthKey(i.paid_date);
        const r = map.get(k);
        if (r) r.revenue += invoiceTotal(i.amount_cents);
      });
    expenses.forEach((e: any) => {
      const k = monthKey(e.expense_date);
      const r = map.get(k);
      if (r) r.expenses += e.amount_cents;
    });
    // Forecast: MRR into future months where revenue is 0
    const rows = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
    const nowKey = monthKey(now);
    rows.forEach((r) => {
      if (r.month > nowKey) r.forecast = kpis.mrr;
    });
    return rows;
  }, [invoices, expenses, kpis.mrr, invoiceTemplate]);

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    expenses.forEach((e: any) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount_cents));
    return Array.from(m, ([name, value]) => ({ name, value }));
  }, [expenses]);
  const COLORS = ["#1d4ed8", "#f59e0b", "#22c55e", "#8b5cf6", "#ef4444"];

  const pnlRows = useMemo(() => {
    const nowKey = new Date().toISOString().slice(0, 7);
    return monthly
      .filter((m) => m.month <= nowKey)
      .map((m) => ({
        ...m,
        net: m.revenue - m.expenses,
      }));
  }, [monthly]);

  const pnlColumns: ColumnarColumn<(typeof pnlRows)[number]>[] = useMemo(
    () => [
      { key: "month", label: "Month" },
      { key: "revenue", label: "Revenue" },
      { key: "expenses", label: "Expenses" },
      { key: "net", label: "Net" },
    ],
    [],
  );
  const pnlTable = useColumnarTable(pnlRows, pnlColumns);

  const KPI = ({ label, value, sub, tone }: any) => (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={"text-2xl " + (tone ?? "")}>{value}</CardTitle>
      </CardHeader>
      {sub && <CardContent className="text-xs text-muted-foreground">{sub}</CardContent>}
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Finance & P&L</h1>
        <p className="text-sm text-muted-foreground">
          iProjectX platform revenue, expenses and forecast.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI
          label="Total Revenue (paid)"
          value={money(kpis.totalRevenue)}
          sub={`${kpis.paidCount} invoices paid`}
          tone="text-green-700"
        />
        <KPI
          label="MRR"
          value={money(kpis.mrr)}
          sub={`ARR ${money(kpis.arr)}`}
          tone="text-primary"
        />
        <KPI
          label="Outstanding (due)"
          value={money(kpis.totalDue)}
          sub={`${kpis.dueCount} unpaid`}
          tone={kpis.overdue > 0 ? "text-orange-600" : ""}
        />
        <KPI
          label="Overdue"
          value={money(kpis.overdue)}
          tone={kpis.overdue > 0 ? "text-red-700" : ""}
        />
        <KPI label="Total Expenses" value={money(kpis.totalExpenses)} tone="text-orange-700" />
        <KPI
          label="Net Profit"
          value={money(kpis.netProfit)}
          tone={kpis.netProfit >= 0 ? "text-green-700" : "text-red-700"}
        />
        <KPI
          label="Gross Margin"
          value={
            kpis.totalRevenue > 0
              ? ((kpis.netProfit / kpis.totalRevenue) * 100).toFixed(1) + "%"
              : "—"
          }
        />
        <KPI label="Active Subs" value={subs.filter((s: any) => s.status === "active").length} />
      </div>

      <ExpandableChart title="Revenue vs Expenses (12m actual + 6m forecast)" heightClass="h-80">
        <ComposedChart data={monthly}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
          <XAxis dataKey="month" fontSize={10} />
          <YAxis fontSize={11} tickFormatter={(v) => "$" + (v / 100).toLocaleString()} />
          <Tooltip formatter={(v: any) => money(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="revenue" fill="#22c55e" name="Revenue (paid)" />
          <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="Forecast (MRR)"
          />
        </ComposedChart>
      </ExpandableChart>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profit & Loss (last 12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ColumnarToolbar
              globalQ={pnlTable.globalQ}
              onGlobalQ={pnlTable.setGlobalQ}
              shown={pnlTable.rows.length}
              total={pnlTable.total}
              onClear={pnlTable.clearAll}
              placeholder="Search P&L…"
            />
            <table className="st-table w-full text-sm">
              <thead>
                <tr>
                  {pnlColumns.map((col) => (
                    <ColumnarTh
                      key={col.key}
                      column={col}
                      filter={pnlTable.filters[col.key]}
                      onFilter={(v) => pnlTable.setColumnFilter(col.key, v)}
                      sortKey={pnlTable.sortKey}
                      sortDir={pnlTable.sortDir}
                      onToggleSort={pnlTable.toggleSort}
                      align={col.key === "month" ? "left" : "right"}
                      className={col.key === "month" ? undefined : "text-right"}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {pnlTable.rows.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td className="text-right tabular-nums text-green-700">{money(m.revenue)}</td>
                    <td className="text-right tabular-nums text-red-700">{money(m.expenses)}</td>
                    <td
                      className={
                        "text-right tabular-nums font-semibold " +
                        (m.net >= 0 ? "text-green-800" : "text-red-800")
                      }
                    >
                      {money(m.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {byCat.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Expenses by category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-6 text-center text-sm text-muted-foreground">
                No expenses recorded.
              </div>
            </CardContent>
          </Card>
        ) : (
          <ExpandableChart title="Expenses by category" heightClass="h-72">
            <PieChart>
              <Pie
                data={byCat}
                dataKey="value"
                nameKey="name"
                outerRadius={100}
                label={(e: any) => `${e.name}: ${money(e.value)}`}
              >
                {byCat.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => money(Number(v))} />
            </PieChart>
          </ExpandableChart>
        )}
      </div>
    </div>
  );
}
