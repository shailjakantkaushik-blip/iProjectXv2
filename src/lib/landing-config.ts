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
  /** Name of the last applied predefined palette, if any */
  palette_preset: string;
  palette: LandingPalette;
  hero: {
    eyebrow: string;
    title: string;
    title_accent: string;
    subtitle: string;
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
    tagline: "Enterprise PMO Command Center",
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
  palette_preset: "iprojectx",
  palette: { ...DEFAULT_PALETTE },
  hero: {
    eyebrow: "Enterprise PMO Command Center",
    title: "Master the",
    title_accent: "Portfolio",
    subtitle:
      "Stop flying blind. iProjectX is the single, immutable source of truth for enterprise PMOs — from executive cockpit KPIs to granular stage-gate governance across Agile and Waterfall.",
    primary_cta: "Express Interest",
    secondary_cta: "See use cases",
    alert:
      "70% of transformation programs fail to deliver expected value without integrated portfolio governance.",
  },
  comparison: {
    heading: "What breaks without iProjectX. What holds together with it.",
    subtitle:
      "Every red flag below is a failure mode we see in enterprise portfolios that are still run on decks and spreadsheets. Every green marker is what a governed portfolio actually looks like.",
    failures: [
      {
        title: "Executives fly blind",
        desc: "Status decks are 2 weeks old by the time the board sees them.",
      },
      {
        title: "Budget discovered late",
        desc: "Overruns surface only at year-end reconciliation — with no audit trail.",
      },
      {
        title: "Stage gates skipped",
        desc: "Approvals rubber-stamped in email; no evidence, no accountability.",
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
        title: "Benefits never tracked",
        desc: "Post go-live value promised on the business case is never measured.",
      },
    ],
    wins: [
      {
        title: "Live executive cockpit",
        desc: "Real-time portfolio KPIs with drill-down to task-level impediments.",
      },
      {
        title: "Financial early warning",
        desc: "Automated variance alerts by phase, FY, program and business unit.",
      },
      {
        title: "Auditable stage gates",
        desc: "Every approval, rejection and hold is logged with reviewer and date.",
      },
      {
        title: "Capacity heatmaps",
        desc: "Flag conflicts 3 months before they become the reason for a slip.",
      },
      {
        title: "RAID tied to delivery",
        desc: "Registers linked to projects, stage gates and status updates automatically.",
      },
      {
        title: "Benefits realisation",
        desc: "Track promised vs actual benefits from business case through steady state.",
      },
    ],
  },
  cockpit: {
    eyebrow: "Governance core",
    title: "The Executive Cockpit",
    body: "A high-fidelity vantage point built for the board. Portfolio KPIs, RAG heatmaps, financial burn, stage-gate pass rate, benefits and capacity — all live, all drillable.",
    bullets: [
      "Interactive RAG status heatmap across projects and programs",
      "Financial vs strategic value plotting for prioritisation",
      "One-click drill-down into any risk, action or decision",
      "Segmentation by portfolio, program, sponsor, theme or BU",
    ],
  },
  timeline: {
    eyebrow: "Portfolio timeline",
    title: "Every project. Every gate. One horizon.",
    body: "A financial-year-aware Gantt with stage-gate diamonds, a live TODAY line, planned vs actual bars, and slip badges the moment a project falls behind. View by portfolio, program, health, priority, sponsor or business unit.",
    bullets: [
      "Configurable stage gates per organisation",
      "Planned vs actual with variance in days",
      "Quick-shift dates without leaving the timeline",
    ],
  },
  raid: {
    eyebrow: "Governance & RAID",
    title: "Risks, Actions, Issues, Decisions — one governed spine.",
    body: "RAID isn't a spreadsheet. In iProjectX, every entry is tied to a project, a stage gate and a status update — with owners, forums, sponsors and approvers.",
    chips: [
      "Auto-escalation",
      "Approver audit trail",
      "Forum & sponsor tagging",
      "Auto-status feed",
    ],
  },
  capabilities: {
    heading: "Everything a modern PMO actually needs.",
    subtitle:
      "Twelve tightly-integrated modules that share the same data model — no exports, no sync jobs, no drift.",
    items: [
      {
        title: "Executive Cockpit",
        desc: "Portfolio KPIs, segmentation, health snapshots, budget & forecast by FY.",
      },
      {
        title: "Portfolio Timeline",
        desc: "FY-aware Gantt, stage gates, TODAY line, planned vs actual, view-by dimensions.",
      },
      {
        title: "Financials",
        desc: "Monthly cashflow, FY allocation, phase spend, CapEx/OpEx with variance alerts.",
      },
      {
        title: "Stage-Gate Governance",
        desc: "Approvals, holds, rejections — configurable per organisation, fully audited.",
      },
      {
        title: "Resource Capacity",
        desc: "Heatmaps, allocation, conflict detection across programs and business units.",
      },
      {
        title: "Dependencies",
        desc: "Cross-project dependency graph with impact and needed-by dates.",
      },
      {
        title: "Agile + Waterfall",
        desc: "Sprints, velocity, burndown alongside gates and milestones — one register.",
      },
      {
        title: "Roadmap Analytics",
        desc: "Monte-Carlo confidence, portfolio scenarios and what-if modelling.",
      },
      {
        title: "Roles & Permissions",
        desc: "Row-level security, page-level access matrix, admin console per organisation.",
      },
      {
        title: "White-label & Themes",
        desc: "Per-org branding, logo, colors and configurable chart palette.",
      },
      {
        title: "Excel-Native",
        desc: "Import/export a 14-sheet workbook with upsert on project code.",
      },
      {
        title: "Benefits Realisation",
        desc: "Track promised vs delivered value from business case to steady state.",
      },
    ],
  },
  stats: [
    { value: 16, label: "Core registers" },
    { value: 9, label: "Live dashboards" },
    { value: 100, suffix: "%", label: "Excel-native" },
    { value: 21, label: "Editable data tables" },
  ],
  trusted: { heading: "Trusted by enterprise PMOs", logos: [] },
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
    title: "Secure the portfolio outcome.",
    body: "Deploy iProjectX in weeks, not months. White-label ready, multi-tenant by design, and architected for the most complex enterprise PMOs — Agile, Waterfall, and everything in between.",
    primary: "Express Interest",
    secondary: "Sign in",
  },
  footer: { text: "" },
};

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
 * Cache for theme paint only. Logos are stripped so a stale cached mark
 * never flashes before live config arrives (old logo → new logo blink).
 * Signup is also forced off for the same reason.
 */
export function readCachedLandingConfigForPaint(): LandingConfig | null {
  const cached = readCachedLandingConfig();
  if (!cached) return null;
  return {
    ...cached,
    signup_enabled: false,
    brand: {
      ...cached.brand,
      logo_url: "",
      logo_url_landing: "",
      logo_url_auth: "",
      logo_url_app: "",
    },
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
const LANDING_CONFIG_MEMORY_TTL_MS = 20_000;

export function invalidateLandingConfigMemory() {
  landingConfigMemory = null;
  landingConfigInflight = null;
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
