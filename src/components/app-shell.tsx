import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3, LayoutDashboard, FolderKanban, AlertTriangle, DollarSign,
  Map, Users, GitBranch, Inbox, Scale, Info, Table2, Bell,
  PieChart, Radio, Flag, Award, Gavel, ListChecks, Trophy, Image as ImageIcon,
  ArrowLeftRight, FileBarChart, Settings, Calendar, Layers, Clock, Wallet,
  Package, Zap, ShieldCheck, LogOut, Rocket, Route as RouteIcon, TrendingUp,
  Receipt, Building2, Landmark, CreditCard, Palette, Menu, X,
} from "lucide-react";
import { useAuth, isAdmin, isPlatformAdmin } from "@/lib/auth-context";
import { useAllowedPages } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: any; exact?: boolean; adminOnly?: boolean; platformOnly?: boolean };

const navGroups: { heading: string; items: NavItem[] }[] = [
  {
    heading: "🏠 Home",
    items: [
      { to: "/app/executive-cockpit", label: "Executive Cockpit", icon: Rocket },
      { to: "/app/executive", label: "Executive Dashboard", icon: LayoutDashboard },
      { to: "/app/latest-updates", label: "Latest Updates", icon: Bell },
      { to: "/app/about", label: "About", icon: Info },
    ],
  },
  {
    heading: "📁 Portfolio",
    items: [
      { to: "/app/projects", label: "Projects", icon: FolderKanban },
      { to: "/app/programs", label: "Programs", icon: Layers },
      { to: "/app/project-infographic", label: "Project Infographic", icon: ImageIcon },
      { to: "/app/portfolio-segmentation", label: "Segmentation", icon: PieChart },
      { to: "/app/prioritisation", label: "Prioritisation", icon: Trophy },
      { to: "/app/portfolio-movements", label: "Movements", icon: ArrowLeftRight },
      { to: "/app/demand-pipeline", label: "Demand Pipeline", icon: Inbox },
    ],
  },
  {
    heading: "🚚 Delivery",
    items: [
      { to: "/app/timeline", label: "Timeline", icon: Calendar },
      { to: "/app/roadmap-governance", label: "Roadmap × Governance", icon: Map },
      { to: "/app/stage-gates", label: "Stage Gates (Waterfall)", icon: Flag },
      { to: "/app/agile", label: "Agile / Sprints", icon: Zap },
      { to: "/app/governance-channels", label: "Governance Channel", icon: Radio },
      { to: "/app/dependencies", label: "Dependencies", icon: GitBranch },
      { to: "/app/resources", label: "Resources", icon: Users },
      { to: "/app/risk-roadmap", label: "Risk Roadmap", icon: RouteIcon },
    ],
  },
  {
    heading: "💰 Financials",
    items: [
      { to: "/app/financials", label: "Financials", icon: DollarSign },
      { to: "/app/fy-allocation", label: "FY Allocation", icon: Wallet },
      { to: "/app/phase-financials", label: "Phase Financials", icon: Clock },
      { to: "/app/cost-vs-benefit", label: "Cost vs Benefit", icon: Scale },
      { to: "/app/benefits", label: "Benefits", icon: Award },
    ],
  },
  {
    heading: "🛡️ Governance",
    items: [
      { to: "/app/risks", label: "Risks", icon: AlertTriangle },
      { to: "/app/decisions", label: "Decisions", icon: Gavel },
      { to: "/app/actions", label: "Actions", icon: ListChecks },
      { to: "/app/release-register", label: "Release Register", icon: Package },
      { to: "/app/executive-reports", label: "Executive Reports", icon: FileBarChart },
      { to: "/app/data-editor", label: "Data Editor", icon: Table2 },
      { to: "/app/configuration", label: "Configuration", icon: Settings },
      { to: "/app/billing", label: "Billing & Invoices", icon: Receipt, adminOnly: true },
      { to: "/app/team", label: "Admin: Users", icon: ShieldCheck, adminOnly: true },
      { to: "/app/permissions", label: "Admin: Permissions", icon: ShieldCheck, adminOnly: true },
    ],
  },
  {
    heading: "🏢 iProjectX Platform",
    items: [
      { to: "/platform/organizations", label: "Organizations & Users", icon: Building2, platformOnly: true },
      { to: "/platform/finance", label: "Finance & P&L", icon: TrendingUp, platformOnly: true },
      { to: "/platform/invoices", label: "All Invoices", icon: Receipt, platformOnly: true },

      { to: "/platform/subscriptions", label: "Customer Subs", icon: Building2, platformOnly: true },
      { to: "/platform/plans", label: "Plans", icon: CreditCard, platformOnly: true },
      { to: "/platform/limits", label: "Plan Limits & Usage", icon: ShieldCheck, platformOnly: true },
      { to: "/platform/expenses", label: "Expenses", icon: Landmark, platformOnly: true },
      { to: "/platform/branding", label: "Branding & White Label", icon: Palette, platformOnly: true },
      { to: "/platform/landing", label: "Landing Page", icon: Palette, platformOnly: true },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { organization, profile, roles, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const admin = isAdmin(roles);
  const platform = isPlatformAdmin(roles);
  const { canView: canViewPage } = useAllowedPages();
  const brandName = organization?.brand_name || organization?.name || "PMO Enterprise";
  const primary = organization?.primary_color || undefined;
  const accent = organization?.accent_color || undefined;
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const brandStyle = (primary || accent) ? {
    ...(primary ? { ["--primary" as any]: primary, ["--st-accent" as any]: primary, ["--sidebar-primary" as any]: primary } : {}),
    ...(accent ? { ["--accent" as any]: accent } : {}),
  } as React.CSSProperties : undefined;

  const BrandBlock = (
    <div className="flex items-center gap-2 border-b border-sidebar-border p-4">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg overflow-hidden"
        style={{ background: primary || "hsl(var(--primary))", color: "#fff" }}
      >
        {organization?.logo_url
          ? <img src={organization.logo_url} alt="" className="max-h-full max-w-full object-contain" />
          : <BarChart3 className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-sidebar-foreground">{brandName}</div>
        <div className="truncate text-[11px] text-muted-foreground">{organization?.plan ?? "free"} plan</div>
      </div>
      <button
        type="button"
        className="ml-1 rounded-md p-1 text-sidebar-foreground hover:bg-sidebar-accent md:hidden"
        onClick={() => setMobileOpen(false)}
        aria-label="Close menu"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const Nav = (
    <nav className="flex-1 space-y-4 overflow-y-auto p-3">
      {navGroups.map((group) => {
        const items = group.items.filter((n) => {
          if (n.platformOnly) return platform;
          if (n.adminOnly) return admin;
          return admin || canViewPage(n.to);
        });
        if (!items.length) return null;
        return (
          <div key={group.heading}>
            <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {group.heading}
            </div>
            <div className="space-y-0.5">
              {items.map((n) => {
                const active = n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/");
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
                      active
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                  >
                    <n.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{n.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const Footer = (
    <div className="border-t border-sidebar-border p-3">
      <div className="mb-2 truncate text-[11px] text-muted-foreground">{profile?.email}</div>
      <Button variant="outline" size="sm" className="w-full justify-start" onClick={signOut}>
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background" style={brandStyle}>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar md:flex md:flex-col">
        {BrandBlock}
        {Nav}
        {Footer}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r bg-sidebar shadow-xl">
            {BrandBlock}
            {Nav}
            {Footer}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur md:hidden">
          <button
            type="button"
            className="rounded-md p-2 hover:bg-muted"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md overflow-hidden"
              style={{ background: primary || "hsl(var(--primary))", color: "#fff" }}
            >
              {organization?.logo_url
                ? <img src={organization.logo_url} alt="" className="max-h-full max-w-full object-contain" />
                : <BarChart3 className="h-3.5 w-3.5" />}
            </div>
            <span className="truncate text-sm font-semibold">{brandName}</span>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden p-3 sm:p-4 lg:p-5">{children}</main>
      </div>
    </div>
  );
}
