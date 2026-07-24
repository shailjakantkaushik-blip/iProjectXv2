import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  ArrowRight,
  FileSpreadsheet,
  Lock,
  Palette,
  GitBranch,
  Calendar,
  Flag,
  Menu,
  X,
  Check,
  Send,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_LANDING,
  fetchLandingConfig,
  resolveBrandLogoDims,
  resolveBrandLogoUrl,
  readCachedLandingConfig,
  readCachedLandingConfigForPaint,
  type LandingConfig,
  type LandingItem,
  type LogoDisplaySize,
} from "@/lib/landing-config";
import { StableBrandLogo } from "@/components/stable-brand-logo";
import { PageLoading } from "@/components/page-loading";

export const Route = createFileRoute("/")({
  loader: async () => ({ cfg: await fetchLandingConfig() }),
  staleTime: 60_000,
  pendingMs: 0,
  pendingComponent: LandingPending,
  component: LandingPage,
  head: () => ({
    meta: [
      {
        title: "iProjectX — Enterprise PMO command center for portfolios that must not fail",
      },
      {
        name: "description",
        content:
          "iProjectX gives enterprise PMOs a live executive cockpit, portfolio timeline, RAID governance and financial control across Agile and Waterfall.",
      },
      { property: "og:title", content: "iProjectX — Enterprise PMO command center" },
      {
        property: "og:description",
        content:
          "Live executive cockpit, portfolio timeline, RAID, capacity heatmaps and financial control for enterprise PMOs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function LandingPending() {
  const cached = typeof window !== "undefined" ? readCachedLandingConfigForPaint() : null;
  const p = cached?.palette ?? DEFAULT_LANDING.palette;
  const theme = cached?.theme ?? "light";
  const bg = theme === "dark" ? p.navy : "#ffffff";
  return (
    <PageLoading
      label="Loading iProjectX…"
      style={{ background: bg }}
      className={theme === "dark" ? "text-white" : undefined}
    />
  );
}

const HEADING = { fontFamily: "'Sora', system-ui, sans-serif" as const };
const BODY = { fontFamily: "'Manrope', system-ui, sans-serif" as const };

const FAILURE_ICONS: Record<string, any> = {
  "Executives fly blind": EyeOff,
  "Budget discovered late": Wallet,
  "Stage gates skipped": Ban,
  "Resource double-booking": Users,
  "RAID rots in spreadsheets": ClipboardX,
  "Benefits never tracked": TimerReset,
};
const WIN_ICONS: Record<string, any> = {
  "Live executive cockpit": Activity,
  "Financial early warning": Gauge,
  "Auditable stage gates": ShieldCheck,
  "Capacity heatmaps": Layers,
  "RAID tied to delivery": BadgeCheck,
  "Benefits realisation": LineChart,
};
const CAP_ICONS: Record<string, any> = {
  "Executive Cockpit": Activity,
  "Portfolio Timeline": Calendar,
  Financials: LineChart,
  "Stage-Gate Governance": ShieldCheck,
  "Resource Capacity": Users,
  Dependencies: GitBranch,
  "Agile + Waterfall": Layers,
  "Roadmap Analytics": Gauge,
  "Roles & Permissions": Lock,
  "White-label & Themes": Palette,
  "Excel-Native": FileSpreadsheet,
  "Benefits Realisation": BadgeCheck,
};

const NAV_LINKS = [
  ["#cockpit", "Cockpit"],
  ["#timeline", "Timeline"],
  ["#raid", "Governance"],
  ["#capabilities", "Capabilities"],
] as const;

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
  // Use loader data only — never seed from localStorage (stale signup_enabled: true
  // was painting Get started, then removing it when live config said off).
  const { cfg } = Route.useLoaderData();
  const signupEnabled = cfg.signup_enabled === true;
  const [eoiOpen, setEoiOpen] = useState(false);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

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
  } as React.CSSProperties;

  return (
    <div
      className="w-full antialiased"
      data-theme={cfg.theme}
      style={{ ...cssVars, ...BODY, color: p.textBody, background: pageBg }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>
      <Nav cfg={cfg} signupEnabled={signupEnabled} onEoiClick={() => setEoiOpen(true)} />
      <main id="main">
        <Hero cfg={cfg} onEoiClick={() => setEoiOpen(true)} />
        {cfg.hero.alert && <InsightBar cfg={cfg} />}
        <TrustStrip />
        <TrustedBy cfg={cfg} sectionBg={sectionBg} />
        <CeoMessage cfg={cfg} sectionBg={sectionBg} />
        <FailureVsSuccess cfg={cfg} />
        <ExecutiveCockpitTour cfg={cfg} sectionBg={sectionBg} />
        <PortfolioTimelineTour cfg={cfg} />
        <RaidTour cfg={cfg} sectionBg={sectionBg} />
        <CapabilityBento cfg={cfg} />
        <Testimonials cfg={cfg} sectionBg={sectionBg} />
        <BoardStatements cfg={cfg} />
        <StatsStrip cfg={cfg} />
        <FinalCta cfg={cfg} onEoiClick={() => setEoiOpen(true)} />
      </main>
      <Footer cfg={cfg} />
      {eoiOpen && <EoiModal cfg={cfg} onClose={() => setEoiOpen(false)} />}
    </div>
  );
}

function CtaPrimary({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
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

function Nav({ cfg, signupEnabled, onEoiClick }: { cfg: LandingConfig; signupEnabled: boolean; onEoiClick?: () => void }) {
  const p = cfg.palette;
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
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
      className="sticky top-0 z-50 w-full border-b backdrop-blur-xl transition-[background,box-shadow] duration-300"
      style={{
        borderColor: scrolled ? p.surface : "transparent",
        background: navBg,
        boxShadow: scrolled ? "0 1px 0 rgba(15,27,61,0.06)" : "none",
      }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
        <Link to="/" className="relative z-10" onClick={() => setOpen(false)}>
          <BrandMark cfg={cfg} />
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-sm font-semibold tracking-tight transition-opacity hover:opacity-70"
              style={{ color: p.textMuted }}
            >
              {label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-4 md:flex">
          <Link
            to="/auth"
            className="text-sm font-semibold transition-opacity hover:opacity-70"
            style={{ color: p.textMuted }}
          >
            Sign in
          </Link>
          <button
            type="button"
            onClick={onEoiClick}
            style={{ ...HEADING, background: p.accent, color: p.textOnAccent }}
            className="rounded-md px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
          >
            Express Interest
          </button>
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
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 text-sm font-semibold"
                style={{ color: p.textHeading }}
              >
                {label}
              </a>
            ))}
          </div>
          <div
            className="mt-4 flex flex-col gap-2 border-t pt-4"
            style={{ borderColor: p.surface }}
          >
            <Link
              to="/auth"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-center text-sm font-semibold"
              style={{ color: p.textMuted }}
            >
              Sign in
            </Link>
            <button
              type="button"
              onClick={() => { setOpen(false); onEoiClick?.(); }}
              style={{ ...HEADING, background: p.accent, color: p.textOnAccent }}
              className="rounded-md px-3 py-3 text-center text-sm font-bold"
            >
              Express Interest
            </button>
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

      <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-16 pt-14 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-10 lg:pb-24 lg:pt-20">
        <div className="lg:col-span-5">
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
              className="text-[2.75rem] font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.35rem]"
              style={{ ...HEADING, color: p.textOnDark }}
            >
              {cfg.hero.title} <span style={{ color: p.accent }}>{cfg.hero.title_accent}</span>
            </h1>
            <p
              className="mt-6 max-w-lg text-base leading-relaxed sm:text-lg"
              style={{ color: p.textOnDark, opacity: 0.82 }}
            >
              {cfg.hero.subtitle}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <CtaPrimary onClick={onEoiClick}>{cfg.hero.primary_cta}</CtaPrimary>
              <CtaSecondary dark href="#capabilities">
                {cfg.hero.secondary_cta}
              </CtaSecondary>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-7">
          <Reveal delay={120}>
            <HeroDashboard cfg={cfg} />
          </Reveal>
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

function HeroDashboard({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        borderColor: "rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.danger }} />
          <span className="h-2 w-2 rounded-full" style={{ background: p.warning }} />
          <span className="h-2 w-2 rounded-full" style={{ background: p.success }} />
        </div>
        <div
          className="text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color: p.textOnDark, opacity: 0.45 }}
        >
          Portfolio timeline · Live
        </div>
      </div>
      <div className="p-4 sm:p-5" style={{ background: `${p.navy}cc` }}>
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniKpi p={p} label="Portfolio" value="$42.4M" delta="68% used" tone="ok" />
          <MiniKpi p={p} label="Gate pass" value="92%" delta="+4 pts QoQ" tone="ok" />
          <MiniKpi p={p} label="Capacity" value="114%" delta="Q3 crunch" tone="bad" />
          <MiniKpi p={p} label="Benefits" value="$14.2M" delta="run-rate" tone="mid" />
        </div>
        <div className="relative">
          <div
            className="mb-3 flex border-b pb-2"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          >
            <div className="w-28 shrink-0 sm:w-32" />
            <div
              className="flex w-full justify-between text-[10px] font-bold tracking-wider"
              style={{ color: p.textOnDark, opacity: 0.35 }}
            >
              {["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL"].map((m, i) => (
                <span key={m} style={i === 4 ? { color: p.accent, opacity: 1 } : undefined}>
                  {i === 4 ? "TODAY" : m}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-3.5">
            <TimelineRow
              p={p}
              name="ERP Migration"
              left="10%"
              width="60%"
              gateAt="right"
              gateColor={p.success}
              status="ON TRACK"
              statusColor={p.success}
            />
            <TimelineRow
              p={p}
              name="Cloud Native"
              left="20%"
              width="45%"
              gateAt="72%"
              gateColor={p.danger}
              status="BLOCKED"
              statusColor={p.danger}
            />
            <TimelineRow
              p={p}
              name="Data Lake 2.0"
              left="5%"
              width="80%"
              gateAt="45%"
              gateColor={p.surface}
              status="INITIATED"
              statusColor="rgba(255,255,255,0.4)"
            />
            <TimelineRow
              p={p}
              name="Customer Portal"
              left="30%"
              width="55%"
              gateAt="60%"
              gateColor={p.warning}
              status="AT RISK"
              statusColor={p.warning}
            />
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 w-px"
            style={{
              left: "calc(7.5rem + ((100% - 7.5rem) * 4 / 6))",
              background: p.accent,
              opacity: 0.7,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function MiniKpi({
  p,
  label,
  value,
  delta,
  tone,
}: {
  p: any;
  label: string;
  value: string;
  delta: string;
  tone: "ok" | "mid" | "bad";
}) {
  const tc = tone === "ok" ? p.success : tone === "bad" ? p.danger : p.warning;
  return (
    <div
      className="rounded-md border p-2.5"
      style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}
    >
      <div
        className="text-[9px] font-bold uppercase tracking-widest"
        style={{ color: p.textOnDark, opacity: 0.4 }}
      >
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold" style={{ ...HEADING, color: p.textOnDark }}>
        {value}
      </div>
      <div className="text-[10px] font-semibold" style={{ color: tc }}>
        {delta}
      </div>
    </div>
  );
}

function TimelineRow({ p, name, left, width, gateAt, gateColor, status, statusColor }: any) {
  return (
    <div className="flex items-center">
      <div
        className="w-28 truncate text-xs font-semibold sm:w-32"
        style={{ color: p.textOnDark, opacity: 0.7 }}
      >
        {name}
      </div>
      <div className="relative h-3 flex-1">
        <div
          className="absolute h-full rounded-sm border"
          style={{
            left,
            width,
            borderColor: `${p.accent}55`,
            background: p.navyLight,
          }}
        >
          <div
            className="absolute -top-1 h-5 w-0.5"
            style={{
              left: gateAt === "right" ? "auto" : gateAt,
              right: gateAt === "right" ? "-1px" : "auto",
              background: gateColor,
            }}
          />
        </div>
      </div>
      <div
        className="ml-3 w-[4.5rem] text-right text-[10px] font-bold tracking-wide"
        style={{ color: statusColor }}
      >
        {status}
      </div>
    </div>
  );
}

function TrustStrip() {
  const items = [
    { icon: Lock, label: "Multi-tenant RLS" },
    { icon: FileSpreadsheet, label: "Excel-native" },
    { icon: GitBranch, label: "Agile + Waterfall" },
    { icon: Palette, label: "White-label ready" },
  ];
  return (
    <section
      className="border-y"
      style={{
        background: "var(--lp-navy)",
        borderColor: "color-mix(in srgb, var(--lp-surface) 40%, transparent)",
      }}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-3.5 sm:px-6">
        {items.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--lp-textOnDark)", opacity: 0.72 }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: "var(--lp-accent)" }} />
            {label}
          </span>
        ))}
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
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
          {cfg.trusted.logos.map((l) => (
            <img
              key={l.name + l.logo_url}
              src={l.logo_url}
              alt={l.name}
              className="h-9 max-w-[130px] object-contain opacity-70 grayscale transition duration-300 hover:opacity-100 hover:grayscale-0"
            />
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
    <section className="border-b py-16 sm:py-20" style={{ borderColor: p.surface, background: sectionBg }}>
      <div className="mx-auto max-w-5xl px-5 sm:px-6">
        <Reveal>
          <div className="grid items-center gap-10 md:grid-cols-[minmax(0,200px)_1fr] md:gap-14">
            <div className="mx-auto md:mx-0">
              <div
                className="h-40 w-40 overflow-hidden rounded-2xl border shadow-sm sm:h-48 sm:w-48"
                style={{ borderColor: p.surface, background: p.surface }}
              >
                {m.photo_url ? (
                  <img src={m.photo_url} alt={m.name || "CEO"} className="h-full w-full object-cover" />
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
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ ...HEADING, color: p.textHeading }}>
                {m.title}
              </h2>
              <p className="mt-5 text-base leading-relaxed whitespace-pre-line sm:text-lg" style={{ color: p.textBody }}>
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
    <section className="border-b py-16 sm:py-24" style={{ borderColor: p.surface, background: sectionBg }}>
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <Reveal>
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ ...HEADING, color: p.textHeading }}>
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
                      <h3 className="text-lg font-semibold" style={{ ...HEADING, color: p.textHeading }}>
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
                <p className="flex-1 text-sm leading-relaxed whitespace-pre-line" style={{ color: p.textBody }}>
                  “{item.message}”
                </p>
                <div className="mt-6 flex items-center gap-3 border-t pt-4" style={{ borderColor: p.surface }}>
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
                      <div className="truncate text-sm font-semibold" style={{ color: p.textHeading }}>
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
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ ...HEADING, color: p.textOnDark }}>
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
      className="scroll-mt-20 overflow-hidden py-20 sm:py-28"
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
      className="scroll-mt-20 py-20 sm:py-28"
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
    <section id="raid" className="scroll-mt-20 py-20 sm:py-28" style={{ background: sectionBg }}>
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="grid gap-14 lg:grid-cols-12 lg:items-center lg:gap-16">
          <Reveal className="lg:col-span-5">
            <p
              className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: p.textMuted }}
            >
              {cfg.raid.eyebrow}
            </p>
            <h2
              className="text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ ...HEADING, color: p.textHeading }}
            >
              {cfg.raid.title}
            </h2>
            <p className="mt-5 text-lg leading-relaxed" style={{ color: p.textMuted }}>
              {cfg.raid.body}
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
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
          <Reveal className="lg:col-span-7" delay={80}>
            <div
              className="overflow-hidden rounded-xl border"
              style={{
                borderColor: p.surface,
                background: cfg.theme === "dark" ? p.navy : "#fff",
              }}
            >
              <div
                className="border-b px-5 py-3 text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{
                  borderColor: p.surface,
                  background: cfg.theme === "dark" ? `${p.navyLight}` : p.surface,
                  color: p.textMuted,
                }}
              >
                RAID register
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
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
                        <td className="py-3.5 pr-3" style={{ color: p.textHeading }}>
                          {r.title}
                        </td>
                        <td className="py-3.5 text-xs" style={{ color: p.textMuted }}>
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

function CapabilityBento({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  return (
    <section
      id="capabilities"
      className="scroll-mt-20 py-20 sm:py-28"
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
  return (
    <footer
      className="border-t"
      style={{
        borderColor: p.surface,
        background: cfg.theme === "dark" ? p.navy : "#ffffff",
      }}
    >
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <BrandMark cfg={cfg} size="sm" />
            <p className="mt-3 max-w-sm text-sm" style={{ color: p.textMuted }}>
              {cfg.brand.tagline || "Enterprise PMO Command Center"}
            </p>
            <p className="mt-2 text-xs" style={{ color: p.textMuted }}>
              {cfg.footer.text || `© ${new Date().getFullYear()} ${cfg.brand.name}`}
            </p>
          </div>
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-12">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: p.textMuted }}>
                Platform
              </p>
              <div className="flex flex-col gap-1.5 text-sm font-semibold" style={{ color: p.textMuted }}>
                <a href="#cockpit" className="transition-opacity hover:opacity-70">Cockpit</a>
                <a href="#timeline" className="transition-opacity hover:opacity-70">Timeline</a>
                <a href="#raid" className="transition-opacity hover:opacity-70">Governance</a>
                <a href="#capabilities" className="transition-opacity hover:opacity-70">Capabilities</a>
                <Link to="/auth" className="transition-opacity hover:opacity-70">Sign in</Link>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: p.textMuted }}>
                Legal
              </p>
              <div className="flex flex-col gap-1.5 text-sm font-semibold" style={{ color: p.textMuted }}>
                <Link to="/legal/privacy-policy" className="transition-opacity hover:opacity-70">Privacy Policy</Link>
                <Link to="/legal/terms-of-service" className="transition-opacity hover:opacity-70">Terms of Service</Link>
                <Link to="/legal/cookie-policy" className="transition-opacity hover:opacity-70">Cookie Policy</Link>
                <Link to="/legal/acceptable-use" className="transition-opacity hover:opacity-70">Acceptable Use</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ── EOI Modal ───────────────────────────────────────────── */

function EoiModal({ cfg, onClose }: { cfg: LandingConfig; onClose: () => void }) {
  const p = cfg.palette;
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    organization_name: "",
    phone: "",
    job_title: "",
    company_size: "",
    interest_areas: "",
    message: "",
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name || !form.email) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase as any)
        .from("eoi_requests")
        .insert({ ...form, source: "landing" });
      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      alert(err?.message ?? "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={handleBackdrop}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-xl shadow-2xl"
        style={{ background: cfg.theme === "dark" ? p.navyLight : "#ffffff" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md transition-opacity hover:opacity-60"
          style={{ color: p.textMuted }}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {submitted ? (
          <div className="flex flex-col items-center gap-4 px-8 py-12 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: `${p.success}18`, color: p.success }}
            >
              <Check className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold" style={{ ...HEADING, color: p.textHeading }}>
              Thank you for your interest!
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: p.textMuted }}>
              We have received your expression of interest and will be in touch shortly.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-md px-6 py-2.5 text-sm font-bold"
              style={{ background: p.accent, color: p.textOnAccent }}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="px-8 pb-8 pt-7">
              <h2 className="text-xl font-bold" style={{ ...HEADING, color: p.textHeading }}>
                Expression of Interest
              </h2>
              <p className="mt-1 text-sm" style={{ color: p.textMuted }}>
                Tell us about yourself and we will be in touch to discuss how iProjectX can help your PMO.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="eoi-name" style={{ color: p.textBody }}>
                    Full name <span style={{ color: p.danger }}>*</span>
                  </Label>
                  <Input
                    id="eoi-name"
                    required
                    value={form.full_name}
                    onChange={set("full_name")}
                    placeholder="Jane Smith"
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="eoi-email" style={{ color: p.textBody }}>
                    Work email <span style={{ color: p.danger }}>*</span>
                  </Label>
                  <Input
                    id="eoi-email"
                    type="email"
                    required
                    value={form.email}
                    onChange={set("email")}
                    placeholder="jane@company.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="eoi-org" style={{ color: p.textBody }}>Organization</Label>
                  <Input
                    id="eoi-org"
                    value={form.organization_name}
                    onChange={set("organization_name")}
                    placeholder="Acme Corp"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="eoi-title" style={{ color: p.textBody }}>Job title</Label>
                  <Input
                    id="eoi-title"
                    value={form.job_title}
                    onChange={set("job_title")}
                    placeholder="PMO Director"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="eoi-phone" style={{ color: p.textBody }}>Phone</Label>
                  <Input
                    id="eoi-phone"
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    placeholder="+1 555 000 0000"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="eoi-size" style={{ color: p.textBody }}>Company size</Label>
                  <select
                    id="eoi-size"
                    value={form.company_size}
                    onChange={set("company_size")}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select…</option>
                    <option value="1-50">1–50</option>
                    <option value="51-200">51–200</option>
                    <option value="201-1000">201–1,000</option>
                    <option value="1001-5000">1,001–5,000</option>
                    <option value="5000+">5,000+</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="eoi-interest" style={{ color: p.textBody }}>Areas of interest</Label>
                  <Input
                    id="eoi-interest"
                    value={form.interest_areas}
                    onChange={set("interest_areas")}
                    placeholder="e.g. Executive dashboards, RAID governance, Financials"
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="eoi-message" style={{ color: p.textBody }}>Message</Label>
                  <Textarea
                    id="eoi-message"
                    value={form.message}
                    onChange={set("message")}
                    placeholder="Tell us about your portfolio challenges and what you're looking for…"
                    rows={3}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-70"
                  style={{ color: p.textMuted }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-bold disabled:opacity-60"
                  style={{ background: p.accent, color: p.textOnAccent }}
                >
                  {submitting ? "Submitting…" : (
                    <><Send className="h-4 w-4" /> Submit</>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
