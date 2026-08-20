import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Users,
  Wallet,
  EyeOff,
  ClipboardX,
  TimerReset,
  ShieldCheck,
  Activity,
  LineChart,
  Layers,
  Gauge,
  BadgeCheck,
  Check,
  ArrowRight,
  FileSpreadsheet,
  Lock,
  Palette,
  GitBranch,
  Calendar,
  Flag,
  Menu,
  X,
  KeyRound,
  ScrollText,
  Shield,
  Sparkles,
  Brain,
  Database,
  Clock,
  Link2,
} from "lucide-react";
import {
  DEFAULT_LANDING,
  fetchLandingConfig,
  resolveBrandLogoDims,
  resolveBrandLogoUrl,
  getFreshLandingConfigSnapshot,
  resolveLandingCfgForPaint,
  readCachedLandingConfigForPaint,
  type LandingConfig,
  type LandingItem,
  type LogoDisplaySize,
} from "@/lib/landing-config";
import { StableBrandLogo } from "@/components/stable-brand-logo";
import { LandingHeroFrame } from "@/components/landing-hero-frame";
import { PageLoading } from "@/components/page-loading";
import { lockDocumentScroll, unlockDocumentScroll } from "@/lib/document-scroll";

const EoiModal = lazy(() => import("@/components/eoi-form").then((m) => ({ default: m.EoiModal })));
const LandingStoryWindow = lazy(() =>
  import("@/components/landing-story-window").then((m) => ({
    default: m.LandingStoryWindow,
  })),
);
const LandingHeroDashboard = lazy(() =>
  import("@/components/landing-hero-dashboard").then((m) => ({
    default: m.LandingHeroDashboard,
  })),
);
const LandingHeroIllustration = lazy(() =>
  import("@/components/landing-hero-illustration").then((m) => ({
    default: m.LandingHeroIllustration,
  })),
);

type LandingLoaderData = {
  cfg: LandingConfig;
  /** True when cfg came from localStorage — revalidate live signup/branding after paint. */
  needsRevalidate: boolean;
};

