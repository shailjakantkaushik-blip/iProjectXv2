import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Home,
});

function money(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
}

const shortcuts = [
  { to: "/app/executive", label: "Executive Dashboard", desc: "Portfolio cockpit — KPIs, RAG, ROI, timelines" },
  { to: "/app/projects", label: "Projects", desc: "Register with full CRUD" },
  { to: "/app/financials", label: "Financials", desc: "CAPEX / OPEX / benefits" },
  { to: "/app/risks", label: "Risks", desc: "Portfolio-level risk heatmap" },
  { to: "/app/agile", label: "Agile", desc: "Sprints, velocity, burndown" },
  { to: "/app/stage-gates", label: "Stage Gates", desc: "Governance flow" },
];

function Home() {
  const { organization, profile } = useAuth();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*");
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  const totalBudget = projects.reduce((s, p) => s + Number(p.budget || 0), 0);
  const active = projects.filter((p) => p.status === "In Progress").length;
  const completed = projects.filter((p) => p.status === "Completed").length;
  const atRisk = projects.filter((p) => p.rag === "Red" || p.rag === "Amber").length;

  return (
    <div>
      <PageHeading icon="🏠">Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</PageHeading>
      <div className="mb-4 text-sm text-muted-foreground">
        {organization?.name ?? "Your organization"} · PMO Enterprise Portfolio Cockpit
      </div>

      <SectionFrame>
        <SectionTitle>Portfolio Snapshot</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Projects" value={projects.length} />
          <KpiCard label="Active" value={active} />
          <KpiCard label="Completed" value={completed} />
          <KpiCard label="At Risk (Red/Amber)" value={atRisk} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="Total Budget" value={money(totalBudget)} />
          <KpiCard label="CAPEX Incurred" value={money(projects.reduce((s, p) => s + Number(p.capex_incurred || 0), 0))} />
          <KpiCard label="Benefits Realised" value={money(projects.reduce((s, p) => s + Number(p.benefits_realised || 0), 0))} />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Jump to</SectionTitle>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="block rounded-md border border-border bg-surface p-3 transition-colors hover:border-primary hover:bg-secondary"
            >
              <div className="text-sm font-semibold text-foreground">{s.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.desc}</div>
            </Link>
          ))}
        </div>
      </SectionFrame>
    </div>
  );
}
