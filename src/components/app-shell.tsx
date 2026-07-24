import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth, isAdmin, isPlatformAdmin } from "@/lib/auth-context";
import { useAllowedPages } from "@/lib/permissions";
import { useOrgSupportAccess } from "@/lib/support-tickets";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";
import { CartoonCompanion } from "@/components/cartoon-mascots";
import { useCartoonsEnabled } from "@/lib/use-cartoons";
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
import {
  clearCachedOrgNavigation,
  hasCustomNavigation,
  readCachedOrgNavigation,
  resolveCombinedNavigation,
  writeCachedOrgNavigation,
  type NavGroupDef,
  type NavigationConfig,
} from "@/lib/navigation-config";
import { useFocusMode } from "@/lib/use-focus-mode";
import { CommandPalette, useCommandPaletteHotkey } from "@/components/command-palette";
import { cn } from "@/lib/utils";
import { StyleThemePicker } from "@/components/style-theme-picker";
import { SoftUpdatingBar } from "@/components/soft-updating";
import {
  normalizeOrgStyleTheme,
  readUserStyleTheme,
  resolveStyleThemeId,
  writeUserStyleTheme,
  STYLE_THEME_CHANGE_EVENT,
  type StyleThemeId,
} from "@/lib/style-theme";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Paintbrush } from "lucide-react";

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
  LifeBuoy,
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
  const { allowed: supportAllowed, isReady: supportReady } = useOrgSupportAccess();
  const orgStyle = normalizeOrgStyleTheme(organization?.ui_config?.style_theme);
  const userCanPickStyle = orgStyle.user_choice_enabled === true;
  const [styleTick, setStyleTick] = useState(0);
  useEffect(() => {
    const onStyle = () => setStyleTick((n) => n + 1);
    window.addEventListener(STYLE_THEME_CHANGE_EVENT, onStyle);
    return () => window.removeEventListener(STYLE_THEME_CHANGE_EVENT, onStyle);
  }, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  /** Open section headings — default all collapsed for a quieter sidebar. */
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [navOpenHydrated, setNavOpenHydrated] = useState(false);
  const { focusMode, toggleFocusMode } = useFocusMode();
  const cartoonsEnabled = useCartoonsEnabled();
  useCommandPaletteHotkey(() => setCmdOpen(true));
  const desktopNavRef = useRef<HTMLElement | null>(null);
  const mobileNavRef = useRef<HTMLElement | null>(null);

  /**
   * Org navigation takes precedence. Seed from live org config, else last
   * cached org nav, so we never flash platform Governance placement while
   * auth/org is still hydrating.
   */
  const [orgNav, setOrgNav] = useState<NavigationConfig | null>(() => {
    const live = organization?.ui_config?.navigation;
    if (hasCustomNavigation(live)) return live as NavigationConfig;
    const cached = readCachedOrgNavigation();
    if (!cached) return null;
    // Prefer cache only for this org (or before org hydrates).
    if (!organization?.id || cached.orgId === organization.id) return cached.navigation;
    return null;
  });

  useEffect(() => {
    // Don't clear org nav when organization is briefly null (auth refresh) —
    // that was the Governance ↔ Org Admin flicker.
    if (!organization?.id) return;
    const live = organization.ui_config?.navigation ?? null;
    if (hasCustomNavigation(live)) {
      const nav = live as NavigationConfig;
      setOrgNav(nav);
      writeCachedOrgNavigation(organization.id, nav);
    } else {
      setOrgNav(null);
      clearCachedOrgNavigation();
    }
  }, [organization?.id, organization?.ui_config?.navigation]);

  useEffect(() => {
    const onOrgUi = (e: Event) => {
      const detail = (e as CustomEvent).detail as { navigation?: NavigationConfig } | undefined;
      const nav = detail?.navigation ?? null;
      if (hasCustomNavigation(nav)) {
        setOrgNav(nav);
        if (organization?.id) writeCachedOrgNavigation(organization.id, nav as NavigationConfig);
      } else if (detail && "navigation" in detail) {
        setOrgNav(null);
        clearCachedOrgNavigation();
      }
    };
    window.addEventListener("pmo:org-ui-config-change", onOrgUi);
    return () => window.removeEventListener("pmo:org-ui-config-change", onOrgUi);
  }, [organization?.id]);

  const [cached] = useState(() => readCachedLandingConfig());
  const { data: landing } = useQuery({
    queryKey: ["landing-config"],
    queryFn: fetchLandingConfig,
    staleTime: 60_000,
    initialData: cached ?? undefined,
    placeholderData: (prev) => prev ?? cached ?? undefined,
  });

  const activeStyleId = useMemo(
    () =>
      resolveStyleThemeId({
        platformThemeId: landing?.style_theme_id ?? cached?.style_theme_id,
        orgConfig: orgStyle,
        userThemeId: readUserStyleTheme(organization?.id),
      }),
    [
      landing?.style_theme_id,
      cached?.style_theme_id,
      orgStyle,
      organization?.id,
      styleTick,
    ],
  );

  const navGroups = useMemo(() => {
    // Org custom nav wins for workspace groups; platform is fallback + Platform section.
    const platformNav = landing?.navigation ?? cached?.navigation ?? null;
    return resolveCombinedNavigation(platformNav, orgNav);
  }, [landing?.navigation, cached?.navigation, orgNav]);

  const visibleNavGroups = useMemo(() => {
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((n) => {
          if (n.to === "/app/") return true;
          if (n.to === "/app/support") {
            // Hide until settings load; then only when org support is enabled for this role.
            if (!supportReady) return false;
            return supportAllowed;
          }
          if (n.platformOnly) return platform;
          if (n.adminOnly) return admin;
          return admin || canViewPage(n.to);
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [navGroups, platform, admin, canViewPage, supportAllowed, supportReady]);

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

  // Lock background scroll + Escape while the mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  // Page scroll is handled by the router's scrollRestoration — do not fight it
  // with a manual window.scrollTo on every pathname change.

  // Left nav only: keep the selected item visible when it is off-screen.
  useEffect(() => {
    const scrollNavToActive = (root: HTMLElement | null) => {
      if (!root) return;
      const active = root.querySelector<HTMLElement>('[data-nav-active="true"]');
      if (!active) return;

      const rootRect = root.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const pad = 8;
      const fullyVisible =
        activeRect.top >= rootRect.top + pad && activeRect.bottom <= rootRect.bottom - pad;
      if (fullyVisible) return;

      const offset =
        activeRect.top - rootRect.top - rootRect.height / 2 + activeRect.height / 2;
      const nextTop = root.scrollTop + offset;
      const max = root.scrollHeight - root.clientHeight;
      const clamped = Math.max(0, Math.min(nextTop, max));

      // Instant — smooth sidebar scroll on every route change feels laggy.
      if (typeof root.scrollTo === "function") {
        root.scrollTo({ top: clamped, behavior: "auto" });
      } else {
        root.scrollTop = clamped;
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
  // Accent for avatar / mark fallbacks — full palette is applied by OrgThemeProvider (no flash).
  const primary = organization?.primary_color || undefined;
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

  const BrandMarkImg = ({ compact = false }: { compact?: boolean }) => {
    const h = compact ? Math.min(28, appLogoDims.heightPx) : appLogoDims.heightPx;
    const maxW = compact ? Math.min(120, appLogoDims.maxWidthPx) : appLogoDims.maxWidthPx;
    if (shellLogoUrl) {
      return <StableBrandLogo src={shellLogoUrl} alt="" heightPx={h} maxWidthPx={maxW} />;
    }
    return <BarChart3 className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />;
  };

  const BrandBlock = (
    <div className="shell-brand flex items-center gap-3 border-b border-sidebar-border/60 px-4 py-3.5">
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ring-black/[0.06] transition-transform duration-300 hover:scale-[1.02]",
          !shellLogoUrl && "h-8 w-8 shadow-sm",
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
        <div className="truncate text-[13px] font-semibold tracking-[-0.02em] text-sidebar-foreground">
          {brandName}
        </div>
        <div className="truncate text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/75">
          {(organization?.plan ?? "free").replace(/_/g, " ")} plan
        </div>
      </div>
      <button
        type="button"
        className="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent md:hidden"
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
      className="shell-nav flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2.5 py-2.5"
    >
      <div className="mb-1.5 flex items-center justify-end gap-1 px-1.5">
        <button
          type="button"
          className="min-h-9 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-35 md:min-h-0 md:px-1.5 md:py-0.5 md:text-[10px]"
          onClick={expandAllNav}
          disabled={allNavExpanded}
          title="Expand all sections"
        >
          Expand
        </button>
        <span className="text-[10px] text-muted-foreground/30" aria-hidden>
          /
        </span>
        <button
          type="button"
          className="min-h-9 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-35 md:min-h-0 md:px-1.5 md:py-0.5 md:text-[10px]"
          onClick={collapseAllNav}
          disabled={openGroups.size === 0}
          title="Collapse all sections"
        >
          Collapse
        </button>
      </div>

      <div className="shell-nav-groups">
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
                  "shell-nav-group-trigger flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors",
                  "hover:bg-sidebar-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
                  hasActive && !open && "bg-sidebar-accent/35",
                )}
                aria-label={`${open ? "Collapse" : "Expand"} ${group.heading}`}
              >
                <ChevronDown
                  className={cn(
                    "h-3 w-3 shrink-0 text-muted-foreground/55 transition-transform duration-200",
                    open ? "rotate-0" : "-rotate-90",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    // Eyebrow-style section labels — quieter than page titles
                    "shell-nav-group-label min-w-0 flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.08em]",
                    hasActive ? "text-sidebar-foreground/75" : "text-muted-foreground/70",
                  )}
                >
                  {group.heading}
                </span>
                <span className="tabular-nums text-[10px] text-muted-foreground/40">
                  {group.items.length}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="shell-nav-group-content">
                <div className="mb-1 mt-0.5 space-y-px pb-0.5">
                  {group.items.map((n) => {
                    const Icon = resolveIcon(n.icon);
                    const active = navItemMatches(pathname, n);
                    return (
                      <Link
                        key={n.to}
                        to={n.to}
                        aria-current={active ? "page" : undefined}
                        data-nav-active={active ? "true" : undefined}
                        className={cn(
                          "shell-nav-link group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[12.5px] transition-all duration-200",
                          active
                            ? "bg-primary/10 font-medium text-sidebar-primary shadow-none ring-1 ring-primary/15"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                        )}
                      >
                        {active && (
                          <span className="shell-nav-active-bar absolute left-0 top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-sidebar-primary" />
                        )}
                        <Icon
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-opacity duration-200",
                            active
                              ? "text-sidebar-primary opacity-100"
                              : "opacity-55 group-hover:opacity-90",
                          )}
                        />
                        <span className="truncate tracking-[-0.01em]">{n.label}</span>
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
    <div className="shell-footer border-t border-sidebar-border/60 p-3">
      <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-sidebar-accent/45 px-2.5 py-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-primary-foreground"
          style={{ background: primary || "var(--primary)" }}
        >
          {initials(profile?.full_name, profile?.email)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium tracking-[-0.01em] text-sidebar-foreground">
            {profile?.full_name || "User"}
          </div>
          <div className="truncate text-[10.5px] text-muted-foreground/80">{profile?.email}</div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-full justify-start text-[12px] text-muted-foreground hover:text-sidebar-foreground"
        onClick={signOut}
      >
        <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
      </Button>
    </div>
  );

  return (
    <div
      className={cn("shell-root flex min-h-screen bg-background", focusMode && "shell-focus")}
      data-focus-mode={focusMode ? "1" : undefined}
    >
      <aside className="shell-sidebar sticky top-0 hidden h-svh w-[15rem] shrink-0 flex-col border-r border-sidebar-border/70 bg-sidebar/90 backdrop-blur-md md:flex lg:w-[16.25rem]">
        {BrandBlock}
        {renderNav(desktopNavRef)}
        {Footer}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px] transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[min(85vw,20rem)] animate-in slide-in-from-left duration-200 flex-col border-r border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] shadow-xl">
            {BrandBlock}
            {renderNav(mobileNavRef)}
            {Footer}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shell-header relative sticky top-0 z-30 flex items-center gap-2 border-b border-border/50 bg-background/80 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 sm:gap-3 sm:px-4 lg:px-6">
          <SoftUpdatingBar />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-muted/80 active:scale-[0.98] md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div
              className={cn(
                "flex shrink-0 items-center justify-center overflow-hidden rounded-md md:hidden",
                !shellLogoUrl && "h-7 w-7",
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
              <div className="hidden truncate text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70 sm:block">
                {brandName}
              </div>
              <div className="shell-page-title truncate text-[13px] font-semibold tracking-[-0.02em] text-foreground">
                {pageTitle}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 sm:hidden"
              onClick={() => setCmdOpen(true)}
              title="Search"
              aria-label="Open search"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden h-8 gap-1.5 border-border/70 bg-surface/60 px-2.5 text-[11px] text-muted-foreground shadow-none hover:bg-muted/60 sm:inline-flex"
              onClick={() => setCmdOpen(true)}
              title="Open command palette (⌘K)"
            >
              <Search className="h-3.5 w-3.5" />
              Search
              <kbd className="ml-0.5 rounded border border-border/70 bg-muted/50 px-1 font-mono text-[10px] text-muted-foreground/80">
                ⌘K
              </kbd>
            </Button>
            <Button
              type="button"
              variant={focusMode ? "default" : "ghost"}
              size="icon"
              className="h-10 w-10 sm:h-8 sm:w-8"
              onClick={toggleFocusMode}
              title={focusMode ? "Exit focus mode" : "Focus mode — denser workspace"}
            >
              <Focus className="h-3.5 w-3.5" />
            </Button>
            {userCanPickStyle && organization?.id ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 sm:h-8 sm:w-8"
                    title="Style theme"
                  >
                    <Paintbrush className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[min(18rem,calc(100vw-1.5rem))] p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Style theme
                  </div>
                  <StyleThemePicker
                    compact
                    value={activeStyleId}
                    onChange={(id: StyleThemeId) => {
                      if (!organization?.id) return;
                      writeUserStyleTheme(organization.id, id);
                    }}
                  />
                </PopoverContent>
              </Popover>
            ) : null}
            <NotificationsBell />
            <div className="hidden rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[10.5px] font-medium capitalize tracking-wide text-muted-foreground sm:block">
              {(organization?.plan ?? "free").replace(/_/g, " ")}
            </div>
            <div
              className="hidden h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-primary-foreground ring-2 ring-background sm:flex"
              style={{ background: primary || "var(--primary)" }}
              title={profile?.email || undefined}
            >
              {initials(profile?.full_name, profile?.email)}
            </div>
          </div>
        </header>

        <main
          className={cn(
            "shell-main min-w-0 flex-1 overflow-x-hidden p-3 sm:p-5 lg:p-7",
            cartoonsEnabled && !focusMode && "shell-main--with-companion",
          )}
        >
          {children}
        </main>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} groups={visibleNavForPalette} />
      {/* Portal-like sibling: must stay out of theme stacking rules that set
          .shell-root > * { position: relative }, which would turn the mascot
          into a flex column and waste page width on the right. */}
      {!focusMode && <CartoonCompanion />}
    </div>
  );
}
