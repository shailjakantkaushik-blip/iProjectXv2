import { supabase } from "@/integrations/supabase/client";
import {
  defaultNavigationConfig,
  mergeNavigationConfig,
  type NavigationConfig,
} from "@/lib/navigation-config";

export type { NavigationConfig };
export { defaultNavigationConfig };

export type LandingPalette = {
  navy: string;
  navyLight: string;
  accent: string;
  surface: string;
  danger: string;
  warning: string;
  success: string;
  /** Primary heading / brand text */
  textHeading: string;
  /** Body copy */
  textBody: string;
  /** Muted / secondary labels */
  textMuted: string;
  /** Text on dark (navy) backgrounds */
  textOnDark: string;
  /** Text on accent / CTA backgrounds */
  textOnAccent: string;
};

export type LandingThemeMode = "light" | "dark";

export type LandingItem = { title: string; desc: string; icon?: string };
export type LandingCap = { title: string; desc: string; icon?: string };
export type LandingStat = { value: number; suffix?: string; label: string };
export type LandingLogo = { name: string; logo_url: string };

/** Display size tokens for brand logos on each surface. */
export type LogoDisplaySize = "sm" | "md" | "lg" | "xl" | "custom";

export type LogoCustomDims = { heightPx: number; maxWidthPx: number };

export type BrandLogoSurface = "landing" | "auth" | "app";

export const DEFAULT_LOGO_CUSTOM: LogoCustomDims = { heightPx: 40, maxWidthPx: 200 };

export const LOGO_SIZE_OPTIONS: {
  value: LogoDisplaySize;
  label: string;
  heightPx: number;
  maxWidthPx: number;
}[] = [
  { value: "sm", label: "Small", heightPx: 24, maxWidthPx: 120 },
  { value: "md", label: "Medium", heightPx: 32, maxWidthPx: 160 },
  { value: "lg", label: "Large", heightPx: 40, maxWidthPx: 200 },
  { value: "xl", label: "Extra large", heightPx: 56, maxWidthPx: 280 },
  { value: "custom", label: "Custom", heightPx: 40, maxWidthPx: 200 },
];

export function normalizeLogoSize(v: unknown, fallback: LogoDisplaySize = "md"): LogoDisplaySize {
  if (v === "sm" || v === "md" || v === "lg" || v === "xl" || v === "custom") return v;
  return fallback;
}

export function clampLogoCustom(
  v: unknown,
  fallback: LogoCustomDims = DEFAULT_LOGO_CUSTOM,
): LogoCustomDims {
  const raw = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const heightPx =
    typeof raw.heightPx === "number" && Number.isFinite(raw.heightPx)
      ? raw.heightPx
      : fallback.heightPx;
  const maxWidthPx =
    typeof raw.maxWidthPx === "number" && Number.isFinite(raw.maxWidthPx)
      ? raw.maxWidthPx
      : fallback.maxWidthPx;
  return {
    heightPx: Math.min(160, Math.max(16, Math.round(heightPx))),
    maxWidthPx: Math.min(640, Math.max(40, Math.round(maxWidthPx))),
  };
}

export function logoSizeDims(
  size: LogoDisplaySize | undefined | null,
  custom?: LogoCustomDims | null,
): LogoCustomDims {
  const token = normalizeLogoSize(size);
  if (token === "custom") return clampLogoCustom(custom);
  const found = LOGO_SIZE_OPTIONS.find((o) => o.value === token) ?? LOGO_SIZE_OPTIONS[1];
  return { heightPx: found.heightPx, maxWidthPx: found.maxWidthPx };
}

/** Resolve the logo URL for a surface. Falls back to legacy `logo_url` only. */
export function resolveBrandLogoUrl(
  brand: Pick<
    LandingConfig["brand"],
    "logo_url" | "logo_url_landing" | "logo_url_auth" | "logo_url_app"
  >,
  surface: BrandLogoSurface,
): string {
  const specific =
    surface === "landing"
      ? brand.logo_url_landing
      : surface === "auth"
        ? brand.logo_url_auth
        : brand.logo_url_app;
  if (typeof specific === "string" && specific.trim()) return specific.trim();
  if (typeof brand.logo_url === "string" && brand.logo_url.trim()) return brand.logo_url.trim();
  return "";
}

/**
 * App shell logo resolution:
 * 1) Organisation white-label logo (Platform → Branding), when set
 * 2) iProjectX platform App shell logo from landing_config (`logo_url_app`,
 *    with legacy `logo_url` fallback inside resolveBrandLogoUrl)
 *
 * Does not substitute a static asset — if the platform has no App shell logo
 * configured, returns "" so the shell can render a neutral mark.
 */
export function resolveAppShellLogoUrl(opts: {
  orgLogoUrl?: string | null;
  brand?: Pick<
    LandingConfig["brand"],
    "logo_url" | "logo_url_landing" | "logo_url_auth" | "logo_url_app"
  > | null;
}): string {
  const org =
    typeof opts.orgLogoUrl === "string" && opts.orgLogoUrl.trim()
      ? opts.orgLogoUrl.trim()
      : "";
  if (org) return org;
  if (!opts.brand) return "";
  return resolveBrandLogoUrl(opts.brand, "app");
}

/** Packaged iProjectX mark (processing animation / favicon helpers). Not the app-shell fallback. */
export const DEFAULT_IPROJECTX_MARK = "/brand/iprojectx-mark.webp";

export function resolveBrandLogoDims(
  brand: LandingConfig["brand"],
  surface: BrandLogoSurface,
): LogoCustomDims {
  if (surface === "landing") {
    return logoSizeDims(brand.logo_size_landing, brand.logo_custom_landing);
  }
  if (surface === "auth") {
    return logoSizeDims(brand.logo_size_auth, brand.logo_custom_auth);
  }
  return logoSizeDims(brand.logo_size_app, brand.logo_custom_app);
}

/** Shared shape for testimonials and board statements. */
export type LandingPersonCard = {
  title: string;
  subtitle: string;
  message: string;
  photo_url: string;
  name?: string;
  role?: string;
};

export type LandingCeoMessage = {
  enabled: boolean;
  title: string;
  subtitle: string;
  message: string;
  name: string;
  role: string;
  photo_url: string;
};

