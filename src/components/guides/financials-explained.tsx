import { Link } from "@tanstack/react-router";
import { SectionFrame, SectionTitle } from "@/components/streamlit";
import { HouseBudgetArt, MoneyLayersArt } from "@/components/guides/guide-art";

const LAYERS = [
  {
    name: "Budget",
    color: "#1d4ed8",
    plain: "The approved envelope — how much this stream is allowed to spend.",
    where: "Data Editor → Project Streams (lifetime). FY Allocation is the approved subset for each financial year.",
    not: "Do not change this when a phase is late.",
  },
  {
    name: "Plan",
    color: "#15803d",
    plain: "The baseline: how we intend to spend that envelope, by month and by person.",
    where: "Project Estimation Planning → Apply planned baseline. CapEx plan also comes from FY Allocation.",
    not: "Plan stays frozen unless a sponsor unlocks it.",
  },
  {
    name: "Forecast",
    color: "#c2410c",
    plain: "What we think the bill will be now. It starts equal to Plan. It can move if a phase slips.",
    where: "FY Allocation → Forecast %. Same monthly row as Plan (Forecast columns). Stage Gate Detail shows live phase forecast.",
    not: "Forecast is not the estimate page, and it is not Budget.",
  },
  {
    name: "Demand",
    color: "#6d28d9",
    plain: "Work we have actually handed to people (work items with hours).",
    where: "Work Items. Compare to Planned FTE on the same stream and phase.",
    not: "Demand does not rewrite Plan.",
  },
  {
    name: "Actual",
    color: "#be185d",
    plain: "Money and hours that already happened.",
    where: "Approved timesheets (people) and posted other OpEx (vendors, travel).",
    not: "Nothing else should pretend to be actuals.",
  },
];

export function FinancialsExplained({ showHouse = true }: { showHouse?: boolean }) {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Money in this app is like a household renovation. The board gives you an envelope
        (Budget). You write a quote (Plan). As the job runs you keep an honest running total
        (Forecast). The jobs on this week&apos;s list are Demand. Paid invoices are Actuals.
        Mixing those five words is what makes dashboards feel contradictory.
      </p>

      {showHouse ? <HouseBudgetArt /> : null}
      <MoneyLayersArt />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {LAYERS.map((l) => (
          <div key={l.name} className="rounded-lg border border-border bg-background p-3">
            <div className="text-sm font-bold" style={{ color: l.color }}>
              {l.name}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-foreground">{l.plain}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              <span className="font-semibold">Where:</span> {l.where}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              <span className="font-semibold">Rule:</span> {l.not}
            </p>
          </div>
        ))}
      </div>

      <SectionFrame>
        <SectionTitle>A tiny example</SectionTitle>
        <p className="text-sm leading-relaxed">
          Core stream is given <strong>$1,000,000</strong> (Budget). Estimation Planning says we
          will spend about <strong>$80,000 a month</strong> on people and other OpEx (Plan). Work
          items currently assigned add up to <strong>$70,000</strong> of work this month (Demand).
          Approved timesheets come in at <strong>$65,000</strong> (Actual). If Build runs late,
          Forecast for that phase can rise — Budget and Plan stay put until someone formally
          changes them.
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          FY Allocation is not Plan. It is the approved budget for that financial year — a subset
          of the lifetime envelope. If Estimation Plan, Actuals, or Forecast for that year goes
          above the allocation, the Financial health dimension flags Amber or Red.
        </p>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Where to click</SectionTitle>
        <ul className="space-y-2 text-sm">
          <li>
            <Link to="/app/programs" className="font-medium text-primary hover:underline">
              Programs
            </Link>{" "}
            — project register and stream budget in context.
          </li>
          <li>
            <Link to="/app/project-forecast" className="font-medium text-primary hover:underline">
              Project Estimation Planning
            </Link>{" "}
            — build Plan and Planned FTE, then Apply.
          </li>
          <li>
            <Link to="/app/fy-allocation" className="font-medium text-primary hover:underline">
              FY Allocation
            </Link>{" "}
            — split the overall envelope into a year budget (subset of overall). Filter Financials
            or Cockpit to an FY to see that allocation, then Estimation Plan, Actuals, and Forecast
            for those months. Going over a year&apos;s allocation flags Financial health.
          </li>
          <li>
            <Link to="/app/work-items" className="font-medium text-primary hover:underline">
              Work Items
            </Link>{" "}
            — Demand hours vs the lane you reserved.
          </li>
          <li>
            <Link to="/app/timesheets" className="font-medium text-primary hover:underline">
              Timesheets
            </Link>{" "}
            — Actual FTE $ into OpEx.
          </li>
          <li>
            <Link to="/app/financials" className="font-medium text-primary hover:underline">
              Financials
            </Link>{" "}
            — Plan vs Actual vs Forecast on one page.
          </li>
        </ul>
      </SectionFrame>
    </div>
  );
}
