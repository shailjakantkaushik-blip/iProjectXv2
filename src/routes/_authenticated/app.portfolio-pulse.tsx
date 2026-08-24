import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/streamlit";
import { PortfolioPulsePanel } from "@/components/portfolio-pulse-panel";
import { PageExport } from "@/components/page-export";

export const Route = createFileRoute("/_authenticated/app/portfolio-pulse")({
  head: () => ({
    meta: [
      { title: "Portfolio Pulse — iProjectX" },
      {
        name: "description",
        content: "Event-driven portfolio health, weekly change digest, and what needs attention today.",
      },
    ],
  }),
  component: PortfolioPulsePage,
});

function PortfolioPulsePage() {
  return (
    <PageExport name="Portfolio_Pulse" title="Portfolio Pulse">
      <PageHeading
        icon="📡"
        title="Portfolio Pulse"
        subtitle="Live portfolio health by area, what changed this week, and what needs attention today."
      />
      <PortfolioPulsePanel />
    </PageExport>
  );
}
