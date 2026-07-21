/**
 * Organisation colour theme — templates + custom hex codes.
 * Takes precedence over the platform landing palette inside /app.
 * Cached in localStorage so refresh paints without a colour flash.
 */

import {
  DEFAULT_LANDING,
  PALETTE_PRESETS,
  type LandingPalette,
  type LandingThemeMode,
} from "@/lib/landing-config";
import { paletteToAppCssVars } from "@/lib/platform-theme";

export const ORG_THEME_CACHE_KEY = "pmo.orgTheme.v1";
export const ORG_THEME_STYLE_ID = "org-app-theme-vars";
export const ORG_THEME_CHANGE_EVENT = "pmo:org-theme-change";

export type OrgColorTheme = {
  /** When true, this palette overrides the platform theme in the app shell. */
  enabled: boolean;
  theme: LandingThemeMode;
  palette_preset: string;
  palette: LandingPalette;
};

export type OrgThemeCache = {
  orgId: string;
  theme: OrgColorTheme;
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v.trim());
}

export function normalizeHex(v: string, fallback: string): string {
  const t = v.trim();
  if (!isHexColor(t)) return fallback;
  if (t.length === 4) {
    const [, r, g, b] = t;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return t.toLowerCase();
}

export function defaultOrgColorTheme(): OrgColorTheme {
  return {
    enabled: false,
    theme: "light",
    palette_preset: "iprojectx",
    palette: { ...DEFAULT_LANDING.palette },
  };
}

export function normalizeOrgColorTheme(raw: unknown): OrgColorTheme {
  const base = defaultOrgColorTheme();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const theme: LandingThemeMode = o.theme === "dark" ? "dark" : "light";
  const preset =
    typeof o.palette_preset === "string" && o.palette_preset.trim()
      ? o.palette_preset.trim()
      : "custom";
  const src = o.palette && typeof o.palette === "object" ? (o.palette as Record<string, unknown>) : {};
  const palette = { ...base.palette };
  (Object.keys(palette) as (keyof LandingPalette)[]).forEach((k) => {
    if (typeof src[k] === "string") palette[k] = normalizeHex(src[k] as string, palette[k]);
  });
  return {
    enabled: o.enabled === true,
    theme,
    palette_preset: preset,
    palette,
  };
}

/** Build theme from legacy primary/accent columns when full color_theme is unset. */
export function legacyOrgColorTheme(
  primary: string | null | undefined,
  accent: string | null | undefined,
): OrgColorTheme | null {
  const p = primary && isHexColor(primary) ? normalizeHex(primary, "") : "";
  const a = accent && isHexColor(accent) ? normalizeHex(accent, "") : "";
  if (!p && !a) return null;
  const palette = { ...DEFAULT_LANDING.palette };
  if (p) palette.accent = p;
  if (a) {
    // Keep accent column as a secondary brand tint on success/surface if distinct
    palette.navyLight = a;
  }
  return {
    enabled: true,
    theme: "light",
    palette_preset: "custom",
    palette,
  };
}

export function resolveOrgColorTheme(org: {
  id?: string;
  primary_color?: string | null;
  accent_color?: string | null;
  ui_config?: { color_theme?: unknown } | null;
}): OrgColorTheme | null {
  const fromUi = normalizeOrgColorTheme(org.ui_config?.color_theme);
  if (fromUi.enabled) return fromUi;
  return legacyOrgColorTheme(org.primary_color, org.accent_color);
}

export function applyOrgPalettePreset(theme: OrgColorTheme, presetId: string): OrgColorTheme {
  const preset = PALETTE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return { ...theme, palette_preset: "custom", enabled: true };
  return {
    enabled: true,
    theme: preset.theme,
    palette_preset: preset.id,
    palette: { ...preset.palette },
  };
}

export function readCachedOrgTheme(): OrgThemeCache | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(ORG_THEME_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrgThemeCache;
    if (!parsed?.orgId || !parsed.theme) return null;
    return { orgId: parsed.orgId, theme: normalizeOrgColorTheme(parsed.theme) };
  } catch {
    return null;
  }
}