export type LandingConfig = {
  brand: {
    name: string;
    /**
     * Legacy single logo (pre multi-surface). Kept for back-compat;
     * prefer `logo_url_landing` / `logo_url_auth` / `logo_url_app`.
     */
    logo_url: string;
    /** Public landing page brand mark */
    logo_url_landing: string;
    /** Sign-in / auth surfaces */
    logo_url_auth: string;
    /** Authenticated app shell (when no org white-label logo) */
    logo_url_app: string;
    tagline: string;
    /** Public landing nav / footer brand mark */
    logo_size_landing: LogoDisplaySize;
    logo_custom_landing: LogoCustomDims;
    /** Sign-in / auth brand panel */
    logo_size_auth: LogoDisplaySize;
    logo_custom_auth: LogoCustomDims;
    /** Authenticated app sidebar + mobile header */
    logo_size_app: LogoDisplaySize;
    logo_custom_app: LogoCustomDims;
  };
  /** Site-wide theme mode (light / dark). Palette colors still apply within the mode. */
  theme: LandingThemeMode;
  /** Apply light/dark + palette to login / auth pages */
  apply_theme_to_auth: boolean;
  /** Apply light/dark + palette to post-login app & platform pages */
  apply_theme_to_app: boolean;
  /**
   * When false, public self-service Sign up is hidden/blocked.
   * Platform admins can still create users from Organizations & Users.
   */
  signup_enabled: boolean;
  /**
   * When true, interactive animated cartoon guides appear in the app
   * (home banner + floating companion). Controlled from Platform Settings.
   */
  cartoons_enabled: boolean;
  /**
   * Selected interactive cartoon character (guide | tiger | astronaut | …).
   * Independent of style theme; edited from Platform Settings / Landing.
   */
  cartoon_id: string;
  /**
   * Platform default style theme (simple | standard | space | racing).
   * Orgs can override; users may override when org enables user choice.
   */
  style_theme_id: string;
  /**
   * Platform-wide sidebar sequence and visibility.
   * Edited from Platform Settings / Landing → Access & Cartoons.
   */
  navigation: NavigationConfig;
  /**
   * Platform default: which workspace pages show "Download page" (PDF/PPT/PNG).
   * Orgs can override via organizations.ui_config.page_download.
   */
  page_download: { pages?: Record<string, boolean> };
  /** Name of the last applied predefined palette, if any */
  palette_preset: string;
  palette: LandingPalette;
  hero: {
    eyebrow: string;
    title: string;
    title_accent: string;
    subtitle: string;
    /** Intelligence narrative shown under the CTA group (fills the hero text column gap). */
    after_cta?: string;
    primary_cta: string;
    secondary_cta: string;
    alert: string;
  };
  comparison: {
    heading: string;
    subtitle: string;
    failures: LandingItem[];
    wins: LandingItem[];
  };
  cockpit: { eyebrow: string; title: string; body: string; bullets: string[] };
  timeline: { eyebrow: string; title: string; body: string; bullets: string[] };
  raid: { eyebrow: string; title: string; body: string; chips: string[] };
  /** Trust & security product section (enterprise procurement / compliance). */
  security: { eyebrow: string; title: string; body: string; bullets: string[] };
  /** Compact trust labels under the hero (not cards — strip only). */
  trust_strip: { items: string[] };
  capabilities: { heading: string; subtitle: string; items: LandingCap[] };
  stats: LandingStat[];
  trusted: { heading: string; logos: LandingLogo[] };
  /** CEO / executive message band with photo. */
  ceo_message: LandingCeoMessage;
  /** Customer / leader testimonials. */
  testimonials: {
    enabled: boolean;
    title: string;
    subtitle: string;
    items: LandingPersonCard[];
  };
  /** iProjectX Board — important statements. */
  board_statements: {
    enabled: boolean;
    title: string;
    subtitle: string;
    items: LandingPersonCard[];
  };
  final_cta: { title: string; body: string; primary: string; secondary: string };
  footer: { text: string };
};

export const DEFAULT_PALETTE: LandingPalette = {
  navy: "#0f1b3d",
  navyLight: "#1e3a5f",
  accent: "#3b6fa0",
  surface: "#e8edf3",
  danger: "#dc2626",
  warning: "#facc15",
  success: "#15803d",
  textHeading: "#0f1b3d",
  textBody: "#1e3a5f",
  textMuted: "#64748b",
  textOnDark: "#ffffff",
  textOnAccent: "#ffffff",
};

/** Named predefined palettes (including light / dark presets). */
export type PalettePreset = {
  id: string;
  name: string;
  description: string;
  theme: LandingThemeMode;
  palette: LandingPalette;
};

/** Dark ink on light surfaces — elegant defaults. */
export const ELEGANT_DARK_INK = {
  textHeading: "#0f172a",
  textBody: "#334155",
  textMuted: "#64748b",
} as const;

