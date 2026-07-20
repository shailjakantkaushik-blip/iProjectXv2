import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { useAuth } from "@/lib/auth-context";
import { Users, Building2, CreditCard, Settings as SettingsIcon, Database, Flag, Palette } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/configuration")({
  component: ConfigurationPage,
});

const CARDS = [
  { to: "/app/team", icon: Users, title: "Team & Roles", desc: "Invite users, assign roles across the organisation" },
  { to: "/app/business-units", icon: Building2, title: "Business Units", desc: "Structure your organisation into BUs and programs" },
  { to: "/app/stage-gate-config", icon: Flag, title: "Stage Gates", desc: "Configure the stage gates used across all projects" },
  { to: "/app/chart-theme", icon: Palette, title: "Chart Theme", desc: "Change graph colors, palettes and RAG/status tokens" },
  { to: "/app/billing", icon: CreditCard, title: "Billing & Plans", desc: "Manage subscription, seats, and invoices" },
  { to: "/app/settings", icon: SettingsIcon, title: "Organisation Settings", desc: "Name, logo, defaults, and preferences" },
  { to: "/app/data-editor", icon: Database, title: "Data Editor", desc: "Directly edit reference tables and lookups" },
];

function ConfigurationPage() {
  const { organization } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeading title="Configuration" subtitle={organization ? `Admin controls for ${organization.name}` : "Admin controls"} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {CARDS.map(c => (
          <Link key={c.to} to={c.to}>
            <SectionFrame className="h-full transition hover:border-[var(--st-accent)] cursor-pointer">
              <div className="flex items-start gap-3">
                <c.icon className="h-6 w-6 text-[var(--st-accent)] mt-0.5" />
                <div>
                  <SectionTitle>{c.title}</SectionTitle>
                  <p className="text-sm text-[var(--st-muted)] mt-1">{c.desc}</p>
                </div>
              </div>
            </SectionFrame>
          </Link>
        ))}
      </div>
    </div>
  );
}
