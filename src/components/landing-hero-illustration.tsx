import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  Ban,
  ClipboardX,
  Database,
  EyeOff,
  FileSpreadsheet,
  Gauge,
  Globe,
  KeyRound,
  Lock,
  Pause,
  Play,
  Shield,
  ShieldCheck,
  Sparkles,
  Unlock,
  Users,
  Wallet,
} from "lucide-react";
import type { LandingConfig, LandingPalette } from "@/lib/landing-config";

type Scene = {
  id: string;
  act: "problem" | "product" | "security";
  ms: number;
  kicker: string;
  title: string;
  body: string;
  Visual: (p: LandingPalette) => ReactNode;
};

const HEADING: CSSProperties = { fontFamily: "'Sora', system-ui, sans-serif" };

function Chip({
  p,
  children,
  tone = "muted",
}: {
  p: LandingPalette;
  children: ReactNode;
  tone?: "ok" | "bad" | "mid" | "muted" | "accent";
}) {
  const color =
    tone === "ok"
      ? p.success
      : tone === "bad"
        ? p.danger
        : tone === "mid"
          ? p.warning
          : tone === "accent"
            ? p.accent
            : p.textOnDark;
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {children}
    </span>
  );
}

function Panel({
  p,
  children,
  className = "",
}: {
  p: LandingPalette;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 sm:p-4 ${className}`}
      style={{
        borderColor: "rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.05)",
      }}
    >
      {children}
    </div>
  );
}

const SCENES: Scene[] = [
  {
    id: "blind",
    act: "problem",
    ms: 4800,
    kicker: "The real world",
    title: "Executives still fly blind",
    body: "Board packs are weeks late. RAG is typed by hand. Nobody can see pressure until it is already a crisis.",
    Visual: (p) => (
      <div className="lp-story-in grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
        <Panel p={p}>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider opacity-60">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Q3_status_FINAL_v14.xlsx
          </div>
          <div className="lp-story-shake space-y-2">
            {["ERP Migration", "Cloud Native", "Data Lake", "Customer Portal"].map((name, i) => (
              <div key={name} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{name}</span>
                <span style={{ color: i === 1 ? p.danger : p.warning }}>
                  {i === 1 ? "?" : "Green*"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] opacity-50">*typed last Thursday. Already stale.</p>
        </Panel>
        <Panel p={p} className="flex flex-col items-center justify-center gap-3 text-center">
          <EyeOff className="lp-story-float h-12 w-12" style={{ color: p.danger }} />
          <p className="text-sm font-semibold">No live pulse. No drivers. No next decision.</p>
        </Panel>
      </div>
    ),
  },
  {
    id: "money-gates",
    act: "problem",
    ms: 4800,
    kicker: "The real world",
    title: "Money, gates, and RAID rot in the dark",
    body: "Overruns appear at year-end. Stage gates live in email. Risks sit in a spreadsheet nobody owns.",
    Visual: (p) => (
      <div className="lp-story-in grid gap-3 sm:grid-cols-3">
        <Panel p={p}>
          <Wallet className="mb-2 h-5 w-5" style={{ color: p.danger }} />
          <p className="text-xs font-bold uppercase tracking-wider opacity-60">Budget</p>
          <p className="mt-1 text-lg font-bold" style={HEADING}>
            118%
          </p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <div className="h-full w-[118%] rounded-full" style={{ background: p.danger }} />
          </div>
          <p className="mt-2 text-[11px] opacity-60">Found at year-end recon</p>
        </Panel>
        <Panel p={p}>
          <Ban className="mb-2 h-5 w-5" style={{ color: p.warning }} />
          <p className="text-xs font-bold uppercase tracking-wider opacity-60">Stage gate</p>
          <p className="mt-1 text-sm font-semibold">Rubber-stamped in email</p>
          <p className="mt-2 text-[11px] opacity-60">No checklist. No evidence.</p>
        </Panel>
        <Panel p={p}>
          <ClipboardX className="mb-2 h-5 w-5" style={{ color: p.warning }} />
          <p className="text-xs font-bold uppercase tracking-wider opacity-60">RAID</p>
          <p className="mt-1 text-sm font-semibold">Decoupled from delivery</p>
          <p className="mt-2 text-[11px] opacity-60">Risks_register_old.xlsx</p>
        </Panel>
      </div>
    ),
  },
  {
    id: "access",
    act: "problem",
    ms: 4600,
    kicker: "The real world",
    title: "Weak access is a breach waiting to happen",
    body: "Shared logins. No MFA. Flat permissions. Vendors and operators can see the whole portfolio.",
    Visual: (p) => (
      <div className="lp-story-in grid gap-3 sm:grid-cols-2">
        <Panel p={p} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Unlock className="h-5 w-5" style={{ color: p.danger }} />
            <span className="text-sm font-bold">Open door</span>
          </div>
          {["Shared PMO password", "No authenticator", "Anyone can open Finance"].map((t) => (
            <div key={t} className="flex items-center gap-2 text-sm opacity-80">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.danger }} />
              {t}
            </div>
          ))}
        </Panel>
        <Panel p={p} className="flex flex-col items-center justify-center gap-2 text-center">
          <Users className="lp-story-pulse h-10 w-10" style={{ color: p.warning }} />
          <p className="text-sm font-semibold">114% booked · five programs · same people</p>
          <Chip p={p} tone="bad">
            No tenant wall
          </Chip>
        </Panel>
      </div>
    ),
  },
  {
    id: "arrive",
    act: "product",
    ms: 4200,
    kicker: "iProjectX",
    title: "One command center. Live truth.",
    body: "Not another register. An intelligence layer over delivery — health, pulse, money, gates, and RAID on the same spine.",
    Visual: (p) => (
      <div className="lp-story-in flex h-full flex-col items-center justify-center gap-4 py-4 text-center">
        <Sparkles className="lp-story-float h-12 w-12" style={{ color: p.accent }} />
        <p className="text-2xl font-bold tracking-tight sm:text-3xl" style={HEADING}>
          iProjectX
        </p>
        <p className="max-w-md text-sm opacity-80">
          Calculated Project Health · Portfolio Pulse · Executive Cockpit · Stage-gate governance
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Chip p={p} tone="accent">
            Agile + Waterfall
          </Chip>
          <Chip p={p} tone="ok">
            One data model
          </Chip>
          <Chip p={p} tone="accent">
            White-label
          </Chip>
        </div>
      </div>
    ),
  },
  {
    id: "health",
    act: "product",
    ms: 5000,
    kicker: "How iProjectX does it",
    title: "Health is calculated — not typed",
    body: "Schedule, financials, scope, delivery, resources, risk, dependencies, and benefits feed one score. Pulse tells leaders what changed this week.",
    Visual: (p) => (
      <div className="lp-story-in grid gap-3 sm:grid-cols-2">
        <Panel p={p} className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-60">
            Project Health
          </p>
          <p className="mt-2 text-5xl font-bold" style={{ ...HEADING, color: p.warning }}>
            72
          </p>
          <p className="mt-1 text-xs opacity-70">Weighted · eight dimensions</p>
          <div className="mt-4 grid grid-cols-4 gap-1.5 text-[10px]">
            {["Sched", "Fin", "Risk", "Res"].map((d, i) => (
              <div
                key={d}
                className="rounded-md py-1.5"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                <Gauge
                  className="mx-auto mb-0.5 h-3 w-3"
                  style={{ color: i === 2 ? p.danger : p.success }}
                />
                {d}
              </div>
            ))}
          </div>
        </Panel>
        <Panel p={p}>
          <div className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Activity className="h-4 w-4" style={{ color: p.accent }} /> Portfolio Pulse
          </div>
          {[
            ["Finance", "Amber", p.warning],
            ["Operations", "Improved", p.success],
            ["IT", "Overdue RAID", p.danger],
          ].map(([name, note, color]) => (
            <div key={String(name)} className="mb-2 flex items-center justify-between text-sm">
              <span>{name}</span>
              <span style={{ color: String(color) }}>{note}</span>
            </div>
          ))}
          <p className="mt-3 text-[11px] opacity-60">
            Week-over-week digest. Act before the board pack.
          </p>
        </Panel>
      </div>
    ),
  },
  {
    id: "govern",
    act: "product",
    ms: 5000,
    kicker: "How iProjectX does it",
    title: "Money, gates, and RAID on one spine",
    body: "Budget / Plan / Forecast / Demand / Actual. Stage gates with evidence. RAID tied to the project, the forum, and the next meeting.",
    Visual: (p) => (
      <div className="lp-story-in space-y-3">
        <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] font-bold uppercase tracking-wide">
          {["Budget", "Plan", "Forecast", "Demand", "Actual"].map((layer, i) => (
            <div
              key={layer}
              className="rounded-md py-2"
              style={{
                background: i === 2 ? `${p.accent}33` : "rgba(255,255,255,0.06)",
                color: i === 2 ? p.accent : undefined,
              }}
            >
              {layer}
            </div>
          ))}
        </div>
        <Panel p={p}>
          <div className="mb-2 flex justify-between text-[11px] font-bold uppercase tracking-wider opacity-60">
            <span>FY Gantt</span>
            <span style={{ color: p.accent }}>TODAY</span>
          </div>
          <div
            className="relative h-8 rounded-full"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div
              className="absolute top-1.5 h-5 rounded-full"
              style={{ left: "8%", width: "62%", background: `${p.success}99` }}
            />
            <div
              className="absolute top-0 h-8 w-0.5"
              style={{ left: "58%", background: p.accent }}
            />
            <div
              className="absolute -top-0.5 h-3 w-3 rotate-45"
              style={{ left: "72%", background: p.warning }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip p={p} tone="ok">
              Gate evidence
            </Chip>
            <Chip p={p} tone="mid">
              RAID linked
            </Chip>
            <Chip p={p} tone="accent">
              Cadence forums
            </Chip>
          </div>
        </Panel>
      </div>
    ),
  },
  {
    id: "mfa",
    act: "security",
    ms: 4600,
    kicker: "Security of data",
    title: "MFA for every user. No exceptions.",
    body: "Authenticator TOTP is mandatory. Privileged roles cannot skip it. Optional SSO when your organisation is ready.",
    Visual: (p) => (
      <div className="lp-story-in grid gap-3 sm:grid-cols-2">
        <Panel p={p} className="flex flex-col items-center justify-center gap-3 py-6">
          <KeyRound className="h-10 w-10" style={{ color: p.accent }} />
          <p className="text-sm font-bold">Authenticator app</p>
          <div className="flex gap-2">
            {["8", "4", "1", "9", "2", "0"].map((d, i) => (
              <span
                key={i}
                className="lp-story-pulse inline-flex h-9 w-7 items-center justify-center rounded-md text-sm font-bold"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  animationDelay: `${i * 80}ms`,
                }}
              >
                {d}
              </span>
            ))}
          </div>
          <Chip p={p} tone="ok">
            Required · cannot be turned off
          </Chip>
        </Panel>
        <Panel p={p}>
          <p className="text-xs font-bold uppercase tracking-wider opacity-60">Identity</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>Password + TOTP challenge</li>
            <li>Optional SAML SSO per organisation</li>
            <li>Session PKCE — not JWTs in localStorage</li>
            <li>Security events: login, logout, failures</li>
          </ul>
        </Panel>
      </div>
    ),
  },
  {
    id: "network",
    act: "security",
    ms: 4600,
    kicker: "Security of data",
    title: "IP Whitelisting — your network, your door",
    body: "Lock an organisation to approved offices, VPN egress, or CIDR ranges. Unknown networks never reach the workspace.",
    Visual: (p) => (
      <div className="lp-story-in grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
        <Panel p={p} className="flex flex-col items-center justify-center gap-3 py-5">
          <Globe className="lp-story-float h-12 w-12" style={{ color: p.accent }} />
          <p className="text-sm font-semibold">Organisation IP restriction</p>
        </Panel>
        <Panel p={p}>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider opacity-60">Allowlist</p>
          {(
            [
              ["203.0.113.0/24", "HQ + VPN", true],
              ["198.51.100.18", "Finance floor", true],
              ["185.199.108.0", "Blocked café Wi-Fi", false],
            ] as const
          ).map(([ip, note, ok]) => (
            <div key={ip} className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span className="font-mono text-[12px]">{ip}</span>
              <Chip p={p} tone={ok ? "ok" : "bad"}>
                {note}
              </Chip>
            </div>
          ))}
        </Panel>
      </div>
    ),
  },
  {
    id: "byod",
    act: "security",
    ms: 5200,
    kicker: "Security of data",
    title: "Bring Your Own Database",
    body: "Keep control-plane (users, billing, brand) on iProjectX. Put tenant registers — projects, RAID, financials — on your PostgREST-compatible database.",
    Visual: (p) => (
      <div className="lp-story-in grid gap-3 sm:grid-cols-2">
        <Panel p={p}>
          <p className="text-xs font-bold uppercase tracking-wider opacity-60">iProjectX plane</p>
          <ul className="mt-3 space-y-2 text-sm opacity-90">
            <li>Identity, MFA, SSO</li>
            <li>White-label & billing</li>
            <li>BYOD connection secrets</li>
          </ul>
        </Panel>
        <Panel p={p} className="relative">
          <Database
            className="absolute right-3 top-3 h-8 w-8 opacity-30"
            style={{ color: p.success }}
          />
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: p.success }}>
            Your database
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>Projects, streams, RAID</li>
            <li>Financials & forecast</li>
            <li>Stays in your residency boundary</li>
          </ul>
          <div className="mt-4">
            <Chip p={p} tone="ok">
              Optional · per organisation
            </Chip>
          </div>
        </Panel>
      </div>
    ),
  },
  {
    id: "rls",
    act: "security",
    ms: 5200,
    kicker: "Security of data",
    title: "Row-level walls. Platform ops stay out.",
    body: "Every organisation is isolated by RLS. Platform administrators operate billing and the directory — they are not granted tenant PMO data.",
    Visual: (p) => (
      <div className="lp-story-in space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-bold">
          {["Org A", "Org B", "Org C"].map((org) => (
            <Panel p={p} key={org}>
              <Lock className="mx-auto mb-1 h-4 w-4" style={{ color: p.success }} />
              {org}
            </Panel>
          ))}
        </div>
        <Panel p={p} className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">Platform admin</p>
            <p className="text-[12px] opacity-70">
              Licences, landing, EOI — not your RAID or forecast
            </p>
          </div>
          <Chip p={p} tone="bad">
            PMO denied
          </Chip>
        </Panel>
        <div className="flex flex-wrap gap-2">
          <Chip p={p} tone="ok">
            Org-admin access rules
          </Chip>
          <Chip p={p} tone="accent">
            In-house AI in-session
          </Chip>
          <Chip p={p} tone="ok">
            Audit evidence export
          </Chip>
        </div>
      </div>
    ),
  },
  {
    id: "close",
    act: "product",
    ms: 4800,
    kicker: "The outcome",
    title: "See pressure early. Keep the data yours.",
    body: "Leaders get a live cockpit. Delivery stays governed. Security is not a slide — MFA, IP Whitelisting, BYOD, and tenant isolation are in the product.",
    Visual: (p) => (
      <div className="lp-story-in flex h-full flex-col items-center justify-center gap-4 py-2 text-center">
        <ShieldCheck className="lp-story-float h-12 w-12" style={{ color: p.success }} />
        <p className="text-xl font-bold sm:text-2xl" style={HEADING}>
          Stop flying blind.
        </p>
        <p className="max-w-md text-sm opacity-80">
          Health, pulse, forecast, gates, RAID — and a security model built for real organisations.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Chip p={p} tone="ok">
            MFA
          </Chip>
          <Chip p={p} tone="ok">
            IP Whitelisting
          </Chip>
          <Chip p={p} tone="ok">
            BYOD
          </Chip>
          <Chip p={p} tone="ok">
            RLS
          </Chip>
        </div>
      </div>
    ),
  },
];

function formatClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function sceneStarts(): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const scene of SCENES) {
    starts.push(acc);
    acc += scene.ms;
  }
  return starts;
}

export function LandingHeroIllustration({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  const starts = useMemo(() => sceneStarts(), []);
  const totalMs = useMemo(() => SCENES.reduce((sum, s) => sum + s.ms, 0), []);
  const lastStart = starts[starts.length - 1] ?? 0;
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(true);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastTs = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reduced) {
      setElapsed(lastStart);
      setPlaying(false);
    }
  }, [reduced, lastStart]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => setInView(e.isIntersecting));
      },
      { threshold: 0.28 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !playing || !inView) {
      lastTs.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      const prev = lastTs.current ?? now;
      lastTs.current = now;
      setElapsed((e) => (e + (now - prev)) % totalMs);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, inView, reduced, totalMs]);

  let cursor = elapsed;
  let sceneIndex = 0;
  for (let i = 0; i < SCENES.length; i++) {
    if (cursor < SCENES[i].ms) {
      sceneIndex = i;
      break;
    }
    cursor -= SCENES[i].ms;
    sceneIndex = i;
  }
  const scene = SCENES[reduced ? SCENES.length - 1 : sceneIndex];
  const Visual = scene.Visual;
  const actLabel =
    scene.act === "problem" ? "Problem" : scene.act === "security" ? "Security" : "iProjectX";

  return (
    <div
      ref={rootRef}
      className="overflow-hidden"
      role="region"
      aria-label="iProjectX product illustration"
      style={{ background: "rgba(8, 14, 32, 0.72)" }}
    >
      <style>{`
        .lp-story-in { animation: lp-story-in 420ms ease both; }
        .lp-story-float { animation: lp-story-float 2.8s ease-in-out infinite; }
        .lp-story-pulse { animation: lp-story-pulse 1.6s ease-in-out infinite; }
        .lp-story-shake { animation: lp-story-shake 1.8s ease-in-out infinite; }
        @keyframes lp-story-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes lp-story-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-7px); }
        }
        @keyframes lp-story-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        @keyframes lp-story-shake {
          0%, 100% { transform: rotate(0deg); }
          30% { transform: rotate(-0.8deg); }
          60% { transform: rotate(0.8deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-story-in, .lp-story-float, .lp-story-pulse, .lp-story-shake { animation: none !important; }
        }
      `}</style>

      <div
        className="flex items-center justify-between gap-3 border-b px-3 py-2.5 sm:px-4"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.danger }} />
          <span className="h-2 w-2 rounded-full" style={{ background: p.warning }} />
          <span className="h-2 w-2 rounded-full" style={{ background: p.success }} />
        </div>
        <div
          className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color: p.textOnDark, opacity: 0.55 }}
        >
          iProjectX illustration · {actLabel}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider opacity-50">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: playing && inView && !reduced ? p.danger : "transparent" }}
          />
          {reduced ? "Still" : playing && inView ? "Live" : "Paused"}
        </div>
      </div>

      <div
        className="relative min-h-[280px] p-3 sm:min-h-[320px] sm:p-5"
        style={{ color: p.textOnDark }}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Chip
            p={p}
            tone={scene.act === "problem" ? "bad" : scene.act === "security" ? "ok" : "accent"}
          >
            {scene.kicker}
          </Chip>
          <Shield className="h-3.5 w-3.5 opacity-40" />
        </div>
        <h3 className="text-lg font-bold tracking-tight sm:text-xl" style={HEADING}>
          {scene.title}
        </h3>
        <p className="mt-1 mb-4 max-w-2xl text-sm opacity-75">{scene.body}</p>
        <div key={scene.id}>{Visual(p)}</div>
      </div>

      <div
        className="flex items-center gap-3 border-t px-3 py-2.5 sm:px-4"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: p.accent, color: p.textOnAccent }}
          aria-label={playing ? "Pause illustration" : "Play illustration"}
          onClick={() => setPlaying((v) => !v)}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <div className="flex min-w-0 flex-1 gap-1" role="group" aria-label="Story chapters">
          {SCENES.map((s, i) => {
            const start = starts[i] ?? 0;
            const local = Math.min(s.ms, Math.max(0, elapsed - start));
            const filled = reduced ? (i === SCENES.length - 1 ? 100 : 0) : (local / s.ms) * 100;
            return (
              <button
                key={s.id}
                type="button"
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
                style={{ background: "rgba(255,255,255,0.12)" }}
                aria-label={`${s.kicker}: ${s.title}`}
                aria-current={scene.id === s.id ? "true" : undefined}
                onClick={() => {
                  setElapsed(start + 40);
                  setPlaying(true);
                }}
              >
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${filled}%`, background: p.accent }}
                />
              </button>
            );
          })}
        </div>
        <span className="w-16 shrink-0 text-right text-[10px] font-bold tabular-nums opacity-55">
          {formatClock(elapsed)} / {formatClock(totalMs)}
        </span>
      </div>
    </div>
  );
}