/** Light ink on dark / accent surfaces — elegant defaults. */
export const ELEGANT_LIGHT_INK = {
  textOnDark: "#f8fafc",
  textOnAccent: "#ffffff",
} as const;

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: "iprojectx",
    name: "iProjectX Classic",
    description: "Default navy enterprise look",
    theme: "light",
    palette: { ...DEFAULT_PALETTE },
  },
  {
    id: "corporate-blue",
    name: "Corporate Blue",
    description: "IBM / consulting-style trust blue",
    theme: "light",
    palette: {
      navy: "#0b1f3a",
      navyLight: "#1a365d",
      accent: "#2563eb",
      surface: "#eef2f7",
      danger: "#dc2626",
      warning: "#d97706",
      success: "#15803d",
      textHeading: "#0b1f3a",
      textBody: "#1e293b",
      textMuted: "#64748b",
      textOnDark: "#f8fafc",
      textOnAccent: "#ffffff",
    },
  },
  {
    id: "finance-charcoal",
    name: "Finance Charcoal",
    description: "Banking / fintech charcoal & steel",
    theme: "light",
    palette: {
      navy: "#111827",
      navyLight: "#1f2937",
      accent: "#4b5563",
      surface: "#f3f4f6",
      danger: "#b91c1c",
      warning: "#b45309",
      success: "#047857",
      textHeading: "#111827",
      textBody: "#374151",
      textMuted: "#6b7280",
      textOnDark: "#f9fafb",
      textOnAccent: "#ffffff",
    },
  },
  {
    id: "swiss-minimal",
    name: "Swiss Minimal",
    description: "Clean monochrome with crisp black type",
    theme: "light",
    palette: {
      navy: "#171717",
      navyLight: "#404040",
      accent: "#262626",
      surface: "#f5f5f5",
      danger: "#dc2626",
      warning: "#ca8a04",
      success: "#16a34a",
      textHeading: "#171717",
      textBody: "#404040",
      textMuted: "#737373",
      textOnDark: "#fafafa",
      textOnAccent: "#fafafa",
    },
  },
  {
    id: "saas-sky",
    name: "SaaS Sky",
    description: "Modern product marketing blue",
    theme: "light",
    palette: {
      navy: "#0c4a6e",
      navyLight: "#0369a1",
      accent: "#0284c7",
      surface: "#f0f9ff",
      danger: "#e11d48",
      warning: "#ca8a04",
      success: "#059669",
      textHeading: "#0c4a6e",
      textBody: "#164e63",
      textMuted: "#64748b",
      textOnDark: "#f0f9ff",
      textOnAccent: "#ffffff",
    },
  },
  {
    id: "healthcare-teal",
    name: "Healthcare Teal",
    description: "Clinical / life-sciences teal",
    theme: "light",
    palette: {
      navy: "#134e4a",
      navyLight: "#0f766e",
      accent: "#0d9488",
      surface: "#f0fdfa",
      danger: "#dc2626",
      warning: "#d97706",
      success: "#047857",
      textHeading: "#134e4a",
      textBody: "#115e59",
      textMuted: "#64748b",
      textOnDark: "#f0fdfa",
      textOnAccent: "#ffffff",
    },
  },
  {
    id: "gov-indigo",
    name: "Government Indigo",
    description: "Public-sector formal indigo",
    theme: "light",
    palette: {
      navy: "#1e1b4b",
      navyLight: "#312e81",
      accent: "#4338ca",
      surface: "#eef2ff",
      danger: "#b91c1c",
      warning: "#b45309",
      success: "#15803d",
      textHeading: "#1e1b4b",
      textBody: "#312e81",
      textMuted: "#64748b",
      textOnDark: "#eef2ff",
      textOnAccent: "#ffffff",
    },
  },
  {
    id: "light-slate",
    name: "Light Slate",
    description: "Neutral slate with sky accent",
    theme: "light",
    palette: {
      navy: "#0f172a",
      navyLight: "#334155",
      accent: "#0ea5e9",
      surface: "#f1f5f9",
      danger: "#dc2626",
      warning: "#d97706",
      success: "#16a34a",
      textHeading: "#0f172a",
      textBody: "#334155",
      textMuted: "#64748b",
      textOnDark: "#f8fafc",
      textOnAccent: "#ffffff",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Cool teal / cyan palette",
    theme: "light",
    palette: {
      navy: "#0c4a6e",
      navyLight: "#075985",
      accent: "#0891b2",
      surface: "#e0f2fe",
      danger: "#e11d48",
      warning: "#ca8a04",
      success: "#059669",
      textHeading: "#0c4a6e",
      textBody: "#155e75",
      textMuted: "#64748b",
      textOnDark: "#ecfeff",
      textOnAccent: "#ffffff",
    },
  },
  {
    id: "forest",
    name: "Forest",
    description: "ESG / sustainability green",
    theme: "light",
    palette: {
      navy: "#14532d",
      navyLight: "#166534",
      accent: "#16a34a",
      surface: "#ecfdf5",
      danger: "#dc2626",
      warning: "#ca8a04",
      success: "#15803d",
      textHeading: "#14532d",
      textBody: "#166534",
      textMuted: "#6b7280",
      textOnDark: "#f0fdf4",
      textOnAccent: "#ffffff",
    },
  },
  {
    id: "midnight-executive",
    name: "Midnight Executive",
    description: "Boardroom dark with bright CTA text",
    theme: "dark",
    palette: {
      navy: "#020617",
      navyLight: "#0f172a",
      accent: "#38bdf8",
      surface: "#1e293b",
      danger: "#f87171",
      warning: "#fbbf24",
      success: "#4ade80",
      textHeading: "#f8fafc",
      textBody: "#cbd5e1",
      textMuted: "#94a3b8",
      textOnDark: "#f8fafc",
      textOnAccent: "#0f172a",
    },
  },
  {
    id: "dark-navy",
    name: "Dark Navy",
    description: "Dark theme with soft blue accents",
    theme: "dark",
    palette: {
      navy: "#0b1224",
      navyLight: "#1a2744",
      accent: "#60a5fa",
      surface: "#152038",
      danger: "#f87171",
      warning: "#fbbf24",
      success: "#4ade80",
      textHeading: "#f1f5f9",
      textBody: "#cbd5e1",
      textMuted: "#94a3b8",
      textOnDark: "#f8fafc",
      textOnAccent: "#0b1224",
    },
  },
  {
    id: "dark-graphite",
    name: "Dark Graphite",
    description: "Neutral dark theme with teal accent",
    theme: "dark",
    palette: {
      navy: "#111827",
      navyLight: "#1f2937",
      accent: "#2dd4bf",
      surface: "#1f2937",
      danger: "#f87171",
      warning: "#fbbf24",
      success: "#34d399",
      textHeading: "#f9fafb",
      textBody: "#d1d5db",
      textMuted: "#9ca3af",
      textOnDark: "#f9fafb",
      textOnAccent: "#042f2e",
    },
  },
  {
    id: "obsidian-gold",
    name: "Obsidian Gold",
    description: "Luxury dark with refined gold accent",
    theme: "dark",
    palette: {
      navy: "#0a0a0a",
      navyLight: "#171717",
      accent: "#d4a017",
      surface: "#262626",
      danger: "#f87171",
      warning: "#fbbf24",
      success: "#4ade80",
      textHeading: "#fafafa",
      textBody: "#d4d4d4",
      textMuted: "#a3a3a3",
      textOnDark: "#fafafa",
      textOnAccent: "#171717",
    },
  },
];

