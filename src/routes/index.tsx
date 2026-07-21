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
  Sparkles,
  FileSpreadsheet,
  Lock,
  Palette,
  GitBranch,
  Calendar,
  Flag,
} from "lucide-react";
import {
  DEFAULT_LANDING,
  fetchLandingConfig,
  type LandingConfig,
  type LandingItem,
} from "@/lib/landing-config";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "iProjectX — Enterprise PMO command center for portfolios that must not fail" },
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

const HEADING = { fontFamily: "'Sora', system-ui, sans-serif" as const };
const BODY = { fontFamily: "'Manrope', system-ui, sans-serif" as const };

// map failure/win/capability titles → icons (with a safe fallback)
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

// ---------- utilities ----------
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
      { threshold: 0.15 },
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
        transform: shown ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 700ms ease ${delay}ms, transform 700ms cubic-bezier(.2,.7,.2,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function LandingPage() {
  const [cfg, setCfg] = useState<LandingConfig>(DEFAULT_LANDING);
  useEffect(() => {
    fetchLandingConfig()
      .then(setCfg)
      .catch(() => {});
  }, []);
  const p = cfg.palette;
  const isDark = cfg.theme === "dark";
  const pageBg = isDark ? p.navy : "#ffffff";

  // Expose palette as CSS custom properties so nested components can use var(--lp-*).
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
      <Nav cfg={cfg} />
      <Hero cfg={cfg} />
      <MarqueeStat />
      <TrustedBy cfg={cfg} />
      <FailureVsSuccess cfg={cfg} />
      <ExecutiveCockpitTour cfg={cfg} />
      <PortfolioTimelineTour cfg={cfg} />
      <RaidTour cfg={cfg} />
      <CapabilityBento cfg={cfg} />
      <StatsStrip cfg={cfg} />
      <FinalCta cfg={cfg} />
      <Footer cfg={cfg} />
    </div>
  );
}

