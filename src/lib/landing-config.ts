import { supabase } from "@/integrations/supabase/client";

export type LandingPalette = {
  navy: string;
  navyLight: string;
  accent: string;
  surface: string;
  danger: string;
  warning: string;
  success: string;
};

export type LandingItem = { title: string; desc: string; icon?: string };
export type LandingCap = { title: string; desc: string; icon?: string };
export type LandingStat = { value: number; suffix?: string; label: string };
export type LandingLogo = { name: string; logo_url: string };

export type LandingConfig = {
  brand: {
    name: string;
    logo_url: string;
    tagline: string;
  };
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
  final_cta: { title: string; body: string; primary: string; secondary: string };
  footer: { text: string };
};

export const DEFAULT_LANDING: LandingConfig = {
  brand: {
    name: "iProjectX",
    logo_url: "",
    tagline: "Enterprise PMO Command Center",
  },
  palette: {
    navy: "#0f1b3d",
    navyLight: "#1e3a5f",
    accent: "#3b6fa0",
    surface: "#e8edf3",
    danger: "#dc2626",
    warning: "#facc15",
    success: "#15803d",
  },
  hero: {
    eyebrow: "Enterprise PMO Command Center",
    title: "Master the",
    title_accent: "Portfolio",
    subtitle:
      "Stop flying blind. iProjectX is the single, immutable source of truth for enterprise PMOs — from executive cockpit KPIs to granular stage-gate governance across Agile and Waterfall.",
    primary_cta: "Request demo",
    secondary_cta: "See use cases",
    alert:
      "70% of transformation programs fail to deliver expected value without integrated portfolio governance.",
  },
  comparison: {
    heading: "What breaks without iProjectX. What holds together with it.",
    subtitle:
      "Every red flag below is a failure mode we see in enterprise portfolios that are still run on decks and spreadsheets. Every green marker is what a governed portfolio actually looks like.",
    failures: [
      { title: "Executives fly blind", desc: "Status decks are 2 weeks old by the time the board sees them." },
      { title: "Budget discovered late", desc: "Overruns surface only at year-end reconciliation — with no audit trail." },
      { title: "Stage gates skipped", desc: "Approvals rubber-stamped in email; no evidence, no accountability." },
      { title: "Resource double-booking", desc: "Critical talent silently booked across five programs at once." },
      { title: "RAID rots in spreadsheets", desc: "Risks, actions, issues, decisions decoupled from delivery reality." },
      { title: "Benefits never tracked", desc: "Post go-live value promised on the business case is never measured." },
    ],
    wins: [
      { title: "Live executive cockpit", desc: "Real-time portfolio KPIs with drill-down to task-level impediments." },
      { title: "Financial early warning", desc: "Automated variance alerts by phase, FY, program and business unit." },
      { title: "Auditable stage gates", desc: "Every approval, rejection and hold is logged with reviewer and date." },
      { title: "Capacity heatmaps", desc: "Flag conflicts 3 months before they become the reason for a slip." },
      { title: "RAID tied to delivery", desc: "Registers linked to projects, stage gates and status updates automatically." },
      { title: "Benefits realisation", desc: "Track promised vs actual benefits from business case through steady state." },
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
    chips: ["Auto-escalation", "Approver audit trail", "Forum & sponsor tagging", "Auto-status feed"],
  },
  capabilities: {
    heading: "Everything a modern PMO actually needs.",
    subtitle:
      "Twelve tightly-integrated modules that share the same data model — no exports, no sync jobs, no drift.",
    items: [
      { title: "Executive Cockpit", desc: "Portfolio KPIs, segmentation, health snapshots, budget & forecast by FY." },
      { title: "Portfolio Timeline", desc: "FY-aware Gantt, stage gates, TODAY line, planned vs actual, view-by dimensions." },
      { title: "Financials", desc: "Monthly cashflow, FY allocation, phase spend, CapEx/OpEx with variance alerts." },
      { title: "Stage-Gate Governance", desc: "Approvals, holds, rejections — configurable per organisation, fully audited." },
      { title: "Resource Capacity", desc: "Heatmaps, allocation, conflict detection across programs and business units." },
      { title: "Dependencies", desc: "Cross-project dependency graph with impact and needed-by dates." },
      { title: "Agile + Waterfall", desc: "Sprints, velocity, burndown alongside gates and milestones — one register." },
      { title: "Roadmap Analytics", desc: "Monte-Carlo confidence, portfolio scenarios and what-if modelling." },
      { title: "Roles & Permissions", desc: "Row-level security, page-level access matrix, admin console per organisation." },
      { title: "White-label & Themes", desc: "Per-org branding, logo, colors and configurable chart palette." },
      { title: "Excel-Native", desc: "Import/export a 14-sheet workbook with upsert on project code." },
      { title: "Benefits Realisation", desc: "Track promised vs delivered value from business case to steady state." },
    ],
  },
  stats: [
    { value: 16, label: "Core registers" },
    { value: 9, label: "Live dashboards" },
    { value: 100, suffix: "%", label: "Excel-native" },
    { value: 21, label: "Editable data tables" },
  ],
  trusted: { heading: "Trusted by enterprise PMOs", logos: [] },
  final_cta: {
    title: "Secure the portfolio outcome.",
    body: "Deploy iProjectX in weeks, not months. White-label ready, multi-tenant by design, and architected for the most complex enterprise PMOs — Agile, Waterfall, and everything in between.",
    primary: "Book enterprise review",
    secondary: "Sign in",
  },
  footer: { text: "" },
};

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
  return merged as LandingConfig;
}

export async function fetchLandingConfig(): Promise<LandingConfig> {
  const { data } = await supabase
    .from("landing_config" as any)
    .select("config")
    .eq("id", "singleton")
    .maybeSingle();
  return mergeConfig((data as any)?.config);
}

export async function saveLandingConfig(config: LandingConfig, userId?: string) {
  const { error } = await supabase
    .from("landing_config" as any)
    .upsert({ id: "singleton", config: config as any, updated_by: userId ?? null });
  if (error) throw error;
}