export const DEFAULT_LANDING: LandingConfig = {
  brand: {
    name: "iProjectX",
    logo_url: "",
    logo_url_landing: "",
    logo_url_auth: "",
    logo_url_app: "",
    tagline: "Portfolio Intelligence Platform",
    logo_size_landing: "md",
    logo_custom_landing: { ...DEFAULT_LOGO_CUSTOM },
    logo_size_auth: "lg",
    logo_custom_auth: { heightPx: 48, maxWidthPx: 220 },
    logo_size_app: "md",
    logo_custom_app: { ...DEFAULT_LOGO_CUSTOM },
  },
  theme: "light",
  apply_theme_to_auth: true,
  apply_theme_to_app: true,
  // Fail closed: never flash Sign up / Get started before live config confirms on.
  signup_enabled: false,
  cartoons_enabled: true,
  cartoon_id: "guide",
  style_theme_id: "simple",
  navigation: defaultNavigationConfig(),
  page_download: { pages: {} },
  palette_preset: "iprojectx",
  palette: { ...DEFAULT_PALETTE },
  hero: {
    eyebrow: "Portfolio Intelligence Platform",
    title: "Master the",
    title_accent: "Portfolio",
    subtitle:
      "Stop flying blind. One PMO command center for live portfolio KPIs, resource timesheets, stage-gate governance, optional SSO & BYOD, and Jira integrations — Agile and Waterfall on the same truth.",
    after_cta:
      "iProjectX is not a static portfolio register. It is an intelligence layer over delivery — calculated Project Health, Portfolio Pulse, executive what-ifs, explainable KPIs, and stage-gate governance — with enterprise security, white-label branding, optional SSO, and Bring-Your-Own-Database for tenant data residency.",
    primary_cta: "Expression of Interest",
    secondary_cta: "See capabilities",
    alert:
      "Registers record the past. iProjectX surfaces pressure early, explains forecast variance, and puts the next decision in front of leaders — before the board pack is late.",
  },
  comparison: {
    heading: "What a register cannot do. What portfolio intelligence does.",
    subtitle:
      "Every red flag below is what happens when portfolios are still run on decks, spreadsheets, and static registers. Every green marker is what happens when health is calculated, explained, and acted on.",
    failures: [
      {
        title: "Register theatre",
        desc: "RAG is typed by hand while schedule, FAC, and risks tell a different story.",
      },
      {
        title: "Executives fly blind",
        desc: "Status decks are weeks old by the time the board sees them — no pulse, no drivers.",
      },
      {
        title: "Budget discovered late",
        desc: "Overruns surface at year-end reconciliation — with no early warning or explain trail.",
      },
      {
        title: "Stage gates skipped",
        desc: "Approvals rubber-stamped in email; checklists optional, evidence nowhere.",
      },
      {
        title: "Resource double-booking",
        desc: "Critical talent silently booked across five programs at once.",
      },
      {
        title: "RAID rots in spreadsheets",
        desc: "Risks, actions, issues, decisions decoupled from delivery reality.",
      },
      {
        title: "Weak access control",
        desc: "Shared logins, no MFA, and flat permissions that blur tenant boundaries.",
      },
      {
        title: "AI that leaks portfolio data",
        desc: "Chatbots and copilots that ship sensitive PMO detail to third-party models.",
      },
    ],
    wins: [
      {
        title: "Calculated project health",
        desc: "Weighted score across schedule, financials, scope, delivery, resources, risk, dependencies, and benefits — not manual RAG entry.",
      },
      {
        title: "Portfolio Pulse",
        desc: "Event-driven portfolio health by area, with a week-over-week change digest leaders can act on.",
      },
      {
        title: "Explainable KPIs",
        desc: "Every material forecast and spend figure comes with drivers — FAC vs budget, monthly plan, schedule risk context.",
      },
      {
        title: "Executive intelligence",
        desc: "What-if delay cascades, capacity gaps, funding scenarios, and investment ranking on live portfolio data.",
      },
      {
        title: "Governed stage gates",
        desc: "Approvals with checklist evidence — every hold, reject, and pass is auditable.",
      },
      {
        title: "Hardened tenant security",
        desc: "MFA for every user, optional SSO, IP allowlists, row-level isolation, and admin audit evidence packs.",
      },
      {
        title: "White-label & BYOD",
        desc: "Your brand in the product shell; optional Bring-Your-Own-Database for tenant data residency.",
      },
      {
        title: "In-house AI by default",
        desc: "Portfolio Q&A stays inside your org session. An Approved Open AI model is available only if your organisation requests it.",
      },
    ],
  },
  cockpit: {
    eyebrow: "Intelligence core",
    title: "Executive intelligence — not a status slideshow",
    body: "A live vantage point for the board and PMO: Portfolio Pulse, calculated health, explainable financials, RAG heatmaps, stage-gate pass rate, benefits and capacity — all filterable, all drillable, all tied to the same truth.",
    bullets: [
      "Portfolio Pulse — area health and week-over-week change digest",
      "Project Health Engine with early warnings and reforecast actions",
      "Explain This on forecast, budget, and spend KPIs",
      "Segmentation by portfolio, program, sponsor, priority, status, and FY",
    ],
  },
  timeline: {
    eyebrow: "Portfolio timeline",
    title: "Every project. Every gate. One horizon.",
    body: "A financial-year-aware Gantt with stage-gate diamonds, a live TODAY line, planned vs actual bars, and slip badges the moment a project falls behind. View by portfolio, program, health, priority, sponsor or business unit.",
    bullets: [
      "Configurable stage gates with checklist governance",
      "Planned vs actual with variance in days",
      "Quick-shift dates without leaving the timeline",
    ],
  },
  raid: {
    eyebrow: "Governance & RAID",
    title: "Risks, Actions, Issues, Decisions — one governed spine.",
    body: "RAID isn't a spreadsheet. In iProjectX, every entry is tied to a project, a stage gate and a status update — with owners, forums, sponsors and approvers — feeding health, pulse, and executive decisions.",
    chips: [
      "Auto-escalation",
      "Approver audit trail",
      "Forum & sponsor tagging",
      "Auto-status feed",
    ],
  },
  security: {
    eyebrow: "Security · White-label · BYOD",
    title: "Protect the portfolio. Still deliver the intelligence.",
    body: "iProjectX is multi-tenant by design: mandatory authenticator MFA, optional SSO, optional IP-based organisation restriction, row-level isolation, hardened sessions, and admin audit trails — plus optional Bring-Your-Own-Database for tenant data residency and full white-label branding for your organisation. In-house AI answers from your live PMO data inside your organisation session by default; an Approved Open AI model is available only if an organisation requests it. Built for SOC 2 and ISO 27001 readiness — without overstating certification status.",
    bullets: [
      "MFA (TOTP authenticator) required for all users",
      "Optional per-organisation SSO (SAML) when provisioned",
      "Optional IP-based organisation restriction (allowlist / CIDR)",
      "Optional BYOD — tenant registers on your PostgREST-compatible DB",
      "White-label logos, colors, and themes per organisation",
      "Row-level security isolating every organisation’s data",
      "In-house AI by default — answers stay in your org session",
      "Approved Open AI model only if the organisation requests it",
      "Admin audit log + platform security events (login, logout, failures)",
      "One-click Excel evidence packs for auditors",
      "CSP, HSTS, and session storage with PKCE — not JWTs in localStorage",
      "Role-based access for org admins, PMs, and platform operators",
    ],
  },
  trust_strip: {
    items: [
      "MFA for every user",
      "Optional BYOD",
      "White-label ready",
      "Portfolio intelligence",
      "In-house AI",
      "Multi-tenant RLS",
    ],
  },
  capabilities: {
    heading: "Intelligence, governance, and control — on one truth.",
    subtitle:
      "Not a bolt-on dashboard over a register. Modules share the same data model — calculated health, finance, delivery, security, white-label, and private intelligence — with no sync jobs and no drift.",
    items: [
      {
        title: "Project Health Engine",
        desc: "Calculated health across eight dimensions with early warnings, 30-day outlook, and reforecast actions — not manual RAG.",
      },
      {
        title: "Portfolio Pulse",
        desc: "Event-driven portfolio health by area, with a week-over-week digest of what deteriorated, improved, or became overdue.",
      },
      {
        title: "Executive Intelligence",
        desc: "What-if delay cascades, capacity gaps, funding scenarios, dependency criticality, and investment ranking.",
      },
      {
        title: "Explainable KPIs",
        desc: "Plain-language drivers on forecast, spend, and budget — FAC vs approved funding, monthly plan, schedule context.",
      },
      {
        title: "Executive Cockpit",
        desc: "Live portfolio KPIs, segmentation, health snapshots, budget & forecast by FY.",
      },
      {
        title: "Portfolio Timeline",
        desc: "FY-aware Gantt, stage gates, TODAY line, planned vs actual, view-by dimensions.",
      },
      {
        title: "Financials",
        desc: "Monthly cashflow, FY allocation, phase spend, CapEx/OpEx with variance alerts and explain trails.",
      },
      {
        title: "Stage-Gate Governance",
        desc: "Approvals with required checklists — holds and rejections fully audited per organisation.",
      },
      {
        title: "Resource Capacity",
        desc: "Plan vs actual utilisation — allocation heatmaps plus approved timesheet actuals (billable project/work-item and non-billable).",
      },
      {
        title: "Resource Timesheets",
        desc: "Weekly timesheets with approval workflow, project/work-item booking, and non-billable capture that feeds capacity actuals.",
      },
      {
        title: "Integrations",
        desc: "Connect Jira (and extensible connectors) so external issues land in Demand Pipeline with encrypted API tokens.",
      },
      {
        title: "Dependencies",
        desc: "Cross-project dependency graph with impact, needed-by dates, and criticality for executive what-ifs.",
      },
      {
        title: "Agile + Waterfall",
        desc: "Sprints, velocity, burndown alongside gates and milestones — one governed delivery spine.",
      },
      {
        title: "Roadmap Analytics",
        desc: "Monte-Carlo confidence, portfolio scenarios and what-if modelling.",
      },
      {
        title: "Roles & Permissions",
        desc: "Org and platform roles, page access matrix, and project visibility controls.",
      },
      {
        title: "Enterprise Security",
        desc: "Mandatory TOTP MFA, optional SSO, IP allowlists, multi-tenant RLS, CSP/HSTS, and hardened browser sessions.",
      },
      {
        title: "Optional BYOD",
        desc: "Host tenant portfolio data on your PostgREST-compatible database; auth and control plane stay on iProjectX.",
      },
      {
        title: "Optional SSO",
        desc: "Per-organisation SAML SSO via white-label branding when your plan provisions it.",
      },
      {
        title: "In-house AI",
        desc: "Default local portfolio Q&A on live org data. Approved Open AI model only if your organisation requests it — never on by default.",
      },
      {
        title: "Audit & Evidence",
        desc: "Admin audit log, security events, and one-click Excel packs for auditors.",
      },
      {
        title: "White-label & Themes",
        desc: "Per-org branding, logo, colors, auth experience, and configurable chart palette.",
      },
      {
        title: "Excel-Native",
        desc: "Import/export workbooks with upsert on project code — parsers without known CVEs.",
      },
      {
        title: "Benefits Realisation",
        desc: "Track promised vs delivered value from business case to steady state — scored into project health.",
      },
    ],
  },
  stats: [
    { value: 8, label: "Health dimensions" },
    { value: 6, label: "Pulse areas" },
    { value: 100, suffix: "%", label: "MFA-enforced" },
    { value: 1, label: "Truth · Agile & Waterfall" },
  ],
  trusted: { heading: "Built for enterprise PMOs that need intelligence, not another register", logos: [] },
  ceo_message: {
    enabled: false,
    title: "A message from our CEO",
    subtitle: "Why enterprise PMOs choose iProjectX",
    message: "",
    name: "",
    role: "Chief Executive Officer",
    photo_url: "",
  },
  testimonials: {
    enabled: false,
    title: "What leaders say",
    subtitle: "Voices from portfolio executives and delivery leads",
    items: [],
  },
  board_statements: {
    enabled: false,
    title: "iProjectX Board",
    subtitle: "Important statements from the board",
    items: [],
  },
  final_cta: {
    title: "Turn the portfolio into an intelligence advantage.",
    body: "White-label ready. Multi-tenant and MFA-enforced. Optional SSO and BYOD for data residency. In-house AI by default — with an Approved Open AI model only when your organisation requests it. Deploy calculated health, Portfolio Pulse, explainable KPIs, and executive intelligence in weeks — not another spreadsheet register.",
    primary: "Expression of Interest",
    secondary: "Sign in",
  },
  footer: { text: "" },
};

