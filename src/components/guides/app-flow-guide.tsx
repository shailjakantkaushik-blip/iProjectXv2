import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionFrame, SectionTitle } from "@/components/streamlit";
import { CartoonGuide } from "@/components/cartoon-mascots";
import {
  BuildingBlocksArt,
  GatesArt,
  PeopleTimeArt,
  ProcessFlowDetailedArt,
  ProcessFlowHighLevelArt,
  StreamsWorkArt,
} from "@/components/guides/guide-art";
import { FinancialsExplained } from "@/components/guides/financials-explained";

export const ABOUT_TABS = [
  "overview",
  "process",
  "building-blocks",
  "delivery",
  "money",
  "people",
  "governance",
  "product",
] as const;

export type AboutTab = (typeof ABOUT_TABS)[number];

export function isAboutTab(v: string): v is AboutTab {
  return (ABOUT_TABS as readonly string[]).includes(v);
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {n}
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

export function AppFlowGuide({ tab, onTab }: { tab: AboutTab; onTab: (t: AboutTab) => void }) {
  return (
    <Tabs value={tab} onValueChange={(v) => isAboutTab(v) && onTab(v)}>
      <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
        <TabsTrigger value="overview">Big picture</TabsTrigger>
        <TabsTrigger value="process">Process flow</TabsTrigger>
        <TabsTrigger value="building-blocks">Building blocks</TabsTrigger>
        <TabsTrigger value="delivery">Streams &amp; work</TabsTrigger>
        <TabsTrigger value="money">Money</TabsTrigger>
        <TabsTrigger value="people">People &amp; time</TabsTrigger>
        <TabsTrigger value="governance">Gates &amp; governance</TabsTrigger>
        <TabsTrigger value="product">This product</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <CartoonGuide size="md" mood="wave" interactive={false} />
          <div className="min-w-0 flex-1 space-y-3 text-sm leading-relaxed">
            <p>
              This app is a picture of how your organisation spends time and money on change.
              Everything hangs off the same building blocks, in this order:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                <strong>Strategic Alignment</strong> — why we are doing the work (Business
                Strategic, IT Strategic, CAPEX, Unfunded).
              </li>
              <li>
                <strong>Programs</strong> — a family of related projects.
              </li>
              <li>
                <strong>Projects</strong> — one change to deliver, with a code and an owner.
              </li>
              <li>
                <strong>Functional area</strong> — which part of the business it belongs to (IT, HR,
                Finance…).
              </li>
              <li>
                <strong>Streams</strong> — delivery lanes inside a project (there is always a Core
                stream).
              </li>
              <li>
                <strong>Work items</strong> — the tasks people actually do.
              </li>
            </ol>
            <p className="text-muted-foreground">
              Money, people, and stage gates all attach to a stream (and then roll up to the
              project). That is why you set Budget on the stream, plan people on the stream, and
              pass gates on the stream. The{" "}
              <Link
                to="/app/about"
                search={{ tab: "process" }}
                className="font-medium text-primary hover:underline"
              >
                Process flow
              </Link>{" "}
              tab is the same story as a diagram.
            </p>
          </div>
        </div>
        <BuildingBlocksArt />
        <SectionFrame>
          <SectionTitle>A typical week</SectionTitle>
          <div className="space-y-3">
            <Step n="1" title="See the portfolio">
              Home, Executive Dashboard, and Portfolio Pulse show health across projects.
            </Step>
            <Step n="2" title="Open one project">
              Projects in the menu opens the project workspace (dropdown to switch). The register of
              all projects lives on Programs.
            </Step>
            <Step n="3" title="Plan the work">
              Estimation Planning sets the baseline. Work items are the demand. Timesheets capture
              actual hours.
            </Step>
            <Step n="4" title="Steer">
              Stage gates, RAID, and decisions are the checkpoints. Financials compares Plan vs
              Actual vs Forecast.
            </Step>
          </div>
        </SectionFrame>
      </TabsContent>

      <TabsContent value="process" className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          This is the operating loop of the product. High level is the seven-step cycle every change
          follows. Detailed is which screen writes which layer — so Budget, Plan, Forecast, Demand,
          and Actuals stay apart.
        </p>
        <ProcessFlowHighLevelArt />
        <SectionFrame>
          <SectionTitle>High level — what happens, in order</SectionTitle>
          <div className="space-y-3">
            <Step n="1" title="Align the work">
              Create (or pick) a program, then a project with a Strategic Alignment bucket, a
              delivery method, and an owner. The project register lives on Programs; the Projects
              menu opens one workspace.
            </Step>
            <Step n="2" title="Split into streams and set Budget">
              Core is created for you. Extra lanes (data, security, change) get their own dates. The
              approved envelope is the stream Budget in Data Editor — the project is the roll-up.
            </Step>
            <Step n="3" title="Freeze a Plan">
              Estimation Planning puts people and other OpEx on each stream and phase. Apply writes
              planned dates, planned OpEx, and Planned FTE. CapEx plan comes from FY Allocation
              budget CapEx. Plan does not write actuals.
            </Step>
            <Step n="4" title="Keep a Forecast">
              FY Allocation forecast $ is the in-flight outlook by year. It starts equal to Plan. A
              late gate can raise phase Forecast; Budget and Plan stay put until someone formally
              changes them.
            </Step>
            <Step n="5" title="Hand out Demand">
              Work items (and the Work Board) are the to-do list with hours. That is Demand — not
              the FTE you reserved in the Plan.
            </Step>
            <Step n="6" title="Book Actuals">
              Approved timesheets become Actual FTE $. Posted vendor/travel lines become other OpEx
              actuals. Together they are incurred.
            </Step>
            <Step n="7" title="Steer">
              Stage gates (or sprints), RAID, and decisions are the checkpoints. Home, Executive
              Dashboard, Portfolio Pulse, and Financials are the steering pack.
            </Step>
          </div>
        </SectionFrame>
        <ProcessFlowDetailedArt />
        <SectionFrame>
          <SectionTitle>Detailed — who does what, on which page</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3">
              <Step n="A" title="Org admin — control plane">
                Users, roles, page access, delivery methods and gate names, resources and rates.
                Without this, timesheets and Plan have nobody to attach to.
              </Step>
              <Step n="B" title="PMO / sponsor — shape the portfolio">
                Programs, New Project, Strategic Alignment, segmentation and prioritisation, Demand
                Pipeline for ideas that are not projects yet.
              </Step>
              <Step n="C" title="PM — plan the lane">
                Project workspace (overview, streams, RAID). Estimation Planning → Apply. FY
                Allocation for year split of Budget and Forecast.
              </Step>
            </div>
            <div className="space-y-3">
              <Step n="D" title="PM / squad — deliver">
                Work Items and Work Board (Demand). Stage Gates or Agile sprints. Dependencies,
                change requests, status updates.
              </Step>
              <Step n="E" title="Everyone on the work — book time">
                Timesheets against work items. After PM/RM approval, hours × rate become Actual
                labor.
              </Step>
              <Step n="F" title="Executives — steer without editing Plan">
                Home, Executive Dashboard (Overview vs Project summaries), Portfolio Pulse,
                Financials (Plan vs Actual vs Forecast), How money works for the glossary.
              </Step>
            </div>
          </div>
        </SectionFrame>
        <SectionFrame>
          <SectionTitle>Write-path cheat sheet</SectionTitle>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Budget</strong> — Data Editor → Project Streams
              (never from timesheets or work items).
            </li>
            <li>
              <strong className="text-foreground">Plan</strong> — Estimation Planning Apply (OpEx +
              FTE) and FY Allocation budget CapEx.
            </li>
            <li>
              <strong className="text-foreground">Forecast</strong> — FY Allocation forecast $; late
              gates can lift phase forecast.
            </li>
            <li>
              <strong className="text-foreground">Demand</strong> — work-item hours. Does not
              rewrite Plan columns.
            </li>
            <li>
              <strong className="text-foreground">Actual</strong> — approved timesheets + posted
              other OpEx.
            </li>
          </ul>
        </SectionFrame>
      </TabsContent>

      <TabsContent value="building-blocks" className="space-y-4">
        <BuildingBlocksArt />
        <div className="grid gap-3 md:grid-cols-2">
          <SectionFrame>
            <SectionTitle>Strategic Alignment</SectionTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              This is the investment bucket on the project — not a separate database. Typical
              values: Business Strategic, IT Strategic, CAPEX, Unfunded. Dashboards group spend here
              so executives can see <em>why</em> money is going out, not only which project code.
            </p>
          </SectionFrame>
          <SectionFrame>
            <SectionTitle>Programs</SectionTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A program is a named family (for example “Customer experience”). Several projects sit
              under it. Open{" "}
              <Link to="/app/programs" className="font-medium text-primary hover:underline">
                Programs
              </Link>{" "}
              for roll-ups and the full project register.
            </p>
          </SectionFrame>
          <SectionFrame>
            <SectionTitle>Projects</SectionTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              One project = one change. The{" "}
              <Link to="/app/projects" className="font-medium text-primary hover:underline">
                Projects
              </Link>{" "}
              menu opens that workspace (overview, summary, streams, RAID, finance). Switch with the
              project dropdown. Create with New Project.
            </p>
          </SectionFrame>
          <SectionFrame>
            <SectionTitle>Functional area</SectionTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Who in the business owns the outcome — Finance, HR, IT, Operations, and so on. Same
              program can have projects in different functional areas. Filters on Pulse and
              Executive views use this.
            </p>
          </SectionFrame>
        </div>
      </TabsContent>

      <TabsContent value="delivery" className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          A project is too big to plan as one lump. Streams split it into lanes (Core is created for
          you). Work items are the to-do list inside a lane, optionally tied to a stage gate or a
          sprint.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <SectionFrame>
            <SectionTitle>Streams</SectionTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Think of streams as floors of the same building. Core is always there. Extra streams
              (data, integration, change) get their own dates, budget, people, and gates. The
              project row is the sum of its streams — edit Budget on the stream in Data Editor.
            </p>
          </SectionFrame>
          <SectionFrame>
            <SectionTitle>Work items</SectionTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Tasks with hours, owners, and dates. Those hours are <strong>Demand</strong> — work
              you have assigned — not the planned FTE you reserved in Estimation Planning. Open{" "}
              <Link to="/app/work-items" className="font-medium text-primary hover:underline">
                Work Items
              </Link>{" "}
              or the{" "}
              <Link to="/app/work-board" className="font-medium text-primary hover:underline">
                Work Board
              </Link>
              .
            </p>
          </SectionFrame>
        </div>
        <StreamsWorkArt />
      </TabsContent>

      <TabsContent value="money" className="space-y-4">
        <FinancialsExplained />
      </TabsContent>

      <TabsContent value="people" className="space-y-4">
        <PeopleTimeArt />
        <div className="grid gap-3 md:grid-cols-3">
          <SectionFrame>
            <SectionTitle>1. Reserve people (Plan)</SectionTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              On{" "}
              <Link to="/app/project-forecast" className="font-medium text-primary hover:underline">
                Estimation Planning
              </Link>{" "}
              you put named people on each stream and phase. Apply writes Planned FTE. That is the
              ceiling the lane should not exceed.
            </p>
          </SectionFrame>
          <SectionFrame>
            <SectionTitle>2. Hand them work (Demand)</SectionTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Create work items and assign resources with hours. Demand can be under the plan
              (slack) or over it (you promised more work than you reserved).
            </p>
          </SectionFrame>
          <SectionFrame>
            <SectionTitle>3. Book time (Actual)</SectionTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              People fill{" "}
              <Link to="/app/timesheets" className="font-medium text-primary hover:underline">
                Timesheets
              </Link>{" "}
              against those work items. After approval, hours × rate become Actual FTE $ on the
              project.
            </p>
          </SectionFrame>
        </div>
      </TabsContent>

      <TabsContent value="governance" className="space-y-4">
        <GatesArt />
        <div className="grid gap-3 md:grid-cols-2">
          <SectionFrame>
            <SectionTitle>Stage gates</SectionTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Checkpoints on Waterfall and Hybrid methods (Discovery, Design, Build, and so on).
              Each stream has its own gate dates. Agile uses sprints instead (or as well, on
              Hybrid). Configure names on Delivery Methods &amp; Gates. If a gate is late, phase
              Forecast can rise; Plan and Budget do not move by themselves.
            </p>
          </SectionFrame>
          <SectionFrame>
            <SectionTitle>RAID and decisions</SectionTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Risks, Actions, Issues, Decisions — plus stakeholders and lessons. These live on the
              project (and can be filtered by stream). The Executive Dashboard Project summaries tab
              is the steering pack; you edit the same notes on the project&apos;s Project Summary
              tab.
            </p>
          </SectionFrame>
        </div>
      </TabsContent>

      <TabsContent value="product" className="space-y-4">
        <SectionFrame>
          <SectionTitle>Product</SectionTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            A multi-tenant PMO platform for portfolios across organisations and business units.
            Agile and Waterfall in one place, with executive dashboards, financials, RAID,
            governance, and Excel-compatible import/export. Access is role-based.
          </p>
        </SectionFrame>
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionFrame>
            <SectionTitle>Capabilities</SectionTitle>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Multi-organisation, multi-BU hierarchy</li>
              <li>• Roles: Admin, Org Admin, BU Lead, PM, Executive</li>
              <li>• Executive dashboards and portfolio pulse</li>
              <li>• Budget, Plan, Forecast, Demand, and Actuals kept apart</li>
              <li>• Stage gates and sprints on the same project</li>
              <li>• Data Editor + Excel import/export</li>
            </ul>
          </SectionFrame>
          <SectionFrame>
            <SectionTitle>Version</SectionTitle>
            <p className="text-sm text-muted-foreground">PMO Enterprise Tool · Web edition</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Prefer a money-only walkthrough? Open{" "}
              <Link to="/app/how-money-works" className="font-medium text-primary hover:underline">
                How money works
              </Link>
              .
            </p>
          </SectionFrame>
        </div>
      </TabsContent>
    </Tabs>
  );
}