export const Route = createFileRoute("/")({
  loader: async (): Promise<LandingLoaderData> => {
    // Instant paint on repeat visits from memory/localStorage (logos + palette kept).
    // Prefer in-memory (updated by /auth fetch) over a stale localStorage edge case.
    // Never trust cached signup_enabled (avoids Get started flash).
    // First visit (no cache): await live config so we never flash DEFAULT branding.
    // staleTime: 0 so auth→home always re-reads this snapshot (no 60s-old logo).
    if (typeof window !== "undefined") {
      const cached = getFreshLandingConfigSnapshot();
      if (cached) {
        return { cfg: { ...cached, signup_enabled: false }, needsRevalidate: true };
      }
    }
    return { cfg: await fetchLandingConfig(), needsRevalidate: false };
  },
  staleTime: 0,
  // Only show pending when the loader is slow (first visit / cold network).
  pendingMs: 120,
  pendingComponent: LandingPending,
  component: LandingPage,
  head: () => ({
    meta: [
      {
        title: "iProjectX — Portfolio Intelligence Platform beyond the register",
      },
      {
        name: "description",
        content:
          "iProjectX — portfolio intelligence with calculated Project Health, Portfolio Pulse, explainable KPIs, executive what-ifs, stage-gate governance, white-label branding, MFA, optional SSO & BYOD, and In-house AI by default.",
      },
      { property: "og:title", content: "iProjectX — Portfolio Intelligence Platform" },
      {
        property: "og:description",
        content:
          "Not a static register. Calculated health, Portfolio Pulse, explainable financials, white-label, MFA, optional SSO/BYOD, and In-house AI by default.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function LandingPending() {
  // Prefer cached brand palette/theme. With no cache, stay neutral — never paint
  // DEFAULT_LANDING navy/accent (that was the reload colour-profile flash).
  const cached = typeof window !== "undefined" ? readCachedLandingConfigForPaint() : null;
  const theme = cached?.theme ?? "light";
  const bg = cached ? (theme === "dark" ? cached.palette.navy : "#ffffff") : "#ffffff";
  return (
    <PageLoading
      label="Loading…"
      fullScreen
      style={{ background: bg }}
      className={theme === "dark" && cached ? "text-white" : undefined}
    />
  );
}

const HEADING = { fontFamily: "'Sora', system-ui, sans-serif" as const };
const BODY = { fontFamily: "'Manrope', system-ui, sans-serif" as const };

const FAILURE_ICONS: Record<string, any> = {
  "Register theatre": ClipboardX,
  "Executives fly blind": EyeOff,
  "Budget discovered late": Wallet,
  "Stage gates skipped": Ban,
  "Resource double-booking": Users,
  "RAID rots in spreadsheets": ClipboardX,
  "Benefits never tracked": TimerReset,
  "Weak access control": Lock,
  "AI that leaks portfolio data": Brain,
};
const WIN_ICONS: Record<string, any> = {
  "Calculated project health": Gauge,
  "Portfolio Pulse": Activity,
  "Explainable KPIs": LineChart,
  "Executive intelligence": Brain,
  "Governed stage gates": ShieldCheck,
  "Live executive cockpit": Activity,
  "Financial early warning": Gauge,
  "Auditable stage gates": ShieldCheck,
  "Capacity heatmaps": Layers,
  "RAID tied to delivery": BadgeCheck,
  "Benefits realisation": LineChart,
  "Hardened tenant security": Shield,
  "White-label & BYOD": Palette,
  "In-house AI, data stays yours": Sparkles,
  "In-house AI by default": Sparkles,
};
const CAP_ICONS: Record<string, any> = {
  "Project Health Engine": Gauge,
  "Portfolio Pulse": Activity,
  "Executive Intelligence": Brain,
  "Explainable KPIs": LineChart,
  "Executive Cockpit": Activity,
  "Portfolio Timeline": Calendar,
  Financials: LineChart,
  "Stage-Gate Governance": ShieldCheck,
  "Resource Capacity": Users,
  "Resource Timesheets": Clock,
  Integrations: Link2,
  Dependencies: GitBranch,
  "Agile + Waterfall": Layers,
  "Roadmap Analytics": Gauge,
  "Roles & Permissions": Lock,
  "Enterprise Security": Shield,
  "In-house AI": Sparkles,
  "Audit & Evidence": ScrollText,
  "White-label & Themes": Palette,
  "Excel-Native": FileSpreadsheet,
  "Benefits Realisation": BadgeCheck,
  "Optional BYOD": Database,
  "Optional SSO": KeyRound,
};

const TRUST_STRIP_ICONS: Record<string, any> = {
  "MFA for every user": KeyRound,
  "Optional SSO": KeyRound,
  "Optional BYOD": Database,
  "Multi-tenant RLS": Lock,
  "In-house AI": Sparkles,
  "Admin audit trails": ScrollText,
  "Evidence export": FileSpreadsheet,
  "Excel-native": FileSpreadsheet,
  "Agile + Waterfall": GitBranch,
  "White-label ready": Palette,
  "Portfolio intelligence": Brain,
};

const NAV_LINKS = [
  ["#cockpit", "Cockpit"],
  ["#timeline", "Timeline"],
  ["#raid", "Governance"],
  ["#security", "Security"],
  ["#capabilities", "Capabilities"],
] as const;

/** Frozen header: 4rem bar + notch. Used for the in-flow spacer only. */
const LANDING_NAV_H = "calc(4rem + env(safe-area-inset-top, 0px))";

function landingNavOffsetPx(): number {
  const bar = document.querySelector<HTMLElement>("[data-landing-nav-bar]");
  if (!bar) return 64;
  // Bottom of the 64px bar (includes safe-area padding on the parent) — not the
  // expanded mobile menu, which would overshoot by hundreds of pixels.
  return Math.round(bar.getBoundingClientRect().bottom);
}

function scrollToLandingHash(hash: string, behavior: ScrollBehavior = "smooth") {
  const id = hash.replace(/^#/, "");
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  const y = window.scrollY + el.getBoundingClientRect().top - landingNavOffsetPx();
  window.scrollTo({ top: Math.max(0, y), behavior });
}

function useCountUp(target: number, duration = 1400) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started.current) {
            started.current = true;
            const start = performance.now();
            const tick = (now: number) => {
              const t = Math.min(1, (now - start) / duration);
              setVal(Math.round(target * (1 - Math.pow(1 - t, 3))));
              if (t < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [target, duration]);
  return { ref, val };
}

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) setShown(true);
        }),
      { threshold: 0.12 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(18px)",
        transition: `opacity 750ms ease ${delay}ms, transform 750ms cubic-bezier(.2,.7,.2,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function BrandMark({
  cfg,
  size,
  onDark = false,
}: {
  cfg: LandingConfig;
  /** Override; defaults to configured landing logo size. */
  size?: LogoDisplaySize;
  onDark?: boolean;
}) {
  const p = cfg.palette;
  const token = size ?? cfg.brand.logo_size_landing ?? "md";
  const dims =
    size != null
      ? resolveBrandLogoDims({ ...cfg.brand, logo_size_landing: size }, "landing")
      : resolveBrandLogoDims(cfg.brand, "landing");
  const logoUrl = resolveBrandLogoUrl(cfg.brand, "landing");
  const box =
    token === "xl" || (token === "custom" && dims.heightPx >= 48)
      ? "h-12 w-12"
      : token === "lg" || (token === "custom" && dims.heightPx >= 36)
        ? "h-11 w-11"
        : token === "sm" || (token === "custom" && dims.heightPx <= 24)
          ? "h-7 w-7"
          : "h-8 w-8";
  const diamond =
    token === "xl" || token === "lg" || dims.heightPx >= 36
      ? "h-5 w-5"
      : token === "sm" || dims.heightPx <= 24
        ? "h-3 w-3"
        : "h-4 w-4";
  const text =
    token === "xl" || dims.heightPx >= 52
      ? "text-3xl"
      : token === "lg" || dims.heightPx >= 40
        ? "text-2xl"
        : token === "sm" || dims.heightPx <= 24
          ? "text-base"
          : "text-xl";

  if (logoUrl) {
    return (
      <StableBrandLogo
        src={logoUrl}
        alt={cfg.brand.name}
        heightPx={size === "sm" ? Math.min(24, dims.heightPx) : dims.heightPx}
        maxWidthPx={size === "sm" ? Math.min(120, dims.maxWidthPx) : dims.maxWidthPx}
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`flex ${box} items-center justify-center rounded-md`}
        style={{ background: onDark ? "rgba(255,255,255,0.12)" : p.navy }}
      >
        <span className={`${diamond} rotate-45 border-2`} style={{ borderColor: p.accent }} />
      </span>
      <span
        className={`${text} font-bold tracking-tight`}
        style={{ ...HEADING, color: onDark ? p.textOnDark : p.textHeading }}
      >
        {cfg.brand.name}
      </span>
    </span>
  );
}

function LandingPage() {
  const { cfg: loaderCfg, needsRevalidate } = Route.useLoaderData();
  // Prefer memory/localStorage over a stale loader snapshot so returning from
  // /auth never paints the previous logo for a frame.
  const [cfg, setCfg] = useState(() => resolveLandingCfgForPaint(loaderCfg));
  const signupEnabled = cfg.signup_enabled === true;
  const [eoiOpen, setEoiOpen] = useState(false);
  // Mount heavier below-fold sections after first paint so Hero can appear sooner.
  const [belowFoldReady, setBelowFoldReady] = useState(false);

  useEffect(() => {
    setCfg(resolveLandingCfgForPaint(loaderCfg));
  }, [loaderCfg]);

  useEffect(() => {
    if (!needsRevalidate) return;
    let cancelled = false;
    void fetchLandingConfig()
      .then((live) => {
        if (cancelled) return;
        // Apply live config without wiping a good cached brand if the fetch
        // somehow returns empty logo URLs while cache had them.
        setCfg((prev: LandingConfig) => {
          const prevLogo = resolveBrandLogoUrl(prev.brand, "landing");
          const liveLogo = resolveBrandLogoUrl(live.brand, "landing");
          if (prevLogo && !liveLogo) {
            return {
              ...live,
              brand: {
                ...live.brand,
                logo_url: prev.brand.logo_url,
                logo_url_landing: prev.brand.logo_url_landing,
                logo_url_auth: prev.brand.logo_url_auth || prev.brand.logo_url,
                logo_url_app: prev.brand.logo_url_app || prev.brand.logo_url,
              },
              palette: live.palette?.navy ? live.palette : prev.palette,
            };
          }
          return live;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsRevalidate]);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(() => setBelowFoldReady(true), { timeout: 400 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setBelowFoldReady(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!belowFoldReady) return;
    if (location.hash) scrollToLandingHash(location.hash, "auto");
    const onHash = () => {
      if (location.hash) scrollToLandingHash(location.hash, "smooth");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [belowFoldReady]);

  // Warm the auth logo in the browser cache so Sign in paints without a swap.
  useEffect(() => {
    const authLogo = resolveBrandLogoUrl(cfg.brand, "auth");
    if (!authLogo || authLogo.startsWith("data:")) return;
    const img = new Image();
    img.decoding = "async";
    img.src = authLogo;
  }, [cfg.brand]);

  const p = cfg.palette;
  const isDark = cfg.theme === "dark";
  const pageBg = isDark ? p.navy : "#fafbfc";
  const sectionBg = isDark ? p.navyLight : "#ffffff";

  const cssVars = {
    ["--lp-navy" as any]: p.navy,
    ["--lp-navyLight" as any]: p.navyLight,
    ["--lp-accent" as any]: p.accent,
    ["--lp-surface" as any]: p.surface,
    ["--lp-danger" as any]: p.danger,
    ["--lp-warning" as any]: p.warning,
    ["--lp-success" as any]: p.success,
    ["--lp-textHeading" as any]: p.textHeading,
    ["--lp-textBody" as any]: p.textBody,
    ["--lp-textMuted" as any]: p.textMuted,
    ["--lp-textOnDark" as any]: p.textOnDark,
    ["--lp-textOnAccent" as any]: p.textOnAccent,
    ["--lp-nav-h" as any]: LANDING_NAV_H,
  } as React.CSSProperties;

  return (
    <div
      className="w-full max-w-[100vw] overflow-x-clip antialiased"
      data-theme={cfg.theme}
      style={{ ...cssVars, ...BODY, color: p.textBody, background: pageBg }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>
      <Nav cfg={cfg} signupEnabled={signupEnabled} />
      {/* Matches frozen nav: 4rem bar + notch inset, so the hero is not tucked under Sign in / logo. */}
      <div className="h-[var(--lp-nav-h)] shrink-0" aria-hidden />
      <main id="main" className="min-w-0">
        <Hero cfg={cfg} onEoiClick={() => setEoiOpen(true)} />
        {cfg.hero.alert && <InsightBar cfg={cfg} />}
        <TrustStrip cfg={cfg} />
        {belowFoldReady ? (
          <>
            <TrustedBy cfg={cfg} sectionBg={sectionBg} />
            <CeoMessage cfg={cfg} sectionBg={sectionBg} />
            <FailureVsSuccess cfg={cfg} />
            <ExecutiveCockpitTour cfg={cfg} sectionBg={sectionBg} />
            <PortfolioTimelineTour cfg={cfg} />
            <RaidTour cfg={cfg} sectionBg={sectionBg} />
            <SecurityTour cfg={cfg} sectionBg={sectionBg} />
            <CapabilityBento cfg={cfg} />
            <Testimonials cfg={cfg} sectionBg={sectionBg} />
            <BoardStatements cfg={cfg} />
            <StatsStrip cfg={cfg} />
            <FinalCta cfg={cfg} onEoiClick={() => setEoiOpen(true)} />
          </>
        ) : (
          <div className="min-h-[50vh]" aria-hidden />
        )}
      </main>
      <Footer cfg={cfg} />
      {eoiOpen ? (
        <Suspense fallback={null}>
          <EoiModal cfg={cfg} onClose={() => setEoiOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}

function CtaPrimary({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const cls =
    "inline-flex items-center gap-2 rounded-md px-7 py-3.5 text-sm font-bold transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0";
  const style = {
    ...HEADING,
    background: "var(--lp-accent)",
    color: "var(--lp-textOnAccent)",
  };
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={style} className={cls}>
        {children} <ArrowRight className="h-4 w-4" />
      </button>
    );
  }
  return (
    <Link to="/auth" style={style} className={cls}>
      {children} <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function CtaSecondary({
  children,
  href = "#capabilities",
  dark = false,
}: {
  children: React.ReactNode;
  href?: string;
  dark?: boolean;
}) {
  const className =
    "inline-flex items-center gap-2 rounded-md border px-7 py-3.5 text-sm font-bold transition-colors " +
    (dark ? "hover:bg-white/10" : "hover:bg-[color:var(--lp-surface)]");
  const style = {
    ...HEADING,
    color: dark ? "var(--lp-textOnDark)" : "var(--lp-textHeading)",
    borderColor: dark
      ? "rgba(255,255,255,0.22)"
      : "color-mix(in srgb, var(--lp-navy) 16%, transparent)",
  } as React.CSSProperties;

  if (href.startsWith("#")) {
    return (
      <a href={href} style={style} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href as any} style={style} className={className}>
      {children}
    </Link>
  );
}

function Nav({ cfg, signupEnabled }: { cfg: LandingConfig; signupEnabled: boolean }) {
  const p = cfg.palette;
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  const goSection = (href: `#${string}`) => {
    setOpen(false);
    const hash = href.slice(1);
    void navigate({ to: "/", hash, hashScrollIntoView: false });
    requestAnimationFrame(() => scrollToLandingHash(href));
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (open) {
      lockDocumentScroll();
      return () => unlockDocumentScroll();
    }
    unlockDocumentScroll();
    return undefined;
  }, [open]);

  const navBg =
    cfg.theme === "dark"
      ? scrolled
        ? `${p.navy}f2`
        : `${p.navy}cc`
      : scrolled
        ? "rgba(255,255,255,0.92)"
        : "rgba(255,255,255,0.78)";

  return (
    <nav
      data-landing-nav
      className="fixed inset-x-0 top-0 z-50 w-full border-b pt-[env(safe-area-inset-top)] backdrop-blur-xl transition-[background,box-shadow] duration-300 print:absolute"
      style={{
        borderColor: scrolled ? p.surface : "transparent",
        background: navBg,
        boxShadow: scrolled ? "0 1px 0 rgba(15,27,61,0.06)" : "none",
      }}
    >
      <div
        data-landing-nav-bar
        className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6"
      >
        <Link to="/" className="relative z-10" onClick={() => setOpen(false)}>
          <BrandMark cfg={cfg} />
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                goSection(href);
              }}
              className="text-sm font-semibold tracking-tight transition-opacity hover:opacity-70"
              style={{ color: p.textMuted }}
            >
              {label}
            </a>
          ))}
          <Link
            to="/contact"
            className="text-sm font-semibold tracking-tight transition-opacity hover:opacity-70"
            style={{ color: p.textMuted }}
          >
            Contact us
          </Link>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/auth"
            style={{
              ...HEADING,
              background: signupEnabled ? "transparent" : p.accent,
              color: signupEnabled ? p.textHeading : p.textOnAccent,
              border: signupEnabled ? `1.5px solid ${p.accent}` : "none",
            }}
            className="rounded-md px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
          {signupEnabled ? (
            <Link
              to="/auth"
              style={{ ...HEADING, background: p.navy, color: p.textOnDark }}
              className="rounded-md px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
            >
              Get started
            </Link>
          ) : null}
        </div>

        <button
          type="button"
          className="relative z-10 inline-flex h-10 w-10 items-center justify-center rounded-md border md:hidden"
          style={{ borderColor: p.surface, color: p.textHeading }}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div
          className="border-t px-5 py-5 md:hidden"
          style={{
            borderColor: p.surface,
            background: cfg.theme === "dark" ? p.navy : "#ffffff",
          }}
        >
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  goSection(href);
                }}
                className="rounded-md px-3 py-3 text-sm font-semibold"
                style={{ color: p.textHeading }}
              >
                {label}
              </a>
            ))}
            <Link
              to="/contact"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-sm font-semibold"
              style={{ color: p.textHeading }}
            >
              Contact us
            </Link>
          </div>
          <div
            className="mt-4 flex flex-col gap-2 border-t pt-4"
            style={{ borderColor: p.surface }}
          >
            <Link
              to="/auth"
              onClick={() => setOpen(false)}
              style={{
                ...HEADING,
                background: signupEnabled ? "transparent" : p.accent,
                color: signupEnabled ? p.textHeading : p.textOnAccent,
                border: signupEnabled ? `1.5px solid ${p.accent}` : "none",
              }}
              className="rounded-md px-3 py-3 text-center text-sm font-bold"
            >
              Sign in
            </Link>
            {signupEnabled ? (
              <Link
                to="/auth"
                onClick={() => setOpen(false)}
                style={{ ...HEADING, background: p.navy, color: p.textOnDark }}
                className="rounded-md px-3 py-3 text-center text-sm font-bold"
              >
                Get started
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </nav>
  );
}