/** Normalize legacy marketing CTA labels to Expression of Interest. */
function normalizeEoiCtaLabel(label: unknown, fallback: string): string {
  if (typeof label !== "string" || !label.trim()) return fallback;
  const t = label.trim();
  const lower = t.toLowerCase();
  if (
    lower.includes("demo") ||
    lower === "express interest" ||
    lower === "request a demo" ||
    lower === "request demo" ||
    lower === "book a demo" ||
    lower === "book demo"
  ) {
    return "Expression of Interest";
  }
  return t;
}

/** Brand / status color keys shown in the surface swatch editor. */
export const SURFACE_PALETTE_KEYS = [
  "navy",
  "navyLight",
  "accent",
  "surface",
  "danger",
  "warning",
  "success",
] as const satisfies ReadonlyArray<keyof LandingPalette>;

/** Dark fonts used on light / surface backgrounds. */
export const DARK_ON_LIGHT_FONT_KEYS = [
  "textHeading",
  "textBody",
  "textMuted",
] as const satisfies ReadonlyArray<keyof LandingPalette>;

/** Light fonts used on dark / accent backgrounds. */
export const LIGHT_ON_DARK_FONT_KEYS = [
  "textOnDark",
  "textOnAccent",
] as const satisfies ReadonlyArray<keyof LandingPalette>;

/** All font color keys (dark-on-light + light-on-dark). */
export const FONT_PALETTE_KEYS = [
  ...DARK_ON_LIGHT_FONT_KEYS,
  ...LIGHT_ON_DARK_FONT_KEYS,
] as const satisfies ReadonlyArray<keyof LandingPalette>;

export const PALETTE_KEY_LABELS: Record<keyof LandingPalette, string> = {
  navy: "Navy / dark surface",
  navyLight: "Navy light",
  accent: "Accent / CTA",
  surface: "Light surface",
  danger: "Danger",
  warning: "Warning",
  success: "Success",
  textHeading: "Heading (dark on light)",
  textBody: "Body (dark on light)",
  textMuted: "Muted (dark on light)",
  textOnDark: "Light text on dark",
  textOnAccent: "Light text on accent",
};

export const PALETTE_KEY_HINTS: Partial<Record<keyof LandingPalette, string>> = {
  textHeading: "Primary titles on white / light sections",
  textBody: "Paragraph copy on light backgrounds",
  textMuted: "Secondary labels, nav, captions",
  textOnDark: "Hero, navy bands, dark footers",
  textOnAccent: "Buttons and accent fills",
};

/** One-click elegant font contrast for the current theme. */
export function applyElegantFontContrast(cfg: LandingConfig): LandingConfig {
  if (cfg.theme === "dark") {
    return {
      ...cfg,
      palette_preset: "custom",
      palette: {
        ...cfg.palette,
        textHeading: "#f8fafc",
        textBody: "#cbd5e1",
        textMuted: "#94a3b8",
        textOnDark: "#f8fafc",
        textOnAccent: "#0f172a",
      },
    };
  }
  return {
    ...cfg,
    palette_preset: "custom",
    palette: {
      ...cfg.palette,
      ...ELEGANT_DARK_INK,
      ...ELEGANT_LIGHT_INK,
    },
  };
}

