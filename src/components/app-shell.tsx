import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  LayoutDashboard,
  FolderKanban,
  AlertTriangle,
  DollarSign,
  Map,
  Users,
  GitBranch,
  Inbox,
  Scale,
  Info,
  Table2,
  Bell,
  PieChart,
  Radio,
  Flag,
  Award,
  Gavel,
  ListChecks,
  Trophy,
  Image as ImageIcon,
  ArrowLeftRight,
  FileBarChart,
  Settings,
  Calendar,
  Layers,
  Clock,
  Wallet,
  Package,
  Zap,
  ShieldCheck,
  LogOut,
  Rocket,
  Route as RouteIcon,
  TrendingUp,
  Receipt,
  Building2,
  Landmark,
  CreditCard,
  Palette,
  Menu,
  X,
  FileText,
  Home,
  Sparkles,
  Briefcase,
  BookOpen,
  CircleUser,
  ListTodo,
  Search,
  Focus,
  Eye,
  Trash2,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth, isAdmin, isPlatformAdmin } from "@/lib/auth-context";
import { useAllowedPages } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";
import { CartoonCompanion } from "@/components/cartoon-mascots";
import {
  clampLogoCustom,
  fetchLandingConfig,
  logoSizeDims,
  normalizeLogoSize,
  readCachedLandingConfig,
  resolveBrandLogoUrl,
  type LogoCustomDims,
  type LogoDisplaySize,
} from "@/lib/landing-config";
import { StableBrandLogo } from "@/components/stable-brand-logo";
import { resolveCombinedNavigation, type NavGroupDef } from "@/lib/navigation-config";
import { useFocusMode } from "@/lib/use-focus-mode";
import { CommandPalette, useCommandPaletteHotkey } from "@/components/command-palette";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  Briefcase,
  Rocket,
  LayoutDashboard,
  Sparkles,
  Bell,
  Info,
  FolderKanban,
  Layers,
  Image: ImageIcon,
  PieChart,
  Trophy,
  ArrowLeftRight,
  Inbox,
  Scale,
  ListTodo,
  Calendar,
  Map,
  TrendingUp,
  Flag,
  Zap,
  Radio,
  GitBranch,
  Users,
  Route: RouteIcon,
  DollarSign,
  Wallet,
  Clock,
  Award,
  AlertTriangle,
  Gavel,
  ListChecks,
  CircleUser,
  BookOpen,
  Package,
  FileBarChart,
  FileText,
  Table2,
  Settings,
  Menu,
  Eye,
  Trash2,
  Receipt,
  ShieldCheck,
  Building2,
  Palette,
  CreditCard,
  Landmark,
};

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] || LayoutDashboard;
}

function initials(name?: string | null, email?: string | null) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function pageTitleFromPath(pathname: string, groups: NavGroupDef[]) {
  for (const group of groups) {
    for (const item of group.items) {
      const match = item.exact
        ? pathname === item.to || (item.to === "/app/" && (pathname === "/app" || pathname === "/app/"))
        : pathname === item.to || pathname.startsWith(item.to + "/");
      if (match) return item.label;
    }
  }
  if (pathname.startsWith("/platform")) return "Platform";
  if (pathname.startsWith("/app")) return "Workspace";
  return "App";
}

const NAV_OPEN_KEY = "pmo.navGroupsOpen";

function navItemMatches(pathname: string, item: NavGroupDef["items"][number]) {
  return item.exact
    ? pathname === item.to || (item.to === "/app/" && (pathname === "/app" || pathname === "/app/"))
    : pathname === item.to || pathname.startsWith(item.to + "/");
}

function activeGroupHeading(pathname: string, groups: NavGroupDef[]) {
  for (const group of groups) {
    if (group.items.some((item) => navItemMatches(pathname, item))) return group.heading;
  }
  return null;
}

