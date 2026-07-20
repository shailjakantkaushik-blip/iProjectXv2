import { createFileRoute } from "@tanstack/react-router";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";

export const Route = createFileRoute("/_authenticated/app/about")({
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="space-y-6">
      <PageHeading title="About" subtitle="PMO Enterprise Tool — portfolio, programs, projects" />

      <SectionFrame>
        <SectionTitle>Product</SectionTitle>
        <p className="text-sm text-[var(--st-muted)]">
          A multi-tenant PMO platform for managing portfolios across organisations and business units.
          Supports Agile and Waterfall delivery, executive dashboards, financials, risks, benefits,
          governance, and roadmap analytics — with role-based access and Excel-compatible import/export.
        </p>
      </SectionFrame>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionFrame>
          <SectionTitle>Capabilities</SectionTitle>
          <ul className="space-y-1 text-sm">
            <li>• Multi-organisation, multi-BU hierarchy</li>
            <li>• Role-based access (Admin, Org Admin, BU Lead, PM, Executive)</li>
            <li>• Executive dashboard with 8 portfolio KPIs</li>
            <li>• Financials, risks, benefits, stage-gates, dependencies</li>
            <li>• Agile sprints + waterfall stage-gates in one view</li>
            <li>• Cost/benefit prioritisation & demand pipeline scoring</li>
            <li>• Excel import/export & executive PDF reports</li>
          </ul>
        </SectionFrame>

        <SectionFrame>
          <SectionTitle>Tech Stack</SectionTitle>
          <ul className="space-y-1 text-sm">
            <li>• TanStack Start (React 19 + Vite SSR)</li>
            <li>• Lovable Cloud backend (Postgres, Auth, RLS)</li>
            <li>• Recharts for visualisation</li>
            <li>• SheetJS for Excel workflows</li>
            <li>• Tailwind + shadcn UI primitives</li>
          </ul>
        </SectionFrame>
      </div>

      <SectionFrame>
        <SectionTitle>Version</SectionTitle>
        <p className="text-sm text-[var(--st-muted)]">PMO Enterprise Tool · Web edition · v1.0</p>
      </SectionFrame>
    </div>
  );
}
