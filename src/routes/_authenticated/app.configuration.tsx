import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { useAuth, isAdmin, isPlatformAdmin } from "@/lib/auth-context";
import {
  Users,
  Building2,
  CreditCard,
  Settings as SettingsIcon,
  Database,
  Flag,
  Palette,
  Menu,
  Sparkles,
  Eye,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/configuration")({
  component: ConfigurationPage,
});

const CARDS = [
  {
    to: "/app/team",
    icon: Users,
    title: "Team & Roles",
    desc: "Invite users, assign roles across the organisation",
  },
  {
    to: "/app/business-units",
    icon: Building2,
    title: "Business Units",
    desc: "Structure your organisation into BUs and programs",
  },
  {
    to: "/app/stage-gate-config",
    icon: Flag,
    title: "Stage Gates",
    desc: "Configure the stage gates used across all projects",
  },
  {
    to: "/app/chart-theme",
    icon: Palette,
    title: "Chart Theme",
    desc: "Change graph colors, palettes and RAG/status tokens",
  },
  {
    to: "/app/billing",
    icon: CreditCard,
    title: "Billing & Plans",
    desc: "Manage subscription, seats, and invoices",
  },
  {
    to: "/app/settings",
    icon: SettingsIcon,
    title: "Organisation Settings",
    desc: "Name, logo, defaults, and preferences",
  },
  {
    to: "/app/data-editor",
    icon: Database,
    title: "Data Editor",
    desc: "Directly edit reference tables and lookups",
  },
];

const ORG_ADMIN_CARDS = [
  {
    to: "/app/navigation",
    icon: Menu,
    title: "Navigation sequence",
    desc: "Reorder and hide workspace sidebar links for your organisation",
  },
  {
    to: "/app/project-access",
    icon: Eye,
    title: "Project data access",
    desc: "Limit each role or user to all projects, selected programs, or specific projects",
  },
];

const PLATFORM_CARDS = [
  {
    to: "/platform/settings",
    icon: Menu,
    title: "Platform navigation & experience",
    desc: "Platform-wide nav defaults, signup, and cartoons",
  },
  {
    to: "/platform/landing",
    icon: Sparkles,
    title: "Landing · Access & Cartoons",
    desc: "Public site, signup, cartoons, and platform nav tab",
  },
];

function ConfigurationPage() {
  const { organization, roles } = useAuth();
  const platform = isPlatformAdmin(roles);
  const admin = isAdmin(roles);

  return (
    <div className="space-y-6">
      <PageHeading
        title="Configuration"
        subtitle={organization ? `Admin controls for ${organization.name}` : "Admin controls"}
      />

      {admin && (
        <div>
          <SectionTitle>Organisation experience</SectionTitle>
          <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ORG_ADMIN_CARDS.map((c) => (
              <Link key={c.to} to={c.to} className="group block">
                <SectionFrame className="h-full cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                      <c.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <SectionTitle>{c.title}</SectionTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
                    </div>
                  </div>
                </SectionFrame>
              </Link>
            ))}
          </div>
        </div>
      )}

      {platform && (
        <div>
          <SectionTitle>Platform</SectionTitle>
          <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {PLATFORM_CARDS.map((c) => (
              <Link key={c.to} to={c.to} className="group block">
                <SectionFrame className="h-full cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                      <c.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <SectionTitle>{c.title}</SectionTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
                    </div>
                  </div>
                </SectionFrame>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link key={c.to} to={c.to} className="group block">
            <SectionFrame className="h-full cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <c.icon className="h-4 w-4" />
                </div>
                <div>
                  <SectionTitle>{c.title}</SectionTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
                </div>
              </div>
            </SectionFrame>
          </Link>
        ))}
      </div>
    </div>
  );
}