// Deep merge with defaults so partial saved configs still render fully.
export function mergeConfig(partial: any): LandingConfig {
  const merged: any = structuredClone(DEFAULT_LANDING);
  if (!partial || typeof partial !== "object") return merged;
  for (const k of Object.keys(DEFAULT_LANDING) as (keyof LandingConfig)[]) {
    const v = (partial as any)[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) merged[k] = v;
    else if (typeof v === "object") merged[k] = { ...merged[k], ...v };
    else merged[k] = v;
  }
  // Ensure every palette key exists even if an older config omitted font colors.
  merged.palette = { ...DEFAULT_PALETTE, ...(merged.palette ?? {}) };
  if (merged.theme !== "dark") merged.theme = "light";
  if (typeof merged.palette_preset !== "string") merged.palette_preset = "custom";
  if (typeof merged.apply_theme_to_auth !== "boolean") merged.apply_theme_to_auth = true;
  if (typeof merged.apply_theme_to_app !== "boolean") merged.apply_theme_to_app = true;
  // Fail closed — missing/legacy configs must not flash public signup on.
  if (typeof merged.signup_enabled !== "boolean") merged.signup_enabled = false;
  if (typeof merged.cartoons_enabled !== "boolean") merged.cartoons_enabled = true;
  if (typeof merged.cartoon_id !== "string" || !merged.cartoon_id.trim()) {
    merged.cartoon_id = "guide";
  }
  if (typeof merged.style_theme_id !== "string" || !merged.style_theme_id.trim()) {
    merged.style_theme_id = "simple";
  }
  merged.brand = {
    ...DEFAULT_LANDING.brand,
    ...(merged.brand ?? {}),
    logo_url: typeof merged.brand?.logo_url === "string" ? merged.brand.logo_url : "",
    logo_url_landing:
      typeof merged.brand?.logo_url_landing === "string"
        ? merged.brand.logo_url_landing
        : typeof merged.brand?.logo_url === "string"
          ? merged.brand.logo_url
          : "",
    logo_url_auth:
      typeof merged.brand?.logo_url_auth === "string"
        ? merged.brand.logo_url_auth
        : typeof merged.brand?.logo_url === "string"
          ? merged.brand.logo_url
          : "",
    logo_url_app:
      typeof merged.brand?.logo_url_app === "string"
        ? merged.brand.logo_url_app
        : typeof merged.brand?.logo_url === "string"
          ? merged.brand.logo_url
          : "",
    logo_size_landing: normalizeLogoSize(
      merged.brand?.logo_size_landing,
      DEFAULT_LANDING.brand.logo_size_landing,
    ),
    logo_size_auth: normalizeLogoSize(
      merged.brand?.logo_size_auth,
      DEFAULT_LANDING.brand.logo_size_auth,
    ),
    logo_size_app: normalizeLogoSize(
      merged.brand?.logo_size_app,
      DEFAULT_LANDING.brand.logo_size_app,
    ),
    logo_custom_landing: clampLogoCustom(
      merged.brand?.logo_custom_landing,
      DEFAULT_LANDING.brand.logo_custom_landing,
    ),
    logo_custom_auth: clampLogoCustom(
      merged.brand?.logo_custom_auth,
      DEFAULT_LANDING.brand.logo_custom_auth,
    ),
    logo_custom_app: clampLogoCustom(
      merged.brand?.logo_custom_app,
      DEFAULT_LANDING.brand.logo_custom_app,
    ),
  };
  merged.navigation = mergeNavigationConfig(merged.navigation);
  if (!merged.page_download || typeof merged.page_download !== "object") {
    merged.page_download = { pages: {} };
  } else if (
    !merged.page_download.pages ||
    typeof merged.page_download.pages !== "object"
  ) {
    merged.page_download = { pages: {} };
  }
  // Nested section arrays must come from saved config when present
  if (partial.testimonials && typeof partial.testimonials === "object") {
    merged.testimonials = {
      ...merged.testimonials,
      ...partial.testimonials,
      items: Array.isArray(partial.testimonials.items)
        ? partial.testimonials.items
        : merged.testimonials.items,
    };
  }
  if (partial.board_statements && typeof partial.board_statements === "object") {
    merged.board_statements = {
      ...merged.board_statements,
      ...partial.board_statements,
      items: Array.isArray(partial.board_statements.items)
        ? partial.board_statements.items
        : merged.board_statements.items,
    };
  }
  if (partial.ceo_message && typeof partial.ceo_message === "object") {
    merged.ceo_message = { ...merged.ceo_message, ...partial.ceo_message };
  }
  if (typeof merged.ceo_message?.enabled !== "boolean") merged.ceo_message.enabled = false;
  if (typeof merged.testimonials?.enabled !== "boolean") merged.testimonials.enabled = false;
  if (typeof merged.board_statements?.enabled !== "boolean") {
    merged.board_statements.enabled = false;
  }

  // Security / trust defaults for older saved landing configs
  merged.security = {
    ...DEFAULT_LANDING.security,
    ...(partial.security && typeof partial.security === "object" ? partial.security : {}),
  };
  // Rewrite absolute "never external AI" claims after Approved Open AI model opt-in shipped.
  if (
    typeof merged.security.body === "string" &&
    (/without shipping|no portfolio data sent to chatgpt|no external model/i.test(
      merged.security.body,
    ) ||
      (!/BYOD|bring.?your.?own/i.test(merged.security.body) &&
        !/optional SSO|optional.*SSO/i.test(merged.security.body)) ||
      !/IP-based|IP allowlist|CIDR/i.test(merged.security.body))
  ) {
    // Prefer current defaults when body is stale (missing SSO/BYOD/IP or old AI claims).
    if (
      /without shipping|no portfolio data sent to chatgpt|no external model/i.test(
        merged.security.body,
      ) ||
      !/BYOD|bring.?your.?own/i.test(merged.security.body) ||
      !/IP-based|IP allowlist|CIDR/i.test(merged.security.body)
    ) {
      merged.security.body = DEFAULT_LANDING.security.body;
    }
  }
  if (!Array.isArray(merged.security.bullets) || merged.security.bullets.length === 0) {
    merged.security.bullets = [...DEFAULT_LANDING.security.bullets];
  } else {
    merged.security.bullets = (merged.security.bullets as string[]).map((b: string) => {
      const t = String(b);
      if (/no portfolio data sent to chatgpt|other external model providers/i.test(t)) {
        return "Approved Open AI model only if the organisation requests it";
      }
      if (
        /in-house ai[: ].*org session/i.test(t) &&
        !/by default/i.test(t) &&
        !/approved/i.test(t)
      ) {
        return "In-house AI by default — answers stay in your org session";
      }
      if (/^MFA \(authenticator\) required/i.test(t)) {
        return "MFA (TOTP authenticator) required for all users";
      }
      return t;
    });
    const haveBullet = merged.security.bullets.map((b: string) => String(b).toLowerCase());
    for (const b of DEFAULT_LANDING.security.bullets) {
      const key =
        /in-house ai|external (model|ai)|approved open ai|chatgpt/i.test(b)
          ? "ai"
          : /BYOD|bring.?your.?own/i.test(b)
            ? "byod"
            : /IP-based|IP allowlist|CIDR/i.test(b)
              ? "ip"
              : /SSO/i.test(b)
                ? "sso"
                : /TOTP|authenticator|MFA/i.test(b)
                  ? "mfa"
                  : null;
      if (!key) continue;
      const already = haveBullet.some((h: string) => {
        if (key === "ai") return /in-house ai|external (model|ai)|approved open ai|chatgpt/i.test(h);
        if (key === "byod") return /byod|bring.?your.?own/i.test(h);
        if (key === "ip") return /ip-based|ip allowlist|cidr/i.test(h);
        if (key === "sso") return /sso/i.test(h);
        return /totp|authenticator|mfa/i.test(h);
      });
      if (!already) {
        merged.security.bullets.push(b);
        haveBullet.push(b.toLowerCase());
      }
    }
  }
  merged.trust_strip = {
    ...DEFAULT_LANDING.trust_strip,
    ...(partial.trust_strip && typeof partial.trust_strip === "object" ? partial.trust_strip : {}),
  };
  if (!Array.isArray(merged.trust_strip.items) || merged.trust_strip.items.length === 0) {
    merged.trust_strip.items = [...DEFAULT_LANDING.trust_strip.items];
  } else {
    const items = [...merged.trust_strip.items] as string[];
    if (!items.some((i: string) => /in-house ai/i.test(i))) {
      items.unshift("In-house AI");
    }
    if (!items.some((i: string) => /SSO/i.test(i))) items.push("Optional SSO");
    if (!items.some((i: string) => /BYOD/i.test(i))) items.push("Optional BYOD");
    merged.trust_strip.items = items.slice(0, 6);
  }
  merged.capabilities = {
    ...DEFAULT_LANDING.capabilities,
    ...(partial.capabilities && typeof partial.capabilities === "object"
      ? partial.capabilities
      : {}),
  };
  if (!Array.isArray(merged.capabilities.items) || merged.capabilities.items.length === 0) {
    merged.capabilities.items = [...DEFAULT_LANDING.capabilities.items];
  } else {
    const have = new Set(merged.capabilities.items.map((i: LandingCap) => i.title));
    for (const cap of DEFAULT_LANDING.capabilities.items) {
      if (
        (cap.title === "Enterprise Security" ||
          cap.title === "Audit & Evidence" ||
          cap.title === "In-house AI" ||
          cap.title === "Optional BYOD" ||
          cap.title === "Optional SSO" ||
          cap.title === "Resource Timesheets" ||
          cap.title === "Integrations" ||
          cap.title === "Project Health Engine" ||
          cap.title === "Portfolio Pulse" ||
          cap.title === "Executive Intelligence" ||
          cap.title === "Explainable KPIs") &&
        !have.has(cap.title)
      ) {
        merged.capabilities.items.push(cap);
        have.add(cap.title);
      }
    }
    // Prefer current intelligence framing when saved heading still sounds like a plain PMO toolkit.
    if (
      typeof merged.capabilities.heading === "string" &&
      /everything a modern pmo/i.test(merged.capabilities.heading)
    ) {
      merged.capabilities.heading = DEFAULT_LANDING.capabilities.heading;
      merged.capabilities.subtitle = DEFAULT_LANDING.capabilities.subtitle;
    }
    const defaultInhouseAi = DEFAULT_LANDING.capabilities.items.find(
      (c) => c.title === "In-house AI",
    );
    const defaultEnterpriseSec = DEFAULT_LANDING.capabilities.items.find(
      (c) => c.title === "Enterprise Security",
    );
    const defaultResourceCap = DEFAULT_LANDING.capabilities.items.find(
      (c) => c.title === "Resource Capacity",
    );
    if (defaultInhouseAi || defaultEnterpriseSec || defaultResourceCap) {
      merged.capabilities.items = merged.capabilities.items.map((cap: LandingCap) => {
        if (
          defaultInhouseAi &&
          cap.title === "In-house AI" &&
          typeof cap.desc === "string" &&
          /without sending data to external|no external/i.test(cap.desc)
        ) {
          return { ...cap, desc: defaultInhouseAi.desc };
        }
        if (
          defaultEnterpriseSec &&
          cap.title === "Enterprise Security" &&
          typeof cap.desc === "string" &&
          !/SSO|TOTP/i.test(cap.desc)
        ) {
          return { ...cap, desc: defaultEnterpriseSec.desc };
        }
        if (
          defaultResourceCap &&
          cap.title === "Resource Capacity" &&
          typeof cap.desc === "string" &&
          !/timesheet|actual/i.test(cap.desc)
        ) {
          return { ...cap, desc: defaultResourceCap.desc };
        }
        return cap;
      });
    }
  }

  // Comparison wins + final CTA: refresh outdated absolute AI claims in saved configs.
  if (merged.comparison && typeof merged.comparison === "object") {
    const wins = Array.isArray(merged.comparison.wins) ? merged.comparison.wins : [];
    merged.comparison.wins = wins.map((w: { title?: string; desc?: string }) => {
      if (
        w?.title &&
        /in-house ai/i.test(w.title) &&
        typeof w.desc === "string" &&
        /no external model|no inference leak|without sending/i.test(w.desc)
      ) {
        const def = DEFAULT_LANDING.comparison.wins.find((d) =>
          /in-house ai/i.test(d.title),
        );
        return def ? { ...w, title: def.title, desc: def.desc } : w;
      }
      return w;
    });
    // Upgrade stale "register / command center" comparison framing to intelligence narrative.
    if (
      typeof merged.comparison.heading === "string" &&
      /what breaks without|holds together with it/i.test(merged.comparison.heading)
    ) {
      merged.comparison.heading = DEFAULT_LANDING.comparison.heading;
      merged.comparison.subtitle = DEFAULT_LANDING.comparison.subtitle;
      merged.comparison.failures = [...DEFAULT_LANDING.comparison.failures];
      merged.comparison.wins = [...DEFAULT_LANDING.comparison.wins];
    } else {
      const haveWin = new Set(
        (merged.comparison.wins as { title?: string }[]).map((w) => String(w?.title || "")),
      );
      for (const w of DEFAULT_LANDING.comparison.wins) {
        if (
          (/Project Health|Portfolio Pulse|Explainable KPI|Executive intelligence|White-label/i.test(
            w.title,
          ) ||
            /Calculated project health/i.test(w.title)) &&
          !haveWin.has(w.title)
        ) {
          (merged.comparison.wins as typeof DEFAULT_LANDING.comparison.wins).push(w);
          haveWin.add(w.title);
        }
      }
    }
  }
  if (
    merged.final_cta &&
    typeof merged.final_cta.body === "string" &&
    (/protects your data while still delivering|without sending data to external|secure the portfolio outcome/i.test(
      merged.final_cta.body + " " + (merged.final_cta.title || ""),
    ) ||
      !/intelligence|portfolio pulse|health|BYOD|white-?label/i.test(merged.final_cta.body))
  ) {
    merged.final_cta.title = DEFAULT_LANDING.final_cta.title;
    merged.final_cta.body = DEFAULT_LANDING.final_cta.body;
  }

  merged.hero = {
    ...merged.hero,
    primary_cta: normalizeEoiCtaLabel(
      merged.hero?.primary_cta,
      DEFAULT_LANDING.hero.primary_cta,
    ),
  };
  // Keep the classic "Master the Portfolio" opening; place intelligence copy under CTAs.
  if (
    typeof merged.hero?.title_accent === "string" &&
    /register/i.test(merged.hero.title_accent) &&
    /beyond the/i.test(String(merged.hero.title || ""))
  ) {
    merged.hero.title = DEFAULT_LANDING.hero.title;
    merged.hero.title_accent = DEFAULT_LANDING.hero.title_accent;
    merged.hero.subtitle = DEFAULT_LANDING.hero.subtitle;
  }
  if (
    typeof merged.hero?.subtitle === "string" &&
    /not a static portfolio register/i.test(merged.hero.subtitle)
  ) {
    // Migrate previous intelligence-as-subtitle into after_cta.
    if (!merged.hero.after_cta) merged.hero.after_cta = merged.hero.subtitle;
    merged.hero.subtitle = DEFAULT_LANDING.hero.subtitle;
    merged.hero.title = DEFAULT_LANDING.hero.title;
    merged.hero.title_accent = DEFAULT_LANDING.hero.title_accent;
  }
  if (!merged.hero.after_cta || !String(merged.hero.after_cta).trim()) {
    merged.hero.after_cta = DEFAULT_LANDING.hero.after_cta;
  }
  if (
    typeof merged.hero?.eyebrow === "string" &&
    /command center/i.test(merged.hero.eyebrow) &&
    !/intelligence/i.test(merged.hero.eyebrow)
  ) {
    merged.hero.eyebrow = DEFAULT_LANDING.hero.eyebrow;
  }
  if (
    typeof merged.hero?.secondary_cta === "string" &&
    /see use cases/i.test(merged.hero.secondary_cta)
  ) {
    merged.hero.secondary_cta = DEFAULT_LANDING.hero.secondary_cta;
  }
  if (
    typeof merged.brand?.tagline === "string" &&
    /command center/i.test(merged.brand.tagline)
  ) {
    merged.brand.tagline = DEFAULT_LANDING.brand.tagline;
  }
  if (
    merged.cockpit &&
    typeof merged.cockpit.title === "string" &&
    /^the executive cockpit$/i.test(merged.cockpit.title.trim())
  ) {
    merged.cockpit = { ...DEFAULT_LANDING.cockpit };
  }
  if (
    Array.isArray(merged.trust_strip?.items) &&
    !merged.trust_strip.items.some((i: string) => /intelligence|white-?label/i.test(i))
  ) {
    merged.trust_strip.items = [...DEFAULT_LANDING.trust_strip.items];
  }
  if (
    Array.isArray(merged.stats) &&
    merged.stats.some((s: { label?: string }) => /core registers/i.test(String(s?.label || "")))
  ) {
    merged.stats = [...DEFAULT_LANDING.stats];
  }
  merged.final_cta = {
    ...merged.final_cta,
    primary: normalizeEoiCtaLabel(
      merged.final_cta?.primary,
      DEFAULT_LANDING.final_cta.primary,
    ),
  };

  return merged as LandingConfig;
}

