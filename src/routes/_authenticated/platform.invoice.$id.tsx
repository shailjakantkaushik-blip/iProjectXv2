import { createFileRoute } from "@tanstack/react-router";
import { InvoicePreviewPage } from "@/components/invoice-preview-page";

export const Route = createFileRoute("/_authenticated/platform/invoice/$id")({
  component: PlatformInvoicePreview,
});

function PlatformInvoicePreview() {
  const { id } = Route.useParams();
  return <InvoicePreviewPage invoiceId={id} backTo="/platform/invoices" backLabel="All invoices" />;
}