function CtaGetStarted({ children }: { children: React.ReactNode }) {
  return (
    <Link
      to="/auth"
      style={{ ...HEADING, background: "var(--lp-accent)", color: "var(--lp-textOnAccent)" }}
      className="inline-flex items-center gap-2 rounded px-7 py-3.5 text-sm font-bold shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl active:translate-y-0"
    >
      {children} <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
function CtaSecondary({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <Link
      to="/auth"
      style={{
        ...HEADING,
        color: dark ? "var(--lp-textOnDark)" : "var(--lp-textHeading)",
        borderColor: dark
          ? "rgba(255,255,255,0.2)"
          : "color-mix(in srgb, var(--lp-navy) 15%, transparent)",
      }}
      className={
        "inline-flex items-center gap-2 rounded px-7 py-3.5 text-sm font-bold transition-all border " +
        (dark ? "hover:bg-white/10" : "hover:bg-[color:var(--lp-surface)]")
      }
    >
      {children}
    </Link>
  );
}

// ---------- nav ----------
function Nav({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  const navBg = cfg.theme === "dark" ? `${p.navy}d9` : "rgba(255,255,255,0.85)";
  return (
    <nav
      className="sticky top-0 z-50 w-full border-b backdrop-blur-md"
      style={{ borderColor: p.surface, background: navBg }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          {cfg.brand.logo_url ? (
            <img
              src={cfg.brand.logo_url}
              alt={cfg.brand.name}
              className="h-8 max-w-[160px] object-contain"
            />
          ) : (
            <>
              <div
                className="flex h-8 w-8 items-center justify-center rounded"
                style={{ background: p.navy }}
              >
                <div className="h-4 w-4 rotate-45 border-2" style={{ borderColor: p.accent }} />
              </div>
              <span
                className="text-xl font-bold tracking-tight"
                style={{ ...HEADING, color: p.textHeading }}
              >
                {cfg.brand.name}
              </span>
            </>
          )}
        </Link>
        <div className="hidden items-center gap-7 md:flex">
          {[
            ["#cockpit", "Executive Cockpit"],
            ["#timeline", "Portfolio Timeline"],
            ["#raid", "Governance"],
            ["#capabilities", "Capabilities"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-sm font-semibold hover:opacity-80"
              style={{ color: p.textMuted }}
            >
              {label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="text-sm font-semibold" style={{ color: p.textMuted }}>
            Sign in
          </Link>
          <Link
            to="/auth"
            style={{ ...HEADING, background: p.navy, color: p.textOnDark }}
            className="rounded px-5 py-2.5 text-sm font-bold shadow-lg transition-all hover:opacity-90 active:scale-95"
          >
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ---------- hero ----------
function Hero({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  return (
    <section
      className="relative overflow-hidden py-24"
      style={{ background: p.navy, color: p.textOnDark }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `radial-gradient(${p.accent} 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
          <div className="lg:col-span-5">
            <div
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: p.textOnDark, opacity: 0.85 }}
            >
              <Sparkles className="h-3.5 w-3.5" style={{ color: p.accent }} /> {cfg.hero.eyebrow}
            </div>
            <h1
              className="text-5xl font-bold leading-[1.05] tracking-tight lg:text-6xl"
              style={{ ...HEADING, color: p.textOnDark }}
            >
              {cfg.hero.title} <span style={{ color: p.accent }}>{cfg.hero.title_accent}</span>{" "}
              Horizon.
            </h1>
            <p
              className="mt-6 max-w-xl text-lg leading-relaxed"
              style={{ color: p.textOnDark, opacity: 0.85 }}
            >
              {cfg.hero.subtitle}
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <CtaGetStarted>{cfg.hero.primary_cta}</CtaGetStarted>
              <CtaSecondary dark>{cfg.hero.secondary_cta}</CtaSecondary>
            </div>
            {cfg.hero.alert && (
              <div
                className="mt-8 flex items-start gap-2 rounded-md px-4 py-3 text-sm text-white/90"
                style={{
                  borderWidth: 1,
                  borderColor: `${p.danger}40`,
                  background: `${p.danger}1a`,
                }}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: p.danger }} />
                <span>{cfg.hero.alert}</span>
              </div>
            )}
          </div>
          <div className="lg:col-span-7">
            <HeroDashboard cfg={cfg} />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroDashboard({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  return (
    <div
      className="rounded-xl border border-white/10 p-4 shadow-2xl backdrop-blur-sm"
      style={{ background: `${p.navyLight}66` }}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: p.danger }} />
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: p.warning }} />
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: p.success }} />
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/50">
          Portfolio Timeline · Executive View
        </div>
      </div>
      <div
        className="rounded-lg p-5 shadow-inner ring-1 ring-white/5"
        style={{ background: p.navy }}
      >
        <div className="mb-5 grid grid-cols-4 gap-2 text-white">
          <MiniKpi p={p} label="Portfolio" value="$42.4M" delta="68% used" tone="ok" />
          <MiniKpi p={p} label="Gate pass" value="92%" delta="+4 pts QoQ" tone="ok" />
          <MiniKpi p={p} label="Capacity" value="114%" delta="Q3 crunch" tone="bad" />
          <MiniKpi p={p} label="Benefits" value="$14.2M" delta="run-rate" tone="mid" />
        </div>
        <div className="relative">
          <div className="mb-3 flex border-b border-white/5 pb-2">
            <div className="w-32 shrink-0" />
            <div className="flex w-full justify-between text-[10px] font-bold tracking-wider text-white/30">
              {["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL"].map((m, i) => (
                <span key={m} style={i === 4 ? { color: p.accent } : undefined}>
                  {i === 4 ? "MAY · TODAY" : m}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-4">
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
              statusColor="rgba(255,255,255,0.35)"
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
            className="pointer-events-none absolute inset-y-0 left-[calc(128px+((100%-128px)*4/6))] w-px"
            style={{ background: `${p.accent}99`, boxShadow: `0 0 15px ${p.accent}` }}
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
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-2.5">
      <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-white" style={HEADING}>
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
    <div className="group flex items-center">
      <div className="w-32 truncate text-xs font-semibold text-white/70">{name}</div>
      <div className="relative h-3 flex-1">
        <div
          className="absolute h-full rounded-full border"
          style={{ left, width, borderColor: `${p.accent}66`, background: p.navyLight }}
        >
          <div
            className="absolute -top-1 h-5 w-1"
            style={{
              left: gateAt === "right" ? "auto" : gateAt,
              right: gateAt === "right" ? "-2px" : "auto",
              background: gateColor,
              boxShadow: `0 0 8px ${gateColor}`,
            }}
          />
        </div>
      </div>
      <div className="ml-4 w-20 text-right text-[10px] font-bold" style={{ color: statusColor }}>
        {status}
      </div>
    </div>
  );
}

function MarqueeStat() {
  return (
    <section
      className="border-y"
      style={{ background: "var(--lp-navy)", borderColor: "var(--lp-surface)" }}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-6 py-4 text-xs font-semibold uppercase tracking-widest text-white/70">
        <span className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5" style={{ color: "var(--lp-accent)" }} /> Multi-tenant ·
          Row-level security
        </span>
        <span className="flex items-center gap-2">
          <FileSpreadsheet className="h-3.5 w-3.5" style={{ color: "var(--lp-accent)" }} />{" "}
          Excel-native import & export
        </span>
        <span className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5" style={{ color: "var(--lp-accent)" }} /> Agile +
          Waterfall in one register
        </span>
        <span className="flex items-center gap-2">
          <Palette className="h-3.5 w-3.5" style={{ color: "var(--lp-accent)" }} /> White-label per
          organisation
        </span>
      </div>
    </section>
  );
}

// ---------- trusted by (client logos) ----------
function TrustedBy({ cfg }: { cfg: LandingConfig }) {
  if (!cfg.trusted?.logos?.length) return null;
  return (
    <section
      className="py-12 border-b"
      style={{
        borderColor: cfg.palette.surface,
        background: cfg.theme === "dark" ? cfg.palette.navyLight : "#ffffff",
      }}
    >
      <div className="mx-auto max-w-7xl px-6 text-center">
        <div
          className="mb-6 text-[11px] font-bold uppercase tracking-widest"
          style={{ color: cfg.palette.textMuted }}
        >
          {cfg.trusted.heading}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 opacity-80">
          {cfg.trusted.logos.map((l) => (
            <img
              key={l.name + l.logo_url}
              src={l.logo_url}
              alt={l.name}
              className="h-10 max-w-[140px] object-contain grayscale transition hover:grayscale-0"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- failure vs success ----------
function FailureVsSuccess({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  return (
    <section className="py-24" style={{ background: p.surface }}>
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="mb-14 text-center">
            <div
              className="mb-3 inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
              style={{ background: `${p.navy}0d`, color: p.textMuted }}
            >
              The critical transformation gap
            </div>
            <h2
              className="text-3xl font-bold lg:text-4xl"
              style={{ ...HEADING, color: p.textHeading }}
            >
              {cfg.comparison.heading}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl" style={{ color: `${p.navyLight}cc` }}>
              {cfg.comparison.subtitle}
            </p>
          </div>
        </Reveal>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
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
  const Badge = tone === "danger" ? AlertTriangle : BadgeCheck;
  return (
    <div>
      <div
        className="mb-6 inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-bold uppercase tracking-widest"
        style={{ background: `${c}1a`, color: c }}
      >
        <Badge className="h-3.5 w-3.5" /> {label} {`iProjectX`}
      </div>
      <div className="space-y-4">
        {items.map((f, i) => {
          const Icon = iconMap[f.title] || fallback;
          return (
            <Reveal key={f.title + i} delay={i * 60}>
              <div
                className="group flex gap-4 rounded-lg border p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                style={{
                  borderColor: `${c}26`,
                  background: tone === "danger" ? "rgba(255,255,255,0.7)" : "#fff",
                }}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded"
                  style={{ background: `${c}1a`, color: c }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold" style={{ ...HEADING, color: p.textHeading }}>
                    {f.title}
                  </div>
                  <div className="mt-1 text-sm" style={{ color: `${p.navyLight}bf` }}>
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

function ExecutiveCockpitTour({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  return (
    <section id="cockpit" className="overflow-hidden py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center gap-16 lg:flex-row">
          <Reveal className="lg:w-1/2">
            <div
              className="mb-6 inline-block rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest"
              style={{ background: `${p.accent}1a`, color: p.accent }}
            >
              {cfg.cockpit.eyebrow}
            </div>
            <h2
              className="text-4xl font-bold leading-tight"
              style={{ ...HEADING, color: p.textHeading }}
            >
              {cfg.cockpit.title}
            </h2>
            <p className="mt-6 text-lg leading-relaxed" style={{ color: `${p.navyLight}cc` }}>
              {cfg.cockpit.body}
            </p>
            <ul className="mt-8 space-y-3">
              {cfg.cockpit.bullets.map((t) => (
                <li
                  key={t}
                  className="flex items-start gap-3 text-[15px] font-medium"
                  style={{ color: p.textHeading }}
                >
                  <div
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: p.accent }}
                  />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="relative lg:w-1/2" delay={80}>
            <div
              className="absolute -inset-4 -rotate-2 rounded-3xl"
              style={{ background: p.surface }}
            />
            <div
              className="relative rounded-2xl border p-6 shadow-2xl"
              style={{ borderColor: p.surface, background: "#fff" }}
            >
              <div
                className="mb-4 text-xs font-bold uppercase tracking-widest"
                style={{ color: `${p.navyLight}99` }}
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
                <CockpitTile p={p} label="Say / Do ratio" value="0.92" bar={92} accent={p.accent} />
              </div>
              <div className="mt-5 grid grid-cols-8 gap-1">
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
                  <div key={i} className="h-7 rounded" style={{ background: c }} />
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
      className="rounded-lg border-l-4 p-3"
      style={{ borderLeftColor: accent, background: `${p.surface}80` }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: `${p.navyLight}99` }}
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
          <div className="h-full" style={{ width: `${bar}%`, background: accent }} />
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
    <section id="timeline" className="py-24" style={{ background: p.navy, color: p.textOnDark }}>
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <Reveal className="order-2 lg:order-1">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm shadow-2xl">
              <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: p.textOnDark, opacity: 0.5 }}>
                <Calendar className="h-3.5 w-3.5" style={{ color: p.accent }} /> Portfolio Gantt
              </div>
              <div className="space-y-3">
                {[
                  { n: "ERP Migration", left: 5, w: 55, gate: 40, ok: true },
                  { n: "Customer Portal", left: 15, w: 45, gate: 35, ok: false },
                  { n: "Data Lake 2.0", left: 10, w: 70, gate: 55, ok: true },
                  { n: "Zero-Trust Rollout", left: 25, w: 50, gate: 60, ok: true },
                  { n: "Field App v3", left: 40, w: 45, gate: 70, ok: false },
                ].map((r) => (
                  <div key={r.n} className="flex items-center gap-3 text-xs">
                    <div className="w-36 truncate text-white/70">{r.n}</div>
                    <div className="relative h-4 flex-1">
                      <div
                        className="absolute top-1/2 h-2 -translate-y-1/2 rounded"
                        style={{
                          left: `${r.left}%`,
                          width: `${r.w}%`,
                          background: r.ok ? p.accent : p.danger,
                        }}
                      />
                      <div
                        className="absolute -top-0.5 h-5 w-1"
                        style={{
                          left: `${r.left + r.gate * 0.6}%`,
                          background: r.ok ? p.success : p.warning,
                          boxShadow: `0 0 8px ${r.ok ? p.success : p.warning}`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal className="order-1 lg:order-2" delay={80}>
            <div
              className="mb-6 inline-block rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest"
              style={{ background: `${p.accent}26`, color: p.accent }}
            >
              {cfg.timeline.eyebrow}
            </div>
            <h2 className="text-4xl font-bold leading-tight" style={{ ...HEADING, color: p.textOnDark }}>
              {cfg.timeline.title}
            </h2>
            <p className="mt-6 text-lg leading-relaxed" style={{ color: p.textOnDark, opacity: 0.85 }}>
              {cfg.timeline.body}
            </p>
            <ul className="mt-8 space-y-3 text-[15px]" style={{ color: p.textOnDark, opacity: 0.92 }}>
              {cfg.timeline.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <Flag className="mt-0.5 h-4 w-4 shrink-0" style={{ color: p.accent }} /> {b}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function RaidTour({ cfg }: { cfg: LandingConfig }) {
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
    <section id="raid" className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-16 lg:grid-cols-12 lg:items-center">
          <Reveal className="lg:col-span-5">
            <div
              className="mb-6 inline-block rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest"
              style={{ background: `${p.navy}0d`, color: p.textMuted }}
            >
              {cfg.raid.eyebrow}
            </div>
            <h2 className="text-4xl font-bold" style={{ ...HEADING, color: p.textHeading }}>
              {cfg.raid.title}
            </h2>
            <p className="mt-6 text-lg leading-relaxed" style={{ color: `${p.navyLight}cc` }}>
              {cfg.raid.body}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {cfg.raid.chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border bg-white px-3 py-1 text-xs font-semibold"
                  style={{ borderColor: `${p.navy}1a`, color: p.textMuted }}
                >
                  {chip}
                </span>
              ))}
            </div>
          </Reveal>
          <Reveal className="lg:col-span-7" delay={80}>
            <div
              className="overflow-hidden rounded-xl border bg-white shadow-2xl"
              style={{ borderColor: p.surface }}
            >
              <div
                className="border-b px-5 py-3 text-xs font-bold uppercase tracking-widest"
                style={{ borderColor: p.surface, background: "#f8fafc", color: `${p.navyLight}b3` }}
              >
                RAID register
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-left text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: `${p.navyLight}80` }}
                  >
                    <th className="px-5 py-2">ID</th>
                    <th>Type</th>
                    <th>Title</th>
                    <th>Owner</th>
                    <th className="pr-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t" style={{ borderColor: p.surface }}>
                      <td className="px-5 py-3 font-mono text-xs" style={{ color: p.textMuted }}>
                        {r.id}
                      </td>
                      <td className="py-3 text-xs font-bold" style={{ color: p.textMuted }}>
                        {r.type}
                      </td>
                      <td className="py-3" style={{ color: p.textHeading }}>
                        {r.title}
                      </td>
                      <td className="py-3 text-xs" style={{ color: `${p.navyLight}b3` }}>
                        {r.owner}
                      </td>
                      <td className="pr-5 text-right">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                          style={{ background: r.tone + "22", color: r.tone }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: r.tone }}
                          />{" "}
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
    <section id="capabilities" className="py-24" style={{ background: p.surface }}>
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <div>
              <div
                className="mb-3 inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
                style={{ background: `${p.navy}0d`, color: p.textMuted }}
              >
                The full engine
              </div>
              <h2
                className="text-3xl font-bold lg:text-4xl"
                style={{ ...HEADING, color: p.textHeading }}
              >
                {cfg.capabilities.heading}
              </h2>
            </div>
            <p className="max-w-md" style={{ color: `${p.navyLight}cc` }}>
              {cfg.capabilities.subtitle}
            </p>
          </div>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cfg.capabilities.items.map((c, i) => {
            const Icon = CAP_ICONS[c.title] || Layers;
            return (
              <Reveal key={c.title + i} delay={(i % 4) * 60}>
                <div
                  className="group flex h-full flex-col rounded-xl border bg-white p-5 transition-all hover:-translate-y-1 hover:shadow-xl"
                  style={{ borderColor: `${p.navy}14` }}
                >
                  <div
                    className="mb-4 flex h-10 w-10 items-center justify-center rounded-md text-white transition-colors"
                    style={{ background: p.navy }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div
                    className="text-[15px] font-bold"
                    style={{ ...HEADING, color: p.textHeading }}
                  >
                    {c.title}
                  </div>
                  <div className="mt-1.5 text-sm" style={{ color: `${p.navyLight}bf` }}>
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
    <section className="border-y border-white/5 py-16 text-white" style={{ background: p.navy }}>
      <div
        className={`mx-auto grid max-w-7xl gap-8 px-6 ${cfg.stats.length >= 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2"}`}
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
      <div className="text-4xl font-bold" style={HEADING}>
        <span ref={ref}>{val}</span>
        {suffix ?? ""}
      </div>
      <div className="mt-2 text-xs font-bold uppercase tracking-widest" style={{ color: p.accent }}>
        {label}
      </div>
    </div>
  );
}

function FinalCta({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  return (
    <section
      className="py-28"
      style={{ background: cfg.theme === "dark" ? cfg.palette.navyLight : "#ffffff" }}
    >
      <div className="mx-auto max-w-4xl px-6 text-center">
        <Reveal>
          <h2
            className="text-4xl font-bold lg:text-5xl"
            style={{ ...HEADING, color: p.textHeading }}
          >
            {cfg.final_cta.title}
          </h2>
          <p
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed"
            style={{ color: p.textMuted }}
          >
            {cfg.final_cta.body}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CtaGetStarted>{cfg.final_cta.primary}</CtaGetStarted>
            <CtaSecondary>{cfg.final_cta.secondary}</CtaSecondary>
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
      style={{ borderColor: p.surface, background: cfg.theme === "dark" ? p.navy : "#ffffff" }}
    >
      <div
        className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm sm:flex-row"
        style={{ color: p.textMuted }}
      >
        <div className="flex items-center gap-2">
          {cfg.brand.logo_url ? (
            <img
              src={cfg.brand.logo_url}
              alt={cfg.brand.name}
              className="h-6 max-w-[120px] object-contain"
            />
          ) : (
            <>
              <div
                className="flex h-6 w-6 items-center justify-center rounded"
                style={{ background: p.navy }}
              >
                <div className="h-3 w-3 rotate-45 border-2" style={{ borderColor: p.accent }} />
              </div>
              <span className="font-bold" style={{ ...HEADING, color: p.textHeading }}>
                {cfg.brand.name}
              </span>
            </>
          )}
          <span>· {cfg.footer.text || `© ${new Date().getFullYear()}`}</span>
        </div>
        <div className="flex gap-6">
          <a href="#capabilities">Capabilities</a>
          <a href="#cockpit">Cockpit</a>
          <a href="#timeline">Timeline</a>
          <Link to="/auth">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}
