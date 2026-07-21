import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InvoiceDocument, downloadInvoicePdf } from "@/components/invoice-document";
import { fetchInvoiceTemplate } from "@/lib/invoice-template";

type Props = {
  invoiceId: string;
  backTo: string;
  backLabel: string;
};

export function InvoicePreviewPage({ invoiceId, backTo, backLabel }: Props) {
  const docRef = useRef<HTMLDivElement>(null);

  const {
    data: invoice,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["invoice-detail", invoiceId],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("invoices")
        .select("*, organizations(name, brand_name, billing_email)")
        .eq("id", invoiceId)
        .maybeSingle();
      if (err) throw err;
      if (!data) throw new Error("Invoice not found");
      return data;
    },
  });

  const { data: template } = useQuery({
    queryKey: ["invoice-template"],
    queryFn: fetchInvoiceTemplate,
  });

  const onDownload = async () => {
    if (!docRef.current || !invoice) return;
    try {
      await downloadInvoicePdf(docRef.current, invoice.invoice_number);
      toast.success("Invoice PDF downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to download PDF");
    }
  };

  if (isLoading || !template) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading invoice…
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="space-y-4 p-6">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {(error as any)?.message || "Invoice not found or you do not have access."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to={backTo}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Invoice {invoice.invoice_number}
          </h1>
          <p className="text-sm text-muted-foreground">
            Preview and download the generated invoice document.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.stripe_hosted_url && (
            <a href={invoice.stripe_hosted_url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-1.5 h-4 w-4" /> Stripe invoice
              </Button>
            </a>
          )}
          <Button size="sm" onClick={onDownload}>
            <Download className="mr-1.5 h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border bg-slate-100 p-4 shadow-inner md:p-8">
        <InvoiceDocument ref={docRef} invoice={invoice as any} template={template} />
      </div>
    </div>
  );
}
