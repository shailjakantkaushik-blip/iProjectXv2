// Central chart theming system. All chart colors are driven by CSS variables
// on :root so they can be re-themed at runtime from the Configuration page
// without touching individual chart components.

export type ChartTokenKey =
  | "rag-green" | "rag-amber" | "rag-red"
  | "priority-critical" | "priority-high" | "priority-medium" | "priority-low"
  | "status-approved" | "status-review" | "status-pending" | "status-hold" | "status-rejected"
  | "status-healthy" | "status-at-risk" | "status-blocked"
  | "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5" | "chart-6" | "chart-7" | "chart-8";

export type ChartPalette = {
  id: string;
  name: string;
  description: string;
  tokens: Record<ChartTokenKey, string>;
};

const DEFAULT_TOKENS: Record<ChartTokenKey, string> = {
  "rag-green": "#22c55e", "rag-amber": "#f59e0b", "rag-red": "#ef4444",
  "priority-critical": "#ef4444", "priority-high": "#f59e0b", "priority-medium": "#eab308", "priority-low": "#22c55e",
  "status-approved": "#22c55e", "status-review": "#3b82f6", "status-pending": "#94a3b8", "status-hold": "#f59e0b", "status-rejected": "#ef4444",
  "status-healthy": "#16a34a", "status-at-risk": "#f59e0b", "status-blocked": "#dc2626",
  "chart-1": "#1d4ed8", "chart-2": "#15803d", "chart-3": "#f59e0b", "chart-4": "#8b5cf6",
  "chart-5": "#06b6d4", "chart-6": "#ec4899", "chart-7": "#0ea5e9", "chart-8": "#a3a3a3",
};

export const PALETTES: ChartPalette[] = [
  { id: "default", name: "Classic (default)", description: "Balanced blues, greens and warm accents", tokens: DEFAULT_TOKENS },
  {
    id: "ocean", name: "Ocean", description: "Cool blues and teals",
    tokens: {
      ...DEFAULT_TOKENS,
      "rag-green": "#0ea5e9", "rag-amber": "#f59e0b", "rag-red": "#e11d48",
      "priority-critical": "#e11d48", "priority-high": "#f97316", "priority-medium": "#eab308", "priority-low": "#14b8a6",
      "chart-1": "#0369a1", "chart-2": "#0891b2", "chart-3": "#14b8a6", "chart-4": "#6366f1",
      "chart-5": "#0ea5e9", "chart-6": "#a855f7", "chart-7": "#22d3ee", "chart-8": "#64748b",
    },
  },
  {
    id: "sunset", name: "Sunset", description: "Warm reds, oranges and purples",
    tokens: {
      ...DEFAULT_TOKENS,
      "rag-green": "#65a30d", "rag-amber": "#f97316", "rag-red": "#dc2626",
      "priority-critical": "#dc2626", "priority-high": "#f97316", "priority-medium": "#f59e0b", "priority-low": "#84cc16",
      "chart-1": "#dc2626", "chart-2": "#f97316", "chart-3": "#f59e0b", "chart-4": "#a855f7",
      "chart-5": "#ec4899", "chart-6": "#f43f5e", "chart-7": "#facc15", "chart-8": "#78716c",
    },
  },
  {
    id: "forest", name: "Forest", description: "Earthy greens and browns",
    tokens: {
      ...DEFAULT_TOKENS,
      "rag-green": "#16a34a", "rag-amber": "#ca8a04", "rag-red": "#b91c1c",
      "priority-critical": "#b91c1c", "priority-high": "#ca8a04", "priority-medium": "#a16207", "priority-low": "#15803d",
      "chart-1": "#15803d", "chart-2": "#65a30d", "chart-3": "#ca8a04", "chart-4": "#78350f",
      "chart-5": "#0f766e", "chart-6": "#7c2d12", "chart-7": "#a3a3a3", "chart-8": "#525252",
    },
  },
  {
    id: "vibrant", name: "Vibrant", description: "High-contrast, saturated colors",
    tokens: {
      ...DEFAULT_TOKENS,
      "rag-green": "#10b981", "rag-amber": "#f59e0b", "rag-red": "#ef4444",
      "chart-1": "#6366f1", "chart-2": "#10b981", "chart-3": "#f59e0b", "chart-4": "#ec4899",
      "chart-5": "#06b6d4", "chart-6": "#8b5cf6", "chart-7": "#f43f5e", "chart-8": "#84cc16",
    },
  },
  {
    id: "mono", name: "Monochrome Blue", description: "Colorblind-friendly, single-hue ramp",
    tokens: {
      ...DEFAULT_TOKENS,
      "rag-green": "#075985", "rag-amber": "#0ea5e9", "rag-red": "#e11d48",
      "priority-critical": "#e11d48", "priority-high": "#0369a1", "priority-medium": "#0ea5e9", "priority-low": "#7dd3fc",
      "chart-1": "#0c4a6e", "chart-2": "#0369a1", "chart-3": "#0284c7", "chart-4": "#0ea5e9",
      "chart-5": "#38bdf8", "chart-6": "#7dd3fc", "chart-7": "#bae6fd", "chart-8": "#64748b",
    },
  },
];