function readOpenNavGroups(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NAV_OPEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

function writeOpenNavGroups(headings: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(headings));
  } catch {
    /* ignore quota / private mode */
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const { organization, profile, roles, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const admin = isAdmin(roles);
  const platform = isPlatformAdmin(roles);
  const { canView: canViewPage } = useAllowedPages();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  /** Open section headings — default all collapsed for a quieter sidebar. */
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [navOpenHydrated, setNavOpenHydrated] = useState(false);
  const { focusMode, toggleFocusMode } = useFocusMode();
  useCommandPaletteHotkey(() => setCmdOpen(true));
  const desktopNavRef = useRef<HTMLElement | null>(null);
  const mobileNavRef = useRef<HTMLElement | null>(null);

  const [orgNav, setOrgNav] = useState(organization?.ui_config?.navigation ?? null);

  useEffect(() => {
    setOrgNav(organization?.ui_config?.navigation ?? null);
  }, [organization?.ui_config?.navigation]);

  useEffect(() => {
    const onOrgUi = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.navigation) setOrgNav(detail.navigation);
    };
    window.addEventListener("pmo:org-ui-config-change", onOrgUi);
    return () => window.removeEventListener("pmo:org-ui-config-change", onOrgUi);
  }, []);

  const [cached] = useState(() => readCachedLandingConfig());
  const { data: landing } = useQuery({
    queryKey: ["landing-config"],
    queryFn: fetchLandingConfig,
    staleTime: 60_000,
    initialData: cached ?? undefined,
  });

  const navGroups = useMemo(
    () =>
      resolveCombinedNavigation(
        landing?.navigation ?? cached?.navigation,
        orgNav ?? null,
      ),
    [landing?.navigation, cached?.navigation, orgNav],
  );

  const visibleNavGroups = useMemo(() => {
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((n) => {
          if (n.to === "/app/") return true;
          if (n.platformOnly) return platform;
          if (n.adminOnly) return admin;
          return admin || canViewPage(n.to);
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [navGroups, platform, admin, canViewPage]);

  const visibleHeadings = useMemo(
    () => visibleNavGroups.map((g) => g.heading),
    [visibleNavGroups],
  );

  // Restore saved open sections (missing key => all collapsed).
  useEffect(() => {
    const saved = readOpenNavGroups();
    if (saved?.length) setOpenGroups(new Set(saved));
    setNavOpenHydrated(true);
  }, []);

  useEffect(() => {
    if (!navOpenHydrated) return;
    writeOpenNavGroups([...openGroups]);
  }, [openGroups, navOpenHydrated]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Right pane / window: always start the new page at the top.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const main = document.querySelector<HTMLElement>(".shell-main");
    if (main) main.scrollTop = 0;
  }, [pathname]);

  // Left nav only: keep the selected item visible without moving the page.
  useEffect(() => {
    const scrollNavToActive = (root: HTMLElement | null) => {
      if (!root) return;
      const active = root.querySelector<HTMLElement>('[data-nav-active="true"]');
      if (!active) return;

      const rootRect = root.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const offset =
        activeRect.top - rootRect.top - rootRect.height / 2 + activeRect.height / 2;
      const nextTop = root.scrollTop + offset;
      const max = root.scrollHeight - root.clientHeight;
      const clamped = Math.max(0, Math.min(nextTop, max));

      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      if (reduce || typeof root.scrollTo !== "function") {
        root.scrollTop = clamped;
      } else {
        root.scrollTo({ top: clamped, behavior: "smooth" });
      }
    };

    const id = window.requestAnimationFrame(() => {
      scrollNavToActive(desktopNavRef.current);
      scrollNavToActive(mobileNavRef.current);
    });
    return () => window.cancelAnimationFrame(id);
  }, [pathname, navGroups, mobileOpen, openGroups]);

  const brandName =
    organization?.brand_name || organization?.name || landing?.brand?.name || "PMO Enterprise";
  const primary = organization?.primary_color || undefined;
  const accent = organization?.accent_color || undefined;
  const orgBranding = (organization?.ui_config as { branding?: Record<string, unknown> } | null)
    ?.branding;
  const orgLogoSize = normalizeLogoSize(orgBranding?.logo_size_app, "md") as LogoDisplaySize;
  const orgLogoCustom = clampLogoCustom(orgBranding?.logo_custom_app, {
    heightPx: 32,
    maxWidthPx: 160,
  }) as LogoCustomDims;
  const brandForApp = landing?.brand ?? cached?.brand;
  const platformAppLogo = brandForApp ? resolveBrandLogoUrl(brandForApp, "app") : "";
  // In-app: org white-label logo when set; otherwise platform app logo.
  const shellLogoUrl = organization?.logo_url || platformAppLogo || "";
  const appLogoDims = organization?.logo_url
    ? logoSizeDims(orgLogoSize, orgLogoCustom)
    : logoSizeDims(
        brandForApp?.logo_size_app ?? "md",
        brandForApp?.logo_custom_app,
      );

  const pageTitle = useMemo(() => pageTitleFromPath(pathname, navGroups), [pathname, navGroups]);

  const visibleNavForPalette = visibleNavGroups;

  const allNavExpanded =
    visibleHeadings.length > 0 && visibleHeadings.every((h) => openGroups.has(h));

  const expandAllNav = () => setOpenGroups(new Set(visibleHeadings));
  const collapseAllNav = () => setOpenGroups(new Set());
  const toggleNavGroup = (heading: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(heading)) next.delete(heading);
      else next.add(heading);
      return next;
    });
  };

  const brandStyle =
    primary || accent
      ? ({
          ...(primary
            ? {
                ["--primary" as any]: primary,
                ["--st-accent" as any]: primary,
                ["--sidebar-primary" as any]: primary,
              }
            : {}),
          ...(accent ? { ["--accent" as any]: accent } : {}),
        } as CSSProperties)
      : undefined;

  const BrandMarkImg = ({ compact = false }: { compact?: boolean }) => {
    const h = compact ? Math.min(28, appLogoDims.heightPx) : appLogoDims.heightPx;
    const maxW = compact ? Math.min(120, appLogoDims.maxWidthPx) : appLogoDims.maxWidthPx;
    if (shellLogoUrl) {
      return <StableBrandLogo src={shellLogoUrl} alt="" heightPx={h} maxWidthPx={maxW} />;
    }
    return <BarChart3 className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />;
  };

  const BrandBlock = (
    <div className="flex items-center gap-2.5 border-b border-sidebar-border/80 px-4 py-4">
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5 transition-transform duration-300 hover:scale-[1.03]",
          !shellLogoUrl && "h-9 w-9",
        )}
        style={
          shellLogoUrl
            ? { background: "transparent" }
            : { background: primary || "var(--primary)", color: "#fff" }
        }
      >
        <BrandMarkImg />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
          {brandName}
        </div>
        <div className="truncate text-[11px] capitalize text-muted-foreground">
          {(organization?.plan ?? "free").replace(/_/g, " ")} plan
        </div>
      </div>
      <button
        type="button"
        className="ml-1 rounded-md p-1.5 text-sidebar-foreground transition-colors hover:bg-sidebar-accent md:hidden"
        onClick={() => setMobileOpen(false)}
        aria-label="Close menu"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const renderNav = (navRef: { current: HTMLElement | null }) => (
    <nav
      ref={navRef as any}
      className="shell-nav flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2.5 py-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
          Navigation
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-40"
            onClick={expandAllNav}
            disabled={allNavExpanded}
            title="Expand all sections"
          >
            Expand all
          </button>
          <span className="text-[10px] text-muted-foreground/40" aria-hidden>
            ·
          </span>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-40"
            onClick={collapseAllNav}
            disabled={openGroups.size === 0}
            title="Collapse all sections"
          >
            Collapse
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {visibleNavGroups.map((group) => {
          const open = openGroups.has(group.heading);
          const hasActive = group.items.some((n) => navItemMatches(pathname, n));
          return (
            <Collapsible
              key={group.heading}
              open={open}
              onOpenChange={(next) => {
                if (next === open) return;
                toggleNavGroup(group.heading);
              }}
              className="shell-nav-group"
            >
              <CollapsibleTrigger
                type="button"
                className={cn(
                  "shell-nav-group-trigger flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
                  "hover:bg-sidebar-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  hasActive && !open && "bg-sidebar-accent/40",
                )}
                aria-label={`${open ? "Collapse" : "Expand"} ${group.heading}`}
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground/80 transition-transform duration-200",
                    open ? "rotate-0" : "-rotate-90",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    // Slightly larger than nav page links (12.5px) and section titles (13px)
                    "shell-nav-group-label min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em]",
                    hasActive ? "text-sidebar-foreground" : "text-sidebar-foreground/85",
                  )}
                >
                  {group.heading}
                </span>
                <span className="tabular-nums text-[11px] text-muted-foreground/55">
                  {group.items.length}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="shell-nav-group-content">
                <div className="mt-0.5 space-y-0.5 pb-1 pl-0.5">
                  {group.items.map((n) => {
                    const Icon = resolveIcon(n.icon);
                    const active = navItemMatches(pathname, n);
                    return (
                      <Link
                        key={n.to}
                        to={n.to}
                        data-nav-active={active ? "true" : undefined}
                        className={cn(
                          "shell-nav-link group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-all duration-200",
                          active
                            ? "bg-primary font-semibold text-primary-foreground shadow-md shadow-primary/20"
                            : "text-sidebar-foreground/90 hover:translate-x-0.5 hover:bg-sidebar-accent/90 hover:text-sidebar-foreground",
                        )}
                      >
                        {active && (
                          <span className="shell-nav-active-bar absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary-foreground/80" />
                        )}
                        <Icon
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                            active
                              ? "opacity-100"
                              : "opacity-70 group-hover:scale-110 group-hover:opacity-100",
                          )}
                        />
                        <span className="truncate">{n.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </nav>
  );

  const Footer = (
    <div className="border-t border-sidebar-border/80 p-3">
      <div className="mb-2.5 flex items-center gap-2.5 rounded-xl bg-sidebar-accent/60 px-2.5 py-2 ring-1 ring-black/5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-primary-foreground shadow-sm"
          style={{ background: primary || "var(--primary)" }}
        >
          {initials(profile?.full_name, profile?.email)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-sidebar-foreground">
            {profile?.full_name || "User"}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">{profile?.email}</div>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start bg-transparent"
        onClick={signOut}
      >
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>
    </div>
  );

  return (
    <div
      className={cn("shell-root flex min-h-screen bg-background", focusMode && "shell-focus")}
      style={brandStyle}
      data-focus-mode={focusMode ? "1" : undefined}
    >
      <aside className="shell-sidebar sticky top-0 hidden h-svh w-[15.5rem] shrink-0 flex-col border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur-sm md:flex lg:w-64">
        {BrandBlock}
        {renderNav(desktopNavRef)}
        {Footer}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-in slide-in-from-left duration-200 flex-col border-r border-sidebar-border bg-sidebar shadow-2xl">
            {BrandBlock}
            {renderNav(mobileNavRef)}
            {Footer}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shell-header sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 bg-background/75 px-3 py-2.5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 sm:px-4 lg:px-5">
          <button
            type="button"
            className="rounded-lg p-2 transition-all duration-200 hover:bg-muted hover:shadow-sm active:scale-95 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div
              className={cn(
                "flex shrink-0 items-center justify-center overflow-hidden rounded-lg shadow-sm md:hidden",
                !shellLogoUrl && "h-8 w-8",
              )}
              style={
                shellLogoUrl
                  ? { background: "transparent" }
                  : { background: primary || "var(--primary)", color: "#fff" }
              }
            >
              <BrandMarkImg compact />
            </div>
            <div className="min-w-0">
              <div
                key={pageTitle}
                className="shell-page-title truncate text-sm font-semibold tracking-tight text-foreground"
              >
                {pageTitle}
              </div>
              <div className="hidden truncate text-[11px] text-muted-foreground sm:block">
                {brandName}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden h-8 gap-1.5 px-2 text-[11px] text-muted-foreground sm:inline-flex"
              onClick={() => setCmdOpen(true)}
              title="Open command palette (⌘K)"
            >
              <Search className="h-3.5 w-3.5" />
              Search
              <kbd className="ml-1 rounded border border-border/80 bg-muted/60 px-1 font-mono text-[10px]">
                ⌘K
              </kbd>
            </Button>
            <Button
              type="button"
              variant={focusMode ? "default" : "outline"}
              size="icon"
              className="h-8 w-8"
              onClick={toggleFocusMode}
              title={focusMode ? "Exit focus mode" : "Focus mode — denser workspace"}
            >
              <Focus className="h-3.5 w-3.5" />
            </Button>
            <NotificationsBell />
            <div className="hidden rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-[11px] capitalize text-muted-foreground shadow-sm sm:block">
              {(organization?.plan ?? "free").replace(/_/g, " ")}
            </div>
            <div
              className="hidden h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-primary-foreground shadow-sm ring-2 ring-background sm:flex"
              style={{ background: primary || "var(--primary)" }}
              title={profile?.email || undefined}
            >
              {initials(profile?.full_name, profile?.email)}
            </div>
          </div>
        </header>

        <main
          key={pathname}
          className="shell-main min-w-0 flex-1 overflow-x-hidden p-3 sm:p-4 lg:p-6"
        >
          {children}
        </main>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} groups={visibleNavForPalette} />
      {!focusMode && <CartoonCompanion />}
    </div>
  );
}
