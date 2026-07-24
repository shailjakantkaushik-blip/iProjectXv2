import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRef } from "react";
import { Download, Award, Shield } from "lucide-react";
import { jsPDF } from "jspdf";
import { toPng } from "html-to-image";

export const Route = createFileRoute("/_authenticated/app/licenses")({
  component: LicensesPage,
});

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-100 text-green-800",
  Revoked: "bg-red-100 text-red-800",
  Expired: "bg-gray-100 text-gray-600",
};

function LicensesPage() {
  const { organization } = useAuth();

  const { data: certs = [], isLoading } = useQuery({
    queryKey: ["org_license_certs", organization?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("org_license_certificates")
        .select("*")
        .eq("org_id", organization!.id)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization,
  });

  const active = (certs as any[]).filter((c: any) => c.status === "Active");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">License Certificates</h1>
        <p className="text-sm text-muted-foreground">
          View and download your organization's software license certificates.
        </p>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (certs as any[]).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <Shield className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">No license certificates issued yet.</p>
            <p className="text-xs text-muted-foreground">
              Contact your account manager if you require a certificate.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {active.length > 0 && (
            <p className="text-sm font-medium text-green-700">
              {active.length} active certificate{active.length !== 1 ? "s" : ""}
            </p>
          )}
          {(certs as any[]).map((cert: any) => (
            <CertificateCard key={cert.id} cert={cert} orgName={organization?.name ?? ""} />
          ))}
        </div>
      )}
    </div>
  );
}

function CertificateCard({ cert, orgName }: { cert: any; orgName: string }) {
  const certRef = useRef<HTMLDivElement>(null);

  async function downloadPdf() {
    if (!certRef.current) return;
    try {
      const dataUrl = await toPng(certRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      });
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = dataUrl;
      });
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const ratio = pw / img.naturalWidth;
      pdf.addImage(dataUrl, "PNG", 0, 0, pw, img.naturalHeight * ratio);
      pdf.save(`${cert.certificate_number}.pdf`);
    } catch (e: any) {
      toast.error(`PDF export failed: ${e.message ?? e}`);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5 text-amber-500" />
          {cert.certificate_number}
        </CardTitle>
        <div className="flex items-center gap-3">
          <Badge className={STATUS_COLORS[cert.status] ?? ""}>{cert.status}</Badge>
          {cert.status === "Active" && (
            <Button size="sm" variant="outline" onClick={downloadPdf}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Printable / exportable certificate */}
        <div
          ref={certRef}
          className="overflow-hidden rounded-lg border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-10"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2
                className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-700"
                style={{ fontFamily: "system-ui, sans-serif" }}
              >
                Software License Certificate
              </h2>
              <p className="mt-1 text-xs text-gray-500" style={{ fontFamily: "system-ui, sans-serif" }}>
                iProjectX Enterprise PMO Platform
              </p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-100">
              <Award className="h-7 w-7 text-amber-600" />
            </div>
          </div>

          {/* Body */}
          <div className="mb-8 text-center">
            <p className="text-sm text-gray-500" style={{ fontFamily: "system-ui, sans-serif" }}>
              This certifies that
            </p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">{orgName}</h1>
            <p className="mt-3 text-sm text-gray-600" style={{ fontFamily: "system-ui, sans-serif" }}>
              is duly licensed to use iProjectX Enterprise PMO Platform
              {cert.plan_code ? ` — ${cert.plan_code.toUpperCase()} plan` : ""}
            </p>
          </div>

          {/* Details grid */}
          <div
            className="mx-auto mb-8 grid max-w-lg grid-cols-2 gap-x-8 gap-y-3 text-sm"
            style={{ fontFamily: "system-ui, sans-serif" }}
          >
            <div className="text-right text-gray-500">Certificate No.</div>
            <div className="font-mono font-semibold text-gray-900">{cert.certificate_number}</div>

            <div className="text-right text-gray-500">Licensed seats</div>
            <div className="font-semibold text-gray-900">{cert.seats}</div>

            {cert.plan_code && (
              <>
                <div className="text-right text-gray-500">Plan</div>
                <div className="font-semibold text-gray-900 uppercase">{cert.plan_code}</div>
              </>
            )}

            <div className="text-right text-gray-500">Issue date</div>
            <div className="text-gray-900">
              {new Date(cert.issued_at).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>

            {cert.expires_at && (
              <>
                <div className="text-right text-gray-500">Expiry date</div>
                <div className="text-gray-900">
                  {new Date(cert.expires_at).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              </>
            )}

            {cert.issued_by && (
              <>
                <div className="text-right text-gray-500">Issued by</div>
                <div className="text-gray-900">{cert.issued_by}</div>
              </>
            )}
          </div>

          {/* Footer seal */}
          <div className="flex items-center justify-center gap-3 border-t border-amber-200 pt-6">
            <div className="h-px flex-1 bg-amber-200" />
            <span
              className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-600"
              style={{ fontFamily: "system-ui, sans-serif" }}
            >
              Authorised License Document
            </span>
            <div className="h-px flex-1 bg-amber-200" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
