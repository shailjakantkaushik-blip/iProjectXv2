import { createFileRoute } from "@tanstack/react-router";
import { InvoicePreviewPage } from "@/components/invoice-preview-page";

export const Route = createFileRoute("/_authenticated/app/invoice/$id")({
  component: AppInvoicePreview,
});

function AppInvoicePreview() {
  const { id } = Route.useParams();
  return <InvoicePreviewPage invoiceId={id} backTo="/app/billing" backLabel="Billing & invoices" />;
}
