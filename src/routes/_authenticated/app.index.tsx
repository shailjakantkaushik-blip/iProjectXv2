import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  FolderKanban,
  DollarSign,
  AlertTriangle,
  Zap,
  Flag,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Home,
});

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
      n || 0,
    )
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const shortcuts = [
  {
    to: "/app/executive",
    label: "Executive Dashboard",
    desc: "Portfolio cockpit — KPIs, RAG, ROI, timelines",
    icon: LayoutDashboard,
  },
  {
    to: "/app/projects",
    label: "Projects",
    desc: "Register with full CRUD",
    icon: FolderKanban,
  },
  {
    to: "/app/financials",
    label: "Financials",
    desc: "CAPEX / OPEX / benefits",
    icon: DollarSign,
  },
  {
    to: "/app/risks",
    label: "Risks",
    desc: "Portfolio-level risk heatmap",
    icon: AlertTriangle,
  },
  {
    to: "/app/agile",
    label: "Agile",
    desc: "Sprints, velocity, burndown",
    icon: Zap,
  },
  {
    to: "/app/stage-gates",
    label: "Stage Gates",
    desc: "Governance flow",
    icon: Flag,
  },
];

function Home() {
  const { organization, profile } = useAuth();
  const firstName = profile?.full_name?.split(" ")[0];

  const { data: projects = [], isLoading } = useQuery({
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
    <div className="animate-in fade-in-0 duration-300">
      <PageHeading
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        subtitle={`${organization?.name ?? "Your organization"} · Portfolio command center`}
      />

      <SectionFrame>
        <SectionTitle>Portfolio snapshot</SectionTitle>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-md bg-muted/70" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Projects" value={projects.length} />
              <KpiCard label="Active" value={active} />
              <KpiCard label="Completed" value={completed} />
              <KpiCard label="At risk (Red/Amber)" value={atRisk} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiCard label="Total budget" value={money(totalBudget)} />
              <KpiCard
                label="CAPEX incurred"
                value={money(projects.reduce((s, p) => s + Number(p.capex_incurred || 0), 0))}
              />
              <KpiCard
                label="Benefits realised"
                value={money(projects.reduce((s, p) => s + Number(p.benefits_realised || 0), 0))}
              />
            </div>
          </>
        )}
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Jump to</SectionTitle>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="group flex items-start gap-3 rounded-lg border border-border/80 bg-surface/80 p-3.5 transition-all hover:border-primary/50 hover:bg-secondary/60"
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <s.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <span className="truncate">{s.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-70" />
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {s.desc}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </SectionFrame>
    </div>
  );
}