export function applyPalettePreset(cfg: LandingConfig, presetId: string): LandingConfig {
  const preset = PALETTE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return cfg;
  return {
    ...cfg,
    theme: preset.theme,
    palette_preset: preset.id,
    palette: { ...preset.palette },
  };
}

/** Browser cache so refresh paints the last known theme immediately (no navy flash). */
export const LANDING_CONFIG_CACHE_KEY = "pmo.landingConfig.v2";

export function readCachedLandingConfig(): LandingConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LANDING_CONFIG_CACHE_KEY);
    if (!raw) return null;
    return mergeConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Cache for first paint (pending + SSR-adjacent shells).
 * Keep palette, theme, and logos so reload never flashes DEFAULT_LANDING
 * branding. Only force signup off (avoids Get started button flash).
 */
export function readCachedLandingConfigForPaint(): LandingConfig | null {
  const cached = readCachedLandingConfig();
  if (!cached) return null;
  return {
    ...cached,
    signup_enabled: false,
  };
}

export function writeCachedLandingConfig(config: LandingConfig) {
  if (typeof window === "undefined") return;
  try {
    const next = JSON.stringify(config);
    const prev = window.localStorage.getItem(LANDING_CONFIG_CACHE_KEY);
    if (prev === next) return;
    window.localStorage.setItem(LANDING_CONFIG_CACHE_KEY, next);
    // Drop pre-v2 cache that could still paint stale logos.
    window.localStorage.removeItem("pmo.landingConfig.v1");
  } catch {
    /* quota / private mode */
  }
}