export function writeCachedOrgTheme(orgId: string, theme: OrgColorTheme) {
  if (typeof localStorage === "undefined") return;
  try {
    const payload: OrgThemeCache = { orgId, theme: normalizeOrgColorTheme(theme) };
    localStorage.setItem(ORG_THEME_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function clearCachedOrgTheme() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(ORG_THEME_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function applyOrgThemeToDocument(theme: OrgColorTheme | null | undefined) {
  if (typeof document === "undefined") return;

  if (!theme?.enabled) {
    clearOrgThemeFromDocument();
    return;
  }

  const root = document.documentElement;
  root.classList.toggle("dark", theme.theme === "dark");
  root.dataset.appTheme = theme.theme;
  root.dataset.orgTheme = "1";

  let styleEl = document.getElementById(ORG_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = ORG_THEME_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  const vars = paletteToAppCssVars(theme.palette, theme.theme);
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  // Later in cascade than #platform-app-theme-vars → org wins.
  styleEl.textContent = `:root, .dark {\n${body}\n}`;
}

export function clearOrgThemeFromDocument() {
  if (typeof document === "undefined") return;
  delete document.documentElement.dataset.orgTheme;
  document.getElementById(ORG_THEME_STYLE_ID)?.remove();
}

export function publishOrgTheme(orgId: string, theme: OrgColorTheme) {
  const normalized = normalizeOrgColorTheme(theme);
  writeCachedOrgTheme(orgId, normalized);
  applyOrgThemeToDocument(normalized.enabled ? normalized : null);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(ORG_THEME_CHANGE_EVENT, { detail: { orgId, theme: normalized } }),
    );
  }
}

/**
 * Inline <head> script — applies last-used org palette on /app before React.
 * Platform boot runs first; this style tag wins when present.
 */
export function getOrgThemeBootScript(): string {
  return `(function(){try{var path=location.pathname||"/";if(path.indexOf("/app")!==0)return;var raw=localStorage.getItem(${JSON.stringify(ORG_THEME_CACHE_KEY)});if(!raw)return;var cache=JSON.parse(raw);if(!cache||!cache.theme||cache.theme.enabled!==true||!cache.theme.palette)return;var p=cache.theme.palette;var dark=cache.theme.theme==="dark";var bg=dark?p.navy:"#f5f6f8";var surface=dark?p.navyLight:"#ffffff";var sidebar=dark?p.navy:(p.surface||"#e8edf3");var border=dark?"#475569":"#d1d5db";var secondary=dark?p.navyLight:(p.surface||"#eef2f7");var root=document.documentElement;if(dark)root.classList.add("dark");else root.classList.remove("dark");root.setAttribute("data-app-theme",dark?"dark":"light");root.setAttribute("data-org-theme","1");var css=":root,.dark{--background:"+bg+";--surface:"+surface+";--foreground:"+(p.textBody||"#334155")+";--heading:"+(p.textHeading||"#0f172a")+";--muted-foreground:"+(p.textMuted||"#64748b")+";--border:"+border+";--input:"+border+";--ring:"+(p.accent||"#3b6fa0")+";--card:"+surface+";--card-foreground:"+(p.textBody||"#334155")+";--popover:"+surface+";--popover-foreground:"+(p.textBody||"#334155")+";--primary:"+(p.accent||"#3b6fa0")+";--primary-foreground:"+(p.textOnAccent||"#fff")+";--secondary:"+secondary+";--secondary-foreground:"+(p.textHeading||"#0f172a")+";--muted:"+secondary+";--accent:"+(p.accent||"#3b6fa0")+";--accent-foreground:"+(p.textOnAccent||"#fff")+";--destructive:"+(p.danger||"#dc2626")+";--sidebar:"+sidebar+";--sidebar-foreground:"+(dark?(p.textOnDark||"#fff"):(p.textHeading||"#0f172a"))+";--sidebar-primary:"+(p.accent||"#3b6fa0")+";--sidebar-primary-foreground:"+(p.textOnAccent||"#fff")+";--sidebar-accent:"+(dark?(p.navyLight||"#1e3a5f"):"#dbe3ec")+";--sidebar-border:"+border+";--st-accent:"+(p.accent||"#3b6fa0")+";--st-muted:"+(p.textMuted||"#64748b")+";}";var s=document.createElement("style");s.id=${JSON.stringify(ORG_THEME_STYLE_ID)};s.textContent=css;document.head.appendChild(s);}catch(e){}})();`;
}
