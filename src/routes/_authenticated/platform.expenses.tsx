import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/platform/expenses")({
  component: ExpensesPage,
});

const CATS = ["hosting", "salaries", "marketing", "tooling", "other"];
const money = (c: number) => "$" + (c / 100).toLocaleString();

function ExpensesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({ category: "hosting", description: "", amount_cents: 0, expense_date: new Date().toISOString().slice(0, 10), vendor: "", recurring: false });

  const { data: expenses = [] } = useQuery({
    queryKey: ["platform_expenses"],
    queryFn: async () => (await supabase.from("platform_expenses").select("*").order("expense_date", { ascending: false })).data ?? [],
  });

  const add = useMutation({
    mutationFn: async () => supabase.from("platform_expenses").insert(form),
    onSuccess: () => { toast.success("Expense added"); qc.invalidateQueries({ queryKey: ["platform_expenses"] }); setForm({ ...form, description: "", amount_cents: 0 }); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => supabase.from("platform_expenses").delete().eq("id", id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform_expenses"] }),
  });

  const total = expenses.reduce((s: number, e: any) => s + e.amount_cents, 0);

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "expense_date", label: "Date" },
      { key: "category", label: "Category" },
      { key: "description", label: "Description" },
      { key: "vendor", label: "Vendor" },
      { key: "amount_cents", label: "Amount" },
      { key: "actions", label: "", filterable: false, sortable: false },
    ],
    [],
  );
  const table = useColumnarTable(expenses, columns);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Expenses</h1>
        <p className="text-sm text-muted-foreground">Track costs to compute real P&L. Total: <strong>{money(total)}</strong></p>
      </div>

      <Card>
        <CardHeader><CardTitle><Plus className="mr-2 inline h-4 w-4" />Add expense</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <div><Label>Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          <div className="md:col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>Vendor</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
          <div><Label>Amount (cents)</Label><Input type="number" value={form.amount_cents} onChange={(e) => setForm({ ...form, amount_cents: Number(e.target.value) })} /></div>
          <div><Label>Date</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
          <div className="md:col-span-6"><Button onClick={() => add.mutate()} disabled={!form.description || !form.amount_cents}>Add expense</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {table.rows.length}
            {table.rows.length !== table.total ? ` of ${table.total}` : ""} expenses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ColumnarToolbar
            globalQ={table.globalQ}
            onGlobalQ={table.setGlobalQ}
            shown={table.rows.length}
            total={table.total}
            onClear={table.clearAll}
            placeholder="Search expenses…"
          />
          <table className="st-table w-full">
            <thead>
              <tr>
                {columns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={table.filters[col.key]}
                    onFilter={(v) => table.setColumnFilter(col.key, v)}
                    sortKey={table.sortKey}
                    sortDir={table.sortDir}
                    onToggleSort={table.toggleSort}
                    align={col.key === "amount_cents" ? "right" : "left"}
                    className={col.key === "amount_cents" ? "text-right" : undefined}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((e: any) => (
                <tr key={e.id}>
                  <td>{e.expense_date}</td>
                  <td>{e.category}</td>
                  <td>{e.description}</td>
                  <td>{e.vendor ?? "—"}</td>
                  <td className="text-right tabular-nums">{money(e.amount_cents)}</td>
                  <td><Button size="icon" variant="ghost" onClick={() => del.mutate(e.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