function Hero({ cfg, onEoiClick }: { cfg: LandingConfig; onEoiClick?: () => void }) {
  const p = cfg.palette;
  return (
    <section
      className="relative min-h-[min(92vh,880px)] overflow-hidden"
      style={{ background: p.navy, color: p.textOnDark }}
    >
      {/* Atmosphere: soft gradient + grid, not flat fill */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 70% 20%, ${p.accent}33 0%, transparent 55%),
            radial-gradient(ellipse 50% 40% at 10% 80%, ${p.navyLight}88 0%, transparent 50%),
            linear-gradient(165deg, ${p.navy} 0%, ${p.navyLight} 100%)
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `linear-gradient(${p.textOnDark} 1px, transparent 1px), linear-gradient(90deg, ${p.textOnDark} 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          maskImage: "linear-gradient(to bottom, black 20%, transparent 95%)",
        }}
      />

      <div className="relative mx-auto grid max-w-7xl min-w-0 gap-10 px-4 pb-14 pt-12 sm:gap-12 sm:px-6 sm:pb-16 sm:pt-14 lg:grid-cols-12 lg:items-center lg:gap-10 lg:pb-24 lg:pt-20">
        <div className="min-w-0 lg:col-span-5">
          <Reveal>
            <div
              className="mb-5 text-[11px] font-bold uppercase tracking-[0.22em]"
              style={{ color: p.accent }}
            >
              {cfg.brand.name}
            </div>
            <p
              className="mb-4 text-sm font-medium tracking-wide"
              style={{ color: p.textOnDark, opacity: 0.72 }}
            >
              {cfg.hero.eyebrow || cfg.brand.tagline}
            </p>
            <h1
              className="text-[2.35rem] font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.35rem]"
              style={{ ...HEADING, color: p.textOnDark }}
            >
              {cfg.hero.title} <span style={{ color: p.accent }}>{cfg.hero.title_accent}</span>
            </h1>
            <p
              className="mt-5 max-w-lg text-base leading-relaxed sm:mt-6 sm:text-lg"
              style={{ color: p.textOnDark, opacity: 0.82 }}
            >
              {cfg.hero.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3 sm:mt-9">
              <CtaPrimary onClick={onEoiClick}>{cfg.hero.primary_cta}</CtaPrimary>
              <CtaSecondary dark href="#capabilities">
                {cfg.hero.secondary_cta}
              </CtaSecondary>
            </div>
            <a
              href="#story"
              className="mt-5 inline-flex items-center text-sm font-semibold tracking-tight lg:hidden"
              style={{ color: p.accent }}
              onClick={(e) => {
                e.preventDefault();
                scrollToLandingHash("#story");
              }}
            >
              {cfg.hero.visual === "video" ? "Watch the pitch" : "See the product"}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </a>
            {cfg.hero.after_cta ? (
              <p
                className="mt-10 max-w-lg text-sm leading-relaxed sm:mt-12 sm:text-[15px]"
                style={{ color: p.textOnDark, opacity: 0.7 }}
              >
                {cfg.hero.after_cta}
              </p>
            ) : null}
          </Reveal>
        </div>

        <div className="min-w-0 lg:col-span-7" id="story">
          <LandingHeroFrame accent={p.accent} navy={p.navy}>
            {cfg.hero.visual === "image" ? (
              <Suspense
                fallback={
                  <div
                    className="min-h-[280px] w-full"
                    style={{ background: "rgba(8, 14, 32, 0.72)" }}
                    aria-hidden
                  />
                }
              >
                <LandingHeroDashboard cfg={cfg} />
              </Suspense>
            ) : cfg.hero.visual === "animation" ? (
              <Suspense
                fallback={
                  <div
                    className="min-h-[320px] w-full"
                    style={{ background: "rgba(8, 14, 32, 0.72)" }}
                    aria-hidden
                  />
                }
              >
                <LandingHeroIllustration cfg={cfg} />
              </Suspense>
            ) : (
              <Suspense
                fallback={
                  <div
                    className="relative w-full overflow-hidden"
                    style={{ aspectRatio: "16 / 9" }}
                    aria-hidden
                  >
                    <img
                      src="/landing/ipx-pitch-poster.jpg"
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </div>
                }
              >
                <LandingStoryWindow cfg={cfg} />
              </Suspense>
            )}
          </LandingHeroFrame>
        </div>
      </div>
    </section>
  );
}

function InsightBar({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  return (
    <div
      className="border-b"
      style={{
        borderColor: `${p.danger}33`,
        background: cfg.theme === "dark" ? `${p.danger}18` : `${p.danger}0d`,
      }}
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-5 py-3.5 text-sm sm:px-6 sm:items-center">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" style={{ color: p.danger }} />
        <p style={{ color: p.textBody }}>{cfg.hero.alert}</p>
      </div>
    </div>
  );
}

function TrustStrip({ cfg }: { cfg: LandingConfig }) {
  const labels =
    cfg.trust_strip?.items?.length > 0 ? cfg.trust_strip.items : DEFAULT_LANDING.trust_strip.items;
  return (
    <section
      className="border-y"
      style={{
        background: "var(--lp-navy)",
        borderColor: "color-mix(in srgb, var(--lp-surface) 40%, transparent)",
      }}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-3.5 sm:px-6">
        {labels.map((label) => {
          const Icon = TRUST_STRIP_ICONS[label] || ShieldCheck;
          return (
            <span
              key={label}
              className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--lp-textOnDark)", opacity: 0.72 }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: "var(--lp-accent)" }} />
              {label}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function TrustedBy({ cfg, sectionBg }: { cfg: LandingConfig; sectionBg: string }) {
  if (!cfg.trusted?.logos?.length) return null;
  return (
    <section
      className="border-b py-14"
      style={{ borderColor: cfg.palette.surface, background: sectionBg }}
    >
      <div className="mx-auto max-w-7xl px-5 text-center sm:px-6">
        <div
          className="mb-8 text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: cfg.palette.textMuted }}
        >
          {cfg.trusted.heading}
        </div>
        <div className="flex flex-wrap items-end justify-center gap-x-10 gap-y-8">
          {cfg.trusted.logos.map((l, i) => (
            <div key={`${l.name}-${i}`} className="flex w-[140px] flex-col items-center gap-2">
              {l.logo_url ? (
                <img
                  src={l.logo_url}
                  alt=""
                  className="h-10 max-w-[130px] object-contain opacity-80 grayscale transition duration-300 hover:opacity-100 hover:grayscale-0"
                />
              ) : (
                <div
                  className="flex h-10 w-full items-center justify-center rounded-md text-xs font-semibold"
                  style={{ background: cfg.palette.surface, color: cfg.palette.textMuted }}
                >
                  {(l.name || "?").slice(0, 1)}
                </div>
              )}
              {l.name ? (
                <div
                  className="text-[11px] font-medium leading-tight"
                  style={{ color: cfg.palette.textBody }}
                >
                  {l.name}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CeoMessage({ cfg, sectionBg }: { cfg: LandingConfig; sectionBg: string }) {
  const m = cfg.ceo_message;
  if (!m?.enabled || !m.message?.trim()) return null;
  const p = cfg.palette;
  return (
    <section
      className="border-b py-16 sm:py-20"
      style={{ borderColor: p.surface, background: sectionBg }}
    >
      <div className="mx-auto max-w-5xl px-5 sm:px-6">
        <Reveal>
          <div className="grid items-center gap-10 md:grid-cols-[minmax(0,200px)_1fr] md:gap-14">
            <div className="mx-auto md:mx-0">
              <div
                className="h-40 w-40 overflow-hidden rounded-2xl border shadow-sm sm:h-48 sm:w-48"
                style={{ borderColor: p.surface, background: p.surface }}
              >
                {m.photo_url ? (
                  <img
                    src={m.photo_url}
                    alt={m.name || "CEO"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-3xl font-bold"
                    style={{ color: p.textMuted }}
                  >
                    {(m.name || "CEO").slice(0, 1)}
                  </div>
                )}
              </div>
            </div>
            <div>
              {m.subtitle && (
                <div
                  className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: p.accent }}
                >
                  {m.subtitle}
                </div>
              )}
              <h2
                className="text-2xl font-bold tracking-tight sm:text-3xl"
                style={{ ...HEADING, color: p.textHeading }}
              >
                {m.title}
              </h2>
              <p
                className="mt-5 text-base leading-relaxed whitespace-pre-line sm:text-lg"
                style={{ color: p.textBody }}
              >
                {m.message}
              </p>
              {(m.name || m.role) && (
                <div className="mt-6">
                  {m.name && (
                    <div className="font-semibold" style={{ ...HEADING, color: p.textHeading }}>
                      {m.name}
                    </div>
                  )}
                  {m.role && (
                    <div className="text-sm" style={{ color: p.textMuted }}>
                      {m.role}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Testimonials({ cfg, sectionBg }: { cfg: LandingConfig; sectionBg: string }) {
  const t = cfg.testimonials;
  const items = (t?.items ?? []).filter((i) => i.message?.trim());
  if (!t?.enabled || items.length === 0) return null;
  const p = cfg.palette;
  return (
    <section
      className="border-b py-16 sm:py-24"
      style={{ borderColor: p.surface, background: sectionBg }}
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <Reveal>
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2
              className="text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ ...HEADING, color: p.textHeading }}
            >
              {t.title}
            </h2>
            {t.subtitle && (
              <p className="mt-3 text-base leading-relaxed" style={{ color: p.textMuted }}>
                {t.subtitle}
              </p>
            )}
          </div>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <Reveal key={i} delay={i * 60}>
              <article
                className="flex h-full flex-col rounded-2xl border p-6 shadow-sm"
                style={{ borderColor: p.surface, background: p.surface }}
              >
                {(item.title || item.subtitle) && (
                  <div className="mb-4">
                    {item.title && (
                      <h3
                        className="text-lg font-semibold"
                        style={{ ...HEADING, color: p.textHeading }}
                      >
                        {item.title}
                      </h3>
                    )}
                    {item.subtitle && (
                      <p className="mt-1 text-sm" style={{ color: p.textMuted }}>
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                )}
                <p
                  className="flex-1 text-sm leading-relaxed whitespace-pre-line"
                  style={{ color: p.textBody }}
                >
                  “{item.message}”
                </p>
                <div
                  className="mt-6 flex items-center gap-3 border-t pt-4"
                  style={{ borderColor: p.surface }}
                >
                  <div
                    className="h-12 w-12 shrink-0 overflow-hidden rounded-full border"
                    style={{ borderColor: p.surface, background: p.surface }}
                  >
                    {item.photo_url ? (
                      <img
                        src={item.photo_url}
                        alt={item.name || item.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center text-sm font-bold"
                        style={{ color: p.textMuted }}
                      >
                        {(item.name || item.title || "?").slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    {(item.name || item.title) && (
                      <div
                        className="truncate text-sm font-semibold"
                        style={{ color: p.textHeading }}
                      >
                        {item.name || item.title}
                      </div>
                    )}
                    {(item.role || item.subtitle) && (
                      <div className="truncate text-xs" style={{ color: p.textMuted }}>
                        {item.role || item.subtitle}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function BoardStatements({ cfg }: { cfg: LandingConfig }) {
  const b = cfg.board_statements;
  const items = (b?.items ?? []).filter((i) => i.message?.trim());
  if (!b?.enabled || items.length === 0) return null;
  const p = cfg.palette;
  return (
    <section className="py-16 sm:py-24" style={{ background: p.navy, color: p.textOnDark }}>
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <Reveal>
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2
              className="text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ ...HEADING, color: p.textOnDark }}
            >
              {b.title}
            </h2>
            {b.subtitle && (
              <p className="mt-3 text-base leading-relaxed opacity-80">{b.subtitle}</p>
            )}
          </div>
        </Reveal>
        <div className="grid gap-8 md:grid-cols-2">
          {items.map((item, i) => (
            <Reveal key={i} delay={i * 70}>
              <article className="flex gap-5 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white/10">
                  {item.photo_url ? (
                    <img
                      src={item.photo_url}
                      alt={item.name || item.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-bold opacity-70">
                      {(item.name || item.title || "B").slice(0, 1)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {item.title && (
                    <h3 className="text-lg font-semibold" style={{ ...HEADING }}>
                      {item.title}
                    </h3>
                  )}
                  {item.subtitle && <p className="mt-1 text-sm opacity-70">{item.subtitle}</p>}
                  <p className="mt-3 text-sm leading-relaxed whitespace-pre-line opacity-90">
                    {item.message}
                  </p>
                  {(item.name || item.role) && (
                    <div className="mt-4 text-xs opacity-70">
                      {[item.name, item.role].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FailureVsSuccess({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  return (
    <section className="py-20 sm:py-28" style={{ background: p.surface }}>
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <Reveal>
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <h2
              className="text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ ...HEADING, color: p.textHeading }}
            >
              {cfg.comparison.heading}
            </h2>
            <p
              className="mx-auto mt-4 max-w-2xl text-base leading-relaxed"
              style={{ color: p.textMuted }}
            >
              {cfg.comparison.subtitle}
            </p>
          </div>
        </Reveal>
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <ItemColumn
            p={p}
            tone="danger"
            label="Without"
            items={cfg.comparison.failures}
            iconMap={FAILURE_ICONS}
            fallback={AlertTriangle}
          />
          <ItemColumn
            p={p}
            tone="success"
            label="With"
            items={cfg.comparison.wins}
            iconMap={WIN_ICONS}
            fallback={BadgeCheck}
          />
        </div>
      </div>
    </section>
  );
}

function ItemColumn({
  p,
  tone,
  label,
  items,
  iconMap,
  fallback,
}: {
  p: any;
  tone: "danger" | "success";
  label: string;
  items: LandingItem[];
  iconMap: Record<string, any>;
  fallback: any;
}) {
  const c = tone === "danger" ? p.danger : p.success;
  return (
    <div>
      <div
        className="mb-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em]"
        style={{ color: c }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
        {label} iProjectX
      </div>
      <div className="space-y-1">
        {items.map((f, i) => {
          const Icon = iconMap[f.title] || fallback;
          return (
            <Reveal key={f.title + i} delay={i * 50}>
              <div
                className="flex gap-4 border-b py-5 transition-colors"
                style={{ borderColor: `${p.navy}14` }}
              >
                <div
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                  style={{ background: `${c}14`, color: c }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div
                    className="text-[15px] font-bold"
                    style={{ ...HEADING, color: p.textHeading }}
                  >
                    {f.title}
                  </div>
                  <div className="mt-1 text-sm leading-relaxed" style={{ color: p.textMuted }}>
                    {f.desc}
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}

function ExecutiveCockpitTour({ cfg, sectionBg }: { cfg: LandingConfig; sectionBg: string }) {
  const p = cfg.palette;
  return (
    <section
      id="cockpit"
      className="scroll-mt-0 overflow-hidden py-20 sm:py-28"
      style={{ background: sectionBg }}
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="flex flex-col items-center gap-14 lg:flex-row lg:gap-16">
          <Reveal className="lg:w-1/2">
            <p
              className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: p.accent }}
            >
              {cfg.cockpit.eyebrow}
            </p>
            <h2
              className="text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ ...HEADING, color: p.textHeading }}
            >
              {cfg.cockpit.title}
            </h2>
            <p className="mt-5 text-lg leading-relaxed" style={{ color: p.textMuted }}>
              {cfg.cockpit.body}
            </p>
            <ul className="mt-8 space-y-3.5">
              {cfg.cockpit.bullets.map((t) => (
                <li
                  key={t}
                  className="flex items-start gap-3 text-[15px] font-medium"
                  style={{ color: p.textHeading }}
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: p.accent }} />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="w-full lg:w-1/2" delay={90}>
            <div
              className="rounded-xl border p-5 sm:p-6"
              style={{ borderColor: p.surface, background: cfg.theme === "dark" ? p.navy : "#fff" }}
            >
              <div
                className="mb-5 text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ color: p.textMuted }}
              >
                Executive cockpit
              </div>
              <div className="grid grid-cols-3 gap-3">
                <CockpitTile
                  p={p}
                  label="Portfolio health"
                  value="84%"
                  bar={84}
                  accent={p.success}
                />
                <CockpitTile
                  p={p}
                  label="Active risks"
                  value="12"
                  chips={[p.danger, p.warning, p.surface]}
                  accent={p.accent}
                />
                <CockpitTile p={p} label="Say / Do" value="0.92" bar={92} accent={p.accent} />
              </div>
              <div className="mt-5 grid grid-cols-8 gap-1.5">
                {[
                  p.success,
                  p.success,
                  p.success,
                  p.warning,
                  p.success,
                  p.danger,
                  p.success,
                  p.success,
                  p.success,
                  p.warning,
                  p.success,
                  p.success,
                  p.danger,
                  p.success,
                  p.warning,
                  p.success,
                ].map((c, i) => (
                  <div key={i} className="h-6 rounded-sm sm:h-7" style={{ background: c }} />
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function CockpitTile({ p, label, value, bar, chips, accent }: any) {
  return (
    <div
      className="rounded-lg border-l-[3px] p-3"
      style={{ borderLeftColor: accent, background: `${p.surface}99` }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: p.textMuted }}
      >
        {label}
      </div>
      <div className="mt-0.5 text-xl font-bold" style={{ ...HEADING, color: p.textHeading }}>
        {value}
      </div>
      {typeof bar === "number" && (
        <div
          className="mt-2 h-1 w-full overflow-hidden rounded-full"
          style={{ background: p.surface }}
        >
          <div className="h-full rounded-full" style={{ width: `${bar}%`, background: accent }} />
        </div>
      )}
      {chips && (
        <div className="mt-2 flex gap-1">
          {chips.map((c: string, i: number) => (
            <div key={i} className="h-1.5 w-full rounded-full" style={{ background: c }} />
          ))}
        </div>
      )}
    </div>
  );
}

function PortfolioTimelineTour({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  return (
    <section
      id="timeline"
      className="scroll-mt-0 py-20 sm:py-28"
      style={{ background: p.navy, color: p.textOnDark }}
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-16">
          <Reveal className="order-2 lg:order-1">
            <div
              className="rounded-xl border p-5 sm:p-6"
              style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}
            >
              <div
                className="mb-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{ color: p.textOnDark, opacity: 0.45 }}
              >
                <Calendar className="h-3.5 w-3.5" style={{ color: p.accent }} />
                Portfolio Gantt
              </div>
              <div className="space-y-3.5">
                {[
                  { n: "ERP Migration", left: 5, w: 55, gate: 40, ok: true },
                  { n: "Customer Portal", left: 15, w: 45, gate: 35, ok: false },
                  { n: "Data Lake 2.0", left: 10, w: 70, gate: 55, ok: true },
                  { n: "Zero-Trust Rollout", left: 25, w: 50, gate: 60, ok: true },
                  { n: "Field App v3", left: 40, w: 45, gate: 70, ok: false },
                ].map((r) => (
                  <div key={r.n} className="flex items-center gap-3 text-xs">
                    <div
                      className="w-32 truncate sm:w-36"
                      style={{ color: p.textOnDark, opacity: 0.7 }}
                    >
                      {r.n}
                    </div>
                    <div className="relative h-4 flex-1">
                      <div
                        className="absolute top-1/2 h-2 -translate-y-1/2 rounded-sm"
                        style={{
                          left: `${r.left}%`,
                          width: `${r.w}%`,
                          background: r.ok ? p.accent : p.danger,
                          opacity: 0.9,
                        }}
                      />
                      <div
                        className="absolute -top-0.5 h-5 w-0.5"
                        style={{
                          left: `${r.left + r.gate * 0.6}%`,
                          background: r.ok ? p.success : p.warning,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal className="order-1 lg:order-2" delay={80}>
            <p
              className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: p.accent }}
            >
              {cfg.timeline.eyebrow}
            </p>
            <h2
              className="text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ ...HEADING, color: p.textOnDark }}
            >
              {cfg.timeline.title}
            </h2>
            <p
              className="mt-5 text-lg leading-relaxed"
              style={{ color: p.textOnDark, opacity: 0.82 }}
            >
              {cfg.timeline.body}
            </p>
            <ul
              className="mt-8 space-y-3.5 text-[15px]"
              style={{ color: p.textOnDark, opacity: 0.9 }}
            >
              {cfg.timeline.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <Flag className="mt-0.5 h-4 w-4 shrink-0" style={{ color: p.accent }} />
                  {b}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function RaidTour({ cfg, sectionBg }: { cfg: LandingConfig; sectionBg: string }) {
  const p = cfg.palette;
  const rows = [
    {
      id: "R-104",
      type: "Risk",
      title: "Vendor SLA slip on ERP data migration",
      owner: "A. Rao",
      status: "Mitigating",
      tone: p.warning,
    },
    {
      id: "A-231",
      type: "Action",
      title: "Confirm FY25 CapEx re-baseline",
      owner: "M. Chen",
      status: "Open",
      tone: p.accent,
    },
    {
      id: "I-058",
      type: "Issue",
      title: "Integration test env unavailable",
      owner: "S. Patel",
      status: "Open",
      tone: p.danger,
    },
    {
      id: "D-072",
      type: "Decision",
      title: "Approve stage gate G3 for Customer Portal",
      owner: "Steer.Co",
      status: "Approved",
      tone: p.success,
    },
  ];
  return (
    <section
      id="raid"
      className="scroll-mt-0 overflow-x-hidden py-16 sm:py-20 md:py-28"
      style={{ background: sectionBg }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-6">
        <div className="grid min-w-0 gap-10 md:gap-14 lg:grid-cols-12 lg:items-center lg:gap-16">
          <Reveal className="min-w-0 lg:col-span-5">
            <p
              className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: p.textMuted }}
            >
              {cfg.raid.eyebrow}
            </p>
            <h2
              className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl"
              style={{ ...HEADING, color: p.textHeading }}
            >
              {cfg.raid.title}
            </h2>
            <p
              className="mt-4 text-base leading-relaxed sm:mt-5 sm:text-lg"
              style={{ color: p.textMuted }}
            >
              {cfg.raid.body}
            </p>
            <div className="mt-6 flex flex-wrap gap-2 sm:mt-8">
              {cfg.raid.chips.map((chip) => (
                <span
                  key={chip}
                  className="border px-3 py-1.5 text-xs font-semibold"
                  style={{
                    borderColor: `${p.navy}18`,
                    color: p.textMuted,
                    background: cfg.theme === "dark" ? `${p.navy}66` : "transparent",
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>
          </Reveal>
          <Reveal className="min-w-0 lg:col-span-7" delay={80}>
            <div
              className="overflow-hidden rounded-xl border"
              style={{
                borderColor: p.surface,
                background: cfg.theme === "dark" ? p.navy : "#fff",
              }}
            >
              <div
                className="border-b px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] sm:px-5"
                style={{
                  borderColor: p.surface,
                  background: cfg.theme === "dark" ? `${p.navyLight}` : p.surface,
                  color: p.textMuted,
                }}
              >
                RAID register
              </div>

              {/* Phone / small tablet: stacked cards — avoids forcing page-wide horizontal scroll */}
              <div className="divide-y md:hidden" style={{ borderColor: p.surface }}>
                {rows.map((r) => (
                  <div key={r.id} className="space-y-2 px-4 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-xs" style={{ color: p.textMuted }}>
                          {r.id}
                        </span>
                        <span className="text-xs font-bold" style={{ color: p.textMuted }}>
                          {r.type}
                        </span>
                      </div>
                      <span
                        className="inline-flex shrink-0 items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                        style={{ background: r.tone + "18", color: r.tone }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.tone }} />
                        {r.status}
                      </span>
                    </div>
                    <div
                      className="text-sm font-medium leading-snug"
                      style={{ color: p.textHeading }}
                    >
                      {r.title}
                    </div>
                    <div className="text-xs" style={{ color: p.textMuted }}>
                      Owner · {r.owner}
                    </div>
                  </div>
                ))}
              </div>

              {/* md+ : full register table */}
              <div className="hidden min-w-0 overflow-x-auto md:block">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr
                      className="text-left text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: p.textMuted }}
                    >
                      <th className="px-5 py-2.5">ID</th>
                      <th>Type</th>
                      <th>Title</th>
                      <th>Owner</th>
                      <th className="pr-5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t" style={{ borderColor: p.surface }}>
                        <td
                          className="px-5 py-3.5 font-mono text-xs"
                          style={{ color: p.textMuted }}
                        >
                          {r.id}
                        </td>
                        <td className="py-3.5 text-xs font-bold" style={{ color: p.textMuted }}>
                          {r.type}
                        </td>
                        <td
                          className="max-w-[14rem] py-3.5 pr-3 lg:max-w-none"
                          style={{ color: p.textHeading }}
                        >
                          {r.title}
                        </td>
                        <td
                          className="py-3.5 text-xs whitespace-nowrap"
                          style={{ color: p.textMuted }}
                        >
                          {r.owner}
                        </td>
                        <td className="pr-5 text-right">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                            style={{ background: r.tone + "18", color: r.tone }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: r.tone }}
                            />
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function SecurityTour({ cfg, sectionBg }: { cfg: LandingConfig; sectionBg: string }) {
  const p = cfg.palette;
  const sec = cfg.security ?? DEFAULT_LANDING.security;
  const controls = [
    { label: "Identity", value: "TOTP MFA required" },
    { label: "SSO", value: "Optional SAML" },
    { label: "Network", value: "Optional IP allowlist" },
    { label: "Data plane", value: "Shared or BYOD" },
    { label: "Tenancy", value: "Row-level RLS" },
    { label: "Intelligence", value: "In-house AI" },
    { label: "External AI", value: "Opt-in only" },
    { label: "Audit", value: "Admin evidence export" },
    { label: "Readiness", value: "SOC 2 / ISO path" },
  ];
  return (
    <section
      id="security"
      className="scroll-mt-0 overflow-hidden py-20 sm:py-28"
      style={{ background: sectionBg }}
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="flex flex-col items-center gap-14 lg:flex-row lg:gap-16">
          <Reveal className="lg:w-1/2">
            <p
              className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: p.accent }}
            >
              {sec.eyebrow}
            </p>
            <h2
              className="text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ ...HEADING, color: p.textHeading }}
            >
              {sec.title}
            </h2>
            <p className="mt-5 text-lg leading-relaxed" style={{ color: p.textMuted }}>
              {sec.body}
            </p>
            <ul className="mt-8 space-y-3.5">
              {sec.bullets.map((t) => (
                <li
                  key={t}
                  className="flex items-start gap-3 text-[15px] font-medium"
                  style={{ color: p.textHeading }}
                >
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: p.accent }} />
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm" style={{ color: p.textMuted }}>
              Details:{" "}
              <Link
                to="/legal/$slug"
                params={{ slug: "information-security" }}
                className="font-semibold underline-offset-4 hover:underline"
                style={{ color: p.accent }}
              >
                Information security
              </Link>
            </p>
          </Reveal>
          <Reveal className="w-full lg:w-1/2" delay={90}>
            <div
              className="overflow-hidden rounded-xl border"
              style={{
                borderColor: p.surface,
                background: cfg.theme === "dark" ? p.navy : "#fff",
              }}
            >
              <div
                className="flex items-center gap-2 border-b px-5 py-3 text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{
                  borderColor: p.surface,
                  background: cfg.theme === "dark" ? p.navyLight : p.surface,
                  color: p.textMuted,
                }}
              >
                <Shield className="h-3.5 w-3.5" style={{ color: p.accent }} />
                Security control plane
              </div>
              <div className="divide-y" style={{ borderColor: p.surface }}>
                {controls.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-4 px-5 py-3.5"
                    style={{ borderColor: p.surface }}
                  >
                    <span className="text-sm font-medium" style={{ color: p.textMuted }}>
                      {row.label}
                    </span>
                    <span
                      className="text-sm font-bold tracking-tight"
                      style={{ ...HEADING, color: p.textHeading }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function CapabilityBento({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  return (
    <section
      id="capabilities"
      className="scroll-mt-0 py-20 sm:py-28"
      style={{ background: p.surface }}
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <h2
              className="text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ ...HEADING, color: p.textHeading }}
            >
              {cfg.capabilities.heading}
            </h2>
            <p className="mt-4 text-base leading-relaxed" style={{ color: p.textMuted }}>
              {cfg.capabilities.subtitle}
            </p>
          </div>
        </Reveal>
        <div
          className="grid gap-px sm:grid-cols-2 lg:grid-cols-3"
          style={{ background: `${p.navy}14` }}
        >
          {cfg.capabilities.items.map((c, i) => {
            const Icon = CAP_ICONS[c.title] || Layers;
            return (
              <Reveal key={c.title + i} delay={(i % 3) * 50}>
                <div
                  className="h-full p-6 transition-transform duration-300 hover:-translate-y-0.5"
                  style={{
                    background: cfg.theme === "dark" ? p.navyLight : "#ffffff",
                  }}
                >
                  <div
                    className="mb-4 flex h-9 w-9 items-center justify-center rounded-md"
                    style={{ background: p.navy, color: p.textOnDark }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div
                    className="text-[15px] font-bold"
                    style={{ ...HEADING, color: p.textHeading }}
                  >
                    {c.title}
                  </div>
                  <div className="mt-1.5 text-sm leading-relaxed" style={{ color: p.textMuted }}>
                    {c.desc}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatsStrip({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  return (
    <section
      className="border-y py-16 sm:py-20"
      style={{
        background: p.navy,
        color: p.textOnDark,
        borderColor: "rgba(255,255,255,0.06)",
      }}
    >
      <div
        className={`mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 ${
          cfg.stats.length >= 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2"
        }`}
      >
        {cfg.stats.map((s, i) => (
          <StatBlock key={i} p={p} value={s.value} suffix={s.suffix} label={s.label} />
        ))}
      </div>
    </section>
  );
}

function StatBlock({
  p,
  value,
  suffix,
  label,
}: {
  p: any;
  value: number;
  suffix?: string;
  label: string;
}) {
  const { ref, val } = useCountUp(value);
  return (
    <div className="text-center">
      <div
        className="text-4xl font-bold tracking-tight sm:text-5xl"
        style={{ ...HEADING, color: p.textOnDark }}
      >
        <span ref={ref}>{val}</span>
        {suffix ?? ""}
      </div>
      <div
        className="mt-2 text-[11px] font-bold uppercase tracking-[0.18em]"
        style={{ color: p.accent }}
      >
        {label}
      </div>
    </div>
  );
}

function FinalCta({ cfg, onEoiClick }: { cfg: LandingConfig; onEoiClick?: () => void }) {
  const p = cfg.palette;
  return (
    <section className="relative overflow-hidden py-24 sm:py-32" style={{ background: p.navy }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 70% 80% at 50% 100%, ${p.accent}28 0%, transparent 60%)`,
        }}
      />
      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-6">
        <Reveal>
          <h2
            className="text-3xl font-bold tracking-tight sm:text-5xl"
            style={{ ...HEADING, color: p.textOnDark }}
          >
            {cfg.final_cta.title}
          </h2>
          <p
            className="mx-auto mt-5 max-w-2xl text-base leading-relaxed sm:text-lg"
            style={{ color: p.textOnDark, opacity: 0.8 }}
          >
            {cfg.final_cta.body}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CtaPrimary onClick={onEoiClick}>{cfg.final_cta.primary}</CtaPrimary>
            <CtaSecondary dark href="/auth">
              {cfg.final_cta.secondary}
            </CtaSecondary>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  const year = new Date().getFullYear();
  return (
    <footer
      className="border-t"
      style={{
        borderColor: p.surface,
        background: cfg.theme === "dark" ? p.navy : "#ffffff",
      }}
    >
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-5">
            <BrandMark cfg={cfg} size="xl" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed" style={{ color: p.textMuted }}>
              {cfg.brand.tagline || "Portfolio Intelligence Platform"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7 md:justify-items-end">
            <div>
              <p
                className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ color: p.textMuted }}
              >
                Product
              </p>
              <div
                className="flex flex-col gap-2 text-sm font-medium"
                style={{ color: p.textBody }}
              >
                <a href="#cockpit" className="transition-opacity hover:opacity-70">
                  Cockpit
                </a>
                <a href="#timeline" className="transition-opacity hover:opacity-70">
                  Timeline
                </a>
                <a href="#raid" className="transition-opacity hover:opacity-70">
                  Governance
                </a>
                <a href="#capabilities" className="transition-opacity hover:opacity-70">
                  Capabilities
                </a>
              </div>
            </div>
            <div>
              <p
                className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ color: p.textMuted }}
              >
                Company
              </p>
              <div
                className="flex flex-col gap-2 text-sm font-medium"
                style={{ color: p.textBody }}
              >
                <Link to="/contact" className="transition-opacity hover:opacity-70">
                  Contact us
                </Link>
                <Link to="/legal/about" className="transition-opacity hover:opacity-70">
                  About
                </Link>
                <Link to="/legal/support-help" className="transition-opacity hover:opacity-70">
                  Support
                </Link>
                <Link to="/auth" className="transition-opacity hover:opacity-70">
                  Sign in
                </Link>
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p
                className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ color: p.textMuted }}
              >
                Resources
              </p>
              <div
                className="flex flex-col gap-2 text-sm font-medium"
                style={{ color: p.textBody }}
              >
                <Link to="/legal/pricing-plans" className="transition-opacity hover:opacity-70">
                  Pricing
                </Link>
                <Link to="/legal/sla" className="transition-opacity hover:opacity-70">
                  SLA
                </Link>
                <Link to="/legal/system-status" className="transition-opacity hover:opacity-70">
                  Status
                </Link>
                <Link
                  to="/legal/information-security"
                  className="transition-opacity hover:opacity-70"
                >
                  Security
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-12 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: p.surface }}
        >
          <p className="text-xs" style={{ color: p.textMuted }}>
            {cfg.footer.text || `© ${year} iProjectX. All rights reserved.`}
          </p>
          <div
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium"
            style={{ color: p.textMuted }}
          >
            <Link to="/legal/privacy-policy" className="transition-opacity hover:opacity-70">
              Privacy
            </Link>
            <Link to="/legal/terms-of-service" className="transition-opacity hover:opacity-70">
              Terms
            </Link>
            <Link to="/legal/cookie-policy" className="transition-opacity hover:opacity-70">
              Cookies
            </Link>
            <Link to="/legal/acceptable-use" className="transition-opacity hover:opacity-70">
              Acceptable use
            </Link>
            <Link to="/contact" className="transition-opacity hover:opacity-70">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