export const DEFAULT_PALETTE = PALETTES[0];
const STORAGE_KEY = "pmo.chartTheme.v1";

type StoredTheme = { paletteId: string; overrides?: Partial<Record<ChartTokenKey, string>> };

export function loadStoredTheme(): StoredTheme {
  if (typeof window === "undefined") return { paletteId: DEFAULT_PALETTE.id };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { paletteId: DEFAULT_PALETTE.id };
    const parsed = JSON.parse(raw) as StoredTheme;
    return { paletteId: parsed.paletteId || DEFAULT_PALETTE.id, overrides: parsed.overrides || {} };
  } catch {
    return { paletteId: DEFAULT_PALETTE.id };
  }
}

export function saveStoredTheme(t: StoredTheme) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  window.dispatchEvent(new CustomEvent("pmo:chart-theme-change"));
}

export function resolvedTokens(t: StoredTheme): Record<ChartTokenKey, string> {
  const p = PALETTES.find((x) => x.id === t.paletteId) ?? DEFAULT_PALETTE;
  return { ...p.tokens, ...(t.overrides ?? {}) };
}

export function applyChartTheme(t?: StoredTheme) {
  if (typeof document === "undefined") return;
  const theme = t ?? loadStoredTheme();
  const tokens = resolvedTokens(theme);
  const root = document.documentElement;
  (Object.keys(tokens) as ChartTokenKey[]).forEach((k) => {
    root.style.setProperty(`--ct-${k}`, tokens[k]);
  });
}

// Helper — reference the CSS variable rather than the raw hex, so any runtime
// theme change re-renders correctly (Recharts, SVG, background styles all
// accept `var(--ct-*)`).
const v = (k: ChartTokenKey) => `var(--ct-${k})`;

export const RAG_COLORS: Record<string, string> = {
  Green: v("rag-green"), Amber: v("rag-amber"), Red: v("rag-red"),
};

export const PRIORITY_COLORS: Record<string, string> = {
  "P1 - Critical": v("priority-critical"), P1: v("priority-critical"), Critical: v("priority-critical"),
  "P2 - High":     v("priority-high"),     P2: v("priority-high"),     High:     v("priority-high"),
  "P3 - Medium":   v("priority-medium"),   P3: v("priority-medium"),   Medium:   v("priority-medium"),
  "P4 - Low":      v("priority-low"),      P4: v("priority-low"),      Low:      v("priority-low"),
};

export const GATE_STATUS_COLORS: Record<string, string> = {
  Approved: v("status-approved"),
  "In Review": v("status-review"),
  Pending: v("status-pending"),
  "On Hold": v("status-hold"),
  Rejected: v("status-rejected"),
};

export const DEP_STATUS_COLORS: Record<string, string> = {
  Healthy: v("status-healthy"), "At Risk": v("status-at-risk"), Blocked: v("status-blocked"),
};

export const RISK_STATUS_COLORS: Record<string, string> = {
  Open: v("status-rejected"), Mitigating: v("status-hold"), Accepted: v("chart-8"), Closed: v("rag-green"),
};

export const RELEASE_STATUS_COLORS: Record<string, string> = {
  Submitted: v("chart-8"), "In Review": v("status-review"), Approved: v("rag-green"), Rejected: v("status-rejected"), Deferred: v("status-hold"),
};

export const CHART_SERIES: string[] = [
  v("chart-1"), v("chart-2"), v("chart-3"), v("chart-4"),
  v("chart-5"), v("chart-6"), v("chart-7"), v("chart-8"),
];

export const NEUTRAL = v("chart-8");
