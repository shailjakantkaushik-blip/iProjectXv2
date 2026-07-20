import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { exportProjects } from "@/lib/excel";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/executive-reports")({
  component: ExecutiveReportsPage,
});

const fmtM = (n: number) => `$${(n / 1e6).toFixed(2)}M`;

function ExecutiveReportsPage() {
  const { organization } = useAuth();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*");
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  const total = projects.length;
  const budget = (projects as any[]).reduce((s, p) => s + Number(p.budget || 0), 0);
  const incurred = (projects as any[]).reduce((s, p) => s + Number(p.capex_incurred || 0) + Number(p.opex_incurred || 0), 0);
  const red = (projects as any[]).filter(p => p.rag === "Red").length;
  const amber = (projects as any[]).filter(p => p.rag === "Amber").length;

  const handleExport = () => exportProjects(projects as any[]);

  const printReport = () => window.print();

  return (
    <div className="space-y-6">
      <PageHeading
        title="Executive Reports"
        subtitle="Boardroom-ready portfolio snapshot"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={printReport}><FileText className="h-4 w-4 mr-2" />Print / PDF</Button>
            <Button onClick={handleExport}><Download className="h-4 w-4 mr-2" />Export Excel</Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-5">
        <KpiCard label="Projects" value={total} />
        <KpiCard label="Total Budget" value={fmtM(budget)} />
        <KpiCard label="Incurred" value={fmtM(incurred)} />
        <KpiCard label="Red" value={red} accent="var(--st-danger)" />
        <KpiCard label="Amber" value={amber} accent="var(--st-warning)" />
      </div>

      <SectionFrame>
        <SectionTitle>Executive Summary</SectionTitle>
        <p className="text-sm text-[var(--st-muted)]">
          The portfolio comprises <strong>{total}</strong> active projects with a total approved budget of{" "}
          <strong>{fmtM(budget)}</strong>. To date, <strong>{fmtM(incurred)}</strong> ({budget ? ((incurred / budget) * 100).toFixed(1) : 0}%)
          has been incurred. Currently, <strong>{red}</strong> project(s) are Red and <strong>{amber}</strong> are Amber and require
          management attention. See individual sections for detailed movement, risk, and benefits analysis.
        </p>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Report Sections Included</SectionTitle>
        <ul className="grid gap-2 md:grid-cols-2 text-sm">
          <li>✓ Portfolio KPIs & RAG Status</li>
          <li>✓ Financial Position (CAPEX/OPEX)</li>
          <li>✓ Top Risks & Actions</li>
          <li>✓ Benefits Realisation</li>
          <li>✓ Milestone & Stage-Gate Progress</li>
          <li>✓ Program & BU Roll-ups</li>
        </ul>
      </SectionFrame>
    </div>
  );
}
