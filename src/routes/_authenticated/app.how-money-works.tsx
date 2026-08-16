import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeading } from "@/components/streamlit";
import { FinancialsExplained } from "@/components/guides/financials-explained";
import { PageExport } from "@/components/page-export";

export const Route = createFileRoute("/_authenticated/app/how-money-works")({
  component: HowMoneyWorksPage,
});

function HowMoneyWorksPage() {
  return (
    <PageExport name="How_money_works" title="How money works">
      <div className="space-y-5">
        <PageHeading
          icon="💰"
          title="How money works"
          subtitle="Budget, Plan, Forecast, Demand, and Actuals — in everyday language."
        />
        <p className="text-sm text-muted-foreground">
          Want the whole app story (programs, streams, gates)? See{" "}
          <Link to="/app/about" search={{ tab: "overview" }} className="font-medium text-primary hover:underline">
            How this app works
          </Link>
          .
        </p>
        <FinancialsExplained />
      </div>
    </PageExport>
  );
}