/** In-flight + short memory cache — avoids duplicate Supabase hits across root/auth/shell. */
let landingConfigInflight: Promise<LandingConfig> | null = null;
let landingConfigMemory: { cfg: LandingConfig; at: number } | null = null;
const LANDING_CONFIG_MEMORY_TTL_MS = 60_000;

export function invalidateLandingConfigMemory() {
  landingConfigMemory = null;
  landingConfigInflight = null;
}

/** In-memory config from a recent fetch (auth/landing), if still within TTL. */
export function peekLandingConfigMemory(): LandingConfig | null {
  if (!landingConfigMemory) return null;
  if (Date.now() - landingConfigMemory.at >= LANDING_CONFIG_MEMORY_TTL_MS) return null;
  return landingConfigMemory.cfg;
}

/**
 * Freshest client snapshot for paint: recent in-memory fetch, then localStorage.
 * Used so a stale TanStack loader snapshot cannot flash an older logo when
 * navigating back from /auth (or after Platform Landing saves).
 */
export function getFreshLandingConfigSnapshot(): LandingConfig | null {
  return peekLandingConfigMemory() ?? readCachedLandingConfig();
}

/**
 * Prefer the freshest client brand over a possibly stale route-loader cfg.
 * Keeps the loader's signup_enabled (cache-sourced loaders already force it off).
 */
export function resolveLandingCfgForPaint(loaderCfg: LandingConfig): LandingConfig {
  const mem = peekLandingConfigMemory();
  const fresh = mem ?? readCachedLandingConfig();
  if (!fresh) return loaderCfg;

  const freshLogo = resolveBrandLogoUrl(fresh.brand, "landing");
  const loaderLogo = resolveBrandLogoUrl(loaderCfg.brand, "landing");
  // No newer memory and logos agree → trust the loader entirely (incl. signup).
  if (!mem && freshLogo === loaderLogo) return loaderCfg;

  return {
    ...fresh,
    signup_enabled: loaderCfg.signup_enabled,
  };
}

export async function fetchLandingConfig(): Promise<LandingConfig> {
  const now = Date.now();
  if (landingConfigMemory && now - landingConfigMemory.at < LANDING_CONFIG_MEMORY_TTL_MS) {
    return landingConfigMemory.cfg;
  }
  if (landingConfigInflight) return landingConfigInflight;

  landingConfigInflight = (async () => {
    try {
      const { data } = await supabase
        .from("landing_config" as any)
        .select("config")
        .eq("id", "singleton")
        .maybeSingle();
      const cfg = mergeConfig((data as any)?.config);
      writeCachedLandingConfig(cfg);
      landingConfigMemory = { cfg, at: Date.now() };
      return cfg;
    } finally {
      landingConfigInflight = null;
    }
  })();

  return landingConfigInflight;
}

export async function saveLandingConfig(config: LandingConfig, userId?: string) {
  const { error } = await supabase
    .from("landing_config" as any)
    .upsert({ id: "singleton", config: config as any, updated_by: userId ?? null });
  if (error) throw error;
  invalidateLandingConfigMemory();
  writeCachedLandingConfig(config);
  landingConfigMemory = { cfg: config, at: Date.now() };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pmo:platform-theme-change", { detail: config }));
  }
}
