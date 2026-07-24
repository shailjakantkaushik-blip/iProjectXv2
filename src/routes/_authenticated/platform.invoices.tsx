import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Check, Mail, Eye } from "lucide-react";
import { emailInvoice } from "@/lib/invoices.functions";
import { calcInvoiceGst, fetchInvoiceTemplate } from "@/lib/invoice-template";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/platform/invoices")({
  component: InvoicesPage,
});

const money = (c: number) => "$" + (c / 100).toFixed(2);

function InvoicesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<any>({
    org_id: "",
    amount_cents: 0,
    notes: "",
    period_start: "",
    period_end: "",
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["platform_invoices"],
    queryFn: async () =>
      (
        await supabase
          .from("invoices")
          .select("*, organizations(name)")
          .order("issue_date", { ascending: false })
      ).data ?? [],
  });
  const { data: orgs = [] } = useQuery({
    queryKey: ["all_orgs"],
    queryFn: async () =>
      (await supabase.from("organizations").select("id,name,billing_email").order("name")).data ??
      [],
  });
  const { data: invoiceTemplate } = useQuery({
    queryKey: ["invoice-template"],
    queryFn: fetchInvoiceTemplate,
  });

  const emailFn = useServerFn(emailInvoice);
  const emailIt = useMutation({
    mutationFn: async (id: string) => emailFn({ data: { invoiceId: id } }),
    onSuccess: (r: any) => {
      toast.success(`Emailed to ${r.to}`);
      qc.invalidateQueries({ queryKey: ["platform_invoices"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Email failed"),
  });

  const updateBillingEmail = useMutation({
    mutationFn: async ({ orgId, email }: { orgId: string; email: string }) =>
      supabase
        .from("organizations")
        .update({ billing_email: email || null })
        .eq("id", orgId),
    onSuccess: () => {
      toast.success("Billing email updated");
      qc.invalidateQueries({ queryKey: ["all_orgs"] });
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const num = "INV-" + Date.now().toString().slice(-8);
      return supabase.from("invoices").insert({ ...form, invoice_number: num, status: "sent" });
    },
    onSuccess: () => {
      toast.success("Invoice sent");
      qc.invalidateQueries({ queryKey: ["platform_invoices"] });
      setCreating(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: any) => {
      const patch: any = { status };
      if (status === "paid") patch.paid_date = new Date().toISOString().slice(0, 10);
      return supabase.from("invoices").update(patch).eq("id", id);
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["platform_invoices"] });
    },
  });

  const markPaid = useMutation({
    mutationFn: async (inv: any) => {
      const total = invoiceTemplate
        ? calcInvoiceGst(inv.amount_cents, invoiceTemplate).total_cents
        : inv.amount_cents;
      await supabase
        .from("invoice_payments")
        .insert({ invoice_id: inv.id, amount_cents: total, method: "manual" });
      return setStatus.mutateAsync({ id: inv.id, status: "paid" });
    },
  });

  const formGst = invoiceTemplate
    ? calcInvoiceGst(Number(form.amount_cents) || 0, invoiceTemplate)
    : null;

  const orgColumns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "name", label: "Organization" },
      { key: "billing_email", label: "Billing email (invoices go here)" },
    ],
    [],
  );
  const orgTable = useColumnarTable(orgs, orgColumns);

  const invoiceColumns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "invoice_number", label: "Invoice" },
      {
        key: "organization",
        label: "Organization",
        getValue: (i) => i.organizations?.name || "",
      },
      { key: "issue_date", label: "Issue" },
      { key: "due_date", label: "Due" },
      {
        key: "taxable",
        label: "Taxable",
        getValue: (i) =>
          calcInvoiceGst(
            i.amount_cents,
            invoiceTemplate ?? {
              gst_enabled: false,
              gst_percent: 0,
              gst_label: "GST",
              gst_inclusive: false,
            },
          ).subtotal_cents,
      },
      {
        key: "gst",
        label: "GST",
        getValue: (i) =>
          calcInvoiceGst(
            i.amount_cents,
            invoiceTemplate ?? {
              gst_enabled: false,
              gst_percent: 0,
              gst_label: "GST",
              gst_inclusive: false,
            },
          ).gst_cents,
      },
      {
        key: "total",
        label: "Total due",
        getValue: (i) =>
          calcInvoiceGst(
            i.amount_cents,
            invoiceTemplate ?? {
              gst_enabled: false,
              gst_percent: 0,
              gst_label: "GST",
              gst_inclusive: false,
            },
          ).total_cents,
      },
      { key: "status", label: "Status" },
      {
        key: "emailed",
        label: "Emailed",
        getValue: (i) =>
          i.emailed_at
            ? new Date(i.emailed_at).toLocaleString()
            : i.email_last_error
              ? "failed"
              : "",
      },
      { key: "actions", label: "Actions", filterable: false, sortable: false },
    ],
    [invoiceTemplate],
  );
  const invoiceTable = useColumnarTable(invoices, invoiceColumns);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">All Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Send invoices to customer organizations and track payments.
          </p>
        </div>
        <Button onClick={() => setCreating(!creating)}>
          <Plus className="mr-2 h-4 w-4" />
          New invoice
        </Button>
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>New invoice</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Organization</Label>
              <Select value={form.org_id} onValueChange={(v) => setForm({ ...form, org_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                {invoiceTemplate?.gst_enabled && !invoiceTemplate.gst_inclusive
                  ? "Taxable amount (ex-GST, cents)"
                  : invoiceTemplate?.gst_enabled && invoiceTemplate.gst_inclusive
                    ? "Amount including GST (cents)"
                    : "Amount (cents)"}
              </Label>
              <Input
                type="number"
                value={form.amount_cents}
                onChange={(e) => setForm({ ...form, amount_cents: Number(e.target.value) })}
              />
              {formGst && invoiceTemplate?.gst_enabled ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{money(formGst.subtotal_cents)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      {invoiceTemplate.gst_label} ({invoiceTemplate.gst_percent}%)
                    </span>
                    <span className="tabular-nums">{money(formGst.gst_cents)}</span>
                  </div>
                  <div className="flex justify-between gap-4 font-medium">
                    <span>Total due</span>
                    <span className="tabular-nums">{money(formGst.total_cents)}</span>
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <Label>Period start</Label>
              <Input
                type="date"
                value={form.period_start}
                onChange={(e) => setForm({ ...form, period_start: e.target.value })}
              />
            </div>
            <div>
              <Label>Period end</Label>
              <Input
                type="date"
                value={form.period_end}
                onChange={(e) => setForm({ ...form, period_end: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Button onClick={() => create.mutate()} disabled={!form.org_id || !form.amount_cents}>
                Send invoice
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Billing emails per organization</CardTitle>
        </CardHeader>
        <CardContent>
          <ColumnarToolbar
            globalQ={orgTable.globalQ}
            onGlobalQ={orgTable.setGlobalQ}
            shown={orgTable.rows.length}
            total={orgTable.total}
            onClear={orgTable.clearAll}
            placeholder="Search organizations…"
          />
          <table className="st-table w-full">
            <thead>
              <tr>
                {orgColumns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={orgTable.filters[col.key]}
                    onFilter={(v) => orgTable.setColumnFilter(col.key, v)}
                    sortKey={orgTable.sortKey}
                    sortDir={orgTable.sortDir}
                    onToggleSort={orgTable.toggleSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {orgTable.rows.map((o: any) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>
                    <Input
                      defaultValue={o.billing_email ?? ""}
                      placeholder="admin@example.com"
                      onBlur={(e) => {
                        if ((e.target.value || "") !== (o.billing_email ?? ""))
                          updateBillingEmail.mutate({ orgId: o.id, email: e.target.value });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {invoiceTable.rows.length}
            {invoiceTable.rows.length !== invoiceTable.total ? ` of ${invoiceTable.total}` : ""}{" "}
            invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ColumnarToolbar
            globalQ={invoiceTable.globalQ}
            onGlobalQ={invoiceTable.setGlobalQ}
            shown={invoiceTable.rows.length}
            total={invoiceTable.total}
            onClear={invoiceTable.clearAll}
            placeholder="Search invoices…"
          />
          <table className="st-table w-full">
            <thead>
              <tr>
                {invoiceColumns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={invoiceTable.filters[col.key]}
                    onFilter={(v) => invoiceTable.setColumnFilter(col.key, v)}
                    sortKey={invoiceTable.sortKey}
                    sortDir={invoiceTable.sortDir}
                    onToggleSort={invoiceTable.toggleSort}
                    align={
                      col.key === "taxable" ||
                      col.key === "gst" ||
                      col.key === "total" ||
                      col.key === "actions"
                        ? "right"
                        : "left"
                    }
                    className={
                      col.key === "taxable" ||
                      col.key === "gst" ||
                      col.key === "total" ||
                      col.key === "actions"
                        ? "text-right"
                        : undefined
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {invoiceTable.rows.map((i: any) => {
                const gst = calcInvoiceGst(
                  i.amount_cents,
                  invoiceTemplate ?? {
                    gst_enabled: false,
                    gst_percent: 0,
                    gst_label: "GST",
                    gst_inclusive: false,
                  },
                );
                return (
                  <tr key={i.id}>
                    <td className="font-mono text-xs">
                      <Link
                        to="/platform/invoice/$id"
                        params={{ id: i.id }}
                        className="text-primary underline-offset-2 hover:underline"
                        title="Preview & download invoice"
                      >
                        {i.invoice_number}
                      </Link>
                    </td>
                    <td>{i.organizations?.name}</td>
                    <td>{i.issue_date}</td>
                    <td>{i.due_date}</td>
                    <td className="text-right tabular-nums">{money(gst.subtotal_cents)}</td>
                    <td className="text-right tabular-nums text-muted-foreground">
                      {gst.enabled ? `${money(gst.gst_cents)} (${gst.percent}%)` : "—"}
                    </td>
                    <td className="text-right tabular-nums font-medium">{money(gst.total_cents)}</td>
                    <td>
                      <Select
                        value={i.status}
                        onValueChange={(v) => setStatus.mutate({ id: i.id, status: v })}
                      >
                        <SelectTrigger className="h-7 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["draft", "sent", "paid", "overdue", "void"].map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {i.emailed_at ? (
                        new Date(i.emailed_at).toLocaleString()
                      ) : i.email_last_error ? (
                        <span className="text-red-600" title={i.email_last_error}>
                          failed
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-right space-x-2">
                      <Link to="/platform/invoice/$id" params={{ id: i.id }}>
                        <Button size="sm" variant="outline">
                          <Eye className="mr-1 h-3 w-3" />
                          Preview
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={emailIt.isPending}
                        onClick={() => emailIt.mutate(i.id)}
                      >
                        <Mail className="mr-1 h-3 w-3" />
                        {i.emailed_at ? "Re-send" : "Email"}
                      </Button>
                      {i.status !== "paid" && (
                        <Button size="sm" variant="outline" onClick={() => markPaid.mutate(i)}>
                          <Check className="mr-1 h-3 w-3" />
                          Mark paid
                        </Button>
                      )}
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
